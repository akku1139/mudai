// SPDX-License-Identifier: AGPL-3.0-or-later

import { Renderer } from 'mudai/core/renderer.js';
import { AudioManager } from 'mudai/core/audio.js';
import { TempoManager } from 'mudai/core/tempo.js';
import { resetAllStates } from 'mudai/core/state.js';
import type {
  EngineConfig,
  TimelineItem,
  TimelineAudioItem
} from 'mudai/core/types.js';

/** UI向け統計情報 */
export interface EngineStats {
  w: number;
  h: number;
  targetFps: number;
  actualFps: number;
  time: string;
  duration: number;
  playing: boolean;
}

export interface RenderMessage {
  type: 'config';
  width: number;
  height: number;
  fps: number;
  /** サーバー側での出力ファイル名 (省略時は server 側のデフォルト) */
  output?: string;
}

export class Engine {
  config: EngineConfig;
  timeline: TimelineItem[];
  statsCallback?: (stats: EngineStats) => void;

  renderer: Renderer;
  audio: AudioManager;
  tempo: TempoManager;

  currentTime = 0;
  isPlaying = false;
  isRendering = false;
  isSeeking = false;
  private lastFrameTime = 0;
  private frameCount = 0;
  private lastFpsTime = performance.now();
  actualFps = 0;

  constructor(
    config: EngineConfig,
    timeline: TimelineItem[],
    canvas: HTMLCanvasElement | OffscreenCanvas,
    statsCallback?: (stats: EngineStats) => void
  ) {
    this.config = config;
    this.timeline = timeline;
    this.statsCallback = statsCallback;

    this.renderer = new Renderer(canvas, config);
    this.audio = new AudioManager();
    this.tempo = new TempoManager(config.tempos ?? {});
  }

  /**
   * フォント・オーディオの読み込みとスペクトラムのベイクを行います
   * @param onProgress 読み込み全体の進捗 (0-1)。音声がない場合は即完了
   */
  async init(onProgress?: (p: number) => void): Promise<void> {
    const report = (p: number): void => onProgress?.(Math.min(1, Math.max(0, p)));

    report(0);
    if (typeof document !== 'undefined' && document.fonts) {
      await document.fonts.ready;
    }

    const audioItems = this.audioItems();

    if (audioItems.length > 0) {
      await this.audio.loadAll(audioItems);
      report(0.2);
      await this.audio.bake(
        audioItems,
        this.config.fps,
        this.config.duration,
        (p) => report(0.2 + p * 0.8),
        this.config.audioSampleRate
      );
    } else {
      // 音源がなくてもスペクトラム参照を安全にするため空配列で初期化
      this.audio.bakedSpectrum = [];
    }
    report(1);

    this.seek(0);
  }

  /** 再生 / 一時停止を切り替えます */
  togglePlay(): boolean | undefined {
    if (this.isRendering) return;
    if (this.isPlaying) {
      this.isPlaying = false;
      this.audio.stop();
    } else {
      this.isPlaying = true;
      this.audio.play(this.currentTime, this.audioItems());
      this.lastFrameTime = performance.now();
      this.loop();
    }
    return this.isPlaying;
  }

  /** ドラッグ中 (inputイベント) に呼ぶ、画面更新だけの軽量シーク */
  previewSeek(t: number): void {
    this.currentTime = Math.min(this.config.duration, Math.max(0, t));
    this.renderer.render(this.timeline, this.currentTime, this.tempo, this.audio, this.config.fps);
    this.renderer.present();
    this.updateStats();
  }

  /** 指を離したとき (changeイベント) やジャンプに呼ぶ完全なシーク */
  seek(t: number): void {
    resetAllStates();

    this.currentTime = Math.min(this.config.duration, Math.max(0, t));
    if (this.isPlaying) {
      this.audio.play(this.currentTime, this.audioItems());
      this.lastFrameTime = performance.now();
    }
    this.renderer.render(this.timeline, this.currentTime, this.tempo, this.audio, this.config.fps);
    this.renderer.present();
    this.updateStats();
  }

  /** メインのレンダリングループ (rAF駆動) */
  loop(): void {
    if (!this.isPlaying || this.isRendering) return;
    requestAnimationFrame(() => this.loop());

    const now = performance.now();

    if (this.isSeeking) {
      this.lastFrameTime = now;
      return;
    }

    const dt = (now - this.lastFrameTime) / 1000;
    if (dt < 1 / this.config.fps) return;

    this.currentTime += dt;
    this.lastFrameTime = now;

    this.frameCount++;
    if (now - this.lastFpsTime >= 1000) {
      this.actualFps = this.frameCount;
      this.frameCount = 0;
      this.lastFpsTime = now;
    }

    if (this.currentTime >= this.config.duration) {
      this.togglePlay();
      this.currentTime = this.config.duration;
      this.updateStats();
      return;
    }

    this.renderer.render(this.timeline, this.currentTime, this.tempo, this.audio, this.config.fps);
    this.renderer.present();
    this.updateStats();
  }

  updateStats(): void {
    this.statsCallback?.({
      w: this.config.width,
      h: this.config.height,
      targetFps: this.config.fps,
      actualFps: this.isPlaying ? this.actualFps : 0,
      time: this.currentTime.toFixed(2),
      duration: this.config.duration,
      playing: this.isPlaying
    });
  }

  /** タイムラインから音声アイテムだけを取り出す */
  private audioItems(): TimelineAudioItem[] {
    return this.timeline.filter(
      (el): el is TimelineAudioItem => el.type === 'audio'
    );
  }

  /**
   * サーバー (bin/mudai.js) にフレームを送り、FFmpegで書き出します。
   * @param onProgress 進捗 (0-100)
   * @param output 出力ファイル名 (例: "out.mp4")。省略時はサーバー既定
   * @returns 書き出しが完了したら解決するPromise
   */
  async startRendering(onProgress?: (percent: number) => void, output?: string): Promise<void> {
    const progress = onProgress ?? (() => {});
    this.isRendering = true;
    if (this.isPlaying) this.togglePlay();
    this.seek(0);

    try {
      const ws = new WebSocket(`ws://${location.host}`);
      await new Promise<void>((resolve, reject) => {
        ws.onopen = () => resolve();
        ws.onerror = () => reject(new Error('Could not connect to render server. Is "mudai" running?'));
      });

      const msg: RenderMessage = {
        type: 'config',
        width: this.config.width,
        height: this.config.height,
        fps: this.config.fps,
        output
      };
      ws.send(JSON.stringify(msg));

      // サーバーからの進捗/完了通知をUIへ中継
      ws.onmessage = (ev) => {
        if (typeof ev.data !== 'string') return;
        try {
          const data = JSON.parse(ev.data) as { type: string; message?: string; path?: string };
          if (data.type === 'status' || data.type === 'complete' || data.type === 'error') {
            window.dispatchEvent(
              new CustomEvent('mudai:status', {
                detail: { message: data.message, path: data.path, kind: data.type }
              })
            );
          }
        } catch {
          // JSON以外は無視
        }
      };

      // 音声WAV (音源がなければ null → 空データを送ってマージをスキップさせる)
      const mixedWav = this.audio.getMixedWav();
      ws.send(mixedWav ?? new ArrayBuffer(0));

      const totalFrames = Math.ceil(this.config.duration * this.config.fps);
      let currentFrame = 0;
      const maxBufferLimit = this.config.width * this.config.height * 4 * 10;

      await new Promise<void>((resolve) => {
        const renderNextFrame = (): void => {
          if (ws.readyState !== WebSocket.OPEN) {
            resolve();
            return;
          }

          if (currentFrame >= totalFrames) {
            ws.send(JSON.stringify({ type: 'end' }));
            progress(100);
            resolve();
            return;
          }

          this.renderer.render(this.timeline, currentFrame / this.config.fps, this.tempo, this.audio, this.config.fps);
          if (currentFrame % 30 === 0) {
            this.renderer.present();
            progress(Math.floor((currentFrame / totalFrames) * 100));
          }

          const pixels = this.renderer.getPixels();
          const sendPixels = (): void => {
            if (ws.readyState !== WebSocket.OPEN) {
              resolve();
              return;
            }
            if (ws.bufferedAmount > maxBufferLimit) {
              setTimeout(sendPixels, 10);
            } else {
              ws.send(pixels);
              currentFrame++;
              setTimeout(renderNextFrame, 0);
            }
          };
          sendPixels();
        };
        renderNextFrame();
      });

      ws.close();
    } finally {
      this.isRendering = false;
    }
  }
}

// SPDX-License-Identifier: AGPL-3.0-or-later

import { Renderer } from './renderer.js';
import { AudioManager } from './audio.js';
import { TempoManager } from './tempo.js';
import { resetAllStates } from './state.js';

/**
 * @typedef {Object} EngineConfig
 * @property {number} width
 * @property {number} height
 * @property {number} fps
 * @property {number} duration
 * @property {string} [backgroundColor]
 * @property {Record<string, import('./tempo.js').TempoConfig>} [tempos] // 修正: 配列からRecord型に変更
 */

/**
 * @typedef {Object} EngineStats
 * @property {number} w
 * @property {number} h
 * @property {number} targetFps
 * @property {number} actualFps
 * @property {string} time
 * @property {number} duration
 */

export class Engine {
  /**
   * @param {EngineConfig} config
   * @param {import('./factories.js').TimelineItem[]} timeline // 修正: 具体的なUnion型をインポート
   * @param {HTMLCanvasElement | OffscreenCanvas} canvas
   * @param {(stats: EngineStats) => void} [statsCallback]
   */
  constructor(config, timeline, canvas, statsCallback) {
    /** @type {EngineConfig} */
    this.config = config;
    /** @type {import('./factories.js').TimelineItem[]} */
    this.timeline = timeline;
    /** @type {((stats: EngineStats) => void) | undefined} */
    this.statsCallback = statsCallback;

    /** @type {Renderer} */
    this.renderer = new Renderer(canvas, config);
    /** @type {AudioManager} */
    this.audio = new AudioManager();

    /** @type {TempoManager} */
    this.tempo = new TempoManager(config.tempos || {});

    /** @type {number} */
    this.currentTime = 0;
    /** @type {boolean} */
    this.isPlaying = false;
    /** @type {boolean} */
    this.isRendering = false;
    /** @type {boolean} */
    this.isSeeking = false;
    /** @type {number} */
    this.lastFrameTime = 0;

    // FPS計測用
    /** @type {number} */
    this.frameCount = 0;
    /** @type {number} */
    this.lastFpsTime = performance.now();
    /** @type {number} */
    this.actualFps = 0;
  }

  /**
   * エンジンの初期化処理を行います
   * @returns {Promise<void>}
   */
  async init() {
    await document.fonts.ready;
    await this.audio.loadAll(this.timeline);

    await this.audio.bake(
      this.timeline,
      this.config.fps,
      this.config.duration,
      /** @param {number} p */ (p) => console.log(`Baking Audio: ${Math.round(p * 100)}%`)
    );

    this.seek(0);
  }

  /**
   * 再生・停止を切り替えます
   * @returns {boolean | undefined} 現在の再生状態
   */
  togglePlay() {
    if (this.isRendering) return;
    if (this.isPlaying) {
      this.isPlaying = false;
      this.audio.stop();
    } else {
      this.isPlaying = true;
      this.audio.play(this.currentTime, this.timeline);
      this.lastFrameTime = performance.now();
      this.loop();
    }
    return this.isPlaying;
  }

  /**
   * ドラッグ中(inputイベント)に呼ぶ、画面更新だけの軽量なシーク
   * @param {number} t シーク先の時間(秒)
   */
  previewSeek(t) {
    this.currentTime = Math.max(0, Math.min(t, this.config.duration));
    this.renderer.render(this.timeline, this.currentTime, this.tempo, this.audio, this.config.fps);
    this.renderer.present();
    this.updateStats();
  }

  /**
   * 指を離した時(changeイベント)や、外部からのジャンプに呼ぶ完全なシーク
   * @param {number} t シーク先の時間(秒)
   */
  seek(t) {
    resetAllStates();

    this.currentTime = Math.max(0, Math.min(t, this.config.duration));
    if (this.isPlaying) {
      this.audio.play(this.currentTime, this.timeline);
      this.lastFrameTime = performance.now();
    }
    this.renderer.render(this.timeline, this.currentTime, this.tempo, this.audio, this.config.fps);
    this.renderer.present();
    this.updateStats();
  }

  /**
   * メインのレンダリングループ
   * @returns {void}
   */
  loop() {
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

  /**
   * UI向けの統計情報を更新します
   * @returns {void}
   */
  updateStats() {
    if (this.statsCallback) {
      this.statsCallback({
        w: this.config.width,
        h: this.config.height,
        targetFps: this.config.fps,
        actualFps: this.isPlaying ? this.actualFps : 0,
        time: this.currentTime.toFixed(2),
        duration: this.config.duration
      });
    }
  }

  /**
   * サーバーを介した動画の書き出し処理を開始します
   * @param {(progress: number) => void} onProgress 進捗を通知するコールバック (0-100)
   * @returns {Promise<void>}
   */
  async startRendering(onProgress) {
    this.isRendering = true;
    if (this.isPlaying) this.togglePlay();
    this.seek(0);

    const ws = new WebSocket(`ws://${location.host}`);
    await new Promise(res => ws.onopen = res);

    ws.send(JSON.stringify({ type: 'config', width: this.config.width, height: this.config.height, fps: this.config.fps }));

    // 修正: getMixedWav() が null の場合は空のArrayBufferを送る安全策を取り、ts-expect-error を削除
    const mixedWav = this.audio.getMixedWav();
    ws.send(mixedWav || new ArrayBuffer(0));

    const totalFrames = Math.ceil(this.config.duration * this.config.fps);
    let currentFrame = 0;
    const maxBufferLimit = this.config.width * this.config.height * 4 * 10;

    const renderNextFrame = () => {
      if (currentFrame >= totalFrames) {
        ws.send(JSON.stringify({ type: 'end' }));
        ws.close();
        this.isRendering = false;
        onProgress(100);
        return;
      }

      this.renderer.render(this.timeline, currentFrame / this.config.fps, this.tempo, this.audio, this.config.fps);
      if (currentFrame % 30 === 0) {
        this.renderer.present();
        onProgress(Math.floor((currentFrame / totalFrames) * 100));
      }

      const pixels = this.renderer.getPixels();
      const sendPixels = () => {
        if (ws.bufferedAmount > maxBufferLimit) setTimeout(sendPixels, 10);
        else { ws.send(pixels); currentFrame++; setTimeout(renderNextFrame, 0); }
      };
      sendPixels();
    };
    renderNextFrame();
  }
}

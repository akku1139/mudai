// SPDX-License-Identifier: AGPL-3.0-or-later

import { Renderer } from './renderer.js';
import { AudioManager } from './audio.js';
import { TempoManager } from './tempo.js';
import { resetAllStates } from './state.js';

export class Engine {
  constructor(config, timeline, canvas, statsCallback) {
    this.config = config;
    this.timeline = timeline;
    this.statsCallback = statsCallback;

    this.renderer = new Renderer(canvas, config);
    this.audio = new AudioManager();
    this.tempo = new TempoManager(config.tempos);

    this.currentTime = 0;
    this.isPlaying = false;
    this.isRendering = false;
    this.isSeeking = false; // 追加: UIでのシーク操作中かどうかを判定するフラグ
    this.lastFrameTime = 0;

    // FPS計測用
    this.frameCount = 0;
    this.lastFpsTime = performance.now();
    this.actualFps = 0;
  }

  async init() {
    await document.fonts.ready;
    await this.audio.loadAll(this.timeline);
    await this.audio.bake(this.timeline, this.config.fps, this.config.duration, p => console.log(`Baking Audio: ${Math.round(p*100)}%`));
    this.seek(0);
  }

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

  // 追加: ドラッグ中（inputイベント）に呼ぶ、画面更新だけの軽量なシーク
  previewSeek(t) {
    this.currentTime = Math.max(0, Math.min(t, this.config.duration));
    this.renderer.render(this.timeline, this.currentTime, this.tempo, this.audio, this.config.fps);
    this.renderer.present();
    this.updateStats();
  }

  // 指を離した時（changeイベント）や、外部からのジャンプに呼ぶ完全なシーク
  seek(t) {
    resetAllStates();

    this.currentTime = Math.max(0, Math.min(t, this.config.duration));
    if (this.isPlaying) {
      this.audio.play(this.currentTime, this.timeline);
      this.lastFrameTime = performance.now(); // 修正: 音声再開時の時間ズレを防止
    }
    this.renderer.render(this.timeline, this.currentTime, this.tempo, this.audio, this.config.fps);
    this.renderer.present();
    this.updateStats();
  }

  loop() {
    if (!this.isPlaying || this.isRendering) return;
    requestAnimationFrame(() => this.loop());

    const now = performance.now();

    // 修正: シーク中は時間の進行をストップし、経過時間だけをリセットしておく
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

  updateStats() {
    if (this.statsCallback) {
      this.statsCallback({
        w: this.config.width, h: this.config.height,
        targetFps: this.config.fps, actualFps: this.isPlaying ? this.actualFps : 0,
        time: this.currentTime.toFixed(2), duration: this.config.duration
      });
    }
  }

  async startRendering(onProgress) {
    this.isRendering = true;
    if (this.isPlaying) this.togglePlay();
    this.seek(0);

    const ws = new WebSocket(`ws://${location.host}`);
    await new Promise(res => ws.onopen = res);

    ws.send(JSON.stringify({ type: 'config', width: this.config.width, height: this.config.height, fps: this.config.fps }));

    ws.send(this.audio.getMixedWav());

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

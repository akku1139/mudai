// SPDX-License-Identifier: AGPL-3.0-or-later

import type {
  RenderContext,
  TimelineItem,
  TimelineVisualItem,
  TimelineGlobalEffectItem,
  EngineConfig
} from 'mudai/core/types.js';
import type { TempoManager } from 'mudai/core/tempo.js';
import type { AudioManager } from 'mudai/core/audio.js';

export class Renderer {
  config: EngineConfig;
  visibleCanvas: HTMLCanvasElement | OffscreenCanvas;
  visibleCtx: RenderContext;
  bufferCanvas: HTMLCanvasElement | OffscreenCanvas;
  ctx: RenderContext;

  constructor(canvas: HTMLCanvasElement | OffscreenCanvas, config: EngineConfig) {
    this.config = config;
    this.visibleCanvas = canvas;
    this.visibleCanvas.width = config.width;
    this.visibleCanvas.height = config.height;

    this.visibleCtx = this.visibleCanvas.getContext('2d') as RenderContext;

    if (typeof OffscreenCanvas !== 'undefined') {
      this.bufferCanvas = new OffscreenCanvas(config.width, config.height);
    } else {
      this.bufferCanvas = document.createElement('canvas');
    }
    this.bufferCanvas.width = config.width;
    this.bufferCanvas.height = config.height;

    this.ctx = this.bufferCanvas.getContext('2d', {
      willReadFrequently: true
    }) as RenderContext;
  }

  /**
   * 1フレームをバッファに描画します
   */
  render(
    timeline: TimelineItem[],
    t: number,
    tempoManager: TempoManager,
    audioManager: AudioManager,
    fps: number
  ): void {
    const w = this.bufferCanvas.width;
    const h = this.bufferCanvas.height;
    const ctx = this.ctx;

    // 背景色
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.shadowBlur = 0;
    if (this.config.backgroundColor) {
      ctx.fillStyle = this.config.backgroundColor;
      ctx.fillRect(0, 0, w, h);
    } else {
      ctx.clearRect(0, 0, w, h);
    }

    const spectrum = audioManager.getSpectrum(t, fps);
    const defaultBeat = tempoManager.getBeat('default', t);

    // compute ノードを先に実行 (共有Stateの更新など)
    for (const el of timeline) {
      if (el.type !== 'compute') continue;
      if (t >= el.start && t <= el.end) el.logic(t, defaultBeat, spectrum);
    }

    // visual アイテムを zIndex 順 (安定ソート) で描画
    const visuals: TimelineVisualItem[] = timeline.filter(
      (el): el is TimelineVisualItem =>
        el.type === 'visual' && t >= el.start && t <= el.end
    );
    visuals.sort((a, b) => a.zIndex - b.zIndex);

    for (const el of visuals) {
      const b = tempoManager.getBeat(el.tempoName ?? 'default', t);
      el.render(ctx, t, b, spectrum, w, h);
      // 描画後に漏れた状態設定をリセット
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';
    }

    // グローバルエフェクト
    for (const el of timeline) {
      if (el.type !== 'visual-effect') continue;
      const item = el as TimelineGlobalEffectItem;
      const start = item.start ?? 0;
      const duration = item.duration ?? 1;
      if (t < start || t > start + duration) continue;

      const progress = Math.min(1, Math.max(0, (t - start) / duration));
      if (item.effect === 'fade-to-color') {
        ctx.fillStyle = item.color ?? '#000000';
        ctx.globalAlpha = progress;
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 1;
      } else if (item.effect === 'fade-from-color') {
        ctx.fillStyle = item.color ?? '#000000';
        ctx.globalAlpha = 1 - progress;
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 1;
      }
    }
  }

  /** バッファの内容を表示キャンバスに転送します */
  present(): void {
    this.visibleCtx.clearRect(0, 0, this.visibleCanvas.width, this.visibleCanvas.height);
    this.visibleCtx.drawImage(this.bufferCanvas as CanvasImageSource, 0, 0);
  }

  /** 現在のバッファの生ピクセル (RGBA) を取得します */
  getPixels(): Uint8Array {
    const data = this.ctx.getImageData(0, 0, this.bufferCanvas.width, this.bufferCanvas.height).data;
    return new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
  }
}

// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * @typedef {Object} RendererConfig
 * @property {number} width
 * @property {number} height
 * @property {string} [backgroundColor]
 */

/**
 * @typedef {Object} TempoManager
 * @property {(name: string, t: number) => number} getBeat
 */

export class Renderer {
  /**
   * @param {HTMLCanvasElement | OffscreenCanvas} canvas
   * @param {RendererConfig} config
   */
  constructor(canvas, config) {
    /** @type {RendererConfig} */
    this.config = config;

    /** @type {HTMLCanvasElement | OffscreenCanvas} */
    this.visibleCanvas = canvas;
    this.visibleCanvas.width = config.width;
    this.visibleCanvas.height = config.height;

    // @ts-ignore を外し、明示的なキャストで型エラーを解消
    /** @type {CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D} */
    this.visibleCtx = /** @type {CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D} */ (
      this.visibleCanvas.getContext('2d')
    );

    /** @type {HTMLCanvasElement | OffscreenCanvas} */
    this.bufferCanvas = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(config.width, config.height)
      : document.createElement('canvas');
    this.bufferCanvas.width = config.width;
    this.bufferCanvas.height = config.height;

    /** @type {CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D} */
    this.ctx = /** @type {CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D} */ (
      this.bufferCanvas.getContext('2d', { willReadFrequently: true })
    );
  }

  /**
   * @param {import('./factories.js').TimelineItem[]} timeline
   * @param {number} t
   * @param {TempoManager} tempoManager
   * @param {import('./audio.js').AudioManager} audioManager
   * @param {number} fps
   */
  render(timeline, t, tempoManager, audioManager, fps) {
    const w = this.bufferCanvas.width;
    const h = this.bufferCanvas.height;

    // 背景色の適用
    if (this.config.backgroundColor) {
      this.ctx.fillStyle = this.config.backgroundColor;
      this.ctx.fillRect(0, 0, w, h);
    } else {
      this.ctx.clearRect(0, 0, w, h);
    }

    const spectrum = audioManager.getSpectrum(t, fps);
    const defaultBeat = tempoManager.getBeat('default', t);

    // まずComputeノードを実行し、共有状態などを最新にする
    const computes = /** @type {import('./factories.js').TimelineComputeItem[]} */ (
      timeline.filter(el => el.type === 'compute' && t >= (el.start ?? 0) && t <= (el.end ?? Infinity))
    );
    for (const comp of computes) {
      // computedノードには w, h も渡している実態に合わせるためキャスト
      (comp.logic)(t, defaultBeat, spectrum);
    }

    // Visual要素の抽出とZ-index安定ソート
    const visuals = /** @type {(import('./factories.js').TimelineVisualItem & { _originalIndex: number })[]} */ (
      timeline
        .map((el, index) => ({ ...el, _originalIndex: index }))
        .filter(el => el.type === 'visual' && t >= (el.start ?? 0) && t <= (el.end ?? Infinity))
    );

    visuals.sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0) || a._originalIndex - b._originalIndex);

    for (const el of visuals) {
      const b = tempoManager.getBeat(el.tempoName || 'default', t);
      el.render(this.ctx, t, b, spectrum, w, h);
    }

    // グローバルエフェクトの描画
    const globalEffects = /** @type {import('./factories.js').TimelineGlobalEffectItem[]} */ (
      timeline.filter(el => el.type === 'visual-effect' && t >= (el.start ?? 0) && t <= ((el.start ?? 0) + (el.duration ?? 0)))
    );
    for (const fx of globalEffects) {
      const start = fx.start ?? 0;
      const duration = fx.duration ?? 1; // 0除算回避
      const progress = (t - start) / duration;

      if (fx.effect === 'fade-to-color') {
        this.ctx.fillStyle = fx.color || '#000000';
        // Alpha値が0~1の範囲を逸脱しないようにクリップ
        this.ctx.globalAlpha = Math.max(0, Math.min(1, progress));
        this.ctx.fillRect(0, 0, w, h);
        this.ctx.globalAlpha = 1;
      }
    }
  }

  present() {
    this.visibleCtx.clearRect(0, 0, this.visibleCanvas.width, this.visibleCanvas.height);
    this.visibleCtx.drawImage(this.bufferCanvas, 0, 0);
  }

  /**
   * @returns {Uint8Array}
   */
  getPixels() {
    return new Uint8Array(this.ctx.getImageData(0, 0, this.bufferCanvas.width, this.bufferCanvas.height).data.buffer);
  }
}

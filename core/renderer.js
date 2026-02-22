// @ts-check
export class Renderer {
  constructor(canvas, config) { // configを受け取るように変更
    this.config = config;
    this.visibleCanvas = canvas;
    this.visibleCanvas.width = config.width;
    this.visibleCanvas.height = config.height;
    // @ts-ignore
    this.visibleCtx = this.visibleCanvas.getContext('2d');

    this.bufferCanvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(config.width, config.height) : document.createElement('canvas');
    this.bufferCanvas.width = config.width;
    this.bufferCanvas.height = config.height;
    // @ts-ignore
    this.ctx = this.bufferCanvas.getContext('2d', { willReadFrequently: true });
  }

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
    const b = tempoManager.getBeat('default', t); // デフォルトビート (必要に応じて拡張)

    // まずComputeノードを実行し、共有状態などを最新にする
    const computes = timeline.filter(el => el.type === 'compute' && t >= el.start && t <= (el.end || Infinity));
    for (const comp of computes) {
      comp.logic(t, b, spectrum, w, h);
    }

    // Visual要素の抽出とZ-index安定ソート
    const visuals = timeline
      .map((el, index) => ({ ...el, _originalIndex: index }))
      .filter(el => el.type === 'visual' && t >= el.start && t <= el.end)
      .sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0) || a._originalIndex - b._originalIndex);

    for (const el of visuals) {
      const b = tempoManager.getBeat(el.tempoName || 'default', t);
      el.render(this.ctx, t, b, spectrum, w, h);
    }

    // グローバルエフェクトの描画
    const globalEffects = timeline.filter(el => el.type === 'visual-effect' && t >= el.start && t <= (el.start + el.duration));
    for (const fx of globalEffects) {
      const progress = (t - fx.start) / fx.duration;
      if (fx.effect === 'fade-to-color') {
        this.ctx.fillStyle = fx.color;
        this.ctx.globalAlpha = progress;
        this.ctx.fillRect(0, 0, w, h);
        this.ctx.globalAlpha = 1;
      }
    }
  }

  present() {
    this.visibleCtx.clearRect(0, 0, this.visibleCanvas.width, this.visibleCanvas.height);
    this.visibleCtx.drawImage(this.bufferCanvas, 0, 0);
  }

  getPixels() { return new Uint8Array(this.ctx.getImageData(0, 0, this.bufferCanvas.width, this.bufferCanvas.height).data.buffer); }
}

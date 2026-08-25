// SPDX-License-Identifier: AGPL-3.0-or-later

import { createComponent } from 'mudai/core/component.js';

export interface SpectrumProps {
  /** バーの間隔 (px)。省略時は自動 */
  gap?: number;
  /** スムージング係数 (0-1、大きいほど追従が速い) */
  smoothing?: number;
  /** 使用する周波数ビン数 (省略時は全ビン) */
  bins?: number;
  /** バーを中央基準で左右対称にする */
  mirror?: boolean;
  /** 色をスペクトラム位置でグラデーションさせる終点色 */
  gradientTo?: string;
}

/**
 * 音声スペクトラムを棒グラフ表示するコンポーネント。
 *
 * ```js
 * visual(spectrumObject, {
 *   x: '10%', y: '100%', width: '80%', height: 300,
 *   color: 'rgba(0,255,255,.5)',
 *   mirror: true, gradientTo: '#ff0055'
 * })
 * ```
 */
export const spectrumObject = createComponent<SpectrumProps, { smoothed?: Float32Array }>(
  (ctx, props, state, _t, _b, s, _vw, vh) => {
    if (!s || s.length === 0) return;

    if (!state.smoothed || state.smoothed.length !== s.length) {
      state.smoothed = new Float32Array(s.length);
    }
    const smoothed = state.smoothed;

    const k = props.smoothing ?? 0.2;
    for (let i = 0; i < s.length; i++) {
      const v = s[i] ?? 0;
      smoothed[i] = (smoothed[i] ?? 0) + (v - (smoothed[i] ?? 0)) * k;
    }

    const barWidth = props.width / s.length;
    const gradientTo = props.gradientTo;
    if (gradientTo) {
      const grad = ctx.createLinearGradient(0, 0, props.width, 0);
      grad.addColorStop(0, ctx.fillStyle as string);
      grad.addColorStop(1, gradientTo);
      ctx.fillStyle = grad;
    }

    for (let i = 0; i < s.length; i++) {
      const h = ((smoothed[i] ?? 0) / 255) * vh;
      // (0,0) 基準で上方向に伸びるバーを描く
      ctx.fillRect(i * barWidth, -h, Math.max(1, barWidth - (props.gap ?? 2)), h);
    }
  }
);

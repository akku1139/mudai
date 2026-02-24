// SPDX-License-Identifier: AGPL-3.0-or-later

import { createComponent } from '../core/component.js';

export const spectrumObject = createComponent(
  (
    ctx, props,
    /** @type {{ smoothedData: Float32Array }}*/state, _t, _b, s
  ) => {
    if (!s || s.length === 0) return;
    // 状態がリセットされていれば初期化
    if (!state.smoothedData || state.smoothedData.length !== s.length) {
      state.smoothedData = new Float32Array(s.length);
    }

    const barWidth = props._w / s.length;

    for (const [i, v] of s.entries()) {
      // @ts-expect-error state.smoothedData[i] が undefined
      state.smoothedData[i] += (v - state.smoothedData[i]) * 0.2;
      // @ts-expect-error
      const h = (state.smoothedData[i] / 255) * props._h;
      // (0,0) を基準に描画するため、y方向は上へ伸ばす
      ctx.fillRect(i * barWidth, -h, barWidth - 1, h);
    }
  }
);

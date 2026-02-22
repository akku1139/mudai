// SPDX-License-Identifier: AGPL-3.0-or-later

import { evaluateProp } from './helpers.js';

export function createComponent(renderLogic) {
  return (props) => {
    let state = { lastT: -1, custom: {} }; // 状態保持用

    return (ctx, t, b, s, vw, vh) => {
      // シークやリセットを検知して状態を初期化 (Spectrumバグ修正)
      if (Math.abs(t - state.lastT) > 0.5 || t === 0) state.custom = {};
      state.lastT = t;

      const x = evaluateProp(props.x ?? 0, t, b, vw);
      const y = evaluateProp(props.y ?? 0, t, b, vh);
      const w = evaluateProp(props.width ?? 0, t, b, vw);
      const h = evaluateProp(props.height ?? 0, t, b, vh);
      const rotation = evaluateProp(props.rotation ?? 0, t, b);
      const scale = evaluateProp(props.scale ?? 1, t, b);
      let opacity = evaluateProp(props.opacity ?? 1, t, b);

      // ローカルエフェクトの評価
      if (props.effects) {
        props.effects.forEach(fx => {
          if (t >= fx.start && t <= fx.start + fx.duration) {
            const progress = (t - fx.start) / fx.duration;
            if (fx.type === 'fade-in') opacity *= progress;
            if (fx.type === 'fade-out') opacity *= (1 - progress);
          } else if (fx.type === 'fade-in' && t < fx.start) opacity = 0;
          else if (fx.type === 'fade-out' && t > fx.start + fx.duration) opacity = 0;
        });
      }

      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, opacity));
      ctx.translate(x, y);
      ctx.rotate(rotation * (Math.PI / 180)); // 度数法からラジアンへ
      ctx.scale(scale, scale);

      // 実際の描画ロジックに委譲
      renderLogic(ctx, { ...props, _w: w, _h: h }, state.custom, t, b, s, vw, vh);

      ctx.restore();
    };
  };
}

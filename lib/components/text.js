// SPDX-License-Identifier: AGPL-3.0-or-later

import { createComponent } from '../core/component.js';
import { evaluateProp } from '../core/helpers.js';

export const textObject = createComponent((ctx, props, _state, t, b) => {
  // 動的に変化する可能性のあるプロパティを評価する
  const text = evaluateProp(props.text, t, b);
  const color = evaluateProp(props.color ?? '#ffffff', t, b);
  const size = evaluateProp(props.size ?? 48, t, b);
  const font = evaluateProp(props.font ?? 'sans-serif', t, b);

  ctx.fillStyle = color;
  ctx.font = `${size}px ${font}`;
  ctx.textAlign = props.align || 'center';
  ctx.textBaseline = 'middle';

  // 評価済みのテキストを描画
  ctx.fillText(text, 0, 0);
});

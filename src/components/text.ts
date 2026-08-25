// SPDX-License-Identifier: AGPL-3.0-or-later

import { createComponent } from 'mudai/core/component.js';

export interface TextProps {
  /** 表示するテキスト (\n で改行) */
  text: string;
  /** フォントサイズ (px) */
  size: number;
  /** font-family ("sans-serif" 等) */
  font?: string;
  /** フォントの太さ (CSS font-weight) */
  weight?: string | number;
  /** 横位置 */
  align?: CanvasTextAlign;
  /** 縦位置 (省略時 middle) */
  baseline?: CanvasTextBaseline;
  /** 輪郭色。指定時は塗りに加えてストローク描画 */
  strokeColor?: string;
  /** 輪郭の太さ (px) */
  strokeWidth?: number;
  /** 影色 (省略時なし) */
  shadowColor?: string;
  /** 影のぼかし (px) */
  shadowBlur?: number;
  /** 影のオフセット */
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  /** 行送り (px / 改行時に効く)。省略時は size の1.2倍 */
  lineHeight?: number;
}

/**
 * テキストを描画するコンポーネント。
 *
 * ```js
 * visual(textObject, {
 *   text: 'Hello\nWorld',
 *   x: '50%', y: '50%',
 *   size: 80,
 *   weight: 'bold',
 *   color: '#fff',
 *   shadowColor: 'rgba(0,0,0,.5)', shadowBlur: 20
 * })
 * ```
 */
export const textObject = createComponent<TextProps, object>((ctx, props) => {
  const size = props.size;
  const lines = String(props.text).split('\n');
  const lineHeight = props.lineHeight ?? size * 1.2;

  ctx.font = `${props.weight ? `${props.weight} ` : ''}${size}px ${props.font}`;
  ctx.textAlign = props.align ?? 'center';
  ctx.textBaseline = props.baseline ?? 'middle';

  if (props.shadowColor) {
    ctx.shadowColor = props.shadowColor;
    ctx.shadowBlur = props.shadowBlur ?? 0;
    ctx.shadowOffsetX = props.shadowOffsetX ?? 0;
    ctx.shadowOffsetY = props.shadowOffsetY ?? 0;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const yOff = i * lineHeight;

    if (props.strokeColor && (props.strokeWidth ?? 0) > 0) {
      ctx.strokeStyle = props.strokeColor;
      ctx.lineWidth = props.strokeWidth ?? 2;
      ctx.strokeText(line, 0, yOff);
    }
    ctx.fillText(line, 0, yOff);
  }

  ctx.shadowBlur = 0;
});

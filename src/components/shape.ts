// SPDX-License-Identifier: AGPL-3.0-or-later

import { createComponent } from 'mudai/core/component.js';

export interface ShapeProps {
  /** 描画する図形の種類 */
  shape: 'rect' | 'circle' | 'ellipse' | 'triangle' | 'star' | 'ring' | 'line';
  /** rect / ellipse 等の横幅 (省略時は width prop) */
  w?: number;
  /** 縦幅 */
  h?: number;
  /** circle / ring / star の半径 */
  radius?: number;
  /** ring の内側半径比 (0-1、radius への比率) */
  innerRadiusRatio?: number;
  /** star の頂点数 */
  points?: number;
  /** line の終点 (ローカル座標) */
  x2?: number;
  y2?: number;
  /** 線幅 */
  lineWidth?: number;
  /** 塗らず輪郭のみ描画する */
  strokeOnly?: boolean;
}

/**
 * 図形を描画するコンポーネント。
 *
 * ```js
 * visual(shapeObject, { shape: 'circle', radius: 100, color: '#0ff', x: '50%', y: '50%' })
 * visual(shapeObject, { shape: 'star', points: 5, radius: 150, rotation: (t) => t * 30 })
 * ```
 */
export const shapeObject = createComponent<ShapeProps, object>((ctx, props) => {
  const w = props.w ?? props.width;
  const h = props.h ?? props.height;
  const r = props.radius ?? Math.min(w, h) / 2;

  ctx.lineWidth = props.lineWidth ?? 2;

  const path = new Path2D();

  switch (props.shape) {
    case 'rect': {
      path.rect(-w / 2, -h / 2, w, h);
      break;
    }
    case 'circle': {
      path.arc(0, 0, r, 0, Math.PI * 2);
      break;
    }
    case 'ellipse': {
      path.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
      break;
    }
    case 'triangle': {
      path.moveTo(0, -h / 2);
      path.lineTo(w / 2, h / 2);
      path.lineTo(-w / 2, h / 2);
      path.closePath();
      break;
    }
    case 'star': {
      const n = Math.max(3, props.points ?? 5);
      const outer = r;
      const inner = r * 0.45;
      for (let i = 0; i < n * 2; i++) {
        const rad = i % 2 === 0 ? outer : inner;
        const angle = (Math.PI * i) / n - Math.PI / 2;
        const px = Math.cos(angle) * rad;
        const py = Math.sin(angle) * rad;
        if (i === 0) path.moveTo(px, py);
        else path.lineTo(px, py);
      }
      path.closePath();
      break;
    }
    case 'ring': {
      const inner = r * (props.innerRadiusRatio ?? 0.7);
      path.arc(0, 0, r, 0, Math.PI * 2);
      path.arc(0, 0, inner, 0, Math.PI * 2, true);
      break;
    }
    case 'line': {
      path.moveTo(0, 0);
      path.lineTo(props.x2 ?? w, props.y2 ?? 0);
      break;
    }
  }

  if (!props.strokeOnly) {
    // evenodd: ring の穴を開けるため
    ctx.fill(path, props.shape === 'ring' ? 'evenodd' : 'nonzero');
  } else {
    ctx.strokeStyle = ctx.fillStyle;
    ctx.stroke(path);
  }
});

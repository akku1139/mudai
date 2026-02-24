// SPDX-License-Identifier: AGPL-3.0-or-later

import { evaluateProp } from './helpers.js';

/**
 * 時間やビートに応じて動的に変化する可能性のあるプロパティ値
 * @template T
 * @typedef {T | ((t: number, b: number) => T)} DynamicProp
 */

/**
 * @typedef {object} Effect
 * @property {'fade-in' | 'fade-out'} type
 * @property {number} start
 * @property {number} duration
 */

/**
 * すべてのコンポーネントが共通して持つ基本プロパティ
 * @typedef {object} BaseProps
 * @property {DynamicProp<number | string>} [x]
 * @property {DynamicProp<number | string>} [y]
 * @property {DynamicProp<number | string>} [width]
 * @property {DynamicProp<number | string>} [height]
 * @property {DynamicProp<number>} [rotation]
 * @property {DynamicProp<number>} [scale]
 * @property {DynamicProp<number>} [opacity]
 * @property {Effect[]} [effects]
 */

// TODO: props.name() したら evaluateProp された状態で出てくるようにする
/**
 * @template T
 * @typedef {BaseProps & { _w: number, _h: number } & { [K in keyof T]: DynamicProp<T[K]>}} RenderProps
 */

/**
 * @template TCustomState
 * @typedef {object} RenderState
 * @property {number} lastT
 * @property {TCustomState} custom
 */

/**
 * @template TProps
 * @template TCustomState
 * @typedef {(
 * ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
 * props: RenderProps<TProps>,
 * customState: TCustomState,
 * t: number,
 * b: number,
 * s: Uint8Array | Float32Array | number[],
 * vw: number,
 * vh: number
 * ) => void} RenderLogic
 */

/**
 * カスタムコンポーネントを生成する高階関数
 * @template {object} TProps コンポーネント固有のプロパティの型
 * @template {object} TCustomState コンポーネント固有の状態の型
 * @param {RenderLogic<TProps, TCustomState>} renderLogic 実際の描画を行う関数
 * @returns {(props: BaseProps & TProps) => (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, t: number, b: number, s: Uint8Array, vw: number, vh: number) => void}
 */
export function createComponent(renderLogic) {
  return (/** @type {BaseProps & TProps} */ props) => {
    /** @type {RenderState<TCustomState>} */
    let state = { lastT: -1, custom: /** @type {TCustomState} */ ({}) };

    return (/** @type {CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D} */ ctx, /** @type {number} */ t, /** @type {number} */ b, /** @type {Uint8Array} */ s, /** @type {number} */ vw, /** @type {number} */ vh) => {
      // シークやリセットを検知して状態を初期化
      if (Math.abs(t - state.lastT) > 0.5 || t === 0) state.custom = /** @type {TCustomState} */ ({});
      state.lastT = t;

      // evaluateProp に型引数が伝播するため、w/h は number に推論されます
      const x = evaluateProp(props.x ?? 0, t, b, vw);
      const y = evaluateProp(props.y ?? 0, t, b, vh);
      const w = evaluateProp(props.width ?? 0, t, b, vw);
      const h = evaluateProp(props.height ?? 0, t, b, vh);
      const rotation = evaluateProp(props.rotation ?? 0, t, b);
      const scale = evaluateProp(props.scale ?? 1, t, b);
      let opacity = evaluateProp(props.opacity ?? 1, t, b);

      // ローカルエフェクトの評価
      if (props.effects) {
        props.effects.forEach(/** @param {Effect} fx */ fx => {
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

      // x, y は評価後のため number として安全に扱えます
      ctx.translate(/** @type {number} */ (x), /** @type {number} */ (y));
      ctx.rotate(/** @type {number} */ (rotation) * (Math.PI / 180));
      ctx.scale(/** @type {number} */ (scale), /** @type {number} */ (scale));

      // 実際の描画ロジックに委譲 (_w, _h として計算済みのサイズを渡す)
      renderLogic(ctx, { ...props, _w: /** @type {number} */ (w), _h: /** @type {number} */ (h) }, state.custom, t, b, s, vw, vh);

      ctx.restore();
    };
  };
}

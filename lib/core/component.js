// SPDX-License-Identifier: AGPL-3.0-or-later

import { evaluateProp } from './helpers.js';

/**
 * T のキーの中に B のキーが含まれているかチェックし、
 * 含まれていればエラーメッセージを、
 * 含まれていなければ T そのものを返すユーティリティ。
 * @template T
 * @template B
 * @typedef {[keyof T & keyof B] extends [never] ? T : "Error: T contains keys from B"} StrictNoOverlap
 */

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
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 * @property {number} rotation
 * @property {number} scale
 * @property {number} opacity
 * @property {CanvasFillStrokeStyles['fillStyle']} [color]
 */

// /**
//  * @template {object} [T={}]
//  * @template {BaseProps} [B=BaseProps]
//  * @typedef {B & {[K in keyof T]: K extends keyof B ? never : T[K]} & {effects: Effect[]} } RenderProps
//  */

/**
 * @template {StrictNoOverlap<object, BaseProps>} TProps コンポーネント固有のプロパティの型
 * @template {BaseProps} [B=BaseProps]
 * @typedef {B & TProps & { effects: Effect[] }} RenderProps
 */

/**
 * @template {StrictNoOverlap<object, BaseProps>} TProps コンポーネント固有のプロパティの型
 * @template {BaseProps} [B=BaseProps]
 * @typedef {{[K in keyof B]: DynamicProp<B[K]>} & {[K in keyof TProps]: K extends keyof B ? never : DynamicProp<TProps[K]>} & {effects?: Effect[]} } RenderDynamicProp
 */

/**
 * @template TCustomState
 * @typedef {object} RenderState
 * @property {number} lastT
 * @property {TCustomState} custom
 */

/**
 * @template {object} TProps
 * @template {object} TCustomState
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
 * @template {object} [TProps={}] コンポーネント固有のプロパティの型
 * @template {object} [TCustomState={}] コンポーネント固有の状態の型
 * @param {RenderLogic<TProps, TCustomState>} renderLogic 実際の描画を行う関数
 * @returns {(props: RenderDynamicProp<TProps>) => (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, t: number, b: number, s: Uint8Array, vw: number, vh: number) => void}
 */
export function createComponent(renderLogic) {
  return (/** @type {RenderDynamicProp<TProps>} */ props) => {
    /** @type {RenderState<TCustomState>} */
    let state = { lastT: -1, custom: /** @type {TCustomState} */ ({}) };

    return (/** @type {CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D} */ ctx, /** @type {number} */ t, /** @type {number} */ b, /** @type {Uint8Array} */ s, /** @type {number} */ vw, /** @type {number} */ vh) => {
      // シークやリセットを検知して状態を初期化
      if (Math.abs(t - state.lastT) > 0.5 || t === 0) state.custom = /** @type {TCustomState} */ ({});
      state.lastT = t;

      // evaluateProp に型引数が伝播するため、w/h は number に推論されます
      const x = evaluateProp(props.x ?? 0, t, b, vw);
      const y = evaluateProp(props.y ?? 0, t, b, vh);
      const width = evaluateProp(props.width ?? 0, t, b, vw);
      const height = evaluateProp(props.height ?? 0, t, b, vh);
      // HACK: refSizeを渡さない場合は後置でデフォルト値を設定する必要がある
      const rotation = evaluateProp(props.rotation, t, b) ?? 0;
      const scale = evaluateProp(props.scale, t, b) ?? 1;
      let opacity = evaluateProp(props.opacity, t, b) ?? 1;
      const color = evaluateProp(props.color, t, b) ?? '#ffffff';

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

      const newProps = {
        x, y, width, height, rotation, scale, opacity, color, effects: props.effects ?? [],
        // カスタムpropsはrefSizeを持たないためundefinedはそのまま返される
        ...(Object.fromEntries(
          Object.entries(props)
            .filter(([key]) => !['x', 'y', 'width', 'height', 'rotation', 'scale', 'opacity', 'color', 'effects'].includes(key)) // FIXME: もっといい書き方したい
            .map(([key, value]) => [key, evaluateProp(value, t, b)])
        ))
      };

      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, opacity));

      ctx.translate(x, y);
      ctx.rotate(rotation * (Math.PI / 180));
      ctx.scale(scale, scale);
      ctx.fillStyle = color;

      // @ts-expect-error newPropsの互換性が無い (FIXME: 多分動いてる)
      renderLogic(ctx, newProps, state.custom, t, b, s, vw, vh);

      ctx.restore();
    };
  };
}

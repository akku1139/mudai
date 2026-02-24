// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 評価済みの描画関数
 * @typedef {(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, t: number, b: number, s: Uint8Array, vw: number, vh: number) => void} RenderFunction
 */

/**
 * タイムラインに配置されるアイテムの基本プロパティ
 * @typedef {Object} TimelineBaseProps
 * @property {number} [start]
 * @property {number} [end]
 * @property {number} [zIndex]
 * @property {string} [tempoName]
 */

/**
 * @template {Record<string, unknown>} [TProps=Record<string, never>]
 * @typedef {TimelineBaseProps & TProps & { type: 'visual', render: RenderFunction, start: number, end: number, zIndex: number }} TimelineVisualItem
 */

/**
 * ビジュアルオブジェクトを配置します
 * @template {Record<string, unknown>} TProps
 * @param {(props: TProps) => RenderFunction} renderFn
 * @param {TProps & TimelineBaseProps} props
 * @returns {TimelineVisualItem<TProps>}
 */
export const visual = (renderFn, props) => ({
  type: 'visual',
  render: renderFn(props),
  start: props.start ?? 0,
  end: props.end ?? Infinity,
  zIndex: props.zIndex ?? 0,
  tempoName: props.tempoName,
  ...props
});

/**
 * @typedef {Object} AudioProps
 * @property {string} [id]
 * @property {number} [start]
 * @property {number} [end]
 * @property {number} [volume]
 * @property {import('./audio.js').AudioEffect[]} [effects]
 */

/**
 * オーディオトラックを配置します
 * @param {string} src
 * @param {AudioProps} [props={}]
 * @returns {import('./audio.js').TimelineAudioItem}
 */
export const audio = (src, props = {}) => ({
  type: 'audio',
  id: props.id || src,
  src,
  start: props.start ?? 0,
  end: props.end,
  volume: props.volume ?? 1.0,
  effects: props.effects || [] // 追加: エフェクトを内包させる
});

/**
 * @typedef {Object} GlobalEffectProps
 * @property {number} start
 * @property {number} duration
 * @property {string} [color]
 */

/**
 * @typedef {Object} TimelineGlobalEffectItem
 * @property {'visual-effect'} type
 * @property {string} effect
 * @property {number} start
 * @property {number} duration
 * @property {string} [color]
 */

/**
 * 画面全体へのビジュアルエフェクトを適用します
 * @param {string} effect
 * @param {GlobalEffectProps} props
 * @returns {TimelineGlobalEffectItem}
 */
export const globalEffect = (effect, props) => ({
  type: 'visual-effect',
  effect,
  start: props.start,
  duration: props.duration,
  color: props.color
});

/**
 * @typedef {Object} ComputeProps
 * @property {number} [start]
 * @property {number} [end]
 */

/**
 * @typedef {Object} TimelineComputeItem
 * @property {'compute'} type
 * @property {(t: number, b: number, s: Uint8Array) => void} logic
 * @property {number} start
 * @property {number} end
 */

/**
 * 毎フレーム、描画より先に実行される計算ノードを配置します。
 * 状態(State)の更新などに使用します。
 * @param {(t: number, b: number, s: Uint8Array) => void} logic
 * @param {ComputeProps} [props={}]
 * @returns {TimelineComputeItem}
 */
export const compute = (logic, props = {}) => ({
  type: 'compute',
  logic,
  start: props.start ?? 0,
  end: props.end ?? Infinity
});

/**
 * タイムラインアイテムのUnion型 (renderer等でインポートして利用)
 * @typedef {TimelineVisualItem | import('./audio.js').TimelineAudioItem | TimelineGlobalEffectItem | TimelineComputeItem} TimelineItem
 */

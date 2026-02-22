// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * ビジュアルオブジェクトを配置します
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
 * オーディオトラックを配置します
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
 * 画面全体へのビジュアルエフェクトを適用します
 */
export const globalEffect = (effect, props) => ({
  type: 'visual-effect',
  effect,
  start: props.start,
  duration: props.duration,
  color: props.color
});

/**
 * 毎フレーム、描画より先に実行される計算ノードを配置します。
 * 状態(State)の更新などに使用します。
 */
export const compute = (logic, props = {}) => ({
  type: 'compute',
  logic,
  start: props.start ?? 0,
  end: props.end ?? Infinity
});

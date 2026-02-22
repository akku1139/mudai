// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 代表的なイージング関数群
 * 0.0 ~ 1.0 の進行度(x)を受け取り、変形した進行度を返します
 */
export const Easing = {
  linear: (x) => x,
  easeInQuad: (x) => x * x,
  easeOutQuad: (x) => 1 - (1 - x) * (1 - x),
  easeInOutQuad: (x) => x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2,
  easeOutCubic: (x) => 1 - Math.pow(1 - x, 3),
  easeOutExpo: (x) => x === 1 ? 1 : 1 - Math.pow(2, -10 * x),
  easeOutBack: (x) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
  }
};

/**
 * キーフレーム配列を元に、現在の時間における値を計算します
 * @param {number} t 現在の時間
 * @param {Array<{time: number, value: number, ease?: keyof typeof Easing}>} keyframes
 */
export function animate(t, keyframes) {
  if (keyframes.length === 0) return 0;
  if (keyframes.length === 1 || t <= keyframes[0].time) return keyframes[0].value;

  const last = keyframes[keyframes.length - 1];
  if (t >= last.time) return last.value;

  // 現在の時間(t)が属する区間を探す
  for (let i = 0; i < keyframes.length - 1; i++) {
    const kf1 = keyframes[i];
    const kf2 = keyframes[i + 1];

    if (t >= kf1.time && t < kf2.time) {
      // 区間内の進行度 (0.0 ~ 1.0)
      const progress = (t - kf1.time) / (kf2.time - kf1.time);

      // イージング関数の適用 (指定がなければlinear)
      const easeFn = Easing[kf1.ease || 'linear'] || Easing.linear;
      const easedProgress = easeFn(progress);

      // 値の線形補間
      return kf1.value + (kf2.value - kf1.value) * easedProgress;
    }
  }
  return 0;
}

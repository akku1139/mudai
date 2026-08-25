// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 代表的なイージング関数群
 * 0.0 ~ 1.0 の進行度(x)を受け取り、変形した進行度を返します
 */
export const Easing = {
  linear: (x: number): number => x,
  easeInQuad: (x: number): number => x * x,
  easeOutQuad: (x: number): number => 1 - (1 - x) * (1 - x),
  easeInOutQuad: (x: number): number =>
    x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2,
  easeInCubic: (x: number): number => x * x * x,
  easeOutCubic: (x: number): number => 1 - Math.pow(1 - x, 3),
  easeInOutCubic: (x: number): number =>
    x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2,
  easeOutQuart: (x: number): number => 1 - Math.pow(1 - x, 4),
  easeOutExpo: (x: number): number => (x === 1 ? 1 : 1 - Math.pow(2, -10 * x)),
  easeOutBack: (x: number): number => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
  },
  easeOutElastic: (x: number): number => {
    const c4 = (2 * Math.PI) / 3;
    if (x === 0 || x === 1) return x;
    return Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * c4) + 1;
  },
  easeOutBounce: (x: number): number => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (x < 1 / d1) return n1 * x * x;
    if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
    if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
    return n1 * (x -= 2.625 / d1) * x + 0.984375;
  }
} as const;

export type EasingName = keyof typeof Easing;

export interface Keyframe<T = number> {
  time: number;
  value: T;
  /** 区間の始点キーに指定されたイージングで補間する (省略時は linear) */
  ease?: EasingName;
}

const isKeyframeArray = <T,>(v: unknown): v is Keyframe<T>[] =>
  Array.isArray(v) && v.length > 0 && typeof v[0] === 'object' && v[0] !== null && 'time' in (v[0] as object);

/**
 * キーフレーム配列を元に、現在の時間における値を計算します
 *
 * ```js
 * animate(t, [
 *   { time: 0, value: -100, ease: 'easeOutBack' },
 *   { time: 2, value: 540 }
 * ]);
 * ```
 */
export function animateNumber(t: number, keyframes: Keyframe[]): number {
  const first = keyframes[0];
  if (first === undefined) return 0;
  if (keyframes.length === 1 || t <= first.time) return first.value;

  const last = keyframes[keyframes.length - 1];
  if (last === undefined) return first.value;
  if (t >= last.time) return last.value;

  for (let i = 0; i < keyframes.length - 1; i++) {
    const kf1 = keyframes[i];
    const kf2 = keyframes[i + 1];
    if (kf1 === undefined || kf2 === undefined) continue;

    if (t >= kf1.time && t < kf2.time) {
      const progress = (t - kf1.time) / (kf2.time - kf1.time);
      const easeFn = Easing[kf1.ease ?? 'linear'];
      return kf1.value + (kf2.value - kf1.value) * easeFn(progress);
    }
  }
  return 0;
}

/**
 * キーフレーム配列、または生の値・関数をまとめて評価するユーティリティ。
 * コンポーネントの動的props実装で使用される。
 */
export function animateValue<T>(
  value: T | Keyframe<T>[],
  t: number,
  fallback: T
): T {
  if (isKeyframeArray<T>(value)) {
    const r = animateNumber(t, value as unknown as Keyframe[]);
    return (r as unknown as T) ?? fallback;
  }
  return value ?? fallback;
}

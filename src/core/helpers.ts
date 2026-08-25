// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 指定されたシード値に基づく疑似乱数生成関数を作成します
 * @param seed シード値
 * @returns 0以上1未満の乱数を返す関数
 */
export function createRandom(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 座標やサイズの計算式を評価します
 *
 * 使用できる構文:
 * - `"50%"`      : refSize の 50%
 * - `"calc(50% + 100px)"` : パーセントとピクセルの混在
 * - `"100px"` / `100`     : ピクセル指定
 *
 * @param val 評価する値または計算式
 * @param refSize キャンバスの幅または高さ (% 計算の基準)
 */
export function parseCoord(val: string | number, refSize: number): number {
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
  if (val === '') return 0;

  const exp = val
    .replace(/calc\(/g, '(')
    .replace(/([0-9]*\.?[0-9]+)%/g, (_m, p: string) => `(${parseFloat(p) / 100}*${refSize})`)
    .replace(/px/g, '');
  try {
    const result = Function(`"use strict";return (${exp})`)();
    return typeof result === 'number' && Number.isFinite(result) ? result : 0;
  } catch {
    console.warn(`parseCoord: failed to evaluate "${val}"`);
    return 0;
  }
}

/**
 * プロパティの値を評価します。
 * 値が関数だった場合は (t, b) を渡して呼び出し、その結果を返します。
 */
export function evaluateProp<T>(param: T | ((t: number, b: number) => T), t: number, b: number): T;
/**
 * 座標・サイズ用。refSize を渡すと文字列式 ("50%" など) も数値に解決します。
 */
export function evaluateProp(
  param: string | number | ((t: number, b: number) => string | number),
  t: number,
  b: number,
  refSize: number
): number;
export function evaluateProp(
  param: unknown,
  t: number,
  b: number,
  refSize?: number
): unknown {
  const val =
    typeof param === 'function' ? (param as (t: number, b: number) => unknown)(t, b) : param;

  if (typeof refSize === 'number') {
    if (typeof val === 'number') return val;
    return parseCoord(String(val ?? 0), refSize);
  }
  return val;
}

/** CSS色文字列を [r, g, b, a] (0-255 / 0-1) に分解します */
export function parseColor(input: string): [number, number, number, number] {
  const s = input.trim();

  // #rgb / #rgba / #rrggbb / #rrggbbaa
  if (s.startsWith('#')) {
    const hex = s.slice(1);
    const expand = (h: string) => (h.length === 1 ? h + h : h);
    if (hex.length === 3 || hex.length === 4) {
      const r = parseInt(expand(hex[0] ?? '0'), 16);
      const g = parseInt(expand(hex[1] ?? '0'), 16);
      const b = parseInt(expand(hex[2] ?? '0'), 16);
      const a = hex.length === 4 ? parseInt(expand(hex[3] ?? 'f'), 16) / 255 : 1;
      return [r, g, b, a];
    }
    if (hex.length === 6 || hex.length === 8) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
      return [r, g, b, a];
    }
    console.warn(`parseColor: unsupported hex "${input}"`);
    return [255, 255, 255, 1];
  }

  // rgb() / rgba()
  const m = /^rgba?\(([^)]+)\)$/i.exec(s.replace(/\s+/g, ''));
  if (m?.[1]) {
    const parts = m[1].split('/').flatMap((seg) => seg.split(','));
    const nums = parts.map(parseFloat);
    const [r = 0, g = 0, b = 0, a = 1] = nums;
    return [
      Math.min(255, Math.max(0, r)),
      Math.min(255, Math.max(0, g)),
      Math.min(255, Math.max(0, b)),
      m[1].includes('%')
        ? Math.min(1, Math.max(0, a / 100))
        : Math.min(1, Math.max(0, a))
    ];
  }

  console.warn(`parseColor: unsupported color "${input}"`);
  return [255, 255, 255, 1];
}

/** [r,g,b,a] をCSS色文字列に戻します */
export function rgbaString(c: readonly [number, number, number, number]): string {
  return `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${c[3]})`;
}

/**
 * 線形補間ヘルパー
 */
export function lerp(a: number, b: number, progress: number): number {
  return a + (b - a) * progress;
}

/** 値を min〜max の範囲に丸め込みます */
export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 指定されたシード値に基づく疑似乱数生成関数を作成します
 * @param {number} seed シード値
 * @returns {() => number} 0以上1未満の乱数を返す関数
 */
export function createRandom(seed) {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}

/**
 * 座標やサイズの計算式を評価します
 * @param {string|number} val 評価する値または計算式
 * @param {number} refSize キャンバスの幅または高さ
 * @returns {number} 計算結果の座標値
 */
export function parseCoord(val, refSize) {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const exp = val
      .replace(/calc\(/g, '(')
      .replace(/([0-9.-]+)%/g, (/** @type {string} */ _, /** @type {string} */ p) => `(${(parseFloat(p)/100)}*${refSize})`)
      .replace(/px/g, '');
    try {
      return new Function(`return ${exp}`)();
    } catch (e) {
      console.warn('parseCoord Error:', exp);
      return 0;
    }
  }
  return 0;
}

/**
 * プロパティの値を評価します。
 * @template {unknown} T
 * * @overload
 * @param {T | ((t: number, b: number) => T)} param 評価するプロパティ値または関数
 * @param {number} t 現在の時間(秒)
 * @param {number} b 現在のビート
 * @param {number} refSize キャンバスの基準サイズ (渡された場合は数値として評価します)
 * @returns {number}
 * * @overload
 * @param {T | ((t: number, b: number) => T)} param 評価するプロパティ値または関数
 * @param {number} t 現在の時間(秒)
 * @param {number} b 現在のビート
 * @param {never} [refSize]
 * @returns {T}
 * * // base
 * @param {any} param
 * @param {number} t
 * @param {number} b
 * @param {number} [refSize]
 * @returns {any}
 */
export function evaluateProp(param, t, b, refSize = undefined) {
  const val = typeof param === 'function'
    ? /** @type {(t: number, b: number) => T} */ (param)(t, b)
    : param;

  // refSize が数値として存在する場合のみ parseCoord を適用
  if (typeof refSize === 'number') {
    return parseCoord(val, refSize);
  }

  return val;
}

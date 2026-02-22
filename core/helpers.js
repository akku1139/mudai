// @ts-check
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
 * @param {string|number} val 
 * @param {number} refSize キャンバスの幅または高さ
 */
export function parseCoord(val, refSize) {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    // 古いcalc記法の除去と、% / px の置換を一度に行う
    const exp = val
      .replace(/calc\(/g, '(')
      .replace(/([0-9.-]+)%/g, (_, p) => `(${(parseFloat(p)/100)}*${refSize})`)
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

export function evaluateProp(param, t, b, refSize = undefined) {
  // 関数であれば現在時間(t)とビート(b)を渡して評価
  const val = typeof param === 'function' ? param(t, b) : param;
  
  // refSize（画面幅や高さ）が渡されている場合のみ、座標計算式としてパースする
  if (refSize !== undefined && typeof val === 'string') {
    return parseCoord(val, refSize);
  }
  return val;
}

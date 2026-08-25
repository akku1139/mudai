// SPDX-License-Identifier: AGPL-3.0-or-later

const globalStates = new Set<State<unknown>>();

/**
 * compute ノードや render 関数間で共有できる状態コンテナ。
 * シーク・巻き戻し時にエンジンが自動で reset() を呼ぶ。
 */
export interface State<T> {
  current: T;
  reset: () => void;
}

/**
 * 共有状態を作成します。初期値は関数も渡せます(その場合 reset 時に関数を再評価)。
 *
 * ```js
 * const pos = createState({ x: 100, y: 200 });
 * compute(() => { pos.current.x += 1; });
 * ```
 */
export function createState<T>(initialValue: T | (() => T)): State<T> {
  const getInitial = (): T =>
    typeof initialValue === 'function'
      ? (initialValue as () => T)()
      : (structuredClone(initialValue) as T);

  let current = getInitial();

  const state: State<T> = {
    get current() {
      return current;
    },
    set current(val: T) {
      current = val;
    },
    reset() {
      current = getInitial();
    }
  };

  globalStates.add(state as State<unknown>);
  return state;
}

/** すべての共有状態を初期値に戻す(シーク時などにエンジンが使用) */
export function resetAllStates(): void {
  globalStates.forEach((s) => s.reset());
}

/** 主にテスト用: 登録されている状態をすべて破棄する */
export function clearAllStates(): void {
  globalStates.clear();
}

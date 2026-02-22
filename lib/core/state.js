// SPDX-License-Identifier: AGPL-3.0-or-later

const globalStates = new Set();

/**
 * @template T
 * @param {T | (() => T)} initialValue
 */
export function createState(initialValue) {
  const getInitial = () => typeof initialValue === 'function' ? /** @type {Function} */(initialValue)() : JSON.parse(JSON.stringify(initialValue));
  let current = getInitial();

  const state = {
    get current() { return current; },
    set current(val) { current = val; },
    reset() { current = getInitial(); }
  };

  globalStates.add(state);
  return state;
}

export function resetAllStates() {
  globalStates.forEach(s => s.reset());
}

// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 他のテンポ設定を基準にする場合のオフセット指定
 * @typedef {Object} TempoOffsetRef
 * @property {string} ref 基準となるテンポの名前
 * @property {number} [time] 追加の時間オフセット(秒)
 * @property {number} [beats] 追加のビートオフセット(基準テンポのBPMベース)
 */

/**
 * テンポの初期設定プロパティ
 * @typedef {Object} TempoConfig
 * @property {number} bpm
 * @property {number | TempoOffsetRef} [offset]
 */

/**
 * 内部で計算・保持される解決済みのテンポ
 * @typedef {Object} ResolvedTempo
 * @property {number} bpm
 * @property {number} offset 最終的な絶対オフセット時間(秒)
 */

export class TempoManager {
  /**
   * @param {Record<string, TempoConfig>} tempoConfigs
   */
  constructor(tempoConfigs) {
    /** @type {Map<string, ResolvedTempo>} */
    this.tempos = new Map();

    /**
     * 依存関係を解決しながらオフセット(秒)を計算
     * @param {TempoConfig} config
     * @returns {number}
     */
    const resolveOffset = (config) => {
      if (typeof config.offset === 'number') return config.offset;

      // null チェックを追加して strict モード対応を完全にする
      if (typeof config.offset === 'object' && config.offset !== null) {
        const refName = config.offset.ref;
        const refTempo = this.tempos.get(refName);

        if (!refTempo) {
          throw new Error(`Reference tempo '${refName}' not found yet. Check declaration order.`);
        }

        let timeOffset = refTempo.offset;
        if (config.offset.time) timeOffset += config.offset.time;
        if (config.offset.beats) timeOffset += config.offset.beats * (60 / refTempo.bpm);
        return timeOffset;
      }
      return 0; // offset未指定などのデフォルト
    };

    for (const [name, config] of Object.entries(tempoConfigs)) {
      this.tempos.set(name, { bpm: config.bpm, offset: resolveOffset(config) });
    }
  }

  /**
   * 指定したテンポにおける現在のビート数を取得
   * @param {string} name
   * @param {number} t 現在の時間(秒)
   * @returns {number}
   */
  getBeat(name, t) {
    const tempo = this.tempos.get(name);
    // 該当するテンポがない場合は0を返す。マイナスビートにならないようMath.maxで制限
    return tempo ? Math.max(0, (t - tempo.offset) * (tempo.bpm / 60)) : 0;
  }
}

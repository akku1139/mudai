// SPDX-License-Identifier: AGPL-3.0-or-later

export class TempoManager {
  constructor(tempoConfigs) {
    this.tempos = new Map();
    // 依存関係を解決しながら登録
    const resolveOffset = (config) => {
      if (typeof config.offset === 'number') return config.offset;
      if (typeof config.offset === 'object') {
        const refTempo = this.tempos.get(config.offset.ref);
        if (!refTempo) throw new Error(`Reference tempo ${config.offset.ref} not found yet. Check declaration order.`);
        let timeOffset = refTempo.offset;
        if (config.offset.time) timeOffset += config.offset.time;
        if (config.offset.beats) timeOffset += config.offset.beats * (60 / refTempo.bpm);
        return timeOffset;
      }
      return 0;
    };

    for (const [name, config] of Object.entries(tempoConfigs)) {
      this.tempos.set(name, { bpm: config.bpm, offset: resolveOffset(config) });
    }
  }

  getBeat(name, t) {
    const tempo = this.tempos.get(name);
    return tempo ? Math.max(0, (t - tempo.offset) * (tempo.bpm / 60)) : 0;
  }
}

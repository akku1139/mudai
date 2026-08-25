// SPDX-License-Identifier: AGPL-3.0-or-later

/** 他のテンポを基準にしたオフセット指定 */
export interface TempoOffsetRef {
  /** 基準となるテンポの名前 (宣言順に依存) */
  ref: string;
  /** 追加の時間オフセット(秒) */
  time?: number;
  /** 追加のビートオフセット(基準テンポのBPMベース) */
  beats?: number;
}

export interface TempoConfig {
  bpm: number;
  offset?: number | TempoOffsetRef;
}

interface ResolvedTempo {
  bpm: number;
  offset: number;
}

/**
 * BPM (ビート) 管理クラス。
 * 複数のテンポを名前付きで登録し、他のテンポへの参照オフセットも解決できる。
 */
export class TempoManager {
  private tempos: Map<string, ResolvedTempo>;

  constructor(tempoConfigs: Record<string, TempoConfig> = {}) {
    this.tempos = new Map();

    const resolveOffset = (config: TempoConfig): number => {
      if (typeof config.offset === 'number') return config.offset;

      if (typeof config.offset === 'object' && config.offset !== null) {
        const refName = config.offset.ref;
        const refTempo = this.tempos.get(refName);

        if (!refTempo) {
          throw new Error(
            `Reference tempo '${refName}' not found yet. Check declaration order.`
          );
        }

        let timeOffset = refTempo.offset;
        if (config.offset.time) timeOffset += config.offset.time;
        if (config.offset.beats) {
          timeOffset += config.offset.beats * (60 / refTempo.bpm);
        }
        return timeOffset;
      }
      return 0;
    };

    for (const [name, config] of Object.entries(tempoConfigs)) {
      this.tempos.set(name, { bpm: config.bpm, offset: resolveOffset(config) });
    }
  }

  /**
   * 指定したテンポにおける現在のビート数を取得
   * @param name テンポ名 (未登録なら 'default' にフォールバック)
   * @param t 現在の時間(秒)
   */
  getBeat(name: string, t: number): number {
    const tempo = this.tempos.get(name) ?? this.tempos.get('default');
    if (!tempo) return 0;
    return Math.max(0, (t - tempo.offset) * (tempo.bpm / 60));
  }
}

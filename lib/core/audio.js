// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * @typedef {Object} AudioEffect
 * @property {'fade-in' | 'fade-out'} type
 * @property {number} [start]
 * @property {number} [duration]
 */

/**
 * @typedef {Object} TimelineAudioItem
 * @property {'audio'} type
 * @property {string} src
 * @property {number} start
 * @property {number} [end]
 * @property {number} [volume]
 * @property {AudioEffect[]} [effects]
 */

/**
 * @typedef {Object} SpectrumData
 * @property {number} time
 * @property {Uint8Array} data
 */

export class AudioManager {
  constructor() {
    /** @type {AudioContext} */
    this.audioCtx = new AudioContext();
    /** @type {Map<string, AudioBuffer>} */
    this.buffers = new Map();
    /** @type {Uint8Array[]} */
    this.bakedSpectrum = [];
    /** @type {ArrayBuffer | null} */
    this.mixedWav = null; // エンコード用WAVデータ
    /** @type {AudioBufferSourceNode[]} */
    this.sources = [];
  }

  /**
   * @param {import('./factories.js').TimelineItem[]} timeline
   * @returns {Promise<void>}
   */
  async loadAll(timeline) {
    /** @type {TimelineAudioItem[]} */
    const audioItems = timeline.filter(el => el.type === 'audio');

    for (const item of audioItems) {
      if (!this.buffers.has(item.src)) {
        const res = await fetch(item.src);
        const arrayBuffer = await res.arrayBuffer();
        const audioBuffer = await this.audioCtx.decodeAudioData(arrayBuffer);
        this.buffers.set(item.src, audioBuffer);
      }
    }
  }

  /**
   * @param {import('./factories.js').TimelineItem[]} timeline
   * @param {number} fps
   * @param {number} duration
   * @param {(progress: number) => void} onProgress
   * @returns {Promise<void>}
   */
  async bake(timeline, fps, duration, onProgress) {
    const sampleRate = 44100;
    const offlineCtx = new OfflineAudioContext(2, Math.ceil(duration * sampleRate), sampleRate);

    // スペクトラム用マスターアナライザー
    const analyser = offlineCtx.createAnalyser();
    analyser.fftSize = 256;
    analyser.connect(offlineCtx.destination);

    // 1. オーディオソースの配置とエフェクトの適用
    /** @type {TimelineAudioItem[]} */
    const audioItems = timeline.filter(el => el.type === 'audio');

    audioItems.forEach(item => {
      const source = offlineCtx.createBufferSource();
      // Mapから取得できない場合(未ロード等)を考慮して null をフォールバック
      source.buffer = this.buffers.get(item.src) || null;

      const gainNode = offlineCtx.createGain();
      const baseVolume = item.volume ?? 1;

      // 基本音量を設定
      gainNode.gain.setValueAtTime(baseVolume, 0);

      // 内包されたエフェクトの適用 (Fade)
      if (item.effects && item.effects.length > 0) {
        item.effects.forEach(fx => {
          // トラックの開始時間を基準にした絶対時間を計算
          const fxAbsStart = item.start + (fx.start || 0);
          const fxDuration = fx.duration || 0;

          if (fx.type === 'fade-in') {
            gainNode.gain.setValueAtTime(0, fxAbsStart);
            gainNode.gain.linearRampToValueAtTime(baseVolume, fxAbsStart + fxDuration);
          } else if (fx.type === 'fade-out') {
            gainNode.gain.setValueAtTime(baseVolume, fxAbsStart);
            gainNode.gain.linearRampToValueAtTime(0, fxAbsStart + fxDuration);
          }
        });
      }

      source.connect(gainNode);
      gainNode.connect(analyser); // マスターへ

      source.start(item.start);
      if (item.end) source.stop(item.end);
    });

    // 3. スペクトラム抽出用プロセッサ (Firefox対応)
    const processor = offlineCtx.createScriptProcessor(512, 1, 1);
    /** @type {SpectrumData[]} */
    const rawData = [];

    processor.onaudioprocess = (/** @type {AudioProcessingEvent} */ e) => {
      const data = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(data);
      rawData.push({ time: e.playbackTime, data });
    };
    analyser.connect(processor);
    processor.connect(offlineCtx.destination);

    onProgress(0);
    const renderedBuffer = await offlineCtx.startRendering();

    // 4. WAVエンコード (サーバー送信・FFmpegマージ用)
    this.mixedWav = this.audioBufferToWav(renderedBuffer);

    // 5. スペクトラム配列の再マッピング
    const totalFrames = Math.ceil(duration * fps);
    this.bakedSpectrum = new Array(totalFrames);
    let dataIdx = 0;

    for (let i = 0; i < totalFrames; i++) {
      const t = i * (1 / fps);

      let current = rawData[dataIdx];
      let next = rawData[dataIdx + 1];

      // noUncheckedIndexedAccess対策と境界チェック
      while (current !== undefined && next !== undefined && Math.abs(next.time - t) < Math.abs(current.time - t)) {
        dataIdx++;
        current = rawData[dataIdx];
        next = rawData[dataIdx + 1];
      }
      this.bakedSpectrum[i] = current ? current.data : new Uint8Array(analyser.frequencyBinCount);
    }
    onProgress(1);
  }

  /**
   * @param {number} t
   * @param {number} fps
   * @returns {Uint8Array}
   */
  getSpectrum(t, fps) {
    const frame = Math.floor(t * fps);
    const defaultSpectrum = this.bakedSpectrum[0];

    // 範囲外アクセスや配列が空の場合の安全策
    return this.bakedSpectrum[frame] || defaultSpectrum || new Uint8Array(0);
  }

  /**
   * プレビュー再生
   * @param {number} t
   * @param {import('./factories.js').TimelineItem[]} timeline
   */
  play(t, timeline) {
    this.stop();
    if (this.audioCtx.state === 'suspended') this.audioCtx.resume();

    /** @type {TimelineAudioItem[]} */
    const audioItems = timeline.filter(el => el.type === 'audio' && (el.end ? t < el.end : true));

    audioItems.forEach(item => {
      if (t >= (item.end || Infinity)) return;
      const source = this.audioCtx.createBufferSource();
      source.buffer = this.buffers.get(item.src) || null;

      const gainNode = this.audioCtx.createGain();
      const baseVolume = item.volume ?? 1;

      // 初期音量をセット
      gainNode.gain.value = baseVolume;

      // プレビュー用のエフェクト反映
      if (item.effects && item.effects.length > 0) {
        item.effects.forEach(fx => {
          const fxAbsStart = item.start + (fx.start || 0);
          const fxDuration = fx.duration || 0;

          // シーク位置(t)がエフェクト範囲より前か、被っている場合のみ処理
          if (t < fxAbsStart + fxDuration) {
            const ctxTimeStart = this.audioCtx.currentTime + Math.max(0, fxAbsStart - t);
            const ctxTimeEnd = this.audioCtx.currentTime + Math.max(0, (fxAbsStart + fxDuration) - t);

            if (fx.type === 'fade-in') {
              // シーク位置がフェードインの最中の場合、初期値を補間する(簡易処理)
              const startVol = t > fxAbsStart ? baseVolume * ((t - fxAbsStart) / fxDuration) : 0;
              gainNode.gain.setValueAtTime(startVol, Math.max(this.audioCtx.currentTime, ctxTimeStart));
              gainNode.gain.linearRampToValueAtTime(baseVolume, ctxTimeEnd);
            } else if (fx.type === 'fade-out') {
              const startVol = t > fxAbsStart ? baseVolume * (1 - ((t - fxAbsStart) / fxDuration)) : baseVolume;
              gainNode.gain.setValueAtTime(startVol, Math.max(this.audioCtx.currentTime, ctxTimeStart));
              gainNode.gain.linearRampToValueAtTime(0, ctxTimeEnd);
            }
          }
        });
      }

      source.connect(gainNode);
      gainNode.connect(this.audioCtx.destination);

      const offset = Math.max(0, t - item.start);
      const delay = Math.max(0, item.start - t);
      source.start(this.audioCtx.currentTime + delay, offset);
      this.sources.push(source);
    });
  }

  stop() {
    this.sources.forEach(s => s.stop());
    this.sources = [];
  }

  /** @returns {ArrayBuffer | null} */
  getMixedWav() { return this.mixedWav; }

  /**
   * @param {AudioBuffer} buffer
   * @returns {ArrayBuffer}
   */
  audioBufferToWav(buffer) {
    const numOfChan = buffer.numberOfChannels;
    const length = buffer.length * numOfChan * 2 + 44;
    const arrayBuffer = new ArrayBuffer(length);
    const view = new DataView(arrayBuffer);

    /** @type {Float32Array[]} */
    const channels = [];
    const sampleRate = buffer.sampleRate;
    let offset = 0, pos = 0;

    /** @param {number} data */
    const setUint16 = (data) => { view.setUint16(pos, data, true); pos += 2; };
    /** @param {number} data */
    const setUint32 = (data) => { view.setUint32(pos, data, true); pos += 4; };

    setUint32(0x46464952); // "RIFF"
    setUint32(length - 8); // file length - 8
    setUint32(0x45564157); // "WAVE"
    setUint32(0x20746d66); // "fmt " chunk
    setUint32(16); // length = 16
    setUint16(1); // PCM (uncompressed)
    setUint16(numOfChan);
    setUint32(sampleRate);
    setUint32(sampleRate * 2 * numOfChan); // avg. bytes/sec
    setUint16(numOfChan * 2); // block-align
    setUint16(16); // 16-bit
    setUint32(0x61746164); // "data" - chunk
    setUint32(length - pos - 4); // chunk length

    for (let i = 0; i < buffer.numberOfChannels; i++) {
      channels.push(buffer.getChannelData(i));
    }

    while (pos < length) {
      for (let i = 0; i < numOfChan; i++) {
        // noUncheckedIndexedAccess対策: チャンネルデータが存在するか確認
        const channelData = channels[i];
        if (!channelData) continue;

        let sample = Math.max(-1, Math.min(1, channelData[offset] || 0));
        sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
        view.setInt16(pos, sample, true); pos += 2;
      }
      offset++;
    }
    return arrayBuffer;
  }
}

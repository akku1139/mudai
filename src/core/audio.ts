// SPDX-License-Identifier: AGPL-3.0-or-later

import type { SpectrumData, TimelineAudioItem } from 'mudai/core/types.js';

interface BakedSpectrumFrame {
  time: number;
  data: Uint8Array;
}

/**
 * タイムライン上のオーディオを管理するクラス。
 * - loadAll(): 全音源のデコード
 * - bake():    OfflineAudioContext で全体をミックスし、WAV とスペクトラムを事前計算
 * - play():    プレビュー再生
 */
export class AudioManager {
  audioCtx: AudioContext;
  buffers: Map<string, AudioBuffer>;
  bakedSpectrum: Uint8Array[];
  private mixedWav: ArrayBuffer | null;
  private sources: AudioBufferSourceNode[];

  constructor() {
    this.audioCtx = new AudioContext();
    this.buffers = new Map();
    this.bakedSpectrum = [];
    this.mixedWav = null;
    this.sources = [];
  }

  /** タイムライン内の全音源をデコードしてキャッシュする */
  async loadAll(timeline: TimelineAudioItem[]): Promise<void> {
    for (const item of timeline) {
      if (this.buffers.has(item.src)) continue;

      try {
        const res = await fetch(item.src);
        if (!res.ok) {
          console.warn(`[mudai] audio "${item.src}" not found (${res.status})`);
          continue;
        }
        const arrayBuffer = await res.arrayBuffer();
        const audioBuffer = await this.audioCtx.decodeAudioData(arrayBuffer);
        this.buffers.set(item.src, audioBuffer);
      } catch (e) {
        console.warn(`[mudai] failed to decode audio "${item.src}":`, e);
      }
    }
  }

  /**
   * 全オーディオをOfflineAudioContextでミックスし、
   * WAVデータとフレームごとのスペクトラムを事前計算します。
   */
  async bake(
    timeline: TimelineAudioItem[],
    fps: number,
    duration: number,
    onProgress: (p: number) => void,
    sampleRate = 44100
  ): Promise<void> {
    const audioItems = timeline.filter((el) => el.type === 'audio');

    // 音源が1つもない場合は何もしない (レンダー時のマージもスキップされる)
    if (audioItems.length === 0) {
      this.mixedWav = null;
      this.bakedSpectrum = [];
      return;
    }

    const offlineCtx = new OfflineAudioContext(
      2,
      Math.ceil(duration * sampleRate),
      sampleRate
    );

    // スペクトラム用マスターアナライザー
    const analyser = offlineCtx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.6;
    analyser.connect(offlineCtx.destination);

    for (const item of audioItems) {
      const source = offlineCtx.createBufferSource();
      const buffer = this.buffers.get(item.src);
      if (!buffer) {
        console.warn(`[mudai] skipping unbaked audio "${item.src}"`);
        continue;
      }
      source.buffer = buffer;

      // 再生速度
      const speed = item.speed ?? 1;
      if (speed !== 1) source.playbackRate.value = speed;

      const gainNode = offlineCtx.createGain();
      const baseVolume = item.volume ?? 1;
      gainNode.gain.setValueAtTime(baseVolume, 0);

      // エフェクト (Fade)
      for (const fx of item.effects ?? []) {
        const fxAbsStart = item.start + (fx.start ?? 0);
        const fxDuration = fx.duration ?? 0;
        if (fxDuration <= 0) continue;

        if (fx.type === 'fade-in') {
          gainNode.gain.setValueAtTime(0, fxAbsStart);
          gainNode.gain.linearRampToValueAtTime(baseVolume, fxAbsStart + fxDuration);
        } else if (fx.type === 'fade-out') {
          gainNode.gain.setValueAtTime(baseVolume, Math.max(0, fxAbsStart));
          gainNode.gain.linearRampToValueAtTime(0, fxAbsStart + fxDuration);
        }
      }

      source.connect(gainNode);
      gainNode.connect(analyser);

      // offset: ソース先頭からのトリム位置
      const offsetSec = item.offset ?? 0;
      const when = Math.max(0, item.start);
      source.start(when, offsetSec >= 0 ? offsetSec : 0);
      if (item.end !== undefined) source.stop(item.end);
    }

    // スペクトラム抽出用プロセッサ (Firefox対応 / 非推奨APIだがOfflineでは最速経路)
    const processor = offlineCtx.createScriptProcessor(512, 1, 1);
    const rawData: BakedSpectrumFrame[] = [];

    processor.onaudioprocess = (e: AudioProcessingEvent) => {
      const data = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(data);
      rawData.push({ time: e.playbackTime, data });
    };
    analyser.connect(processor);
    processor.connect(offlineCtx.destination);

    onProgress(0);
    const renderedBuffer = await offlineCtx.startRendering();

    // WAVエンコード (サーバー送信・FFmpegマージ用)
    this.mixedWav = this.audioBufferToWav(renderedBuffer);

    // スペクトラム配列のフレームへの再マッピング
    const totalFrames = Math.ceil(duration * fps);
    this.bakedSpectrum = new Array(totalFrames);
    let dataIdx = 0;

    for (let i = 0; i < totalFrames; i++) {
      const t = i * (1 / fps);

      let current = rawData[dataIdx];
      let next = rawData[dataIdx + 1];

      while (
        current !== undefined &&
        next !== undefined &&
        Math.abs(next.time - t) < Math.abs(current.time - t)
      ) {
        dataIdx++;
        current = rawData[dataIdx];
        next = rawData[dataIdx + 1];
      }
      this.bakedSpectrum[i] = current ? current.data : new Uint8Array(analyser.frequencyBinCount);
    }
    onProgress(1);
  }

  /** 現在時刻におけるスペクトラムを取得 */
  getSpectrum(t: number, fps: number): SpectrumData {
    const frame = Math.floor(t * fps);
    return (
      this.bakedSpectrum[frame] ??
      this.bakedSpectrum[0] ??
      new Uint8Array(0)
    );
  }

  /**
   * プレビュー再生 (時刻 t から)
   */
  play(t: number, timeline: TimelineAudioItem[]): void {
    this.stop();
    if (this.audioCtx.state === 'suspended') void this.audioCtx.resume();

    for (const item of timeline) {
      if (item.type !== 'audio') continue;
      if (t >= (item.end ?? Infinity)) continue;

      const buffer = this.buffers.get(item.src);
      if (!buffer) continue;

      const source = this.audioCtx.createBufferSource();
      source.buffer = buffer;

      const speed = item.speed ?? 1;
      if (speed !== 1) source.playbackRate.value = speed;

      const gainNode = this.audioCtx.createGain();
      const baseVolume = item.volume ?? 1;
      gainNode.gain.value = baseVolume;

      // プレビュー用エフェクト反映
      for (const fx of item.effects ?? []) {
        const fxAbsStart = item.start + (fx.start ?? 0);
        const fxDuration = fx.duration ?? 0;
        if (fxDuration <= 0) continue;

        // シーク位置がエフェクト範囲にかかっている場合のみ処理
        if (t < fxAbsStart + fxDuration) {
          const ctxTimeStart = this.audioCtx.currentTime + Math.max(0, fxAbsStart - t);
          const ctxTimeEnd = this.audioCtx.currentTime + Math.max(0, fxAbsStart + fxDuration - t);

          if (fx.type === 'fade-in') {
            const startVol = t > fxAbsStart ? baseVolume * ((t - fxAbsStart) / fxDuration) : 0;
            gainNode.gain.setValueAtTime(startVol, Math.max(this.audioCtx.currentTime, ctxTimeStart));
            gainNode.gain.linearRampToValueAtTime(baseVolume, ctxTimeEnd);
          } else if (fx.type === 'fade-out') {
            const startVol = t > fxAbsStart ? baseVolume * (1 - (t - fxAbsStart) / fxDuration) : baseVolume;
            gainNode.gain.setValueAtTime(startVol, Math.max(this.audioCtx.currentTime, ctxTimeStart));
            gainNode.gain.linearRampToValueAtTime(0, ctxTimeEnd);
          }
        }
      }

      source.connect(gainNode);
      gainNode.connect(this.audioCtx.destination);

      // offset を加味した再生開始位置
      const offsetSec = (Math.max(0, t - item.start)) * speed + (item.offset ?? 0);
      const delay = Math.max(0, item.start - t);
      source.start(this.audioCtx.currentTime + delay, offsetSec);
      this.sources.push(source);
    }
  }

  stop(): void {
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        // 既に停止している場合は無視
      }
    }
    this.sources = [];
  }

  /** ミックス済みWAV (bake後のみ)。音源がない場合はnull */
  getMixedWav(): ArrayBuffer | null {
    return this.mixedWav;
  }

  /** AudioBuffer を16bit PCM WAVにエンコードする */
  audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
    const numOfChan = buffer.numberOfChannels;
    const length = buffer.length * numOfChan * 2 + 44;
    const arrayBuffer = new ArrayBuffer(length);
    const view = new DataView(arrayBuffer);

    const channels: Float32Array[] = [];
    const sampleRate = buffer.sampleRate;
    let pos = 0;
    let offset = 0;

    const setUint16 = (data: number): void => {
      view.setUint16(pos, data, true);
      pos += 2;
    };
    const setUint32 = (data: number): void => {
      view.setUint32(pos, data, true);
      pos += 4;
    };

    setUint32(0x46464952); // "RIFF"
    setUint32(length - 8); // file length - 8
    setUint32(0x45564157); // "WAVE"
    setUint32(0x20746d66); // "fmt " chunk
    setUint32(16); // fmt chunk length
    setUint16(1); // PCM
    setUint16(numOfChan);
    setUint32(sampleRate);
    setUint32(sampleRate * 2 * numOfChan); // avg bytes/sec
    setUint16(numOfChan * 2); // block align
    setUint16(16); // bits per sample
    setUint32(0x61746164); // "data" chunk
    setUint32(length - pos - 4); // chunk length

    for (let i = 0; i < numOfChan; i++) {
      channels.push(buffer.getChannelData(i));
    }

    while (pos < length) {
      for (let i = 0; i < numOfChan; i++) {
        const channelData = channels[i];
        if (!channelData) continue;

        let sample = Math.max(-1, Math.min(1, channelData[offset] || 0));
        sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
        view.setInt16(pos, sample, true);
        pos += 2;
      }
      offset++;
    }
    return arrayBuffer;
  }
}

// SPDX-License-Identifier: AGPL-3.0-or-later

import type { Keyframe } from 'mudai/core/animation.js';

/** 描画に使用するコンテキスト (メインスレッド / OffscreenCanvas の両対応) */
export type RenderContext =
  | CanvasRenderingContext2D
  | OffscreenCanvasRenderingContext2D;

/** 解析済みスペクトラムデータ (周波数ビンごとの 0-255 値) */
export type SpectrumData = Uint8Array;

/**
 * 時間・ビートで動的に変化するプロパティ値。
 * - 生の値
 * - キーフレーム配列 (数値のみ)
 * - (t, b) を受け取る関数
 */
export type Dynamic<T> = T | ((t: number, b: number) => T);

/** 数値プロパティはキーフレームも使える */
export type DynamicNumber = Dynamic<number> | Keyframe[];

/** 座標・サイズ。"50%" や "calc(50% + 100px)" の文字列式も使える */
export type CoordInput = string | number;

export type DynamicCoord = Dynamic<CoordInput> | Keyframe[];

export type ColorInput = string;
export type DynamicColor = Dynamic<ColorInput>;

/**
 * すべてのビジュアルコンポーネントが持つ基本プロパティ。
 * 宣言時はすべて省略可能。実行時にデフォルトが解決される。
 */
export interface BaseProps {
  /** X座標 */
  x?: DynamicCoord;
  /** Y座標 */
  y?: DynamicCoord;
  width?: DynamicCoord;
  height?: DynamicCoord;
  /** 回転 (度数法) */
  rotation?: DynamicNumber;
  /** 拡大率 */
  scale?: DynamicNumber;
  /** 不透明度 (0-1) */
  opacity?: DynamicNumber;
  /** 塗りつぶし色 (fillStyle) */
  color?: DynamicColor;
  /** 合成モード (ctx.globalBlendMode 相当。'add' は 'lighter' にマップ) */
  blend?: Dynamic<'add' | GlobalCompositeOperation>;
  /** false で非表示 (動的関数を渡せば条件表示も可能) */
  visible?: Dynamic<boolean>;
}

/** ローカルエフェクト (コンポーネント単位) */

interface EffectBase {
  /** エフェクト開始時刻(秒)。省略時はアイテムの start */
  start?: number;
  /** エフェクト継続時間(秒) */
  duration?: number;
}

export interface FadeInEffect extends EffectBase {
  type: 'fade-in';
}
export interface FadeOutEffect extends EffectBase {
  type: 'fade-out';
}

export interface SlideEffect extends EffectBase {
  type: 'slide-in' | 'slide-out';
  /** 移動方向 */
  direction: 'up' | 'down' | 'left' | 'right';
  /** 移動距離(px)。省略時は100 */
  distance?: number;
  ease?: string;
}

export interface PopEffect extends EffectBase {
  type: 'pop-in' | 'pop-out';
  ease?: string;
}

export interface FlashEffect extends EffectBase {
  type: 'flash';
  /** フラッシュ色 (省略時は白) */
  color?: string;
  /** ストロボ回数 (省略時は3) */
  pulses?: number;
}

export interface ShakeEffect extends EffectBase {
  type: 'shake';
  /** 最大変位(px)。省略時は10 */
  intensity?: number;
  /** 揺れの速さ(Hz相当)。省略時は20 */
  frequency?: number;
}

export interface PulseEffect extends EffectBase {
  type: 'pulse';
  /** 拡大率の振幅。省略時は0.15 */
  amount?: number;
  /** 脈動のBPM。省略時はプロジェクトの default テンポに追従 */
  bpm?: number;
}

export type Effect =
  | FadeInEffect
  | FadeOutEffect
  | SlideEffect
  | PopEffect
  | FlashEffect
  | ShakeEffect
  | PulseEffect;

/** オーディオエフェクト */
export interface AudioFadeEffect {
  type: 'fade-in' | 'fade-out';
  /** アイテム開始からの相対秒 */
  start?: number;
  duration?: number;
}

export type AudioEffect = AudioFadeEffect;

/** タイムライン共通の配置プロパティ */
export interface TimelineBaseProps {
  /** 開始時刻(秒)。省略時 0 */
  start?: number;
  /** 終了時刻(秒)。省略時 Infinity */
  end?: number;
  /** 描画順 (小さいほど奥) */
  zIndex?: number;
  /** 使用するテンポ名 (config.tempos のキー) */
  tempoName?: string;
}

/** ビジュアルアイテムの宣言時プロパティ (基本props + 固有props + 配置) */
export type VisualItemProps<TProps> = Partial<BaseProps> & TProps & TimelineBaseProps & { effects?: Effect[] };

/**
 * 評価済みの描画関数。
 * s: スペクトラム、vw/vh: キャンバスサイズ
 */
export type RenderFunction = (
  ctx: RenderContext,
  t: number,
  b: number,
  s: SpectrumData,
  vw: number,
  vh: number
) => void;

export interface TimelineVisualItem {
  type: 'visual';
  render: RenderFunction;
  start: number;
  end: number;
  zIndex: number;
  tempoName?: string;
}

export interface TimelineAudioItem {
  type: 'audio';
  id: string;
  src: string;
  start: number;
  end?: number;
  /** 音量 (0-1、1以上も可) */
  volume?: number;
  /** ソースファイルの先頭から何秒飛ばして再生するか */
  offset?: number;
  /** 再生速度 (1 = 等速) */
  speed?: number;
  effects?: AudioEffect[];
}

export type GlobalEffectKind = 'fade-to-color' | 'fade-from-color';

export interface TimelineGlobalEffectItem {
  type: 'visual-effect';
  effect: GlobalEffectKind;
  start: number;
  duration: number;
  color?: string;
}

export interface TimelineComputeItem {
  type: 'compute';
  logic: (t: number, b: number, s: SpectrumData) => void;
  start: number;
  end: number;
}

export type TimelineItem =
  | TimelineVisualItem
  | TimelineAudioItem
  | TimelineGlobalEffectItem
  | TimelineComputeItem;

/** プロジェクト設定 */
export interface EngineConfig {
  width: number;
  height: number;
  fps: number;
  duration: number;
  backgroundColor?: string;
  tempos?: Record<string, TempoConfigLike>;
  /** 音声ベイク時のサンプルレート (省略時 44100) */
  audioSampleRate?: number;
}

/** tempo.js の TempoConfig への構造的参照 (循環import回避) */
export interface TempoConfigLike {
  bpm: number;
  offset?: number | { ref: string; time?: number; beats?: number };
}

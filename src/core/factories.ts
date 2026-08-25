// SPDX-License-Identifier: AGPL-3.0-or-later

import type {
  TimelineVisualItem,
  TimelineAudioItem,
  TimelineComputeItem,
  TimelineGlobalEffectItem
} from 'mudai/core/types.js';
import type { ComponentFactory, VisualInputProps } from 'mudai/core/component.js';

/**
 * ビジュアルオブジェクトをタイムラインに配置します。
 *
 * ```js
 * visual(textObject, { start: 0, end: 3, text: 'Hello', x: '50%', y: '50%' })
 * ```
 */
export function visual<TProps>(
  component: ComponentFactory<TProps>,
  props: VisualInputProps<TProps>
): TimelineVisualItem {
  const { start, end, zIndex, tempoName, ...rest } = props;
  return {
    type: 'visual',
    render: component(rest as VisualInputProps<TProps>),
    start: start ?? 0,
    end: end ?? Infinity,
    zIndex: zIndex ?? 0,
    tempoName
  };
}

/** audio() のプロパティ */
export interface AudioPlacement {
  id?: string;
  start?: number;
  end?: number;
  volume?: number;
  /** ソースの先頭から何秒飛ばして再生するか */
  offset?: number;
  /** 再生速度 (1 = 等速) */
  speed?: number;
  effects?: TimelineAudioItem['effects'];
}

/**
 * オーディオトラックを配置します。
 *
 * ```js
 * audio('/bgm.wav', { start: 0, volume: 0.8, effects: [{ type: 'fade-out', start: 12, duration: 3 }] })
 * ```
 */
export function audio(src: string, props: AudioPlacement = {}): TimelineAudioItem {
  return {
    type: 'audio',
    id: props.id ?? src,
    src,
    start: props.start ?? 0,
    end: props.end,
    volume: props.volume ?? 1.0,
    offset: props.offset,
    speed: props.speed,
    effects: props.effects ?? []
  };
}

/**
 * 画面全体へのグローバルエフェクトを適用します。
 *
 * ```js
 * globalEffect('fade-to-color', { color: '#000', start: 13, duration: 2 })
 * ```
 */
export function globalEffect(
  effect: TimelineGlobalEffectItem['effect'],
  props: { start: number; duration: number; color?: string }
): TimelineGlobalEffectItem {
  return {
    type: 'visual-effect',
    effect,
    start: props.start,
    duration: props.duration,
    color: props.color
  };
}

/**
 * 毎フレーム、描画より先に実行される計算ノードを配置します。
 * 共有Stateの更新などに使用します。
 *
 * ```js
 * compute((t, b, spectrum) => { sharedPos.current = t * 100; })
 * ```
 */
export function compute(
  logic: TimelineComputeItem['logic'],
  props: { start?: number; end?: number } = {}
): TimelineComputeItem {
  return {
    type: 'compute',
    logic,
    start: props.start ?? 0,
    end: props.end ?? Infinity
  };
}

// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * mudai - React-like declarative video engine
 *
 * パッケージのルートエクスポート。ライブラリとして使う場合:
 *
 * ```js
 * import { Engine, visual, textObject } from 'mudai';
 * ```
 */

export { Engine } from 'mudai/core/engine.js';
export type { EngineStats, RenderMessage } from 'mudai/core/engine.js';
export { Renderer } from 'mudai/core/renderer.js';
export { AudioManager } from 'mudai/core/audio.js';
export { TempoManager } from 'mudai/core/tempo.js';
export type { TempoConfig, TempoOffsetRef } from 'mudai/core/tempo.js';
export { createState, resetAllStates, clearAllStates } from 'mudai/core/state.js';
export type { State } from 'mudai/core/state.js';
export { Easing, animateNumber, animateValue } from 'mudai/core/animation.js';
export type { Keyframe, EasingName } from 'mudai/core/animation.js';
export {
  parseCoord,
  evaluateProp,
  parseColor,
  rgbaString,
  lerp,
  clamp,
  createRandom
} from 'mudai/core/helpers.js';
export { createComponent } from 'mudai/core/component.js';
export type {
  EvaluatedProps,
  RenderLogic,
  ComponentFactory
} from 'mudai/core/component.js';

export { visual, audio, globalEffect, compute } from 'mudai/core/factories.js';
export type { AudioPlacement } from 'mudai/core/factories.js';

export { textObject } from 'mudai/components/text.js';
export type { TextProps } from 'mudai/components/text.js';
export { shapeObject } from 'mudai/components/shape.js';
export type { ShapeProps } from 'mudai/components/shape.js';
export {
  imageObject,
  loadImage,
  preloadAllImages,
  imageRegistry
} from 'mudai/components/image.js';
export type { ImageProps } from 'mudai/components/image.js';
export { spectrumObject } from 'mudai/components/spectrum.js';
export type { SpectrumProps } from 'mudai/components/spectrum.js';

export type {
  EngineConfig,
  TimelineItem,
  TimelineVisualItem,
  TimelineAudioItem,
  TimelineGlobalEffectItem,
  TimelineComputeItem,
  Effect,
  AudioEffect,
  BaseProps,
  Dynamic,
  DynamicNumber,
  DynamicCoord,
  SpectrumData,
  RenderContext,
  VisualItemProps
} from 'mudai/core/types.js';

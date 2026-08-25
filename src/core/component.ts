// SPDX-License-Identifier: AGPL-3.0-or-later

import { evaluateProp } from 'mudai/core/helpers.js';
import { Easing, animateNumber } from 'mudai/core/animation.js';
import type { EasingName } from 'mudai/core/animation.js';
import type {
  Effect,
  RenderContext,
  SpectrumData,
  Dynamic,
  DynamicCoord,
  DynamicNumber,
  DynamicColor
} from 'mudai/core/types.js';
import type { TimelineBaseProps } from 'mudai/core/types.js';

/** 評価済み (動的解決・デフォルト適用済み) のプロップ一式 */
export interface ResolvedBaseProps {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  scale: number;
  opacity: number;
  color: string;
  blend: GlobalCompositeOperation;
  visible: boolean;
  effects: Effect[];
}

export type EvaluatedProps<TProps> = TProps & ResolvedBaseProps;

/** コンポーネント固有プロパティを「動的指定可能」な形に持ち上げる */
export type Dynamicify<T> =
  [T] extends [number]
    ? DynamicNumber
    : [T] extends [string]
      ? DynamicColor
      : [T] extends [boolean]
        ? Dynamic<boolean>
        : Dynamic<T>;

/**
 * コンポーネント本体が受け取る描画ロジック。
 * props はすべて評価済み (関数・キーフレーム・%式が解決済み) の値。
 */
export type RenderLogic<TProps, TCustomState> = (
  ctx: RenderContext,
  props: EvaluatedProps<TProps>,
  state: TCustomState,
  t: number,
  b: number,
  s: SpectrumData,
  vw: number,
  vh: number
) => void;

/** コンポーネントファクトリのシグネチャ (factories.visual に渡すもの) */
export type ComponentFactory<TProps> = (
  props: VisualInputProps<TProps>
) => RenderFunctionLike;

/** ユーザーがコンポーネントに渡せるプロップ全体 */
type DynamicBaseInput = {
  x?: DynamicCoord;
  y?: DynamicCoord;
  width?: DynamicCoord;
  height?: DynamicCoord;
  rotation?: DynamicNumber;
  scale?: DynamicNumber;
  opacity?: DynamicNumber;
  color?: DynamicColor;
  blend?: Dynamic<'add' | GlobalCompositeOperation>;
  visible?: Dynamic<boolean>;
};

export type VisualInputProps<TProps> = DynamicBaseInput & {
  [K in keyof TProps]?: Dynamicify<TProps[K]>;
} & TimelineBaseProps & {
    effects?: Effect[];
  };

type RenderFunctionLike = (
  ctx: RenderContext,
  t: number,
  b: number,
  s: SpectrumData,
  vw: number,
  vh: number
) => void;

interface FrameModifications {
  dx: number;
  dy: number;
  extraScale: number;
  extraRotation: number;
  flashStrength: number;
  flashColor: string;
}

const DEFAULT_EFFECT_DURATION = 0.5;

/**
 * ローカルエフェクト群を評価し、座標・スケール等への修飾を算出します
 */
function applyEffects(
  effects: Effect[],
  t: number,
  b: number,
  mod: FrameModifications
): number {
  let opacityMul = 1;

  for (const fx of effects) {
    const fs = fx.start ?? 0;
    const dur = fx.duration ?? DEFAULT_EFFECT_DURATION;
    const raw = (t - fs) / dur;
    const p = Math.min(1, Math.max(0, raw));

    switch (fx.type) {
      case 'fade-in': {
        if (t < fs) opacityMul = 0;
        else if (raw <= 1) opacityMul *= p;
        break;
      }
      case 'fade-out': {
        if (t > fs + dur) opacityMul = 0;
        else if (raw >= 0) opacityMul *= 1 - p;
        break;
      }
      case 'slide-in': {
        const dist = fx.distance ?? 100;
        const easeFn = Easing[(fx.ease ?? 'easeOutCubic') as EasingName] ?? Easing.easeOutCubic;
        const d = (1 - easeFn(p)) * dist;
        if (t < fs) {
          mod.dx += fx.direction === 'left' ? -dist : fx.direction === 'right' ? dist : 0;
          mod.dy += fx.direction === 'up' ? -dist : fx.direction === 'down' ? dist : 0;
          opacityMul = 0;
        } else if (raw <= 1) {
          mod.dx += fx.direction === 'left' ? -d : fx.direction === 'right' ? d : 0;
          mod.dy += fx.direction === 'up' ? -d : fx.direction === 'down' ? d : 0;
        }
        break;
      }
      case 'slide-out': {
        const dist = fx.distance ?? 100;
        const easeFn = Easing[(fx.ease ?? 'easeInCubic') as EasingName] ?? Easing.easeInCubic;
        if (raw >= 0) {
          const d = easeFn(Math.min(1, raw)) * dist;
          mod.dx += fx.direction === 'left' ? -d : fx.direction === 'right' ? d : 0;
          mod.dy += fx.direction === 'up' ? -d : fx.direction === 'down' ? d : 0;
          if (t > fs + dur) opacityMul = 0;
        } else if (fx.direction === 'left' || fx.direction === 'right' || fx.direction === 'up' || fx.direction === 'down') {
          // 開始前は元位置
        }
        break;
      }
      case 'pop-in': {
        const easeFn = Easing[(fx.ease ?? 'easeOutBack') as EasingName] ?? Easing.easeOutBack;
        if (t < fs) opacityMul = 0;
        else if (raw <= 1) mod.extraScale *= Math.max(0, easeFn(p));
        break;
      }
      case 'pop-out': {
        const easeFn = Easing[(fx.ease ?? 'easeInCubic') as EasingName] ?? Easing.easeInCubic;
        if (t > fs + dur) opacityMul = 0;
        else if (raw >= 0) mod.extraScale *= Math.max(0, 1 - easeFn(p));
        break;
      }
      case 'flash': {
        if (raw >= 0 && raw <= 1) {
          const pulses = fx.pulses ?? 3;
          const strobe = Math.abs(Math.sin(raw * Math.PI * pulses));
          const strength = strobe * (1 - raw);
          if (strength > mod.flashStrength) {
            mod.flashStrength = strength;
            mod.flashColor = fx.color ?? '#ffffff';
          }
        }
        break;
      }
      case 'shake': {
        const intensity = fx.intensity ?? 10;
        const freq = fx.frequency ?? 20;
        if (raw >= 0 && raw <= 1) {
          // 擬似ランダム (sin混ぜ合わせ) で滑らかでない揺れを作る
          const n =
            Math.sin(t * freq * 12.9898) + Math.sin(t * freq * 78.233) * 0.7;
          mod.dx += n * intensity * 0.5;
          mod.dy += Math.sin(t * freq * 43.123) * intensity * 0.5;
        }
        break;
      }
      case 'pulse': {
        const amount = fx.amount ?? 0.15;
        const phase = fx.bpm !== undefined ? t * (fx.bpm / 60) : b;
        mod.extraScale *= 1 + amount * (0.5 + 0.5 * Math.sin(phase * Math.PI * 2)) * 2 * 0.5 * 2;
        break;
      }
    }
  }

  return opacityMul;
}

/** 動的プロパティ (値 / 関数 / キーフレーム) を評価する */
function resolveValue(
  value: unknown,
  t: number,
  b: number,
  refSize?: number
): unknown {
  if (Array.isArray(value)) {
    return animateNumber(t, value as never);
  }
  return evaluateProp(value as never, t, b, refSize as never);
}

// キーフレーム配列判定
function isKeyframes(value: unknown): value is { time: number; value: number }[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    typeof value[0] === 'object' &&
    value[0] !== null &&
    'time' in value[0]
  );
}

const BASE_KEYS = new Set([
  'x', 'y', 'width', 'height', 'rotation', 'scale',
  'opacity', 'color', 'blend', 'visible', 'effects'
]);

/**
 * カスタムビジュアルコンポーネントを生成する高階関数。
 *
 * ```ts
 * export const box = createComponent<{w: number}, {}>((ctx, props) => {
 *   ctx.fillRect(0, 0, props.w, props.height);
 * });
 *
 * // 使う側
 * visual(box, { x: '50%', y: '50%', w: 200, rotation: (t) => t * 30 })
 * ```
 */
export function createComponent<
  TProps extends object = Record<string, never>,
  TCustomState extends object = Record<string, never>
>(renderLogic: RenderLogic<TProps, TCustomState>): ComponentFactory<TProps> {
  return ((inputProps: VisualInputProps<TProps>) => {
    const props = inputProps as VisualInputProps<TProps> & Record<string, unknown>;
    void props;
    /** @type {TCustomState} */
    let customState: TCustomState = {} as TCustomState;
    let lastT = -1;

    const effects = (props.effects ?? []) as Effect[];

    return ((
      ctx: RenderContext,
      t: number,
      b: number,
      s: SpectrumData,
      vw: number,
      vh: number
    ) => {
      // シークやリセットを検知してカスタム状態を初期化
      if (Math.abs(t - lastT) > 0.5 || t === 0) customState = {} as TCustomState;
      lastT = t;

      // --- 基本プロパティの評価 ---
      const x = resolveValue(props.x ?? 0, t, b, vw) as number;
      const y = resolveValue(props.y ?? 0, t, b, vh) as number;
      const width = resolveValue(props.width ?? 0, t, b, vw) as number;
      const height = resolveValue(props.height ?? 0, t, b, vh) as number;
      const rotation = (resolveValue(props.rotation ?? 0, t, b) as number) ?? 0;
      const scale = (resolveValue(props.scale ?? 1, t, b) as number) ?? 1;
      const baseOpacity = (resolveValue(props.opacity ?? 1, t, b) as number) ?? 1;
      const color = (resolveValue(props.color ?? '#ffffff', t, b) as string) ?? '#ffffff';
      const rawBlend = resolveValue(props.blend ?? 'source-over', t, b);
      const blend = rawBlend === 'add' ? 'lighter' : String(rawBlend);
      const visible = resolveValue(props.visible ?? true, t, b);

      if (visible === false) return;

      // --- エフェクト適用 ---
      const mod: FrameModifications = {
        dx: 0, dy: 0, extraScale: 1, extraRotation: 0,
        flashStrength: 0, flashColor: '#ffffff'
      };
      const opacityMul = applyEffects(effects, t, b, mod);
      const opacity = baseOpacity * opacityMul;
      if (opacity <= 0) return;

      // --- カスタムプロパティの評価 ---
      const custom: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(props)) {
        if (BASE_KEYS.has(key)) continue;
        if (isKeyframes(value)) custom[key] = animateNumber(t, value);
        else custom[key] = evaluateProp(value as never, t, b);
      }

      ctx.save();
      try {
        ctx.globalAlpha = Math.min(1, Math.max(0, opacity));
        ctx.globalCompositeOperation = blend as GlobalCompositeOperation;

        ctx.translate(x + mod.dx, y + mod.dy);
        ctx.rotate(((rotation + mod.extraRotation) * Math.PI) / 180);
        ctx.scale(scale * mod.extraScale, scale * mod.extraScale);
        ctx.fillStyle = color;

        if (mod.flashStrength > 0) {
          ctx.shadowColor = mod.flashColor;
          ctx.shadowBlur = 60 * mod.flashStrength;
        }

        (renderLogic as RenderLogic<Record<string, unknown>, TCustomState>)(
          ctx,
          {
            ...(custom as TProps),
            x, y, width, height, rotation, scale,
            opacity, color,
            blend: blend as GlobalCompositeOperation,
            visible: true,
            effects
          },
          customState,
          t, b, s, vw, vh
        );
      } finally {
        ctx.restore();
      }
    }) as RenderFunctionLike;
  }) as ComponentFactory<TProps>;
}

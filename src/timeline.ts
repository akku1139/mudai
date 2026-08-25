// SPDX-License-Identifier: AGPL-3.0-or-later

// -- デモタイムライン --
// このファイルを編集して動画を作ってください。
// 変更はブラウザのリロードで反映されます。

import { textObject } from 'mudai/components/text.js';
import { shapeObject } from 'mudai/components/shape.js';
import { spectrumObject } from 'mudai/components/spectrum.js';
import { visual, globalEffect, compute } from 'mudai/core/factories.js';
import { createState } from 'mudai/core/state.js';
import type { EngineConfig, TimelineItem } from 'mudai/core/types.js';

export const config: EngineConfig = {
  width: 1920,
  height: 1080,
  fps: 60,
  duration: 12,
  backgroundColor: '#12121c',
  tempos: {
    default: { bpm: 120, offset: 0 }
  }
};

// --- 共有ステート (computeで毎フレーム更新される) ---
const beatColor = createState('#ffffff');
const beatPulse = createState(1);

/**
 * プロジェクトのタイムライン定義
 */
export const timeline: TimelineItem[] = [
  // --- 音声 (audio/bgm.mp3 を置いてコメントを外す) ---
  // audio('audio/bgm.mp3', {
  //   start: 0,
  //   volume: 0.8,
  //   effects: [
  //     { type: 'fade-in', start: 0, duration: 1 },
  //     { type: 'fade-out', start: 10, duration: 2 }
  //   ]
  // }),

  // --- Compute: 描画の前に毎フレーム実行される ---
  compute((_t, b) => {
    const colors = ['#ff0055', '#00ffcc', '#ffee55', '#ffffff'];
    beatColor.current = colors[Math.floor(b) % colors.length] ?? '#ffffff';
    beatPulse.current = 1 + Math.max(0, Math.sin(b * Math.PI)) * 0.08;
  }),

  // --- 背景: 奥で回転する星 ---
  visual(shapeObject, {
    start: 0,
    zIndex: 1,
    shape: 'star',
    points: 6,
    radius: 340,
    x: '76%',
    y: '42%',
    color: '#1e1e3a',
    rotation: (t) => t * 8,
    scale: () => beatPulse.current * 1.4,
    opacity: 0.9,
    effects: [{ type: 'fade-in', duration: 1.2 }]
  }),

  // --- スペクトラム (音声ベイクがある時だけ実体が描画される) ---
  visual(spectrumObject, {
    start: 0,
    zIndex: 2,
    x: '10%',
    y: '100%',
    width: '80%',
    height: 260,
    color: 'rgba(0,255,255,0.35)',
    gradientTo: 'rgba(255,0,85,0.35)'
  }),

  // --- メインタイトル: 複数エフェクトの重ね合わせ ---
  visual(textObject, {
    start: 0.3,
    end: 11,
    zIndex: 10,
    text: 'mudai',
    x: '50%',
    y: 480,
    size: 220,
    weight: 'bold',
    color: '#f5f5ff',
    shadowColor: 'rgba(124,108,255,0.55)',
    shadowBlur: 60,
    effects: [
      { type: 'pop-in', duration: 0.7 },
      { type: 'pulse', amount: 0.04 },
      { type: 'shake', start: 8, duration: 1.2, intensity: 6 },
      { type: 'slide-out', start: 10.5, direction: 'up', distance: 200, duration: 1 }
    ]
  }),

  // --- サブタイトル: キーフレームアニメーションで登場 ---
  visual(textObject, {
    start: 0,
    end: 12,
    zIndex: 9,
    text: 'declarative video engine',
    x: '50%',
    y: [{ time: 0.8, value: 800, ease: 'easeOutExpo' }, { time: 1.6, value: 650 }],
    opacity: [{ time: 0.8, value: 0 }, { time: 1.8, value: 1 }],
    size: 54,
    color: '#9a9ab8',
    effects: [{ type: 'fade-out', start: 10.8, duration: 1 }]
  }),

  // --- ビート連動テキスト ---
  visual(textObject, {
    start: 2,
    end: 10,
    zIndex: 11,
    text: (_t, b) => `beat ${Math.floor(b)}`,
    x: '50%',
    y: '78%',
    size: 40,
    color: () => beatColor.current
  }),

  // --- グローバルエフェクト ---
  globalEffect('fade-to-color', { color: '#000000', start: 11, duration: 1 })
];

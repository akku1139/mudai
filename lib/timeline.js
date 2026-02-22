// SPDX-License-Identifier: AGPL-3.0-or-later

// -- dummy --

// @ts-check
import { textObject } from './components/text.js';
import { spectrumObject } from './components/spectrum.js';
import { audio, visual, globalEffect, compute } from './core/factories.js';
import { createState } from './core/state.js';
import { animate } from './core/animation.js';

// --- 1. プロジェクト設定 ---
export const config = {
  width: 1920,
  height: 1080,
  fps: 60,
  duration: 15,
  backgroundColor: '#1a1a2e',
  tempos: {
    default: { bpm: 120, offset: 0 }
  }
};

// --- 2. 状態管理 ---
const sharedPos = createState({ x: '50%', y: '50%' });
const sharedColor = createState('#ffffff');

export const timeline = [
  // --- Audio ---
  /*
  audio('/project/bgm.wav', { id: 'bgm', start: 0, effects: [
      { type: 'fade-out', start: 12, duration: 3 },
    ],
  }),
  */

  // --- Compute (Stateの更新) ---
  // 描画の前に実行され、時間を元に共有状態を計算する
  compute((t, b) => {
    // ビートに合わせて色を切り替える例
    const colors = ['#ff0055', '#00ffcc', '#ffff00', '#ffffff'];
    sharedColor.current = colors[Math.floor(b) % colors.length];

    // 時間に合わせてY座標を上下させる
    sharedPos.current = {
      x: '50%',
      y: `calc(50% + ${Math.sin(t * 2) * 100}px)`
    };
  }),

  // --- Visuals ---
  // イージングを使ったリッチなアニメーションの例
  visual(textObject, {
    start: 0, end: 15, zIndex: 10,
    text: 'Motion Graphics!',
    x: '50%',
    // animateヘルパーでY座標を制御
    y: (t) => animate(t, [
      { time: 0, value: -100, ease: 'easeOutBack' }, // 画面外から跳ねるように中央へ
      { time: 2, value: 540 },                       // 2秒時点で中央に到達
      { time: 10, value: 540, ease: 'easeInQuad' },  // 10秒まで待機し、徐々に加速して
      { time: 12, value: 1200 }                      // 12秒で画面下へ消える
    ]),
    color: () => sharedColor.current,
    size: 80
  }),

  visual(spectrumObject, {
    start: 0, end: 15, zIndex: 1,
    x: '10%', y: '100%', width: '80%', height: 300,
    color: 'rgba(0, 255, 255, 0.5)',
    effects: [{ type: 'fade-in', start: 0, duration: 2 }]
  }),

  visual(textObject, {
    start: 0, end: 15, zIndex: 10,
    text: 'Declarative API',
    // 共有Stateから座標と色を読み取る
    x: () => sharedPos.current.x,
    y: () => sharedPos.current.y,
    color: () => sharedColor.current,
    size: 80,
    rotation: (t) => t * 45,
    scale: (t, b) => 1 + Math.sin(b * Math.PI) * 0.2
  }),

  visual(textObject, {
    start: 0, end: 15, zIndex: 9,
    text: 'Shadow Text',
    // 同じStateを参照しつつ、少しずらす（影のような表現）
    x: () => `calc(${sharedPos.current.x} + 10px)`,
    y: () => `calc(${sharedPos.current.y} + 10px)`,
    color: 'rgba(250,250,250,0.5)',
    size: 80,
    rotation: (t) => t * 45,
    scale: (t, b) => 1 + Math.sin(b * Math.PI) * 0.2
  }),

  // --- Global Effects ---
  globalEffect('fade-to-color', { color: '#000000', start: 13, duration: 2 })
];

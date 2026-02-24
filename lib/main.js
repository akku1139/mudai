// SPDX-License-Identifier: AGPL-3.0-or-later

import { Engine } from './core/engine.js';
import { config, timeline } from './timeline.js';

/**
 * @typedef {object} EngineStats
 * @property {number} w
 * @property {number} h
 * @property {number} actualFps
 * @property {number} targetFps
 * @property {string} time
 */

/** @typedef {import('./core/factories.js').TimelineItem[]} Timeline */

async function bootstrap() {
  const canvas = /** @type {HTMLCanvasElement | null} */ (document.getElementById('renderCanvas'));
  const btnPlay = /** @type {HTMLButtonElement | null} */ (document.getElementById('btnPlay'));
  const btnReset = /** @type {HTMLButtonElement | null} */ (document.getElementById('btnReset'));
  const btnRender = /** @type {HTMLButtonElement | null} */ (document.getElementById('btnRender'));
  const seekBar = /** @type {HTMLInputElement | null} */ (document.getElementById('seekBar'));
  const statsPanel = document.getElementById('statsPanel');
  const progressText = document.getElementById('progressText');

  // 必須なDOM要素がない場合は実行を中止(TSの型推論に「これ以降はnullではない」と教える)
  if (!canvas || !seekBar) {
    console.error('Required DOM elements (canvas or seekBar) not found.');
    return;
  }

  /**
   * UIの更新処理
   * @param {EngineStats} stats
   */
  const updateUI = (stats) => {
    if (statsPanel) {
      statsPanel.innerHTML = `Canvas: ${stats.w}x${stats.h} | FPS: ${stats.actualFps}/${stats.targetFps} | Time: ${stats.time}s`;
    }
    if (engine.isPlaying) {
      seekBar.value = engine.currentTime.toString();
    }
  };

  const engine = new Engine(config, timeline, canvas, updateUI);
  const scale = Math.min(window.innerWidth / config.width, window.innerHeight / config.height) * 0.8;
  canvas.style.transform = `scale(${scale})`;

  await engine.init();
  seekBar.max = config.duration.toString();
  seekBar.step = (1 / config.fps).toString();

  // 1. 掴んだ時：シーク中フラグを立てる
  seekBar.addEventListener('pointerdown', () => {
    engine.isSeeking = true;
  });

  // 2. ドラッグ中：プレビューだけを更新する(音声は途切れない/鳴らない)
  seekBar.addEventListener('input', (e) => {
    const target = /** @type {HTMLInputElement} */ (e.target);
    const t = parseFloat(target.value);
    engine.previewSeek(t);
  });

  // 3. 離した時：シーク中フラグを折り、音声を再開する
  seekBar.addEventListener('change', (e) => {
    engine.isSeeking = false;
    const target = /** @type {HTMLInputElement} */ (e.target);
    const t = parseFloat(target.value);
    engine.seek(t);
  });

  btnPlay?.addEventListener('click', () => {
    const isPlaying = engine.togglePlay();
    btnPlay.innerText = isPlaying ? 'Pause' : 'Play';
  });

  btnReset?.addEventListener('click', () => {
    if (engine.isPlaying) {
      engine.togglePlay();
      if (btnPlay) btnPlay.innerText = 'Play';
    }
    engine.seek(0);
  });

  btnRender?.addEventListener('click', () => {
    btnRender.innerText = 'Rendering...';
    btnRender.disabled = true; // setAttributeよりプロパティ操作の方が型安全

    engine.startRendering((percent) => {
      if (progressText) progressText.innerText = `${percent}%`;
      seekBar.value = ((percent / 100) * config.duration).toString();

      if (percent >= 100) {
        btnRender.innerText = 'Render';
        btnRender.disabled = false;
        if (progressText) progressText.innerText = 'Complete!';
      }
    });
  });

  window.addEventListener('beforeunload', (e) => {
    if (engine.isRendering) {
      e.preventDefault();
    }
  });
}

bootstrap().catch(console.error);

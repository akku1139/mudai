// SPDX-License-Identifier: AGPL-3.0-or-later

import { Engine } from './core/engine.js';
import { config, timeline } from './timeline.js';

async function bootstrap() {
  const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('renderCanvas'));
  const btnPlay = document.getElementById('btnPlay');
  const btnReset = document.getElementById('btnReset');
  const btnRender = document.getElementById('btnRender');
  const seekBar = /** @type {HTMLInputElement} */ (document.getElementById('seekBar'));
  const statsPanel = document.getElementById('statsPanel');
  const progressText = document.getElementById('progressText');

  const updateUI = (stats) => {
    if (statsPanel) statsPanel.innerHTML = `Canvas: ${stats.w}x${stats.h} | FPS: ${stats.actualFps}/${stats.targetFps} | Time: ${stats.time}s`;
    if (engine.isPlaying) seekBar.value = engine.currentTime.toString();
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

  // 2. ドラッグ中：プレビューだけを更新する（音声は途切れない/鳴らない）
  seekBar.addEventListener('input', (e) => {
    const t = parseFloat(e.target.value);
    engine.previewSeek(t);
  });

  // 3. 離した時：シーク中フラグを折り、音声を再開する
  seekBar.addEventListener('change', (e) => {
    engine.isSeeking = false;
    const t = parseFloat(e.target.value);
    engine.seek(t);
  });

  btnPlay?.addEventListener('click', () => {
    const isPlaying = engine.togglePlay();
    btnPlay.innerText = isPlaying ? 'Pause' : 'Play';
  });

  btnReset?.addEventListener('click', () => {
    if (engine.isPlaying) { engine.togglePlay(); btnPlay.innerText = 'Play'; }
    engine.seek(0);
  });

  btnRender?.addEventListener('click', () => {
    btnRender.innerText = 'Rendering...';
    btnRender.setAttribute('disabled', 'true');
    engine.startRendering((percent) => {
      progressText.innerText = `${percent}%`;
      seekBar.value = ((percent / 100) * config.duration).toString();
      if (percent >= 100) {
        btnRender.innerText = 'Render';
        btnRender.removeAttribute('disabled');
        progressText.innerText = 'Complete!';
      }
    });
  });

  window.addEventListener('beforeunload', (e) => {
    if (engine.isRendering) {
      // 標準的なブラウザ警告ダイアログを表示するための設定
      e.preventDefault();
      e.returnValue = '';
    }
  });
}

bootstrap().catch(console.error);

// SPDX-License-Identifier: AGPL-3.0-or-later

import { Engine } from 'mudai/core/engine.js';
import type { EngineStats } from 'mudai/core/engine.js';
import type { EngineConfig, TimelineItem } from 'mudai/core/types.js';
import { preloadAllImages } from 'mudai/components/image.js';

interface TimelineModule {
  config: EngineConfig;
  timeline: TimelineItem[];
}

function requireEl<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} が見つかりません`);
  return el as T;
}

async function bootstrap(): Promise<void> {
  const canvas = requireEl<HTMLCanvasElement>('renderCanvas');
  const btnPlay = requireEl<HTMLButtonElement>('btnPlay');
  const btnReset = requireEl<HTMLButtonElement>('btnReset');
  const btnRender = requireEl<HTMLButtonElement>('btnRender');
  const seekBar = requireEl<HTMLInputElement>('seekBar');
  const statsPanel = requireEl<HTMLDivElement>('statsPanel');
  const progressFill = requireEl<HTMLDivElement>('progressFill');
  const statusText = requireEl<HTMLDivElement>('statusText');
  const timeText = requireEl<HTMLSpanElement>('timeText');
  const outputName = requireEl<HTMLInputElement>('outputName');
  const overlay = requireEl<HTMLDivElement>('overlay');

  // ユーザープロジェクトのタイムライン (/timeline.js) を動的に読み込む
  const userSpecifier = '/timeline.js';
  const user = (await import(userSpecifier)) as unknown as Partial<TimelineModule>;

  if (!user.config || !Array.isArray(user.timeline)) {
    overlay.style.display = 'flex';
    overlay.innerHTML =
      '<div><strong>timeline.js が読み込めませんでした</strong><br>' +
      'プロジェクトルートに <code>config</code> と <code>timeline</code> をエクスポートした<br>' +
      '<code>timeline.js</code> を配置してください (<code>mudai init</code> で雛形生成)</div>';
    return;
  }

  const config = user.config;
  const timeline = user.timeline;

  const updateStatsUI = (stats: EngineStats): void => {
    statsPanel.textContent =
      `${stats.w}×${stats.h} · ${stats.actualFps}/${stats.targetFps}fps`;
    timeText.textContent = `${stats.time} / ${stats.duration.toFixed(2)}`;
    if (!engine.isSeeking && !engine.isRendering) {
      seekBar.value = String(engine.currentTime);
    }
  };

  const engine = new Engine(config, timeline, canvas, updateStatsUI);

  // キャンバスをウィンドウに収まるようスケール
  const fitCanvas = (): void => {
    const margin = 120;
    const scale = Math.min(
      (window.innerWidth - margin) / config.width,
      (window.innerHeight - margin - 160) / config.height,
      1
    );
    canvas.style.transform = `scale(${scale})`;
  };
  fitCanvas();
  window.addEventListener('resize', fitCanvas);

  seekBar.max = String(config.duration);
  seekBar.step = String(1 / config.fps);

  // --- 画像の事前読み込み ---
  await preloadAllImages();

  // --- エンジン初期化 (フォント・音声ベイク) ---
  statusText.textContent = 'Loading audio…';
  try {
    await engine.init((p) => {
      progressFill.style.width = `${Math.round(p * 100)}%`;
    });
    statusText.textContent = '';
    progressFill.style.width = '0%';
  } catch (e) {
    console.error(e);
    statusText.textContent = `Init error: ${String(e)}`;
  }

  const setPlayButton = (playing: boolean): void => {
    btnPlay.textContent = playing ? '⏸ Pause' : '▶ Play';
  };

  // --- 再生操作 ---
  const togglePlay = (): void => {
    setPlayButton(engine.togglePlay() ?? false);
  };
  btnPlay.addEventListener('click', togglePlay);

  btnReset.addEventListener('click', () => {
    if (engine.isPlaying) setPlayButton(false);
    engine.seek(0);
  });

  // --- シーク ---
  seekBar.addEventListener('pointerdown', () => {
    engine.isSeeking = true;
  });
  seekBar.addEventListener('input', () => {
    engine.previewSeek(parseFloat(seekBar.value));
  });
  seekBar.addEventListener('change', () => {
    engine.isSeeking = false;
    engine.seek(parseFloat(seekBar.value));
  });

  // --- キーボードショートカット ---
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement && e.target !== seekBar) return;
    if (engine.isRendering) return;

    switch (e.key) {
      case ' ': {
        e.preventDefault();
        togglePlay();
        break;
      }
      case 'ArrowLeft': {
        e.preventDefault();
        const step = e.shiftKey ? 1 : 1 / config.fps;
        engine.seek(engine.currentTime - step);
        break;
      }
      case 'ArrowRight': {
        e.preventDefault();
        const step = e.shiftKey ? 1 : 1 / config.fps;
        engine.seek(engine.currentTime + step);
        break;
      }
      case 'Home': {
        engine.seek(0);
        break;
      }
      case 'End': {
        engine.seek(config.duration);
        break;
      }
    }
  });

  // --- 書き出し ---
  const setStatus = (msg: string): void => {
    statusText.textContent = msg;
  };

  btnRender.addEventListener('click', () => {
    if (engine.isRendering) return;
    btnRender.disabled = true;
    btnRender.textContent = '…';
    progressFill.style.width = '0%';
    setStatus('Connecting to server…');

    engine
      .startRendering(
        (percent) => {
          progressFill.style.width = `${percent}%`;
          seekBar.value = String((percent / 100) * config.duration);
          if (percent < 100) setStatus(`Rendering… ${percent}%`);
        },
        outputName.value.trim() || undefined
      )
      .catch((err: unknown) => {
        setStatus(`Render failed: ${String(err)}`);
      })
      .finally(() => {
        btnRender.disabled = false;
        btnRender.textContent = 'Render';
      });
  });

  // サーバーからのステータスメッセージを受け取る (Engine内WSをフックはしない簡易実装)
  window.addEventListener('mudai:status', (e) => {
    const detail = (e as CustomEvent<{ message?: string; path?: string }>).detail;
    if (detail?.path) {
      setStatus(`✓ Saved: ${detail.path}`);
      progressFill.style.width = '100%';
      setTimeout(() => {
        progressFill.style.width = '0%';
      }, 2500);
    } else if (detail?.message) {
      setStatus(detail.message);
    }
  });

  window.addEventListener('beforeunload', (e) => {
    if (engine.isRendering) e.preventDefault();
  });

  // --- ライブリロード (プロジェクトソースの変更を検知して自動リロード) ---
  let lastMtime = 0;
  const checkMtime = async (): Promise<void> => {
    try {
      const res = await fetch('/__mudai__/mtime', { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as { mtime: number };
      if (lastMtime === 0) {
        lastMtime = data.mtime;
      } else if (data.mtime > lastMtime) {
        console.log('[mudai] source changed, reloading...');
        location.reload();
      }
    } catch {
      // サーバー切断時は無視
    }
  };
  void checkMtime();
  setInterval(() => void checkMtime(), 1000);
}

bootstrap().catch((err: unknown) => {
  console.error(err);
  const overlay = document.getElementById('overlay');
  if (overlay) {
    overlay.style.display = 'flex';
    overlay.innerHTML = `<div><strong>起動に失敗しました</strong><br>${String(err)}</div>`;
  }
});

// SPDX-License-Identifier: AGPL-3.0-or-later

// mudai スモークテスト
// CI上でサーバー起動 → HTTP配信 → WebSocket経由でフレーム送信 → FFmpeg書き出しまで検証します。
//
// 使い方: node test/smoke.mjs [--keep]
//   --keep: 一時プロジェクトディレクトリを残す (デバッグ用)

import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';

import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const KEEP = process.argv.includes('--keep');

const results = [];
/** @param {string} name @param {boolean} ok @param {string} [detail] */
function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) process.exitCode = 1;
}

/** @returns {Promise<{status: number, body: string}>} */
function httpGet(port, pathname) {
  return new Promise((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port, path: pathname }, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve({ status: res.statusCode, body }));
      })
      .on('error', reject);
  });
}

// ---------------------------------------------------------------- テスト用タイムライン生成

function makeProject(dir) {
  const timelineJs = `
import { visual, compute } from 'mudai/factories.js';
import { textObject } from 'mudai/components/text.js';
import { shapeObject } from 'mudai/components/shape.js';
import { createState } from 'mudai/core/state.js';

export const config = {
  width: 320,
  height: 240,
  fps: 30,
  duration: 1,
  backgroundColor: '#101020',
  tempos: { default: { bpm: 120, offset: 0 } }
};

const col = createState('#ffffff');
compute((_t, b) => { col.current = Math.floor(b) % 2 ? '#ff0055' : '#00ffcc'; });

export const timeline = [
  visual(textObject, {
    start: 0, end: 1, zIndex: 10,
    text: 'SMOKE', x: '50%', y: '50%', size: 48,
    weight: 'bold', color: () => col.current,
    effects: [{ type: 'pop-in', duration: 0.4 }]
  }),
  visual(shapeObject, {
    start: 0, zIndex: 1,
    shape: 'circle', radius: 60,
    x: '80%', y: '80%', color: '#3355ff',
    rotation: (t) => t * 90
  })
];
`;
  fs.writeFileSync(path.join(dir, 'timeline.js'), timelineJs);
}

// ---------------------------------------------------------------- メイン

async function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mudai-smoke-'));
  makeProject(tmpDir);

  const port = 3877;
  console.log(`[smoke] project dir: ${tmpDir}`);
  console.log(`[smoke] starting server on :${port} ...`);

  const server = spawn(
    process.execPath,
    [path.join(ROOT, 'bin', 'mudai.js'), '--port', String(port), '--dir', tmpDir],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );
  let serverLog = '';
  server.stdout.on('data', (d) => {
    serverLog += d;
    if (process.env.VERBOSE) process.stdout.write(d);
  });
  server.stderr.on('data', (d) => {
    serverLog += d;
    if (process.env.VERBOSE) process.stderr.write(d);
  });

  try {
    // サーバー起動待ち
    let up = false;
    for (let i = 0; i < 50 && !up; i++) {
      await sleep(100);
      try {
        await httpGet(port, '/');
        up = true;
      } catch {
        /* retry */
      }
    }
    record('server starts and serves index.html', up);

    // パッケージモジュールが/__mudai__/経由で取れるか
    const mod = await httpGet(port, '/__mudai__/core/engine.js').catch(() => null);
    const modOk =
      !!mod &&
      mod.status === 200 &&
      mod.body.includes('export class Engine') &&
      mod.body.includes("from 'mudai/core/renderer.js'");
    record('package modules served via /__mudai__/', modOk);

    const assets = await httpGet(port, '/__mudai__/index.html').catch(() => null);
    record(
      'assets/index.html served',
      !!assets && assets.status === 200 && assets.body.includes('<canvas'),
      assets ? `status=${assets.status}` : 'failed'
    );

    const missing = await httpGet(port, '/nope.js').catch(() => null);
    record('404 for unknown files', !!missing && missing.status === 404);

    // パス・トラバーサル対策
    const trav = await httpGet(port, '/..%2f..%2fetc%2fpasswd').catch(() => null);
    record(
      'path traversal blocked',
      !trav || trav.status === 403 || trav.status === 404,
      trav ? `status=${trav.status}` : ''
    );

    // ---- レンダー (WebSocket → ffmpeg) ----
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
    });

    const W = 320,
      H = 240,
      FPS = 30,
      DUR = 1;
    const totalFrames = FPS * DUR; // フレーム数 (W*H*4 バイトが1フレーム)

    ws.send(
      JSON.stringify({
        type: 'config',
        width: W,
        height: H,
        fps: FPS,
        output: 'output.mp4'
      })
    );

    // 生RGBAフレームを送る (グラデーション + 時間で色変化)
    const frame = Buffer.alloc(W * H * 4);
    let sent = 0;
    const sendLoop = setInterval(() => {
      while (sent < totalFrames && ws.bufferedAmount < 1_000_000) {
        const t = sent / FPS;
        for (let i = 0; i < W * H; i++) {
          const x = i % W,
            y = Math.floor(i / W);
          frame[i * 4 + 0] = (x / W) * 255 * (0.5 + 0.5 * Math.sin(t * 2));
          frame[i * 4 + 1] = (y / H) * 255;
          frame[i * 4 + 2] = 128;
          frame[i * 4 + 3] = 255;
        }
        ws.send(frame);
        sent++;
      }
      if (sent >= totalFrames) {
        clearInterval(sendLoop);
        ws.send(JSON.stringify({ type: 'end' }));
      }
    }, 5);

    /** @type {{type:string, message?:string, path?:string}|null} */
    let completeMsg = null;
    await new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(), 30000);
      ws.on('message', (data, isBinary) => {
        if (isBinary) return;
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'complete') {
            completeMsg = msg;
            clearTimeout(timeout);
            resolve();
          }
          if (msg.type === 'error') {
            clearTimeout(timeout);
            resolve();
          }
        } catch {}
      });
    });
    clearInterval(sendLoop);
    ws.close();

    const outPath = path.join(tmpDir, 'output.mp4');
    await sleep(500);
    const exists = fs.existsSync(outPath) && fs.statSync(outPath).size > 1000;
    record(
      'render completes and output.mp4 is written',
      !!completeMsg && exists,
      completeMsg ? `${fs.statSync(outPath).size} bytes` : serverLog.slice(-300)
    );
  } finally {
    server.kill();
    if (!KEEP) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      console.log('[smoke] cleaned up temp project');
    }
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n[smoke] ${results.length - failed}/${results.length} passed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

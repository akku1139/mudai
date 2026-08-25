// SPDX-License-Identifier: AGPL-3.0-or-later

import { WebSocketServer, WebSocket } from 'ws';
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import os from 'node:os';

// --------------------------------------------------------------- CLI引数解析

interface CliOptions {
  port: number;
  dir: string;
  help: boolean;
  version: boolean;
}

const args = process.argv.slice(2);

function printHelp(): void {
  console.log(`
mudai - React-like declarative video engine

Usage:
  mudai [options]        プレビューサーバーを起動
  mudai init             カレントディレクトリにプロジェクトの雛形を作成

Options:
  -p, --port <number>    ポート番号 (default: 3859)
  -d, --dir <path>      プロジェクトのルートディレクトリ (default: カレント)
  -h, --help            ヘルプを表示
  -v, --version         バージョンを表示
`);
}

function parseArgs(): CliOptions {
  const opts: CliOptions = {
    port: Number(process.env.MUDAI_PORT ?? 3859),
    dir: process.cwd(),
    help: false,
    version: false
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-p' || a === '--port') {
      const v = Number(args[++i]);
      if (Number.isFinite(v) && v > 0) opts.port = v;
    } else if (a === '-d' || a === '--dir') {
      const v = args[++i];
      if (v) opts.dir = path.resolve(v);
    } else if (a === '-h' || a === '--help') {
      opts.help = true;
    } else if (a === '-v' || a === '--version') {
      opts.version = true;
    }
  }
  return opts;
}

// ------------------------------------------------------------------- 初期化

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// コンパイル後: <pkg>/dist/server.js → pkg ルートは2つ上
const PKG_ROOT = path.resolve(__dirname, '..');
const DIST_DIR = path.join(PKG_ROOT, 'dist');
const ASSETS_DIR = path.join(PKG_ROOT, 'assets');

function readPkgVersion(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(PKG_ROOT, 'package.json'), 'utf8')) as { version?: string };
    return pkg.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

/** ffmpeg の存在確認。なければ起動を続行するが警告を出す */
function checkFfmpeg(): void {
  const proc = spawn('ffmpeg', ['-version']);
  proc.on('error', () => {
    console.warn(
      '\n[mudai] WARNING: ffmpeg が見つかりません。プレビューは動きますが、書き出し (Render) には ffmpeg が必要です。\n' +
        '         インストール: https://ffmpeg.org/download.html (macOS: brew install ffmpeg)\n'
    );
  });
}

// ------------------------------------------------------- init (スキャフォールド)

async function runInit(dir: string): Promise<void> {
  const timelinePath = path.join(dir, 'timeline.js');
  if (fs.existsSync(timelinePath)) {
    console.log('[mudai] timeline.js が既に存在するため、init を中止しました。');
    return;
  }

  const template = `// SPDX-License-Identifier: AGPL-3.0-or-later

import { visual, audio, globalEffect, compute } from 'mudai/factories.js';
import { textObject } from 'mudai/components/text.js';

export const config = {
  width: 1920,
  height: 1080,
  fps: 60,
  duration: 10,
  backgroundColor: '#1a1a2e',
  tempos: { default: { bpm: 120, offset: 0 } }
};

export const timeline = [
  // audio('audio/bgm.mp3', { start: 0 }),

  visual(textObject, {
    start: 0,
    end: 5,
    text: 'Hello, mudai!',
    x: '50%',
    y: '50%',
    size: 120,
    weight: 'bold',
    effects: [
      { type: 'fade-in', duration: 0.8 },
      { type: 'pop-in', duration: 0.8 },
      { type: 'fade-out', start: 4, duration: 1 }
    ]
  })
];
`;

  fs.writeFileSync(timelinePath, template);

  // 再エクスポート用の雛形 (独自コンポーネントを追加してもOK)
  fs.mkdirSync(path.join(dir, 'components'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'components', 'text.js'),
    `// SPDX-License-Identifier: AGPL-3.0-or-later
export { textObject } from 'mudai/components/text.js';
`
  );

  fs.mkdirSync(path.join(dir, 'audio'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'images'), { recursive: true });

  console.log(`[mudai] 雛形を作成しました:

  ${dir}/
  ├── timeline.js        ← タイムライン定義 (ここを編集)
  ├── components/text.js ← 再エクスポート (独自コンポーネントも追加できる)
  ├── audio/             ← 音源置き場
  └── images/            ← 画像置き場

次の手順:
  1. "npx mudai" でサーバーを起動
  2. ブラウザで http://localhost:3859 を開く
`);
}

// ------------------------------------------------------------- HTTPサーバー

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
};

/**
 * 指定ディレクトリ群を順に探してファイルを配信する。
 * パスがいずれのベースにも収まらない場合は 403。
 */
function serveFromDirs(
  dirs: string[],
  subPath: string,
  res: http.ServerResponse
): void {
  const tryDir = (idx: number): void => {
    if (idx >= dirs.length) {
      res.writeHead(404);
      res.end('404 Not Found');
      return;
    }
    const baseDir = dirs[idx] ?? '';
    const filePath = path.join(baseDir, subPath);

    const absBase = path.resolve(baseDir);
    const absTarget = path.resolve(filePath);
    if (!absTarget.startsWith(absBase + path.sep) && absTarget !== absBase) {
      res.writeHead(403);
      res.end('403 Forbidden');
      return;
    }

    fs.stat(filePath, (err, stat) => {
      if (err || !stat.isFile()) {
        tryDir(idx + 1);
        return;
      }
      const ext = String(path.extname(filePath)).toLowerCase();
      res.writeHead(200, {
        'Content-Type':
          MIME_TYPES[ext as keyof typeof MIME_TYPES] ??
          'application/octet-stream',
        'Cache-Control': 'no-cache'
      });
      fs.createReadStream(filePath).pipe(res);
    });
  };
  tryDir(0);
}

/**
 * プロジェクトソース (timeline.js と components/, audio/, images/) の
 * 最新 mtime を JSON で返す。ライブリロード判定用。
 */
function statMtime(workingDir: string, res: http.ServerResponse): void {
  const roots = [
    path.join(workingDir, 'timeline.js'),
    path.join(workingDir, 'components'),
    path.join(workingDir, 'audio'),
    path.join(workingDir, 'images')
  ];

  let latest = 0;
  let pending = roots.length;

  const finish = (): void => {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
    res.end(JSON.stringify({ mtime: latest }));
  };

  const walk = (p: string): void => {
    fs.stat(p, (err, st) => {
      if (!err) {
        if (st.isDirectory()) {
          fs.readdir(p, (e2, files) => {
            if (e2) {
              if (--pending === 0) finish();
              return;
            }
            pending += files.length;
            for (const f of files) walk(path.join(p, f));
            if (--pending === 0 && files.length === 0) finish();
          });
        } else {
          latest = Math.max(latest, st.mtimeMs);
          if (--pending === 0) finish();
        }
      } else if (--pending === 0) {
        finish();
      }
    });
  };

  for (const r of roots) walk(r);
}

function createRequestHandler(workingDir: string): http.RequestListener {
  return (req, res) => {
    let decodedUrl: string;
    try {
      decodedUrl = decodeURIComponent(req.url ?? '/');
    } catch {
      res.writeHead(400);
      res.end('Bad Request');
      return;
    }

    const trimmedPath = decodedUrl.replace(/^\/+/, '') || 'index.html';
    const safeWithin = (target: string, base: string): boolean => {
      const absBase = path.resolve(base) + path.sep;
      const absTarget = path.resolve(target);
      return absTarget.startsWith(absBase) || absTarget === path.resolve(base);
    };

    // プロジェクトの最終更新時刻 (ライブリロード用) — /__mudai__/ より先に判定
    if (trimmedPath === '__mudai__/mtime') {
      statMtime(workingDir, res);
      return;
    }

    // /__mudai__/* → パッケージ内アセット (dist/、assets/)
    if (trimmedPath.startsWith('__mudai__/')) {
      const sub = trimmedPath.slice('__mudai__/'.length);
      serveFromDirs([DIST_DIR, ASSETS_DIR], sub, res);
      return;
    }

    /** 候補ディレクトリ群から順にファイルを探して返す */
    const candidates = [workingDir, DIST_DIR, ASSETS_DIR];

    const tryServe = (idx: number): void => {
      if (idx >= candidates.length) {
        res.writeHead(404);
        res.end('404 Not Found');
        return;
      }
      const baseDir = candidates[idx] ?? workingDir;
      const filePath = path.join(baseDir, trimmedPath);

      if (!safeWithin(filePath, baseDir)) {
        res.writeHead(403);
        res.end('403 Forbidden');
        return;
      }

      fs.stat(filePath, (err, stat) => {
        if (err || !stat.isFile()) {
          tryServe(idx + 1);
          return;
        }
        const ext = String(path.extname(filePath)).toLowerCase();
        res.writeHead(200, {
          'Content-Type': MIME_TYPES[ext as keyof typeof MIME_TYPES] ?? 'application/octet-stream',
          'Cache-Control': 'no-cache'
        });
        fs.createReadStream(filePath).pipe(res);
      });
    };

    tryServe(0);
  };
}

// ------------------------------------------------------------ レンダーセッション

interface RenderConfigMessage {
  type: 'config';
  width: number;
  height: number;
  fps: number;
  output?: string;
}

class RenderSession {
  private readonly ws: WebSocket;
  private readonly workingDir: string;
  private ffmpeg: ReturnType<typeof spawn> | null = null;
  private config: RenderConfigMessage | null = null;
  private isCompleted = false;
  private readonly sessionId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  private readonly tempVideoPath = path.join(os.tmpdir(), `mudai_video_${this.sessionId}.mp4`);
  private readonly tempAudioPath = path.join(os.tmpdir(), `mudai_audio_${this.sessionId}.wav`);

  constructor(ws: WebSocket, workingDir: string) {
    this.ws = ws;
    this.workingDir = workingDir;
  }

  private send(obj: Record<string, unknown>): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj));
  }

  handleMessage(message: Buffer, isBinary: boolean): void {
    if (!isBinary) {
      const data = JSON.parse(message.toString()) as { type: string } & Partial<RenderConfigMessage>;
      if (data.type === 'config') {
        this.start(data as RenderConfigMessage);
      } else if (data.type === 'end') {
        this.isCompleted = true;
        this.ffmpeg?.stdin?.end();
      }
      return;
    }

    if (message.subarray(0, 4).toString('ascii') === 'RIFF') {
      console.log(`[render ${this.sessionId}] received mixed audio (${(message.length / 1024 / 1024).toFixed(1)} MB)`);
      fs.writeFileSync(this.tempAudioPath, message);
    } else if (this.ffmpeg?.stdin && !this.ffmpeg.stdin.destroyed) {
      this.ffmpeg.stdin.write(message);
    }
  }

  private start(configMsg: RenderConfigMessage): void {
    this.config = configMsg;
    this.isCompleted = false;

    const hasFfmpeg = fs.existsSync('/usr/bin/ffmpeg') || fs.existsSync('/usr/local/bin/ffmpeg');
    if (!hasFfmpeg) {
      // spawn時にエラーイベントで検知されるので、ここでは警告のみ
      console.warn(`[render ${this.sessionId}] ffmpeg not found on PATH — render may fail`);
    }

    console.log(
      `[render ${this.sessionId}] starting ffmpeg (${configMsg.width}x${configMsg.height} @ ${configMsg.fps}fps)`
    );
    this.send({ type: 'status', message: 'encoding' });

    this.ffmpeg = spawn('ffmpeg', [
      '-y',
      '-f', 'rawvideo',
      '-pix_fmt', 'rgba',
      '-s', `${configMsg.width}x${configMsg.height}`,
      '-r', `${configMsg.fps}`,
      '-i', '-',
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      this.tempVideoPath
    ]);

    this.ffmpeg.stderr?.on('data', () => {
      /* ffmpegの進捗ログは冗長なので握り潰す (問題時は -loglevel debug で調査) */
    });
    this.ffmpeg.on('error', (err) => {
      this.send({ type: 'error', message: `ffmpeg failed to start: ${err.message}` });
    });

    this.ffmpeg.on('close', (code) => {
      if (this.isCompleted && code === 0) {
        this.merge();
      } else if (!this.isCompleted) {
        console.log(`[render ${this.sessionId}] aborted by client`);
      } else {
        this.send({ type: 'error', message: `ffmpeg exited with code ${code}` });
      }
    });
  }

  private merge(): void {
    const cfg = this.config;
    if (!cfg) return;

    const requested = cfg.output ?? 'output.mp4';
    const outAbs = path.resolve(this.workingDir, requested);
    if (!(outAbs + path.sep).startsWith(path.resolve(this.workingDir) + path.sep)) {
      this.send({ type: 'error', message: 'invalid output path' });
      return;
    }

    const hasAudio = fs.existsSync(this.tempAudioPath);
    const inputArgs = ['-y', '-i', this.tempVideoPath];
    if (hasAudio) inputArgs.push('-i', this.tempAudioPath);

    const codecArgs = hasAudio
      ? [...inputArgs, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', outAbs]
      : [...inputArgs, '-c:v', 'copy', outAbs];

    console.log(`[render ${this.sessionId}] merging${hasAudio ? ' audio + video' : ''} → ${requested}`);
    this.send({ type: 'status', message: 'merging' });

    const mergeProc = spawn('ffmpeg', codecArgs);
    mergeProc.stderr?.on('data', () => {});
    mergeProc.on('error', (err) => {
      this.send({ type: 'error', message: err.message });
    });
    mergeProc.on('close', (code) => {
      this.cleanup();
      if (code === 0) {
        console.log(`[render ${this.sessionId}] complete: ${outAbs}`);
        this.send({ type: 'complete', path: requested });
      } else {
        this.send({ type: 'error', message: `merge failed with code ${code}` });
      }
    });
  }

  abort(): void {
    if (!this.isCompleted) {
      this.ffmpeg?.kill('SIGKILL');
      this.cleanup();
      console.log(`[render ${this.sessionId}] client disconnected, cleaned up`);
    } else if (this.ffmpeg?.stdin && !this.ffmpeg.stdin.destroyed) {
      this.ffmpeg.stdin.end();
    }
  }

  private cleanup(): void {
    fs.unlink(this.tempVideoPath, () => {});
    fs.unlink(this.tempAudioPath, () => {});
  }
}

// ------------------------------------------------------------------ メイン

export async function main(): Promise<void> {
  const opts = parseArgs();

  if (opts.help) {
    printHelp();
    return;
  }
  if (opts.version) {
    console.log(readPkgVersion());
    return;
  }

  // initサブコマンド: 引数の先頭に "init" がある場合
  if (args.includes('init')) {
    await runInit(opts.dir);
    return;
  }

  const workingDir = opts.dir;
  const timelinePath = path.join(workingDir, 'timeline.js');
  if (!fs.existsSync(timelinePath)) {
    console.warn(
      `[mudai] 注意: ${timelinePath} が見つかりません。\n` +
        `        "mudai init" で雛形を生成するか、timeline.js を配置してください。\n`
    );
  }

  checkFfmpeg();

  const server = http.createServer(createRequestHandler(workingDir));

  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws) => {
    console.log('[mudai] renderer client connected');
    const session = new RenderSession(ws, workingDir);

    ws.on('message', (message, isBinary) => {
      try {
        session.handleMessage(message as Buffer, isBinary);
      } catch (e) {
        console.error('[mudai] message handling error:', e);
      }
    });

    ws.on('close', () => session.abort());
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `\n[mudai] ポート ${opts.port} は既に使用されています。\n` +
          `        別のポートを指定してください: npx mudai --port ${opts.port + 1}\n`
      );
      process.exit(1);
    }
    throw err;
  });

  server.listen(opts.port, () => {
    console.log(
      `[mudai] server running\n` +
        `  preview : http://localhost:${opts.port}\n` +
        `  project : ${workingDir}`
    );
  });
}

main().catch((e) => {
  console.error('[mudai] fatal:', e);
  process.exit(1);
});

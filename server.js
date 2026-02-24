#!/usr/bin/env node

// SPDX-License-Identifier: AGPL-3.0-or-later

import { WebSocketServer } from 'ws';
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import os from 'node:os';

const PORT = 3859;

// (A) パッケージ内部のディレクトリ
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_LIB_DIR = path.join(__dirname, 'lib');

// (B) 実行時のカレントディレクトリ
const WORKING_DIR = process.env.PWD || process.env.INIT_CWD || process.cwd();

const server = http.createServer((req, res) => {
  const decodedUrl = decodeURIComponent(req.url || '');

  // 先頭の / を除去し、空文字の場合は index.html にする
  // これにより path.join(WORKING_DIR, 'index.html') となり、確実に直下を探せる
  const trimmedPath = decodedUrl.replace(/^\/+/, '') || 'index.html';

  const localPath = path.join(WORKING_DIR, trimmedPath);
  const packagePath = path.join(PACKAGE_LIB_DIR, trimmedPath);

  const serveFile = (filePath, baseDir) => {
    // filePath が baseDir の配下に本当にあるか厳密にチェック
    const relative = path.relative(baseDir, filePath);
    const isSafe = relative && !relative.startsWith('..') && !path.isAbsolute(relative);

    // root (index.html) の場合 relative が "index.html" になるため OK
    // 万が一一致してしまった場合 (relative === "") も許容するなら以下
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      res.writeHead(403);
      res.end('403 Forbidden');
      return;
    }

    fs.readFile(filePath, (err, content) => {
      if (err) {
        // ファイルが存在しない場合はここではなく fs.access 側で制御する
        res.writeHead(500);
        res.end(`Server Error: ${err.code}`);
      } else {
        const extname = String(path.extname(filePath)).toLowerCase();
        const mimeTypes = {
          '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
          '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml'
        };
        res.writeHead(200, { 'Content-Type': mimeTypes[extname] ?? 'application/octet-stream' });
        res.end(content, 'utf-8');
      }
    });
  };

  // 1. カレントディレクトリ (WORKING_DIR) を最優先にチェック
  fs.access(localPath, fs.constants.F_OK, (err) => {
    if (!err) {
      serveFile(localPath, WORKING_DIR);
    } else {
      // 2. なければパッケージ側 (PACKAGE_LIB_DIR) をチェック
      fs.access(packagePath, fs.constants.F_OK, (pkgErr) => {
        if (!pkgErr) {
          serveFile(packagePath, PACKAGE_LIB_DIR);
        } else {
          res.writeHead(404);
          res.end('404 Not Found');
        }
      });
    }
  });
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  console.log('Client connected for rendering');

  /** @type {import('child_process').ChildProcessWithoutNullStreams | null} */
  let ffmpeg = null;
  let config = null;
  let isCompleted = false;

  // 変更: OSの一時ディレクトリを使用し、セッション固有のファイル名を生成
  const sessionId = Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 7);
  const tempVideoPath = path.join(os.tmpdir(), `temp_video_${sessionId}.mp4`);
  const tempAudioPath = path.join(os.tmpdir(), `temp_audio_${sessionId}.wav`);
  const outputPath = path.join(WORKING_DIR, 'output.mp4'); // 出力先はカレントディレクトリのまま

  // 一時ファイルを削除するヘルパー関数
  const cleanupTempFiles = () => {
    fs.unlink(tempVideoPath, () => {});
    fs.unlink(tempAudioPath, () => {});
  };

  ws.on('message', (message, isBinary) => {
    if (!isBinary) {
      const data = JSON.parse(message.toString());
      if (data.type === 'config') {
        config = data;
        isCompleted = false;
        console.log(`Starting FFmpeg... Temp files: ${tempVideoPath}`);

        ffmpeg = spawn('ffmpeg', [
          '-y', '-f', 'rawvideo', '-vcodec', 'rawvideo',
          '-s', `${config.width}x${config.height}`, '-pix_fmt', 'rgba', '-r', `${config.fps}`,
          '-i', '-',
          '-c:v', 'libx264', '-preset', 'fast', '-pix_fmt', 'yuv420p',
          tempVideoPath
        ]);
        ffmpeg.stderr.on('data', console.log);

        ffmpeg.on('close', (code) => {
          // 正常終了かつ音声が存在する場合のみマージを実行
          if (isCompleted && code === 0 && fs.existsSync(tempAudioPath)) {
            mergeAudio();
          } else if (!isCompleted) {
            console.log('FFmpeg stopped unexpectedly. Cleanup complete.');
          }
        });

      } else if (data.type === 'end') {
        isCompleted = true; // クライアントからの終了宣言
        if (ffmpeg) ffmpeg.stdin.end();
      }
    } else {
      const header = message.slice(0, 4).toString();
      if (header === 'RIFF') {
        console.log('Received mixed audio WAV from client.');
        // @ts-expect-error: ws buffer type
        fs.writeFileSync(tempAudioPath, message);
      } else {
        if (ffmpeg) ffmpeg.stdin.write(message);
      }
    }
  });

  ws.on('close', () => {
    // 正常終了前に切断された場合(タブ閉じ、ネットワークエラー等)
    if (!isCompleted && ffmpeg) {
      console.log('Client disconnected during render. Aborting and cleaning up...');
      ffmpeg.kill('SIGKILL'); // FFmpegプロセスを強制終了
      cleanupTempFiles();     // ゴミファイルを削除
    } else if (ffmpeg && !ffmpeg.stdin.destroyed) {
      ffmpeg.stdin.end();
    }
  });

  function mergeAudio() {
    console.log('Merging audio and video...');
    const mergeProc = spawn('ffmpeg', [
      '-y', '-i', tempVideoPath, '-i', tempAudioPath,
      '-c:v', 'copy', '-c:a', 'aac', '-shortest', outputPath
    ]);
    mergeProc.on('close', (_code) => {
      console.log(`Render complete! Result saved as ${outputPath}`);
      cleanupTempFiles(); // 成功時も一時ファイルを削除
    });
  }
});

server.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));

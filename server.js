#!/usr/bin/env node

// SPDX-License-Identifier: AGPL-3.0-or-later

import { WebSocketServer } from 'ws';
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = 3859;

// (A) パッケージ内部のディレクトリ
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_LIB_DIR = path.join(__dirname, 'lib');

// (B) 実行時のカレントディレクトリ
const WORKING_DIR = process.cwd();

const server = http.createServer((req, res) => {
  const decodedUrl = decodeURIComponent(req.url || '');
  const targetPath = decodedUrl === '/' ? '/index.html' : decodedUrl;

  // 1. カレントディレクトリ内のパスを生成
  const localPath = path.join(WORKING_DIR, targetPath);
  // 2. パッケージ内部のパスを生成
  const packagePath = path.join(PACKAGE_LIB_DIR, targetPath);

  // 配信優先順位の判定関数
  const serveFile = (filePath, isPackageFile = false) => {
    // セキュリティチェック（ディレクトリトラバーサル対策）
    const baseDir = isPackageFile ? PACKAGE_LIB_DIR : WORKING_DIR;
    const relative = path.relative(baseDir, filePath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      res.writeHead(403);
      res.end('403 Forbidden');
      return;
    }

    const extname = String(path.extname(filePath)).toLowerCase();
    const mimeTypes = {
      '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
      '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml'
    };

    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(500);
        res.end(`Server Error: ${err.code}`);
      } else {
        res.writeHead(200, { 'Content-Type': mimeTypes[extname] || 'application/octet-stream' });
        res.end(content, 'utf-8');
      }
    });
  };

  // 実行フロー: カレントディレクトリを優先的に確認
  fs.access(localPath, fs.constants.F_OK, (err) => {
    if (!err) {
      // カレントディレクトリにファイルが存在する場合 (timeline.js, assets/* など)
      serveFile(localPath, false);
    } else {
      // カレントディレクトリになければ、パッケージ内部を探す (index.html, lib/* など)
      fs.access(packagePath, fs.constants.F_OK, (pkgErr) => {
        if (!pkgErr) {
          serveFile(packagePath, true);
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
  let isCompleted = false; // 追加: 正常に全フレームを受信したかどうかのフラグ

  // 一時ファイルを削除するヘルパー関数
  const cleanupTempFiles = () => {
    fs.unlink('temp_video.mp4', () => {});
    fs.unlink('temp_audio.wav', () => {});
  };

  ws.on('message', (message, isBinary) => {
    if (!isBinary) {
      const data = JSON.parse(message.toString());
      if (data.type === 'config') {
        config = data;
        isCompleted = false;
        console.log('Starting FFmpeg with CPU encoding...');
        ffmpeg = spawn('ffmpeg', [
          '-y', '-f', 'rawvideo', '-vcodec', 'rawvideo',
          '-s', `${config.width}x${config.height}`, '-pix_fmt', 'rgba', '-r', `${config.fps}`,
          '-i', '-',
          '-c:v', 'libx264', '-preset', 'fast', '-pix_fmt', 'yuv420p',
          'temp_video.mp4'
        ]);
        ffmpeg.stderr.on('data', console.log);

        ffmpeg.on('close', (code) => {
          // 正常終了かつ音声が存在する場合のみマージを実行
          if (isCompleted && code === 0 && fs.existsSync('temp_audio.wav')) {
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
        fs.writeFileSync('temp_audio.wav', message);
      } else {
        if (ffmpeg) ffmpeg.stdin.write(message);
      }
    }
  });

  ws.on('close', () => {
    // 正常終了前に切断された場合（タブ閉じ、ネットワークエラー等）
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
      '-y', '-i', 'temp_video.mp4', '-i', 'temp_audio.wav',
      '-c:v', 'copy', '-c:a', 'aac', '-shortest', 'output.mp4'
    ]);
    mergeProc.on('close', (code) => {
      console.log(`Render complete! Result saved as output.mp4`);
      cleanupTempFiles(); // 成功時も一時ファイルを削除
    });
  }
});

server.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));

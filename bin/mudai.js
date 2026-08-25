#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later

// mudai CLI launcher.
// Resolves the real server (dist/server.js) whether mudai is:
//  - run from a git checkout:      node bin/mudai.js
//  - installed globally via pnpm/npm
//  - used as a dependency (node_modules/.bin/mudai)

import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Candidate locations of dist/server.js relative to this launcher. */
const candidates = [
  // git checkout / package root: <root>/bin/mudai.js -> <root>/dist/server.js
  path.resolve(here, '../dist/server.js'),
  // installed as a dependency: <pkg>/bin/mudai.js is symlinked into node_modules/.bin
  // so resolve the real package root through the symlink target.
];

let serverPath = null;
for (const c of candidates) {
  if (fs.existsSync(c)) { serverPath = c; break; }
}

if (!serverPath) {
  // Follow the .bin symlink to find the actual package directory.
  try {
    const real = fs.realpathSync(here);
    const viaSymlink = path.resolve(real, '../dist/server.js');
    if (fs.existsSync(viaSymlink)) serverPath = viaSymlink;
  } catch { /* ignore */ }
}

if (!serverPath) {
  try {
    const require = createRequire(import.meta.url);
    const pkgDir = path.dirname(require.resolve('mudai/package.json'));
    const viaNode = path.join(pkgDir, 'dist', 'server.js');
    if (fs.existsSync(viaNode)) serverPath = viaNode;
  } catch { /* ignore */ }
}

if (!serverPath) {
  console.error('[mudai] dist/server.js not found. Run "pnpm build" (or "npx tsc") first.');
  process.exit(1);
}

await import(pathToFileURL(serverPath).href);

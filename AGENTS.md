# AGENTS.md

mudai — React-like declarative video engine の開発メモ。

## 構成

```
src/
├── core/           エンジン本体
│   ├── types.ts        全 共有型 (TimelineItem, BaseProps, Effect...)
│   ├── component.ts    createComponent / 動的props評価 / ローカルエフェクト
│   ├── factories.ts    visual / audio / globalEffect / compute
│   ├── engine.ts       Engine (再生ループ・シーク・WSレンダー)
│   ├── renderer.ts     バッファ描画 → present()
│   ├── audio.ts        AudioContext / OfflineAudioContextベイク / WAVエンコード
│   ├── animation.ts    Easing / animate
│   ├── helpers.ts      parseCoord ("50%"式) / evaluateProp / 色
│   ├── state.ts        createState (compute間共有ステート)
│   └── tempo.ts        BPM管理
├── components/     同梱コンポーネント (text / shape / image / spectrum)
├── timeline.ts     デモタイムライン (リポジトリルートで起動した時に読まれる)
├── main.ts         プレビューUIのbootstrap
├── server.ts       CLI + HTTP + WebSocketレンダーセッション
└── index.ts        パッケージルートエクスポート
assets/index.html   UIシェル (importmap で mudai/ → /__mudai__/ を定義)
bin/mudai.js        実行ランチャー (dist/server.js を解決してimport)
test/smoke.mjs      E2Eスモークテスト
```

## 重要な設計決定

- **モジュール解決は単一URL空間**: 内部importはすべて `mudai/...` ベア指定子。
  tsconfigの `paths` でsrcに解決され、ブラウザでは `assets/index.html` の
  importmap (`"mudai/": "/__mudai__/")` とサーバーの `/__mudai__/*` ハンドラが
  distを実体化する。相対importに戻すとユーザーtimeline経由で二重インスタンス化され、
  `createState` のシングルトンが壊れるので禁止。
- **erasableSyntaxOnly**: TSのenum / parameter property / namespaceは使用不可。
- **emitはtscのみ**: bundlerなし。`.js` 拡張子付きimportを書くこと。
- **ビルド物はdist/** (gitignore済み)。npm publishはCIが `pnpm build` してから行う。

## コマンド

```bash
pnpm check   # tsc --noEmit
pnpm build   # tsc (src→dist)
pnpm test    # node test/smoke.mjs (要ffmpeg)
pnpm watch
node bin/mudai.js [--port N] [--dir path] [init]
```

## リリース

タグ `vX.Y.Z` をpushすると `.github/workflows/release.yml` が走る:
test (Node 22/24 マトリクスでcheck/build/smoke) → tag/version一致確認 →
`npm publish --provenance` (Trusted Publisher, OIDC。NPM_TOKEN不要)。
手順: version bump → commit → `git tag vX.Y.Z` → push --tags。
workflow_dispatchではテストのみ実行されpublishはskipされる。

## 注意

- `AudioContext` はユーザー操作がないとsuspendedになる (preview再生はPlayクリック起点)。
- OfflineAudioContextの `createScriptProcessor` は非推奨だがスペクトラム抽出に使用中。
- ffmpeg不在でもプレビューは動く (起動時に警告)。Render時のみ失敗しWSでerror通知。

# mudai

**React的な発想で動画を作る、宣言型動画エンジン。**

`timeline.js` にコンポーネントを並べるだけでモーショングラフィックスが組めます。
ブラウザでプレビューし、そのままFFmpeg経由でmp4書き出し。

```js
// timeline.js
import { visual } from 'mudai/factories.js';
import { textObject } from './components/text.js';

export const config = {
  width: 1920, height: 1080, fps: 60, duration: 10,
  tempos: { default: { bpm: 120, offset: 0 } }
};

export const timeline = [
  visual(textObject, {
    text: 'Hello, mudai!',
    x: '50%', y: '50%', size: 120, weight: 'bold',
    start: 0, end: 5,
    effects: [
      { type: 'pop-in', duration: 0.8 },
      { type: 'fade-out', start: 4, duration: 1 }
    ]
  })
];
```

## インストール

### 必要なもの

- **Node.js 22以降**
- **FFmpeg** (書き出しのみに必要。プレビューだけなら不要)
  - macOS: `brew install ffmpeg`
  - Ubuntu/Debian: `sudo apt install ffmpeg`
  - Windows: [ffmpeg.org](https://ffmpeg.org/download.html) または `winget install ffmpeg`

### プロジェクトの作成

```bash
# 新しいプロジェクトを作る場合
mkdir my-video && cd my-video
npx mudai init     # 雛形生成 (timeline.js / components/ / audio/ / images/)
npx mudai          # サーバー起動 → http://localhost:3859 を開く
```

既存リポジトリで使う場合:

```bash
pnpm add mudai     # or npm i mudai
npx mudai
```

## 使い方

```
mudai [options]
mudai init            カレントディレクトリに雛形を作成

Options:
  -p, --port <num>    ポート番号 (default: 3859)
  -d, --dir <path>    プロジェクトルート (default: カレント)
  -h, --help
  -v, --version
```

### プレビュー操作

| キー | 動作 |
|---|---|
| `Space` | 再生 / 一時停止 |
| `←` / `→` | 1フレーム戻る / 進む |
| `Shift` + `←` / `→` | 1秒戻る / 進む |
| `Home` / `End` | 先頭 / 末尾へ |

### 書き出し (Render)

画面下部の出力ファイル名を指定して **Render** を押すと、
フレームがサーバーに転送されFFmpegで `output.mp4` が生成されます。

## API

### `config`

```ts
interface EngineConfig {
  width: number; height: number; fps: number; duration: number;
  backgroundColor?: string;
  tempos?: Record<string, { bpm: number; offset?: number | { ref: string; time?: number; beats?: number } }>;
}
```

### タイムラインファクトリ

- **`visual(component, props)`** — ビジュアル要素を配置
- **`audio(src, props)`** — 音声トラック (`volume` / `offset`(先頭トリム) / `speed` / fade系effects)
- **`globalEffect(kind, props)`** — 画面全体のエフェクト (`fade-to-color` / `fade-from-color`)
- **`compute(fn, props)`** — 毎フレーム、描画前に実行される計算ノード

### 同梱コンポーネント

| コンポーネント | 説明 |
|---|---|
| `textObject` | テキスト (`size` / `weight` / `align` / stroke / shadow / `\n`改行) |
| `shapeObject` | 図形 (`rect` / `circle` / `ellipse` / `triangle` / `star` / `ring` / `line`) |
| `imageObject` | 画像 (`src`指定で自動プリロード) |
| `spectrumObject` | 音声スペクトラム表示 |

カスタムコンポーネントは `createComponent` で作れます:

```js
import { createComponent } from 'mudai/core/component.js';

export const box = createComponent((ctx, props) => {
  // props はすべて評価済み (%式・関数・キーフレームが解決済み)
  ctx.fillRect(0, 0, props.width, props.height);
});

// timeline.js
visual(box, { x: '50%', y: '50%', width: 200, height: 100 });
```

### 共通props (すべてのvisualで使用可)

座標系のpropsは `"50%"`, `"calc(50% + 100px)"` のような文字列式、
`(t, b) => ...` の動的関数 (t=秒, b=ビート)、数値キーフレーム配列が使えます。

- `x` `y` `width` `height` `rotation`(度) `scale` `opacity` `color`
- `blend`: 合成モード (`'add'` で加算合成)
- `visible`: 表示切替 (関数可)
- `start` `end` `zIndex` `tempoName`
- `effects`: ローカルエフェクト配列

#### effects

```js
{ type: 'fade-in', duration: 1 }
{ type: 'fade-out', start: 8, duration: 1 }
{ type: 'slide-in', direction: 'up', distance: 200, ease: 'easeOutCubic' }
{ type: 'pop-in', duration: 0.6 }
{ type: 'flash', color: '#fff', pulses: 3 }
{ type: 'shake', intensity: 10, frequency: 20 }
{ type: 'pulse', amount: 0.15 }   // ビート連動で脈動
```

(`start`省略時はアイテムの `start` に揃う)

### アニメーションユーティリティ

```js
import { animate, Easing } from 'mudai/core/animation.js';

y: (t) => animate(t, [
  { time: 0, value: -100, ease: 'easeOutBack' },
  { time: 2, value: 540 }
])
```

イージング: `linear` `easeInQuad` `easeOutQuad` `easeInOutQuad` `easeInCubic`
`easeOutCubic` `easeInOutCubic` `easeOutQuart` `easeOutExpo` `easeOutBack`
`easeOutElastic` `easeOutBounce`

### 共有ステート

```js
import { createState } from 'mudai/core/state.js';

const pos = createState({ x: 0, y: 0 });

compute(() => { pos.current.x = t * 100; });   // 更新
x: () => pos.current.x                          // 参照
```

シーク・巻き戻し時には自動で初期値にリセットされます。

## ライブラリとして使う

```js
import { Engine } from 'mudai';
import { config, timeline } from './timeline.js';

const engine = new Engine(config, timeline, canvas);
await engine.init();
engine.togglePlay();
```

## 開発

```bash
pnpm install
pnpm check        # 型チェック
pnpm build        # src/ → dist/
pnpm test         # スモークテスト (サーバー起動〜WS経由FFmpeg書き出しまで)
pnpm watch        # 監視ビルド
node bin/mudai.js # ローカル起動
```

## ライセンス

AGPL-3.0-or-later

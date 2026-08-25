// SPDX-License-Identifier: AGPL-3.0-or-later

import { createComponent } from 'mudai/core/component.js';
import type { RenderFunction } from 'mudai/core/types.js';

export interface ImageProps {
  /** 画像のURL (プリロードは preloadAllImages が担当) */
  src: string;
  /** 自然サイズのまま描画する (width/height指定より優先) */
  naturalSize?: boolean;
}

/** 読み込み済み画像のキャッシュ (src → HTMLImageElement) */
const imageCache = new Map<string, HTMLImageElement>();

/** 使用宣言された画像URLの一覧 (preloadAllImages の対象) */
export const imageRegistry: string[] = [];

const base = createComponent<ImageProps, object>((ctx, props) => {
  const img = imageCache.get(props.src);
  if (!img || !img.complete || !img.naturalWidth) return;

  const useNatural = props.naturalSize ?? (!props.width && !props.height);
  const w = useNatural ? img.naturalWidth : props.width;
  const h = useNatural
    ? (props.height ?? (img.naturalHeight / img.naturalWidth) * w)
    : props.height;

  ctx.drawImage(img, -w / 2, -h / 2, w, h);
});

/**
 * 画像コンポーネント。
 * 画像は事前にプリロードされ、描画は同期で行われます。
 *
 * ```js
 * visual(imageObject, {
 *   src: '/logo.png',
 *   x: '50%', y: '50%',
 *   width: 400,          // 省略時は自然サイズ
 *   effects: [{ type: 'fade-in', duration: 1 }]
 * })
 * ```
 */
export function imageObject(props: ImageProps): RenderFunction {
  // プリロード対象として記録
  if (!imageRegistry.includes(props.src)) imageRegistry.push(props.src);
  return base(props);
}

/** URLから画像を読み込み、キャッシュします */
export function loadImage(src: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(src);
  if (cached?.complete) return Promise.resolve(cached);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      imageCache.set(src, img);
      resolve(img);
    };
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

/** imageRegistry に登録された画像をすべて読み込みます */
export async function preloadAllImages(): Promise<void> {
  await Promise.all(
    imageRegistry.map((src) =>
      loadImage(src).catch((e: unknown) => console.warn('[mudai]', e))
    )
  );
}

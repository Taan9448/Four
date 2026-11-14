// 이펙트 크기 맞추기(2026-11-14 사용자 요청 "이펙트 크기 키워줘"): Codex 이펙트 그림마다 칸을 채운 정도가 다르다
// (잘림을 막으려 다시 그린 그림은 칸의 44~64%만 채운다). 실제로 그려진 크기를 한 번 재서, 칸의 FX_TARGET만큼 보이게 키운다.
import type { SpriteAsset } from '../../src/render/assets';

/** 이펙트가 칸에서 차지해 보일 목표 비율 */
export const FX_TARGET = 0.8;
/** 가장 많이 키우는 배율 */
export const FX_MAX_BOOST = 1.7;

/** 채운 비율(0~1)로 키울 배율: 목표보다 작으면 키우고(최대 FX_MAX_BOOST), 크면 그대로 */
export const boostFor = (fill: number): number => (fill > 0 ? Math.min(FX_MAX_BOOST, Math.max(1, FX_TARGET / fill)) : 1);

const cache = new WeakMap<SpriteAsset, number>();

/** 모든 칸 중 가장 크게 그려진 칸이 칸 너비·높이의 얼마를 채우나(0~1). 못 재면 목표값(키우지 않음) */
export function fillOf(asset: SpriteAsset): number {
  const hit = cache.get(asset);
  if (hit !== undefined) return hit;
  let fill = 0;
  try {
    const { frameW: w, frameH: h } = asset.meta;
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const c = cv.getContext('2d', { willReadFrequently: true });
    for (const img of asset.images) {
      if (!c || !img) continue;
      c.clearRect(0, 0, w, h);
      c.drawImage(img as CanvasImageSource, 0, 0, w, h);
      const px = c.getImageData(0, 0, w, h).data;
      let minX = w,
        minY = h,
        maxX = -1,
        maxY = -1;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++)
          if (px[(y * w + x) * 4 + 3] > 60) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
      if (maxX >= 0) fill = Math.max(fill, (maxX - minX + 1) / w, (maxY - minY + 1) / h);
    }
  } catch {
    fill = 0;
  }
  const v = fill || FX_TARGET;
  cache.set(asset, v);
  return v;
}

/** 이 이펙트를 키울 배율 */
export const fxBoost = (asset: SpriteAsset): number => boostFor(fillOf(asset));

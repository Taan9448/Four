// 시트 이미지 처리 도우미(sharp 기반).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { CHROMA } from './specs.mjs';

export async function loadRaw(input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

export function fileHash(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 16);
}

/**
 * 시트를 규정 캔버스로 맞춘다. 비율이 같으면 리사이즈하고, 다르면 실패한다(왜곡 금지).
 * @returns {{ raw, resized: boolean, original: [number, number], error?: string }}
 */
export async function prepareSheet(path, spec) {
  const meta = await sharp(path).metadata();
  const [cw, ch] = spec.canvas;
  const original = [meta.width, meta.height];
  const ratio = meta.width / meta.height;
  const expected = cw / ch;
  if (Math.abs(ratio - expected) / expected > 0.01) {
    return { raw: null, resized: false, original, error: `시트 비율 ${meta.width}×${meta.height}이(가) 규정 ${cw}×${ch}와 다르다(왜곡 리사이즈 금지)` };
  }
  if (meta.width === cw && meta.height === ch) return { raw: await loadRaw(path), resized: false, original };
  const buf = await sharp(path).resize(cw, ch, { fit: 'fill', kernel: 'lanczos3' }).png().toBuffer();
  return { raw: await loadRaw(buf), resized: true, original };
}

/** 칸 번호(1부터)의 좌표 */
export function cellRect(spec, n) {
  const [cols] = spec.grid;
  const [w, h] = spec.cell;
  const i = n - 1;
  return { x: (i % cols) * w, y: Math.floor(i / cols) * h, w, h };
}

export function extract(raw, { x, y, w, h }) {
  const out = Buffer.alloc(w * h * 4);
  for (let row = 0; row < h; row++) {
    const src = ((y + row) * raw.width + x) * 4;
    raw.data.copy(out, row * w * 4, src, src + w * 4);
  }
  return { data: out, width: w, height: h };
}

const dist = (r, g, b, key) => Math.hypot(r - key[0], g - key[1], b - key[2]);

/** 크로마키 제거 + 가장자리 색 번짐 제거(despill). chroma가 black/none이면 그대로 둔다. */
export function keyOut(cell, spec) {
  const key = CHROMA[spec.chroma];
  if (!key || spec.chroma === 'black') return cell;
  const tol = spec.chroma_tolerance;
  const soft = tol * 2.2;
  const out = Buffer.from(cell.data);
  for (let i = 0; i < out.length; i += 4) {
    const r = out[i], g = out[i + 1], b = out[i + 2];
    const d = dist(r, g, b, key.rgb);
    if (d < tol) {
      out[i + 3] = 0;
    } else if (d < soft) {
      out[i + 3] = Math.round(((d - tol) / (soft - tol)) * out[i + 3]);
      if (spec.chroma === 'magenta') {
        const spill = Math.min(r, b) - g;
        if (spill > 0) { out[i] = r - spill; out[i + 2] = b - spill; }
      } else if (spec.chroma === 'green') {
        const spill = g - Math.max(r, b);
        if (spill > 0) out[i + 1] = g - spill;
      }
    }
  }
  return { data: out, width: cell.width, height: cell.height };
}

/** 그림이 있는 픽셀인가 */
export function isContentFn(spec) {
  if (spec.chroma === 'black') return (d, i) => d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114 > 24;
  if (spec.chroma === 'none') return () => true;
  return (d, i) => d[i + 3] > 32;
}

export function bbox(img, isContent) {
  let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1, count = 0;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4;
      if (isContent(img.data, i)) {
        count++;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (count === 0) return null;
  return { minX, minY, maxX, maxY, count, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** 키 색처럼 보이는 픽셀인가(채도 높은 마젠타/초록) */
function keyLike(chroma, r, g, b) {
  if (chroma === 'magenta') return Math.min(r, b) - g > 100;
  if (chroma === 'green') return g - Math.max(r, b) > 100;
  return false;
}

/** 불투명 픽셀 중 키 색이 남은 픽셀 비율 */
export function keyResidual(img, spec) {
  if (!CHROMA[spec.chroma] || spec.chroma === 'black') return 0;
  let opaque = 0, residual = 0;
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3] < 128) continue;
    opaque++;
    if (keyLike(spec.chroma, img.data[i], img.data[i + 1], img.data[i + 2])) residual++;
  }
  return opaque ? residual / opaque : 0;
}

export const toPng = (img) =>
  sharp(img.data, { raw: { width: img.width, height: img.height, channels: 4 } }).png().toBuffer();

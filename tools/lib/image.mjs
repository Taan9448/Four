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
  // 픽셀 갈래: 정수배가 아닌 리사이즈는 픽셀 격자를 망가뜨리므로 원본 그대로 쓴다(블록 크기는 자동 감지)
  if (spec.track === 'pixel') return { raw: await loadRaw(path), resized: false, offSize: true, original };
  const buf = await sharp(path).resize(cw, ch, { fit: 'fill', kernel: 'lanczos3' }).png().toBuffer();
  return { raw: await loadRaw(buf), resized: true, original };
}

/** 칸 번호(1부터)의 좌표. raw를 주면 실제 이미지 크기에 비례해 계산한다 */
export function cellRect(spec, n, raw) {
  const [cols, rows] = spec.grid;
  const w = (raw ? raw.width : spec.canvas[0]) / cols;
  const h = (raw ? raw.height : spec.canvas[1]) / rows;
  const i = n - 1;
  const x = Math.round((i % cols) * w);
  const y = Math.round(Math.floor(i / cols) * h);
  return { x, y, w: Math.round(((i % cols) + 1) * w) - x, h: Math.round((Math.floor(i / cols) + 1) * h) - y };
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

/**
 * 크로마키 제거 + 가장자리 색 번짐 제거(despill). chroma가 black/none이면 그대로 둔다.
 * 일러스트(반신 그림)는 키 색이 짜임·머리카락 틈으로 스며 불투명한 안쪽 픽셀에도 남는다.
 * 마젠타 키를 쓰는 인물에는 마젠타 계열 색을 쓰지 않으므로(ART_STYLE) 안쪽 픽셀의 마젠타 기운도 걷어 낸다.
 */
export function keyOut(cell, spec) {
  const key = CHROMA[spec.chroma];
  if (!key || spec.chroma === 'black') return cell;
  const tol = spec.chroma_tolerance;
  const soft = tol * 2.2;
  const innerDespill = spec.chroma === 'magenta' && spec.track === 'illustration';
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
    } else if (innerDespill && out[i + 3] > 0) {
      // 빨강·파랑이 모두 초록보다 높으면(보라~분홍 기운) 그만큼 뺀다. 빨강(파랑 낮음)·피부(초록 높음)는 그대로
      const spill = Math.min(r, b) - g;
      if (spill > 0) { out[i] = r - spill; out[i + 2] = b - spill; }
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

/** 사람 눈에 가까운 RGB 거리(redmean) */
function colorDist(r1, g1, b1, r2, g2, b2) {
  const rm = (r1 + r2) / 2;
  const dr = r1 - r2, dg = g1 - g2, db = b1 - b2;
  return (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
}

/** sRGB → OKLab [L, a, b] */
export function oklab(r, g, b) {
  const lin = (c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** 무채색에 가까운 원본 색의 기준(OKLab 채도) */
const NEUTRAL_SOURCE = 0.02;
const grayFamilyCache = new WeakMap();
/**
 * 팔레트의 회색 계열: 무채색(채도 < 0.015)이거나, 채도가 낮고(< 0.045) 따뜻하지 않은(OKLab b ≤ 0.005) 색.
 * 마스터 팔레트에서는 #0b0b10·#1d2433·#2b2b3a·#3d4459·#5d6478·#8a90a3·#c2c6d1·#f1efe6
 */
function grayFamily(palette) {
  let fam = grayFamilyCache.get(palette);
  if (!fam) {
    fam = palette.filter(([r, g, b]) => {
      const [, A, B] = oklab(r, g, b);
      const c = Math.hypot(A, B);
      return c < 0.015 || (c < 0.045 && B <= 0.005);
    });
    grayFamilyCache.set(palette, fam);
  }
  return fam;
}

/**
 * 팔레트에서 가장 가까운 색(redmean). 무채색에 가까운 원본(숯빛 겉옷 같은 중간 회색)은 회색 계열 안에서만 고른다.
 * 팔레트에 그 밝기의 중립 회색이 없으면 살짝 따뜻한 회색이 갈색으로 붙어 옷에 갈색 얼룩이 생기기 때문(haun_attack).
 */
export function nearestColor(palette, r, g, b) {
  const [, A, B] = oklab(r, g, b);
  if (Math.hypot(A, B) < NEUTRAL_SOURCE) {
    const fam = grayFamily(palette);
    if (fam.length) palette = fam;
  }
  let best = palette[0], bestD = Infinity;
  for (const c of palette) {
    const d = colorDist(r, g, b, c[0], c[1], c[2]);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

/**
 * 확대된 픽셀 아트 칸(키 제거 후)을 논리 해상도로 줄인다.
 * 블록(pixel_scale × pixel_scale)마다 그림 픽셀이 절반 이상이면 불투명, 색은 블록 안에서 가장 많은 색(4비트 묶음 평균),
 * 그다음 팔레트에서 가장 가까운 색으로 맞춘다. 반투명은 남기지 않는다.
 * @returns {{ img, purity: number }} purity: 불투명 블록에서 최빈색이 차지한 평균 비율(격자에 잘 맞을수록 1)
 */
export function pixelize(cell, spec, palette) {
  const s = spec.pixel_scale;
  const [lw, lh] = spec.draw;
  const isContent = isContentFn(spec);
  const out = Buffer.alloc(lw * lh * 4);
  let puritySum = 0, opaqueBlocks = 0;
  for (let ly = 0; ly < lh; ly++) {
    for (let lx = 0; lx < lw; lx++) {
      const buckets = new Map();
      let content = 0;
      for (let y = ly * s; y < (ly + 1) * s; y++) {
        for (let x = lx * s; x < (lx + 1) * s; x++) {
          const i = (y * cell.width + x) * 4;
          if (!isContent(cell.data, i)) continue;
          content++;
          const r = cell.data[i], g = cell.data[i + 1], b = cell.data[i + 2];
          const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
          const e = buckets.get(key);
          if (e) { e.n++; e.r += r; e.g += g; e.b += b; } else buckets.set(key, { n: 1, r, g, b });
        }
      }
      const o = (ly * lw + lx) * 4;
      if (content < (s * s) / 2) continue; // 투명
      let best = null;
      for (const e of buckets.values()) if (!best || e.n > best.n) best = e;
      let rgb = [Math.round(best.r / best.n), Math.round(best.g / best.n), Math.round(best.b / best.n)];
      if (palette) rgb = nearestColor(palette, ...rgb);
      out[o] = rgb[0]; out[o + 1] = rgb[1]; out[o + 2] = rgb[2]; out[o + 3] = 255;
      puritySum += best.n / content;
      opaqueBlocks++;
    }
  }
  return { img: { data: out, width: lw, height: lh }, purity: opaqueBlocks ? puritySum / opaqueBlocks : 1 };
}

/** 논리 해상도 이미지를 정수배로 확대(최근접) */
export function upscale(img, s) {
  const w = img.width * s, h = img.height * s;
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = (Math.floor(y / s) * img.width + Math.floor(x / s)) * 4;
      img.data.copy(out, (y * w + x) * 4, si, si + 4);
    }
  }
  return { data: out, width: w, height: h };
}

export function countColors(img) {
  const set = new Set();
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3] < 128) continue;
    set.add((img.data[i] << 16) | (img.data[i + 1] << 8) | img.data[i + 2]);
  }
  return set.size;
}

export const toPng = (img) =>
  sharp(img.data, { raw: { width: img.width, height: img.height, channels: 4 } }).png().toBuffer();

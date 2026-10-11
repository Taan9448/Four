// 픽셀 갈래 처리: 시트에서 실제 블록 크기를 감지하고, 칸마다 논리 해상도 스프라이트로 바꾼다.
// 이미지 모델은 요청한 블록 크기(예: 8px)를 정확히 지키지 못한다. 그래서 크기를 가정하지 않고 그림에서 잰다.
import { cellRect, extract, isContentFn, keyOut, nearestColor } from './image.mjs';

/**
 * 색이 바뀌는 위치들의 주기를 찾는다(레일리 검정). 진짜 블록 크기 p의 약수(p/2, p/3…)도 점수가 높게 나오므로
 * 최고점의 85% 이상인 후보 중 가장 큰 주기를 고른다. 배수(2p)는 위상이 상쇄돼 점수가 낮다.
 */
function bestPeriod(positions, minP, maxP) {
  if (positions.length < 50) return null;
  const score = (p) => {
    let c = 0, s = 0;
    const k = (2 * Math.PI) / p;
    for (const x of positions) {
      c += Math.cos(k * x);
      s += Math.sin(k * x);
    }
    return { p, r: Math.hypot(c, s) / positions.length, phase: ((Math.atan2(s, c) / (2 * Math.PI)) * p + p) % p };
  };
  const coarse = [];
  for (let p = minP; p <= maxP; p += 0.1) coarse.push(score(p));
  const top = Math.max(...coarse.map((c) => c.r));
  // 약수 주기 대신 가장 큰 주기를 고른다
  const pick = [...coarse].reverse().find((c) => c.r >= top * 0.85);
  let best = pick;
  for (let p = pick.p - 0.15; p <= pick.p + 0.15; p += 0.005) {
    const c = score(p);
    if (c.r > best.r) best = c;
  }
  return best;
}

/** 키 제거된 시트에서 블록 크기와 격자 시작 위치(위상)를 감지한다 */
export function detectGrid(keyed, spec) {
  const isContent = isContentFn(spec);
  const { data, width: W, height: H } = keyed;
  const xs = [], ys = [];
  const diff = (i, j) => Math.abs(data[i] - data[j]) + Math.abs(data[i + 1] - data[j + 1]) + Math.abs(data[i + 2] - data[j + 2]);
  const stepRow = Math.max(1, Math.floor(H / 400));
  for (let y = 0; y < H; y += stepRow) {
    for (let x = 1; x < W; x++) {
      const i = (y * W + x) * 4, j = i - 4;
      const a = isContent(data, i), b = isContent(data, j);
      if (a !== b || (a && b && diff(i, j) > 48)) xs.push(x);
    }
  }
  const stepCol = Math.max(1, Math.floor(W / 400));
  for (let x = 0; x < W; x += stepCol) {
    for (let y = 1; y < H; y++) {
      const i = (y * W + x) * 4, j = i - W * 4;
      const a = isContent(data, i), b = isContent(data, j);
      if (a !== b || (a && b && diff(i, j) > 48)) ys.push(y);
    }
  }
  const thin = (arr) => (arr.length > 30000 ? arr.filter((_, i) => i % Math.ceil(arr.length / 30000) === 0) : arr);
  const cellW = W / spec.grid[0];
  const nominal = (spec.pixel_scale * W) / spec.canvas[0];
  // 칸당 해상도가 목표의 2배(예: 128px)를 넘는 주기는 픽셀 블록이 아니라 흐림·노이즈로 본다
  const minP = Math.max(3, cellW / (spec.draw[0] * 2));
  const maxP = Math.max(minP + 1, cellW / 12);
  const gx = bestPeriod(thin(xs), minP, maxP);
  const gy = bestPeriod(thin(ys), minP, maxP);
  if (!gx || gx.r < 0.35) {
    return { block: nominal, phaseX: 0, phaseY: 0, score: gx?.r ?? 0, detected: false };
  }
  const block = gy && Math.abs(gy.p - gx.p) / gx.p < 0.04 ? (gx.p + gy.p) / 2 : gx.p;
  return { block, phaseX: gx.phase, phaseY: gy ? gy.phase : 0, score: gx.r, detected: true };
}

/** 칸 하나를 감지한 격자로 샘플링해 원래 해상도(native) 이미지로 만든다 */
export function sampleCell(keyed, rect, grid, spec, palette) {
  const isContent = isContentFn(spec);
  const b = grid.block;
  const firstX = Math.ceil((rect.x - grid.phaseX) / b - 0.5);
  const lastX = Math.floor((rect.x + rect.w - grid.phaseX) / b - 0.5);
  const firstY = Math.ceil((rect.y - grid.phaseY) / b - 0.5);
  const lastY = Math.floor((rect.y + rect.h - grid.phaseY) / b - 0.5);
  const nw = lastX - firstX + 1, nh = lastY - firstY + 1;
  const out = Buffer.alloc(nw * nh * 4);
  let puritySum = 0, opaque = 0;
  const inner = 0.2; // 블록 가장자리(흐림)를 피해 안쪽만 본다
  for (let ky = 0; ky < nh; ky++) {
    for (let kx = 0; kx < nw; kx++) {
      const x0 = grid.phaseX + (firstX + kx) * b, y0 = grid.phaseY + (firstY + ky) * b;
      const buckets = new Map();
      let content = 0, total = 0;
      for (let y = Math.round(y0 + b * inner); y < Math.round(y0 + b * (1 - inner)); y++) {
        for (let x = Math.round(x0 + b * inner); x < Math.round(x0 + b * (1 - inner)); x++) {
          if (x < 0 || y < 0 || x >= keyed.width || y >= keyed.height) continue;
          total++;
          const i = (y * keyed.width + x) * 4;
          if (!isContent(keyed.data, i)) continue;
          content++;
          const r = keyed.data[i], g = keyed.data[i + 1], bl = keyed.data[i + 2];
          const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (bl >> 4);
          const e = buckets.get(key);
          if (e) { e.n++; e.r += r; e.g += g; e.b += bl; } else buckets.set(key, { n: 1, r, g, b: bl });
        }
      }
      if (total === 0 || content < total / 2) continue;
      let best = null;
      for (const e of buckets.values()) if (!best || e.n > best.n) best = e;
      let rgb = [Math.round(best.r / best.n), Math.round(best.g / best.n), Math.round(best.b / best.n)];
      if (palette) rgb = nearestColor(palette, ...rgb);
      const o = (ky * nw + kx) * 4;
      out[o] = rgb[0]; out[o + 1] = rgb[1]; out[o + 2] = rgb[2]; out[o + 3] = 255;
      puritySum += best.n / content;
      opaque++;
    }
  }
  return { img: { data: out, width: nw, height: nh }, purity: opaque ? puritySum / opaque : 1 };
}

function contentBox(img) {
  let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    if (img.data[(y * img.width + x) * 4 + 3] > 0) {
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
  }
  return maxX < 0 ? null : { minX, minY, maxX, maxY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function resampleNearest(img, sx, sy) {
  const w = Math.max(1, Math.round(img.width * sx)), h = Math.max(1, Math.round(img.height * sy));
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const si = (Math.min(img.height - 1, Math.floor(y / sy)) * img.width + Math.min(img.width - 1, Math.floor(x / sx))) * 4;
    img.data.copy(out, (y * w + x) * 4, si, si + 4);
  }
  return { data: out, width: w, height: h };
}

/**
 * 원래 해상도 칸을 목표 논리 해상도(spec.logical) 프레임에 맞춘다.
 *  - 같거나 작으면: 그대로 두고 여백만 맞춤(가로 가운데, 기준선 유지) → 'pad'
 *  - 목표의 절반 이하면: 정수배 확대 후 맞춤 → 'upscale'(픽셀이 굵어짐, 경고)
 *  - 크면: 그림이 들어가면 빈 여백만 잘라 맞춤('crop'), 안 들어가면 축소('downscale', 경고)
 */
/** 그림이 프레임 가장자리에 닿지 않게 남기는 최소 여백(논리 px) */
const EDGE = 1;

/**
 * 칸마다 샘플링한 원래 해상도 그림을 목표 프레임(spec.logical)에 담는다.
 * 시트 전체에 같은 배율·같은 세로 위치를 써서 프레임끼리 크기와 발 높이가 흔들리지 않게 한다.
 * - 원래 해상도가 목표의 절반 이하면 정수배 확대(upscale)
 * - 캐릭터: 모든 칸에서 가장 낮은 그림 줄(발)을 기준선 줄에 맞춘다. 그 외(fx 등): 칸 기준선 ↔ 프레임 기준선
 * - 가로는 칸 가운데 ↔ 프레임 가운데(움직임 보존), 가장자리에 닿으면 안쪽으로 민다(crop)
 * - 여백 1px을 두고도 들어가지 않으면 시트 전체를 같은 비율로 줄인다(downscale)
 * - 캐릭터는 시트의 줄(행)마다 가장 낮은 그림 줄을 같은 기준선에 맞춘다. 이미지 모델은 행마다 기준선을 조금씩
 *   다르게 그리기 쉽다(haun_attack: 2행이 3~4px 높아 발이 뜀). 의도적으로 공중에 뜬 행이 있으면 명세에 row_align: false
 * @param {number[]} [rows] 프레임마다 시트에서의 행 번호(0부터). 없으면 모두 같은 행
 */
export function fitFrames(natives, spec, rows = natives.map(() => 0)) {
  const [T, TH] = spec.logical;
  if (spec.type === 'card-frame') return natives.map(fillFrame(T, TH));
  // 카드 그림: 칸을 꽉 채운 그림. 옆 칸이 스며든 가장자리 1px을 덜고 칸 크기에 맞춘다
  if (spec.type === 'card-art-sheet') return natives.map(fillFrame(T, TH, 1));
  const grounded = spec.type === 'character-ref' || spec.type === 'character-anim';
  let imgs = natives;
  let fit = 'pad';
  if (natives.every((n) => n.width <= T / 2 && n.height <= TH / 2)) {
    const k = Math.floor(Math.min(...natives.map((n) => Math.min(T / n.width, TH / n.height))));
    imgs = natives.map((n) => resampleNearest(n, k, k));
    fit = 'upscale';
  } else if (natives.some((n) => n.width > T || n.height > TH)) {
    fit = 'crop';
  }
  let boxes = imgs.map(contentBox);
  const union = (list) => {
    const b = list.filter(Boolean);
    return b.length ? { minY: Math.min(...b.map((x) => x.minY)), maxY: Math.max(...b.map((x) => x.maxY)), w: Math.max(...b.map((x) => x.w)) } : null;
  };
  let u = union(boxes);
  if (u && (u.maxY - u.minY + 1 > TH - 2 * EDGE || u.w > T - 2 * EDGE)) {
    const s = Math.min((TH - 2 * EDGE) / (u.maxY - u.minY + 1), (T - 2 * EDGE) / u.w);
    imgs = imgs.map((img) => resampleNearest(img, s, s));
    boxes = imgs.map(contentBox);
    u = union(boxes);
    fit = 'downscale';
  }
  // 세로 위치: 시트 공통(캐릭터는 시트 행마다 가장 낮은 줄을 기준선에)
  const ground = Math.round(spec.baseline * TH) - 1;
  const perRow = grounded && spec.row_align !== false;
  const offsetFor = (list) => {
    const g = union(list);
    let o;
    if (grounded && g) o = ground - g.maxY;
    else o = Math.round(spec.baseline * TH - spec.baseline * Math.max(...imgs.map((i) => i.height)));
    if (g) o = Math.min(Math.max(o, EDGE - g.minY), TH - 1 - EDGE - g.maxY);
    return o;
  };
  const sheetOy = offsetFor(boxes);
  const rowOy = new Map();
  if (perRow) for (const r of new Set(rows)) rowOy.set(r, offsetFor(boxes.filter((_, i) => rows[i] === r)));
  return imgs.map((img, i) => {
    const box = boxes[i];
    const oy = perRow ? rowOy.get(rows[i]) : sheetOy;
    let ox = Math.round((T - img.width) / 2);
    if (box) ox = Math.min(Math.max(ox, EDGE - box.minX), T - 1 - EDGE - box.maxX);
    const out = Buffer.alloc(T * TH * 4);
    for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
      const tx = x + ox, ty = y + oy;
      if (tx < 0 || ty < 0 || tx >= T || ty >= TH) continue;
      img.data.copy(out, (ty * T + tx) * 4, (y * img.width + x) * 4, (y * img.width + x) * 4 + 4);
    }
    return { img: { data: out, width: T, height: TH }, fit, native: [natives[i].width, natives[i].height] };
  });
}

/**
 * 카드 틀: 틀이 프레임을 꽉 채워야 게임이 이름·글·보석을 제자리에 얹는다. 그림 상자만 잘라 프레임 크기에 꼭 맞게
 * 늘이거나 줄인다(최근접). 모델이 블록을 규격대로 그렸으면 그대로('pad'), 아니면 'fill'(검증이 배율을 알린다)
 */
const fillFrame = (T, TH, inset = 0) => (n) => {
  let box = contentBox(n);
  if (!box) return { img: { data: Buffer.alloc(T * TH * 4), width: T, height: TH }, fit: 'pad', native: [n.width, n.height] };
  if (inset && box.w > inset * 2 + 8 && box.h > inset * 2 + 8) {
    box = { minX: box.minX + inset, minY: box.minY + inset, w: box.w - inset * 2, h: box.h - inset * 2 };
  }
  const crop = { data: Buffer.alloc(box.w * box.h * 4), width: box.w, height: box.h };
  for (let y = 0; y < box.h; y++) n.data.copy(crop.data, y * box.w * 4, ((box.minY + y) * n.width + box.minX) * 4, ((box.minY + y) * n.width + box.minX + box.w) * 4);
  const exact = box.w === T && box.h === TH;
  return { img: exact ? crop : resampleNearest(crop, T / box.w, TH / box.h), fit: exact ? 'pad' : 'fill', native: [box.w, box.h] };
};

/**
 * 카드 그림 시트의 실제 칸 경계(2026-10-11, #866·#869·#872): 이미지 모델은 칸 높이(256px)를 지키지 못하고
 * 그림 줄을 276~290px로 늘이거나(일부 칸만 쓰는 시트) 한 줄을 9px 일찍 시작한다. 칸을 꽉 채운 그림이라 칸 사이에
 * 틈이 없으므로, 그림이 있는 범위를 쓰는 줄 수로 나눈 자리 근처(±20%)에서 그림이 가로·세로로 끊기는 선을 찾는다.
 * 끊김 점수 = 칸 줄(열)마다 위아래(좌우) 픽셀 차이의 평균, 그 중앙값(모든 칸이 같은 선에서 끊겨야 경계).
 * 뚜렷한 선이 없으면 나눈 자리를 그대로 쓴다. 반환: 칸 번호(1부터)의 사각형을 내는 함수
 */
export function tileLayout(keyed, spec) {
  const [C, R] = spec.grid;
  const { data, width: W, height: H } = keyed;
  const isContent = isContentFn(spec);
  const used = Math.max(1, Math.min(R, Math.ceil(spec.frames / C)));
  const px = (x, y) => (y * W + x) * 4;
  const diff = (i, j) => {
    const a = isContent(data, i), b = isContent(data, j);
    if (a !== b) return 300;
    if (!a) return 0;
    return Math.abs(data[i] - data[j]) + Math.abs(data[i + 1] - data[j + 1]) + Math.abs(data[i + 2] - data[j + 2]);
  };
  // 그림이 있는 범위(줄·열의 5% 넘게 그림이 있는 곳)
  const rowHas = (y) => { let c = 0; for (let x = 0; x < W; x += 2) if (isContent(data, px(x, y))) c++; return c / (W / 2) > 0.05; };
  let top = 0, bottom = H;
  while (top < H - 1 && !rowHas(top)) top++;
  while (bottom > top + 1 && !rowHas(bottom - 1)) bottom--;
  const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  /** lo~hi를 n칸으로 나누는 경계들. score(v, k) = k번째 띠에서 v 자리 선의 끊김 */
  // 그림이 캔버스를 다 채웠으면(규격 격자를 따른 시트) 규격 자리 가까이(±6%)만, 줄을 늘여 그린 시트는 넓게(±20%) 찾는다.
  // 그림 안의 지평선·칼날 같은 긴 선을 경계로 잡지 않게, 나눈 자리에서 멀수록 점수를 깎는다
  const cuts = (lo, hi, n, score, full) => {
    const out = [lo];
    const size = (hi - lo) / n;
    for (let k = 1; k < n; k++) {
      const e = Math.round(lo + k * size);
      const span = Math.round(size * (full ? 0.06 : 0.2));
      let best = e, bestS = -1;
      const all = [];
      for (let v = Math.max(lo + 1, e - span); v <= Math.min(hi - 1, e + span); v++) {
        const raw = score(v);
        all.push(raw);
        const s = raw * (1 - (0.5 * Math.abs(v - e)) / Math.max(1, span));
        if (s > bestS) { bestS = s; best = v; }
      }
      out.push(all.length && bestS > median(all) * 1.8 ? best : e);
    }
    out.push(hi);
    return out;
  };
  // 가로 경계: 열 띠(명목 칸 너비)마다 위아래 차이 → 중앙값
  const colBands = Array.from({ length: C }, (_, c) => [Math.round((c * W) / C), Math.round(((c + 1) * W) / C)]);
  const fullH = top < H * 0.02 && bottom > H * 0.98 && used === R;
  const ys = cuts(top, bottom, used, (y) =>
    median(colBands.map(([x0, x1]) => { let s = 0, n = 0; for (let x = x0 + 4; x < x1 - 4; x += 2) { s += diff(px(x, y), px(x, y - 1)); n++; } return s / n; })),
  fullH);
  // 세로 경계: 찾은 줄 띠마다 좌우 차이 → 중앙값(그림이 있는 띠만)
  const rowBands = ys.slice(0, -1).map((y0, r) => [y0, ys[r + 1]]);
  const xs = cuts(0, W, C, (x) =>
    median(rowBands.map(([y0, y1]) => { let s = 0, n = 0; for (let y = y0 + 4; y < y1 - 4; y += 2) { s += diff(px(x, y), px(x - 1, y)); n++; } return n ? s / n : 0; })),
  true);
  const restH = (H - bottom) / Math.max(1, R - used);
  return (n) => {
    const col = (n - 1) % C, row = Math.floor((n - 1) / C);
    const x = xs[col], w = xs[col + 1] - x;
    if (row < used) return { x, y: ys[row], w, h: ys[row + 1] - ys[row] };
    // 쓰지 않는 줄: 그림 아래 남은 자리를 고르게(빈 칸 검사용)
    const y = Math.round(bottom + (row - used) * restH);
    return { x, y, w, h: Math.max(1, Math.round(bottom + (row - used + 1) * restH) - y) };
  };
}

/** 카드 그림 칸을 프레임 비율(3:2)로 가운데에서 자른다 — 늘어난 줄을 그대로 늘이면 그림이 납작해진다 */
function aspectCrop(rect, [T, TH]) {
  const want = TH / T;
  if (rect.h / rect.w > want) {
    const h = Math.round(rect.w * want);
    return { ...rect, y: rect.y + Math.round((rect.h - h) / 2), h };
  }
  const w = Math.round(rect.h / want);
  return { ...rect, x: rect.x + Math.round((rect.w - w) / 2), w };
}

/** 칸 번호 → 원본 사각형. 카드 그림 시트는 실제 그림 경계로, 그 밖은 규격 격자로 */
export function cellRects(keyed, spec, raw = keyed) {
  if (spec.type !== 'card-art-sheet') return (n) => cellRect(spec, n, raw);
  const at = tileLayout(keyed, spec);
  return (n) => at(n);
}

export function processPixelSheet(raw, spec, palette, cells) {
  const keyed = keyOut(raw, spec);
  const grid = detectGrid(keyed, spec);
  const rectOf = cellRects(keyed, spec, raw);
  const sampled = cells.map((n) => sampleCell(keyed, spec.type === 'card-art-sheet' ? aspectCrop(rectOf(n), spec.logical) : rectOf(n), grid, spec, palette));
  const fitted = fitFrames(sampled.map((s) => s.img), spec, cells.map((n) => Math.floor((n - 1) / spec.grid[0])));
  const frames = cells.map((n, i) => ({ n, img: fitted[i].img, purity: sampled[i].purity, native: fitted[i].native, fit: fitted[i].fit }));
  return { grid, frames, keyed };
}

/** 칸에 그림이 있는지(원본 해상도 기준) */
export function cellHasContent(keyed, spec, n, minRatio = 0.005, rectOf = cellRects(keyed, spec)) {
  const rect = rectOf(n);
  const cell = extract(keyed, rect);
  const isContent = isContentFn(spec);
  let c = 0;
  for (let i = 0; i < cell.data.length; i += 4) if (isContent(cell.data, i)) c++;
  return c >= rect.w * rect.h * minRatio;
}

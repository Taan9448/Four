#!/usr/bin/env node
// 시트 → 프레임 PNG + meta.json
// 사용: npm run assets:slice -- <id> [--fallback 2|3] [--placeholder]
//  - 기본: assets/source/<id>.png → assets/sprites/<id>/
//  - --placeholder: assets/placeholders/<id>/_sheet.png → assets/placeholders/<id>/
//  - --fallback 2: 키 포즈 3장 시트(준비·타격·회복), 게임이 사이를 보간
//  - --fallback 3: 파츠 시트(그림이 있는 칸을 모두 파츠로 자름)
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { bbox, cellRect, columnCenter, extract, fileHash, keyOut, prepareSheet, shiftX, shiftXY, toPng } from './lib/image.mjs';
import { cellHasContent, processPixelSheet } from './lib/pixel.mjs';
import { loadSpec, paths, ROOT } from './lib/specs.mjs';
import { paletteFor } from './lib/style.mjs';
import sharp from 'sharp';

/**
 * @param {object} spec 정규화된 명세
 * @param {{ src: string, outDir: string, fallback?: number, placeholder?: boolean, styleRoot?: string }} opts
 * 칸마다 키 색을 지우고, 논리 해상도(spec.logical)로 줄여 마스터 팔레트에 맞춘 frame_XX.png를 만든다.
 */
export async function sliceSheet(spec, { src, outDir, fallback = 1, placeholder = false, styleRoot = ROOT }) {
  if (!existsSync(src)) throw new Error(`시트 없음: ${src}`);
  const sheet = await prepareSheet(src, spec);
  if (sheet.error) throw new Error(sheet.error);
  mkdirSync(outDir, { recursive: true });
  for (const f of readdirSync(outDir)) if (/^frame_\d+\.png$/.test(f)) rmSync(join(outDir, f));

  const cells = spec.grid[0] * spec.grid[1];
  const illustration = spec.track === 'illustration';
  // 키 색이 있는 일러스트(반신 그림)도 배경을 지운다
  const keyedSheet = illustration && spec.chroma === 'none' ? null : keyOut(sheet.raw, spec);
  let frameCells;
  if (fallback === 2) frameCells = [1, 2, 3];
  else if (fallback === 3) {
    frameCells = [];
    for (let n = 1; n <= cells; n++) if (cellHasContent(keyedSheet, spec, n)) frameCells.push(n);
  } else frameCells = Array.from({ length: spec.frames }, (_, i) => i + 1);

  const fileOf = (i) => join(outDir, `frame_${String(i + 1).padStart(2, '0')}.png`);
  let grid = null, puritySum = 0, natives = [], fits = new Set();
  if (illustration) {
    for (const [i, n] of frameCells.entries()) {
      // 일러스트: 픽셀화 없이 게임용 출력 크기로만 줄인다
      const cell = extract(keyedSheet ?? sheet.raw, cellRect(spec, n, sheet.raw));
      const resized = sharp(cell.data, { raw: { width: cell.width, height: cell.height, channels: 4 } }).resize(spec.logical[0], spec.logical[1], {
        fit: 'fill',
        kernel: 'lanczos3',
      });
      if (spec.type !== 'ui-slices' && spec.type !== 'ui-parts') {
        await resized.png().toFile(fileOf(i));
        continue;
      }
      // 화면 부품은 칸마다 조금씩 다른 자리에 그려져도 게임에서 어긋나지 않게 칸 가운데로 옮긴다.
      // ui-slices(이어 붙이는 막대): 막대 중심을 가로로만 / ui-parts(둥근 부품): 그림 상자의 가운데를 가로·세로로
      const { data, info } = await resized.raw().toBuffer({ resolveWithObject: true });
      let img = { data, width: info.width, height: info.height };
      if (spec.type === 'ui-slices') {
        const c = columnCenter(img);
        if (c !== null) img = shiftX(img, Math.round(info.width / 2 - c));
      } else {
        const box = bbox(img, (d, k) => d[k + 3] > 128);
        if (box) img = shiftXY(img, Math.round(info.width / 2 - (box.minX + box.maxX + 1) / 2), Math.round(info.height / 2 - (box.minY + box.maxY + 1) / 2));
      }
      writeFileSync(fileOf(i), await toPng(img));
    }
  } else {
    // 픽셀: 실제 블록 크기를 감지해 칸마다 샘플링하고 목표 프레임(spec.logical)에 맞춘다
    const result = processPixelSheet(sheet.raw, spec, paletteFor(spec, styleRoot), frameCells);
    grid = result.grid;
    for (const [i, f] of result.frames.entries()) {
      puritySum += f.purity;
      natives.push(f.native);
      fits.add(f.fit);
      writeFileSync(fileOf(i), await toPng(f.img));
    }
  }

  const meta = {
    id: spec.id,
    type: spec.type,
    frameW: spec.logical[0],
    frameH: spec.logical[1],
    track: spec.track,
    /** 감지한 블록 크기(원본 px) — 규정은 pixelScale이지만 모델이 그린 실제 크기를 쓴다 */
    pixelScale: illustration ? null : Number(grid.block.toFixed(3)),
    gridDetected: illustration ? null : grid.detected,
    /** 모델이 그린 원래 해상도(칸당 논리 픽셀)와 목표 프레임에 맞춘 방법 */
    nativeSize: illustration ? null : natives[0] ?? null,
    fit: illustration ? null : [...fits].join(','),
    frames: frameCells.length,
    fps: spec.fps,
    loop: spec.loop,
    anchor: [0.5, spec.baseline],
    events: spec.events,
    blend: spec.blend,
    facing: spec.facing,
    fallbackLevel: fallback,
    /** 대체 단계 2: 게임이 보간해 재생할 프레임 수 */
    virtualFrames: spec.frames,
    sourceHash: fileHash(src),
    placeholder,
    resizedFrom: sheet.resized ? sheet.original : null,
    sourceSize: sheet.original,
    /** 픽셀 격자 일치도(1에 가까울수록 깨끗한 픽셀 아트) */
    gridPurity: illustration ? null : Number((puritySum / frameCells.length).toFixed(3)),
  };
  writeFileSync(join(outDir, 'meta.json'), JSON.stringify(meta, null, 2) + '\n');
  return meta;
}

export async function sliceAsset(id, { root = ROOT, fallback = 1, placeholder = false } = {}) {
  const spec = loadSpec(id, root);
  const p = paths(root);
  const src = placeholder ? p.placeholderSheet(id) : p.source(id);
  const outDir = placeholder ? p.placeholders(id) : p.sprites(id);
  return sliceSheet(spec, { src, outDir, fallback, placeholder });
}

async function main() {
  const args = process.argv.slice(2);
  const id = args.find((a) => !a.startsWith('--') && !/^\d$/.test(a));
  if (!id) {
    console.error('사용: npm run assets:slice -- <id> [--fallback 2|3] [--placeholder]');
    process.exit(2);
  }
  const fi = args.indexOf('--fallback');
  const fallback = fi >= 0 ? Number(args[fi + 1]) : 1;
  if (![1, 2, 3].includes(fallback)) throw new Error('--fallback은 2 또는 3');
  const meta = await sliceAsset(id, { fallback, placeholder: args.includes('--placeholder') });
  const pixelInfo = meta.track === 'pixel' ? `, 블록 ${meta.pixelScale}px · 원래 해상도 ${meta.nativeSize?.join('×')} → ${meta.frameW}×${meta.frameH}(${meta.fit}) · 격자 일치도 ${Math.round(meta.gridPurity * 100)}%` : '';
  console.log(`✔ ${id}: 프레임 ${meta.frames}장 → ${meta.placeholder ? 'assets/placeholders' : 'assets/sprites'}/${id}/ (대체 단계 ${meta.fallbackLevel}${pixelInfo})`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(`✖ ${e.message}`);
    process.exit(1);
  });
}

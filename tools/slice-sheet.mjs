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
import { bbox, cellRect, extract, fileHash, isContentFn, keyOut, pixelize, prepareSheet, toPng } from './lib/image.mjs';
import { loadSpec, paths, ROOT } from './lib/specs.mjs';
import { paletteFor } from './lib/style.mjs';

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
  let frameCells;
  if (fallback === 2) frameCells = [1, 2, 3];
  else if (fallback === 3) {
    const isContent = isContentFn(spec);
    frameCells = [];
    for (let n = 1; n <= cells; n++) {
      if (bbox(keyOut(extract(sheet.raw, cellRect(spec, n)), spec), isContent)) frameCells.push(n);
    }
  } else frameCells = Array.from({ length: spec.frames }, (_, i) => i + 1);

  const palette = paletteFor(spec, styleRoot);
  let puritySum = 0;
  for (const [i, n] of frameCells.entries()) {
    const { img, purity } = pixelize(keyOut(extract(sheet.raw, cellRect(spec, n)), spec), spec, palette);
    puritySum += purity;
    writeFileSync(join(outDir, `frame_${String(i + 1).padStart(2, '0')}.png`), await toPng(img));
  }

  const meta = {
    id: spec.id,
    type: spec.type,
    frameW: spec.logical[0],
    frameH: spec.logical[1],
    /** 시트에서 논리 픽셀 1개의 크기 */
    pixelScale: spec.pixel_scale,
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
    /** 픽셀 격자 일치도(1에 가까울수록 깨끗한 픽셀 아트) */
    gridPurity: Number((puritySum / frameCells.length).toFixed(3)),
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
  console.log(`✔ ${id}: 프레임 ${meta.frames}장 → ${meta.placeholder ? 'assets/placeholders' : 'assets/sprites'}/${id}/ (대체 단계 ${meta.fallbackLevel}${meta.resizedFrom ? `, ${meta.resizedFrom.join('×')}에서 리사이즈` : ''})`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(`✖ ${e.message}`);
    process.exit(1);
  });
}

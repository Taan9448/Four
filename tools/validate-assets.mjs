#!/usr/bin/env node
// 에셋 규격 검증. CI에서도 실행된다.
// 사용: npm run assets:validate -- [id ...] [--placeholder] [--all]
//  - id 없이 실행하거나 --all: 명세 모양 검사 + 납품된 스프라이트와 임시 시트 전부
//  - 통과하면 _contact.png(번호 붙은 콘택트 시트)와 _preview.gif를 결과 폴더에 남긴다.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as gifencModule from 'gifenc';
import sharp from 'sharp';
import { bbox, countColors, keyOut, keyResidual, loadRaw, prepareSheet } from './lib/image.mjs';
import { cellHasContent, processPixelSheet } from './lib/pixel.mjs';
import { checkSpecShape, listSpecIds, loadSpec, PADDING, paths, ROOT } from './lib/specs.mjs';
import { paletteFor } from './lib/style.mjs';

// gifenc는 CommonJS라 실행 환경(node/vitest)에 따라 default 아래에 있을 수 있다
const gifenc = gifencModule.GIFEncoder ? gifencModule : gifencModule.default;
const { GIFEncoder, quantize, applyPalette } = gifenc;

/**
 * @param {object} spec 정규화된 명세
 * @param {{ src: string, outDir: string, previews?: boolean, root?: string }} opts
 * @returns {Promise<{ errors: string[], warnings: string[] }>}
 */
export async function validateSheet(spec, { src, outDir, previews = true, root = ROOT, styleRoot = ROOT }) {
  const errors = [...checkSpecShape(spec, root).map((e) => `명세: ${e}`)];
  const warnings = [];
  if (!existsSync(src)) return { errors: [...errors, `원본 시트 없음: ${src}`], warnings };

  // 1) 캔버스
  const sheet = await prepareSheet(src, spec);
  if (sheet.error) return { errors: [...errors, sheet.error], warnings };
  if (sheet.resized) warnings.push(`시트 크기 ${sheet.original.join('×')} → ${spec.canvas.join('×')}로 리사이즈해 검사`);
  if (sheet.offSize) warnings.push(`시트 크기 ${sheet.original.join('×')}(규정 ${spec.canvas.join('×')}) — 리사이즈 없이 블록 크기를 감지해 처리`);

  // 2) meta.json
  const metaPath = join(outDir, 'meta.json');
  if (!existsSync(metaPath)) return { errors: [...errors, `meta.json 없음: 먼저 assets:slice를 실행`], warnings };
  const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
  const fallback = meta.fallbackLevel ?? 1;
  const expectFrames = fallback === 2 ? 3 : fallback === 3 ? meta.frames : spec.frames;
  for (const [k, v] of [['id', spec.id], ['frameW', spec.logical[0]], ['frameH', spec.logical[1]], ['fps', spec.fps], ['loop', spec.loop]]) {
    if (meta[k] !== v) errors.push(`meta.${k}(${meta[k]})이(가) 명세(${v})와 다르다`);
  }
  if (meta.frames !== expectFrames) errors.push(`meta.frames(${meta.frames})가 기대값(${expectFrames})과 다르다`);
  if (JSON.stringify(meta.events) !== JSON.stringify(spec.events)) errors.push('meta.events가 명세와 다르다');

  // 3) 칸별 내용: 1~frames는 그림이 있고, 그 뒤는 비어 있어야 한다
  const illustration = spec.track === 'illustration';
  const keyed = keyOut(sheet.raw, spec);
  const cells = spec.grid[0] * spec.grid[1];
  if (fallback !== 3) {
    for (let n = 1; n <= cells; n++) {
      const filled = cellHasContent(keyed, spec, n);
      if (n <= expectFrames && !filled) errors.push(`${n}번 칸이 비어 있다(프레임 수 부족)`);
      if (n > expectFrames && filled) errors.push(`${n}번 칸에 그림이 있다(빈 칸이어야 함)`);
    }
  }

  // 4) 픽셀 격자: 블록 크기를 감지하고, 블록 안이 한 색으로 채워졌는지(흐림·안티에일리어싱·격자 어긋남) 잰다
  const palette = illustration ? null : paletteFor(spec, styleRoot);
  let frameCells = [];
  if (!illustration) {
    if (fallback === 2) frameCells = [1, 2, 3];
    else if (fallback === 3) for (let n = 1; n <= cells; n++) { if (cellHasContent(keyed, spec, n)) frameCells.push(n); }
    else frameCells = Array.from({ length: spec.frames }, (_, i) => i + 1);
  }
  if (frameCells.length) {
    const { grid, frames: analyzed } = processPixelSheet(sheet.raw, spec, palette, frameCells);
    const purity = analyzed.reduce((a, f) => a + f.purity, 0) / analyzed.length;
    const msg = `픽셀 격자 일치도 ${(purity * 100).toFixed(0)}% (감지한 블록 ${grid.block.toFixed(1)}px) — 블록이 고르지 않거나 흐리다(안티에일리어싱·격자 어긋남)`;
    if (!grid.detected) errors.push(`픽셀 격자 일치도: 고른 블록 격자를 찾지 못했다(격자 점수 ${(grid.score * 100).toFixed(0)}%) — 흐리거나 픽셀 아트가 아닌 그림`);
    else if (purity < 0.5) errors.push(msg);
    else if (purity < 0.65) warnings.push(msg);
    const [T, TH] = spec.logical;
    for (const f of analyzed) {
      if (f.fit === 'downscale') warnings.push(`칸 ${f.n}: 모델이 그린 해상도 ${f.native.join('×')}가 목표 ${T}×${TH}보다 커서 줄였다(디테일 손실)`);
      if (f.fit === 'upscale') warnings.push(`칸 ${f.n}: 모델이 그린 해상도 ${f.native.join('×')}가 목표의 절반 이하라 정수배 확대했다(픽셀이 굵어짐)`);
    }
  }

  // 5) 프레임 파일 검사
  const files = existsSync(outDir) ? readdirSync(outDir).filter((f) => /^frame_\d+\.png$/.test(f)).sort() : [];
  if (files.length !== meta.frames) errors.push(`프레임 파일 ${files.length}장, meta.frames ${meta.frames}`);
  const frames = [];
  for (const f of files) frames.push(await loadRaw(join(outDir, f)));

  const heights = [];
  const frameContent = (d, i) => d[i + 3] > 32;
  const paletteSet = palette ? new Set(palette.map(([r, g, b]) => (r << 16) | (g << 8) | b)) : null;
  const checkEdges = !['card-art', 'background', 'portrait'].includes(spec.type);
  frames.forEach((img, i) => {
    const n = i + 1;
    if (img.width !== spec.logical[0] || img.height !== spec.logical[1]) {
      errors.push(`프레임 ${n}: 크기 ${img.width}×${img.height} ≠ ${spec.logical.join('×')}`);
      return;
    }
    if (illustration) return; // 일러스트: 크기만 검사
    const colors = countColors(img);
    if (colors > spec.max_colors) warnings.push(`프레임 ${n}: ${colors}색(권장 ${spec.max_colors}색 이하)`);
    if (paletteSet) {
      for (let p = 0; p < img.data.length; p += 4) {
        if (img.data[p + 3] < 128) continue;
        if (!paletteSet.has((img.data[p] << 16) | (img.data[p + 1] << 8) | img.data[p + 2])) {
          errors.push(`프레임 ${n}: 마스터 팔레트 밖의 색`);
          break;
        }
      }
    }
    const residual = keyResidual(img, spec);
    if (residual > 0.005) errors.push(`프레임 ${n}: 키 색 잔여 픽셀 ${(residual * 100).toFixed(1)}%`);
    const box = bbox(img, frameContent);
    if (!box) return;
    heights.push(box.h);
    if (checkEdges) {
      if (box.minX === 0 || box.minY === 0 || box.maxX === img.width - 1 || box.maxY === img.height - 1) {
        errors.push(`프레임 ${n}: 그림이 칸 경계에 닿았다`);
      } else {
        const px = Math.floor(img.width * PADDING);
        const py = Math.floor(img.height * PADDING);
        if (box.minX < px || box.minY < py || box.maxX > img.width - 1 - px || box.maxY > img.height - 1 - py) {
          warnings.push(`프레임 ${n}: 여백 ${px}px 침범`);
        }
      }
    }
  });

  // 6) 바운딩 박스 높이 편차(대체 단계 1에서만). 1px 흔들림은 허용
  if (spec.bbox_tolerance != null && fallback === 1 && heights.length > 1) {
    const max = Math.max(...heights);
    const dev = Math.max(0, max - Math.min(...heights) - 1) / max;
    if (dev > spec.bbox_tolerance) {
      errors.push(`프레임 간 높이 편차 ${(dev * 100).toFixed(0)}% > 허용 ${(spec.bbox_tolerance * 100).toFixed(0)}%`);
    }
  }

  if (errors.length === 0 && previews && frames.length) {
    await writePreviews(spec, meta, frames, outDir);
  }
  return { errors, warnings };
}

async function writePreviews(spec, meta, frames, outDir) {
  // 픽셀 아트는 정수배·최근접으로 확대해 보여 준다
  const scale = Math.max(1, Math.floor(160 / spec.logical[1]));
  const w = spec.logical[0] * scale;
  const h = spec.logical[1] * scale;
  const dark = spec.chroma === 'black';
  const label = 22;

  const tile = async (img) =>
    sharp(img.data, { raw: { width: img.width, height: img.height, channels: 4 } }).resize(w, h, { kernel: 'nearest' }).png().toBuffer();
  const checker = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><pattern id="c" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="${dark ? '#000' : '#cfcfcf'}"/>${dark ? '' : '<rect width="8" height="8" fill="#efefef"/><rect x="8" y="8" width="8" height="8" fill="#efefef"/>'}</pattern></defs><rect width="${w}" height="${h}" fill="url(#c)"/></svg>`,
  );
  const composites = [];
  for (const [i, img] of frames.entries()) {
    const left = i * (w + 4);
    composites.push({ input: checker, left, top: label });
    composites.push({ input: await tile(img), left, top: label });
    const ev = Object.entries(meta.events).filter(([, f]) => f === i + 1).map(([k]) => k);
    composites.push({
      input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${label}"><text x="4" y="16" font-family="sans-serif" font-size="14" fill="#222">${i + 1}${ev.length ? ` (${ev.join(',')})` : ''}</text></svg>`),
      left,
      top: 0,
    });
  }
  await sharp({ create: { width: frames.length * (w + 4), height: h + label, channels: 4, background: '#ffffff' } })
    .composite(composites)
    .png()
    .toFile(join(outDir, '_contact.png'));

  // 미리보기 GIF: 회색(이펙트는 검정) 배경에 합성
  const gif = GIFEncoder();
  const bg = dark ? [0, 0, 0] : [96, 96, 104];
  for (const img of frames) {
    const { data } = await sharp(img.data, { raw: { width: img.width, height: img.height, channels: 4 } })
      .resize(w, h, { kernel: 'nearest' })
      .flatten({ background: { r: bg[0], g: bg[1], b: bg[2] } })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const palette = quantize(data, 256);
    gif.writeFrame(applyPalette(data, palette), w, h, { palette, delay: Math.round(1000 / meta.fps), repeat: 0 });
  }
  gif.finish();
  writeFileSync(join(outDir, '_preview.gif'), gif.bytes());
}

export async function validateAsset(id, { root = ROOT, placeholder = false, previews = true } = {}) {
  const spec = loadSpec(id, root);
  const p = paths(root);
  return validateSheet(spec, {
    src: placeholder ? p.placeholderSheet(id) : p.source(id),
    outDir: placeholder ? p.placeholders(id) : p.sprites(id),
    previews,
    root,
  });
}

async function main() {
  const args = process.argv.slice(2);
  const ids = args.filter((a) => !a.startsWith('--'));
  const targets = [];
  if (ids.length && !args.includes('--all')) {
    for (const id of ids) targets.push({ id, placeholder: args.includes('--placeholder') });
  } else {
    const p = paths();
    for (const id of listSpecIds()) {
      const shape = checkSpecShape(loadSpec(id));
      if (shape.length) targets.push({ id, shapeErrors: shape });
      if (existsSync(join(p.sprites(id), 'meta.json')) || existsSync(p.source(id))) targets.push({ id, placeholder: false });
      if (existsSync(p.placeholderSheet(id))) targets.push({ id, placeholder: true });
    }
  }
  let failed = 0;
  for (const t of targets) {
    const where = t.placeholder ? '임시' : '납품';
    if (t.shapeErrors) {
      failed++;
      console.log(`✖ ${t.id} [명세]\n${t.shapeErrors.map((e) => `   - ${e}`).join('\n')}`);
      continue;
    }
    const { errors, warnings } = await validateAsset(t.id, { placeholder: t.placeholder });
    if (errors.length) failed++;
    console.log(`${errors.length ? '✖' : '✔'} ${t.id} [${where}]`);
    for (const e of errors) console.log(`   - 오류: ${e}`);
    for (const w of warnings) console.log(`   - 경고: ${w}`);
  }
  console.log(`\n${targets.length}건 검사, 실패 ${failed}건`);
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(`✖ ${e.message}`);
    process.exit(1);
  });
}

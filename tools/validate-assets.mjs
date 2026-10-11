#!/usr/bin/env node
// 에셋 규격 검증. CI에서도 실행된다.
// 사용: npm run assets:validate -- [id ...] [--placeholder] [--all]
//  - id 없이 실행하거나 --all: 명세 모양 검사 + 납품된 스프라이트와 임시 시트 전부
//  - 통과하면 _contact.png(번호 붙은 콘택트 시트)와 _preview.gif를 결과 폴더에 남긴다.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as gifencModule from 'gifenc';
import sharp from 'sharp';
import { bbox, columnCenter, countColors, keyOut, keyResidual, loadRaw, magentaCast, prepareSheet } from './lib/image.mjs';
import { cellHasContent, processPixelSheet } from './lib/pixel.mjs';
import { checkSpecShape, listSpecIds, loadSpec, PADDING, paths, ROOT } from './lib/specs.mjs';
import { paletteFor } from './lib/style.mjs';

// gifenc는 CommonJS라 실행 환경(node/vitest)에 따라 default 아래에 있을 수 있다
const gifenc = gifencModule.GIFEncoder ? gifencModule : gifencModule.default;
const { GIFEncoder, quantize, applyPalette } = gifenc;

/**
 * @param {object} spec 정규화된 명세
 * @param {{ src: string, outDir: string, previews?: boolean, root?: string, staleOk?: boolean, placeholder?: boolean }} opts
 *   placeholder: 임시 그림(도구가 그린 것)이면 일러스트 마젠타 기운 검사를 건너뛴다
 *   staleOk: 명세가 바뀐 뒤 아직 다시 자르지 않은 프레임을 경고로만 둔다(art/* 밖의 브랜치. 그 브랜치는 sprites를 고칠 수 없다)
 * @returns {Promise<{ errors: string[], warnings: string[], stale?: boolean }>}
 */
export async function validateSheet(spec, { src, outDir, previews = true, root = ROOT, styleRoot = ROOT, staleOk = false, placeholder = false }) {
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
  // 명세가 바뀐 뒤(예: 프레임 64→80) 아직 다시 자르지 않은 프레임: 원본 검사(1~4)만 하고 프레임 파일 검사는 건너뛴다
  const stale = meta.frameW !== spec.logical[0] || meta.frameH !== spec.logical[1];
  if (stale) {
    const msg = `옛 규격 ${meta.frameW}×${meta.frameH}로 자른 프레임(명세 ${spec.logical.join('×')}) — art 브랜치에서 assets:slice -- ${spec.id} 재실행 필요`;
    (staleOk ? warnings : errors).push(msg);
  }
  for (const [k, v] of [['id', spec.id], ['fps', spec.fps], ['loop', spec.loop]]) {
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
    // 격자를 못 찾으면 명세 배율(pixel_scale)로 샘플링해 64 격자에 맞춘다. 이미지 모델은 블록 크기를 조금씩 다르게
    // 그리기 쉬워 감지가 실패해도 결과는 쓸 만하다. 다만 이때 일치도는 픽셀 아트와 일러스트를 가르지 못하므로(둘 다 35~50%)
    // 오류로 막지 않고 경고로 남긴다 — 검토자가 콘택트 시트를 눈으로 보고 승인한다(CLAUDE.md 규칙 5)
    if (!grid.detected) warnings.push(`고른 블록 격자를 찾지 못해(격자 점수 ${(grid.score * 100).toFixed(0)}%) 명세 배율 ${grid.block.toFixed(1)}px로 맞춰 잘랐다 — 콘택트 시트로 눈 확인 필요`);
    else if (purity < 0.5) errors.push(msg);
    else if (purity < 0.65) warnings.push(msg);
    const [T, TH] = spec.logical;
    // 배율은 시트 공통이라 한 번만 알린다
    const f = analyzed[0];
    if (f.fit === 'downscale') warnings.push(`모델이 그린 해상도 ${f.native.join('×')}의 그림이 여백 포함 목표 ${T}×${TH}에 들어가지 않아 시트 전체를 줄였다(디테일 손실) — 인물이 칸을 꽉 채웠다`);
    if (f.fit === 'fill' && (Math.abs(f.native[0] / T - 1) > 0.08 || Math.abs(f.native[1] / TH - 1) > 0.08)) {
      warnings.push(`카드 틀을 ${f.native.join('×')}에서 ${T}×${TH}로 늘이거나 줄였다 — 틀이 캔버스를 꽉 채우지 않았거나 블록이 규격과 달랐다`);
    }
    if (f.fit === 'upscale') warnings.push(`모델이 그린 해상도 ${f.native.join('×')}가 목표의 절반 이하라 정수배 확대했다(픽셀이 굵어짐)`);
  }

  if (stale) return { errors, warnings, stale };

  // 5) 프레임 파일 검사
  const files = existsSync(outDir) ? readdirSync(outDir).filter((f) => /^frame_\d+\.png$/.test(f)).sort() : [];
  if (files.length !== meta.frames) errors.push(`프레임 파일 ${files.length}장, meta.frames ${meta.frames}`);
  const frames = [];
  for (const f of files) frames.push(await loadRaw(join(outDir, f)));

  const heights = [];
  const frameContent = (d, i) => d[i + 3] > 32;
  const paletteSet = palette ? new Set(palette.map(([r, g, b]) => (r << 16) | (g << 8) | b)) : null;
  const checkEdges = !['card-art', 'background', 'portrait', 'card-frame'].includes(spec.type);
  frames.forEach((img, i) => {
    const n = i + 1;
    if (img.width !== spec.logical[0] || img.height !== spec.logical[1]) {
      errors.push(`프레임 ${n}: 크기 ${img.width}×${img.height} ≠ ${spec.logical.join('×')}`);
      return;
    }
    if (illustration) {
      // 일러스트: 크기만 검사. 키 색으로 배경을 지우는 유형(반신 그림)은 남은 키 색도 본다
      if (spec.chroma !== 'none') {
        const residual = keyResidual(img, spec);
        if (residual > 0.005) errors.push(`프레임 ${n}: 키 색 잔여 픽셀 ${(residual * 100).toFixed(1)}%`);
        // 임시 그림은 도구가 그린 것이라 건너뛴다
        if (spec.chroma === 'magenta' && !placeholder) {
          const cast = magentaCast(img);
          if (cast > 0.0005) {
            errors.push(`프레임 ${n}: 마젠타 기운 픽셀 ${(cast * 100).toFixed(2)}% — main을 받아 assets:slice로 다시 자르세요`);
          }
        }
      }
      return;
    }
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

  // 5-1) 이어 붙이는 조각(ui-slices): 칸마다 막대 중심이 같아야 이음매가 어긋나지 않는다(자르기 도구가 맞춘다)
  if (spec.type === 'ui-slices' && frames.length > 1) {
    const centers = frames.map((img) => columnCenter(img)).filter((c) => c !== null);
    if (centers.length > 1 && Math.max(...centers) - Math.min(...centers) > 1) {
      // 이미 들어온 그림 때문에 모든 PR의 CI가 막히지 않게 경고로 둔다(다시 자르면 사라진다)
      warnings.push(`조각의 가로 중심이 어긋났다(${centers.map((c) => c.toFixed(1)).join(' / ')}px) — main을 받아 assets:slice로 다시 자르세요`);
    }
  }

  // 5-2) 둥근 화면 부품(ui-parts): 상태를 바꿔 끼울 때 튀지 않게 그림 상자의 가운데가 칸 가운데여야 한다(자르기 도구가 맞춘다)
  if (spec.type === 'ui-parts') {
    frames.forEach((img, i) => {
      const box = bbox(img, (d, k) => d[k + 3] > 128);
      if (!box) return;
      const cx = (box.minX + box.maxX + 1) / 2 - img.width / 2;
      const cy = (box.minY + box.maxY + 1) / 2 - img.height / 2;
      if (Math.abs(cx) > 1 || Math.abs(cy) > 1) warnings.push(`프레임 ${i + 1}: 가운데에서 (${cx.toFixed(1)}, ${cy.toFixed(1)})px 벗어났다 — main을 받아 assets:slice로 다시 자르세요`);
    });
  }

  // 5-3) 카드 틀: 그림 창(안쪽 투명 구멍)이 명세의 자리(layout.art)에 있어야 게임이 카드 그림을 맞춰 깐다
  if (spec.type === 'card-frame' && frames.length) {
    const want = spec.layout?.art;
    const win = meta.window;
    if (!win) errors.push('그림 창(틀 안쪽의 투명 구멍)이 없다 — 창 안은 키 색으로 비워야 한다');
    else if (want) {
      const dx = win[0] + win[2] / 2 - (want[0] + want[2] / 2);
      const dy = win[1] + win[3] / 2 - (want[1] + want[3] / 2);
      if (Math.hypot(dx, dy) > 6) warnings.push(`그림 창 가운데가 명세 자리에서 (${dx.toFixed(0)}, ${dy.toFixed(0)})px 벗어났다`);
      if (Math.abs(win[2] / want[2] - 1) > 0.2 || Math.abs(win[3] / want[3] - 1) > 0.2) {
        warnings.push(`그림 창 크기 ${win[2]}×${win[3]}(명세 ${want[2]}×${want[3]})`);
      }
    }
  }

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

export async function validateAsset(id, { root = ROOT, placeholder = false, previews = true, staleOk = false } = {}) {
  const spec = loadSpec(id, root);
  const p = paths(root);
  return validateSheet(spec, {
    src: placeholder ? p.placeholderSheet(id) : p.source(id),
    outDir: placeholder ? p.placeholders(id) : p.sprites(id),
    previews,
    root,
    staleOk,
    placeholder,
  });
}

/** art/<이슈번호>-<id> 브랜치가 맡은 에셋 id(형식이 다르면 null) */
export function artBranchAsset(branch) {
  const m = /^art\/\d+-(.+)$/.exec(branch);
  return m ? m[1] : null;
}

/** 지금 검사하는 브랜치(CI는 PR 머리 브랜치) */
function currentBranch() {
  if (process.env.GITHUB_HEAD_REF) return process.env.GITHUB_HEAD_REF;
  if (process.env.GITHUB_REF_NAME) return process.env.GITHUB_REF_NAME;
  try {
    return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
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
  // 옛 규격 프레임: art/<이슈>-<id> 브랜치는 **그 브랜치의 에셋**만 다시 잘라야 통과. 다른 에셋까지 실패로 두면
  // 아직 다시 그리지 않은 에셋(예: 하운) 하나 때문에 모든 아트 PR의 CI가 막힌다. 그 밖의 브랜치는 sprites를 고칠 수 없으니 경고만
  const branch = currentBranch();
  const artBranch = branch.startsWith('art/');
  const branchAsset = artBranchAsset(branch);
  const staleOkFor = (id) => !(artBranch && id === branchAsset);
  // 콘택트 시트·GIF는 art 브랜치에서만 새로 쓴다(다른 브랜치가 sprites를 건드려 소유권 검사에 걸리지 않게). 임시 시트는 늘 쓴다
  const previewsFor = (t) => t.placeholder || artBranch;
  let failed = 0;
  for (const t of targets) {
    const where = t.placeholder ? '임시' : '납품';
    if (t.shapeErrors) {
      failed++;
      console.log(`✖ ${t.id} [명세]\n${t.shapeErrors.map((e) => `   - ${e}`).join('\n')}`);
      continue;
    }
    const { errors, warnings } = await validateAsset(t.id, { placeholder: t.placeholder, staleOk: staleOkFor(t.id), previews: previewsFor(t) });
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

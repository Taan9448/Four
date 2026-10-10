// 에셋 파이프라인 도구 시험: 자르기 → 검증이 정상 시트는 통과시키고, 규격 위반 시트는 실패시키는지.
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildManifest } from '../tools/build-manifest.mjs';
import { checkOwnership } from '../tools/check-ownership.mjs';
import { renderSheet } from '../tools/make-placeholder.mjs';
import { loadPromptData, promptFor, renderPrompt } from '../tools/render-prompt.mjs';
import { sliceSheet } from '../tools/slice-sheet.mjs';
import { columnCenter, dropEdgeSlivers, keyOut, magentaCast, nearestColor, shiftX, shiftXY } from '../tools/lib/image.mjs';
import { checkSpecShape, listSpecIds, loadSpec, paths, ROOT } from '../tools/lib/specs.mjs';
import { loadStyleData } from '../tools/lib/style.mjs';
import { artBranchAsset, validateAsset, validateSheet } from '../tools/validate-assets.mjs';
import { webpIllustrations } from '../tools/vite-webp.mjs';

const FIXTURES = join(ROOT, 'tools/__fixtures__/specs');
let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cg-assets-'));
  mkdirSync(join(root, 'specs/assets'), { recursive: true });
  for (const f of ['fixture_attack.yaml', 'fixture_card.yaml']) copyFileSync(join(FIXTURES, f), join(root, 'specs/assets', f));
});

async function prepare(id: string, opts: { skipCells?: number[]; extraCells?: number[] } = {}, fallback = 1) {
  const spec = loadSpec(id, root);
  const p = paths(root);
  mkdirSync(join(root, 'assets/source'), { recursive: true });
  writeFileSync(p.source(id), await renderSheet(spec, opts));
  await sliceSheet(spec, { src: p.source(id), outDir: p.sprites(id), fallback });
  return { spec, p };
}

/** 8px 블록으로 그린 사각 인물(외곽선 + 채움) 5칸 시트. top·rows는 칸 안 블록 줄 */
async function blockFigureSheet(top: number, rows: number, B = 8, topFor: (n: number) => number = () => top) {
  const W = 1536, H = 1024, cols = 3, half = Math.floor(48 / B);
  const buf = Buffer.alloc(W * H * 4);
  const put = (x: number, y: number, [r, g, b]: number[]) => { const i = (y * W + x) * 4; buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = 255; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) put(x, y, [255, 0, 255]);
  for (let n = 0; n < 5; n++) {
    const cx = (n % cols) * 512, cy = Math.floor(n / cols) * 512;
    const mid = Math.floor(512 / B / 2);
    const t = topFor(n + 1);
    for (let by = t; by < t + rows; by++) for (let bx = mid - half; bx < mid + half; bx++) {
      const edge = by === t || by === t + rows - 1 || bx === mid - half || bx === mid + half - 1;
      // 안쪽은 바둑판 무늬: 블록 경계마다 색이 바뀌어야 블록 크기를 하나로 감지한다
      const c = edge ? [0x1d, 0x24, 0x33] : (bx + by) % 2 ? [0x3d, 0x44, 0x59] : [0x5d, 0x64, 0x78];
      for (let y = 0; y < B; y++) for (let x = 0; x < B; x++) put(cx + bx * B + x, cy + by * B + y, c);
    }
  }
  return sharp(buf, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
}

describe('자르기 → 검증', () => {
  it('규격대로 그린 시트는 통과하고, 콘택트 시트와 미리보기 GIF를 남긴다', async () => {
    const { p } = await prepare('fixture_attack');
    const r = await validateAsset('fixture_attack', { root });
    expect(r.errors).toEqual([]);
    expect(existsSync(join(p.sprites('fixture_attack'), '_contact.png'))).toBe(true);
    expect(existsSync(join(p.sprites('fixture_attack'), '_preview.gif'))).toBe(true);
    const meta = JSON.parse(readFileSync(join(p.sprites('fixture_attack'), 'meta.json'), 'utf8'));
    expect(meta).toMatchObject({ frameW: 80, frameH: 80, pixelScale: 8, nativeSize: [64, 64], frames: 5, fps: 12, loop: false, events: { hit: 4 }, anchor: [0.5, 0.9], fallbackLevel: 1 });
    expect(meta.gridPurity).toBeGreaterThan(0.95);
  });

  it('프레임 수가 모자란 시트는 실패한다', async () => {
    await prepare('fixture_attack', { skipCells: [4, 5] });
    const r = await validateAsset('fixture_attack', { root, previews: false });
    expect(r.errors).toContain('4번 칸이 비어 있다(프레임 수 부족)');
    expect(r.errors).toContain('5번 칸이 비어 있다(프레임 수 부족)');
  });

  it('빈 칸이어야 할 곳에 그림이 있으면 실패한다', async () => {
    await prepare('fixture_attack', { extraCells: [6] });
    const r = await validateAsset('fixture_attack', { root, previews: false });
    expect(r.errors).toContain('6번 칸에 그림이 있다(빈 칸이어야 함)');
  });

  it('비율이 다른 시트는 자르지도, 통과하지도 못한다(왜곡 리사이즈 금지)', async () => {
    const spec = loadSpec('fixture_attack', root);
    const p = paths(root);
    mkdirSync(join(root, 'assets/source'), { recursive: true });
    const square = await sharp(await renderSheet(spec)).resize(1024, 1024, { fit: 'fill' }).png().toBuffer();
    writeFileSync(p.source('fixture_attack'), square);
    await expect(sliceSheet(spec, { src: p.source('fixture_attack'), outDir: p.sprites('fixture_attack') })).rejects.toThrow(/비율/);
    const r = await validateSheet(spec, { src: p.source('fixture_attack'), outDir: p.sprites('fixture_attack'), root, previews: false });
    expect(r.errors.some((e) => e.includes('비율'))).toBe(true);
  });

  it('크기가 정수배가 아니어도(예: 1254px처럼) 블록 크기를 감지해 원본 그대로 자른다', async () => {
    // PR #10 상황 재현: 모델이 규정과 다른 크기로 그리면 블록이 8px이 아닌 소수 크기가 된다
    const spec = loadSpec('fixture_attack', root);
    const p = paths(root);
    mkdirSync(join(root, 'assets/source'), { recursive: true });
    writeFileSync(p.source('fixture_attack'), await sharp(await renderSheet(spec)).resize(1881, 1254, { kernel: 'nearest' }).png().toBuffer());
    const meta = await sliceSheet(spec, { src: p.source('fixture_attack'), outDir: p.sprites('fixture_attack') });
    expect(meta.sourceSize).toEqual([1881, 1254]);
    expect(meta.resizedFrom).toBeNull();
    expect(meta.pixelScale).toBeCloseTo(8 * (1881 / 1536), 0);
    expect(meta.frameW).toBe(80);
    expect(meta.gridPurity).toBeGreaterThan(0.85);
    const r = await validateAsset('fixture_attack', { root, previews: false });
    expect(r.errors).toEqual([]);
    expect(r.warnings.some((w) => w.includes('블록 크기를 감지'))).toBe(true);
  });

  it('모델이 더 굵은 블록(낮은 해상도)으로 그려도 원래 해상도 그대로 80 프레임에 담는다', async () => {
    const spec = loadSpec('fixture_attack', root);
    const p = paths(root);
    mkdirSync(join(root, 'assets/source'), { recursive: true });
    // 64px 대신 48px 해상도(블록 약 10.7px)로 그린 시트를 흉내: 칸당 48px로 줄였다가 최근접으로 다시 키운다
    const small = await sharp(await renderSheet(spec)).resize(144, 96, { kernel: 'nearest' }).png().toBuffer();
    writeFileSync(p.source('fixture_attack'), await sharp(small).resize(1536, 1024, { kernel: 'nearest' }).png().toBuffer());
    const meta = await sliceSheet(spec, { src: p.source('fixture_attack'), outDir: p.sprites('fixture_attack') });
    expect(meta.nativeSize[0]).toBeGreaterThanOrEqual(46);
    expect(meta.nativeSize[0]).toBeLessThanOrEqual(50);
    expect(meta.fit).toBe('pad');
    expect(meta.frameW).toBe(80);
  });

  it('인물이 칸을 꽉 채워도(PR #10) 80 프레임에 줄이지 않고 담는다', async () => {
    const spec = loadSpec('fixture_attack', root);
    const p = paths(root);
    mkdirSync(join(root, 'assets/source'), { recursive: true });
    writeFileSync(p.source('fixture_attack'), await blockFigureSheet(0, 64));
    const meta = await sliceSheet(spec, { src: p.source('fixture_attack'), outDir: p.sprites('fixture_attack') });
    expect(meta.fit).toBe('pad');
    const r = await validateAsset('fixture_attack', { root, previews: false });
    expect(r.errors).toEqual([]);
  });

  it('모델이 더 잘게(칸당 80px 넘게) 그려 프레임에 안 들어가면 시트 전체를 같은 비율로 줄인다', async () => {
    const spec = loadSpec('fixture_attack', root);
    const p = paths(root);
    mkdirSync(join(root, 'assets/source'), { recursive: true });
    // 블록 6px → 칸당 약 85px, 인물 84줄
    writeFileSync(p.source('fixture_attack'), await blockFigureSheet(0, 84, 6));
    const meta = await sliceSheet(spec, { src: p.source('fixture_attack'), outDir: p.sprites('fixture_attack') });
    expect(meta.fit).toBe('downscale');
    const r = await validateAsset('fixture_attack', { root, previews: false });
    expect(r.errors).toEqual([]);
    expect(r.warnings.some((w) => w.includes('시트 전체를 줄였다'))).toBe(true);
  });

  it('시트 2행을 더 높게 그려도(모델의 행별 기준선 어긋남) 모든 프레임의 발이 같은 줄에 온다', async () => {
    const spec = loadSpec('fixture_attack', root);
    const p = paths(root);
    mkdirSync(join(root, 'assets/source'), { recursive: true });
    // 1행(칸 1~3)은 블록 줄 10부터, 2행(칸 4~5)은 4블록 높게
    writeFileSync(p.source('fixture_attack'), await blockFigureSheet(10, 40, 8, (n) => (n <= 3 ? 10 : 6)));
    await sliceSheet(spec, { src: p.source('fixture_attack'), outDir: p.sprites('fixture_attack') });
    const feet = [];
    for (let n = 1; n <= 5; n++) {
      const { data, info } = await sharp(join(p.sprites('fixture_attack'), `frame_0${n}.png`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      let maxY = -1;
      for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) if (data[(y * info.width + x) * 4 + 3] > 0) maxY = y;
      feet.push(maxY + 1);
    }
    expect(feet).toEqual([72, 72, 72, 72, 72]);
  });

  it('명세가 바뀐 뒤 다시 자르지 않은 프레임은 art 브랜치에선 실패, 그 밖에선 경고', async () => {
    const { p } = await prepare('fixture_attack');
    const metaPath = join(p.sprites('fixture_attack'), 'meta.json');
    const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
    meta.frameW = 64;
    meta.frameH = 64;
    writeFileSync(metaPath, JSON.stringify(meta));
    const strict = await validateAsset('fixture_attack', { root, previews: false });
    expect(strict.errors.some((e) => e.includes('재실행 필요'))).toBe(true);
    const lenient = await validateAsset('fixture_attack', { root, previews: false, staleOk: true });
    expect(lenient.errors).toEqual([]);
    expect(lenient.warnings.some((w) => w.includes('재실행 필요'))).toBe(true);
  });

  it('캐릭터는 칸 안 어디에 그렸든 발(가장 낮은 줄)을 기준선 줄 72에 맞춘다', async () => {
    const spec = loadSpec('fixture_attack', root);
    const p = paths(root);
    mkdirSync(join(root, 'assets/source'), { recursive: true });
    writeFileSync(p.source('fixture_attack'), await blockFigureSheet(2, 40));
    const meta = await sliceSheet(spec, { src: p.source('fixture_attack'), outDir: p.sprites('fixture_attack') });
    expect(meta.fit).toBe('pad');
    const { data, info } = await sharp(join(p.sprites('fixture_attack'), 'frame_01.png')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let minY = Infinity, maxY = -1;
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] > 0) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    }
    expect(maxY + 1).toBe(72);
    expect(maxY - minY + 1).toBe(40);
  });

  it('meta.json이 명세와 다르면 실패한다', async () => {
    const { p } = await prepare('fixture_attack');
    const metaPath = join(p.sprites('fixture_attack'), 'meta.json');
    const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
    meta.fps = 24;
    writeFileSync(metaPath, JSON.stringify(meta));
    const r = await validateAsset('fixture_attack', { root, previews: false });
    expect(r.errors.some((e) => e.startsWith('meta.fps'))).toBe(true);
  });

  // 흐린 시트는 격자 감지가 실패한다 → 막지는 않고 "눈 확인 필요" 경고(일치도로는 일러스트와 가를 수 없다, 2026-10-07)
  const flagged = (r: { errors: string[]; warnings: string[] }) =>
    [...r.errors, ...r.warnings].some((e) => e.includes('픽셀 격자 일치도') || e.includes('눈 확인 필요'));

  it('흐릿하거나 격자에 맞지 않는 시트는 경고(눈 확인 필요) 또는 일치도로 걸린다', async () => {
    const spec = loadSpec('fixture_attack', root);
    const p = paths(root);
    mkdirSync(join(root, 'assets/source'), { recursive: true });
    writeFileSync(p.source('fixture_attack'), await sharp(await renderSheet(spec)).blur(6).png().toBuffer());
    await sliceSheet(spec, { src: p.source('fixture_attack'), outDir: p.sprites('fixture_attack') });
    const r = await validateAsset('fixture_attack', { root, previews: false });
    expect(flagged(r)).toBe(true);
  });

  it('대체 단계 3(파츠)에서도 격자 일치도를 검사한다(PR #10에서 발견된 누락)', async () => {
    const spec = loadSpec('fixture_attack', root);
    const p = paths(root);
    mkdirSync(join(root, 'assets/source'), { recursive: true });
    writeFileSync(p.source('fixture_attack'), await sharp(await renderSheet(spec)).blur(6).png().toBuffer());
    await sliceSheet(spec, { src: p.source('fixture_attack'), outDir: p.sprites('fixture_attack'), fallback: 3 });
    const r = await validateAsset('fixture_attack', { root, previews: false });
    expect(flagged(r)).toBe(true);
  });

  it('프레임은 게임 프레임 크기(80×80)이고 마스터 팔레트 밖의 색이 있으면 실패한다', async () => {
    const { p } = await prepare('fixture_attack');
    const frame = join(p.sprites('fixture_attack'), 'frame_01.png');
    expect(await sharp(frame).metadata()).toMatchObject({ width: 80, height: 80 });
    const { data, info } = await sharp(frame).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 128) {
        data[i] = 123; data[i + 1] = 45; data[i + 2] = 67; // 팔레트에 없는 색
        break;
      }
    }
    writeFileSync(frame, await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer());
    const r = await validateAsset('fixture_attack', { root, previews: false });
    expect(r.errors).toContain('프레임 1: 마스터 팔레트 밖의 색');
  });

  it('대체 단계 2: 키 포즈 3장만 있으면 통과하고 meta에 기록된다', async () => {
    const { p } = await prepare('fixture_attack', { skipCells: [4, 5] }, 2);
    const meta = JSON.parse(readFileSync(join(p.sprites('fixture_attack'), 'meta.json'), 'utf8'));
    expect(meta).toMatchObject({ frames: 3, fallbackLevel: 2, virtualFrames: 5 });
    const r = await validateAsset('fixture_attack', { root, previews: false });
    expect(r.errors).toEqual([]);
  });

  it('일러스트 갈래(card-art)는 픽셀화하지 않고 출력 크기로만 줄인다', async () => {
    const { p } = await prepare('fixture_card');
    const meta = JSON.parse(readFileSync(join(p.sprites('fixture_card'), 'meta.json'), 'utf8'));
    expect(meta).toMatchObject({ track: 'illustration', frameW: 512, frameH: 768, frames: 1, pixelScale: null });
    expect(await sharp(join(p.sprites('fixture_card'), 'frame_01.png')).metadata()).toMatchObject({ width: 512, height: 768 });
    const r = await validateAsset('fixture_card', { root, previews: false });
    expect(r.errors).toEqual([]);
    const prompt = renderPrompt(loadSpec('fixture_card', root), loadPromptData());
    expect(prompt).toContain('hand-drawn 2D animated feature film look');
    expect(prompt).not.toContain('PIXEL GRID');
  });

  it('반신 그림(character-standing)은 마젠타 배경을 지운 512×1024 표정 3장으로 자른다', async () => {
    const spec = loadSpec('haun_stand');
    const p = paths(root);
    mkdirSync(join(root, 'assets/source'), { recursive: true });
    writeFileSync(p.source('haun_stand'), await renderSheet(spec));
    const meta = await sliceSheet(spec, { src: p.source('haun_stand'), outDir: p.sprites('haun_stand') });
    expect(meta).toMatchObject({ frames: 3, frameW: 512, frameH: 1024, track: 'illustration' });
    const { data, info } = await sharp(join(p.sprites('haun_stand'), 'frame_02.png')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([512, 1024]);
    expect(data[3]).toBe(0); // 왼쪽 위 구석(배경)은 투명
    const mid = ((info.height / 2) * info.width + info.width / 2) * 4;
    expect(data[mid + 3]).toBe(255); // 몸통은 불투명
  });

  it('manifest는 실제 스프라이트를 임시 시트보다 우선한다', async () => {
    await prepare('fixture_attack');
    const p = paths(root);
    mkdirSync(p.placeholders('fixture_attack'), { recursive: true });
    writeFileSync(join(p.placeholders('fixture_attack'), 'meta.json'), '{"placeholder":true}');
    copyFileSync(join(FIXTURES, 'fixture_attack.yaml'), join(root, 'specs/assets', 'fixture_other.yaml'));
    writeFileSync(join(root, 'specs/assets', 'fixture_other.yaml'), readFileSync(join(root, 'specs/assets', 'fixture_other.yaml'), 'utf8').replace('id: fixture_attack', 'id: fixture_other'));
    mkdirSync(p.placeholders('fixture_other'), { recursive: true });
    writeFileSync(join(p.placeholders('fixture_other'), 'meta.json'), '{"placeholder":true}');
    const m = buildManifest(root);
    expect(m.assets.fixture_attack.source).toBe('sprites');
    expect(m.assets.fixture_other.source).toBe('placeholders');
  });
});

describe('저장소의 실제 명세와 임시 시트', () => {
  it('모든 명세가 규칙에 맞다', () => {
    const errors = listSpecIds().flatMap((id) => checkSpecShape(loadSpec(id)).map((e) => `${id}: ${e}`));
    expect(errors).toEqual([]);
  });

  // 명세가 300개를 넘어 전부 검사하면 70초쯤 걸린다. 평소에는 규격(유형·크기·키 색·프레임 수)마다 대표 한 건만,
  // CI(FULL_ASSETS=1)에서는 전부 검사한다
  it('임시 시트가 검증을 통과한다(파이프라인 자체 시험)', async () => {
    const full = process.env.FULL_ASSETS === '1';
    const seen = new Set<string>();
    for (const id of listSpecIds()) {
      if (!existsSync(paths().placeholderSheet(id))) continue;
      const spec = loadSpec(id);
      const kind = `${spec.type}|${spec.size}|${spec.chroma}|${spec.frames}`;
      if (!full && seen.has(kind)) continue;
      seen.add(kind);
      const r = await validateAsset(id, { placeholder: true, previews: false });
      expect(r.errors, id).toEqual([]);
    }
    expect(seen.size).toBeGreaterThan(10);
  }, 180_000);

  it('완성 프롬프트에 캔버스·격자·프레임 메모·빈 칸·키 색이 들어간다', () => {
    const text = promptFor('haun_attack');
    expect(text).toContain('Canvas: 1536x1024 px. Grid: 3 columns x 2 rows.');
    expect(text).toContain('128x128 pixel-art sprite scaled up exactly 4x');
    expect(text).toContain('SAME size on ONE straight grid');
    expect(text).toContain('axe');
    expect(text).toContain('#1d2433');
    expect(text).toContain('Cell 4: downward chop');
        expect(text).toContain('#FF00FF');
    expect(text).toContain('Match the attached reference sheet');
    const fx = promptFor('fx_slash_blue');
    expect(fx).toContain('#000000');
    expect(fx).toContain('glowing visual effect');
    expect(fx).not.toContain('no soft glow');
  });

  it('화면 그림(2026-10-08): 아이콘 시트·지역 지도·여정 띠·전투 배경 프롬프트', () => {
    const icons = promptFor('icons_status');
    expect(icons).toContain('Grid: 4 columns x 4 rows');
    expect(icons).toContain('64x64 pixel-art sprite scaled up exactly 4x');
    expect(icons).toContain('Cells 13 to 16 are completely empty magenta');
    expect(icons).not.toContain('128x128');
    const map = promptFor('map_s1');
    expect(map).toContain('1536x1024');
    expect(map).toContain('from left to right');
    expect(map).toContain('ink-wash map');
    expect(map).toContain('Composition:');
    expect(map).not.toContain('animated feature film');
    expect(promptFor('journey_band')).toContain('Do not draw any crack');
    expect(promptFor('bg_rift')).toContain('ground line (where feet stand) at about 62%');
  });
});

describe('팔레트 맞춤', () => {
  const palette = (loadStyleData() as { palette: string[] }).palette.map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
  const hex = (c: number[]) => `#${c.map((x) => x.toString(16).padStart(2, '0')).join('')}`;
  it('무채색에 가까운 회색(숯빛 겉옷)은 갈색이 아니라 회색 계열로 붙는다', () => {
    expect(hex(nearestColor(palette, 64, 56, 56))).toBe('#2b2b3a');
    expect(hex(nearestColor(palette, 40, 32, 32))).toBe('#1d2433');
  });
  it('채도가 있는 색(나무 손잡이·피부)은 그대로 가장 가까운 색', () => {
    expect(hex(nearestColor(palette, 110, 84, 64))).toBe('#6e5440');
    expect(hex(nearestColor(palette, 242, 200, 160))).toBe('#f2c8a0');
  });
});

describe('폴더 소유권 검사', () => {
  it('art/* 브랜치는 assets/source·sprites만 바꿀 수 있다', () => {
    expect(checkOwnership('art/12-haun_idle', ['assets/source/haun_idle.png', 'assets/sprites/haun_idle/meta.json'])).toEqual([]);
    expect(checkOwnership('art/12-haun_idle', ['specs/assets/haun_idle.yaml']).length).toBe(1);
    expect(checkOwnership('art/12-haun_idle', ['src/main.ts']).length).toBe(1);
    expect(checkOwnership('art/12-haun_idle', ['assets/placeholders/haun_idle/meta.json']).length).toBe(1);
  });

  it('그 밖의 브랜치는 assets/source·sprites를 바꿀 수 없다', () => {
    expect(checkOwnership('feat/battle', ['src/main.ts', 'assets/placeholders/x/meta.json'])).toEqual([]);
    expect(checkOwnership('claude/setup', ['assets/source/haun_ref.png']).length).toBe(1);
    expect(checkOwnership('feat/x', ['assets/sprites/haun_ref/meta.json']).length).toBe(1);
  });

  it('옛 규격 프레임 검사는 art 브랜치가 맡은 에셋에만 실패로 건다(브랜치 이름에서 id)', () => {
    expect(artBranchAsset('art/99-kwak_dojin_attack')).toBe('kwak_dojin_attack');
    expect(artBranchAsset('art/122-reslice_128')).toBe('reslice_128');
    expect(artBranchAsset('feat/ui')).toBeNull();
  });

  it('manifest.json은 누구도 커밋할 수 없고, art 브랜치 이름은 형식을 지켜야 한다', () => {
    expect(checkOwnership('feat/x', ['assets/manifest.json']).length).toBe(1);
    expect(checkOwnership('art/haun', ['assets/source/haun_ref.png']).length).toBe(1);
    // 다시 그리기 브랜치
    expect(checkOwnership('art/464-veilak_idle-fix', ['assets/source/veilak_idle.png'])).toEqual([]);
    expect(checkOwnership('art/464-veilak_idle-fix-2', ['assets/source/veilak_idle.png'])).toEqual([]);
    expect(checkOwnership('art/464-veilak_idle-redo', ['assets/source/veilak_idle.png']).length).toBe(1);
  });
});

describe('키 색 번짐 제거(keyOut)', () => {
  const px = (...rgba: number[][]) => ({ data: Buffer.from(rgba.flat()), width: rgba.length, height: 1 });
  const base = { chroma: 'magenta', chroma_tolerance: 60 };

  it('일러스트: 안쪽 불투명 픽셀의 마젠타 기운을 걷어 내고, 빨강·피부·키 색은 각자대로', () => {
    const out = keyOut(px([90, 40, 100, 255], [160, 20, 30, 255], [230, 200, 190, 255], [255, 0, 255, 255]), { ...base, track: 'illustration' });
    expect([...out.data.subarray(0, 4)]).toEqual([40, 40, 50, 255]); // 보라 기운 → 중성
    expect([...out.data.subarray(4, 8)]).toEqual([150, 20, 20, 255]); // 빨강은 빨강
    expect([...out.data.subarray(8, 12)]).toEqual([230, 200, 190, 255]); // 피부 그대로
    expect(out.data[15]).toBe(0); // 키 색은 투명
  });

  it('magentaCast: 남은 마젠타 기운 비율(검증기가 옛 도구로 자른 일러스트를 잡는다)', () => {
    const img = px([90, 40, 100, 255], [40, 40, 50, 255], [160, 20, 30, 255], [255, 0, 255, 0]);
    expect(magentaCast(img)).toBeCloseTo(1 / 3); // 투명 픽셀은 세지 않는다
    expect(magentaCast(keyOut(img, { ...base, track: 'illustration' }))).toBe(0);
  });

  it('픽셀 트랙: 뚜렷한 마젠타 기운만 걷어 내고, 팔레트의 보라(#4b3a6b)는 그대로 둔다', () => {
    const out = keyOut(px([90, 40, 100, 255], [0x4b, 0x3a, 0x6b, 255]), { ...base, track: 'pixel' });
    expect([...out.data.subarray(0, 4)]).toEqual([40, 40, 50, 255]); // 늑대 불꽃 끝의 붉은 점이 되던 픽셀
    expect([...out.data.subarray(4, 8)]).toEqual([0x4b, 0x3a, 0x6b, 255]);
  });
});


describe('이어 붙이는 조각(ui-slices) 가운데 맞추기', () => {
  /** 너비 w·높이 h 투명 그림에 x0~x1 세로 막대(일부 줄은 넓은 손잡이) */
  const rod = (w: number, h: number, x0: number, x1: number, knobRows = 0) => {
    const data = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
      const [a, b] = y < knobRows ? [x0 - 6, x1 + 2] : [x0, x1];
      for (let x = a; x <= b; x++) data[(y * w + x) * 4 + 3] = 255;
    }
    return { data, width: w, height: h };
  };

  it('손잡이가 있어도 막대 본체의 중심을 잡는다', () => {
    expect(columnCenter(rod(64, 40, 20, 29))).toBe(25);
    expect(columnCenter(rod(64, 40, 20, 29, 10))).toBe(25);
    expect(columnCenter({ data: Buffer.alloc(16 * 16 * 4), width: 16, height: 16 })).toBeNull();
  });

  it('옮기면 칸 가운데에 온다', () => {
    const img = rod(64, 20, 36, 45);
    const moved = shiftX(img, Math.round(32 - columnCenter(img)!));
    expect(columnCenter(moved)).toBe(32);
  });

  it('둥근 부품은 가로·세로로 함께 옮긴다', () => {
    const img = rod(16, 16, 2, 5);
    const moved = shiftXY(img, 3, 2);
    // 왼쪽 위 점(2, 0)이 (5, 2)로
    expect(moved.data[(2 * 16 + 5) * 4 + 3]).toBe(255);
    expect(moved.data[(0 * 16 + 2) * 4 + 3]).toBe(0);
    expect(moved.data[(1 * 16 + 5) * 4 + 3]).toBe(0);
  });
});

describe('반신 그림: 옆 칸에서 넘어온 조각 지우기', () => {
  it('가장자리에 닿은 작은 덩어리만 지우고, 인물과 떨어진 안쪽 머리카락 끝은 남긴다', () => {
    const W = 40;
    const H = 30;
    const data = Buffer.alloc(W * H * 4);
    const fill = (x0: number, x1: number, y0: number, y1: number) => {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) data[(y * W + x) * 4 + 3] = 255;
    };
    fill(10, 29, 2, 29); // 인물(가장 큰 덩어리, 아래 가장자리에 닿아도 된다)
    fill(37, 39, 5, 12); // 오른쪽 가장자리에 붙은 옆 칸 조각
    fill(3, 5, 4, 6); // 인물과 떨어졌지만 가장자리에 닿지 않는 머리카락 끝
    const img = { data, width: W, height: H };
    expect(dropEdgeSlivers(img)).toBe(3 * 8);
    expect(data[(8 * W + 38) * 4 + 3]).toBe(0);
    expect(data[(5 * W + 4) * 4 + 3]).toBe(255);
    expect(data[(10 * W + 20) * 4 + 3]).toBe(255);
  });
});

describe('배포본 WebP 변환(vite-webp)', () => {
  it('일러스트만 WebP로 내보내고, 픽셀 아트는 그대로, 실제 그림이 있는 임시 시트는 뺀다', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'webp-'));
    const asset = (source: string, id: string, type: string) => ({ source, dir: `assets/${source}/${id}`, meta: { id, type } });
    mkdirSync(join(dir, 'assets/sprites/cg_x'), { recursive: true });
    writeFileSync(
      join(dir, 'assets/manifest.json'),
      JSON.stringify({ assets: { cg_x: asset('sprites', 'cg_x', 'story-cg'), px: asset('sprites', 'px', 'character-anim'), ph: asset('placeholders', 'ph', 'character-anim') } }),
    );
    const png = join(dir, 'assets/sprites/cg_x/frame_01.png');
    await sharp({ create: { width: 64, height: 48, channels: 4, background: { r: 200, g: 120, b: 40, alpha: 0.5 } } }).png().toFile(png);
    const plugin = webpIllustrations({ root: dir });
    plugin.buildStart();
    const emitted: { name: string; source: Buffer }[] = [];
    const ctx = { emitFile: (f: { name: string; source: Buffer }) => (emitted.push(f), 'REF1') };
    expect(await plugin.load.call(ctx, `${png}?url`)).toBe('export default import.meta.ROLLUP_FILE_URL_REF1;');
    expect(emitted[0].name).toBe('cg_x_frame_01.webp');
    const meta = await sharp(emitted[0].source).metadata();
    expect([meta.format, meta.width, meta.hasAlpha]).toEqual(['webp', 64, true]);
    // 픽셀 아트 · 아직 임시 시트인 에셋은 손대지 않는다(Vite 기본 처리)
    expect(await plugin.load.call(ctx, join(dir, 'assets/sprites/px/frame_01.png?url'))).toBeNull();
    expect(await plugin.load.call(ctx, join(dir, 'assets/placeholders/ph/frame_01.png?url'))).toBeNull();
    // 실제 그림이 들어온 에셋의 임시 시트는 배포본에서 뺀다
    expect(await plugin.load.call(ctx, join(dir, 'assets/placeholders/cg_x/frame_01.png?url'))).toBe('export default "";');
  });
});

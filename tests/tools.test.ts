// 에셋 파이프라인 도구 시험: 자르기 → 검증이 정상 시트는 통과시키고, 규격 위반 시트는 실패시키는지.
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildManifest } from '../tools/build-manifest.mjs';
import { checkOwnership } from '../tools/check-ownership.mjs';
import { renderSheet } from '../tools/make-placeholder.mjs';
import { promptFor } from '../tools/render-prompt.mjs';
import { sliceSheet } from '../tools/slice-sheet.mjs';
import { checkSpecShape, listSpecIds, loadSpec, paths, ROOT } from '../tools/lib/specs.mjs';
import { validateAsset, validateSheet } from '../tools/validate-assets.mjs';

const FIXTURES = join(ROOT, 'tools/__fixtures__/specs');
let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cg-assets-'));
  mkdirSync(join(root, 'specs/assets'), { recursive: true });
  for (const f of ['fixture_attack.yaml', 'fixture_purple.yaml']) copyFileSync(join(FIXTURES, f), join(root, 'specs/assets', f));
});

async function prepare(id: string, opts: { skipCells?: number[]; extraCells?: number[] } = {}, fallback = 1) {
  const spec = loadSpec(id, root);
  const p = paths(root);
  mkdirSync(join(root, 'assets/source'), { recursive: true });
  writeFileSync(p.source(id), await renderSheet(spec, opts));
  await sliceSheet(spec, { src: p.source(id), outDir: p.sprites(id), fallback });
  return { spec, p };
}

describe('자르기 → 검증', () => {
  it('규격대로 그린 시트는 통과하고, 콘택트 시트와 미리보기 GIF를 남긴다', async () => {
    const { p } = await prepare('fixture_attack');
    const r = await validateAsset('fixture_attack', { root });
    expect(r.errors).toEqual([]);
    expect(existsSync(join(p.sprites('fixture_attack'), '_contact.png'))).toBe(true);
    expect(existsSync(join(p.sprites('fixture_attack'), '_preview.gif'))).toBe(true);
    const meta = JSON.parse(readFileSync(join(p.sprites('fixture_attack'), 'meta.json'), 'utf8'));
    expect(meta).toMatchObject({ frames: 6, fps: 12, loop: false, events: { hit: 4 }, anchor: [0.5, 0.9], fallbackLevel: 1 });
  });

  it('프레임 수가 모자란 시트는 실패한다', async () => {
    await prepare('fixture_attack', { skipCells: [5, 6] });
    const r = await validateAsset('fixture_attack', { root, previews: false });
    expect(r.errors).toContain('5번 칸이 비어 있다(프레임 수 부족)');
    expect(r.errors).toContain('6번 칸이 비어 있다(프레임 수 부족)');
  });

  it('빈 칸이어야 할 곳에 그림이 있으면 실패한다', async () => {
    await prepare('fixture_attack', { extraCells: [7] });
    const r = await validateAsset('fixture_attack', { root, previews: false });
    expect(r.errors).toContain('7번 칸에 그림이 있다(빈 칸이어야 함)');
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

  it('비율이 같으면 규정 크기로 리사이즈해 통과(경고만)', async () => {
    const spec = loadSpec('fixture_attack', root);
    const p = paths(root);
    mkdirSync(join(root, 'assets/source'), { recursive: true });
    writeFileSync(p.source('fixture_attack'), await sharp(await renderSheet(spec)).resize(1152, 768).png().toBuffer());
    const meta = await sliceSheet(spec, { src: p.source('fixture_attack'), outDir: p.sprites('fixture_attack') });
    expect(meta.resizedFrom).toEqual([1152, 768]);
    const r = await validateAsset('fixture_attack', { root, previews: false });
    expect(r.errors).toEqual([]);
    expect(r.warnings.some((w) => w.includes('리사이즈'))).toBe(true);
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

  it('마젠타 계열 색이 남으면 키 색 잔여로 실패한다', async () => {
    await prepare('fixture_purple');
    const r = await validateAsset('fixture_purple', { root, previews: false });
    expect(r.errors.some((e) => e.includes('키 색 잔여'))).toBe(true);
  });

  it('대체 단계 2: 키 포즈 3장만 있으면 통과하고 meta에 기록된다', async () => {
    const { p } = await prepare('fixture_attack', { skipCells: [4, 5, 6] }, 2);
    const meta = JSON.parse(readFileSync(join(p.sprites('fixture_attack'), 'meta.json'), 'utf8'));
    expect(meta).toMatchObject({ frames: 3, fallbackLevel: 2, virtualFrames: 6 });
    const r = await validateAsset('fixture_attack', { root, previews: false });
    expect(r.errors).toEqual([]);
  });

  it('manifest는 실제 스프라이트를 임시 시트보다 우선한다', async () => {
    await prepare('fixture_attack');
    const p = paths(root);
    mkdirSync(p.placeholders('fixture_attack'), { recursive: true });
    writeFileSync(join(p.placeholders('fixture_attack'), 'meta.json'), '{"placeholder":true}');
    mkdirSync(p.placeholders('fixture_purple'), { recursive: true });
    writeFileSync(join(p.placeholders('fixture_purple'), 'meta.json'), '{"placeholder":true}');
    const m = buildManifest(root);
    expect(m.assets.fixture_attack.source).toBe('sprites');
    expect(m.assets.fixture_purple.source).toBe('placeholders');
  });
});

describe('저장소의 실제 명세와 임시 시트', () => {
  it('모든 명세가 규칙에 맞다', () => {
    const errors = listSpecIds().flatMap((id) => checkSpecShape(loadSpec(id)).map((e) => `${id}: ${e}`));
    expect(errors).toEqual([]);
  });

  it('모든 임시 시트가 검증을 통과한다(파이프라인 자체 시험)', async () => {
    for (const id of listSpecIds()) {
      if (!existsSync(paths().placeholderSheet(id))) continue;
      const r = await validateAsset(id, { placeholder: true, previews: false });
      expect(r.errors, id).toEqual([]);
    }
  });

  it('완성 프롬프트에 캔버스·격자·프레임 메모·빈 칸·키 색이 들어간다', () => {
    const text = promptFor('haun_attack');
    expect(text).toContain('Canvas: 1536x1024 px. Grid: 4 columns x 2 rows.');
    expect(text).toContain('Cell 4: downward cut');
    expect(text).toContain('Cells 7 to 8 are empty magenta.');
    expect(text).toContain('#FF00FF');
    expect(text).toContain('Match the attached reference sheet');
    const fx = promptFor('fx_slash_blue');
    expect(fx).toContain('#000000');
    expect(fx).toContain('additive blending');
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

  it('manifest.json은 누구도 커밋할 수 없고, art 브랜치 이름은 형식을 지켜야 한다', () => {
    expect(checkOwnership('feat/x', ['assets/manifest.json']).length).toBe(1);
    expect(checkOwnership('art/haun', ['assets/source/haun_ref.png']).length).toBe(1);
  });
});

// 에셋 명세(specs/assets/<id>.yaml) 읽기와 기본값 채우기.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

export const ROOT = fileURLToPath(new URL('../..', import.meta.url));

/** 유형별 시트 규격. docs/ASSET_PIPELINE.md 9절과 같아야 한다. */
export const TYPE_DEFAULTS = {
  'character-anim': { canvas: [1536, 1024], grid: [4, 2], chroma: 'magenta', blend: 'normal' },
  'character-ref': { canvas: [1536, 1024], grid: [2, 1], chroma: 'magenta', blend: 'normal', frames: 2, fps: 1, loop: false },
  fx: { canvas: [1024, 1024], grid: [4, 4], chroma: 'black', blend: 'lighter' },
  'card-art': { canvas: [1024, 1536], grid: [1, 1], chroma: 'none', blend: 'normal', frames: 1, fps: 1, loop: false },
  background: { canvas: [1536, 1024], grid: [1, 1], chroma: 'none', blend: 'normal', frames: 1, fps: 1, loop: false },
  portrait: { canvas: [1024, 1024], grid: [1, 1], chroma: 'none', blend: 'normal', frames: 1, fps: 1, loop: false },
};

/** 표준 애니메이션 세트. bbox: 바운딩 박스 높이 허용 편차(null이면 검사 안 함) */
export const ANIM_DEFAULTS = {
  idle: { frames: 4, fps: 6, loop: true, events: {}, bbox: 0.08 },
  attack: { frames: 6, fps: 12, loop: false, events: { hit: 4 }, bbox: 0.2 },
  skill: { frames: 8, fps: 12, loop: false, events: { cast: 5 }, bbox: 0.25 },
  hit: { frames: 3, fps: 12, loop: false, events: {}, bbox: 0.15 },
  death: { frames: 6, fps: 10, loop: false, events: {}, bbox: null },
};

export const CHROMA = {
  magenta: { name: 'magenta', hex: '#FF00FF', rgb: [255, 0, 255] },
  green: { name: 'green', hex: '#00FF00', rgb: [0, 255, 0] },
  black: { name: 'black', hex: '#000000', rgb: [0, 0, 0] },
  none: null,
};

export const PADDING = 0.08;

export const paths = (root = ROOT) => ({
  specs: join(root, 'specs/assets'),
  source: (id) => join(root, 'assets/source', `${id}.png`),
  prompt: (id) => join(root, 'assets/source', `${id}.prompt.txt`),
  sprites: (id) => join(root, 'assets/sprites', id),
  placeholders: (id) => join(root, 'assets/placeholders', id),
  placeholderSheet: (id) => join(root, 'assets/placeholders', id, '_sheet.png'),
  manifest: join(root, 'assets/manifest.json'),
  artStyle: join(root, 'docs/ART_STYLE.md'),
});

export function listSpecIds(root = ROOT) {
  const dir = paths(root).specs;
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.yaml') && !f.startsWith('_'))
    .map((f) => f.replace(/\.yaml$/, ''))
    .sort();
}

export function readSpecFile(file) {
  return normalizeSpec(parse(readFileSync(file, 'utf8')));
}

export function loadSpec(id, root = ROOT) {
  const file = join(paths(root).specs, `${id}.yaml`);
  if (!existsSync(file)) throw new Error(`명세 없음: specs/assets/${id}.yaml`);
  const spec = readSpecFile(file);
  if (spec.id !== id) throw new Error(`명세 id(${spec.id})가 파일 이름(${id})과 다르다`);
  return spec;
}

/** 생략된 값을 유형·애니메이션 기본값으로 채운다. */
export function normalizeSpec(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('명세가 비어 있다');
  const type = raw.type;
  const td = TYPE_DEFAULTS[type];
  if (!td) throw new Error(`${raw.id}: 알 수 없는 type "${type}"`);
  const anim = raw.anim ?? (type === 'character-anim' ? String(raw.id).split('_').pop() : null);
  const ad = type === 'character-anim' ? ANIM_DEFAULTS[anim] ?? {} : {};
  const canvas = raw.canvas ?? td.canvas;
  const grid = raw.grid ?? td.grid;
  const cell = raw.cell ?? [canvas[0] / grid[0], canvas[1] / grid[1]];
  const fxDefaults = type === 'fx' ? { fps: 15, loop: false } : {};
  const frames = raw.frames ?? td.frames ?? ad.frames;
  return {
    ...raw,
    type,
    anim,
    canvas,
    grid,
    cell,
    chroma: raw.chroma ?? td.chroma,
    chroma_tolerance: raw.chroma_tolerance ?? 90,
    blend: raw.blend ?? td.blend,
    frames,
    fps: raw.fps ?? td.fps ?? fxDefaults.fps ?? ad.fps ?? 12,
    loop: raw.loop ?? td.loop ?? fxDefaults.loop ?? ad.loop ?? false,
    events: raw.events ?? (type === 'fx' && frames ? { impact: Math.ceil(frames / 2) } : ad.events ?? {}),
    baseline: raw.baseline ?? 0.9,
    facing: raw.facing ?? 'right',
    bbox_tolerance: raw.bbox_tolerance !== undefined ? raw.bbox_tolerance : type === 'character-anim' ? ad.bbox ?? 0.2 : null,
    depends_on: raw.depends_on ?? [],
    frame_notes: raw.frame_notes ?? {},
    reference: raw.reference ?? null,
  };
}

/** 명세 자체의 규칙 검사(이미지와 무관). */
export function checkSpecShape(spec, root = ROOT) {
  const errors = [];
  const [cw, ch] = spec.canvas;
  const [cols, rows] = spec.grid;
  if (spec.cell[0] * cols !== cw || spec.cell[1] * rows !== ch) {
    errors.push(`cell×grid(${spec.cell[0] * cols}×${spec.cell[1] * rows})가 canvas(${cw}×${ch})와 다르다`);
  }
  if (!Number.isInteger(spec.frames) || spec.frames < 1) errors.push('frames가 없다');
  if (spec.frames > cols * rows) errors.push(`frames(${spec.frames})가 칸 수(${cols * rows})보다 많다`);
  if (!(spec.chroma in CHROMA)) errors.push(`알 수 없는 chroma "${spec.chroma}"`);
  for (const [name, f] of Object.entries(spec.events)) {
    if (!Number.isInteger(f) || f < 1 || f > spec.frames) errors.push(`이벤트 ${name}: 프레임 ${f}은(는) 1~${spec.frames} 밖`);
  }
  for (const k of Object.keys(spec.frame_notes)) {
    const n = Number(k);
    if (!Number.isInteger(n) || n < 1 || n > spec.frames) errors.push(`frame_notes ${k}: 1~${spec.frames} 밖`);
  }
  if (spec.type === 'character-anim' && Object.keys(spec.frame_notes).length !== spec.frames) {
    errors.push(`frame_notes가 ${spec.frames}개가 아니다`);
  }
  const ids = new Set(listSpecIds(root));
  for (const dep of spec.depends_on) if (!ids.has(dep)) errors.push(`depends_on: 명세 없음 ${dep}`);
  if (spec.type === 'character-anim' && !spec.reference) errors.push('character-anim에는 reference가 필요하다');
  return errors;
}

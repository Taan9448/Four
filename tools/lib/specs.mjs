// 에셋 명세(specs/assets/<id>.yaml) 읽기와 기본값 채우기.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

export const ROOT = fileURLToPath(new URL('../..', import.meta.url));

/**
 * 시트 규격. docs/ASSET_PIPELINE.md 2절과 같아야 한다. 그림은 두 갈래(track)로 나뉜다.
 *  - pixel(전투): 이미지 모델이 큰 캔버스에 "확대된 픽셀 아트"를 그리고, 자르기 도구가 그림의 실제 블록 크기를
 *      자동 감지해 원래 해상도로 되돌린 뒤 게임 프레임(logical)에 담는다. 모든 캐릭터 칸은 512px로 같게 해 모델이 그리는 해상도를 고르게 한다.
 *      draw: 모델에게 요청하는 칸당 그림 격자(정수배), logical: 게임 프레임. 프레임이 그림 격자보다 커서
 *      도끼를 치켜드는 동작이나 칸을 꽉 채운 그림도 줄이지 않고 담는다.
 *      large(기본): 그림 128 → 프레임 160(캐릭터·적·보스·이펙트 모두, 2026-10-07), small: 그림 64 → 프레임 80(옛 규격)
 *  - illustration(이야기): 선이 살아 있는 애니메이션 채색 일러스트 한 장. 픽셀화하지 않고 output 크기로만 줄인다.
 */
const SHEETS = {
  'anim-small': { canvas: [1536, 1024], grid: [3, 2], draw: [64, 64], logical: [80, 80] }, // 칸 512 = 8배, 최대 6프레임
  'anim-large': { canvas: [1536, 1024], grid: [3, 2], draw: [128, 128], logical: [160, 160] }, // 칸 512 = 4배
  'ref-small': { canvas: [1024, 1024], grid: [2, 2], draw: [64, 64], logical: [80, 80] }, // 칸 512 = 8배
  'ref-large': { canvas: [1024, 1024], grid: [2, 2], draw: [128, 128], logical: [160, 160] }, // 칸 512 = 4배
  background: { canvas: [1536, 1024], grid: [1, 1], draw: [384, 256], logical: [384, 256] }, // 4배(전투 배경은 픽셀)
  // 아이콘 시트: 4×4칸에 아이콘 하나씩(최대 16), 칸 256 = 64 격자 × 4배. 화면에서는 24~32px로 줄여 쓴다
  'icon-sheet': { canvas: [1024, 1024], grid: [4, 4], draw: [64, 64], logical: [64, 64] },
};

/** 일러스트 유형: 캔버스와 게임에서 쓸 출력 크기 */
const ILLUSTRATIONS = {
  'card-art': { canvas: [1024, 1536], output: [512, 768] },
  portrait: { canvas: [1024, 1024], output: [512, 512] },
  'story-cg': { canvas: [1536, 1024], output: [1152, 768] },
  'character-sheet': { canvas: [1536, 1024], output: [1536, 1024] },
  // 화면 그림(2026-10-08): 시작 화면·여정 띠(가로 한 장, 줄이지 않음)와 지역 지도(세로 두루마리)
  'key-art': { canvas: [1536, 1024], output: [1536, 1024] },
  'map-art': { canvas: [1536, 1024], output: [1152, 768] }, // 가로(2026-10-08 세로 → 가로): 왼쪽 = 출발, 오른쪽 = 보스
  // 비주얼 노벨·컷인용 반신 그림: 한 시트에 표정 3장(기본·결의·놀람), 배경은 키 색으로 지워 투명하게
  'character-standing': { canvas: [1536, 1024], output: [512, 1024], grid: [3, 1], frames: 3, chroma: 'magenta' },
};

export const ILLUSTRATION_TYPES = Object.keys(ILLUSTRATIONS);

export function typeDefaults(type, size = 'large') {
  const one = { frames: 1, fps: 1, loop: false };
  if (type in ILLUSTRATIONS) {
    const { canvas, output, grid = [1, 1], frames = 1, chroma = 'none' } = ILLUSTRATIONS[type];
    return { canvas, grid, logical: output, track: 'illustration', chroma, blend: 'normal', max_colors: null, ...one, frames };
  }
  switch (type) {
    case 'character-anim':
      return { ...SHEETS[`anim-${size}`], track: 'pixel', chroma: 'magenta', blend: 'normal', max_colors: 16 };
    case 'character-ref':
      return { ...SHEETS[`ref-${size}`], track: 'pixel', chroma: 'magenta', blend: 'normal', max_colors: 16, frames: 2, fps: 1, loop: false };
    case 'fx':
      // 검정 배경은 자를 때 투명으로 바뀌므로 게임에서는 일반 합성으로 겹친다
      return { ...SHEETS[`anim-${size}`], track: 'pixel', chroma: 'black', blend: 'normal', max_colors: 12 };
    case 'background':
      return { ...SHEETS[type], track: 'pixel', chroma: 'none', blend: 'normal', max_colors: 32, ...one };
    case 'icon-sheet':
      return { ...SHEETS[type], track: 'pixel', chroma: 'magenta', blend: 'normal', max_colors: 12, fps: 1, loop: false };
    default:
      return null;
  }
}

/** 표준 애니메이션 세트. bbox: 바운딩 박스 높이 허용 편차(null이면 검사 안 함) */
export const ANIM_DEFAULTS = {
  idle: { frames: 4, fps: 6, loop: true, events: {}, bbox: 0.08 },
  attack: { frames: 6, fps: 12, loop: false, events: { hit: 4 }, bbox: 0.2 },
  skill: { frames: 6, fps: 12, loop: false, events: { cast: 4 }, bbox: 0.25 },
  hit: { frames: 3, fps: 12, loop: false, events: {}, bbox: 0.15 },
  death: { frames: 6, fps: 10, loop: false, events: {}, bbox: null },
};

export const CHROMA = {
  magenta: { name: 'magenta', hex: '#FF00FF', rgb: [255, 0, 255] },
  green: { name: 'green', hex: '#00FF00', rgb: [0, 255, 0] },
  black: { name: 'black', hex: '#000000', rgb: [0, 0, 0] },
  none: null,
};

/** 칸 안쪽 여백 비율(64px 기준 약 5px) */
export const PADDING = 0.08;

/** 하위 호환·문서용: 유형별 기본 규격(small) */
export const TYPE_DEFAULTS = Object.fromEntries(
  ['character-anim', 'character-ref', 'fx', 'background', 'icon-sheet', ...ILLUSTRATION_TYPES].map((t) => [t, typeDefaults(t)]),
);

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
  // 2026-10-07: 전투 픽셀 아트는 모두 128 격자(large)가 기본. small(64 → 80)은 옛 규격으로만 남긴다
  const size = raw.size ?? 'large';
  if (!['small', 'large'].includes(size)) throw new Error(`${raw.id}: size는 small 또는 large`);
  const td = typeDefaults(type, size);
  if (!td) throw new Error(`${raw.id}: 알 수 없는 type "${type}"`);
  const anim = raw.anim ?? (type === 'character-anim' ? String(raw.id).split('_').pop() : null);
  const ad = type === 'character-anim' ? ANIM_DEFAULTS[anim] ?? {} : {};
  const canvas = raw.canvas ?? td.canvas;
  const grid = raw.grid ?? td.grid;
  const cell = raw.cell ?? [canvas[0] / grid[0], canvas[1] / grid[1]];
  const logical = raw.logical ?? td.logical;
  const draw = raw.draw ?? td.draw ?? logical;
  const fxDefaults = type === 'fx' ? { fps: 15, loop: false } : {};
  const frames = raw.frames ?? td.frames ?? ad.frames;
  return {
    ...raw,
    type,
    anim,
    size,
    canvas,
    grid,
    cell,
    /** pixel: 게임 프레임 크기 / illustration: 게임용 출력 크기 */
    logical,
    /** pixel: 모델에게 요청하는 칸당 그림 격자(프롬프트·임시 시트·감지 기준) */
    draw,
    track: td.track,
    /** 그림 픽셀 1개가 시트에서 차지하는 크기(px). 일러스트는 축소 비율 */
    pixel_scale: cell[0] / draw[0],
    palette: raw.palette ?? 'master',
    max_colors: raw.max_colors ?? td.max_colors,
    chroma: raw.chroma ?? td.chroma,
    chroma_tolerance: raw.chroma_tolerance ?? 90,
    blend: raw.blend ?? td.blend,
    frames,
    fps: raw.fps ?? td.fps ?? fxDefaults.fps ?? ad.fps ?? 12,
    loop: raw.loop ?? td.loop ?? fxDefaults.loop ?? ad.loop ?? false,
    events: raw.events ?? (type === 'fx' && frames ? { impact: Math.ceil(frames / 2) } : ad.events ?? {}),
    baseline: raw.baseline ?? 0.9,
    /** 캐릭터: 시트 행마다 가장 낮은 줄을 기준선에 맞춘다(행마다 기준선이 어긋나는 모델 버릇 보정). 공중 동작이면 false */
    row_align: raw.row_align ?? true,
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
  const sx = spec.cell[0] / spec.draw[0];
  const sy = spec.cell[1] / spec.draw[1];
  if (spec.track === 'pixel' && (!Number.isInteger(sx) || sx !== sy)) {
    errors.push(`칸(${spec.cell.join('×')})이 그림 격자(${spec.draw.join('×')})의 같은 정수배가 아니다`);
  }
  if (spec.track === 'pixel' && (spec.logical[0] < spec.draw[0] || spec.logical[1] < spec.draw[1])) {
    errors.push(`프레임(${spec.logical.join('×')})이 그림 격자(${spec.draw.join('×')})보다 작다`);
  }
  if (!['master', 'free'].includes(spec.palette)) errors.push('palette는 master 또는 free');
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

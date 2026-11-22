// 「틈」 그리기(2026-11-18 2차): 지형 판 · 그림자 · 무공 · 예고 원 · 지도(오른쪽 위) · 상태창(아래).
// 그림은 「천외귀환」·「결」 것을 그대로 쓰고, Codex 그림(바닥 타일·지형 조각·소품·아이콘)은 오면 쓰고(realOnly) 오기 전에는 코드로 그린다.
import { cardArtUrl, loadSprite, spriteSource, type SpriteAsset } from '../../src/render/assets';
import { AFFIXES, CHAPTER_LENGTH, STORY, type FoeZone, type Slam, effOn, elementCounts, endlessInfo, exploredShare, FOES, RULES, isExplored, ITEMS, PASSIVES, WEAPONS, stat, xpNeed, type FxEvent, type ItemKind, type State } from './sim';
import { CELL, T } from './terrain';

type Anim = SpriteAsset | null;
export interface Art {
  hero: { idle: Anim; walk: Anim; death: Anim; dirs: Record<string, Anim> };
  foes: Map<string, { idle: Anim; death: Anim; walk?: Anim }>;
  fx: Map<string, Anim>;
  ground: Anim;
  terrain: Anim;
  props: Anim;
  icons: Anim;
  items: Anim;
  /** 2026-11-21 늘린 줍는 것 16칸(icons_teum_items_2) */
  items2: Anim;
  /** 안개 속 표식(비석·제단·상인·샘·저주 상자): icons_teum_world */
  world: Anim;
  skills: Anim[];
  /** 무공 종류별 이펙트(fx_teum_<종류>, 2026-11-21) — 흰색·회색으로 그려져 오고, 무공 색을 입혀 그린다. 오기 전에는 코드로 그린다 */
  kinds: Map<string, SpriteAsset>;
  /** 장소(상인 수레·수련소 정자, 2026-11-22): place_teum_<id> 한 장 그림 + NPC(<npc>_idle) — 오기 전엔 코드로 그린다 */
  places: Map<string, { building: Anim; npc: Anim }>;
  /** 무한 모드 맵 무늬(tex_teum_rift_ground·scar·rock·void: 땅 · 오염된 땅 · 바위 · 허공) */
  tex: Anim[];
  /** 적 탄 그림(fx_teum_shot_<모양>)·새 적 기술 그림(fx_teum_foe_<line·cone·ring·puddle·explode·heal·shield·burrow>) — 온 것만 */
  shots: Map<string, SpriteAsset>;
  foeFx: Map<string, SpriteAsset>;
}

/** 새 그림자(Codex teum_*)는 그림이 오기 전엔 「천외귀환」 그림(fallback) */
const foeSprite = (sprite: string, fallback?: string): string => (fallback && spriteSource(`${sprite}_idle`) !== 'sprites' ? fallback : sprite);
/** 판 도중 처음 나온 그림자(무한 모드는 보스를 넘길 때마다 다른 장 무리가 나온다)의 그림을 그때 불러온다 —
 *  2026-11-22 사용자 "무한 모드 적이 구 형태로 나온다": 장 1 무리만 미리 불러 두어서 다른 장 그림자가 동그라미로 그려졌다 */
export function ensureFoeArt(art: Art, id: string): void {
  if (art.foes.has(id)) return;
  const f = FOES.get(id);
  art.foes.set(id, { idle: null, death: null });
  if (!f) return;
  const sp = foeSprite(f.sprite, f.fallback);
  void Promise.all([loadSprite(`${sp}_idle`), real(`${sp}_death`), real(`${sp}_walk`)]).then(([i, d, w]) => art.foes.set(id, { idle: i, death: d, walk: w })).catch(() => undefined);
}
export interface Options {
  shake: boolean;
  numbers: boolean;
  map: 'small' | 'large';
  /** 내 무공 이펙트 세기(2026-11-21 "이펙트 때문에 적 기술·내 움직임이 안 보인다") */
  fx?: 'strong' | 'normal' | 'soft';
  /** 내 무공 이펙트 불투명도 0.15~1(설정 막대, 2026-11-21) — 있으면 fx보다 먼저 */
  fxAlpha?: number;
  /** 몸 둘레 범위 기술(둘레 돌기·결계·고리·베기·장판·회복) 그림:
   *  clean(기본, 2026-11-21 "원만 보여 밋밋 — 인물은 가리지 말고 범위가 보이게") 가운데가 빈 띠·눈금·날 모양 · simple 얇은 선만 · fancy Codex 그림 */
  areaFx?: 'simple' | 'clean' | 'fancy';
  /** 키 설정(2026-11-22) · 소리 크기(2026-11-22) */
  keys?: Partial<Record<string, [string, string?]>>;
  sound?: { master: number; bgm: number; sfx: number };
}
const FX_ALPHA = { strong: 1, normal: 0.7, soft: 0.42 };

const real = async (id: string): Promise<Anim> => (spriteSource(id) === 'sprites' ? loadSprite(id) : null);

/** 무공·심법 아이콘 칸(icons_teum_skills_1·2·3, 16칸씩): 손으로 맞춘 무공 순서 다음에 심법(카드 무공은 카드 그림) */
export const SKILL_ICON = new Map<string, number>([...[...WEAPONS.values()].filter((w) => !w.card).map((w) => w.id), ...[...PASSIVES.values()].filter((p) => !p.card).map((p) => p.id)].map((id, i) => [id, i]));
/** 카드에서 온 무공·심법의 아이콘: 「천외귀환」 카드 그림(96×64)을 한 번 받아 둔다 */
const cardImg = new Map<string, HTMLImageElement | null>();
export function cardIcon(card: string | undefined): HTMLImageElement | null {
  if (!card) return null;
  if (!cardImg.has(card)) {
    const url = cardArtUrl(card);
    if (!url) cardImg.set(card, null);
    else {
      const img = new Image();
      img.src = url;
      cardImg.set(card, img);
    }
  }
  const img = cardImg.get(card) ?? null;
  return img && img.complete && img.naturalWidth ? img : null;
}

export async function loadArt(s: State, sprite = s.hero.sprite): Promise<Art> {
  const [idle, walk, death] = await Promise.all([loadSprite(`${sprite}_idle`), real(`${sprite}_walk`), real(`${sprite}_death`)]);
  // 8방향(2026-11-22): 정면·뒷면·대각 걷기와 대기 — Codex 그림이 온 것만
  const dirs: Record<string, Anim> = {};
  await Promise.all(['walk_down', 'walk_up', 'walk_downside', 'walk_upside', 'idle_down', 'idle_up'].map(async (k) => (dirs[k] = await real(`${sprite}_${k}`))));
  const foes = new Map<string, { idle: Anim; death: Anim; walk?: Anim }>();
  const ids = new Set<string>([...Object.values(s.chapter.roles).flat(), s.chapter.roles.mid, s.chapter.roles.boss]);
  for (const id of [...ids]) for (const k of FOES.get(id)?.skills ?? []) if (k.kind === 'summon') ids.add(k.foe);
  await Promise.all(
    [...ids].map(async (id) => {
      const f = FOES.get(id);
      if (!f) return;
      const sp = foeSprite(f.sprite, f.fallback);
      const [i, d, w] = await Promise.all([loadSprite(`${sp}_idle`), real(`${sp}_death`), real(`${sp}_walk`)]);
      foes.set(id, { idle: i, death: d, walk: w });
    }),
  );
  const fxIds = new Set<string>();
  for (const w of WEAPONS.values()) if (w.fx) fxIds.add(w.fx), fxIds.add(w.fx.replace(/_a$/, '_b'));
  for (const id of ids) for (const k of FOES.get(id)?.skills ?? []) if ('fx' in k && k.fx) fxIds.add(k.fx);
  fxIds.add(`fx_gyeol_tech_${s.hero.ult.id}_a`);
  fxIds.add(`fx_gyeol_tech_${s.hero.ult.id}_b`);
  const fx = new Map<string, Anim>();
  await Promise.all([...fxIds].map(async (id) => fx.set(id, await real(id))));
  const [ground, terrain, props, icons, items, ...skills] = await Promise.all([real(s.chapter.ground), real(s.chapter.terrain), real('props_teum'), real('icons_teum'), real('icons_teum_items'), real('icons_teum_skills_1'), real('icons_teum_skills_2'), real('icons_teum_skills_3'), real('icons_teum_skills_4')]);
  const items2 = await real('icons_teum_items_2');
  const world = await real('icons_teum_world');
  const kinds = new Map<string, SpriteAsset>();
  await Promise.all(
    KIND_FX.map(async (k) => {
      const a = await real(`fx_teum_${k}`);
      if (a) kinds.set(k, a);
    }),
  );
  const places = new Map<string, { building: Anim; npc: Anim }>();
  await Promise.all(
    [...ITEMS.values()]
      .filter((d) => d.place)
      .map(async (d) => {
        const [building, npc] = await Promise.all([real(`place_teum_${d.id}`), real(`${d.place!.npc}_idle`)]);
        places.set(d.id, { building, npc });
      }),
  );
  const tex = s.chapter.tex ? await Promise.all(['ground', 'scar', 'rock', 'void'].map((k) => real(`${s.chapter.tex}_${k}`))) : [];
  const shots = new Map<string, SpriteAsset>();
  const foeFx = new Map<string, SpriteAsset>();
  await Promise.all([
    ...['arrow', 'flame', 'shard', 'spark', 'bubble', 'shadow', 'bone', 'needle', 'blade'].map(async (k) => {
      const a = await real(`fx_teum_shot_${k}`);
      if (a) shots.set(k, a);
    }),
    ...['line', 'cone', 'ring', 'puddle', 'explode', 'heal', 'shield', 'burrow'].map(async (k) => {
      const a = await real(`fx_teum_foe_${k}`);
      if (a) foeFx.set(k, a);
    }),
  ]);
  const out: Art = { hero: { idle, walk, death, dirs }, foes, fx, ground, terrain, props, icons, items, items2, world, skills, kinds, places, tex, shots, foeFx };
  // 무한 모드: 다른 장 무리도 뒤에서 미리 불러 둔다(기다리지 않는다)
  if (s.mode === 'endless') for (const c of STORY.chapters) for (const id of [...Object.values(c.roles).flat(), c.roles.mid, c.roles.boss]) ensureFoeArt(out, id);
  return out;
}

interface Mark {
  e: FxEvent;
  born: number;
  flip?: boolean;
}
export interface View {
  marks: Mark[];
  banner: { text: string; born: number; kind: string } | null;
  shake: number;
  hurtFlash: number;
  ultFlash: { born: number; fx: string; color: string } | null;
  flash: { born: number; color: string } | null;
  minimap: HTMLCanvasElement | null;
  minimapKnown?: number;
  minimapRev?: number;
  /** 히트스톱: 이때까지 판을 멈춘다(main) */
  stopUntil: number;
  /** 상자 열기 연출(main이 띄운다) */
  chestRoll: { text: string; evolve: boolean } | null;
  /** 읽은 비석(main이 띄운다) */
  stele: { id: string; text: string } | null;
  /** 곧 바뀔 칸 예고 */
  warn: { cells: number[]; at: number } | null;
  counterAt: number;
  /** 타격감(2026-11-22 "아직도 타격감이 부족"): 불티·조각 입자 · 연격(잇달아 쓰러뜨린 수) · 화면 당김(줌 펀치) */
  parts: Part[];
  combo: { n: number; at: number; best: number; pop: number };
  punch: number;
  /** 한 프레임에 쓰러뜨린 수(몰살 흔들림) */
  burstKills: number;
}
interface Part {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
  grav: number;
  kind: 'spark' | 'chunk' | 'soul' | 'ring';
}
export const emptyView = (): View => ({ marks: [], banner: null, shake: 0, hurtFlash: -9, ultFlash: null, flash: null, minimap: null, stopUntil: 0, chestRoll: null, stele: null, warn: null, counterAt: -9, parts: [], combo: { n: 0, at: -9e9, best: 0, pop: -9e9 }, punch: 0, burstKills: 0 });
/** 입자 뿌리기(장식이라 Math.random) */
function spray(v: View, x: number, y: number, n: number, color: string, speed: number, kind: Part['kind'] = 'spark', size = 2.5, grav = 380): void {
  if (v.parts.length > 520) return;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = speed * (0.4 + Math.random() * 0.8);
    v.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - speed * 0.4, life: 0, max: 0.35 + Math.random() * 0.35, color, size: size * (0.6 + Math.random() * 0.8), grav, kind });
  }
}


export function absorb(v: View, s: State, now: number, opt: Options): void {
  for (const e of s.events) {
    if (e.type === 'event') v.banner = { text: e.text, born: now, kind: e.kind };
    else if (e.type === 'chest') {
      v.banner = { text: e.text, born: now, kind: 'chest' };
      v.chestRoll = { text: e.text, evolve: e.text.startsWith('각성') };
    } else if (e.type === 'counter') {
      v.counterAt = now;
      v.stopUntil = now + 90;
      v.flash = { born: now, color: '#ffe08a' };
      v.marks.push({ e, born: now });
    } else if (e.type === 'stele') v.stele = { id: e.id, text: e.text };
    else if (e.type === 'warn') v.warn = { cells: e.cells, at: e.at };
    else if (e.type === 'terrain') {
      v.minimap = null;
      v.warn = null;
    } else if (e.type === 'phase') {
      v.flash = { born: now, color: '#ff5a4a' };
      if (opt.shake) v.shake = 18;
      v.stopUntil = now + 120;
    }
    else if (e.type === 'hurt') {
      v.hurtFlash = now;
      if (opt.shake) v.shake = Math.max(v.shake, 6);
    } else if (e.type === 'ult') {
      v.ultFlash = { born: now, fx: e.fx, color: e.color };
      if (opt.shake) v.shake = 16;
      v.stopUntil = now + 80;
      v.punch = 1;
    } else if (e.type === 'bomb') {
      v.flash = { born: now, color: '#fff2c0' };
      if (opt.shake) v.shake = 18;
    } else if (e.type === 'freeze') v.flash = { born: now, color: '#9fe6ff' };
    else if (e.type === 'item' && e.kind !== 'gold' && e.kind !== 'chest') {
      const d = ITEMS.get(e.kind);
      if (d && !d.place) v.banner = { text: `${d.name} — ${d.desc}`, born: now, kind: 'item' };
    } else if (e.type === 'unlock') {
      v.banner = { text: `비급을 얻었다 — 「${e.name}」가 열렸다`, born: now, kind: 'unlock' };
      v.flash = { born: now, color: '#d4b8ff' };
    }
    else if (e.type === 'hit') {
      if (opt.numbers && (e.crit || e.damage >= 40 || v.marks.length < 120)) v.marks.push({ e, born: now, flip: Math.random() < 0.5 });
      // 맞힌 자리에 불티(치명은 금빛 + 흔들림)
      spray(v, e.x, e.y - 20, e.crit ? 7 : 3, e.crit ? '#ffd27a' : '#fff4e0', e.crit ? 260 : 170);
      if (e.crit && opt.shake) v.shake = Math.max(v.shake, e.damage >= 120 ? 5 : 2.5);
      // 큰 치명타: 짧은 히트스톱
      if (e.crit && e.damage >= 200) v.stopUntil = Math.max(v.stopUntil, now + 45);
    } else if (e.type === 'kill') {
      v.marks.push({ e, born: now, flip: e.x < s.player.x });
      // 쓰러짐: 먹 조각이 튀고 넋(붉은 빛)이 올라간다
      spray(v, e.x, e.y - 18, e.rank ? 26 : 9, e.rank ? '#ff5a4a' : '#2a1a24', e.rank ? 360 : 230, 'chunk', e.rank ? 5 : 3.5, 620);
      spray(v, e.x, e.y - 18, e.rank ? 10 : 3, '#ff7a8a', 120, 'soul', 3, -90);
      v.burstKills++;
      // 연격: 2.5초 안에 잇달아 쓰러뜨린 수
      v.combo.n = now - v.combo.at < 2500 ? v.combo.n + 1 : 1;
      v.combo.at = now;
      v.combo.best = Math.max(v.combo.best, v.combo.n);
      if (v.combo.n % 25 === 0) v.combo.pop = now;
      if (e.rank && opt.shake) v.shake = Math.max(v.shake, e.rank === 'boss' ? 14 : 8);
      if (e.rank) v.stopUntil = Math.max(v.stopUntil, now + (e.rank === 'boss' ? 260 : 90));
      if (e.rank === 'boss') v.punch = 1;
    } else if (e.type === 'burst') {
      v.marks.push({ e, born: now });
      spray(v, e.x, e.y - 10, 16, '#ffb02e', 340, 'spark', 3.5);
      v.parts.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: 0, max: 0.35, color: '#ffd27a', size: e.r, grav: 0, kind: 'ring' });
      if (opt.shake) v.shake = Math.max(v.shake, 7);
    } else v.marks.push({ e, born: now });
  }
  // 한 프레임에 여럿을 쓰러뜨렸으면 화면이 울린다
  if (v.burstKills >= 6 && opt.shake) v.shake = Math.max(v.shake, Math.min(9, 2 + v.burstKills * 0.4));
  if (v.burstKills >= 10) v.stopUntil = Math.max(v.stopUntil, now + 30);
  v.burstKills = 0;
  s.events.length = 0;
  if (v.marks.length > 300) v.marks.splice(0, v.marks.length - 300);
}

const KIND_FX = ['slash', 'orbit', 'wave', 'bolt', 'nova', 'aura', 'strike', 'rain', 'beam', 'chain', 'heal', 'foe_shot', 'foe_warn', 'foe_slam', 'foe_burst', 'foe_charge', 'foe_summon'];
/**
 * 그림 안 자리(프레임 비율, 2026-11-21 Codex 그림을 재서 맞춤 — 160px 프레임에 128px 그림이 아래로 붙어 있다):
 * ax·ay 게임 위치에 오는 점, span 게임 크기에 맞출 그림 폭(또는 높이)
 */
const KG = {
  slash: { ax: 0.53, ay: 0.57, span: 0.28 }, // 초승달 바깥 반지름 = 베기 반지름, 돌림 중심
  orbit: { ax: 0.5, ay: 0.58, span: 0.39 },
  wave: { ax: 0.5, ay: 0.575, span: 0.47 }, // 초승달 높이
  bolt: { ax: 0.68, ay: 0.51, span: 0.27 }, // 머리
  nova: { ax: 0.5, ay: 0.56, span: 0.56 }, // 가장 큰 고리 지름
  aura: { ax: 0.5, ay: 0.545, span: 0.68 },
  strike: { ax: 0.5, ay: 0.84, span: 0.53 }, // 닿는 곳 · 땅 고리 지름
  rain: { ax: 0.5, ay: 0.84, span: 0.56 }, // 둥근 자리 지름
  beam: { ax: 0.19, ay: 0.575, span: 0.61, thick: 0.17 }, // 가로 길이 · 두께
  chain: { ax: 0.17, ay: 0.575, span: 0.64 },
  heal: { ax: 0.5, ay: 0.82, span: 0.42 },
  // 적 기술(2026-11-21 Codex 그림을 재서 맞춤)
  foe_shot: { ax: 0.57, ay: 0.585, span: 0.3 }, // 알 지름
  foe_warn: { ax: 0.49, ay: 0.58, span: 0.7 }, // 고리 지름
  foe_slam: { ax: 0.5, ay: 0.66, span: 0.6 },
  foe_burst: { ax: 0.5, ay: 0.58, span: 0.55 },
  foe_charge: { ax: 0.22, ay: 0.59, span: 0.58 }, // 자국 길이
  foe_summon: { ax: 0.5, ay: 0.72, span: 0.5 },
};
/**
 * 무공 이펙트 한 프레임에 색 입히기: 회색 밝기 × 무공 색, 흰 심지는 더 하얗게. 프레임·색마다 한 번만 만든다(「결」 tinted와 같은 길).
 * k: 한 번 재생(0~1), 아니면 ms로 되풀이
 */
const tintCache = new WeakMap<object, Map<string, HTMLCanvasElement>>();
function kindImg(art: Art, kind: string, color: string, at: { k?: number; ms?: number }): CanvasImageSource | null {
  const a = art.kinds.get(kind);
  if (!a) return null;
  const n = at.k !== undefined ? Math.max(0, Math.min(a.meta.frames - 1, Math.floor(at.k * a.meta.frames))) : Math.floor((at.ms ?? 0) / (1000 / a.meta.fps)) % a.meta.frames;
  const img = a.images[n];
  if (!img) return null;
  let byColor = tintCache.get(img);
  if (!byColor) tintCache.set(img, (byColor = new Map()));
  let cv = byColor.get(color);
  if (cv) return cv;
  cv = document.createElement('canvas');
  cv.width = a.meta.frameW;
  cv.height = a.meta.frameH;
  const c = cv.getContext('2d')!;
  c.imageSmoothingEnabled = false;
  c.drawImage(img, 0, 0, cv.width, cv.height);
  c.globalCompositeOperation = 'multiply';
  c.fillStyle = color;
  c.fillRect(0, 0, cv.width, cv.height);
  c.globalCompositeOperation = 'destination-in';
  c.drawImage(img, 0, 0, cv.width, cv.height);
  c.globalCompositeOperation = 'lighter';
  c.globalAlpha = 0.35;
  c.drawImage(img, 0, 0, cv.width, cv.height);
  byColor.set(color, cv);
  return cv;
}
/** (x, y)를 그림의 (ax, ay) 비율 자리에 두고 w×h로 그린다 — 돌림은 (x, y) 둘레 */
function blit(ctx: CanvasRenderingContext2D, img: CanvasImageSource, x: number, y: number, w: number, h: number, ax = 0.5, ay = 0.5, rot = 0, alpha = 1): void {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  ctx.drawImage(img, -w * ax, -h * ay, w, h);
  ctx.restore();
}
/** 하얀 실루엣(맞은 그림자) — 프레임마다 한 번만 만든다 */
const whiteCache = new WeakMap<object, HTMLCanvasElement>();
function whiteOf(img: CanvasImageSource, w: number, h: number): CanvasImageSource {
  let cv = whiteCache.get(img);
  if (cv) return cv;
  cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const c = cv.getContext('2d')!;
  c.drawImage(img, 0, 0, w, h);
  c.globalCompositeOperation = 'source-in';
  c.fillStyle = '#ffffff';
  c.fillRect(0, 0, w, h);
  whiteCache.set(img, cv);
  return cv;
}
/** 변종·속성 색을 입힌 실루엣(색마다 한 번) */
const tintCache2 = new WeakMap<object, Map<string, HTMLCanvasElement>>();
function tintOf(img: CanvasImageSource, w: number, h: number, color: string): CanvasImageSource {
  let m = tintCache2.get(img as object);
  if (!m) tintCache2.set(img as object, (m = new Map()));
  let cv = m.get(color);
  if (cv) return cv;
  cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const c = cv.getContext('2d')!;
  c.drawImage(img, 0, 0, w, h);
  c.globalCompositeOperation = 'source-in';
  c.fillStyle = color;
  c.fillRect(0, 0, w, h);
  m.set(color, cv);
  return cv;
}
const ELEM_COLOR: Record<string, string> = { fire: '#ff7a3a', ice: '#8fd3ff', shock: '#ffe45a', poison: '#9ad04a' };
/** 적 탄(2026-11-22 "원거리 공격이 다 똑같다"): 모양마다 다르게 — 위험 분홍 번짐 + 진한 남색 테두리는 모두 같다(적 탄이라는 표시) */
function drawFoeShot(ctx: CanvasRenderingContext2D, sh: { x: number; y: number; vx: number; vy: number; r: number; color: string; style?: string; life: number }, now: number): void {
  const a = Math.atan2(sh.vy, sh.vx);
  const r = sh.r;
  const ol = '#1d2433';
  ctx.save();
  ctx.translate(sh.x, sh.y);
  // 위험 번짐(모든 적 탄 공통)
  const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2.4);
  halo.addColorStop(0, 'rgba(255,47,95,0.45)');
  halo.addColorStop(1, 'rgba(255,47,95,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, r * 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(a);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = ol;
  const col = sh.color;
  switch (sh.style) {
    case 'arrow':
    case 'needle': {
      const L = sh.style === 'arrow' ? 22 : 16;
      ctx.strokeStyle = ol;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(-L, 0);
      ctx.lineTo(4, 0);
      ctx.stroke();
      ctx.strokeStyle = sh.style === 'arrow' ? '#e8d6b0' : '#9ad04a';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = sh.style === 'arrow' ? '#ffffff' : '#d4ff8a';
      ctx.strokeStyle = ol;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(10, 0);
      ctx.lineTo(1, -5);
      ctx.lineTo(1, 5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      if (sh.style === 'arrow') {
        ctx.fillStyle = '#ff2f5f';
        ctx.fillRect(-L, -4, 6, 3);
        ctx.fillRect(-L, 1, 6, 3);
      }
      break;
    }
    case 'flame': {
      // 꼬리 불티
      for (let i = 0; i < 4; i++) {
        const k = ((now / 90 + i * 0.25) % 1);
        ctx.fillStyle = `rgba(255,${150 + i * 25},60,${0.7 * (1 - k)})`;
        ctx.beginPath();
        ctx.arc(-r - k * 18, Math.sin(now / 50 + i * 2) * 3, r * (0.6 - k * 0.4), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#ff7a3a';
      ctx.beginPath();
      ctx.moveTo(r * 1.2, 0);
      ctx.quadraticCurveTo(0, -r * 1.1, -r * 1.6, 0);
      ctx.quadraticCurveTo(0, r * 1.1, r * 1.2, 0);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffe08a';
      ctx.beginPath();
      ctx.arc(r * 0.3, 0, r * 0.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'shard': {
      ctx.rotate(Math.sin(now / 120) * 0.2);
      ctx.fillStyle = '#bfe8ff';
      ctx.beginPath();
      ctx.moveTo(r * 1.6, 0);
      ctx.lineTo(0, -r * 0.7);
      ctx.lineTo(-r * 1.3, 0);
      ctx.lineTo(0, r * 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(r * 1.1, 0);
      ctx.lineTo(0, -r * 0.3);
      ctx.lineTo(-r * 0.3, 0);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'spark': {
      ctx.strokeStyle = ol;
      ctx.lineWidth = 4;
      const zig = () => {
        ctx.beginPath();
        for (let i = 0; i < 7; i++) {
          const aa = (i / 7) * Math.PI * 2 + now / 80;
          const rr = i % 2 ? r * 0.6 : r * 1.4;
          if (i) ctx.lineTo(Math.cos(aa) * rr, Math.sin(aa) * rr);
          else ctx.moveTo(Math.cos(aa) * rr, Math.sin(aa) * rr);
        }
        ctx.closePath();
      };
      zig();
      ctx.stroke();
      ctx.fillStyle = '#ffe45a';
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'bubble': {
      for (let i = 1; i <= 2; i++) {
        ctx.fillStyle = 'rgba(154,208,74,0.6)';
        ctx.beginPath();
        ctx.arc(-r * 1.3 * i, Math.sin(now / 90 + i) * 3, r * 0.35, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#7ac83a';
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.05, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(240,255,200,0.9)';
      ctx.beginPath();
      ctx.arc(-r * 0.3, -r * 0.35, r * 0.3, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'shadow': {
      for (let i = 0; i < 3; i++) {
        const k = ((now / 140 + i / 3) % 1);
        ctx.fillStyle = `rgba(40,10,60,${0.7 * (1 - k)})`;
        ctx.beginPath();
        ctx.arc(-r - k * 20, Math.sin(now / 70 + i * 2) * 4, r * (0.9 - k * 0.5), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#2a1238';
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#b48cff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#ff2f5f';
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.4, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'bone': {
      ctx.rotate(now / 60);
      ctx.fillStyle = '#efe6d2';
      ctx.fillRect(-r * 1.2, -r * 0.3, r * 2.4, r * 0.6);
      ctx.strokeRect(-r * 1.2, -r * 0.3, r * 2.4, r * 0.6);
      for (const sx of [-1, 1])
        for (const sy of [-1, 1]) {
          ctx.beginPath();
          ctx.arc(sx * r * 1.2, sy * r * 0.35, r * 0.4, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      break;
    }
    case 'blade': {
      ctx.fillStyle = hexA(col, 0.95);
      ctx.beginPath();
      ctx.arc(-r * 0.6, 0, r * 1.8, -1.1, 1.1);
      ctx.arc(-r * 1.4, 0, r * 1.5, 1.0, -1.0, true);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath();
      ctx.arc(-r * 0.6, 0, r * 1.6, -0.6, 0.6);
      ctx.arc(-r * 0.9, 0, r * 1.5, 0.5, -0.5, true);
      ctx.closePath();
      ctx.fill();
      break;
    }
    default: {
      ctx.fillStyle = 'rgba(20,10,10,0.85)';
      ctx.beginPath();
      ctx.arc(0, 0, r + 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = DANGER;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.arc(-r * 0.25, -r * 0.25, r * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}
// ── 깔끔한 범위 기술(2026-11-21 5차): 가운데는 비워 인물을 가리지 않고, 가장자리 띠·눈금·날로 범위를 보인다 ──
/** 결계: 가운데가 빈 고리 띠 + 천천히 도는 눈금(발밑, 인물 밑) */
function drawAuraClean(ctx: CanvasRenderingContext2D, x: number, y: number, R: number, color: string, now: number, a: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, 0.7);
  const g = ctx.createRadialGradient(0, 0, R * 0.55, 0, 0, R);
  g.addColorStop(0, hexA(color, 0));
  g.addColorStop(0.75, hexA(color, 0.1 * a + 0.03));
  g.addColorStop(1, hexA(color, 0.26 * a + 0.06));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = hexA(color, 0.55 * a + 0.15);
  ctx.lineWidth = 2;
  ctx.stroke();
  // 눈금 16개가 8초에 한 바퀴
  const rot = (now / 8000) * Math.PI * 2;
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = hexA(color, 0.7 * a + 0.2);
  for (let i = 0; i < 16; i++) {
    const t = rot + (i / 16) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(t) * R * 0.9, Math.sin(t) * R * 0.9);
    ctx.lineTo(Math.cos(t) * R, Math.sin(t) * R);
    ctx.stroke();
  }
  ctx.restore();
}
/** 둘레 돌기: 날 모양(진행 방향으로 뾰족) + 뒤로 남는 짧은 호 꼬리 */
function drawBladeClean(ctx: CanvasRenderingContext2D, bx: number, by: number, heading: number, len: number, color: string, R: number, ang: number, speed: number, cx: number, cy: number): void {
  // 꼬리: 지나온 길 0.45라디안
  const dir = Math.sign(speed || 1);
  ctx.strokeStyle = hexA(color, 0.35);
  ctx.lineWidth = len * 0.35;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.ellipse(cx, cy, R, R * 0.8, 0, dir > 0 ? ang - 0.45 : ang, dir > 0 ? ang : ang + 0.45);
  ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.save();
  ctx.translate(bx, by);
  ctx.rotate(heading);
  ctx.beginPath();
  ctx.moveTo(len * 0.6, 0);
  ctx.lineTo(0, len * 0.22);
  ctx.lineTo(-len * 0.4, 0);
  ctx.lineTo(0, -len * 0.22);
  ctx.closePath();
  ctx.fillStyle = 'rgba(16,14,22,0.85)';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(16,14,22,0.85)';
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath();
  ctx.moveTo(len * 0.5, 0);
  ctx.lineTo(0, len * 0.08);
  ctx.lineTo(-len * 0.1, 0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
/** 베기: 인물에서 떨어진 초승달 날(가운데 두껍고 끝이 가늘다) — 안쪽은 비운다 */
function drawSlashClean(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, angle: number, arc: number, color: string, k: number): void {
  const a0 = angle - (arc / 2) * (0.6 + 0.4 * Math.min(1, k * 3));
  const a1 = angle + (arc / 2) * (0.6 + 0.4 * Math.min(1, k * 3));
  const ro = r * (0.88 + 0.12 * k);
  const ri = ro * 0.74;
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.arc(0, 0, ro, a0, a1);
  // 안쪽 호는 가운데로 갈수록 두껍게(초승달)
  const steps = 14;
  for (let i = steps; i >= 0; i--) {
    const t = a0 + ((a1 - a0) * i) / steps;
    const mid = 1 - Math.abs(i / steps - 0.5) * 2;
    const rr = ro - (ro - ri) * mid;
    ctx.lineTo(Math.cos(t) * rr, Math.sin(t) * rr);
  }
  ctx.closePath();
  const g = ctx.createRadialGradient(0, 0, ri, 0, 0, ro);
  g.addColorStop(0, hexA(color, 0.05 * (1 - k)));
  g.addColorStop(1, hexA(color, 0.75 * (1 - k)));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = `rgba(255,255,255,${0.7 * (1 - k)})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, ro, a0, a1);
  ctx.stroke();
  ctx.restore();
}
/** 고리: 앞쪽이 밝고 뒤로 흐려지는 띠가 퍼진다(가운데는 빈다) */
function drawNovaClean(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, k: number): void {
  const rr = r * (0.15 + 0.85 * Math.sqrt(k));
  const band = Math.max(4, r * 0.18 * (1 - k * 0.6));
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, 0.75);
  const g = ctx.createRadialGradient(0, 0, Math.max(0, rr - band), 0, 0, rr);
  g.addColorStop(0, hexA(color, 0));
  g.addColorStop(0.8, hexA(color, 0.3 * (1 - k)));
  g.addColorStop(1, hexA(color, 0.55 * (1 - k)));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, rr, 0, Math.PI * 2);
  ctx.arc(0, 0, Math.max(0, rr - band), 0, Math.PI * 2, true);
  ctx.fill();
  ctx.strokeStyle = `rgba(255,255,255,${0.55 * (1 - k)})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, rr, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
/** 장판: 테두리 + 안쪽 옅은 빛 + 여기저기 작은 물결(떨어지는 자리) */
function drawZoneClean(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, now: number, k: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, 0.6);
  const g = ctx.createRadialGradient(0, 0, r * 0.3, 0, 0, r);
  g.addColorStop(0, hexA(color, 0.04));
  g.addColorStop(1, hexA(color, 0.2 * k + 0.05));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = hexA(color, 0.55 * k + 0.15);
  ctx.lineWidth = 2;
  ctx.stroke();
  // 물결 넷: 자리마다 0.9초 주기
  for (let i = 0; i < 4; i++) {
    const ph = (((now / 900 + i * 0.25 + x * 0.003) % 1) + 1) % 1;
    const a = i * 2.4 + Math.floor(now / 900 + i * 0.25) * 1.7;
    const d = r * (0.25 + 0.5 * ((i * 0.37 + Math.floor(now / 900)) % 1));
    ctx.strokeStyle = hexA(color, 0.6 * (1 - ph) * k);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * d, Math.sin(a) * d, 4 + ph * r * 0.22, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}
/** 회복: 발밑 고리 + 떠오르는 십자 넷 */
function drawHealClean(ctx: CanvasRenderingContext2D, x: number, y: number, k: number): void {
  ctx.strokeStyle = `rgba(127,224,138,${0.6 * (1 - k)})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(x, y, 26 + k * 10, 9 + k * 3, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = `rgba(160,240,160,${0.85 * (1 - k)})`;
  for (let i = 0; i < 4; i++) {
    const px = x + Math.cos(i * 1.7) * 24;
    const py = y - 10 - k * 46 - i * 6;
    ctx.fillRect(px - 1, py - 4, 2, 8);
    ctx.fillRect(px - 4, py - 1, 8, 2);
  }
}

/** 적 탄은 늘 같은 위험 색(내 이펙트와 확실히 다르게, 2026-11-21) */
const DANGER = '#ff2f5f';
/** 내 무공 이펙트인가(세기 옵션이 듣는 것) */
const PLAYER_FX = new Set(['slash', 'nova', 'strike', 'beam', 'chain', 'heal']);

function frame(a: SpriteAsset, ms: number, offset = 0): CanvasImageSource | null {
  return a.images[Math.floor((ms + offset) / (1000 / a.meta.fps)) % a.meta.frames] ?? null;
}

function drawSpriteAt(ctx: CanvasRenderingContext2D, a: SpriteAsset, img: CanvasImageSource, x: number, y: number, scale: number, flip: boolean, rot = 0, alpha = 1, squash = 0): void {
  // squash: 맞은 순간 옆으로 퍼지고 납작해진다(0~1)
  const w = a.meta.frameW * scale * (1 + squash * 0.22);
  const h = a.meta.frameH * scale * (1 - squash * 0.16);
  const [ax, ay] = a.meta.anchor;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(img, -w * ax, -h * ay, w, h);
  ctx.restore();
}

const hash = (x: number, y: number) => ((x * 73856093) ^ (y * 19349663)) >>> 0;

/** 지형: 바닥(타일·무늬) → 위험·느림·다리 → 벽(윗면 + 앞면으로 높이). 지형 조각 그림(terrain_teum_<장>)이 오면 칸마다 그 그림 */
function drawTerrain(ctx: CanvasRenderingContext2D, s: State, art: Art, x0: number, y0: number, x1: number, y1: number, now: number): void {
  if (s.chapter.style === 'rift') return drawRiftTerrain(ctx, s, art, x0, y0, x1, y1, now);
  const t = s.terrain;
  const [floor, floor2, wall, hazard] = s.chapter.color;
  ctx.fillStyle = floor;
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  if (art.ground) {
    const img = art.ground.images[0];
    const tw = art.ground.meta.frameW;
    const th = art.ground.meta.frameH;
    for (let x = Math.floor(x0 / tw) * tw; x < x1; x += tw) for (let y = Math.floor(y0 / th) * th; y < y1; y += th) ctx.drawImage(img, x, y, tw, th);
  }
  const cx0 = Math.max(0, Math.floor(x0 / CELL));
  const cy0 = Math.max(0, Math.floor(y0 / CELL));
  const cx1 = Math.min(t.w - 1, Math.ceil(x1 / CELL));
  const cy1 = Math.min(t.h - 1, Math.ceil(y1 / CELL));
  const piece = (n: number) => art.terrain?.images[n - 1] ?? null;
  // 바닥 무늬·위험·느림·다리
  for (let cy = cy0; cy <= cy1; cy++)
    for (let cx = cx0; cx <= cx1; cx++) {
      const c = t.cells[cy * t.w + cx];
      const x = cx * CELL;
      const y = cy * CELL;
      const h = hash(cx, cy);
      if (c === T.Floor) {
        const img = piece(h % 3 === 0 ? 2 : 1);
        if (img && !art.ground) ctx.drawImage(img, x, y, CELL, CELL);
        else if (!art.ground && h % 5 < 2) {
          ctx.fillStyle = floor2;
          ctx.fillRect(x + (h % 23), y + ((h >> 5) % 27), 4 + (h % 6), 3);
        }
      } else if (c === T.Hazard) {
        const img = piece(5);
        if (img) ctx.drawImage(img, x, y, CELL, CELL);
        else {
          ctx.fillStyle = hazard;
          ctx.globalAlpha = 0.85;
          ctx.fillRect(x, y, CELL, CELL);
          ctx.globalAlpha = 0.25 + 0.15 * Math.sin(now / 400 + cx * 0.7 + cy * 0.4);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(x + (h % 20), y + ((h >> 4) % 30), 10, 2);
          ctx.globalAlpha = 1;
        }
      } else if (c === T.Slow) {
        const img = piece(6);
        if (img) ctx.drawImage(img, x, y, CELL, CELL);
        else {
          ctx.fillStyle = 'rgba(0,0,0,0.22)';
          ctx.fillRect(x, y, CELL, CELL);
          ctx.fillStyle = floor2;
          for (let i = 0; i < 3; i++) ctx.fillRect(x + ((h >> (i * 3)) % 32), y + ((h >> (i * 4 + 2)) % 32), 6, 3);
        }
      } else if (c === T.Bridge) {
        const img = piece(7);
        if (img) ctx.drawImage(img, x, y, CELL, CELL);
        else {
          ctx.fillStyle = hazard;
          ctx.fillRect(x, y, CELL, CELL);
          ctx.fillStyle = '#6e5440';
          ctx.fillRect(x + 2, y, CELL - 4, CELL);
          ctx.fillStyle = '#4a3426';
          for (let k = 0; k < 4; k++) ctx.fillRect(x + 2, y + k * 10 + 8, CELL - 4, 2);
        }
      }
    }
  // 벽: 앞면(아래쪽이 비었으면 그림자 진 높이) + 윗면
  for (let cy = cy0; cy <= cy1; cy++)
    for (let cx = cx0; cx <= cx1; cx++) {
      if (t.cells[cy * t.w + cx] !== T.Wall) continue;
      const x = cx * CELL;
      const y = cy * CELL;
      const below = cy + 1 < t.h ? t.cells[(cy + 1) * t.w + cx] : T.Wall;
      const top = piece(3);
      const face = piece(4);
      if (below !== T.Wall) {
        if (face) ctx.drawImage(face, x, y + CELL - 14, CELL, 18);
        else {
          ctx.fillStyle = 'rgba(0,0,0,0.45)';
          ctx.fillRect(x, y + CELL - 4, CELL, 14);
          ctx.fillStyle = shade(wall, -0.35);
          ctx.fillRect(x, y + CELL - 14, CELL, 14);
        }
      }
      if (top) ctx.drawImage(top, x, y - 14, CELL, CELL);
      else {
        ctx.fillStyle = wall;
        ctx.fillRect(x, y - 14, CELL, CELL);
        const h = hash(cx, cy);
        ctx.fillStyle = shade(wall, 0.18);
        ctx.fillRect(x + (h % 14), y - 12 + ((h >> 4) % 14), 8, 4);
      }
    }
  drawFog(ctx, s, cx0, cy0, cx1, cy1);
}

/** 안개: 아직 가 보지 않은 칸은 지형이 보이지 않는다(그림자·물건은 보인다).
 *  2026-11-22 "맵이 블록 같다" — 칸마다 네모로 덮지 않고, 칸 하나를 점 하나로 한 작은 그림을 부드럽게 늘려 가장자리가 번지게 */
const fogCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
function drawFog(ctx: CanvasRenderingContext2D, s: State, cx0: number, cy0: number, cx1: number, cy1: number): void {
  const t = s.terrain;
  if (!fogCanvas) return;
  const gx0 = Math.max(0, cx0 - 2);
  const gy0 = Math.max(0, cy0 - 2);
  const gx1 = Math.min(t.w - 1, cx1 + 2);
  const gy1 = Math.min(t.h - 1, cy1 + 2);
  const fw = gx1 - gx0 + 1;
  const fh = gy1 - gy0 + 1;
  if (fogCanvas.width !== fw || fogCanvas.height !== fh) {
    fogCanvas.width = fw;
    fogCanvas.height = fh;
  }
  const fc = fogCanvas.getContext('2d')!;
  const img = fc.createImageData(fw, fh);
  let any = false;
  for (let y = 0; y < fh; y++)
    for (let x = 0; x < fw; x++) {
      if (s.explored[(gy0 + y) * t.w + gx0 + x]) continue;
      any = true;
      const k = (y * fw + x) * 4;
      img.data[k] = 6;
      img.data[k + 1] = 5;
      img.data[k + 2] = 10;
      img.data[k + 3] = 236;
    }
  if (!any) return;
  fc.putImageData(img, 0, 0);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  // 점 하나 = 칸 하나(부드럽게 늘려 칸 사이가 번진다), 벽 윗면 14px도 덮게 위로 조금
  ctx.drawImage(fogCanvas, gx0 * CELL, gy0 * CELL - 10, fw * CELL, fh * CELL);
  ctx.restore();
}

/** 무한 모드 전용 「갈라진 들」(2026-11-22 "맵이 블록 형태 — 틈에 맞는 전용 맵"): 칸 네모를 그리지 않고
 *  균열(허공)은 겹친 원으로 둥글게 파고 붉은 테가 숨 쉬듯 빛나며, 바위 조각은 칸마다 흔들린 다각형 + 보랏빛 수정,
 *  오염된 땅은 번진 얼룩. Codex 무늬(tex_teum_rift)가 오면 그 무늬로 채운다 */
const texPat = new Map<CanvasImageSource, CanvasPattern | null>();
function pattern(ctx: CanvasRenderingContext2D, img: CanvasImageSource | undefined | null): CanvasPattern | null {
  if (!img) return null;
  if (!texPat.has(img)) texPat.set(img, ctx.createPattern(img, 'repeat'));
  return texPat.get(img) ?? null;
}
function drawRiftTerrain(ctx: CanvasRenderingContext2D, s: State, art: Art, x0: number, y0: number, x1: number, y1: number, now: number): void {
  const t = s.terrain;
  const [floor, floor2, wall, voidC] = s.chapter.color;
  const tex = art.tex.map((a) => a?.images[0] ?? null);
  ctx.fillStyle = pattern(ctx, tex[0]) ?? floor;
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  const cx0 = Math.max(0, Math.floor(x0 / CELL) - 1);
  const cy0 = Math.max(0, Math.floor(y0 / CELL) - 1);
  const cx1 = Math.min(t.w - 1, Math.ceil(x1 / CELL) + 1);
  const cy1 = Math.min(t.h - 1, Math.ceil(y1 / CELL) + 1);
  const C = (cx: number, cy: number) => (cx < 0 || cy < 0 || cx >= t.w || cy >= t.h ? T.Wall : t.cells[cy * t.w + cx]);
  // 땅 무늬: 먼지 낀 실금·작은 돌(무늬 그림이 없을 때)
  if (!tex[0]) {
    ctx.strokeStyle = hexA(floor2, 0.9);
    ctx.lineWidth = 1.2;
    for (let cy = cy0; cy <= cy1; cy++)
      for (let cx = cx0; cx <= cx1; cx++) {
        const h = hash(cx, cy);
        if (C(cx, cy) !== T.Floor || h % 4) continue;
        const x = cx * CELL + (h % 30);
        const y = cy * CELL + ((h >> 6) % 30);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 6 + (h % 9), y + ((h >> 3) % 7) - 3);
        ctx.lineTo(x + 10 + (h % 13), y + ((h >> 9) % 9) - 2);
        ctx.stroke();
      }
  }
  // 오염된 땅(느림): 번진 얼룩
  ctx.fillStyle = pattern(ctx, tex[1]) ?? 'rgba(86,40,92,0.42)';
  ctx.beginPath();
  for (let cy = cy0; cy <= cy1; cy++)
    for (let cx = cx0; cx <= cx1; cx++) {
      if (C(cx, cy) !== T.Slow) continue;
      const h = hash(cx, cy);
      const r = CELL * (0.62 + (h % 30) / 100);
      ctx.moveTo((cx + 0.5) * CELL + r, (cy + 0.5) * CELL);
      ctx.arc((cx + 0.5) * CELL + ((h % 9) - 4), (cy + 0.5) * CELL + (((h >> 4) % 9) - 4), r, 0, Math.PI * 2);
    }
  ctx.fill();
  // 균열(허공): 붉은 테(겹친 큰 원) → 검은 속(작은 원) → 안의 별빛
  const pulse = 0.55 + 0.25 * Math.sin(now / 520);
  const hz: [number, number, number][] = [];
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) if (C(cx, cy) === T.Hazard || C(cx, cy) === T.Bridge) hz.push([cx, cy, hash(cx, cy)]);
  // 이웃한 균열 칸끼리 굵은 둥근 선으로 이어 칸 모양이 보이지 않게(매끈한 갈라짐)
  const isHz = (cx: number, cy: number) => {
    const c = C(cx, cy);
    return c === T.Hazard || c === T.Bridge;
  };
  const tube = (w: number) => {
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (const [cx, cy] of hz) {
      const x = (cx + 0.5) * CELL;
      const y = (cy + 0.5) * CELL;
      let linked = false;
      for (const [dx, dy] of [
        [1, 0],
        [0, 1],
        [1, 1],
        [1, -1],
      ]) {
        if (!isHz(cx + dx, cy + dy)) continue;
        // 대각선은 옆 둘이 다 막혔을 때만(두꺼워지지 않게)
        if (dx && dy && (isHz(cx + dx, cy) || isHz(cx, cy + dy))) continue;
        ctx.moveTo(x, y);
        ctx.lineTo(x + dx * CELL, y + dy * CELL);
        linked = true;
      }
      if (!linked) {
        ctx.moveTo(x, y);
        ctx.lineTo(x + 0.1, y);
      }
    }
    ctx.stroke();
  };
  ctx.save();
  ctx.strokeStyle = `rgba(214,44,72,${0.6 * pulse})`;
  ctx.shadowColor = 'rgba(255,60,90,0.9)';
  ctx.shadowBlur = 16;
  tube(CELL * 1.25);
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = 'rgba(120,20,50,0.9)';
  tube(CELL * 1.05);
  ctx.strokeStyle = pattern(ctx, tex[3]) ?? voidC;
  tube(CELL * 0.88);
  ctx.restore();
  for (const [cx, cy, h] of hz) {
    if (h % 3) continue;
    const tw = 0.4 + 0.6 * Math.abs(Math.sin(now / (300 + (h % 400)) + h));
    ctx.fillStyle = h % 2 ? `rgba(255,120,150,${tw})` : `rgba(200,170,255,${tw})`;
    ctx.fillRect(cx * CELL + (h % 34) + 3, cy * CELL + ((h >> 5) % 34) + 3, 2, 2);
  }
  // 떠오르는 불티(균열에서 위로)
  for (const [cx, cy, h] of hz) {
    if (h % 7) continue;
    const k = ((now / 1000 + (h % 100) / 37) % 2.4) / 2.4;
    ctx.fillStyle = `rgba(255,110,130,${0.7 * (1 - k)})`;
    ctx.fillRect(cx * CELL + (h % 30) + Math.sin(k * 6 + h) * 4, cy * CELL + 20 - k * 60, 2, 3);
  }
  // 부서진 돌다리: 균열을 가로지르는 판돌(가로·세로 방향은 이웃 균열을 보고)
  for (const [cx, cy, h] of hz) {
    if (C(cx, cy) !== T.Bridge) continue;
    const x = cx * CELL;
    const y = cy * CELL;
    const across = isHz(cx - 1, cy) && isHz(cx + 1, cy) ? 'v' : 'h';
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(x - 2, y + 4, CELL + 4, CELL);
    for (let k = 0; k < 3; k++) {
      ctx.fillStyle = k % 2 ? '#5a5060' : '#4a4252';
      const j = ((h >> (k * 4)) % 5) - 2;
      if (across === 'h') ctx.fillRect(x - 4 + j, y + 2 + k * 12, CELL + 8, 10);
      else ctx.fillRect(x + 2 + k * 12, y - 4 + j, 10, CELL + 8);
    }
  }
  // 바위 조각(벽): 흔들린 다각형 — 앞면(그림자) 먼저, 윗면, 가끔 보랏빛 수정
  const rock = pattern(ctx, tex[2]);
  for (let cy = cy0; cy <= cy1; cy++)
    for (let cx = cx0; cx <= cx1; cx++) {
      if (C(cx, cy) !== T.Wall) continue;
      const h = hash(cx, cy);
      const x = (cx + 0.5) * CELL;
      const y = (cy + 0.5) * CELL;
      const n = 6;
      const pts: [number, number][] = [];
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + (h % 10) / 10;
        const r = CELL * (0.58 + (((h >> (k * 3)) & 7) / 7) * 0.18);
        pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r * 0.85]);
      }
      if (C(cx, cy + 1) !== T.Wall) {
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.beginPath();
        ctx.ellipse(x, y + CELL * 0.5, CELL * 0.6, CELL * 0.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = shade(wall, -0.4);
        ctx.beginPath();
        pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = rock ?? wall;
      ctx.beginPath();
      pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py - 12) : ctx.moveTo(px, py - 12)));
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = shade(wall, 0.25);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pts[3][0], pts[3][1] - 12);
      ctx.lineTo(pts[4][0], pts[4][1] - 12);
      ctx.lineTo(pts[5][0], pts[5][1] - 12);
      ctx.stroke();
      if (h % 9 === 0) {
        const g = 0.6 + 0.4 * Math.sin(now / 700 + h);
        ctx.fillStyle = `rgba(178,120,255,${0.75 * g})`;
        ctx.beginPath();
        ctx.moveTo(x - 4, y - 14);
        ctx.lineTo(x, y - 34 - (h % 8));
        ctx.lineTo(x + 5, y - 14);
        ctx.closePath();
        ctx.fill();
      }
    }
  drawFog(ctx, s, cx0, cy0, cx1, cy1);
}

/** 줍는 것 그림 칸: items.json icon [시트, 칸] — 시트 이름은 Art 열쇠(icons·items·items2) */
function drawItemIcon(ctx: CanvasRenderingContext2D, art: Art, kind: ItemKind | 'gem', x: number, y: number, size: number): boolean {
  const ref = (kind === 'gem' ? ['icons', 1] : ITEMS.get(kind)?.icon) as [keyof Art, number] | undefined;
  const sheet = ref ? (art[ref[0]] as Anim) : null;
  const img = sheet?.images[ref![1] - 1];
  if (!img) return false;
  ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
  return true;
}

const SKILL_MARK = new Set(['heal', 'shield', 'burrow', 'line', 'cone', 'ring', 'zone']);
/** 새 적 기술이 떨어진 순간(0.5초): 띠는 번개처럼 번쩍, 부채꼴은 휘두른 자국, 고리는 퍼지는 충격파, 회복은 떠오르는 초록 십자, 보호는 푸른 막이 퍼짐 */
function drawSkillMark(ctx: CanvasRenderingContext2D, e: Extract<FxEvent, { type: 'skill' }>, age: number): void {
  const k = age / 0.5;
  const a = 1 - k;
  ctx.save();
  const m = { x: e.x, y: e.y, r: e.r ?? 60, angle: e.angle, len: e.len, w: e.w, r0: e.r0, shape: e.kind as Slam['shape'], damage: 0, born: 0, at: 0, color: e.color } as Slam;
  switch (e.kind) {
    case 'line':
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = hexA(e.color, 0.5 * a * a);
      slamPath(ctx, { ...m, w: (e.w ?? 20) * (1 + k) }, 1);
      ctx.fill();
      ctx.fillStyle = `rgba(255,255,255,${0.55 * a * a})`;
      slamPath(ctx, { ...m, w: (e.w ?? 20) * 0.25 }, 1);
      ctx.fill();
      break;
    case 'cone':
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = hexA(e.color, 0.6 * a);
      slamPath(ctx, { ...m, r: m.r * (0.8 + 0.3 * k) }, 1);
      ctx.fill();
      ctx.strokeStyle = `rgba(255,255,255,${a})`;
      ctx.lineWidth = 4 * a + 1;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r * (0.85 + 0.2 * k), (m.angle ?? 0) - (m.w ?? 0.6), (m.angle ?? 0) + (m.w ?? 0.6));
      ctx.stroke();
      break;
    case 'ring':
      ctx.strokeStyle = hexA(e.color, a);
      ctx.lineWidth = 10 * a + 2;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r * (1 + 0.25 * k), 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${0.8 * a})`;
      ctx.lineWidth = 2;
      ctx.stroke();
      break;
    case 'zone':
      ctx.fillStyle = hexA(e.color, 0.5 * a);
      for (let i = 0; i < 8; i++) {
        const aa = (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(m.x + Math.cos(aa) * m.r * k, m.y + Math.sin(aa) * m.r * 0.6 * k, 4 * a + 1, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'heal':
      ctx.strokeStyle = `rgba(125,255,154,${0.7 * a})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(m.x, m.y, m.r * k, m.r * 0.6 * k, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = `rgba(125,255,154,${a})`;
      for (let i = 0; i < 4; i++) {
        const x = m.x + Math.cos(i * 1.7) * 24;
        const y = m.y - 30 - k * 40 + Math.sin(i * 2.3) * 10;
        ctx.fillRect(x - 1.5, y - 5, 3, 10);
        ctx.fillRect(x - 5, y - 1.5, 10, 3);
      }
      break;
    case 'shield':
      ctx.strokeStyle = `rgba(159,216,255,${0.8 * a})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(m.x, m.y - 10, m.r * k, m.r * 0.65 * k, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case 'burrow':
      ctx.fillStyle = `rgba(110,84,52,${a})`;
      for (let i = 0; i < 7; i++) {
        const aa = (i / 7) * Math.PI * 2;
        ctx.fillRect(m.x + Math.cos(aa) * 30 * k - 2, m.y + Math.sin(aa) * 14 * k - 10 * Math.sin(k * Math.PI), 4, 4);
      }
      break;
  }
  ctx.restore();
}

/** 예고 모양 길(k: 0~1 차오른 만큼 — 띠는 길이, 부채꼴은 반지름, 고리는 바깥에서 안으로) */
function slamPath(ctx: CanvasRenderingContext2D, m: Slam, k: number): void {
  ctx.beginPath();
  const a = m.angle ?? 0;
  if (m.shape === 'line') {
    const w = m.w ?? 20;
    const len = (m.len ?? 0) * k;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    ctx.moveTo(m.x - sn * w, m.y + c * w);
    ctx.lineTo(m.x - sn * w + c * len, m.y + c * w + sn * len);
    ctx.lineTo(m.x + sn * w + c * len, m.y - c * w + sn * len);
    ctx.lineTo(m.x + sn * w, m.y - c * w);
    ctx.closePath();
  } else if (m.shape === 'cone') {
    ctx.moveTo(m.x, m.y);
    ctx.arc(m.x, m.y, Math.max(1, m.r * k), a - (m.w ?? 0.6), a + (m.w ?? 0.6));
    ctx.closePath();
  } else if (m.shape === 'ring') {
    const r0 = m.r0 ?? 0;
    const outer = m.r;
    const inner = Math.max(r0, outer - (outer - r0) * k);
    ctx.arc(m.x, m.y, outer, 0, Math.PI * 2);
    ctx.arc(m.x, m.y, inner, 0, Math.PI * 2, true);
  } else ctx.ellipse(m.x, m.y, m.r * k, m.r * 0.65 * k, 0, 0, Math.PI * 2);
}
const ZONE_COLOR: Record<string, [string, string]> = { fire: ['#ff7a3a', '#ffd27a'], poison: ['#7ac83a', '#d4ff8a'], ice: ['#8fd3ff', '#e8f6ff'], shock: ['#ffe45a', '#ffffff'] };
/** 적 웅덩이: 불은 일렁이는 불꽃 혀, 독은 끓는 거품, 서리는 얼음 결정 — 사라질 때 줄어든다 */
function drawFoeZone(ctx: CanvasRenderingContext2D, z: FoeZone, now: number, t: number): void {
  const [c1, c2] = ZONE_COLOR[z.element] ?? ZONE_COLOR.fire;
  const life = Math.min(1, (z.until - t) / 0.6, (t - z.born) / 0.25);
  const r = z.r * Math.max(0.2, life);
  ctx.save();
  const g = ctx.createRadialGradient(z.x, z.y, r * 0.2, z.x, z.y, r);
  g.addColorStop(0, hexA(c1, 0.42));
  g.addColorStop(0.75, hexA(c1, 0.28));
  g.addColorStop(1, hexA(c1, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(z.x, z.y, r, r * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = hexA(c1, 0.75);
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 5]);
  ctx.lineDashOffset = now / 50;
  ctx.stroke();
  ctx.setLineDash([]);
  const seed = Math.floor(z.born * 997);
  for (let i = 0; i < 5; i++) {
    const h = (seed * (i + 3) * 2654435761) >>> 0;
    const px = z.x + (((h % 200) / 100 - 1) * r * 0.7);
    const py = z.y + ((((h >> 8) % 200) / 100 - 1) * r * 0.45);
    const ph = ((now / 600 + i * 0.37) % 1);
    ctx.fillStyle = hexA(c2, 0.8 * (1 - ph));
    if (z.element === 'fire') {
      ctx.beginPath();
      ctx.moveTo(px - 3, py);
      ctx.quadraticCurveTo(px, py - 10 - ph * 10, px + 3, py);
      ctx.fill();
    } else if (z.element === 'ice') ctx.fillRect(px - 1, py - 4, 2, 8), ctx.fillRect(px - 4, py - 1, 8, 2);
    else {
      ctx.beginPath();
      ctx.arc(px, py - ph * 6, 2 + ph * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** 장소의 바닥: 들어가는 둘레(점선 고리 + 옅은 깔개) — 안에 서 있으면 밝게 */
function drawPlaceGround(ctx: CanvasRenderingContext2D, it: { x: number; y: number }, color: string, r: number, now: number, inside: boolean): void {
  ctx.save();
  ctx.fillStyle = hexA(color, inside ? 0.16 : 0.08);
  ctx.beginPath();
  ctx.ellipse(it.x, it.y, r, r * 0.62, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.setLineDash([10, 8]);
  ctx.lineDashOffset = -now / 60;
  ctx.strokeStyle = hexA(color, inside ? 0.85 : 0.5);
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.setLineDash([]);
  // 깔개(돗자리)
  ctx.fillStyle = 'rgba(120,84,52,0.55)';
  ctx.strokeStyle = 'rgba(60,38,22,0.8)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(it.x, it.y + 6, r * 0.42, r * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
/** 장소 건물 + NPC: Codex 그림이 오면 그것(place_teum_<id>, <npc>_idle), 오기 전에는 수레·정자와 사람 그림자를 코드로 */
function drawPlace(ctx: CanvasRenderingContext2D, art: Art, s: State, it: { x: number; y: number; kind: string; until?: number }, pd: { radius: number; name: string }, now: number): void {
  const a = art.places.get(it.kind);
  const dojo = it.kind === 'dojo';
  const col = ITEMS.get(it.kind)?.color ?? '#f2a93b';
  const bimg = a?.building ? frame(a.building, now) : null;
  if (a?.building && bimg) drawSpriteAt(ctx, a.building, bimg, it.x, it.y + 10, (pd.radius * 2.1) / a.building.meta.frameW, false);
  else if (dojo) {
    // 정자: 기둥 넷 · 기와 지붕 · 깃발
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(it.x - 70, it.y - 4, 140, 10);
    ctx.fillStyle = '#5b3a24';
    for (const dx of [-62, -22, 22, 62]) ctx.fillRect(it.x + dx - 4, it.y - 92, 8, 92);
    ctx.fillStyle = '#2b3442';
    ctx.beginPath();
    ctx.moveTo(it.x - 96, it.y - 88);
    ctx.quadraticCurveTo(it.x - 40, it.y - 104, it.x, it.y - 132);
    ctx.quadraticCurveTo(it.x + 40, it.y - 104, it.x + 96, it.y - 88);
    ctx.lineTo(it.x + 80, it.y - 98);
    ctx.lineTo(it.x - 80, it.y - 98);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#c9a25a';
    ctx.lineWidth = 2;
    ctx.stroke();
    // 현판
    ctx.fillStyle = '#1b1410';
    ctx.fillRect(it.x - 30, it.y - 96, 60, 18);
    ctx.strokeStyle = '#c9a25a';
    ctx.strokeRect(it.x - 30, it.y - 96, 60, 18);
    ctx.fillStyle = '#f3d79a';
    ctx.font = '700 12px "Noto Serif KR", serif';
    ctx.textAlign = 'center';
    ctx.fillText('수련소', it.x, it.y - 83);
    // 목인(나무 인형)
    ctx.fillStyle = '#8a5a34';
    ctx.fillRect(it.x + 40, it.y - 40, 10, 40);
    ctx.fillRect(it.x + 33, it.y - 30, 24, 5);
  } else {
    // 수레: 바퀴 둘 · 천막 · 짐
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(it.x, it.y + 2, 70, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#6e4a2e';
    ctx.fillRect(it.x - 58, it.y - 36, 116, 24);
    ctx.fillStyle = '#c0703a';
    ctx.beginPath();
    ctx.moveTo(it.x - 64, it.y - 36);
    ctx.quadraticCurveTo(it.x, it.y - 96, it.x + 64, it.y - 36);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#f3d79a';
    ctx.lineWidth = 2;
    ctx.stroke();
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = ['#d8b060', '#8fb37a', '#b06a6a', '#7a8fb3'][i];
      ctx.fillRect(it.x - 46 + i * 24, it.y - 52, 18, 16);
    }
    ctx.fillStyle = '#2a1c12';
    for (const dx of [-40, 40]) {
      ctx.beginPath();
      ctx.arc(it.x + dx, it.y - 8, 13, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = '#a67c4e';
    for (const dx of [-40, 40]) {
      ctx.beginPath();
      ctx.arc(it.x + dx, it.y - 8, 9, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  // NPC: 건물 앞에 선 사람(그림이 오면 숨 쉬는 동작)
  const nx = it.x + (dojo ? -24 : -4);
  const ny = it.y + 16;
  const nimg = a?.npc ? frame(a.npc, now, it.x) : null;
  if (a?.npc && nimg) drawSpriteAt(ctx, a.npc, nimg, nx, ny, 64 / a.npc.meta.frameH, s.player.x < nx);
  else {
    const br = Math.sin(now / 420 + it.x) * 1.2;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(nx, ny, 13, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = dojo ? '#e8e2d4' : '#6b4f8a';
    ctx.beginPath();
    ctx.moveTo(nx - 12, ny);
    ctx.lineTo(nx - 8, ny - 30 - br);
    ctx.lineTo(nx + 8, ny - 30 - br);
    ctx.lineTo(nx + 12, ny);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#e9c9a4';
    ctx.beginPath();
    ctx.arc(nx, ny - 37 - br, 7, 0, Math.PI * 2);
    ctx.fill();
    // 삿갓(상인) · 상투(사범)
    ctx.fillStyle = dojo ? '#2a2a2a' : '#c9a25a';
    ctx.beginPath();
    if (dojo) ctx.arc(nx, ny - 45 - br, 4, 0, Math.PI * 2);
    else {
      ctx.moveTo(nx - 15, ny - 40 - br);
      ctx.lineTo(nx, ny - 52 - br);
      ctx.lineTo(nx + 15, ny - 40 - br);
    }
    ctx.fill();
  }
  // 이름표 + 떠나기까지
  const left = it.until !== undefined ? Math.max(0, it.until - s.t) : null;
  const label = left !== null ? `${pd.name} · ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}` : pd.name;
  ctx.font = '700 13px "Noto Serif KR", serif';
  ctx.textAlign = 'center';
  const w = ctx.measureText(label).width + 18;
  const ty = it.y - (dojo ? 150 : 112);
  ctx.fillStyle = 'rgba(14,10,8,0.82)';
  ctx.fillRect(it.x - w / 2, ty - 15, w, 22);
  ctx.strokeStyle = col;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(it.x - w / 2, ty - 15, w, 22);
  ctx.fillStyle = left !== null && left < 15 ? '#ff8a6a' : '#f3ead8';
  ctx.fillText(label, it.x, ty);
}

export function draw(ctx: CanvasRenderingContext2D, s: State, art: Art, v: View, now: number, W: number, H: number, zoom: number, dpr: number, opt: Options): void {
  const p = s.player;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  const shake = v.shake > 0.3 ? v.shake : 0;
  v.shake *= 0.88;
  const sx = shake ? (Math.sin(now * 0.07) * shake) / 2 : 0;
  const sy = shake ? (Math.cos(now * 0.09) * shake) / 2 : 0;
  ctx.fillStyle = '#05040a';
  ctx.fillRect(0, 0, W, H);
  // 줌 펀치(마지막 기술·보스 쓰러짐): 잠깐 당겼다 놓는다
  const pz = 1 + 0.06 * Math.sin(Math.min(1, v.punch) * Math.PI) * v.punch;
  v.punch = Math.max(0, v.punch - 0.05);
  ctx.translate(W / 2 + sx, H / 2 + sy);
  ctx.scale(zoom * pz, zoom * pz);
  ctx.translate(-p.x, -p.y);
  const vw = W / zoom;
  const vh = H / zoom;
  drawTerrain(ctx, s, art, p.x - vw / 2 - 60, p.y - vh / 2 - 60, p.x + vw / 2 + 60, p.y + vh / 2 + 60, now);
  const inView = (x: number, y: number, m = 80) => Math.abs(x - p.x) < vw / 2 + m && Math.abs(y - p.y) < vh / 2 + m;

  const fxa = opt.fxAlpha ?? FX_ALPHA[opt.fx ?? 'normal'];
  const fancy = opt.areaFx === 'fancy';
  const clean = !opt.areaFx || opt.areaFx === 'clean';
  // 무공 장판(내 것 — 세기 옵션)
  ctx.globalAlpha = fxa;
  for (const z of s.zones) {
    const k = Math.max(0, Math.min(1, (z.until - s.t) / 0.4));
    const zimg = fancy && z.weapon && WEAPONS.get(z.weapon)?.kind === 'rain' ? kindImg(art, 'rain', z.color, { ms: now + z.x * 7 }) : null;
    if (zimg) {
      // 그림의 둥근 자리(칸 너비 70%)를 장판 크기에 맞춘다
      const S = (z.r * 2) / KG.rain.span;
      blit(ctx, zimg, z.x, z.y, S, S, KG.rain.ax, KG.rain.ay, 0, 0.3 + 0.45 * k);
      continue;
    }
    if (clean) {
      drawZoneClean(ctx, z.x, z.y, z.r, z.color, now, k);
      continue;
    }
    ctx.fillStyle = hexA(z.color, fancy ? 0.16 * k + 0.06 : 0.05);
    ctx.strokeStyle = hexA(z.color, fancy ? 0.5 * k : 0.4 * k + 0.1);
    ctx.lineWidth = fancy ? 2 : 1.5;
    ctx.beginPath();
    ctx.ellipse(z.x, z.y, z.r, z.r * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // 단순: 테두리만(떨어지는 줄기 없음)
    if (!fancy) continue;
    for (let i = 0; i < 4; i++) {
      const ph = (((now / 260 + i * 0.27 + z.x * 0.01) % 1) + 1) % 1;
      const ox = Math.sin(i * 2.3 + z.y) * z.r * 0.6;
      ctx.strokeStyle = hexA(z.color, 0.8 * (1 - ph));
      ctx.beginPath();
      ctx.moveTo(z.x + ox, z.y - 110 + ph * 90);
      ctx.lineTo(z.x + ox, z.y - 90 + ph * 90);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  // 곧 용암·허공이 될 칸: 붉게 깜빡인다
  if (v.warn) {
    const t = s.terrain;
    ctx.fillStyle = `rgba(255,70,40,${0.25 + 0.25 * Math.abs(Math.sin(now / 120))})`;
    for (const c of v.warn.cells) ctx.fillRect((c % t.w) * CELL, Math.floor(c / t.w) * CELL, CELL, CELL);
  }
  // 적이 남긴 웅덩이(불·독·서리): 가장자리가 끓고 안쪽에 거품
  for (const z of s.foeZones) {
    if (!inView(z.x, z.y, z.r)) continue;
    drawFoeZone(ctx, z, now, s.t);
  }
  // 예고 모양(띠·부채꼴·고리, 2026-11-22): 안쪽이 차오르면 떨어진다
  for (const m of s.slams) {
    if (!m.shape || m.shape === 'circle') continue;
    const k = Math.min(1, (s.t - m.born) / Math.max(0.01, m.at - m.born));
    ctx.save();
    ctx.fillStyle = hexA(m.color, 0.1 + 0.16 * k);
    slamPath(ctx, m, 1);
    ctx.fill();
    ctx.fillStyle = hexA(m.color, 0.22 + 0.2 * k);
    slamPath(ctx, m, k);
    ctx.fill();
    // 떨어지기 직전 0.2초는 하얗게 번쩍
    if (m.at - s.t < 0.2) {
      ctx.fillStyle = `rgba(255,255,255,${0.25 * Math.abs(Math.sin(now / 30))})`;
      slamPath(ctx, m, 1);
      ctx.fill();
    }
    ctx.restore();
  }
  // 예고 원(내려찍기·낙석): 안쪽이 차오르면 떨어진다
  for (const m of s.slams) {
    if (m.shape && m.shape !== 'circle') continue;
    const wimg = kindImg(art, 'foe_warn', m.color, { ms: now });
    if (wimg) {
      const S = (m.r * 2) / KG.foe_warn.span;
      blit(ctx, wimg, m.x, m.y, S, S * 0.65, KG.foe_warn.ax, KG.foe_warn.ay, 0, 0.9);
    }
    const k = Math.min(1, (s.t - m.born) / Math.max(0.01, m.at - m.born));
    ctx.strokeStyle = hexA(m.color, 0.85);
    ctx.fillStyle = hexA(m.color, 0.12 + 0.2 * k);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(m.x, m.y, m.r, m.r * 0.65, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = hexA(m.color, 0.3);
    ctx.beginPath();
    ctx.ellipse(m.x, m.y, m.r * k, m.r * 0.65 * k, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // 결 조각·물건
  for (const g of s.gems) {
    if (!inView(g.x, g.y)) continue;
    const big = g.xp >= 10;
    if (drawItemIcon(ctx, art, 'gem', g.x, g.y, big ? 22 : 14)) continue;
    ctx.fillStyle = big ? '#ffd27a' : g.xp >= 3 ? '#7fd6c8' : '#8fd3ff';
    const r = big ? 8 : 5;
    ctx.beginPath();
    ctx.moveTo(g.x, g.y - r);
    ctx.lineTo(g.x + r * 0.7, g.y);
    ctx.lineTo(g.x, g.y + r);
    ctx.lineTo(g.x - r * 0.7, g.y);
    ctx.closePath();
    ctx.fill();
  }
  for (const it of s.items) {
    if (!inView(it.x, it.y, 200) || (it.hidden && !isExplored(s, it.x, it.y))) continue;
    const pd = ITEMS.get(it.kind)?.place;
    if (pd) {
      drawPlaceGround(ctx, it, ITEMS.get(it.kind)!.color, pd.radius, now, Math.hypot(p.x - it.x, p.y - it.y) < pd.radius);
      continue;
    }
    const bob = Math.sin(now / 200 + it.x) * 3;
    // 빛기둥: 멀리서도 보이게
    const evItem = ITEMS.get(it.kind)?.event;
    if (evItem) {
      const col = ITEMS.get(it.kind)!.color;
      const g = ctx.createLinearGradient(it.x, it.y - 120, it.x, it.y);
      g.addColorStop(0, hexA(col, 0));
      g.addColorStop(1, hexA(col, 0.4));
      ctx.fillStyle = g;
      ctx.fillRect(it.x - 10, it.y - 120, 20, 120);
    }
    const prop = it.kind === 'chest' ? art.props?.images[3] : null;
    if (prop) ctx.drawImage(prop, it.x - 22, it.y - 36 + bob, 44, 44);
    else if (!drawItemIcon(ctx, art, it.kind, it.x, it.y - 12 + bob, it.kind === 'chest' ? 34 : 26)) {
      const d = ITEMS.get(it.kind);
      ctx.fillStyle = d?.color ?? '#f1efe6';
      ctx.strokeStyle = '#1d2433';
      ctx.lineWidth = 2;
      if (it.kind === 'chest') {
        ctx.fillRect(it.x - 13, it.y - 22 + bob, 26, 18);
        ctx.strokeRect(it.x - 13, it.y - 22 + bob, 26, 18);
        ctx.fillStyle = '#ffe08a';
        ctx.fillRect(it.x - 2, it.y - 17 + bob, 4, 6);
      } else {
        ctx.beginPath();
        ctx.arc(it.x, it.y - 12 + bob, it.kind === 'merchant' || it.kind === 'shrine' || it.kind === 'cursed' ? 15 : 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#1d2433';
        ctx.font = '700 12px "Noto Serif KR", serif';
        ctx.textAlign = 'center';
        ctx.fillText(d?.glyph ?? '?', it.x, it.y - 8 + bob);
      }
    }
  }

  // 결계(그림): 인물·그림자 밑, 반투명으로 발밑에 깐다(2026-11-21 — 위에 그리면 인물을 가린다)
  for (const w of s.weapons) {
    const d = WEAPONS.get(w.id)!;
    if (d.kind !== 'aura') continue;
    const L = d.levels[Math.min(w.lv, d.levels.length) - 1];
    const R = 90 * L.area * stat.area(s);
    const aimg = fancy ? kindImg(art, 'aura', d.color, { ms: now + w.id.length * 53 }) : null;
    if (aimg) {
      const S = (R * 2) / KG.aura.span;
      blit(ctx, aimg, p.x, p.y - 4, S, S * 0.7, KG.aura.ax, KG.aura.ay, 0, 0.5 * fxa);
      continue;
    }
    if (clean) {
      drawAuraClean(ctx, p.x, p.y - 4, R, d.color, now, fxa);
      continue;
    }
    // 단순: 움직이지 않는 얇은 테두리 하나
    ctx.strokeStyle = hexA(d.color, 0.38 * fxa + 0.08);
    ctx.fillStyle = hexA(d.color, 0.035);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y - 4, R, R * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  // 그림자·소품·쓰러짐·인물: y 순서
  const draws: { y: number; fn: () => void }[] = [];
  for (const pr of s.props) {
    if (!pr.alive || !inView(pr.x, pr.y)) continue;
    draws.push({
      y: pr.y,
      fn: () => {
        const img = art.props?.images[pr.kind];
        if (img) return void ctx.drawImage(img, pr.x - 20, pr.y - 34, 40, 40);
        // 대체: 항아리 · 등불
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(pr.x, pr.y, 11, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        if (pr.kind === 0) {
          ctx.fillStyle = '#8f5a3a';
          ctx.beginPath();
          ctx.ellipse(pr.x, pr.y - 11, 10, 12, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#5a3420';
          ctx.fillRect(pr.x - 6, pr.y - 25, 12, 4);
        } else {
          ctx.fillStyle = '#3a3440';
          ctx.fillRect(pr.x - 2, pr.y - 30, 4, 30);
          ctx.fillStyle = `rgba(255,200,110,${0.75 + 0.2 * Math.sin(now / 180 + pr.x)})`;
          ctx.fillRect(pr.x - 7, pr.y - 40, 14, 12);
        }
      },
    });
  }
  for (const it of s.items) {
    const pd = ITEMS.get(it.kind)?.place;
    if (!pd || !inView(it.x, it.y, 200) || (it.hidden && !isExplored(s, it.x, it.y))) continue;
    draws.push({ y: it.y, fn: () => drawPlace(ctx, art, s, it, pd, now) });
  }
  for (const f of s.foes) {
    if (!inView(f.x, f.y, 140)) continue;
    ensureFoeArt(art, f.def.id);
    // 땅속(땅굴 그림자): 몸은 숨고 흙더미만 꿈틀
    if (f.burrowUntil && s.t < f.burrowUntil) {
      draws.push({
        y: f.y,
        fn: () => {
          ctx.fillStyle = '#5a4430';
          ctx.beginPath();
          ctx.ellipse(f.x, f.y, 14 + Math.sin(now / 60) * 2, 6, 0, 0, Math.PI * 2);
          ctx.fill();
        },
      });
      continue;
    }
    const fa = art.foes.get(f.def.id);
    // 걷기(Codex 그림이 오면): 멈춰 있지 않으면 걷기 그림
    const moving = !(s.t < s.freezeUntil || s.t < f.stunUntil || f.fuseAt);
    const a = (moving && fa?.walk) || fa?.idle;
    const vcol = f.variant ? RULES.variants.list.find((x) => x.id === f.variant)?.color : undefined;
    const ecol = f.element ? ELEM_COLOR[f.element] : undefined;
    const tcol = vcol ?? f.def.tint ?? ecol;
    const sc = f.def.scale * (f.scale ?? 1);
    draws.push({
      y: f.y,
      fn: () => {
        // 속성 그림자: 발밑에 속성 빛
        if (ecol) {
          ctx.fillStyle = hexA(ecol, 0.22 + 0.1 * Math.sin(now / 200 + f.uid));
          ctx.beginPath();
          ctx.ellipse(f.x, f.y, f.def.radius * 1.4 * (f.scale ?? 1), f.def.radius * 0.55, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(f.x, f.y, f.def.radius * 0.9, f.def.radius * 0.35, 0, 0, Math.PI * 2);
        ctx.fill();
        const img = a ? frame(a, now, f.uid * 97) : null;
        const frozen = s.t < s.freezeUntil;
        const bob = frozen ? 0 : Math.abs(Math.sin(now / 140 + f.uid)) * 3 + (f.def.fly ? 10 + Math.sin(now / 300 + f.uid) * 4 : 0);
        const fuse = f.fuseAt && Math.floor(now / 80) % 2 === 0;
        if (a && img) {
          const flip = p.x > f.x;
          const rot = frozen ? 0 : Math.sin(now / 160 + f.uid) * 0.05;
          const sq = Math.max(0, 1 - (s.t - f.hitAt) / 0.12);
          drawSpriteAt(ctx, a, img, f.x, f.y - bob, sc, flip, rot, 1, sq);
          // 변종·속성 색(옅게 덧칠) — 강화된 놈은 금빛 테
          if (tcol) drawSpriteAt(ctx, a, tintOf(img, a.meta.frameW, a.meta.frameH, tcol), f.x, f.y - bob, sc, flip, rot, f.variant === 'veteran' ? 0.28 : 0.34, sq);
          if (s.t - f.hitAt < 0.08 || fuse) {
            // 맞은 순간: 하얀 실루엣(2026-11-21 타격감)
            drawSpriteAt(ctx, a, fuse ? tintOf(img, a.meta.frameW, a.meta.frameH, '#ff3a2a') : whiteOf(img, a.meta.frameW, a.meta.frameH), f.x, f.y - bob, sc, flip, rot, 0.85, sq);
          }
        } else {
          ctx.fillStyle = s.t - f.hitAt < 0.08 ? '#ffffff' : '#3a2a40';
          ctx.beginPath();
          ctx.arc(f.x, f.y - f.def.radius, f.def.radius, 0, Math.PI * 2);
          ctx.fill();
        }
        if (frozen || s.t < f.slowUntil) {
          ctx.fillStyle = frozen ? 'rgba(159,230,255,0.4)' : 'rgba(159,230,255,0.25)';
          ctx.beginPath();
          ctx.ellipse(f.x, f.y - 2, f.def.radius, f.def.radius * 0.4, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        // 자폭: 터질 범위가 붉게 조여 든다(남은 시간 = 고리가 닫히는 만큼)
        if (f.fuseAt) {
          const fz = f.def.fuse ?? RULES.variants.list.find((x) => x.id === f.variant)?.fuse;
          const R = fz?.radius ?? 80;
          const left = Math.max(0, f.fuseAt - s.t) / (fz?.delay ?? 0.6);
          ctx.strokeStyle = `rgba(255,58,42,${0.9 - left * 0.4})`;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.ellipse(f.x, f.y, R, R * 0.65, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = `rgba(255,58,42,${0.12 + 0.25 * (1 - left)})`;
          ctx.beginPath();
          ctx.ellipse(f.x, f.y, R * (1 - left), R * 0.65 * (1 - left), 0, 0, Math.PI * 2);
          ctx.fill();
        }
        // 방패 그림자의 보호: 푸른 막
        if (f.guardUntil && s.t < f.guardUntil) {
          ctx.strokeStyle = `rgba(159,216,255,${0.55 + 0.25 * Math.sin(now / 90)})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.ellipse(f.x, f.y - f.def.radius, f.def.radius * 1.4, f.def.radius * 1.7, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        // 속성 그림자: 몸 둘레 불티·눈송이·번개·독방울
        if (ecol && (f.uid + Math.floor(now / 120)) % 3 === 0) {
          const k = ((now / 500 + f.uid * 0.13) % 1);
          ctx.fillStyle = hexA(ecol, 0.9 * (1 - k));
          ctx.fillRect(f.x + Math.sin(f.uid * 7 + k * 6) * f.def.radius, f.y - f.def.radius * 2 - k * 18, 3, 3);
        }
        // 변종 표식: 머리 위 작은 마름모(색 = 변종)
        if (vcol && !f.elite) {
          const hy = f.y - f.def.radius * 2.6 * (f.scale ?? 1) - 6;
          ctx.fillStyle = vcol;
          ctx.strokeStyle = '#1d2433';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(f.x, hy - 5);
          ctx.lineTo(f.x + 4, hy);
          ctx.lineTo(f.x, hy + 5);
          ctx.lineTo(f.x - 4, hy);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
        if (f.golden || f.elite) {
          // 금빛 그림자·정예: 몸에 빛을 두른다
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = f.golden ? `rgba(255,210,90,${0.35 + 0.15 * Math.sin(now / 90)})` : 'rgba(255,90,74,0.22)';
          ctx.beginPath();
          ctx.ellipse(f.x, f.y - f.def.radius, f.def.radius * 1.3, f.def.radius * 1.5, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        if (f.def.rank === 'elite' || f.elite || f.golden) {
          const w = f.def.radius * 2.4;
          ctx.fillStyle = 'rgba(0,0,0,0.6)';
          ctx.fillRect(f.x - w / 2, f.y + 6, w, 5);
          ctx.fillStyle = f.golden ? '#ffe08a' : '#ffb02e';
          ctx.fillRect(f.x - w / 2, f.y + 6, (w * Math.max(0, f.hp)) / f.maxHp, 5);
          if (f.affixes?.length) {
            // 수식어 글자(심연과 같은 글자)
            ctx.font = '700 13px "Song Myung", serif';
            ctx.textAlign = 'center';
            ctx.lineWidth = 3;
            ctx.strokeStyle = 'rgba(10,6,8,0.9)';
            ctx.fillStyle = '#ff8a5c';
            const txt = f.affixes.map((id) => AFFIXES.find((a) => a.id === id)?.name ?? '').join(' · ');
            ctx.strokeText(txt, f.x, f.y + 26);
            ctx.fillText(txt, f.x, f.y + 26);
          }
        }
      },
    });
  }
  for (const m of v.marks) {
    if (m.e.type !== 'kill') continue;
    const e = m.e;
    const fa = art.foes.get(e.foe);
    const def = FOES.get(e.foe);
    if (!fa || !def) continue;
    const age = now - m.born;
    draws.push({
      y: e.y - 1,
      fn: () => {
        if (fa.death) {
          const n = Math.min(fa.death.meta.frames, 1 + Math.floor(age / (1000 / Math.max(10, fa.death.meta.fps))));
          const img = fa.death.images[n - 1];
          if (img) drawSpriteAt(ctx, fa.death, img, e.x, e.y, def.scale, !m.flip, 0, age > 900 ? Math.max(0, 1 - (age - 900) / 400) : 1);
        } else if (fa.idle) {
          const k = Math.min(1, age / 350);
          const img = fa.idle.images[0];
          if (img) drawSpriteAt(ctx, fa.idle, img, e.x, e.y, def.scale * (1 - 0.3 * k), !m.flip, (m.flip ? -1 : 1) * k * 1.2, 1 - k);
        }
      },
    });
  }
  draws.push({ y: p.y, fn: () => drawHero(ctx, s, art, now) });
  draws.sort((a, b) => a.y - b.y);
  for (const d of draws) d.fn();

  // 둘레 칼·결계(내 것 — 세기 옵션)
  ctx.globalAlpha = fxa;
  const area = stat.area(s);
  for (const w of s.weapons) {
    const d = WEAPONS.get(w.id)!;
    const L = d.levels[Math.min(w.lv, d.levels.length) - 1];
    if (d.kind === 'orbit') {
      const period = L.cooldown * stat.haste(s);
      if (!(L.duration >= period || s.t % period < L.duration)) continue;
      const R = 72 * L.area * area;
      for (let i = 0; i < L.count; i++) {
        const a = s.t * L.speed + (i / L.count) * Math.PI * 2;
        const bx = p.x + Math.cos(a) * R;
        const by = p.y - 24 + Math.sin(a) * R * 0.8;
        const oimg = fancy ? kindImg(art, 'orbit', d.color, { ms: now + i * 37 }) : null;
        if (oimg) {
          const S = (36 * area) / KG.orbit.span;
          blit(ctx, oimg, bx, by, S, S, KG.orbit.ax, KG.orbit.ay);
          continue;
        }
        if (clean) {
          drawBladeClean(ctx, bx, by, a + Math.PI / 2 * Math.sign(L.speed || 1), 15 * area, d.color, R, a, L.speed, p.x, p.y - 24);
          continue;
        }
        if (!fancy) {
          // 단순: 작은 알 하나(빛 번짐·회전 그림 없음)
          ctx.fillStyle = 'rgba(16,14,22,0.8)';
          ctx.beginPath();
          ctx.arc(bx, by, 7 * area + 1.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = d.color;
          ctx.beginPath();
          ctx.arc(bx, by, 7 * area, 0, Math.PI * 2);
          ctx.fill();
          continue;
        }
        const g = ctx.createRadialGradient(bx, by, 0, bx, by, 18 * area);
        g.addColorStop(0, 'rgba(255,255,255,0.95)');
        g.addColorStop(0.45, hexA(d.color, 0.8));
        g.addColorStop(1, hexA(d.color, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(bx, by, 18 * area, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (d.kind === 'aura') {
      const R = 90 * L.area * area;
      // 결계는 발밑에 이미 깔았다(y 순서 앞) — 단순·그림 모두
      continue;
      ctx.strokeStyle = hexA(d.color, 0.35 + 0.1 * Math.sin(now / 200));
      ctx.fillStyle = hexA(d.color, 0.07);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - 10, R, R * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
  // 내 탄(적 탄은 맨 위에 따로)
  for (const sh of s.shots) {
    if (!sh.weapon || !inView(sh.x, sh.y)) continue;
    const sk = sh.weapon ? WEAPONS.get(sh.weapon)?.kind : undefined;
    const simg = sk === 'wave' || sk === 'bolt' ? kindImg(art, sk, sh.color, { ms: now + sh.x }) : null;
    if (simg) {
      // 검기: 초승달 높이(칸 55%)가 탄 지름, 탄: 머리(칸 22%)가 탄 지름의 1.3배
      const g = sk === 'wave' ? KG.wave : KG.bolt;
      const S = (sh.r * (sk === 'wave' ? 2.2 : 2.4)) / g.span;
      blit(ctx, simg, sh.x, sh.y, S, S, g.ax, g.ay, Math.atan2(sh.vy, sh.vx));
      continue;
    }
    ctx.save();
    ctx.translate(sh.x, sh.y);
    ctx.rotate(Math.atan2(sh.vy, sh.vx));
    const len = sh.weapon ? sh.r * 2.6 : sh.r * 1.8;
    const g = ctx.createLinearGradient(-len, 0, sh.r, 0);
    g.addColorStop(0, hexA(sh.color, 0));
    g.addColorStop(0.7, hexA(sh.color, 0.9));
    g.addColorStop(1, '#ffffff');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(-len / 2 + sh.r / 2, 0, len / 2 + sh.r / 2, sh.r * (sh.weapon && WEAPONS.get(sh.weapon)?.kind === 'wave' ? 1 : 0.65), 0, 0, Math.PI * 2);
    ctx.fill();
    if (!sh.weapon) {
      // 적 탄은 테두리로 또렷하게
      ctx.strokeStyle = 'rgba(20,10,10,0.8)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  // 잠깐 남는 연출
  for (const m of v.marks) {
    const e = m.e;
    const age = (now - m.born) / 1000;
    ctx.globalAlpha = PLAYER_FX.has(e.type) ? fxa : 1;
    // 새 적 기술(2026-11-22): 띠·부채꼴·고리가 떨어진 순간 · 회복 · 보호 · 땅굴 · 웅덩이
    if (e.type === 'skill' && e.kind && SKILL_MARK.has(e.kind)) {
      const fa = art.foeFx.get(e.kind === 'zone' ? 'explode' : e.kind);
      if (fa && age < fa.meta.frames / fa.meta.fps) {
        // Codex 그림(흰·회색): 적 기술 색을 입혀 모양 크기에 맞춘다
        const n = Math.min(fa.meta.frames - 1, Math.floor(age * fa.meta.fps));
        const img = fa.images[n];
        const size = e.kind === 'line' ? (e.len ?? 300) : (e.r ?? 60) * 2.2;
        if (img) {
          ctx.save();
          ctx.translate(e.x, e.y);
          if (e.kind === 'line' || e.kind === 'cone') ctx.rotate(e.angle ?? 0);
          const w = size;
          const h = (size * fa.meta.frameH) / fa.meta.frameW;
          ctx.drawImage(img, e.kind === 'line' || e.kind === 'cone' ? 0 : -w / 2, -h / 2, w, h);
          ctx.restore();
        }
        continue;
      }
      if (age < 0.5) drawSkillMark(ctx, e, age);
      continue;
    }
    // 적 기술 그림(내려찍기 떨어짐·돌진·부르기·터짐)
    if (e.type === 'skill' && !e.fx) {
      const kind = e.kind === 'charge' ? 'foe_charge' : e.kind === 'summon' ? 'foe_summon' : 'foe_slam';
      const g = KG[kind];
      const img = kindImg(art, kind, e.color, { k: age / 0.4 });
      if (img) {
        if (age < 0.4) blit(ctx, img, e.x, e.y - (kind === 'foe_charge' ? 20 : 0), 90 / g.span, 90 / g.span, g.ax, g.ay, kind === 'foe_charge' ? (e.angle ?? 0) : 0);
        continue;
      }
    }
    if (e.type === 'burst') {
      const img = kindImg(art, 'foe_burst', '#ff8a5c', { k: age / 0.35 });
      if (img) {
        if (age < 0.35) blit(ctx, img, e.x, e.y - 10, (e.r * 2) / KG.foe_burst.span, (e.r * 2) / KG.foe_burst.span, KG.foe_burst.ax, KG.foe_burst.ay);
        continue;
      }
    }
    if (e.type === 'counter') {
      // 간파!
      const k = age / 0.9;
      if (k > 1) continue;
      ctx.strokeStyle = `rgba(255,224,138,${1 - k})`;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - 24, 40 + k * 120, (40 + k * 120) * 0.7, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.font = '800 26px "Song Myung", serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 5;
      ctx.strokeStyle = `rgba(20,10,10,${1 - k})`;
      ctx.fillStyle = `rgba(255,224,138,${1 - k})`;
      ctx.strokeText('간파', p.x, p.y - 90 - k * 20);
      ctx.fillText('간파', p.x, p.y - 90 - k * 20);
      continue;
    }
    if (e.type === 'fall') {
      const k = age / 0.5;
      if (k > 1) continue;
      ctx.strokeStyle = `rgba(255,150,80,${1 - k})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(e.x, e.y, 10 + k * 30, (10 + k * 30) * 0.5, 0, 0, Math.PI * 2);
      ctx.stroke();
      continue;
    }
    if (e.type === 'slash' && clean) {
      const k = age / 0.22;
      if (k > 1) continue;
      drawSlashClean(ctx, e.x, e.y - 20, e.r, e.angle, e.arc, e.color, k);
      continue;
    }
    if (e.type === 'slash' && !fancy) {
      // 단순: 얇은 호 하나, 짧게
      const k = age / 0.16;
      if (k > 1) continue;
      ctx.strokeStyle = hexA(e.color, 0.6 * (1 - k));
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(e.x, e.y - 20, e.r * 0.85, e.angle - e.arc / 2, e.angle + e.arc / 2);
      ctx.stroke();
      continue;
    }
    if (e.type === 'slash') {
      const img = kindImg(art, 'slash', e.color, { k: age / 0.25 });
      if (img) {
        // 초승달이 칸 가운데에서 칸 너비 35% 떨어져 돈다
        if (age < 0.25) blit(ctx, img, e.x, e.y - 20, e.r / KG.slash.span, e.r / KG.slash.span, KG.slash.ax, KG.slash.ay, e.angle);
        continue;
      }
      const k = age / 0.18;
      if (k > 1) continue;
      ctx.strokeStyle = hexA(e.color, 0.9 * (1 - k));
      ctx.lineWidth = 10 * (1 - k) + 2;
      ctx.beginPath();
      ctx.arc(e.x, e.y - 20, e.r * (0.7 + 0.3 * k), e.angle - e.arc / 2, e.angle + e.arc / 2);
      ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${0.8 * (1 - k)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(e.x, e.y - 20, e.r * (0.62 + 0.3 * k), e.angle - e.arc / 2.6, e.angle + e.arc / 2.6);
      ctx.stroke();
    } else if (e.type === 'nova') {
      const k = age / 0.45;
      if (k > 1) continue;
      if (clean) {
        drawNovaClean(ctx, e.x, e.y - 10, e.r, e.color, k);
        continue;
      }
      if (!fancy) {
        // 단순: 퍼지는 얇은 고리 하나
        ctx.strokeStyle = hexA(e.color, 0.45 * (1 - k));
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(e.x, e.y - 10, e.r * k, e.r * k * 0.75, 0, 0, Math.PI * 2);
        ctx.stroke();
        continue;
      }
      // 그림 앞 두 칸(가운데 번쩍임)은 크게 늘리면 인물을 가린다 — 고리 칸부터, 작게 시작해 퍼지게
      const img = kindImg(art, 'nova', e.color, { k: 0.34 + 0.66 * k });
      if (img) {
        const S = ((e.r * 2) / KG.nova.span) * (0.45 + 0.55 * Math.min(1, k * 2.5));
        blit(ctx, img, e.x, e.y - 10, S, S * 0.75, KG.nova.ax, KG.nova.ay, 0, 0.9);
        continue;
      }
      ctx.strokeStyle = hexA(e.color, 0.8 * (1 - k));
      ctx.lineWidth = 8 * (1 - k) + 2;
      ctx.beginPath();
      ctx.ellipse(e.x, e.y - 10, e.r * k, e.r * k * 0.75, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (e.type === 'strike' || e.type === 'skill') {
      const k = age / 0.45;
      if (k > 1) continue;
      const fx = e.fx ? art.fx.get(e.fx) : null;
      const r = e.type === 'strike' ? e.r : 70;
      if (fx) {
        const n = Math.min(fx.meta.frames - 1, Math.floor(k * fx.meta.frames));
        const img = fx.images[n];
        const size = r * 3.2;
        if (img) ctx.drawImage(img, e.x - size / 2, e.y - size * 0.7, size, size);
      } else if (e.type === 'strike' && art.kinds.has('strike')) {
        // 바닥 닿는 곳이 칸 높이 75%, 땅 고리가 칸 너비 절반쯤
        const img = kindImg(art, 'strike', e.color, { k });
        if (img) blit(ctx, img, e.x, e.y, (r * 2) / KG.strike.span, (r * 2) / KG.strike.span, KG.strike.ax, KG.strike.ay);
      } else {
        ctx.fillStyle = hexA(e.color, 0.7 * (1 - k));
        if (e.type === 'strike') ctx.fillRect(e.x - 6 * (1 - k) - 2, e.y - 400, 12 * (1 - k) + 4, 400);
        ctx.beginPath();
        ctx.ellipse(e.x, e.y, r * (0.5 + k), r * 0.45 * (0.5 + k), 0, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (e.type === 'burst' || e.type === 'bomb' || e.type === 'prop') {
      const life = e.type === 'bomb' ? 0.6 : 0.3;
      const k = age / life;
      if (k > 1) continue;
      const r = e.type === 'bomb' ? 650 : e.type === 'burst' ? e.r : 26;
      ctx.strokeStyle = e.type === 'prop' ? `rgba(220,180,120,${1 - k})` : `rgba(255,170,90,${1 - k})`;
      ctx.lineWidth = e.type === 'bomb' ? 10 * (1 - k) + 2 : 4;
      ctx.beginPath();
      ctx.ellipse(e.x, e.y - 10, r * k, r * 0.7 * k, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (e.type === 'chain') {
      const k = age / 0.25;
      if (k > 1) continue;
      const img = kindImg(art, 'chain', e.color, { k });
      if (img) {
        // 그림은 칸 10%~90%를 가로지른다 — 두 적 사이에 늘인다
        for (let i = 1; i < e.pts.length; i++) {
          const [x0, y0] = e.pts[i - 1];
          const [x1, y1] = e.pts[i];
          const len = Math.hypot(x1 - x0, y1 - y0);
          blit(ctx, img, x0, y0, len / KG.chain.span, 90, KG.chain.ax, KG.chain.ay, Math.atan2(y1 - y0, x1 - x0));
        }
        continue;
      }
      ctx.strokeStyle = hexA(e.color, 1 - k);
      ctx.lineWidth = 3;
      ctx.beginPath();
      e.pts.forEach(([x, y], i) => {
        // 번개처럼 꺾이게
        const j = i ? ((hash(Math.round(x), Math.round(y)) % 17) - 8) : 0;
        if (i) ctx.lineTo(x + j, y - j);
        else ctx.moveTo(x, y);
      });
      ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${0.8 * (1 - k)})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    } else if (e.type === 'beam') {
      const k = age / 0.25;
      if (k > 1) continue;
      const img = kindImg(art, 'beam', e.color, { k });
      if (img) {
        // 그림의 빛줄기(칸 10%~90%, 두께 18%)를 길이·너비에 맞춘다
        blit(ctx, img, e.x, e.y, e.len / KG.beam.span, (e.w * 2) / KG.beam.thick, KG.beam.ax, KG.beam.ay, e.angle);
        continue;
      }
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.angle);
      ctx.fillStyle = hexA(e.color, 0.55 * (1 - k));
      ctx.fillRect(0, -e.w * (1 - k * 0.5), e.len, e.w * 2 * (1 - k * 0.5));
      ctx.fillStyle = `rgba(255,255,255,${0.85 * (1 - k)})`;
      ctx.fillRect(0, -e.w * 0.25, e.len, e.w * 0.5);
      ctx.restore();
    } else if (e.type === 'heal') {
      const k = age / 0.7;
      if (k > 1) continue;
      const img = fancy && age < 0.45 ? kindImg(art, 'heal', '#7fe08a', { k: age / 0.45 }) : null;
      if (img) blit(ctx, img, p.x, p.y, 60 / KG.heal.span, 60 / KG.heal.span, KG.heal.ax, KG.heal.ay);
      else if (clean) drawHealClean(ctx, p.x, p.y, k);
      ctx.font = '700 14px "IBM Plex Sans KR", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = `rgba(120,230,120,${1 - k})`;
      ctx.fillText(`+${e.amount}`, p.x, p.y - 70 - k * 20);
    } else if (e.type === 'dash') {
      // 보법 자국: 베며 지나감·밀침은 길게, 점멸은 두 자리를 잇는 빛
      const k = age / 0.35;
      if (k > 1) continue;
      ctx.strokeStyle = hexA(e.color, 0.8 * (1 - k));
      ctx.lineWidth = (e.kind === 'charge' ? 26 : e.kind === 'cut' ? 10 : 4) * (1 - k * 0.6);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(e.x, e.y - 24);
      ctx.lineTo(e.x + (e.x2 - e.x) * (e.kind === 'blink' ? 1 : Math.min(1, k * 3)), e.y2 - 24 + (e.y2 - e.y) * 0);
      ctx.stroke();
      ctx.lineCap = 'butt';
    } else if (e.type === 'graze') {
      const k = age / 0.3;
      if (k > 1) continue;
      ctx.strokeStyle = `rgba(255,236,170,${1 - k})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(e.x, e.y - 20, RULES.dash.graze.radius * k, 0, Math.PI * 2);
      ctx.stroke();
    } else if (e.type === 'hit') {
      const k = age / 0.6;
      if (k > 1) continue;
      // 튀어나왔다가(크게) 줄며 떠오른다 — 치명은 더 크고 금빛, 옆으로 살짝 튄다
      const pop = age < 0.08 ? 1 + (e.crit ? 0.9 : 0.5) * (1 - age / 0.08) : 1;
      const size = (e.crit ? 20 : 13) * pop * (e.damage >= 100 ? 1.2 : 1);
      ctx.font = `${e.crit ? 900 : 700} ${Math.round(size)}px "IBM Plex Sans KR", sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = e.crit ? `rgba(255,214,90,${1 - k * k})` : `rgba(255,255,255,${0.9 * (1 - k * k)})`;
      ctx.strokeStyle = `rgba(0,0,0,${0.75 * (1 - k)})`;
      ctx.lineWidth = e.crit ? 4 : 3;
      const dx = (m.flip ? -1 : 1) * (e.crit ? 14 : 6) * k;
      const y = e.y - 44 - (1 - (1 - k) ** 2) * 30;
      const txt = e.crit ? `${e.damage}!` : String(e.damage);
      ctx.strokeText(txt, e.x + dx, y);
      ctx.fillText(txt, e.x + dx, y);
    }
  }
  ctx.globalAlpha = 1;
  v.marks = v.marks.filter((m) => now - m.born < (m.e.type === 'kill' ? 1400 : m.e.type === 'counter' ? 900 : 700));
  // 입자: 불티(가늘게 늘어진 빛) · 먹 조각(떨어져 튐) · 넋(흔들리며 올라감) · 터짐 고리
  {
    const dt = 1 / 60;
    ctx.save();
    for (const q of v.parts) {
      q.life += dt;
      q.vy += q.grav * dt;
      q.vx *= 0.96;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      const a = Math.max(0, 1 - q.life / q.max);
      if (q.kind === 'ring') {
        ctx.strokeStyle = hexA(q.color, a);
        ctx.lineWidth = 6 * a + 1;
        ctx.beginPath();
        ctx.ellipse(q.x, q.y, q.size * (0.4 + 0.8 * (1 - a)), q.size * 0.62 * (0.4 + 0.8 * (1 - a)), 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (q.kind === 'spark') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = hexA(q.color, a);
        ctx.lineWidth = q.size * 0.7;
        ctx.beginPath();
        ctx.moveTo(q.x, q.y);
        ctx.lineTo(q.x - q.vx * 0.03, q.y - q.vy * 0.03);
        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
      } else if (q.kind === 'soul') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = hexA(q.color, a * 0.8);
        ctx.beginPath();
        ctx.arc(q.x + Math.sin(q.life * 9 + q.size) * 4, q.y, q.size * (0.6 + a * 0.6), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      } else {
        ctx.fillStyle = hexA(q.color, Math.min(1, a * 1.5));
        ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
      }
    }
    ctx.restore();
    v.parts = v.parts.filter((q) => q.life < q.max);
  }
  // ── 맨 위: 적 탄 · 예고 원 테두리 · 인물 발 고리(내 이펙트에 묻히지 않게) ──
  for (const sh of s.shots) {
    if (sh.weapon || !inView(sh.x, sh.y)) continue;
    if (sh.style && sh.style !== 'orb') {
      const sa = art.shots.get(sh.style);
      const si = sa ? frame(sa, now, sh.x) : null;
      if (sa && si) {
        // Codex 탄 그림: 칸의 약 30%가 탄 길이 — 탄 반지름의 3배 길이로
        const S = (sh.r * 3) / (sa.meta.frameW * 0.3);
        ctx.save();
        ctx.translate(sh.x, sh.y);
        ctx.rotate(Math.atan2(sh.vy, sh.vx));
        ctx.drawImage(si, -sa.meta.frameW * S * 0.5, -sa.meta.frameH * S * 0.5, sa.meta.frameW * S, sa.meta.frameH * S);
        ctx.restore();
        continue;
      }
      drawFoeShot(ctx, sh, now);
      continue;
    }
    const img = kindImg(art, 'foe_shot', DANGER, { ms: now + sh.x });
    if (img) {
      const S = (sh.r * 2.4) / KG.foe_shot.span;
      blit(ctx, img, sh.x, sh.y, S, S, KG.foe_shot.ax, KG.foe_shot.ay, Math.atan2(sh.vy, sh.vx));
      continue;
    }
    // 대체: 검은 테두리 + 빛나는 알
    ctx.fillStyle = 'rgba(20,10,10,0.85)';
    ctx.beginPath();
    ctx.arc(sh.x, sh.y, sh.r + 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = DANGER;
    ctx.beginPath();
    ctx.arc(sh.x, sh.y, sh.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(sh.x - sh.r * 0.25, sh.y - sh.r * 0.25, sh.r * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const m of s.slams) {
    const k = Math.min(1, (s.t - m.born) / Math.max(0.01, m.at - m.born));
    if (m.shape && m.shape !== 'circle') {
      // 띠·부채꼴·고리 테두리: 맨 위에(인물·그림자에 가리지 않게)
      ctx.strokeStyle = 'rgba(20,10,10,0.7)';
      ctx.lineWidth = 4;
      slamPath(ctx, m, 1);
      ctx.stroke();
      ctx.strokeStyle = hexA(m.color, 0.6 + 0.4 * k);
      ctx.lineWidth = 2;
      ctx.stroke();
      continue;
    }
    ctx.strokeStyle = `rgba(20,10,10,0.7)`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(m.x, m.y, m.r, m.r * 0.65, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = hexA(m.color, 0.6 + 0.4 * k);
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  {
    // 인물 발 고리: 어디 있는지 늘 보이게
    ctx.strokeStyle = 'rgba(10,10,16,0.85)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 20, 8, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = s.t < s.counterUntil ? '#ffe08a' : '#f3ead8';
    ctx.lineWidth = 2;
    ctx.stroke();
    const w = 46;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(p.x - w / 2, p.y + 8, w, 5);
    ctx.fillStyle = p.hp / p.maxHp < 0.3 ? '#ff5a4a' : '#6fdc6a';
    ctx.fillRect(p.x - w / 2, p.y + 8, (w * p.hp) / p.maxHp, 5);
  }
  if (v.ultFlash) {
    const age = now - v.ultFlash.born;
    const a = art.fx.get(v.ultFlash.fx);
    const b = art.fx.get(v.ultFlash.fx.replace(/_a$/, '_b'));
    if (a) {
      const n = Math.floor(age / (1000 / (a.meta.fps || 20)));
      const sheet = n < a.meta.frames ? a : b;
      const idx = n < a.meta.frames ? n : n - a.meta.frames;
      const img = sheet && idx < sheet.meta.frames ? sheet.images[idx] : null;
      const size = Math.min(vw, vh) * 1.1;
      if (img) ctx.drawImage(img, p.x - size / 2, p.y - size / 2 - 30, size, size);
    }
    if (age > 1600) v.ultFlash = null;
  }

  // ── 화면 고정(CSS 픽셀) ──
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cw = W / dpr;
  const ch = H / dpr;
  if (s.t < s.slowUntil) {
    ctx.fillStyle = 'rgba(220,240,255,0.10)';
    ctx.fillRect(0, 0, cw, ch);
  }
  if (s.t < s.freezeUntil) {
    ctx.fillStyle = 'rgba(159,230,255,0.12)';
    ctx.fillRect(0, 0, cw, ch);
  }
  if (s.t < s.counterUntil) {
    // 간파 반격 시간: 가장자리가 금빛
    const g = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.3, cw / 2, ch / 2, Math.max(cw, ch) * 0.7);
    g.addColorStop(0, 'rgba(255,224,138,0)');
    g.addColorStop(1, `rgba(255,224,138,${s.t < s.slowmoUntil ? 0.35 : 0.18})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cw, ch);
  }
  if (effOn(s, 'fog')) {
    // 짙은 안개: 인물 둘레만 보인다
    const g = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.12, cw / 2, ch / 2, Math.min(cw, ch) * 0.42);
    g.addColorStop(0, 'rgba(200,205,215,0)');
    g.addColorStop(1, 'rgba(200,205,215,0.86)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cw, ch);
  }
  for (const f of [v.ultFlash && { born: v.ultFlash.born, color: v.ultFlash.color, life: 1200 }, v.flash && { ...v.flash, life: 500 }]) {
    if (!f) continue;
    const a = Math.max(0, 0.45 - (now - f.born) / f.life);
    if (a <= 0) continue;
    ctx.fillStyle = hexA(f.color, a);
    ctx.fillRect(0, 0, cw, ch);
  }
  const hk = (now - v.hurtFlash) / 300;
  if (hk < 1) {
    const g = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.3, cw / 2, ch / 2, Math.max(cw, ch) * 0.7);
    g.addColorStop(0, 'rgba(160,0,0,0)');
    g.addColorStop(1, `rgba(160,0,0,${0.45 * (1 - hk)})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cw, ch);
  }
  drawHud(ctx, s, art, v, now, cw, ch, opt);
}

function drawHero(ctx: CanvasRenderingContext2D, s: State, art: Art, now: number): void {
  const p = s.player;
  const flip = Math.cos(p.facing) < 0;
  const scale = 0.62;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, 22, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  const dashing = s.t < p.dashUntil;
  const blink = s.t < p.hurtUntil && Math.floor(now / 60) % 2 === 0;
  // 8방향: 위·아래·대각은 Codex 그림이 오면 그것(왼쪽은 오른쪽 그림을 뒤집는다), 아니면 옆 그림
  const dx = Math.cos(p.facing);
  const dy = Math.sin(p.facing);
  const D = art.hero.dirs;
  const dirKey = dy > 0.92 ? 'down' : dy < -0.92 ? 'up' : dy > 0.38 ? 'downside' : dy < -0.38 ? 'upside' : '';
  const dirAnim = dirKey ? (p.moving ? D[`walk_${dirKey}`] : D[`idle_${dirKey === 'downside' ? 'down' : dirKey === 'upside' ? 'up' : dirKey}`]) : null;
  void dx;
  const walk = p.moving && (dirAnim ?? art.hero.walk);
  const dead = s.result === 'lose' && art.hero.death;
  const a = dead ? art.hero.death : dirAnim ? dirAnim : walk ? art.hero.walk : art.hero.idle;
  if (!a) return;
  const img = dead ? a.images[a.images.length - 1] : frame(a, now);
  if (!img) return;
  const bob = p.moving && !walk ? Math.abs(Math.sin(now / 90)) * 5 : 0;
  const tilt = p.moving && !walk ? (flip ? -1 : 1) * (0.08 + Math.sin(now / 90) * 0.04) : 0;
  if (dashing) for (let i = 1; i <= 3; i++) drawSpriteAt(ctx, a, img, p.x - p.dashX * i * 16, p.y - p.dashY * i * 16, scale, flip, tilt, 0.18 * (4 - i));
  drawSpriteAt(ctx, a, img, p.x, p.y - bob, scale, flip, tilt, blink ? 0.4 : 1);
  if (s.t < p.shieldUntil) {
    // 막는 동안: 금빛 테두리(끝날 때 깜빡)
    const left = p.shieldUntil - s.t;
    if (left > 1 || Math.floor(now / 90) % 2 === 0) {
      ctx.strokeStyle = hexA(s.hero.ult.color, 0.75);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - 30, 34, 44, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  const w = 46;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(p.x - w / 2, p.y + 8, w, 5);
  ctx.fillStyle = p.hp / p.maxHp < 0.3 ? '#ff5a4a' : '#6fdc6a';
  ctx.fillRect(p.x - w / 2, p.y + 8, (w * p.hp) / p.maxHp, 5);
}

/** 오른쪽 위 지도: 지형은 장마다 한 번 그려 두고, 점(인물·그림자·보스·상자·물건)만 매번 */
function drawMinimap(ctx: CanvasRenderingContext2D, s: State, v: View, x: number, y: number, size: number, now: number): void {
  const t = s.terrain;
  // 가 본 곳만 그린다(안개) — 밝혀진 칸이 늘 때만 다시
  const known = s.explored.reduce((a, b) => a + b, 0);
  if (!v.minimap || v.minimapKnown !== known) {
    const c = v.minimap ?? document.createElement('canvas');
    c.width = t.w;
    c.height = t.h;
    const g = c.getContext('2d')!;
    const img = g.createImageData(t.w, t.h);
    const [floor, , wall, hazard] = s.chapter.color.map(rgb);
    for (let i = 0; i < t.w * t.h; i++) {
      const k = t.cells[i];
      const col = !s.explored[i] ? [10, 9, 14] : k === T.Wall ? wall : k === T.Hazard ? hazard : k === T.Bridge ? [110, 84, 64] : k === T.Slow ? floor.map((n) => n * 0.7) : floor;
      img.data.set([col[0], col[1], col[2], 255], i * 4);
    }
    g.putImageData(img, 0, 0);
    v.minimap = c;
    v.minimapKnown = known;
  }
  ctx.save();
  ctx.fillStyle = 'rgba(8,8,12,0.75)';
  ctx.fillRect(x - 3, y - 3, size + 6, size + 6);
  ctx.strokeStyle = 'rgba(243,234,216,0.45)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 3.5, y - 3.5, size + 7, size + 7);
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = 0.9;
  ctx.drawImage(v.minimap, x, y, size, size);
  ctx.globalAlpha = 1;
  const k = size / (t.w * CELL);
  const dot = (wx: number, wy: number, r: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(x + wx * k - r / 2, y + wy * k - r / 2, r, r);
  };
  // 그림자는 화면 둘레만, 물건은 가 본 곳만 — 보스·중간 보스는 늘 보인다(어디서 오는지 알 수 있게)
  const near = (x: number, y: number) => Math.abs(x - s.player.x) < s.view * 1.4 && Math.abs(y - s.player.y) < s.view;
  for (const f of s.foes) if (!f.def.rank && near(f.x, f.y)) dot(f.x, f.y, 2, '#ff5a4a');
  for (const it of s.items) if (isExplored(s, it.x, it.y)) dot(it.x, it.y, it.kind === 'chest' ? 5 : 3, it.kind === 'chest' ? '#ffd27a' : '#f3ead8');
  for (const f of s.foes) if (f.def.rank) dot(f.x, f.y, f.boss ? 8 : 6, f.boss ? '#ff2a3a' : '#ffb02e');
  // 화면에 보이는 범위
  ctx.strokeStyle = 'rgba(243,234,216,0.35)';
  ctx.strokeRect(x + (s.player.x - s.view) * k, y + (s.player.y - s.view * 0.6) * k, s.view * 2 * k, s.view * 1.2 * k);
  dot(s.player.x, s.player.y, 5 + Math.sin(now / 200), '#7fd6ff');
  ctx.restore();
}

/** 아래 상태창: 무공 칸 · 심법 칸(아이콘 · Lv 점). 무한 모드 10+10칸처럼 한 줄에 안 들어가면 두 줄(위 무공 · 아래 심법) */
export const statusLayout = (s: State, W: number): { slot: number; rows: 1 | 2; w: number } => {
  const n = s.slots.weapons + s.slots.passives;
  for (const slot of W < 640 ? [26, 22] : [34, 30]) {
    const w = n * (slot + 4) + 14;
    if (w <= W - 24) return { slot, rows: 1, w };
  }
  const slot = Math.max(20, Math.min(34, Math.floor((W - 24 - 14) / Math.max(s.slots.weapons, s.slots.passives)) - 4));
  return { slot, rows: 2, w: Math.max(s.slots.weapons, s.slots.passives) * (slot + 4) + 14 };
};
function drawStatusBar(ctx: CanvasRenderingContext2D, s: State, art: Art, x: number, y0: number, slot: number, rows: 1 | 2 = 1): void {
  const slots = s.slots;
  const gap = 4;
  const totalW = rows === 1 ? (slots.weapons + slots.passives) * (slot + gap) + 14 : Math.max(slots.weapons, slots.passives) * (slot + gap) + 6;
  const rowH = slot + 18;
  const top = y0 - (rows - 1) * rowH;
  ctx.fillStyle = 'rgba(8,8,12,0.72)';
  ctx.fillRect(x - 8, top - 8, totalW, rows * rowH + 4);
  ctx.strokeStyle = 'rgba(243,234,216,0.25)';
  ctx.strokeRect(x - 8.5, top - 8.5, totalW, rows * rowH + 4);
  let y = y0;
  const cellAt2 = (i: number, extra: number) => (rows === 2 && i >= slots.weapons ? x + (i - slots.weapons) * (slot + gap) : x + i * (slot + gap) + extra);
  const drawSlot = (cx: number, id: string | null, lv: number, max: number, color: string, label: string, evolved: boolean) => {
    ctx.fillStyle = id ? 'rgba(30,26,36,0.95)' : 'rgba(30,26,36,0.4)';
    ctx.fillRect(cx, y, slot, slot);
    ctx.strokeStyle = id ? hexA(color, 0.9) : 'rgba(243,234,216,0.15)';
    ctx.strokeRect(cx + 0.5, y + 0.5, slot - 1, slot - 1);
    if (!id) return;
    const idx = SKILL_ICON.get(id) ?? -1;
    // 1~3번 시트는 손으로 맞춘 35개(16·16·3), 그 뒤(간파 심법 둘, 2026-11-21)는 4번 시트
    const sheet = idx >= 0 ? art.skills[idx < 35 ? Math.floor(idx / 16) : 3] : null;
    const img = sheet?.images[idx < 35 ? idx % 16 : idx - 35];
    const card = cardIcon(WEAPONS.get(id)?.card ?? PASSIVES.get(id)?.card);
    // 카드 그림(가로 3:2)은 가운데를 네모로 잘라 칸에
    if (card) ctx.drawImage(card, card.naturalWidth * 0.17, 0, card.naturalWidth * 0.66, card.naturalHeight, cx + 3, y + 3, slot - 6, slot - 6);
    else if (img) ctx.drawImage(img, cx + 3, y + 3, slot - 6, slot - 6);
    else {
      ctx.fillStyle = hexA(color, 0.35);
      ctx.fillRect(cx + 3, y + 3, slot - 6, slot - 6);
      ctx.fillStyle = '#f3ead8';
      ctx.font = `800 ${Math.round(slot * 0.42)}px "Nanum Myeongjo", serif`;
      ctx.textAlign = 'center';
      ctx.fillText(label, cx + slot / 2, y + slot * 0.66);
    }
    // Lv 점(각성은 별)
    ctx.textAlign = 'center';
    if (evolved) {
      ctx.fillStyle = '#ffd27a';
      ctx.font = '800 11px sans-serif';
      ctx.fillText('★', cx + slot / 2, y + slot + 11);
      return;
    }
    for (let i = 0; i < max; i++) {
      ctx.fillStyle = i < lv ? '#ffd27a' : 'rgba(243,234,216,0.2)';
      ctx.fillRect(cx + slot / 2 - (max * 6) / 2 + i * 6, y + slot + 4, 4, 4);
    }
  };
  if (rows === 2) y = top;
  for (let i = 0; i < slots.weapons; i++) {
    const w = s.weapons[i];
    const d = w ? WEAPONS.get(w.id)! : null;
    drawSlot(cellAt2(i, 0), w?.id ?? null, w?.lv ?? 0, d?.levels.length ?? 5, d?.color ?? '#888', d?.name[0] ?? '', !!d?.evolved);
    // 각성 조건(Lv.5 + 짝 심법)이 갖춰지면 반짝 — 상자를 열면 각성
    if (w && d?.evolve && w.lv >= d.levels.length && s.passives.has(d.evolve.with)) {
      ctx.strokeStyle = '#ffd27a';
      ctx.lineWidth = 2;
      ctx.strokeRect(cellAt2(i, 0) - 1, y - 1, slot + 2, slot + 2);
      ctx.lineWidth = 1;
    }
  }
  if (rows === 2) y = y0;
  const ps = [...s.passives.entries()];
  for (let i = 0; i < slots.passives; i++) {
    const [id, lv] = ps[i] ?? [null, 0];
    const pd = id ? PASSIVES.get(id) : null;
    drawSlot(cellAt2(slots.weapons + i, 14), id, lv, pd?.max ?? 5, '#c8b4ff', pd?.name[0] ?? '', false);
  }
  ctx.fillStyle = 'rgba(243,234,216,0.35)';
  if (rows === 1) ctx.fillRect(cellAt2(slots.weapons, 4), y + 4, 2, slot - 8);
  y = top;
  // 속성 세트(같은 효과 무공 수) — 켜진 것은 금빛
  const ec = elementCounts(s);
  const sets = (Object.keys(RULES.sets).filter((k) => k !== '$comment') as (keyof typeof RULES.sets)[]).filter((k) => ec[k]);
  ctx.font = '700 11px "IBM Plex Sans KR", sans-serif';
  ctx.textAlign = 'left';
  let sx = x - 8;
  for (const k of sets) {
    const on = (ec[k] ?? 0) >= RULES.sets[k].need;
    const label = `${RULES.sets[k].name} ${ec[k]}/${RULES.sets[k].need}`;
    ctx.fillStyle = on ? '#ffd27a' : 'rgba(243,234,216,0.6)';
    ctx.fillText(label, sx, y - 14);
    sx += ctx.measureText(label).width + 12;
  }
}

function drawHud(ctx: CanvasRenderingContext2D, s: State, art: Art, v: View, now: number, W: number, H: number, opt: Options): void {
  const font = (px: number, wt = 700) => `${wt} ${px}px "IBM Plex Sans KR", "Nanum Myeongjo", sans-serif`;
  const need = xpNeed(s.level);
  ctx.fillStyle = 'rgba(8,10,16,0.75)';
  ctx.fillRect(0, 0, W, 12);
  ctx.fillStyle = '#4fb4ff';
  ctx.fillRect(0, 0, (W * Math.min(1, s.xp / need)) | 0, 12);
  ctx.font = font(10);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#fff';
  ctx.fillText(`Lv.${s.level}`, 6, 10);
  // 연격(2026-11-22 타격감): 잇달아 쓰러뜨린 수 — 왼쪽 가운데, 오를 때마다 튀고 25마다 크게
  const cAge = now - v.combo.at;
  if (v.combo.n >= 5 && cAge < 2500) {
    const pop = cAge < 110 ? 1 + 0.35 * (1 - cAge / 110) : 1;
    const big = now - v.combo.pop < 600 ? 1 + 0.5 * (1 - (now - v.combo.pop) / 600) : 1;
    const a = Math.min(1, (2500 - cAge) / 500);
    const x = 18;
    const y = Math.round(H * 0.42);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(x, y);
    ctx.scale(pop * big, pop * big);
    ctx.textAlign = 'left';
    ctx.font = font(34, 900);
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(10,6,8,0.85)';
    const col = v.combo.n >= 100 ? '#ff5a4a' : v.combo.n >= 50 ? '#ffb02e' : v.combo.n >= 25 ? '#ffd27a' : '#f3ead8';
    ctx.strokeText(String(v.combo.n), 0, 0);
    ctx.fillStyle = col;
    ctx.fillText(String(v.combo.n), 0, 0);
    const nw = ctx.measureText(String(v.combo.n)).width;
    ctx.font = font(14, 800);
    ctx.strokeText('연격', nw + 6, -4);
    ctx.fillStyle = '#f3ead8';
    ctx.fillText('연격', nw + 6, -4);
    // 사라지기까지 남은 띠
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 8, 80, 3);
    ctx.fillStyle = col;
    ctx.fillRect(0, 8, 80 * (1 - cAge / 2500), 3);
    ctx.restore();
  }
  // 시계: 장에 남은 시간(무한 모드는 버틴 시간)
  const endless = s.mode === 'endless';
  const left = Math.max(0, CHAPTER_LENGTH - s.t);
  const over = !endless && s.t > CHAPTER_LENGTH;
  const clock = endless ? fmt(s.t) : over ? `+${fmt(s.t - CHAPTER_LENGTH)}` : fmt(left);
  ctx.textAlign = 'center';
  ctx.font = font(28, 800);
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.strokeText(clock, W / 2, 46);
  ctx.fillStyle = over ? '#ff5a4a' : '#f3ead8';
  ctx.fillText(clock, W / 2, 46);
  ctx.font = font(12, 600);
  ctx.fillStyle = 'rgba(243,234,216,0.78)';
  const next = s.timeline.find((e) => e.at > s.t && (e.kind === 'bigwave' || e.kind === 'mid' || e.kind === 'boss'));
  const nextName = next ? (next.kind === 'bigwave' ? '빅웨이브' : next.kind === 'mid' ? '중간 보스' : '보스') : '';
  // 좁은 화면(휴대폰 세로)에서는 지도와 겹치지 않게 다음 이정표만
  const narrow = W < 520;
  if (endless) {
    const info = endlessInfo(s);
    const b = s.boss;
    const enr = b && !b.dead && b.bornAt !== undefined ? RULES.endless.boss.enrage - (s.t - b.bornAt) : null;
    ctx.fillStyle = info.enraged ? '#ff5a4a' : 'rgba(243,234,216,0.78)';
    ctx.fillText(b && !b.dead ? (info.enraged ? '광폭화 — 어서 쓰러뜨려라!' : `광폭화까지 ${fmt(Math.max(0, enr ?? 0))}`) : `보스 ${info.stage}회 넘김 · 다음 보스까지 ${fmt(info.bossIn)}`, W / 2, 64);
  } else
  ctx.fillText(over ? '틈 폭주 — 보스를 쓰러뜨려라' : `${narrow ? '' : s.chapter.name}${next ? `${narrow ? '' : ' · '}${nextName}까지 ${fmt(next.at - s.t)}` : ''}`, narrow ? W / 2 - 40 : W / 2, 64);
  // 보스 체력 띠
  if (s.boss && !s.boss.dead) {
    const bw = Math.min(520, W - 260);
    const bx = (W - bw) / 2;
    ctx.fillStyle = 'rgba(8,6,10,0.75)';
    ctx.fillRect(bx - 4, 74, bw + 8, 22);
    ctx.fillStyle = '#5a1020';
    ctx.fillRect(bx, 84, bw, 8);
    ctx.fillStyle = '#e0303a';
    ctx.fillRect(bx, 84, (bw * Math.max(0, s.boss.hp)) / s.boss.maxHp, 8);
    ctx.font = font(10, 700);
    ctx.fillStyle = '#f3ead8';
    ctx.fillText(s.boss.def.name, W / 2, 82);
  }
  // 왼쪽 위: 쓰러뜨림·금화
  ctx.textAlign = 'left';
  ctx.font = font(12, 700);
  ctx.fillStyle = '#f3ead8';
  ctx.fillText(`쓰러뜨림 ${s.chapterKills}`, 10, 32);
  ctx.fillStyle = '#ffd27a';
  ctx.fillText(`금화 ${s.gold}`, 10, 50);
  ctx.fillStyle = 'rgba(243,234,216,0.7)';
  ctx.font = font(11, 600);
  // 좁은 화면에서는 시계 줄과 겹치니 줄인다
  if (W >= 640) ctx.fillText(`밝힌 땅 ${Math.min(100, Math.round(exploredShare(s) * 100))}% · 다시 뽑기 ${s.rerolls} · 봉인 ${s.banishes} · 건너뛰기 ${s.skips}`, 10, 66);
  if (s.trial) {
    ctx.font = font(14, 800);
    ctx.fillStyle = '#ff8a5c';
    ctx.fillText(`수련 제단 ${Math.ceil(s.trial.until - s.t)}초 · ${s.chapterKills - s.trial.start}/${s.trial.goal}`, 10, 86);
  }
  if (s.checkpoint) {
    ctx.font = font(11, 600);
    ctx.fillStyle = '#bfe3a0';
    ctx.fillText('중간 보스 뒤에서 다시 할 수 있다', 10, s.trial ? 104 : 86);
  }
  // 오른쪽 위 지도
  const mapSize = opt.map === 'large' ? Math.min(220, W * 0.3) : Math.min(150, W * 0.28);
  drawMinimap(ctx, s, v, W - mapSize - 12, 20, mapSize, now);
  // 아래 상태창
  const lay = statusLayout(s, W);
  drawStatusBar(ctx, s, art, Math.max(10, (W - lay.w) / 2), H - lay.slot - 22, lay.slot, lay.rows);
  // 알림 띠
  if (v.banner) {
    const age = now - v.banner.born;
    if (age > 2600) v.banner = null;
    else {
      const a = Math.min(1, age / 200, (2600 - age) / 400);
      const big = v.banner.kind === 'boss' || v.banner.kind === 'bigwave' || v.banner.kind === 'mid';
      ctx.textAlign = 'center';
      ctx.font = font(big ? 24 : 16, 800);
      const yy = H * 0.26;
      ctx.fillStyle = `rgba(8,6,10,${0.6 * a})`;
      ctx.fillRect(0, yy - (big ? 32 : 24), W, big ? 46 : 34);
      ctx.fillStyle = big ? `rgba(255,90,74,${a})` : v.banner.kind === 'chest' ? `rgba(255,224,138,${a})` : `rgba(243,234,216,${a})`;
      ctx.fillText(v.banner.text, W / 2, yy);
    }
  }
}

const fmt = (t: number) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

function rgb(hex: string): number[] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, '$1$1') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function shade(hex: string, k: number): string {
  const [r, g, b] = rgb(hex).map((c) => Math.max(0, Math.min(255, Math.round(k > 0 ? c + (255 - c) * k : c * (1 + k)))));
  return `rgb(${r},${g},${b})`;
}
function hexA(hex: string, a: number): string {
  const [r, g, b] = rgb(hex);
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a))})`;
}

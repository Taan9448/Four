// 「틈」 엔진(2026-11-18 2차): 스토리 한 장(15분)을 지형 판 위에서 돌린다. 순수 함수 + 시드 RNG — 화면(render.ts)·입력(main.ts)과 떨어져 있어
// 테스트·봇이 그대로 돌린다. 무공은 종류(kind)마다 움직임이 정해져 있고 수치는 data — 무공·적별 코드는 없다(GAME_DESIGN 4·8절).
import { createRng, type Rng } from '../../src/engine/rng';
import rulesRaw from '../data/rules.json';
import storyRaw from '../data/story.json';
import foesRaw from '../data/foes.json';
import weaponsRaw from '../data/weapons.json';
import heroesRaw from '../data/heroes.json';
import { blocksShot, buildTerrain, CELL, cellAt, flowDir, moveCircle, T, updateFlow, walkable, type Terrain, type TerrainDef } from './terrain';

export type Kind = 'slash' | 'bolt' | 'wave' | 'orbit' | 'nova' | 'aura' | 'strike' | 'rain';
export interface WeaponLevel {
  damage: number;
  cooldown: number;
  area: number;
  count: number;
  speed: number;
  pierce: number;
  duration: number;
}
export interface WeaponDef {
  id: string;
  name: string;
  owner: string;
  kind: Kind;
  desc: string;
  color: string;
  levels: WeaponLevel[];
  element?: 'ice' | 'fire';
  knock?: number;
  fx?: string;
  evolved?: boolean;
  evolve?: { with: string; into: string };
}
export interface PassiveDef {
  id: string;
  name: string;
  desc: string;
  stat: string;
  per: number;
  max: number;
}
export type FoeSkill =
  | { kind: 'aimed'; every: number; damage: number; speed: number; color: string; fx?: string }
  | { kind: 'fan'; every: number; count: number; spread: number; damage: number; speed: number; color: string }
  | { kind: 'radial'; every: number; count: number; damage: number; speed: number; color: string }
  | { kind: 'slam'; every: number; damage: number; radius: number; delay: number; color: string; count: number; fx?: string }
  | { kind: 'charge'; every: number; damage: number }
  | { kind: 'summon'; every: number; foe: string; count: number };
export interface FoeDef {
  id: string;
  name: string;
  ref?: string;
  sprite: string;
  role: string;
  hp: number;
  speed: number;
  damage: number;
  xp: number;
  radius: number;
  scale: number;
  rank?: 'elite' | 'boss';
  move?: 'chase' | 'charge' | 'ranged' | 'burst';
  fly?: boolean;
  element?: string;
  skills?: FoeSkill[];
}
export interface HeroDef {
  id: string;
  name: string;
  title: string;
  sprite: string;
  stand: string;
  hp: number;
  speed: number;
  armor?: number;
  start: string;
  pool: string[];
  ult: { id: string; name: string; damage: number; heal?: number; color: string };
  unlock: null | { kind: 'chapter'; chapter: number; text: string };
}
type Role = 'main' | 'fast' | 'tank' | 'ranged' | 'fly' | 'prev';
interface SpawnDef {
  from: number;
  to: number;
  rate: [number, number];
  mix: Partial<Record<Role, number>>;
}
export interface TimelineEvent {
  at: number;
  kind: 'swarm' | 'ring' | 'bigwave' | 'mid' | 'boss' | 'rain' | 'blizzard';
  role?: Role;
  mix?: Partial<Record<Role, number>>;
  count?: number;
  text: string;
  dur?: number;
  every?: number;
  damage?: number;
  radius?: number;
  color?: string;
  slow?: number;
}
export interface ChapterDef {
  id: string;
  name: string;
  stage: string;
  line: string;
  ground: string;
  terrain: string;
  cg: string;
  /** 바닥 · 바닥 무늬 · 벽 · 위험(용암·물·허공) */
  color: [string, string, string, string];
  terrainDef: TerrainDef;
  roles: Record<Role, string[]> & { mid: string; boss: string };
  hp: number;
  dmg: number;
  rate: number;
  extra: TimelineEvent[];
}

export const RULES = rulesRaw as unknown as {
  player: { hp: number; speed: number; radius: number; pickup: number; hurtCooldown: number; slots: { weapons: number; passives: number } };
  dash: { duration: number; speed: number; cooldown: number; graze: { radius: number; damage: number } };
  ult: { max: number; kill: number; elite: number; boss: number; radius: number };
  xp: { base: number; perLevel: number; square: number };
  foes: { max: number; spawnRadius: [number, number]; despawn: number; hpPerMinute: number; overtimeDamagePerMinute: number; separation: number };
  drops: Record<'food' | 'herb' | 'magnet' | 'bomb' | 'frost' | 'gold', number> & { foodHeal: number };
  props: { hp: number; drops: Record<string, number> };
  items: { bomb: { damage: number; radius: number }; frost: { seconds: number } };
};
export const STORY = storyRaw as unknown as {
  difficulties: { id: string; name: string; open: boolean; note?: string }[];
  timeline: { length: number; spawns: SpawnDef[]; events: TimelineEvent[]; chests: { every: number; min: number; max: number } };
  chapters: ChapterDef[];
};
export const FOES = new Map((foesRaw.foes as unknown as FoeDef[]).map((f) => [f.id, f]));
export const WEAPONS = new Map((weaponsRaw.weapons as unknown as WeaponDef[]).map((w) => [w.id, w]));
export const PASSIVES = new Map((weaponsRaw.passives as PassiveDef[]).map((p) => [p.id, p]));
export const HEROES = heroesRaw.heroes as unknown as HeroDef[];
export const CHAPTER_LENGTH = STORY.timeline.length;

export const DT = 1 / 60;

export interface Foe {
  uid: number;
  def: FoeDef;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  damage: number;
  vx: number;
  vy: number;
  hitAt: number;
  slowUntil: number;
  burnUntil: number;
  /** 기술마다 다음 쓸 때 */
  skillAt: number[];
  /** 돌진: 끝나는 때 */
  dashUntil: number;
  dashAt: number;
  /** 터지는 놈: 불이 붙은 때 */
  fuseAt: number;
  dead: boolean;
  boss?: boolean;
}
export interface Shot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  damage: number;
  life: number;
  color: string;
  weapon?: string;
  pierce: number;
  hit?: Set<number>;
  element?: 'ice' | 'fire';
  knock?: number;
}
export interface Zone {
  x: number;
  y: number;
  r: number;
  damage: number;
  until: number;
  every: number;
  next: number;
  weapon: string;
  color: string;
  element?: 'ice' | 'fire';
}
/** 붉게 예고한 원(내려찍기·낙석·화살비) — at에 맞는다 */
export interface Slam {
  x: number;
  y: number;
  r: number;
  damage: number;
  born: number;
  at: number;
  color: string;
  fx?: string;
}
export interface Gem {
  x: number;
  y: number;
  xp: number;
  pulled: boolean;
  taken?: boolean;
}
export type ItemKind = 'food' | 'herb' | 'magnet' | 'bomb' | 'frost' | 'gold' | 'chest';
export interface Item {
  x: number;
  y: number;
  kind: ItemKind;
  taken?: boolean;
}
export interface Prop {
  x: number;
  y: number;
  alive: boolean;
  kind: number;
}
export interface OwnedWeapon {
  id: string;
  lv: number;
  next: number;
  ringAt?: number;
  ringHit?: Set<number>;
  touched?: Map<number, number>;
}
export type FxEvent =
  | { type: 'slash'; x: number; y: number; angle: number; r: number; arc: number; color: string }
  | { type: 'nova'; x: number; y: number; r: number; color: string; weapon: string }
  | { type: 'strike'; x: number; y: number; r: number; color: string; fx?: string }
  | { type: 'hit'; x: number; y: number; damage: number; crit: boolean }
  | { type: 'kill'; x: number; y: number; foe: string; rank?: string }
  | { type: 'hurt'; damage: number }
  | { type: 'level'; level: number }
  | { type: 'chest'; text: string }
  | { type: 'item'; kind: ItemKind; x: number; y: number }
  | { type: 'graze'; x: number; y: number }
  | { type: 'ult'; x: number; y: number; fx: string; color: string }
  | { type: 'event'; text: string; kind: string }
  | { type: 'skill'; x: number; y: number; fx?: string; color: string }
  | { type: 'burst'; x: number; y: number; r: number }
  | { type: 'prop'; x: number; y: number }
  | { type: 'bomb'; x: number; y: number }
  | { type: 'freeze' }
  | { type: 'clear' };
export interface Choice {
  kind: 'weapon' | 'passive' | 'food' | 'gold';
  id: string;
  lv: number;
}
export interface Input {
  x: number;
  y: number;
  dash?: boolean;
  ult?: boolean;
}
/** 장을 넘어 이어 가는 것(자동 저장) */
export interface Carry {
  hero: string;
  level: number;
  xp: number;
  weapons: { id: string; lv: number }[];
  passives: [string, number][];
  bonusHp: number;
  gold: number;
  kills: number;
  playTime: number;
}
export interface State {
  seed: string;
  rng: Rng;
  hero: HeroDef;
  chapter: ChapterDef;
  chapterIndex: number;
  terrain: Terrain;
  t: number;
  player: {
    x: number;
    y: number;
    hp: number;
    maxHp: number;
    facing: number;
    moving: boolean;
    hurtUntil: number;
    dashUntil: number;
    dashReady: number;
    dashX: number;
    dashY: number;
    grazed: Set<number>;
  };
  level: number;
  xp: number;
  weapons: OwnedWeapon[];
  passives: Map<string, number>;
  bonusHp: number;
  foes: Foe[];
  shots: Shot[];
  zones: Zone[];
  slams: Slam[];
  gems: Gem[];
  items: Item[];
  props: Prop[];
  ult: number;
  kills: number;
  chapterKills: number;
  gold: number;
  playTime: number;
  bossKills: string[];
  boss: Foe | null;
  pending: Choice[] | null;
  queuedLevels: number;
  nextEvent: number;
  events: FxEvent[];
  result: null | 'clear' | 'lose';
  uid: number;
  spawnCarry: number;
  flowAt: number;
  chestAt: number;
  freezeUntil: number;
  slowUntil: number;
  slowMul: number;
  rains: { until: number; every: number; next: number; damage: number; radius: number; color: string }[];
  /** 화면에 보이는 반지름(무작위 낙뢰 등) */
  view: number;
}

export function xpNeed(level: number): number {
  const x = RULES.xp;
  return Math.round(x.base + x.perLevel * (level - 1) + x.square * (level - 1) ** 2);
}

const pv = (s: State, id: string): number => (s.passives.get(id) ?? 0) * (PASSIVES.get(id)?.per ?? 0);
export const stat = {
  might: (s: State) => 1 + pv(s, 'might'),
  haste: (s: State) => Math.max(0.35, 1 - pv(s, 'haste')),
  area: (s: State) => 1 + pv(s, 'area'),
  speed: (s: State) => RULES.player.speed * s.hero.speed * (1 + pv(s, 'swift')) * (s.t < s.slowUntil ? s.slowMul : 1),
  armor: (s: State) => (s.hero.armor ?? 0) + pv(s, 'vigor'),
  regen: (s: State) => pv(s, 'breath'),
  crit: (s: State) => pv(s, 'grain'),
  pickup: (s: State) => RULES.player.pickup * (1 + pv(s, 'yoke')),
  xpMul: (s: State) => 1 + (s.passives.get('yoke') ?? 0) * 0.05,
};

export const freshCarry = (hero: string): Carry => {
  const h = HEROES.find((x) => x.id === hero) ?? HEROES[0];
  return { hero: h.id, level: 1, xp: 0, weapons: [{ id: h.start, lv: 1 }], passives: [], bonusHp: 0, gold: 0, kills: 0, playTime: 0 };
};

/** 한 장을 연다. carry가 있으면 레벨·무공·심법을 이어받는다(체력은 가득) */
export function createChapter(chapterIndex: number, seed: string, carry: Carry): State {
  const hero = HEROES.find((h) => h.id === carry.hero) ?? HEROES[0];
  const chapter = STORY.chapters[Math.max(0, Math.min(STORY.chapters.length - 1, chapterIndex))];
  const rng = createRng(`teum:${seed}:${chapter.id}`);
  const terrain = buildTerrain(chapter.terrainDef, rng.fork('terrain'));
  const passives = new Map(carry.passives);
  const maxHp = hero.hp + carry.bonusHp + (passives.get('vigor') ?? 0) * 10;
  const s: State = {
    seed,
    rng: rng.fork('run'),
    hero,
    chapter,
    chapterIndex,
    terrain,
    t: 0,
    player: { x: terrain.start.x, y: terrain.start.y, hp: maxHp, maxHp, facing: 0, moving: false, hurtUntil: 0, dashUntil: 0, dashReady: 0, dashX: 1, dashY: 0, grazed: new Set() },
    level: carry.level,
    xp: carry.xp,
    weapons: carry.weapons.map((w) => ({ id: w.id, lv: w.lv, next: 0.5 })),
    passives,
    bonusHp: carry.bonusHp,
    foes: [],
    shots: [],
    zones: [],
    slams: [],
    gems: [],
    items: [],
    props: terrain.props.map((p, i) => ({ ...p, alive: true, kind: i % 2 })),
    ult: 0,
    kills: carry.kills,
    chapterKills: 0,
    gold: carry.gold,
    playTime: carry.playTime,
    bossKills: [],
    boss: null,
    pending: null,
    queuedLevels: 0,
    nextEvent: 0,
    events: [],
    result: null,
    uid: 1,
    spawnCarry: 0,
    flowAt: -1,
    chestAt: STORY.timeline.chests.every,
    freezeUntil: 0,
    slowUntil: 0,
    slowMul: 1,
    rains: [],
    view: 560,
  };
  updateFlow(terrain, s.player.x, s.player.y);
  return s;
}

/** 장 끝(또는 저장)에 이어 갈 것 */
export function carryOf(s: State): Carry {
  return {
    hero: s.hero.id,
    level: s.level,
    xp: s.xp,
    weapons: s.weapons.map((w) => ({ id: w.id, lv: w.lv })),
    passives: [...s.passives.entries()],
    bonusHp: s.bonusHp,
    gold: s.gold,
    kills: s.kills,
    playTime: s.playTime,
  };
}

/** 장의 시간표: 공통 틀 + 그 장만의 이벤트(시간 순) */
export const chapterEvents = (c: ChapterDef): TimelineEvent[] => [...STORY.timeline.events, ...c.extra].sort((a, b) => a.at - b.at);

const lvOf = (w: OwnedWeapon): WeaponLevel => {
  const d = WEAPONS.get(w.id)!;
  return d.levels[Math.min(w.lv, d.levels.length) - 1];
};

function nearest(s: State, x: number, y: number, skip?: Set<number>): Foe | null {
  let best: Foe | null = null;
  let bd = Infinity;
  for (const f of s.foes) {
    if (f.dead || skip?.has(f.uid)) continue;
    const d = (f.x - x) ** 2 + (f.y - y) ** 2;
    if (d < bd) {
      bd = d;
      best = f;
    }
  }
  return best;
}

function damageFoe(s: State, f: Foe, base: number, knock = 0, element?: 'ice' | 'fire'): void {
  if (f.dead) return;
  const crit = s.rng.next() < stat.crit(s);
  const dmg = Math.round(base * stat.might(s) * (crit ? 2 : 1));
  f.hp -= dmg;
  f.hitAt = s.t;
  if (element === 'ice') f.slowUntil = s.t + 1.2;
  if (element === 'fire') f.burnUntil = s.t + 2;
  if (knock && !f.def.rank) {
    const dx = f.x - s.player.x;
    const dy = f.y - s.player.y;
    const d = Math.hypot(dx, dy) || 1;
    const [nx, ny] = f.def.fly ? [f.x + (dx / d) * knock, f.y + (dy / d) * knock] : moveCircle(s.terrain, f.x, f.y, (dx / d) * knock, (dy / d) * knock, f.def.radius * 0.6);
    f.x = nx;
    f.y = ny;
  }
  if (s.events.length < 400) s.events.push({ type: 'hit', x: f.x, y: f.y, damage: dmg, crit });
  if (f.hp <= 0) killFoe(s, f);
}

/** 깨지는 것(항아리·등불): 무공이 닿으면 깨져 물건을 떨군다 */
function hitProps(s: State, x: number, y: number, r: number): void {
  for (const p of s.props) {
    if (!p.alive || (p.x - x) ** 2 + (p.y - y) ** 2 > (r + 16) ** 2) continue;
    p.alive = false;
    s.events.push({ type: 'prop', x: p.x, y: p.y });
    const drops = RULES.props.drops;
    const kind = s.rng.weighted(Object.keys(drops), (k) => drops[k]) as ItemKind;
    s.items.push({ x: p.x, y: p.y, kind });
  }
}

function killFoe(s: State, f: Foe): void {
  f.dead = true;
  s.kills++;
  s.chapterKills++;
  const rank = f.def.rank;
  s.ult = Math.min(RULES.ult.max, s.ult + (rank === 'boss' ? RULES.ult.boss : rank === 'elite' ? RULES.ult.elite : RULES.ult.kill));
  s.events.push({ type: 'kill', x: f.x, y: f.y, foe: f.def.id, rank });
  if (f.def.xp > 0) s.gems.push({ x: f.x, y: f.y, xp: f.def.xp * (1 + 0.15 * s.chapterIndex), pulled: false });
  if (rank) s.items.push({ x: f.x, y: f.y, kind: 'chest' });
  else {
    const r = s.rng.next();
    let acc = 0;
    for (const k of ['herb', 'bomb', 'frost', 'magnet', 'food', 'gold'] as const) {
      acc += RULES.drops[k];
      if (r < acc) {
        s.items.push({ x: f.x, y: f.y, kind: k });
        break;
      }
    }
  }
  if (f.boss) {
    s.bossKills.push(f.def.id);
    s.result = 'clear';
    s.events.push({ type: 'clear' });
  }
}

function spawnFoe(s: State, id: string, x: number, y: number, boss = false): Foe | null {
  const def = FOES.get(id);
  if (!def) return null;
  if (!boss && !def.rank && s.foes.length >= RULES.foes.max) return null;
  const minute = s.t / 60;
  const ch = s.chapter;
  const hp = Math.round(def.hp * ch.hp * (1 + RULES.foes.hpPerMinute * minute * (def.rank === 'boss' ? 0.3 : 1)));
  const f: Foe = {
    uid: s.uid++,
    def,
    x,
    y,
    hp,
    maxHp: hp,
    damage: def.damage * ch.dmg,
    vx: 0,
    vy: 0,
    hitAt: -9,
    slowUntil: 0,
    burnUntil: 0,
    skillAt: (def.skills ?? []).map((k) => s.t + k.every * (0.4 + s.rng.next() * 0.6)),
    dashUntil: 0,
    dashAt: s.t + 1 + s.rng.next() * 2,
    fuseAt: 0,
    dead: false,
    boss,
  };
  s.foes.push(f);
  if (boss) s.boss = f;
  return f;
}

/** 인물 둘레(min~max) 걸을 수 있는 자리. 나는 놈은 벽만 아니면 */
function spawnPoint(s: State, fly: boolean, min = RULES.foes.spawnRadius[0], max = RULES.foes.spawnRadius[1], angle?: number): [number, number] | null {
  const W = s.terrain.w * CELL;
  const H = s.terrain.h * CELL;
  for (let i = 0; i < 14; i++) {
    const a = angle !== undefined ? angle + (s.rng.next() - 0.5) * 0.5 : s.rng.next() * Math.PI * 2;
    const r = min + s.rng.next() * (max - min);
    const x = s.player.x + Math.cos(a) * r;
    const y = s.player.y + Math.sin(a) * r;
    if (x < CELL || y < CELL || x > W - CELL || y > H - CELL) continue;
    if (fly ? cellAt(s.terrain, x, y) !== T.Wall : walkable(s.terrain, x, y)) return [x, y];
  }
  return null;
}

const rolePool = (c: ChapterDef, role: Role): string[] => (c.roles[role]?.length ? c.roles[role] : c.roles.main);
function pickRole(s: State, mix: Partial<Record<Role, number>>): string {
  const roles = Object.keys(mix) as Role[];
  const role = s.rng.weighted(roles, (r) => mix[r] ?? 0) ?? 'main';
  const pool = rolePool(s.chapter, role);
  return pool[s.rng.int(0, pool.length - 1)];
}
function spawnAround(s: State, id: string, min?: number, max?: number, angle?: number): Foe | null {
  const def = FOES.get(id);
  if (!def) return null;
  const pt = spawnPoint(s, !!def.fly, min, max, angle);
  return pt ? spawnFoe(s, id, pt[0], pt[1]) : null;
}

function runTimeline(s: State): void {
  const evs = chapterEvents(s.chapter);
  while (s.nextEvent < evs.length && s.t >= evs[s.nextEvent].at) {
    const ev = evs[s.nextEvent++];
    const c = s.chapter;
    const label = ev.kind === 'mid' ? `중간 보스 — ${FOES.get(c.roles.mid)?.name}` : ev.kind === 'boss' ? `보스 — ${FOES.get(c.roles.boss)?.name}` : ev.text;
    s.events.push({ type: 'event', text: label, kind: ev.kind });
    // 무리 수도 장의 빠르기 배율을 따른다(1장은 적게)
    const n = Math.round((ev.count ?? 20) * c.rate);
    switch (ev.kind) {
      case 'swarm': {
        const a = s.rng.next() * Math.PI * 2;
        for (let i = 0; i < n; i++) spawnAround(s, pickRole(s, { [ev.role ?? 'main']: 1 }), 600, 760, a);
        break;
      }
      case 'ring':
        for (let i = 0; i < n; i++) spawnAround(s, pickRole(s, { [ev.role ?? 'main']: 1 }), 360, 420, (i / n) * Math.PI * 2);
        break;
      case 'bigwave':
        for (let i = 0; i < n; i++) spawnAround(s, pickRole(s, ev.mix ?? { main: 1 }), 560, 900, (i / n) * Math.PI * 2);
        break;
      case 'mid':
      case 'boss': {
        const id = ev.kind === 'mid' ? c.roles.mid : c.roles.boss;
        const pt = spawnPoint(s, false, 460, 560) ?? [s.player.x + 480, s.player.y];
        spawnFoe(s, id, pt[0], pt[1], ev.kind === 'boss');
        for (let i = 0; i < n; i++) spawnAround(s, pickRole(s, { main: 2, fast: 1, ranged: 1 }), 520, 860, (i / n) * Math.PI * 2);
        break;
      }
      case 'rain':
        s.rains.push({ until: s.t + (ev.dur ?? 20), every: ev.every ?? 0.6, next: s.t, damage: (ev.damage ?? 10) * c.dmg, radius: ev.radius ?? 60, color: ev.color ?? '#ff4a4a' });
        break;
      case 'blizzard':
        s.slowUntil = s.t + (ev.dur ?? 30);
        s.slowMul = ev.slow ?? 0.75;
        break;
    }
  }
  // 늘 나오는 무리
  const sp = STORY.timeline.spawns.find((x) => s.t >= x.from && s.t < x.to);
  if (sp && s.foes.length < RULES.foes.max) {
    const k = Math.min(1, (s.t - sp.from) / Math.max(1, Math.min(sp.to, CHAPTER_LENGTH) - sp.from));
    s.spawnCarry += (sp.rate[0] + (sp.rate[1] - sp.rate[0]) * k) * s.chapter.rate * DT;
    while (s.spawnCarry >= 1) {
      s.spawnCarry -= 1;
      spawnAround(s, pickRole(s, sp.mix));
    }
  }
  // 판 곳곳의 보물상자
  if (s.t >= s.chestAt) {
    s.chestAt = s.t + STORY.timeline.chests.every;
    const pt = spawnPoint(s, false, STORY.timeline.chests.min, STORY.timeline.chests.max);
    if (pt) {
      s.items.push({ x: pt[0], y: pt[1], kind: 'chest' });
      s.events.push({ type: 'event', text: '어딘가에 상자가 나타났다 — 지도를 보라', kind: 'chest' });
    }
  }
  // 하늘에서 떨어지는 것(장 이벤트): 인물 둘레에 붉은 원
  for (const r of s.rains) {
    if (s.t >= r.until || s.t < r.next) continue;
    r.next = s.t + r.every;
    const a = s.rng.next() * Math.PI * 2;
    const d = s.rng.next() * 260;
    s.slams.push({ x: s.player.x + Math.cos(a) * d, y: s.player.y + Math.sin(a) * d, r: r.radius, damage: r.damage, born: s.t, at: s.t + 0.9, color: r.color });
  }
  s.rains = s.rains.filter((r) => s.t < r.until);
}

function hurtPlayer(s: State, raw: number): void {
  const p = s.player;
  if (s.t < p.hurtUntil || s.t < p.dashUntil || s.result) return;
  const over = Math.max(0, (s.t - CHAPTER_LENGTH) / 60);
  const dmg = Math.max(1, Math.round(raw * (1 + RULES.foes.overtimeDamagePerMinute * over) - stat.armor(s)));
  p.hp -= dmg;
  p.hurtUntil = s.t + RULES.player.hurtCooldown;
  s.events.push({ type: 'hurt', damage: dmg });
  if (p.hp <= 0) {
    p.hp = 0;
    s.result = 'lose';
  }
}

function shoot(s: State, f: Foe, a: number, speed: number, damage: number, color: string): void {
  s.shots.push({ x: f.x, y: f.y - 20, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: 7, damage: damage * s.chapter.dmg, life: 4, color, pierce: 0 });
}

function useSkills(s: State, f: Foe, d: number): void {
  const skills = f.def.skills;
  // 일반 그림자는 가까이(화면 안쪽) 와서야 쏜다 — 화면 밖에서 날아오는 탄은 피할 수 없다
  if (!skills?.length || d > (f.def.rank ? 680 : 460)) return;
  const p = s.player;
  const aim = Math.atan2(p.y - 20 - (f.y - 20), p.x - f.x);
  skills.forEach((k, i) => {
    if (s.t < f.skillAt[i]) return;
    f.skillAt[i] = s.t + k.every * (f.def.rank ? 1 : 1 + s.rng.next() * 0.4);
    switch (k.kind) {
      case 'aimed':
        shoot(s, f, aim, k.speed, k.damage, k.color);
        break;
      case 'fan':
        for (let j = 0; j < k.count; j++) shoot(s, f, aim + (k.count > 1 ? (j / (k.count - 1) - 0.5) * k.spread * 2 : 0), k.speed, k.damage, k.color);
        break;
      case 'radial':
        for (let j = 0; j < k.count; j++) shoot(s, f, aim + (j / k.count) * Math.PI * 2, k.speed, k.damage, k.color);
        break;
      case 'slam':
        for (let j = 0; j < (k.count ?? 1); j++) {
          const ox = j ? (s.rng.next() - 0.5) * 240 : 0;
          const oy = j ? (s.rng.next() - 0.5) * 180 : 0;
          s.slams.push({ x: p.x + ox, y: p.y + oy, r: k.radius, damage: k.damage * s.chapter.dmg, born: s.t, at: s.t + k.delay, color: k.color, fx: k.fx });
        }
        break;
      case 'charge':
        f.dashUntil = s.t + 0.7;
        f.vx = Math.cos(aim);
        f.vy = Math.sin(aim);
        s.events.push({ type: 'skill', x: f.x, y: f.y, color: '#ffffff' });
        break;
      case 'summon':
        for (let j = 0; j < k.count; j++) {
          const a = (j / k.count) * Math.PI * 2;
          const x = f.x + Math.cos(a) * 70;
          const y = f.y + Math.sin(a) * 70;
          if (FOES.get(k.foe)?.fly || walkable(s.terrain, x, y)) spawnFoe(s, k.foe, x, y);
        }
        s.events.push({ type: 'skill', x: f.x, y: f.y, color: '#c0283a' });
        break;
    }
  });
}

function moveFoes(s: State): void {
  const p = s.player;
  const frozen = s.t < s.freezeUntil;
  if (s.t >= s.flowAt) {
    s.flowAt = s.t + 0.25;
    updateFlow(s.terrain, p.x, p.y);
  }
  const cell = 48;
  const grid = new Map<number, Foe[]>();
  const key = (gx: number, gy: number) => ((gx + 4096) << 13) ^ (gy + 4096);
  for (const f of s.foes) {
    if (f.dead) continue;
    const k = key(Math.floor(f.x / cell), Math.floor(f.y / cell));
    const arr = grid.get(k);
    if (arr) arr.push(f);
    else grid.set(k, [f]);
  }
  for (const f of s.foes) {
    if (f.dead) continue;
    const dx = p.x - f.x;
    const dy = p.y - f.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d > RULES.foes.despawn && !f.def.rank && !f.boss) {
      const pt = spawnPoint(s, !!f.def.fly);
      if (pt) [f.x, f.y] = pt;
      continue;
    }
    if (frozen) continue;
    // 터지는 놈: 가까우면 멈춰 불이 붙었다가 터진다
    if (f.def.move === 'burst') {
      if (!f.fuseAt && d < 60) f.fuseAt = s.t + 0.6;
      if (f.fuseAt) {
        if (s.t >= f.fuseAt) {
          s.events.push({ type: 'burst', x: f.x, y: f.y, r: 80 });
          if (d < 80 + RULES.player.radius) hurtPlayer(s, f.damage);
          killFoe(s, f);
        }
        continue;
      }
    }
    let speed = f.def.speed * (s.t < f.slowUntil ? 0.55 : 1);
    let ux = dx / d;
    let uy = dy / d;
    if (!f.def.fly) {
      const fd = flowDir(s.terrain, f.x, f.y);
      if (fd) [ux, uy] = fd;
    }
    if (f.def.move === 'ranged' && d < 240) {
      ux = -dx / d;
      uy = -dy / d;
      speed *= 0.6;
    }
    if (f.def.move === 'charge' && s.t >= f.dashAt && d < 420) {
      f.dashUntil = s.t + 0.45;
      f.dashAt = s.t + 3 + s.rng.next() * 2;
      f.vx = dx / d;
      f.vy = dy / d;
    }
    if (s.t < f.dashUntil) {
      ux = f.vx;
      uy = f.vy;
      speed *= 2.4;
    }
    let mx = ux * speed * DT;
    let my = uy * speed * DT;
    const cx = Math.floor(f.x / cell);
    const cy = Math.floor(f.y / cell);
    for (let gx = cx - 1; gx <= cx + 1; gx++)
      for (let gy = cy - 1; gy <= cy + 1; gy++) {
        const arr = grid.get(key(gx, gy));
        if (!arr) continue;
        for (const o of arr) {
          if (o === f) continue;
          const ox = f.x - o.x;
          const oy = f.y - o.y;
          const rr = f.def.radius + o.def.radius;
          const od = ox * ox + oy * oy;
          if (od > 0.01 && od < rr * rr) {
            const odd = Math.sqrt(od);
            const push = ((rr - odd) / rr) * RULES.foes.separation * speed * DT * 3;
            mx += (ox / odd) * push;
            my += (oy / odd) * push;
          }
        }
      }
    if (f.def.fly) {
      f.x += mx;
      f.y += my;
    } else [f.x, f.y] = moveCircle(s.terrain, f.x, f.y, mx, my, Math.min(16, f.def.radius * 0.6));
    if (s.t < f.burnUntil && Math.floor(s.t * 2) !== Math.floor((s.t - DT) * 2)) damageFoe(s, f, 4);
    if (f.dead) continue;
    const rr = f.def.radius + RULES.player.radius;
    if ((p.x - f.x) ** 2 + (p.y - f.y) ** 2 < rr * rr) {
      if (s.t < p.dashUntil) {
        if (!p.grazed.has(f.uid)) {
          p.grazed.add(f.uid);
          s.events.push({ type: 'graze', x: f.x, y: f.y });
          for (const o of s.foes) if (!o.dead && (o.x - f.x) ** 2 + (o.y - f.y) ** 2 < RULES.dash.graze.radius ** 2) damageFoe(s, o, RULES.dash.graze.damage);
        }
      } else hurtPlayer(s, f.damage);
    }
    useSkills(s, f, d);
  }
}

function fireWeapons(s: State): void {
  const p = s.player;
  const area = stat.area(s);
  const near = nearest(s, p.x, p.y);
  const aim = near && (near.x - p.x) ** 2 + (near.y - p.y) ** 2 < 420 * 420 ? Math.atan2(near.y - p.y, near.x - p.x) : p.facing;
  for (const w of s.weapons) {
    const d = WEAPONS.get(w.id)!;
    const L = lvOf(w);
    const color = d.color;
    if (d.kind === 'orbit') {
      const period = L.cooldown * stat.haste(s);
      const on = L.duration >= period || s.t % period < L.duration;
      if (on) {
        const R = 72 * L.area * area;
        w.touched ??= new Map();
        for (let i = 0; i < L.count; i++) {
          const a = s.t * L.speed + (i / L.count) * Math.PI * 2;
          const bx = p.x + Math.cos(a) * R;
          const by = p.y + Math.sin(a) * R;
          hitProps(s, bx, by, 16 * area);
          for (const f of s.foes) {
            if (f.dead) continue;
            const rr = f.def.radius + 16 * area;
            if ((f.x - bx) ** 2 + (f.y - by) ** 2 > rr * rr) continue;
            if (s.t - (w.touched.get(f.uid) ?? -9) < 0.45) continue;
            w.touched.set(f.uid, s.t);
            damageFoe(s, f, L.damage, d.knock ?? 6, d.element);
          }
        }
      }
      continue;
    }
    if (d.kind === 'aura') {
      if (s.t >= w.next) {
        w.next = s.t + L.cooldown;
        const R = 90 * L.area * area;
        hitProps(s, p.x, p.y, R);
        for (const f of s.foes) if (!f.dead && (f.x - p.x) ** 2 + (f.y - p.y) ** 2 < (R + f.def.radius) ** 2) damageFoe(s, f, L.damage, 0, d.element);
      }
      continue;
    }
    if (d.kind === 'nova' && w.ringAt !== undefined) {
      const k = (s.t - w.ringAt) / 0.45;
      const R = 150 * L.area * area * Math.min(1, k);
      for (const f of s.foes) {
        if (f.dead || w.ringHit!.has(f.uid)) continue;
        if ((f.x - p.x) ** 2 + (f.y - p.y) ** 2 < (R + f.def.radius) ** 2) {
          w.ringHit!.add(f.uid);
          damageFoe(s, f, L.damage, d.knock ?? 8, d.element);
        }
      }
      if (k >= 1) {
        hitProps(s, p.x, p.y, R);
        w.ringAt = undefined;
      }
    }
    if (s.t < w.next) continue;
    w.next = s.t + L.cooldown * stat.haste(s);
    switch (d.kind) {
      case 'slash': {
        const R = 92 * L.area * area;
        const arc = (130 * Math.PI) / 180;
        const dirs = L.count >= 4 ? [0, Math.PI / 2, Math.PI, -Math.PI / 2] : L.count >= 2 ? [0, Math.PI] : [0];
        hitProps(s, p.x, p.y, R * 0.8);
        for (const off of dirs) {
          const a = aim + off;
          s.events.push({ type: 'slash', x: p.x, y: p.y, angle: a, r: R, arc, color });
          for (const f of s.foes) {
            if (f.dead) continue;
            const dx = f.x - p.x;
            const dy = f.y - p.y;
            const dist = Math.hypot(dx, dy);
            if (dist > R + f.def.radius) continue;
            let da = Math.atan2(dy, dx) - a;
            da = Math.atan2(Math.sin(da), Math.cos(da));
            if (Math.abs(da) <= arc / 2 || dist < f.def.radius + 10) damageFoe(s, f, L.damage, d.knock ?? 8, d.element);
          }
        }
        break;
      }
      case 'bolt': {
        const skip = new Set<number>();
        for (let i = 0; i < L.count; i++) {
          const t = nearest(s, p.x, p.y, skip);
          const a = t ? Math.atan2(t.y - p.y, t.x - p.x) : p.facing + (i - (L.count - 1) / 2) * 0.25;
          if (t) skip.add(t.uid);
          s.shots.push({ x: p.x, y: p.y - 20, vx: Math.cos(a) * L.speed, vy: Math.sin(a) * L.speed, r: 9 * L.area * area, damage: L.damage, life: L.duration, color, weapon: d.id, pierce: L.pierce, hit: new Set(), element: d.element, knock: d.knock ?? 4 });
        }
        break;
      }
      case 'wave': {
        for (let i = 0; i < L.count; i++) {
          const a = L.count >= 4 ? aim + (i * Math.PI) / 2 : aim + (i - (L.count - 1) / 2) * 0.22;
          s.shots.push({ x: p.x, y: p.y - 20, vx: Math.cos(a) * L.speed, vy: Math.sin(a) * L.speed, r: 22 * L.area * area, damage: L.damage, life: L.duration, color, weapon: d.id, pierce: L.pierce, hit: new Set(), element: d.element, knock: d.knock ?? 6 });
        }
        break;
      }
      case 'nova': {
        w.ringAt = s.t;
        w.ringHit = new Set();
        s.events.push({ type: 'nova', x: p.x, y: p.y, r: 150 * L.area * area, color, weapon: d.id });
        if (L.count >= 2) w.next = s.t + (L.cooldown * stat.haste(s)) / 2;
        break;
      }
      case 'strike': {
        const near2 = s.foes.filter((f) => !f.dead && (f.x - p.x) ** 2 + (f.y - p.y) ** 2 < s.view * s.view);
        const R = 46 * L.area * area;
        for (let i = 0; i < L.count && near2.length; i++) {
          const t = near2.splice(s.rng.int(0, near2.length - 1), 1)[0];
          s.events.push({ type: 'strike', x: t.x, y: t.y, r: R, color, fx: d.fx });
          hitProps(s, t.x, t.y, R);
          for (const f of s.foes) if (!f.dead && (f.x - t.x) ** 2 + (f.y - t.y) ** 2 < (R + f.def.radius) ** 2) damageFoe(s, f, L.damage, d.knock ?? 0, d.element);
        }
        break;
      }
      case 'rain': {
        for (let i = 0; i < L.count; i++) {
          const t = s.foes.length ? s.foes[s.rng.int(0, s.foes.length - 1)] : null;
          const close = t && !t.dead && (t.x - p.x) ** 2 + (t.y - p.y) ** 2 < 300 * 300;
          const x = close ? t.x : p.x + (s.rng.next() - 0.5) * 400;
          const y = close ? t.y : p.y + (s.rng.next() - 0.5) * 300;
          s.zones.push({ x, y, r: 70 * L.area * area, damage: L.damage, until: s.t + L.duration, every: 0.35, next: s.t, weapon: d.id, color, element: d.element });
        }
        break;
      }
    }
  }
}

function moveShots(s: State): void {
  const p = s.player;
  for (const sh of s.shots) {
    sh.x += sh.vx * DT;
    sh.y += sh.vy * DT;
    sh.life -= DT;
    if (sh.life <= 0) continue;
    // 벽은 적 탄과 불덩이·검광(관통이 적은 탄)을 막는다 — 검기(wave)는 넘는다
    const wallStop = !sh.weapon || WEAPONS.get(sh.weapon)?.kind === 'bolt';
    if (wallStop && blocksShot(s.terrain, sh.x, sh.y + 20)) {
      sh.life = 0;
      continue;
    }
    if (!sh.weapon) {
      const rr = sh.r + RULES.player.radius;
      if ((sh.x - p.x) ** 2 + (sh.y - p.y + 20) ** 2 < rr * rr && s.t >= p.dashUntil) {
        hurtPlayer(s, sh.damage);
        sh.life = 0;
      }
      continue;
    }
    hitProps(s, sh.x, sh.y + 20, sh.r * 0.5);
    for (const f of s.foes) {
      if (f.dead || sh.hit!.has(f.uid)) continue;
      const rr = sh.r + f.def.radius;
      if ((f.x - sh.x) ** 2 + (f.y - 20 - sh.y) ** 2 > rr * rr) continue;
      sh.hit!.add(f.uid);
      damageFoe(s, f, sh.damage, sh.knock ?? 0, sh.element);
      if (sh.pierce-- <= 0) {
        sh.life = 0;
        break;
      }
    }
  }
  s.shots = s.shots.filter((x) => x.life > 0);
  for (const z of s.zones) {
    if (s.t < z.next) continue;
    z.next = s.t + z.every;
    hitProps(s, z.x, z.y, z.r);
    for (const f of s.foes) if (!f.dead && (f.x - z.x) ** 2 + (f.y - z.y) ** 2 < (z.r + f.def.radius) ** 2) damageFoe(s, f, z.damage, 0, z.element);
  }
  s.zones = s.zones.filter((z) => s.t < z.until);
  // 예고한 원이 떨어진다
  for (const m of s.slams) {
    if (s.t < m.at) continue;
    if ((p.x - m.x) ** 2 + (p.y - m.y) ** 2 < (m.r + RULES.player.radius) ** 2) hurtPlayer(s, m.damage);
    s.events.push({ type: 'skill', x: m.x, y: m.y, fx: m.fx, color: m.color });
  }
  s.slams = s.slams.filter((m) => s.t < m.at);
}

function pickups(s: State): void {
  const p = s.player;
  const reach = stat.pickup(s);
  for (const g of s.gems) {
    const d = Math.hypot(p.x - g.x, p.y - g.y);
    if (d < reach) g.pulled = true;
    if (!g.pulled) continue;
    const v = Math.max(280, stat.speed(s) * 1.7) * DT;
    g.x += ((p.x - g.x) / (d || 1)) * Math.min(v, d);
    g.y += ((p.y - g.y) / (d || 1)) * Math.min(v, d);
    if (d < 18) {
      g.taken = true;
      gainXp(s, g.xp);
    }
  }
  s.gems = s.gems.filter((g) => !g.taken);
  if (s.gems.length > 500) {
    const far = s.gems.filter((g) => !g.pulled).sort((a, b) => Math.hypot(b.x - p.x, b.y - p.y) - Math.hypot(a.x - p.x, a.y - p.y));
    const merge = far.slice(0, s.gems.length - 400);
    const keep = far[merge.length];
    if (keep) for (const g of merge) keep.xp += g.xp;
    const drop = new Set(merge);
    s.gems = s.gems.filter((g) => !drop.has(g));
  }
  for (const it of s.items) {
    if (Math.hypot(p.x - it.x, p.y - it.y) > RULES.player.radius + 22) continue;
    it.taken = true;
    s.events.push({ type: 'item', kind: it.kind, x: it.x, y: it.y });
    switch (it.kind) {
      case 'food':
        p.hp = Math.min(p.maxHp, p.hp + RULES.drops.foodHeal);
        break;
      case 'herb':
        p.hp = p.maxHp;
        break;
      case 'magnet':
        s.gems.forEach((g) => (g.pulled = true));
        break;
      case 'bomb':
        s.events.push({ type: 'bomb', x: p.x, y: p.y });
        for (const f of s.foes) if (!f.dead && (f.x - p.x) ** 2 + (f.y - p.y) ** 2 < RULES.items.bomb.radius ** 2) damageFoe(s, f, RULES.items.bomb.damage * (1 + s.chapterIndex * 0.6));
        break;
      case 'frost':
        s.freezeUntil = s.t + RULES.items.frost.seconds;
        s.events.push({ type: 'freeze' });
        break;
      case 'gold':
        s.gold += 1 + s.rng.int(0, 4);
        break;
      case 'chest':
        openChest(s);
        break;
    }
  }
  s.items = s.items.filter((it) => !it.taken);
}

function gainXp(s: State, xp: number): void {
  s.xp += xp * stat.xpMul(s);
  while (s.xp >= xpNeed(s.level)) {
    s.xp -= xpNeed(s.level);
    s.level++;
    s.queuedLevels++;
    s.events.push({ type: 'level', level: s.level });
  }
  if (!s.pending && s.queuedLevels > 0) offerChoices(s);
}

function openChest(s: State): void {
  for (const w of s.weapons) {
    const d = WEAPONS.get(w.id)!;
    if (d.evolve && w.lv >= d.levels.length && s.passives.has(d.evolve.with)) {
      w.id = d.evolve.into;
      w.lv = 1;
      w.next = s.t;
      s.events.push({ type: 'chest', text: `각성 — ${WEAPONS.get(w.id)!.name}` });
      return;
    }
  }
  const up = s.weapons.filter((w) => w.lv < WEAPONS.get(w.id)!.levels.length);
  if (up.length) {
    const w = up[s.rng.int(0, up.length - 1)];
    w.lv++;
    s.events.push({ type: 'chest', text: `${WEAPONS.get(w.id)!.name} Lv.${w.lv}` });
  } else {
    const g = 10 + s.rng.int(0, 10);
    s.gold += g;
    s.player.hp = s.player.maxHp;
    s.events.push({ type: 'chest', text: `체력을 되찾고 금화 ${g}` });
  }
}

export function choicePool(s: State): Choice[] {
  const out: Choice[] = [];
  for (const w of s.weapons) {
    const d = WEAPONS.get(w.id)!;
    if (w.lv < d.levels.length) out.push({ kind: 'weapon', id: w.id, lv: w.lv + 1 });
  }
  if (s.weapons.length < RULES.player.slots.weapons) {
    const owned = new Set(s.weapons.map((w) => w.id));
    for (const w of s.weapons) for (const d of WEAPONS.values()) if (d.evolve?.into === w.id) owned.add(d.id);
    for (const d of WEAPONS.values()) if (!d.evolved && !owned.has(d.id) && (d.owner === '*' || s.hero.pool.includes(d.id))) out.push({ kind: 'weapon', id: d.id, lv: 1 });
  }
  for (const pd of PASSIVES.values()) {
    const lv = s.passives.get(pd.id) ?? 0;
    if (lv >= pd.max) continue;
    if (lv === 0 && s.passives.size >= RULES.player.slots.passives) continue;
    out.push({ kind: 'passive', id: pd.id, lv: lv + 1 });
  }
  return out;
}

function offerChoices(s: State): void {
  const pool = choicePool(s);
  if (!pool.length) {
    // 다 찼으면: 최대 체력 +10(이어 간다) · 금화
    s.pending = [
      { kind: 'food', id: 'vigor_up', lv: 0 },
      { kind: 'gold', id: 'gold', lv: 0 },
    ];
    return;
  }
  const picks: Choice[] = [];
  const rest = [...pool];
  while (picks.length < 3 && rest.length) {
    const c = s.rng.weighted(rest, (x) => (x.kind === 'weapon' && x.lv > 1 ? 1.6 : 1))!;
    picks.push(c);
    rest.splice(rest.indexOf(c), 1);
  }
  s.pending = picks;
}

export function choose(s: State, i: number): void {
  const c = s.pending?.[i];
  if (!c) return;
  if (c.kind === 'weapon') {
    const w = s.weapons.find((x) => x.id === c.id);
    if (w) w.lv = c.lv;
    else s.weapons.push({ id: c.id, lv: 1, next: s.t });
  } else if (c.kind === 'passive') {
    s.passives.set(c.id, c.lv);
    if (c.id === 'vigor') {
      s.player.maxHp += 10;
      s.player.hp += 10;
    }
  } else if (c.kind === 'gold') s.gold += 15;
  else {
    s.bonusHp += 10;
    s.player.maxHp += 10;
    s.player.hp = Math.min(s.player.maxHp, s.player.hp + RULES.drops.foodHeal);
  }
  s.pending = null;
  s.queuedLevels = Math.max(0, s.queuedLevels - 1);
  if (s.queuedLevels > 0) offerChoices(s);
}

function useUlt(s: State): void {
  if (s.ult < RULES.ult.max) return;
  s.ult = 0;
  const p = s.player;
  const u = s.hero.ult;
  s.events.push({ type: 'ult', x: p.x, y: p.y, fx: `fx_gyeol_tech_${u.id}_a`, color: u.color });
  const dmg = u.damage * (1 + 0.05 * s.level);
  for (const f of s.foes) if (!f.dead && (f.x - p.x) ** 2 + (f.y - p.y) ** 2 < RULES.ult.radius ** 2) damageFoe(s, f, dmg);
  if (u.heal) p.hp = Math.min(p.maxHp, p.hp + u.heal);
}

/** 한 칸(1/60초). 레벨업 고르기·끝난 장은 멈춰 있다 */
export function step(s: State, input: Input): void {
  if (s.result || s.pending) return;
  s.t += DT;
  s.playTime += DT;
  const p = s.player;
  const len = Math.hypot(input.x, input.y);
  p.moving = len > 0.05;
  // 느린 땅(덤불·눈·핏물)
  const slowGround = cellAt(s.terrain, p.x, p.y) === T.Slow ? 0.62 : 1;
  if (p.moving) {
    const ux = input.x / Math.max(1, len);
    const uy = input.y / Math.max(1, len);
    p.facing = Math.atan2(uy, ux);
    const ul = Math.hypot(ux, uy) || 1;
    p.dashX = ux / ul;
    p.dashY = uy / ul;
    if (s.t >= p.dashUntil) [p.x, p.y] = moveCircle(s.terrain, p.x, p.y, ux * stat.speed(s) * slowGround * DT, uy * stat.speed(s) * slowGround * DT, RULES.player.radius * 0.8);
  }
  if (input.dash && s.t >= p.dashReady) {
    p.dashUntil = s.t + RULES.dash.duration;
    p.dashReady = s.t + RULES.dash.cooldown;
    p.grazed.clear();
  }
  if (s.t < p.dashUntil) [p.x, p.y] = moveCircle(s.terrain, p.x, p.y, p.dashX * RULES.dash.speed * DT, p.dashY * RULES.dash.speed * DT, RULES.player.radius * 0.8);
  if (input.ult) useUlt(s);
  p.hp = Math.min(p.maxHp, p.hp + stat.regen(s) * DT);
  runTimeline(s);
  moveFoes(s);
  fireWeapons(s);
  moveShots(s);
  s.foes = s.foes.filter((f) => !f.dead);
  if (s.boss?.dead) s.boss = null;
  pickups(s);
}

/** 장을 마치면 「천외귀환」 수련 경험치 */
export function trainingXp(s: State): number {
  return Math.floor(s.t / 60) * 4 + (s.result === 'clear' ? 40 : 0);
}

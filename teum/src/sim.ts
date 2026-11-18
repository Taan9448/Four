// 「틈」 엔진(2026-11-18): 순수 함수 + 시드 RNG. 화면(render.ts)·입력(main.ts)과 떨어져 있어 테스트·봇이 그대로 돌린다.
// 무공은 종류(kind)마다 움직임이 정해져 있고 수치는 data/weapons.json — 무공별 코드는 없다(GAME_DESIGN 4절).
import { createRng, type Rng } from '../../src/engine/rng';
import runRaw from '../data/run.json';
import foesRaw from '../data/foes.json';
import weaponsRaw from '../data/weapons.json';
import heroesRaw from '../data/heroes.json';

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
export interface FoeDef {
  id: string;
  name: string;
  ref: string;
  sprite: string;
  hp: number;
  speed: number;
  damage: number;
  xp: number;
  radius: number;
  scale: number;
  rank?: 'elite' | 'boss';
  move?: 'chase' | 'charge' | 'ranged';
  element?: string;
  shot?: { every: number; count?: number; speed: number; damage: number; color: string };
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
  unlock: null | { kind: 'survive'; seconds: number; text: string } | { kind: 'boss'; foe: string; text: string };
}
interface SpawnDef {
  from: number;
  to: number;
  rate: [number, number];
  foes: Record<string, number>;
}
export interface ActDef {
  from: number;
  name: string;
  ground: string;
  color: [string, string];
  spawns: SpawnDef[];
}
export interface EventDef {
  at: number;
  kind: 'swarm' | 'ring' | 'elite' | 'boss';
  foe: string;
  count?: number;
  text: string;
  final?: boolean;
}

export const RUN = runRaw as unknown as {
  length: number;
  player: { hp: number; speed: number; radius: number; pickup: number; hurtCooldown: number; slots: { weapons: number; passives: number } };
  dash: { duration: number; speed: number; cooldown: number; graze: { radius: number; damage: number } };
  ult: { max: number; kill: number; elite: number; boss: number; radius: number };
  xp: { base: number; perLevel: number; square: number };
  foes: { max: number; spawnRadius: number; despawn: number; hpPerMinute: number; overtimeDamagePerMinute: number; separation: number };
  drops: { food: number; magnet: number; foodHeal: number };
  acts: ActDef[];
  events: EventDef[];
};
export const FOES = new Map((foesRaw.foes as FoeDef[]).map((f) => [f.id, f]));
export const WEAPONS = new Map((weaponsRaw.weapons as unknown as WeaponDef[]).map((w) => [w.id, w]));
export const PASSIVES = new Map((weaponsRaw.passives as PassiveDef[]).map((p) => [p.id, p]));
export const HEROES = heroesRaw.heroes as unknown as HeroDef[];

export const DT = 1 / 60;

export interface Foe {
  uid: number;
  def: FoeDef;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  vx: number;
  vy: number;
  /** 맞은 순간(번쩍임) */
  hitAt: number;
  slowUntil: number;
  burnUntil: number;
  shotAt: number;
  /** 돌진(charge): 다음 돌진 때·돌진 끝 */
  dashAt: number;
  dashUntil: number;
  dead: boolean;
  final?: boolean;
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
  /** 무공 탄이면 무공 id, 적 탄이면 없음 */
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
export interface Gem {
  x: number;
  y: number;
  xp: number;
  pulled: boolean;
}
export interface Item {
  x: number;
  y: number;
  kind: 'food' | 'magnet' | 'chest';
}
export interface OwnedWeapon {
  id: string;
  lv: number;
  next: number;
  /** 고리(nova) 발동 때 · 이미 맞힌 적 */
  ringAt?: number;
  ringHit?: Set<number>;
  /** 둘레 칼(orbit)·결계(aura)가 마지막으로 친 때(적마다) */
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
  | { type: 'graze'; x: number; y: number }
  | { type: 'ult'; x: number; y: number; fx: string; color: string }
  | { type: 'event'; text: string; kind: string }
  | { type: 'act'; name: string };
export interface Choice {
  kind: 'weapon' | 'passive' | 'food';
  id: string;
  /** 고르면 될 레벨(새로 얻으면 1) */
  lv: number;
}
export interface Input {
  x: number;
  y: number;
  dash?: boolean;
  ult?: boolean;
}
export interface State {
  seed: string;
  rng: Rng;
  hero: HeroDef;
  t: number;
  player: {
    x: number;
    y: number;
    hp: number;
    maxHp: number;
    facing: number;
    /** 이동 중인가(그림 흔들기) */
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
  foes: Foe[];
  shots: Shot[];
  zones: Zone[];
  gems: Gem[];
  items: Item[];
  ult: number;
  kills: number;
  bossKills: string[];
  pending: Choice[] | null;
  /** 레벨업이 겹치면 차례로 */
  queuedLevels: number;
  nextEvent: number;
  act: number;
  result: null | 'win' | 'lose';
  events: FxEvent[];
  uid: number;
  spawnCarry: number;
  /** 화면에 보이는 반지름(무작위 낙뢰 등) */
  view: number;
}

export function xpNeed(level: number): number {
  const x = RUN.xp;
  return Math.round(x.base + x.perLevel * (level - 1) + x.square * (level - 1) ** 2);
}

const pv = (s: State, id: string): number => (s.passives.get(id) ?? 0) * (PASSIVES.get(id)?.per ?? 0);
export const stat = {
  might: (s: State) => 1 + pv(s, 'might'),
  haste: (s: State) => Math.max(0.35, 1 - pv(s, 'haste')),
  area: (s: State) => 1 + pv(s, 'area'),
  speed: (s: State) => RUN.player.speed * s.hero.speed * (1 + pv(s, 'swift')),
  armor: (s: State) => (s.hero.armor ?? 0) + pv(s, 'vigor'),
  regen: (s: State) => pv(s, 'breath'),
  crit: (s: State) => pv(s, 'grain'),
  pickup: (s: State) => RUN.player.pickup * (1 + pv(s, 'yoke')),
  xpMul: (s: State) => 1 + (s.passives.get('yoke') ?? 0) * 0.05,
};

export function createRun(heroId: string, seed: string): State {
  const hero = HEROES.find((h) => h.id === heroId) ?? HEROES[0];
  const s: State = {
    seed,
    rng: createRng(`teum:${seed}`),
    hero,
    t: 0,
    player: { x: 0, y: 0, hp: hero.hp, maxHp: hero.hp, facing: 0, moving: false, hurtUntil: 0, dashUntil: 0, dashReady: 0, dashX: 1, dashY: 0, grazed: new Set() },
    level: 1,
    xp: 0,
    weapons: [{ id: hero.start, lv: 1, next: 0.5 }],
    passives: new Map(),
    foes: [],
    shots: [],
    zones: [],
    gems: [],
    items: [],
    ult: 0,
    kills: 0,
    bossKills: [],
    pending: null,
    queuedLevels: 0,
    nextEvent: 0,
    act: 0,
    result: null,
    events: [],
    uid: 1,
    spawnCarry: 0,
    view: 560,
  };
  return s;
}

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

/** 적 하나에 피해. 치명·밀어내기·속성 */
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
    f.x += (dx / d) * knock;
    f.y += (dy / d) * knock;
  }
  if (s.events.length < 400) s.events.push({ type: 'hit', x: f.x, y: f.y, damage: dmg, crit });
  if (f.hp <= 0) killFoe(s, f);
}

function killFoe(s: State, f: Foe): void {
  f.dead = true;
  s.kills++;
  const rank = f.def.rank;
  s.ult = Math.min(RUN.ult.max, s.ult + (rank === 'boss' ? RUN.ult.boss : rank === 'elite' ? RUN.ult.elite : RUN.ult.kill));
  s.events.push({ type: 'kill', x: f.x, y: f.y, foe: f.def.id, rank });
  if (f.def.xp > 0) s.gems.push({ x: f.x, y: f.y, xp: f.def.xp, pulled: false });
  if (rank) {
    s.items.push({ x: f.x, y: f.y, kind: 'chest' });
    if (rank === 'boss') s.bossKills.push(f.def.id);
  } else {
    const r = s.rng.next();
    if (r < RUN.drops.magnet) s.items.push({ x: f.x, y: f.y, kind: 'magnet' });
    else if (r < RUN.drops.magnet + RUN.drops.food) s.items.push({ x: f.x, y: f.y, kind: 'food' });
  }
  if (f.final) s.result = 'win';
}

function spawnFoe(s: State, id: string, x: number, y: number, final = false): Foe | null {
  const def = FOES.get(id);
  if (!def) return null;
  const minute = s.t / 60;
  const hp = Math.round(def.hp * (1 + RUN.foes.hpPerMinute * minute * (def.rank === 'boss' ? 0.3 : 1)));
  const f: Foe = { uid: s.uid++, def, x, y, hp, maxHp: hp, vx: 0, vy: 0, hitAt: -9, slowUntil: 0, burnUntil: 0, shotAt: s.t + (def.shot?.every ?? 0), dashAt: s.t + 1 + s.rng.next() * 2, dashUntil: 0, dead: false, final };
  s.foes.push(f);
  return f;
}

function ringPoint(s: State, r = RUN.foes.spawnRadius): [number, number] {
  const a = s.rng.next() * Math.PI * 2;
  return [s.player.x + Math.cos(a) * r, s.player.y + Math.sin(a) * r];
}

function activeSpawn(s: State): SpawnDef | null {
  for (const act of RUN.acts) for (const sp of act.spawns) if (s.t >= sp.from && s.t < sp.to) return sp;
  return null;
}

function runSpawns(s: State): void {
  // 막 바뀜
  const act = RUN.acts.reduce((n, a, i) => (s.t >= a.from ? i : n), 0);
  if (act !== s.act) {
    s.act = act;
    s.events.push({ type: 'act', name: RUN.acts[act].name });
  }
  // 이정표(무리·둘러싸기·정예·보스)
  while (s.nextEvent < RUN.events.length && s.t >= RUN.events[s.nextEvent].at) {
    const ev = RUN.events[s.nextEvent++];
    s.events.push({ type: 'event', text: ev.text, kind: ev.kind });
    if (ev.kind === 'ring') {
      const n = ev.count ?? 20;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        spawnFoe(s, ev.foe, s.player.x + Math.cos(a) * 380, s.player.y + Math.sin(a) * 380);
      }
    } else if (ev.kind === 'swarm') {
      const [cx, cy] = ringPoint(s);
      for (let i = 0; i < (ev.count ?? 20); i++) spawnFoe(s, ev.foe, cx + (s.rng.next() - 0.5) * 160, cy + (s.rng.next() - 0.5) * 160);
    } else {
      const [x, y] = ringPoint(s, 480);
      spawnFoe(s, ev.foe, x, y, !!ev.final);
    }
  }
  // 늘 나오는 무리
  const sp = activeSpawn(s);
  if (!sp) return;
  const alive = s.foes.length;
  if (alive >= RUN.foes.max) return;
  const k = Math.min(1, (s.t - sp.from) / Math.max(1, Math.min(sp.to, RUN.length) - sp.from));
  const rate = sp.rate[0] + (sp.rate[1] - sp.rate[0]) * k;
  s.spawnCarry += rate * DT;
  const ids = Object.keys(sp.foes);
  while (s.spawnCarry >= 1) {
    s.spawnCarry -= 1;
    const id = s.rng.weighted(ids, (i) => sp.foes[i]);
    if (!id) break;
    const [x, y] = ringPoint(s);
    spawnFoe(s, id, x, y);
  }
}

function hurtPlayer(s: State, raw: number): void {
  const p = s.player;
  if (s.t < p.hurtUntil || s.t < p.dashUntil || s.result) return;
  const over = Math.max(0, (s.t - RUN.length) / 60);
  const dmg = Math.max(1, Math.round(raw * (1 + RUN.foes.overtimeDamagePerMinute * over) - stat.armor(s)));
  p.hp -= dmg;
  p.hurtUntil = s.t + RUN.player.hurtCooldown;
  s.events.push({ type: 'hurt', damage: dmg });
  if (p.hp <= 0) {
    p.hp = 0;
    s.result = 'lose';
  }
}

function moveFoes(s: State): void {
  const p = s.player;
  const sep = RUN.foes.separation;
  // 칸 나누기(가까운 적끼리만 밀어낸다)
  const cell = 48;
  const grid = new Map<number, Foe[]>();
  const key = (x: number, y: number) => ((Math.floor(x / cell) + 4096) << 13) ^ (Math.floor(y / cell) + 4096);
  for (const f of s.foes) {
    if (f.dead) continue;
    const k = key(f.x, f.y);
    const arr = grid.get(k);
    if (arr) arr.push(f);
    else grid.set(k, [f]);
  }
  for (const f of s.foes) {
    if (f.dead) continue;
    const dx = p.x - f.x;
    const dy = p.y - f.y;
    const d = Math.hypot(dx, dy) || 1;
    // 너무 멀어진 일반 적은 다시 둘레로(화면 밖에서 맴도는 것을 줄인다)
    if (d > RUN.foes.despawn && !f.def.rank) {
      const [x, y] = ringPoint(s);
      f.x = x;
      f.y = y;
      continue;
    }
    let speed = f.def.speed * (s.t < f.slowUntil ? 0.55 : 1);
    let ux = dx / d;
    let uy = dy / d;
    if (f.def.move === 'ranged' && d < 240) {
      ux = -ux;
      uy = -uy;
      speed *= 0.6;
    }
    if (f.def.move === 'charge') {
      if (s.t >= f.dashAt && d < 420) {
        f.dashUntil = s.t + 0.45;
        f.dashAt = s.t + 3 + s.rng.next() * 2;
        f.vx = ux;
        f.vy = uy;
      }
      if (s.t < f.dashUntil) {
        ux = f.vx;
        uy = f.vy;
        speed *= 2.4;
      }
    }
    let mx = ux * speed * DT;
    let my = uy * speed * DT;
    // 이웃과 밀어내기
    const cx = Math.floor(f.x / cell);
    const cy = Math.floor(f.y / cell);
    for (let gx = cx - 1; gx <= cx + 1; gx++)
      for (let gy = cy - 1; gy <= cy + 1; gy++) {
        const arr = grid.get(((gx + 4096) << 13) ^ (gy + 4096));
        if (!arr) continue;
        for (const o of arr) {
          if (o === f) continue;
          const ox = f.x - o.x;
          const oy = f.y - o.y;
          const rr = f.def.radius + o.def.radius;
          const od = ox * ox + oy * oy;
          if (od > 0.01 && od < rr * rr) {
            const odd = Math.sqrt(od);
            const push = ((rr - odd) / rr) * sep * speed * DT * 3;
            mx += (ox / odd) * push;
            my += (oy / odd) * push;
          }
        }
      }
    f.x += mx;
    f.y += my;
    // 불에 탄다
    if (s.t < f.burnUntil && Math.floor(s.t * 2) !== Math.floor((s.t - DT) * 2)) damageFoe(s, f, 4);
    if (f.dead) continue;
    // 닿으면 친다
    const rr = f.def.radius + RUN.player.radius;
    if ((p.x - f.x) ** 2 + (p.y - f.y) ** 2 < rr * rr) {
      if (s.t < p.dashUntil) {
        // 보법으로 스쳐 지나가면 간파: 둘레에 결 파동(적마다 한 번)
        if (!p.grazed.has(f.uid)) {
          p.grazed.add(f.uid);
          s.events.push({ type: 'graze', x: f.x, y: f.y });
          for (const o of s.foes) if (!o.dead && (o.x - f.x) ** 2 + (o.y - f.y) ** 2 < RUN.dash.graze.radius ** 2) damageFoe(s, o, RUN.dash.graze.damage);
        }
      } else hurtPlayer(s, f.def.damage);
    }
    // 쏘기
    const shot = f.def.shot;
    if (shot && s.t >= f.shotAt && d < 620) {
      f.shotAt = s.t + shot.every;
      const n = shot.count ?? 1;
      const base = Math.atan2(dy, dx);
      for (let i = 0; i < n; i++) {
        const a = n === 1 ? base : base + (i / n) * Math.PI * 2;
        s.shots.push({ x: f.x, y: f.y, vx: Math.cos(a) * shot.speed, vy: Math.sin(a) * shot.speed, r: 7, damage: shot.damage, life: 4, color: shot.color, pierce: 0 });
      }
    }
  }
}

function fireWeapons(s: State): void {
  const p = s.player;
  const area = stat.area(s);
  // 베기·검기는 가장 가까운 적 쪽으로(없으면 바라보는 쪽) — 달아나며 싸워도 뒤쫓는 적을 벤다
  const near = nearest(s, p.x, p.y);
  const aim = near && (near.x - p.x) ** 2 + (near.y - p.y) ** 2 < 420 * 420 ? Math.atan2(near.y - p.y, near.x - p.x) : p.facing;
  for (const w of s.weapons) {
    const d = WEAPONS.get(w.id)!;
    const L = lvOf(w);
    const color = d.color;
    // 늘 닿는 것(둘레 칼·결계)
    if (d.kind === 'orbit') {
      const period = L.cooldown * stat.haste(s);
      const on = L.duration >= period || (s.t % period) < L.duration;
      if (on) {
        const R = 72 * L.area * area;
        w.touched ??= new Map();
        for (let i = 0; i < L.count; i++) {
          const a = s.t * L.speed + (i / L.count) * Math.PI * 2;
          const bx = p.x + Math.cos(a) * R;
          const by = p.y + Math.sin(a) * R;
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
        for (const f of s.foes) if (!f.dead && (f.x - p.x) ** 2 + (f.y - p.y) ** 2 < (R + f.def.radius) ** 2) damageFoe(s, f, L.damage, 0, d.element);
      }
      continue;
    }
    // 고리가 퍼지는 중
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
      if (k >= 1) w.ringAt = undefined;
    }
    if (s.t < w.next) continue;
    w.next = s.t + L.cooldown * stat.haste(s);
    switch (d.kind) {
      case 'slash': {
        const R = 92 * L.area * area;
        const arc = (130 * Math.PI) / 180;
        const dirs = L.count >= 4 ? [0, Math.PI / 2, Math.PI, -Math.PI / 2] : L.count >= 2 ? [0, Math.PI] : [0];
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
        // 둘째 고리(count 2)는 조금 뒤에 — 다음 대기 시간을 반으로
        if (L.count >= 2) w.next = s.t + (L.cooldown * stat.haste(s)) / 2;
        break;
      }
      case 'strike': {
        const near = s.foes.filter((f) => !f.dead && (f.x - p.x) ** 2 + (f.y - p.y) ** 2 < s.view * s.view);
        const R = 46 * L.area * area;
        for (let i = 0; i < L.count && near.length; i++) {
          const t = near.splice(s.rng.int(0, near.length - 1), 1)[0];
          s.events.push({ type: 'strike', x: t.x, y: t.y, r: R, color, fx: d.fx });
          for (const f of s.foes) if (!f.dead && (f.x - t.x) ** 2 + (f.y - t.y) ** 2 < (R + f.def.radius) ** 2) damageFoe(s, f, L.damage, d.knock ?? 0, d.element);
        }
        break;
      }
      case 'rain': {
        for (let i = 0; i < L.count; i++) {
          const t = s.foes.length ? s.foes[s.rng.int(0, s.foes.length - 1)] : null;
          const near = t && !t.dead && (t.x - p.x) ** 2 + (t.y - p.y) ** 2 < 300 * 300;
          const x = near ? t.x : p.x + (s.rng.next() - 0.5) * 400;
          const y = near ? t.y : p.y + (s.rng.next() - 0.5) * 300;
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
    if (!sh.weapon) {
      const rr = sh.r + RUN.player.radius;
      if ((sh.x - p.x) ** 2 + (sh.y - p.y + 20) ** 2 < rr * rr && s.t >= p.dashUntil) {
        hurtPlayer(s, sh.damage);
        sh.life = 0;
      }
      continue;
    }
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
    for (const f of s.foes) if (!f.dead && (f.x - z.x) ** 2 + (f.y - z.y) ** 2 < (z.r + f.def.radius) ** 2) damageFoe(s, f, z.damage, 0, z.element);
  }
  s.zones = s.zones.filter((z) => s.t < z.until);
}

function pickups(s: State): void {
  const p = s.player;
  const reach = stat.pickup(s);
  for (const g of s.gems) {
    const d = Math.hypot(p.x - g.x, p.y - g.y);
    if (d < reach) g.pulled = true;
    if (g.pulled) {
      const v = Math.max(260, stat.speed(s) * 1.6) * DT;
      g.x += ((p.x - g.x) / (d || 1)) * Math.min(v, d);
      g.y += ((p.y - g.y) / (d || 1)) * Math.min(v, d);
      if (d < 18) {
        g.xp = -g.xp - 1; // 표시: 주웠다
        gainXp(s, -g.xp - 1);
      }
    }
  }
  s.gems = s.gems.filter((g) => g.xp >= 0);
  // 결 조각이 너무 많으면 먼 것끼리 합친다(그리기·계산 아끼기)
  if (s.gems.length > 500) {
    const far = s.gems.filter((g) => !g.pulled).sort((a, b) => Math.hypot(b.x - p.x, b.y - p.y) - Math.hypot(a.x - p.x, a.y - p.y));
    const merge = far.slice(0, s.gems.length - 400);
    const keep = far[merge.length];
    if (keep) for (const g of merge) keep.xp += g.xp;
    const drop = new Set(merge);
    s.gems = s.gems.filter((g) => !drop.has(g));
  }
  for (const it of s.items) {
    if (Math.hypot(p.x - it.x, p.y - it.y) > RUN.player.radius + 22) continue;
    it.kind === 'food' ? (p.hp = Math.min(p.maxHp, p.hp + RUN.drops.foodHeal)) : it.kind === 'magnet' ? s.gems.forEach((g) => (g.pulled = true)) : openChest(s);
    (it as Item & { taken?: boolean }).taken = true;
  }
  s.items = s.items.filter((it) => !(it as Item & { taken?: boolean }).taken);
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

/** 상자: 각성할 수 있으면 각성, 아니면 가진 무공 하나 +1(없으면 체력) */
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
    s.player.hp = s.player.maxHp;
    s.events.push({ type: 'chest', text: '체력을 모두 되찾았다' });
  }
}

export function choicePool(s: State): Choice[] {
  const out: Choice[] = [];
  for (const w of s.weapons) {
    const d = WEAPONS.get(w.id)!;
    if (w.lv < d.levels.length) out.push({ kind: 'weapon', id: w.id, lv: w.lv + 1 });
  }
  if (s.weapons.length < RUN.player.slots.weapons) {
    const owned = new Set(s.weapons.map((w) => w.id));
    // 각성한 무공의 바탕 무공은 다시 나오지 않는다
    for (const w of s.weapons) for (const d of WEAPONS.values()) if (d.evolve?.into === w.id) owned.add(d.id);
    for (const d of WEAPONS.values()) if (!d.evolved && !owned.has(d.id) && (d.owner === '*' || s.hero.pool.includes(d.id))) out.push({ kind: 'weapon', id: d.id, lv: 1 });
  }
  for (const pd of PASSIVES.values()) {
    const lv = s.passives.get(pd.id) ?? 0;
    if (lv >= pd.max) continue;
    if (lv === 0 && s.passives.size >= RUN.player.slots.passives) continue;
    out.push({ kind: 'passive', id: pd.id, lv: lv + 1 });
  }
  return out;
}

function offerChoices(s: State): void {
  const pool = choicePool(s);
  if (!pool.length) {
    s.pending = [{ kind: 'food', id: 'food', lv: 0 }];
    return;
  }
  // 가진 무공의 레벨업을 조금 더 자주(성장이 이어지게)
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
  } else s.player.hp = Math.min(s.player.maxHp, s.player.hp + RUN.drops.foodHeal);
  s.pending = null;
  s.queuedLevels = Math.max(0, s.queuedLevels - 1);
  if (s.queuedLevels > 0) offerChoices(s);
}

function useUlt(s: State): void {
  if (s.ult < RUN.ult.max) return;
  s.ult = 0;
  const p = s.player;
  const u = s.hero.ult;
  s.events.push({ type: 'ult', x: p.x, y: p.y, fx: `fx_gyeol_tech_${u.id}_a`, color: u.color });
  const dmg = u.damage * (1 + 0.05 * s.level);
  for (const f of s.foes) if (!f.dead && (f.x - p.x) ** 2 + (f.y - p.y) ** 2 < RUN.ult.radius ** 2) damageFoe(s, f, dmg);
  if (u.heal) p.hp = Math.min(p.maxHp, p.hp + u.heal);
}

/** 한 칸(1/60초) 나아간다. 레벨업 고르기·끝난 판은 멈춰 있다 */
export function step(s: State, input: Input): void {
  if (s.result || s.pending) return;
  s.t += DT;
  const p = s.player;
  const len = Math.hypot(input.x, input.y);
  p.moving = len > 0.05;
  if (p.moving) {
    const ux = input.x / Math.max(1, len);
    const uy = input.y / Math.max(1, len);
    p.facing = Math.atan2(uy, ux);
    p.dashX = ux / Math.max(0.0001, Math.hypot(ux, uy));
    p.dashY = uy / Math.max(0.0001, Math.hypot(ux, uy));
    if (s.t >= p.dashUntil) {
      p.x += ux * stat.speed(s) * DT;
      p.y += uy * stat.speed(s) * DT;
    }
  }
  if (input.dash && s.t >= p.dashReady) {
    p.dashUntil = s.t + RUN.dash.duration;
    p.dashReady = s.t + RUN.dash.cooldown;
    p.grazed.clear();
  }
  if (s.t < p.dashUntil) {
    p.x += p.dashX * RUN.dash.speed * DT;
    p.y += p.dashY * RUN.dash.speed * DT;
  }
  if (input.ult) useUlt(s);
  p.hp = Math.min(p.maxHp, p.hp + stat.regen(s) * DT);
  runSpawns(s);
  moveFoes(s);
  fireWeapons(s);
  moveShots(s);
  s.foes = s.foes.filter((f) => !f.dead);
  pickups(s);
}

/** 판이 끝나면 「천외귀환」 수련 경험치(버틴 분 + 쓰러뜨린 보스) */
export function trainingXp(s: State): number {
  return Math.floor(s.t / 60) * 4 + s.bossKills.length * 30 + (s.result === 'win' ? 60 : 0);
}

// 「결」 대결 판정(화면과 분리된 순수 로직, 2026-11-09). 시간은 ms, 입력은 press()로 넣고 advance()로 시간을 민다.
// 적이 공격 자세(windup)에 들어가면 타격 순간 H가 정해진다. 플레이어가 H 직전 perfect ms 안에 받기를 눌렀으면 패링 —
// 적 체간이 오르고 운해귀종의 "되돌아오는 틈"(counterWindow)이 열려 그동안의 베기가 counterMul배가 된다.
// 그보다 이르면(guard ms 안) 막기: 피해 일부와 내 체간. 누르지 않았으면 그대로 맞는다.
// 적 체간이 가득 차면 비틀거리고(stagger), 그때 베면 결정타. 무작위는 시드 RNG만 쓴다.
import { createRng, type Rng } from '../../src/engine/rng';

export interface Rules {
  perfect: number;
  guard: number;
  parryLockout: number;
  cueLead: number;
  counterWindow: number;
  counterMul: number;
  counterPosture: number;
  guardChip: number;
  guardPosture: number;
  parryPostureMul: number;
  deathblow: number;
  stagger: number;
  playerStagger: number;
  hurtLock: number;
}

export interface MoveDef {
  name: string;
  /** 공격 시작부터 타격까지 */
  windup: number;
  /** 타격 뒤 거두기까지 */
  recover: number;
  damage: number;
  posture: number;
}

export interface PatternDef {
  weight: number;
  /** after: 앞 공격을 거둔 뒤 이 공격을 시작하기까지 쉬는 시간(첫 공격은 무시) */
  steps: { move: string; after?: number }[];
}

export interface FoeDef {
  id: string;
  title: string;
  /** 「천외귀환」 적 그림 접두어(<sprite>_idle·attack·hit) */
  sprite: string;
  /** 배경 그림 id */
  bg: string;
  note: string;
  hp: number;
  posture: number;
  postureRegen: number;
  idle: [number, number];
  moves: Record<string, MoveDef>;
  patterns: PatternDef[];
}

export interface PlayerDef {
  name: string;
  sprite: string;
  hp: number;
  posture: number;
  postureRegen: number;
  attack: { duration: number; hitAt: number; damage: number; posture: number };
}

export interface DuelData {
  rules: Rules;
  player: PlayerDef;
  foes: FoeDef[];
}

export type DuelEvent =
  | { type: 'parry'; t: number; move: string }
  | { type: 'guard'; t: number; move: string; damage: number }
  | { type: 'guardBreak'; t: number }
  | { type: 'hit'; t: number; move: string; damage: number }
  | { type: 'strike'; t: number; damage: number; counter: boolean }
  | { type: 'stagger'; t: number }
  | { type: 'recover'; t: number }
  | { type: 'deathblow'; t: number; damage: number }
  | { type: 'win'; t: number }
  | { type: 'lose'; t: number };

export type PlayerAction = 'idle' | 'attack' | 'hurt' | 'broken';
export type FoeState = 'idle' | 'windup' | 'recover' | 'stagger' | 'dead';

export interface Duel {
  data: DuelData;
  foeDef: FoeDef;
  rng: Rng;
  t: number;
  result: 'win' | 'lose' | null;
  /** 운해귀종의 되돌아오는 틈: 이 시각까지 베기가 반격이 된다 */
  openingUntil: number;
  player: {
    hp: number;
    posture: number;
    action: PlayerAction;
    actionStart: number;
    actionEnd: number;
    attackLanded: boolean;
    /** 마지막으로 받기를 누른 시각(공격 하나를 판정하면 지운다) */
    parryAt: number | null;
    lastPress: number;
    lastGuard: number;
  };
  foe: {
    hp: number;
    posture: number;
    state: FoeState;
    stateStart: number;
    stateEnd: number;
    /** 지금 공격(windup·recover 동안) */
    move: string | null;
    /** windup일 때 타격 순간 */
    hitAt: number;
    pattern: PatternDef | null;
    step: number;
    /** 박자 사이 쉼(idle)이 끝나면 이어서 시작할 공격 */
    pending: string | null;
  };
  events: DuelEvent[];
  stats: { parries: number; guards: number; hits: number; counters: number; deathblows: number };
}

const STEP = 2;

export function createDuel(data: DuelData, foeId: string, seed = 'gyeol'): Duel {
  const foeDef = data.foes.find((f) => f.id === foeId);
  if (!foeDef) throw new Error(`알 수 없는 상대: ${foeId}`);
  const rng = createRng(seed).fork(foeId);
  const d: Duel = {
    data,
    foeDef,
    rng,
    t: 0,
    result: null,
    openingUntil: -1,
    player: { hp: data.player.hp, posture: 0, action: 'idle', actionStart: 0, actionEnd: 0, attackLanded: false, parryAt: null, lastPress: -Infinity, lastGuard: -Infinity },
    foe: { hp: foeDef.hp, posture: 0, state: 'idle', stateStart: 0, stateEnd: 0, move: null, hitAt: 0, pattern: null, step: 0, pending: null },
    events: [],
    stats: { parries: 0, guards: 0, hits: 0, counters: 0, deathblows: 0 },
  };
  // 첫 공격은 숨을 고를 시간을 조금 더 준다
  d.foe.stateEnd = foeDef.idle[1];
  return d;
}

/** 받기(패링)·베기 입력. 지금 시각(d.t)에 누른 것으로 친다. 받아들였으면 true */
export function press(d: Duel, input: 'parry' | 'attack'): boolean {
  if (d.result) return false;
  const p = d.player;
  if (p.action !== 'idle') return false;
  if (input === 'parry') {
    if (d.t - p.lastPress < d.data.rules.parryLockout) return false;
    p.lastPress = d.t;
    p.parryAt = d.t;
    return true;
  }
  const a = d.data.player.attack;
  p.action = 'attack';
  p.actionStart = d.t;
  p.actionEnd = d.t + a.duration;
  p.attackLanded = false;
  p.parryAt = null;
  return true;
}

/** 시간을 to까지 민다(작은 걸음으로 순서대로 처리) */
export function advance(d: Duel, to: number): void {
  while (d.t < to && !d.result) {
    const dt = Math.min(STEP, to - d.t);
    d.t += dt;
    regen(d, dt);
    stepPlayer(d);
    stepFoe(d);
  }
  if (d.result) d.t = Math.max(d.t, to);
}

/** 화면용: 지금 결(타격 예고)이 보이는가와 타격까지 남은 비율(1 → 0) */
export function cue(d: Duel): { visible: boolean; left: number; ratio: number } {
  const f = d.foe;
  if (f.state !== 'windup') return { visible: false, left: 0, ratio: 0 };
  const left = f.hitAt - d.t;
  const lead = d.data.rules.cueLead;
  return { visible: left <= lead, left, ratio: Math.max(0, Math.min(1, left / lead)) };
}

export const isOpen = (d: Duel): boolean => d.t <= d.openingUntil && d.foe.state !== 'stagger' && d.foe.state !== 'dead';

function regen(d: Duel, dt: number): void {
  const p = d.player;
  if (d.t - p.lastGuard > 600 && p.action !== 'broken') p.posture = Math.max(0, p.posture - (d.data.player.postureRegen * dt) / 1000);
  const f = d.foe;
  if (f.state === 'idle' && !f.pending) f.posture = Math.max(0, f.posture - (d.foeDef.postureRegen * dt) / 1000);
}

function stepPlayer(d: Duel): void {
  const p = d.player;
  const a = d.data.player.attack;
  if (p.action === 'attack' && !p.attackLanded && d.t >= p.actionStart + a.hitAt) {
    p.attackLanded = true;
    landStrike(d);
  }
  if (p.action !== 'idle' && d.t >= p.actionEnd) p.action = 'idle';
}

function landStrike(d: Duel): void {
  const f = d.foe;
  const r = d.data.rules;
  const a = d.data.player.attack;
  if (f.state === 'dead') return;
  if (f.state === 'stagger') {
    const dmg = Math.round(d.foeDef.hp * r.deathblow);
    f.hp = Math.max(0, f.hp - dmg);
    f.posture = 0;
    d.stats.deathblows++;
    d.events.push({ type: 'deathblow', t: d.t, damage: dmg });
    if (!checkFoeDown(d)) setFoeIdle(d, 900);
    return;
  }
  const counter = isOpen(d);
  const dmg = counter ? a.damage * r.counterMul : a.damage;
  f.hp = Math.max(0, f.hp - dmg);
  f.posture += counter ? r.counterPosture : a.posture;
  if (counter) d.stats.counters++;
  d.events.push({ type: 'strike', t: d.t, damage: dmg, counter });
  if (checkFoeDown(d)) return;
  checkStagger(d);
}

function stepFoe(d: Duel): void {
  const f = d.foe;
  switch (f.state) {
    case 'idle':
      if (d.t >= f.stateEnd) {
        if (f.pending) {
          const next = f.pending;
          f.pending = null;
          startMove(d, next);
        } else startPattern(d);
      }
      break;
    case 'windup':
      if (d.t >= f.hitAt) resolveHit(d);
      break;
    case 'recover':
      if (d.t >= f.stateEnd) nextStep(d);
      break;
    case 'stagger':
      if (d.t >= f.stateEnd) {
        f.posture = d.foeDef.posture * 0.5;
        d.events.push({ type: 'recover', t: d.t });
        setFoeIdle(d, 400);
      }
      break;
  }
}

function startPattern(d: Duel): void {
  const pat = d.rng.weighted(d.foeDef.patterns, (p) => p.weight);
  if (!pat) return;
  d.foe.pattern = pat;
  d.foe.step = 0;
  startMove(d, pat.steps[0].move);
}

function startMove(d: Duel, moveId: string): void {
  const f = d.foe;
  const m = d.foeDef.moves[moveId];
  f.state = 'windup';
  f.move = moveId;
  f.stateStart = d.t;
  f.hitAt = d.t + m.windup;
  f.stateEnd = f.hitAt;
}

function resolveHit(d: Duel): void {
  const f = d.foe;
  const p = d.player;
  const r = d.data.rules;
  const moveId = f.move!;
  const m = d.foeDef.moves[moveId];
  const H = f.hitAt;
  const since = p.parryAt === null ? Infinity : H - p.parryAt;
  p.parryAt = null;
  if (p.action !== 'broken' && since >= 0 && since <= r.perfect) {
    f.posture += m.posture * r.parryPostureMul;
    d.openingUntil = H + r.counterWindow;
    d.stats.parries++;
    d.events.push({ type: 'parry', t: H, move: moveId });
  } else if (p.action !== 'broken' && since >= 0 && since <= r.guard) {
    const dmg = Math.round(m.damage * r.guardChip);
    p.hp = Math.max(0, p.hp - dmg);
    p.posture += r.guardPosture;
    p.lastGuard = H;
    d.stats.guards++;
    d.events.push({ type: 'guard', t: H, move: moveId, damage: dmg });
    if (p.posture >= d.data.player.posture) {
      p.posture = 0;
      p.action = 'broken';
      p.actionStart = H;
      p.actionEnd = H + r.playerStagger;
      d.events.push({ type: 'guardBreak', t: H });
    }
  } else {
    p.hp = Math.max(0, p.hp - m.damage);
    d.stats.hits++;
    d.events.push({ type: 'hit', t: H, move: moveId, damage: m.damage });
    // 베는 중에 맞으면 베기가 끊긴다
    if (p.action !== 'broken') {
      p.action = 'hurt';
      p.actionStart = H;
      p.actionEnd = H + r.hurtLock;
    }
  }
  if (p.hp <= 0) {
    d.result = 'lose';
    d.events.push({ type: 'lose', t: H });
    return;
  }
  f.state = 'recover';
  f.stateStart = H;
  f.stateEnd = H + m.recover;
  checkStagger(d);
}

function nextStep(d: Duel): void {
  const f = d.foe;
  const pat = f.pattern;
  if (pat && f.step + 1 < pat.steps.length) {
    f.step++;
    const step = pat.steps[f.step];
    const wait = step.after ?? 0;
    if (wait <= 0) startMove(d, step.move);
    else {
      // 박자 사이 쉼: 서 있다가 다음 공격(이 동안은 체간이 회복되지 않는다)
      f.state = 'idle';
      f.move = null;
      f.stateStart = d.t;
      f.stateEnd = d.t + wait;
      f.pending = step.move;
    }
    return;
  }
  f.pattern = null;
  setFoeIdle(d, d.rng.int(d.foeDef.idle[0], d.foeDef.idle[1]));
}

function setFoeIdle(d: Duel, ms: number): void {
  const f = d.foe;
  f.state = 'idle';
  f.move = null;
  f.pattern = null;
  f.stateStart = d.t;
  f.stateEnd = d.t + ms;
  f.pending = null;
}

function checkStagger(d: Duel): void {
  const f = d.foe;
  if (f.state === 'dead' || f.state === 'stagger') return;
  if (f.posture >= d.foeDef.posture) {
    f.posture = d.foeDef.posture;
    f.state = 'stagger';
    f.move = null;
    f.pattern = null;
    f.stateStart = d.t;
    f.stateEnd = d.t + d.data.rules.stagger;
    f.pending = null;
    d.openingUntil = -1;
    d.events.push({ type: 'stagger', t: d.t });
  }
}

function checkFoeDown(d: Duel): boolean {
  const f = d.foe;
  if (f.hp > 0) return false;
  f.state = 'dead';
  f.stateStart = d.t;
  f.move = null;
  d.result = 'win';
  d.events.push({ type: 'win', t: d.t });
  return true;
}

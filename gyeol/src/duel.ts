// 「결」 대결 판정(화면과 분리된 순수 로직, 2026-11-09). 시간은 ms, 입력은 press()로 넣고 advance()로 시간을 민다.
// 적이 공격 자세(windup)에 들어가면 타격 순간 H가 정해진다. 플레이어가 H 직전 perfect ms 안에 받기를 눌렀으면 패링 —
// 적 체간이 오르고 운해귀종의 "되돌아오는 틈"(counterWindow)이 열려 그동안의 베기가 counterMul배가 된다.
// 그보다 이르면(guard ms 안) 막기: 피해 일부와 내 체간. 누르지 않았으면 그대로 맞는다.
// 적 체간이 가득 차면 비틀거리고(stagger), 그때 베면 결정타. 무작위는 시드 RNG만 쓴다.
// 2026-11-09 목업 2차: 원소(화염: 패링해도 화상, 냉기: 결이 느리다 갑자기, 번개: 박자가 튐), 받을 수 없는 공격(붉은 결 → 피하기),
// 속임수 공격(가짜 타격 순간 뒤 한 박자 늦게), 연속 박자(streak 단계), 박자 도전 모드(고정 악보·판정·등급).
import { createRng, type Rng } from '../../src/engine/rng';

export type Element = 'fire' | 'ice' | 'lightning';

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
  /** 피하기: 누른 뒤 무적 시간·동작 길이·연타 막기 */
  dodgeIframe: number;
  dodgeDuration: number;
  dodgeLockout: number;
  /** 받을 수 없는 공격을 피했을 때(간파) 적 체간 */
  mikiriPosture: number;
  /** 화염: 패링해도 남는 화상 피해, 막으면 더 */
  fireParryChip: number;
  fireGuardExtra: number;
  /** 번개: 타격 순간이 ±이만큼 흔들린다(대결 모드만) */
  lightningJitter: number;
  /** 연속 박자 단계(이 수에 이르면 단계 +1)와 단계마다 패링 체간 배율 가산 */
  streakTiers: number[];
  streakPostureBonus: number;
}

export interface MoveDef {
  name: string;
  /** 공격 시작부터 타격까지(속임수면 가짜 타격 순간까지) */
  windup: number;
  /** 타격 뒤 거두기까지 */
  recover: number;
  damage: number;
  posture: number;
  element?: Element;
  /** 받을 수 없는 공격(붉은 결): 받기·막기가 통하지 않고 피해야 한다 */
  unblockable?: boolean;
  /** 속임수: 가짜 타격 순간에서 이만큼 더 끌었다가 친다 */
  feint?: number;
}

export interface PatternDef {
  weight: number;
  /** after: 앞 공격을 거둔 뒤 이 공격을 시작하기까지 쉬는 시간(첫 공격은 무시) */
  steps: { move: string; after?: number }[];
}

/** 박자 도전 악보: at = 타격 순간(ms, 시작부터) */
export interface ChartDef {
  title: string;
  steps: { move: string; at: number }[];
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
  chart?: ChartDef;
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

export type Grade = 'perfect' | 'good' | 'miss';

export type DuelEvent =
  | { type: 'parry'; t: number; move: string; element?: Element; heavy: boolean }
  | { type: 'guard'; t: number; move: string; damage: number; element?: Element }
  | { type: 'guardBreak'; t: number }
  | { type: 'hit'; t: number; move: string; damage: number; element?: Element; heavy: boolean; unblockable: boolean }
  | { type: 'mikiri'; t: number; move: string }
  | { type: 'evade'; t: number; move: string }
  | { type: 'burn'; t: number; damage: number }
  | { type: 'feint'; t: number; move: string }
  | { type: 'streak'; t: number; streak: number; tier: number }
  | { type: 'judge'; t: number; grade: Grade }
  | { type: 'strike'; t: number; damage: number; counter: boolean }
  | { type: 'stagger'; t: number }
  | { type: 'recover'; t: number }
  | { type: 'deathblow'; t: number; damage: number }
  | { type: 'win'; t: number }
  | { type: 'lose'; t: number };

export type PlayerAction = 'idle' | 'attack' | 'dodge' | 'hurt' | 'broken';
export type FoeState = 'idle' | 'windup' | 'recover' | 'stagger' | 'dead';
export type Mode = 'duel' | 'rhythm';

export interface Duel {
  data: DuelData;
  foeDef: FoeDef;
  mode: Mode;
  rng: Rng;
  t: number;
  result: 'win' | 'lose' | null;
  /** 운해귀종의 되돌아오는 틈: 이 시각까지 베기가 반격이 된다 */
  openingUntil: number;
  /** 연속 박자: 패링·간파가 이어진 수(맞거나 막으면 0) */
  streak: number;
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
    /** 피하기 무적이 끝나는 시각 */
    iframeUntil: number;
    lastDodge: number;
  };
  foe: {
    hp: number;
    posture: number;
    state: FoeState;
    stateStart: number;
    stateEnd: number;
    /** 지금 공격(windup·recover 동안) */
    move: string | null;
    /** windup일 때 진짜 타격 순간 */
    hitAt: number;
    /** 속임수일 때 가짜 타격 순간(아니면 null) */
    fakeAt: number | null;
    fakeShown: boolean;
    pattern: PatternDef | null;
    step: number;
    /** 박자 사이 쉼(idle)이 끝나면 이어서 시작할 공격 */
    pending: string | null;
    /** 박자 도전: 다음 악보 칸 */
    chartIdx: number;
  };
  events: DuelEvent[];
  stats: {
    parries: number;
    guards: number;
    hits: number;
    counters: number;
    deathblows: number;
    dodges: number;
    maxStreak: number;
    perfect: number;
    good: number;
    miss: number;
  };
}

const STEP = 2;
/** 화면이 세게 흔들리는 무거운 공격의 기준 피해 */
export const HEAVY_DAMAGE = 20;

export function createDuel(data: DuelData, foeId: string, seed = 'gyeol', mode: Mode = 'duel'): Duel {
  const foeDef = data.foes.find((f) => f.id === foeId);
  if (!foeDef) throw new Error(`알 수 없는 상대: ${foeId}`);
  if (mode === 'rhythm' && !foeDef.chart) throw new Error(`${foeId}에는 박자 도전 악보가 없다`);
  const rng = createRng(seed).fork(foeId);
  const d: Duel = {
    data,
    foeDef,
    mode,
    rng,
    t: 0,
    result: null,
    openingUntil: -1,
    streak: 0,
    player: {
      hp: data.player.hp,
      posture: 0,
      action: 'idle',
      actionStart: 0,
      actionEnd: 0,
      attackLanded: false,
      parryAt: null,
      lastPress: -Infinity,
      lastGuard: -Infinity,
      iframeUntil: -Infinity,
      lastDodge: -Infinity,
    },
    foe: { hp: foeDef.hp, posture: 0, state: 'idle', stateStart: 0, stateEnd: 0, move: null, hitAt: 0, fakeAt: null, fakeShown: false, pattern: null, step: 0, pending: null, chartIdx: 0 },
    events: [],
    stats: { parries: 0, guards: 0, hits: 0, counters: 0, deathblows: 0, dodges: 0, maxStreak: 0, perfect: 0, good: 0, miss: 0 },
  };
  // 첫 공격은 숨을 고를 시간을 조금 더 준다
  d.foe.stateEnd = foeDef.idle[1];
  return d;
}

export const streakTier = (d: Duel): number => d.data.rules.streakTiers.filter((n) => d.streak >= n).length;

/** 받기(패링)·베기·피하기 입력. 지금 시각(d.t)에 누른 것으로 친다. 받아들였으면 true */
export function press(d: Duel, input: 'parry' | 'attack' | 'dodge'): boolean {
  if (d.result) return false;
  const p = d.player;
  const r = d.data.rules;
  if (p.action !== 'idle') return false;
  if (input === 'parry') {
    if (d.t - p.lastPress < r.parryLockout) return false;
    p.lastPress = d.t;
    p.parryAt = d.t;
    return true;
  }
  if (input === 'dodge') {
    if (d.t - p.lastDodge < r.dodgeLockout) return false;
    p.lastDodge = d.t;
    p.action = 'dodge';
    p.actionStart = d.t;
    p.actionEnd = d.t + r.dodgeDuration;
    p.iframeUntil = d.t + r.dodgeIframe;
    p.parryAt = null;
    return true;
  }
  // 박자 도전에서는 베기가 없다(받기·피하기만 판정)
  if (d.mode === 'rhythm') return false;
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
    if (d.mode === 'rhythm') stepChart(d);
    else stepFoe(d);
  }
  if (d.result) d.t = Math.max(d.t, to);
}

export interface Cue {
  visible: boolean;
  /** 진짜 타격까지 남은 ms */
  left: number;
  /** 고리 크기 비율(1 → 0). 원소마다 좁혀 드는 모양이 다르다 */
  ratio: number;
  element?: Element;
  unblockable: boolean;
  /** 속임수의 가짜 순간을 지나기 전이면 true(고리는 가짜 순간에 닿는다) */
  faking: boolean;
  heavy: boolean;
}

/** 화면용: 지금 결(타격 예고)이 보이는가와 고리 비율 */
export function cue(d: Duel): Cue {
  const f = d.foe;
  const none: Cue = { visible: false, left: 0, ratio: 0, unblockable: false, faking: false, heavy: false };
  if (f.state !== 'windup' || !f.move) return none;
  const m = d.foeDef.moves[f.move];
  const lead = d.data.rules.cueLead;
  const faking = f.fakeAt !== null && d.t < f.fakeAt;
  // 속임수: 가짜 순간까지는 그쪽으로 좁혀 들고, 지나면 진짜 순간으로 짧게 다시 좁혀 든다
  const target = faking ? f.fakeAt! : f.hitAt;
  const span = faking || f.fakeAt === null ? lead : Math.min(lead, f.hitAt - f.fakeAt);
  const left = target - d.t;
  let ratio = Math.max(0, Math.min(1, left / span));
  if (m.element === 'ice') ratio = Math.sqrt(ratio); // 느리게 오다 마지막에 갑자기
  else if (m.element === 'lightning') ratio = Math.ceil(ratio * 5) / 5; // 뚝뚝 끊겨 튄다
  return {
    visible: left <= span,
    left: f.hitAt - d.t,
    ratio,
    element: m.element,
    unblockable: !!m.unblockable,
    faking,
    heavy: m.damage >= HEAVY_DAMAGE,
  };
}

export const isOpen = (d: Duel): boolean => d.t <= d.openingUntil && d.foe.state !== 'stagger' && d.foe.state !== 'dead';

/** 박자 도전 정확도(0~1)와 등급 */
export function rhythmScore(d: Duel): { accuracy: number; rank: 'S' | 'A' | 'B' | 'C'; total: number } {
  const s = d.stats;
  const total = s.perfect + s.good + s.miss;
  const accuracy = total ? (s.perfect + s.good * 0.5) / total : 0;
  const rank = accuracy >= 0.92 && s.miss === 0 ? 'S' : accuracy >= 0.8 ? 'A' : accuracy >= 0.6 ? 'B' : 'C';
  return { accuracy, rank, total };
}

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

function stepWindup(d: Duel): void {
  const f = d.foe;
  if (f.fakeAt !== null && !f.fakeShown && d.t >= f.fakeAt) {
    f.fakeShown = true;
    d.events.push({ type: 'feint', t: f.fakeAt, move: f.move! });
  }
  if (d.t >= f.hitAt) resolveHit(d);
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
      stepWindup(d);
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

/** 박자 도전: 악보대로 공격을 시작한다(타격 순간 = at). 마지막 타격 뒤 잠시 있다가 끝 */
function stepChart(d: Duel): void {
  const f = d.foe;
  const chart = d.foeDef.chart!;
  if (f.state === 'windup') stepWindup(d);
  else if (f.state === 'recover' && d.t >= f.stateEnd) setFoeIdle(d, 0);
  if (f.state === 'windup') return;
  const step = chart.steps[f.chartIdx];
  if (step) {
    const m = d.foeDef.moves[step.move];
    const start = step.at - m.windup - (m.feint ?? 0);
    if (d.t >= start) {
      f.chartIdx++;
      startMove(d, step.move, step.at);
    }
    return;
  }
  const last = chart.steps[chart.steps.length - 1]?.at ?? 0;
  if (d.t >= last + 1200) {
    d.result = 'win';
    d.events.push({ type: 'win', t: d.t });
  }
}

function startPattern(d: Duel): void {
  const pat = d.rng.weighted(d.foeDef.patterns, (p) => p.weight);
  if (!pat) return;
  d.foe.pattern = pat;
  d.foe.step = 0;
  startMove(d, pat.steps[0].move);
}

function startMove(d: Duel, moveId: string, hitAt?: number): void {
  const f = d.foe;
  const m = d.foeDef.moves[moveId];
  const r = d.data.rules;
  f.state = 'windup';
  f.move = moveId;
  f.stateStart = d.t;
  const feint = m.feint ?? 0;
  let H = hitAt ?? d.t + m.windup + feint;
  // 번개: 대결에서는 박자가 튄다(악보에서는 악보대로)
  if (hitAt === undefined && m.element === 'lightning' && r.lightningJitter > 0) H += d.rng.int(-r.lightningJitter, r.lightningJitter);
  f.hitAt = Math.max(d.t + r.perfect + 40, H);
  f.fakeAt = feint > 0 ? f.hitAt - feint : null;
  f.fakeShown = false;
  f.stateEnd = f.hitAt;
}

function judge(d: Duel, grade: Grade, t: number): void {
  d.stats[grade]++;
  if (d.mode === 'rhythm') d.events.push({ type: 'judge', t, grade });
}

function bumpStreak(d: Duel, t: number): void {
  const before = streakTier(d);
  d.streak++;
  d.stats.maxStreak = Math.max(d.stats.maxStreak, d.streak);
  const tier = streakTier(d);
  if (tier > before || d.streak >= 2) d.events.push({ type: 'streak', t, streak: d.streak, tier });
}

function resolveHit(d: Duel): void {
  const f = d.foe;
  const p = d.player;
  const r = d.data.rules;
  const moveId = f.move!;
  const m = d.foeDef.moves[moveId];
  const H = f.hitAt;
  const heavy = m.damage >= HEAVY_DAMAGE;
  const since = p.parryAt === null ? Infinity : H - p.parryAt;
  p.parryAt = null;
  const rhythm = d.mode === 'rhythm';
  const dodging = H <= p.iframeUntil && p.action === 'dodge';
  if (dodging) {
    d.stats.dodges++;
    if (m.unblockable) {
      // 간파: 받을 수 없는 공격을 피하면 틈이 열린다
      f.posture += r.mikiriPosture;
      d.openingUntil = H + r.counterWindow;
      d.events.push({ type: 'mikiri', t: H, move: moveId });
      judge(d, 'perfect', H);
      bumpStreak(d, H);
    } else {
      d.events.push({ type: 'evade', t: H, move: moveId });
      judge(d, 'good', H);
    }
  } else if (!m.unblockable && p.action !== 'broken' && since >= 0 && since <= r.perfect) {
    const tier = streakTier(d);
    f.posture += m.posture * (r.parryPostureMul + tier * r.streakPostureBonus);
    d.openingUntil = H + r.counterWindow;
    d.stats.parries++;
    d.events.push({ type: 'parry', t: H, move: moveId, element: m.element, heavy });
    judge(d, 'perfect', H);
    bumpStreak(d, H);
    if (m.element === 'fire' && !rhythm) burn(d, r.fireParryChip, H);
  } else if (!m.unblockable && p.action !== 'broken' && since >= 0 && since <= r.guard) {
    let dmg = Math.round(m.damage * r.guardChip);
    if (m.element === 'fire') dmg += r.fireGuardExtra;
    if (!rhythm) p.hp = Math.max(0, p.hp - dmg);
    p.posture += rhythm ? 0 : r.guardPosture;
    p.lastGuard = H;
    d.stats.guards++;
    d.streak = 0;
    d.events.push({ type: 'guard', t: H, move: moveId, damage: dmg, element: m.element });
    judge(d, 'good', H);
    if (p.posture >= d.data.player.posture) {
      p.posture = 0;
      p.action = 'broken';
      p.actionStart = H;
      p.actionEnd = H + r.playerStagger;
      d.events.push({ type: 'guardBreak', t: H });
    }
  } else {
    if (!rhythm) p.hp = Math.max(0, p.hp - m.damage);
    d.stats.hits++;
    d.streak = 0;
    d.events.push({ type: 'hit', t: H, move: moveId, damage: m.damage, element: m.element, heavy, unblockable: !!m.unblockable });
    judge(d, 'miss', H);
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
  f.fakeAt = null;
  if (!rhythm) checkStagger(d);
}

function burn(d: Duel, dmg: number, t: number): void {
  if (dmg <= 0) return;
  d.player.hp = Math.max(0, d.player.hp - dmg);
  d.events.push({ type: 'burn', t, damage: dmg });
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
  f.fakeAt = null;
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
    f.fakeAt = null;
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

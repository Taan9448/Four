// 「결」 대결 판정(화면과 분리된 순수 로직, 2026-11-09). 시간은 ms, 입력은 press()로 넣고 advance()로 시간을 민다.
// 적이 공격 자세(windup)에 들어가면 타격 순간 H가 정해진다. 플레이어가 H 직전 perfect ms 안에 받기를 눌렀으면 패링 —
// 적 체간이 오르고 운해귀종의 "되돌아오는 틈"(counterWindow)이 열려 그동안의 베기가 counterMul배가 된다.
// 그보다 이르면(guard ms 안) 막기: 피해 일부와 내 체간. 누르지 않았으면 그대로 맞는다.
// 적 체간이 가득 차면 비틀거리고(stagger), 그때 베면 결정타. 무작위는 시드 RNG만 쓴다.
// 2026-11-09 목업 2차: 원소(화염: 패링해도 화상, 냉기: 결이 느리다 갑자기, 번개: 박자가 튐), 받을 수 없는 공격(붉은 결 → 피하기),
// 속임수 공격(가짜 타격 순간 뒤 한 박자 늦게), 연속 박자(streak 단계), 박자 도전 모드(고정 악보·판정·등급).
// 2026-11-09 목업 4차: 칼 맞부딪힘 겨루기(clash), 위기(배수의 진), 집중(심안), 적별 결정타·날씨·대사(화면은 데이터만 읽는다).
import { createRng, type Rng } from '../../src/engine/rng';

export type Element = 'fire' | 'ice' | 'lightning';

export interface Rules {
  perfect: number;
  /** 패링 중에서도 타격에 이만큼 가까이 받으면 EXCELLENT(아니면 GREAT) */
  excellent: number;
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
  /** 베기 연타 막기(2026-11-09): 틈·비틀거림이 아닐 때의 베기는 적이 막는다 — 피해 배율, 체간 */
  foeGuardMul: number;
  foeGuardPosture: number;
  /** 막힌 베기가 이만큼 이어지면 적이 곧바로 가장 빠른 공격으로 되받아친다 */
  punishAfter: number;
  /**
   * 칼 맞부딪힘 겨루기(2026-11-09): 하운의 베기가 닿는 순간과 적의 타격 순간이 clashWindow ms 안이면 겨루기.
   * 베기를 연타하지 않고 한 번 노려 벤 것만 친다(앞 베기가 끝나고 clashCalm ms 뒤에 시작한 베기).
   * 겨루기 동안 J·K를 누를 때마다 clashPush만큼 밀고(clashPressGap ms보다 빠른 연타는 한 번), 적은 초마다 clashPower만큼 민다.
   * 끝까지 밀거나 clashDuration이 끝날 때 절반 넘게 밀었으면 이긴다.
   */
  clashWindow: number;
  clashCalm: number;
  clashDuration: number;
  clashPush: number;
  clashPressGap: number;
  /** 이기면: 적 체간(최대 대비) · 베기 피해 배율 · 그 뒤 반격 틈 */
  clashWinPosture: number;
  clashWinDamage: number;
  /** 지면: 적 공격 피해 배율 · 내 체간 */
  clashLoseMul: number;
  clashLosePosture: number;
  /** 위기(배수의 진): 체력이 이 비율 이하면 EXCELLENT 판정 폭이 crisisExcellentMul배 */
  crisisHp: number;
  crisisExcellentMul: number;
  /** 집중(심안): 받기로 게이지를 모아 가득 차면 쓴다 — focusDuration ms(대결 시계) 동안 화면이 focusRate배로 느려지고 결이 처음부터 보인다 */
  focusMax: number;
  focusStart: number;
  focusGain: { excellent: number; great: number; good: number };
  focusDuration: number;
  focusRate: number;
}

/** 날씨·환경 입자(화면만) */
export type Weather = 'leaves' | 'embers' | 'snow' | 'rain' | 'ash';
/** 대사(말풍선): 순간마다 여러 줄 중 하나 */
export type LineKey = 'start' | 'reply' | 'clash' | 'stagger' | 'crisis' | 'win' | 'lose';
export type Lines = Partial<Record<LineKey, string[]>>;

/** 적별 결정타 연출(화면만): 이름·모양·하운 대사. Codex fx_gyeol_finisher_<적 id>가 오면 그 그림 */
export interface FinisherDef {
  name: string;
  hanja: string;
  style: 'cross' | 'chain' | 'shatter' | 'shadow' | 'quench';
  line: string;
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
  /** 받을 수 없는 기술의 전용 이펙트(Codex fx_gyeol_skill_*) — 타격 순간 하운 쪽에 터진다 */
  fx?: string;
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
  /** 화면 크기 배율(2026-11-09): 이그니스처럼 큰 적은 크게, 늑대는 작게 */
  scale?: number;
  note: string;
  hp: number;
  posture: number;
  postureRegen: number;
  idle: [number, number];
  moves: Record<string, MoveDef>;
  patterns: PatternDef[];
  chart?: ChartDef;
  /** 겨루기에서 초마다 미는 힘(없으면 0.45) */
  clashPower?: number;
  finisher?: FinisherDef;
  weather?: Weather;
  lines?: Lines;
}

export interface PlayerDef {
  name: string;
  sprite: string;
  scale?: number;
  hp: number;
  posture: number;
  postureRegen: number;
  attack: { duration: number; hitAt: number; damage: number; posture: number };
  lines?: Lines;
}

/**
 * 진하운의 기술(2026-11-09): 받기·피하기를 끊기지 않고 이어 가면(결 연환) 열린다.
 * chain 이상 이어졌고(GOOD 이상이면 잇는다), pure면 그 사이가 모두 EXCELLENT여야 한다.
 * 지금: 낙운무흔 5연환 · 벽운단하 EXCELLENT 5연환 · 운해귀종 10연환(2026-11-09 사용자 조정). 준비된 기술은 맞아도 남고, 스킬 입력으로 쓴다.
 */
export interface TechDef {
  id: string;
  name: string;
  hanja: string;
  chain: number;
  pure: boolean;
  /** 적 최대 체력 대비 피해 비율 */
  damage: number;
  /** 적 최대 체간 대비 체간 비율(1이면 곧바로 비틀거림) */
  posture: number;
  /** 연환 동안 받아낸 공격 피해의 합 × 이 배율을 더 돌려보낸다(운해귀종) */
  returnMul: number;
  /** 시전 대사(「천외귀환」 카드 castLine) */
  line: string;
}

export interface DuelData {
  rules: Rules;
  player: PlayerDef;
  foes: FoeDef[];
  techs: TechDef[];
}

export type Grade = 'perfect' | 'good' | 'miss';
/** 판정 글자(2026-11-09): 패링·간파는 정밀도에 따라 EXCELLENT·GREAT, 막기·피함은 GOOD, 맞으면 MISS */
export type Judgement = 'excellent' | 'great' | 'good' | 'miss';

export type DuelEvent =
  | { type: 'parry'; t: number; move: string; element?: Element; heavy: boolean; judgement: Judgement }
  | { type: 'guard'; t: number; move: string; damage: number; element?: Element }
  | { type: 'guardBreak'; t: number }
  | { type: 'hit'; t: number; move: string; damage: number; element?: Element; heavy: boolean; unblockable: boolean }
  | { type: 'mikiri'; t: number; move: string; judgement: Judgement }
  | { type: 'evade'; t: number; move: string }
  | { type: 'burn'; t: number; damage: number }
  | { type: 'feint'; t: number; move: string }
  | { type: 'streak'; t: number; streak: number; tier: number }
  | { type: 'judge'; t: number; grade: Grade; judgement: Judgement }
  | { type: 'strike'; t: number; damage: number; counter: boolean; blocked: boolean }
  | { type: 'punish'; t: number; move: string }
  | { type: 'skill'; t: number; move: string; name: string }
  | { type: 'link'; t: number; chain: number; pure: boolean }
  | { type: 'techReady'; t: number; tech: string }
  | { type: 'tech'; t: number; tech: string; damage: number }
  | { type: 'techHit'; t: number; tech: string; damage: number }
  | { type: 'stagger'; t: number }
  | { type: 'recover'; t: number }
  | { type: 'deathblow'; t: number; damage: number }
  | { type: 'clash'; t: number; move: string }
  | { type: 'clashPush'; t: number; balance: number }
  | { type: 'clashWin'; t: number; damage: number }
  | { type: 'clashLose'; t: number; damage: number }
  | { type: 'crisis'; t: number }
  | { type: 'focus'; t: number }
  | { type: 'win'; t: number }
  | { type: 'lose'; t: number };

export type PlayerAction = 'idle' | 'attack' | 'dodge' | 'tech' | 'hurt' | 'broken' | 'clash';
export type FoeState = 'idle' | 'windup' | 'recover' | 'stagger' | 'dead' | 'clash';
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
  /** 적이 이어서 막은 베기 수(틈에 베거나 패링하면 0) */
  blockedRun: number;
  /** 결 연환: 끊기지 않고 받거나 피한 수, 그 사이가 모두 EXCELLENT였는가, 받아낸 공격 피해의 합 */
  chain: number;
  chainPure: boolean;
  chainForce: number;
  /** 준비된 기술과, 준비됐을 때의 받아낸 힘(운해귀종이 돌려보낸다) */
  techReady: string | null;
  techForce: number;
  /** 쓰는 중인 기술(피해가 들어갔는가) */
  techUsing: string | null;
  techLanded: boolean;
  /** 겨루기: 0(적이 다 밀었다)~1(하운이 다 밀었다), 0.5에서 시작 */
  clash: { start: number; end: number; balance: number; move: string; lastPress: number; presses: number } | null;
  /** 위기(배수의 진)에 들어섰는가 */
  crisis: boolean;
  /** 집중 게이지와 집중이 끝나는 시각(대결 시계) */
  focus: number;
  focusUntil: number;
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
    /** 마지막 베기가 끝난(끊긴) 시각 — 연타가 아닌 노린 베기만 겨루기가 된다 */
    lastAttackEnd: number;
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
    techs: number;
    /** perfect 가운데 EXCELLENT */
    excellent: number;
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
    blockedRun: 0,
    chain: 0,
    chainPure: true,
    chainForce: 0,
    techReady: null,
    techForce: 0,
    techUsing: null,
    techLanded: false,
    clash: null,
    crisis: false,
    focus: mode === 'rhythm' ? 0 : data.rules.focusStart,
    focusUntil: -1,
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
      lastAttackEnd: -Infinity,
    },
    foe: { hp: foeDef.hp, posture: 0, state: 'idle', stateStart: 0, stateEnd: 0, move: null, hitAt: 0, fakeAt: null, fakeShown: false, pattern: null, step: 0, pending: null, chartIdx: 0 },
    events: [],
    stats: { parries: 0, guards: 0, hits: 0, counters: 0, deathblows: 0, dodges: 0, maxStreak: 0, perfect: 0, excellent: 0, good: 0, miss: 0, techs: 0 },
  };
  // 첫 공격은 숨을 고를 시간을 조금 더 준다
  d.foe.stateEnd = foeDef.idle[1];
  return d;
}

export const streakTier = (d: Duel): number => d.data.rules.streakTiers.filter((n) => d.streak >= n).length;

export const isFocusing = (d: Duel): boolean => d.t < d.focusUntil;

/** 받기(패링)·베기·피하기·기술·집중 입력. 지금 시각(d.t)에 누른 것으로 친다. 받아들였으면 true */
export function press(d: Duel, input: 'parry' | 'attack' | 'dodge' | 'tech' | 'focus'): boolean {
  if (d.result) return false;
  const p = d.player;
  const r = d.data.rules;
  if (input === 'focus') {
    // 집중: 게이지가 가득 찼을 때만, 무엇을 하는 중이든 쓸 수 있다(박자 도전에는 없다)
    if (d.mode === 'rhythm' || d.focus < r.focusMax || isFocusing(d)) return false;
    d.focus = 0;
    d.focusUntil = d.t + r.focusDuration;
    d.events.push({ type: 'focus', t: d.t });
    return true;
  }
  if (d.clash) return input === 'attack' || input === 'parry' ? clashPress(d) : false;
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
  if (input === 'tech') {
    // 기술: 준비돼 있을 때만. 쓰는 동안은 무적(TECH_DURATION), TECH_HIT에 피해가 들어간다
    if (d.mode === 'rhythm' || !d.techReady) return false;
    p.action = 'tech';
    p.actionStart = d.t;
    p.actionEnd = d.t + TECH_DURATION;
    p.iframeUntil = p.actionEnd;
    p.parryAt = null;
    d.techUsing = d.techReady;
    d.techLanded = false;
    d.techReady = null;
    d.stats.techs++;
    d.events.push({ type: 'tech', t: d.t, tech: d.techUsing, damage: 0 });
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
    if (d.clash) stepClash(d, dt);
    else if (d.mode === 'rhythm') stepChart(d);
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
  /** 집중 중: 결이 공격을 시작할 때부터 보이고, 속임수가 드러난다 */
  focus: boolean;
}

/** 화면용: 지금 결(타격 예고)이 보이는가와 고리 비율 */
export function cue(d: Duel): Cue {
  const f = d.foe;
  const focus = isFocusing(d);
  const none: Cue = { visible: false, left: 0, ratio: 0, unblockable: false, faking: false, heavy: false, focus };
  if (f.state !== 'windup' || !f.move) return none;
  const m = d.foeDef.moves[f.move];
  const faking = f.fakeAt !== null && d.t < f.fakeAt;
  // 속임수: 가짜 순간까지는 그쪽으로 좁혀 들고, 지나면 진짜 순간으로 짧게 다시 좁혀 든다
  const target = faking ? f.fakeAt! : f.hitAt;
  // 집중 중이면 공격을 시작할 때부터 결이 보인다
  const lead = focus ? Math.max(d.data.rules.cueLead, target - f.stateStart) : d.data.rules.cueLead;
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
    focus,
  };
}

export const isOpen = (d: Duel): boolean => d.t <= d.openingUntil && d.foe.state !== 'stagger' && d.foe.state !== 'dead';

/** 박자 도전 정확도(0~1)와 등급 */
export function rhythmScore(d: Duel): { accuracy: number; rank: 'S' | 'A' | 'B' | 'C'; total: number } {
  const s = d.stats;
  const total = s.perfect + s.good + s.miss;
  // EXCELLENT 1 · GREAT 0.9 · GOOD 0.5 · MISS 0
  const accuracy = total ? (s.excellent + (s.perfect - s.excellent) * 0.9 + s.good * 0.5) / total : 0;
  const rank = accuracy >= 0.92 && s.miss === 0 ? 'S' : accuracy >= 0.8 ? 'A' : accuracy >= 0.6 ? 'B' : 'C';
  return { accuracy, rank, total };
}

function regen(d: Duel, dt: number): void {
  const p = d.player;
  if (d.t - p.lastGuard > 600 && p.action !== 'broken') p.posture = Math.max(0, p.posture - (d.data.player.postureRegen * dt) / 1000);
  const f = d.foe;
  if (f.state === 'idle' && !f.pending) f.posture = Math.max(0, f.posture - (d.foeDef.postureRegen * dt) / 1000);
}

/** 기술 동작 길이와 피해가 들어가는 순간(그림 연출과 맞춘다) */
export const TECH_DURATION = 900;
export const TECH_HIT = 420;

export const techOf = (d: Duel, id: string | null): TechDef | undefined => (id ? d.data.techs.find((t) => t.id === id) : undefined);

function stepPlayer(d: Duel): void {
  const p = d.player;
  const a = d.data.player.attack;
  if (p.action === 'tech' && !d.techLanded && d.t >= p.actionStart + TECH_HIT) {
    d.techLanded = true;
    landTech(d);
  }
  if (p.action === 'attack' && !p.attackLanded && d.t >= p.actionStart + a.hitAt) {
    p.attackLanded = true;
    landStrike(d);
  }
  if (p.action !== 'idle' && d.t >= p.actionEnd) {
    if (p.action === 'attack') p.lastAttackEnd = d.t;
    p.action = 'idle';
  }
}

function landStrike(d: Duel): void {
  const f = d.foe;
  const r = d.data.rules;
  const a = d.data.player.attack;
  if (f.state === 'dead') return;
  // 노려 벤 칼이 적의 타격과 거의 동시에 닿으면 칼끼리 맞부딪힌다
  if (f.state === 'windup' && canClash(d) && Math.abs(f.hitAt - d.t) <= r.clashWindow) {
    startClash(d);
    return;
  }
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
  // 틈 밖의 베기는 적이 막는다: 피해는 조금, 체간도 조금. 연타하면 되받아친다
  const blocked = !counter;
  const dmg = counter ? a.damage * r.counterMul : Math.max(1, Math.round(a.damage * r.foeGuardMul));
  f.hp = Math.max(0, f.hp - dmg);
  f.posture += counter ? r.counterPosture : r.foeGuardPosture;
  if (counter) {
    d.stats.counters++;
    d.blockedRun = 0;
  } else d.blockedRun++;
  d.events.push({ type: 'strike', t: d.t, damage: dmg, counter, blocked });
  if (checkFoeDown(d)) return;
  checkStagger(d);
  if (blocked && d.blockedRun >= r.punishAfter) punish(d);
}

/** 되받아치기: 서 있거나 거두는 중이면 곧바로 가장 빠른(받을 수 있는) 공격을 시작한다 */
function punish(d: Duel): void {
  const f = d.foe;
  if (f.state !== 'idle' && f.state !== 'recover') return;
  const moves = Object.entries(d.foeDef.moves).filter(([, m]) => !m.unblockable && !m.feint);
  if (!moves.length) return;
  const [id] = moves.reduce((a, b) => (b[1].windup < a[1].windup ? b : a));
  d.blockedRun = 0;
  f.pattern = null;
  f.pending = null;
  d.events.push({ type: 'punish', t: d.t, move: id });
  startMove(d, id);
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
  // 받을 수 없는 기술은 이름을 외치며 나간다
  if (m.unblockable) d.events.push({ type: 'skill', t: d.t, move: moveId, name: m.name });
}

function judge(d: Duel, grade: Grade, t: number, judgement: Judgement): void {
  d.stats[grade]++;
  if (judgement === 'excellent') d.stats.excellent++;
  if (d.mode === 'rhythm') d.events.push({ type: 'judge', t, grade, judgement });
  else gainFocus(d, judgement);
}

function gainFocus(d: Duel, judgement: Judgement): void {
  if (judgement === 'miss' || isFocusing(d)) return;
  const r = d.data.rules;
  d.focus = Math.min(r.focusMax, d.focus + r.focusGain[judgement]);
}

/** 겨루기가 될 수 있는 베기인가: 대결에서, 베는 중이고, 앞 베기에서 clashCalm 넘게 쉬었다가 노려 벤 칼 */
function canClash(d: Duel): boolean {
  const p = d.player;
  const f = d.foe;
  if (d.mode === 'rhythm' || p.action !== 'attack' || !f.move) return false;
  if (d.foeDef.moves[f.move].unblockable) return false;
  return p.actionStart - p.lastAttackEnd >= d.data.rules.clashCalm;
}

function startClash(d: Duel): void {
  const f = d.foe;
  const p = d.player;
  const t = d.t;
  d.clash = { start: t, end: t + d.data.rules.clashDuration, balance: 0.5, move: f.move!, lastPress: -Infinity, presses: 0 };
  f.state = 'clash';
  f.stateStart = t;
  f.fakeAt = null;
  f.pattern = null;
  f.pending = null;
  p.action = 'clash';
  p.actionStart = t;
  p.actionEnd = Infinity;
  p.attackLanded = true;
  p.parryAt = null;
  d.events.push({ type: 'clash', t, move: f.move! });
}

function clashPress(d: Duel): boolean {
  const c = d.clash!;
  const r = d.data.rules;
  if (d.t - c.lastPress < r.clashPressGap) return false;
  c.lastPress = d.t;
  c.presses++;
  c.balance = Math.min(1, c.balance + r.clashPush);
  d.events.push({ type: 'clashPush', t: d.t, balance: c.balance });
  if (c.balance >= 1) endClash(d, true);
  return true;
}

function stepClash(d: Duel, dt: number): void {
  const c = d.clash!;
  c.balance = Math.max(0, c.balance - ((d.foeDef.clashPower ?? 0.45) * dt) / 1000);
  if (c.balance <= 0) endClash(d, false);
  else if (d.t >= c.end) endClash(d, c.balance > 0.5);
}

function endClash(d: Duel, won: boolean): void {
  const c = d.clash!;
  const f = d.foe;
  const p = d.player;
  const r = d.data.rules;
  const t = d.t;
  const m = d.foeDef.moves[c.move];
  d.clash = null;
  f.move = c.move;
  f.state = 'recover';
  f.stateStart = t;
  if (won) {
    // 밀어냈다: 적이 크게 비틀대며 물러나고, 되돌아오는 틈이 열린다
    const dmg = Math.round(d.data.player.attack.damage * r.clashWinDamage);
    f.hp = Math.max(0, f.hp - dmg);
    f.posture += d.foeDef.posture * r.clashWinPosture;
    f.stateEnd = t + r.counterWindow;
    d.openingUntil = t + r.counterWindow;
    p.action = 'idle';
    p.actionEnd = t;
    p.lastAttackEnd = t;
    gainFocus(d, 'great');
    d.events.push({ type: 'clashWin', t, damage: dmg });
    if (checkFoeDown(d)) return;
    checkStagger(d);
    return;
  }
  // 밀렸다: 칼이 튕겨 나가며 베인다
  const dmg = Math.round(m.damage * r.clashLoseMul);
  p.hp = Math.max(0, p.hp - dmg);
  p.posture = Math.min(d.data.player.posture - 1, p.posture + r.clashLosePosture);
  p.action = 'hurt';
  p.actionStart = t;
  p.actionEnd = t + r.hurtLock;
  p.lastAttackEnd = t;
  f.stateEnd = t + m.recover;
  d.streak = 0;
  d.stats.hits++;
  breakChain(d);
  d.events.push({ type: 'clashLose', t, damage: dmg });
  if (p.hp <= 0) {
    d.result = 'lose';
    d.events.push({ type: 'lose', t });
    return;
  }
  updateCrisis(d);
}

/** 위기(배수의 진): 체력이 crisisHp 이하로 떨어진 순간 한 번 */
function updateCrisis(d: Duel): void {
  const p = d.player;
  if (d.crisis || d.mode === 'rhythm' || p.hp <= 0) return;
  if (p.hp <= d.data.player.hp * d.data.rules.crisisHp) {
    d.crisis = true;
    d.events.push({ type: 'crisis', t: d.t });
  }
}

/** 결 연환을 잇는다(받기·막기·피하기 성공). 조건이 맞는 가장 높은 기술을 준비한다 */
function link(d: Duel, judgement: Judgement, force: number, t: number): void {
  if (d.mode === 'rhythm') return;
  d.chain++;
  d.chainPure &&= judgement === 'excellent';
  d.chainForce += force;
  d.events.push({ type: 'link', t, chain: d.chain, pure: d.chainPure });
  const best = [...d.data.techs]
    .filter((x) => d.chain >= x.chain && (!x.pure || d.chainPure))
    .sort((a, b) => b.chain - a.chain || Number(b.pure) - Number(a.pure))[0];
  if (!best) return;
  const cur = techOf(d, d.techReady);
  const better = !cur || best.chain > cur.chain || (best.chain === cur.chain && best.pure && !cur.pure);
  if (better) {
    d.techReady = best.id;
    d.techForce = d.chainForce;
    d.events.push({ type: 'techReady', t, tech: best.id });
  }
}

function breakChain(d: Duel): void {
  d.chain = 0;
  d.chainPure = true;
  d.chainForce = 0;
}

function landTech(d: Duel): void {
  const f = d.foe;
  const tech = techOf(d, d.techUsing);
  if (!tech || f.state === 'dead') return;
  const dmg = Math.round(d.foeDef.hp * tech.damage + d.techForce * tech.returnMul);
  f.hp = Math.max(0, f.hp - dmg);
  f.posture += d.foeDef.posture * tech.posture;
  d.events.push({ type: 'techHit', t: d.t, tech: tech.id, damage: dmg });
  breakChain(d);
  d.techForce = 0;
  if (checkFoeDown(d)) return;
  // 기술은 공격을 끊는다: 비틀거리지 않으면 잠깐 거두는 자세로
  if (f.state === 'windup') {
    f.state = 'recover';
    f.move = null;
    f.fakeAt = null;
    f.stateStart = d.t;
    f.stateEnd = d.t + 600;
  }
  checkStagger(d);
}

function bumpStreak(d: Duel, t: number): void {
  const before = streakTier(d);
  d.streak++;
  d.stats.maxStreak = Math.max(d.stats.maxStreak, d.streak);
  const tier = streakTier(d);
  // 이어 받을 때마다 숫자(1, 2, 3…)를 띄운다. tier가 오른 순간은 화면이 tier > before로 안다
  d.events.push({ type: 'streak', t, streak: d.streak, tier: Math.max(tier, before) });
}

function resolveHit(d: Duel): void {
  const f = d.foe;
  const p = d.player;
  const r = d.data.rules;
  const moveId = f.move!;
  const m = d.foeDef.moves[moveId];
  const H = f.hitAt;
  const heavy = m.damage >= HEAVY_DAMAGE;
  // 노려 벤 칼이 아직 닿기 전인데 곧(clashWindow 안) 닿는다면 칼끼리 맞부딪힌다
  if (canClash(d) && !p.attackLanded && p.actionStart + d.data.player.attack.hitAt - H <= r.clashWindow) {
    startClash(d);
    return;
  }
  const since = p.parryAt === null ? Infinity : H - p.parryAt;
  p.parryAt = null;
  const rhythm = d.mode === 'rhythm';
  // 위기(배수의 진)면 EXCELLENT 폭이 넓어진다
  const ex = d.crisis ? r.crisisExcellentMul : 1;
  const dodging = H <= p.iframeUntil && p.action === 'dodge';
  if (H <= p.iframeUntil && p.action === 'tech') {
    // 기술을 쓰는 동안은 공격이 닿지 않는다
    d.events.push({ type: 'evade', t: H, move: moveId });
  } else if (dodging) {
    d.stats.dodges++;
    if (m.unblockable) {
      // 간파: 받을 수 없는 공격을 피하면 틈이 열린다
      f.posture += r.mikiriPosture;
      d.openingUntil = H + r.counterWindow;
      // 간파 정밀도: 무적 시간 한가운데 즈음(누르고 40~200ms 뒤 타격)이면 EXCELLENT
      const after = H - (p.iframeUntil - r.dodgeIframe);
      const judgement: Judgement = after >= 40 / ex && after <= 200 * ex ? 'excellent' : 'great';
      d.events.push({ type: 'mikiri', t: H, move: moveId, judgement });
      judge(d, 'perfect', H, judgement);
      bumpStreak(d, H);
      link(d, judgement, m.damage, H);
    } else {
      d.events.push({ type: 'evade', t: H, move: moveId });
      judge(d, 'good', H, 'good');
      link(d, 'good', m.damage, H);
    }
  } else if (!m.unblockable && p.action !== 'broken' && since >= 0 && since <= r.perfect) {
    const tier = streakTier(d);
    f.posture += m.posture * (r.parryPostureMul + tier * r.streakPostureBonus);
    d.openingUntil = H + r.counterWindow;
    d.stats.parries++;
    d.blockedRun = 0;
    const judgement: Judgement = since <= r.excellent * ex ? 'excellent' : 'great';
    d.events.push({ type: 'parry', t: H, move: moveId, element: m.element, heavy, judgement });
    judge(d, 'perfect', H, judgement);
    bumpStreak(d, H);
    link(d, judgement, m.damage, H);
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
    updateCrisis(d);
    judge(d, 'good', H, 'good');
    link(d, 'good', m.damage, H);
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
    judge(d, 'miss', H, 'miss');
    breakChain(d);
    updateCrisis(d);
    // 베는 중에 맞으면 베기가 끊긴다
    if (p.action === 'attack') p.lastAttackEnd = H;
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
  updateCrisis(d);
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

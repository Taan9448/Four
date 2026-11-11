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
  /** 받기 성공(패링) 폭 — 타격 전 이 ms 안에 받으면 EXCELLENT 이상 */
  parry: number;
  /** 패링 중에서도 타격에 이만큼 가까이 받으면 PERFECT(2026-11-10 4단계 판정: PERFECT·EXCELLENT·GOOD·MISS) */
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
  /** 겨루기는 특수한 순간에만(2026-11-10 사용자 요청): 결 연환이 이만큼 이어졌고, 적의 무거운 공격(피해 HEAVY_DAMAGE 이상 또는 move.clash)일 때 */
  clashMinChain: number;
  clashDuration: number;
  clashPush: number;
  clashPressGap: number;
  /** 이기면: 적 체간(최대 대비) · 베기 피해 배율 · 그 뒤 반격 틈 */
  clashWinPosture: number;
  clashWinDamage: number;
  /** 지면: 적 공격 피해 배율 · 내 체간 */
  clashLoseMul: number;
  clashLosePosture: number;
  /** 위기(배수의 진): 체력이 이 비율 이하면 PERFECT 판정 폭이 crisisPerfectMul배 */
  crisisHp: number;
  crisisPerfectMul: number;
  /** 집중(심안): 받기로 게이지를 모아 가득 차면 쓴다 — focusDuration ms(대결 시계) 동안 화면이 focusRate배로 느려지고 결이 처음부터 보인다 */
  focusMax: number;
  focusStart: number;
  focusGain: { perfect: number; excellent: number; good: number };
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
  /** 겨루기가 되는 공격인가(없으면 피해 HEAVY_DAMAGE 이상이면 된다) */
  clash?: boolean;
  /** 쪼개지 않기(4장): 왕녀의 얼음 — 받아치면(패링) 금이 간다. 막거나 피해야 한다(막아도 피해 없음) */
  fragile?: boolean;
  /** 세 숨(10장): 흐름이 멈추는 숨 — 이어서 세 번 받아 내면 매듭이 드러나 곧장 비틀거린다 */
  breath?: boolean;
  /** 반격 자세(構): 치지 않고 기다린다 — 그동안 베면 되받아 맞고(피해 damage), 참으면 끝에 틈이 열린다 */
  stance?: boolean;
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
  /** 1단계의 기믹(갑옷·재생·가속·결 가림) */
  gimmicks?: Gimmicks;
  /**
   * 다단계(2026-11-11 5단계 — "정예는 한 번 격퇴 뒤 2단계, 보스는 3단계 이상"): 체력이 다 떨어지면 쓰러지지 않고
   * 다시 일어나(roar ms) 다음 단계로 — 체력·체간을 새로 채우고, 수를 더하거나 바꾸고, 패턴과 기믹을 갈아 낀다.
   */
  phases?: PhaseDef[];
  /** 수련장 상대(결투장·박자 도전·도감 목록에 안 나온다)와 수련 종류(종류마다 공격 패턴을 바꿔 낀다) */
  practice?: boolean;
  /** 처음부터 결투장·박자 도전에 열려 있는 상대(나머지는 이야기에서 겨뤄 본 뒤 열린다) */
  starter?: boolean;
  /** 이야기에만 나오는 상대(결투장에 안 나온다 — 귀곡애 곽도진 버티기 등) */
  storyOnly?: boolean;
  drills?: { id: string; name: string; note: string; patterns: PatternDef[] }[];
  finisher?: FinisherDef;
  weather?: Weather;
  lines?: Lines;
}

/** 단계마다 바뀌는 기믹 */
export interface Gimmicks {
  /** 갑옷: 이 단계에서 한 번 비틀거리기 전까지 베기·기술 피해가 이 배율 */
  armor?: number;
  /** 재생: 피해를 받지 않은 지 2.5초가 지나면 초마다 이만큼 체력이 찬다 */
  regen?: number;
  /** 가속: 패턴을 시작할 때마다 공격 준비가 step배(최소 min배)로 빨라진다 */
  accelerate?: { step: number; min: number };
  /** 결 가림: 집중하지 않으면 결이 이 비율만큼만 보인다 */
  veil?: number;
}

export interface PhaseDef {
  name: string;
  /** 다시 일어서며 하는 말 */
  line?: string;
  hp: number;
  posture?: number;
  postureRegen?: number;
  idle?: [number, number];
  /** 더하거나 바꿀 수(앞 단계까지의 수에 덧붙는다) */
  moves?: Record<string, MoveDef>;
  /** 이 단계의 패턴(없으면 앞 단계 그대로) */
  patterns?: PatternDef[];
  /** 모든 수의 공격 준비 배율(작을수록 빠름)·피해 배율 */
  speed?: number;
  damageMul?: number;
  /** 다시 일어서는 동안(ms) */
  roar?: number;
  gimmicks?: Gimmicks;
  weather?: Weather;
}

export interface PlayerDef {
  name: string;
  sprite: string;
  scale?: number;
  hp: number;
  posture: number;
  postureRegen: number;
  attack: { duration: number; hitAt: number; damage: number; posture: number };
  /** 연베기(2026-11-11): 베기가 맞은 뒤 ~ 끝나고 window ms 안에 다시 베면 다음 칼(steps 순서)로 이어진다 */
  combo?: { lead: number; window: number; steps: { damageMul: number; postureMul: number; duration?: number; hitAt?: number }[] };
  /** 강베기(H): 늦게 떨어지지만 피해·체간이 크고, 막혀도 체간을 크게 깎는다 */
  heavy?: { duration: number; hitAt: number; damageMul: number; postureMul: number; guardPostureMul: number };
  lines?: Lines;
}

export type AttackKind = 'slash' | 'heavy';

/**
 * 진하운의 기술(2026-11-09): 받기·피하기를 끊기지 않고 이어 가면(결 연환) 열린다.
 * chain 이상 이어졌고(GOOD 이상이면 잇는다), 그 사이 판정이 모두 min 이상이어야 한다.
 * 지금(2026-11-10 사용자 조정 — PERFECT 기준에 맞춰 상향): 낙운무흔 EXCELLENT 이상 5 · 벽운단하 PERFECT 5 · 운해귀종 EXCELLENT 이상 10. 준비된 기술은 맞아도 남고, 스킬 입력으로 쓴다.
 */
export interface TechDef {
  id: string;
  name: string;
  hanja: string;
  chain: number;
  /** 연환 사이 판정이 모두 이 단계 이상이어야 한다(good·excellent·perfect) */
  min: Judgement;
  /** 적 최대 체력 대비 피해 비율 */
  damage: number;
  /** 적 최대 체간 대비 체간 비율(1이면 곧바로 비틀거림) */
  posture: number;
  /** 연환 동안 받아낸 공격 피해의 합 × 이 배율을 더 돌려보낸다(운해귀종) */
  returnMul: number;
  /** 시전 대사(「천외귀환」 카드 castLine) */
  line: string;
}

/**
 * 결투장 난이도(2026-11-10, 7-3절): 수련(판정 폭 넓게·적 피해 적게) · 본선(그대로) · 결(판정 폭 좁게·적 체간 빨리 회복).
 * judgeMul은 parry·perfect·guard 폭에 곱한다.
 */
export interface DifficultyDef {
  id: string;
  name: string;
  note: string;
  judgeMul: number;
  foeDamageMul: number;
  postureRegenMul: number;
}

/** 대결 등급(2026-11-10): 점수 = base + perfect × PERFECT 비율 − hit × 맞은 수 − guard × 막은 수. S·A·B 문턱, 그 아래 C */
export interface GradeRules {
  base: number;
  perfect: number;
  hit: number;
  guard: number;
  S: number;
  A: number;
  B: number;
}

export interface DuelData {
  rules: Rules & { grade: GradeRules };
  player: PlayerDef;
  foes: FoeDef[];
  techs: TechDef[];
  difficulties?: DifficultyDef[];
}

/** 판정 묶음: clean = 받기·간파 성공(PERFECT·EXCELLENT), good = 막기·피함, miss = 맞음 */
export type Grade = 'clean' | 'good' | 'miss';
export type DuelRank = 'S' | 'A' | 'B' | 'C';
/** 판정 글자(2026-11-10 4단계): 패링·간파는 정밀도에 따라 PERFECT·EXCELLENT, 막기·피함은 GOOD, 맞으면 MISS */
export type Judgement = 'perfect' | 'excellent' | 'good' | 'miss';
const JUDGE_RANK: Record<Judgement, number> = { perfect: 3, excellent: 2, good: 1, miss: 0 };
/** a가 b 이상인가 */
export const atLeast = (a: Judgement, b: Judgement): boolean => JUDGE_RANK[a] >= JUDGE_RANK[b];

export type DuelEvent =
  | { type: 'parry'; t: number; move: string; element?: Element; heavy: boolean; judgement: Judgement; lead: number }
  | { type: 'guard'; t: number; move: string; damage: number; element?: Element; lead: number }
  | { type: 'guardBreak'; t: number }
  | { type: 'hit'; t: number; move: string; damage: number; element?: Element; heavy: boolean; unblockable: boolean; lead: number | null }
  | { type: 'refill'; t: number }
  | { type: 'phase'; t: number; name: string; line?: string; n: number; of: number }
  | { type: 'stanceCounter'; t: number; damage: number }
  | { type: 'stanceBreak'; t: number }
  | { type: 'armorBreak'; t: number }
  | { type: 'endure'; t: number; got: number; need: number }
  | { type: 'mikiri'; t: number; move: string; judgement: Judgement }
  | { type: 'evade'; t: number; move: string }
  | { type: 'burn'; t: number; damage: number }
  | { type: 'feint'; t: number; move: string }
  | { type: 'streak'; t: number; streak: number; tier: number }
  | { type: 'judge'; t: number; grade: Grade; judgement: Judgement }
  | { type: 'strike'; t: number; damage: number; counter: boolean; blocked: boolean; kind?: AttackKind; step?: number }
  | { type: 'punish'; t: number; move: string }
  | { type: 'skill'; t: number; move: string; name: string }
  | { type: 'link'; t: number; chain: number; min: Judgement }
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
  | { type: 'crack'; t: number; got: number; max: number }
  | { type: 'breath'; t: number; got: number }
  | { type: 'knot'; t: number }
  | { type: 'finishHint'; t: number; tech: string }
  | { type: 'win'; t: number; survived?: boolean; subdued?: boolean }
  | { type: 'lose'; t: number; reason?: 'fragile' };

export type PlayerAction = 'idle' | 'attack' | 'dodge' | 'tech' | 'hurt' | 'broken' | 'clash';
export type FoeState = 'idle' | 'windup' | 'recover' | 'stagger' | 'dead' | 'clash';
/** practice: 수련장 — 하운은 다치지 않고, 적은 쓰러지면 다시 일어선다(끝나지 않는다) */
export type Mode = 'duel' | 'rhythm' | 'practice';

export interface Duel {
  data: DuelData;
  foeDef: FoeDef;
  mode: Mode;
  /** 난이도 id(difficulties) */
  difficulty: string;
  /** 덧붙임(DuelOptions) — 튜토리얼이 대결 중에 바꿀 수 있다 */
  opts: DuelOptions;
  /** 지금 단계(1부터)와 전체 단계 수, 단계를 갈아 낄 때 쓰는 처음 상대 정의와 배율(난이도·열쇠) */
  phase: number;
  phaseCount: number;
  baseDef: FoeDef;
  phaseScale: { damage: number; regen: number };
  /** 가속 기믹의 지금 배율 · 마지막으로 적이 다친 시각(재생 기믹) · 이 단계 갑옷이 깨졌나 */
  tempo: number;
  lastFoeHurt: number;
  armorBroken: boolean;
  /** 버티기: 해낸 수 */
  endured: number;
  /** 쪼개지 않기: 금 간 수 · 베지 않는다: 비틀거린 수 · 세 숨: 이어서 받은 숨 · 운해귀종 안내를 띄웠나 */
  cracks: number;
  staggers: number;
  breathRun: number;
  finishHinted: boolean;
  rng: Rng;
  t: number;
  result: 'win' | 'lose' | null;
  /** 운해귀종의 되돌아오는 틈: 이 시각까지 베기가 반격이 된다 */
  openingUntil: number;
  /** 연속 박자: 패링·간파가 이어진 수(맞거나 막으면 0) */
  streak: number;
  /** 적이 이어서 막은 베기 수(틈에 베거나 패링하면 0) */
  blockedRun: number;
  /** 결 연환: 끊기지 않고 받거나 피한 수, 그 사이 가장 낮은 판정, 받아낸 공격 피해의 합 */
  chain: number;
  chainMin: Judgement;
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
    /** 지금 베기의 종류·연베기 몇째 칼(0부터)·타격 시각(시작에서 ms) */
    attackKind: AttackKind;
    comboStep: number;
    attackHitAt: number;
    /** 연베기: 이번 칼이 끝나면 곧바로 다음 칼 · 너무 일찍 눌러(연타) 이번 칼은 잇지 못한다 */
    comboQueued: boolean;
    comboBroken: boolean;
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
    techs: number;
    /** 받기·간파 성공(clean) 가운데 PERFECT */
    perfect: number;
    clean: number;
    /** 겨루기 승리 · 받을 수 없는 공격에 맞은 수(이야기 도전 과제) */
    clashWins: number;
    redHits: number;
    good: number;
    miss: number;
  };
}

const STEP = 2;
/** 화면이 세게 흔들리는 무거운 공격의 기준 피해 */
export const HEAVY_DAMAGE = 20;

/**
 * 대결 덧붙임(2026-11-10 이야기·튜토리얼):
 * survive — 이길 수 없는 상대: 받기·막기·피하기를 이만큼 해내면 끝(곽도진 버티기).
 * noLose — 체력이 1 밑으로 내려가지 않는다(튜토리얼 마지막 한 판).
 * techs — 쓸 수 있는 기술 id(없으면 전부), focus·clash — 집중·겨루기를 쓸 수 있나(없으면 쓸 수 있다),
 * assistCue — 결이 공격 시작부터 보인다(튜토리얼 도움, 느려지지는 않는다).
 */
export interface DuelOptions {
  survive?: number;
  noLose?: boolean;
  techs?: string[];
  focus?: boolean;
  clash?: boolean;
  assistCue?: boolean;
  /** 쪼개지 않기: 왕녀의 얼음에 금이 이만큼 가면 진다 */
  fragile?: number;
  /** 끝내는 법: stagger = 결정타 없이 비틀거림 staggerWin번이면 끝(베지 않는다), unhae = 운해귀종으로만 쓰러진다 */
  finish?: 'stagger' | 'unhae';
  staggerWin?: number;
  /** 붉은 장력: 집중하지 않으면 결이 이 비율만큼만 보인다(늦게 보인다) */
  veil?: number;
  /** 적 피해 배율(바르가스의 열쇠를 받으면 쉬워진다) */
  foeDamageMul?: number;
}

/** 난이도를 입힌 데이터·상대(원본은 고치지 않는다) */
function withDifficulty(data: DuelData, foe: FoeDef, diff: DifficultyDef | undefined): { data: DuelData; foeDef: FoeDef } {
  if (!diff || (diff.judgeMul === 1 && diff.foeDamageMul === 1 && diff.postureRegenMul === 1)) return { data, foeDef: foe };
  const r = data.rules;
  const rules = { ...r, parry: Math.round(r.parry * diff.judgeMul), perfect: Math.round(r.perfect * diff.judgeMul), guard: Math.round(r.guard * diff.judgeMul) };
  const moves = Object.fromEntries(Object.entries(foe.moves).map(([k, m]) => [k, { ...m, damage: Math.max(1, Math.round(m.damage * diff.foeDamageMul)) }]));
  const foeDef = { ...foe, moves, postureRegen: foe.postureRegen * diff.postureRegenMul };
  return { data: { ...data, rules, foes: data.foes.map((f) => (f.id === foe.id ? foeDef : f)) }, foeDef };
}

export function createDuel(data0: DuelData, foeId: string, seed = 'gyeol', mode: Mode = 'duel', difficulty = 'main', opts: DuelOptions = {}): Duel {
  const foe0 = data0.foes.find((f) => f.id === foeId);
  if (!foe0) throw new Error(`알 수 없는 상대: ${foeId}`);
  const diffDef = (data0.difficulties ?? []).find((x) => x.id === difficulty);
  const dd = withDifficulty(data0, foe0, diffDef);
  const data = dd.data;
  let foeDef = dd.foeDef;
  if (opts.foeDamageMul && opts.foeDamageMul !== 1) {
    const k = opts.foeDamageMul;
    foeDef = { ...foeDef, moves: Object.fromEntries(Object.entries(foeDef.moves).map(([id, m]) => [id, { ...m, damage: Math.max(1, Math.round(m.damage * k)) }])) };
  }
  if (mode === 'rhythm' && !foeDef.chart) throw new Error(`${foeId}에는 박자 도전 악보가 없다`);
  const rng = createRng(seed).fork(foeId);
  const d: Duel = {
    data,
    foeDef,
    mode,
    difficulty,
    opts,
    phase: 1,
    phaseCount: mode === 'duel' ? 1 + (foeDef.phases?.length ?? 0) : 1,
    baseDef: foeDef,
    phaseScale: { damage: (diffDef?.foeDamageMul ?? 1) * (opts.foeDamageMul ?? 1), regen: diffDef?.postureRegenMul ?? 1 },
    tempo: 1,
    lastFoeHurt: -Infinity,
    armorBroken: false,
    endured: 0,
    cracks: 0,
    staggers: 0,
    breathRun: 0,
    finishHinted: false,
    rng,
    t: 0,
    result: null,
    openingUntil: -1,
    streak: 0,
    blockedRun: 0,
    chain: 0,
    chainMin: 'perfect',
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
      attackKind: 'slash',
      comboStep: 0,
      attackHitAt: 0,
      comboQueued: false,
      comboBroken: false,
      parryAt: null,
      lastPress: -Infinity,
      lastGuard: -Infinity,
      iframeUntil: -Infinity,
      lastDodge: -Infinity,
      lastAttackEnd: -Infinity,
    },
    foe: { hp: foeDef.hp, posture: 0, state: 'idle', stateStart: 0, stateEnd: 0, move: null, hitAt: 0, fakeAt: null, fakeShown: false, pattern: null, step: 0, pending: null, chartIdx: 0 },
    events: [],
    stats: { parries: 0, guards: 0, hits: 0, counters: 0, deathblows: 0, dodges: 0, maxStreak: 0, clean: 0, perfect: 0, good: 0, miss: 0, techs: 0, clashWins: 0, redHits: 0 },
  };
  // 첫 공격은 숨을 고를 시간을 조금 더 준다
  d.foe.stateEnd = foeDef.idle[1];
  return d;
}

export const streakTier = (d: Duel): number => d.data.rules.streakTiers.filter((n) => d.streak >= n).length;

export const isFocusing = (d: Duel): boolean => d.t < d.focusUntil;

/** 입력이 화면에 늦게 닿았을 때 거슬러 올라갈 수 있는 최대 ms(그 사이 판정이 끝난 공격은 되돌리지 않는다) */
export const MAX_INPUT_LAG = 80;

/**
 * 받기(패링)·베기·피하기·기술·집중 입력. 받아들였으면 true.
 * at: 실제로 누른 대결 시각(2026-11-09 입력 시각 보정). 화면 프레임이 입력보다 늦게 돌면 d.t보다 이르다.
 * 받기·피하기만 그 시각으로 판정한다(아직 판정하지 않은 타격에 한해). 베기·기술은 지금 시작한다.
 */
export type Input = 'parry' | 'attack' | 'heavy' | 'dodge' | 'tech' | 'focus';

/** 베기를 시작한다(연베기 step, 강베기) */
function startAttack(d: Duel, kind: AttackKind, step: number, t: number): void {
  const p = d.player;
  const pl = d.data.player;
  const st = kind === 'slash' ? pl.combo?.steps[step] : undefined;
  const duration = kind === 'heavy' ? pl.heavy!.duration : (st?.duration ?? pl.attack.duration);
  p.action = 'attack';
  p.attackKind = kind;
  p.comboStep = step;
  p.attackHitAt = kind === 'heavy' ? pl.heavy!.hitAt : (st?.hitAt ?? pl.attack.hitAt);
  p.actionStart = t;
  p.actionEnd = t + duration;
  p.attackLanded = false;
  p.comboQueued = false;
  p.comboBroken = false;
  p.parryAt = null;
}

export function press(d: Duel, input: Input, at = d.t): boolean {
  if (d.result) return false;
  const p = d.player;
  const r = d.data.rules;
  const t0 = Math.min(d.t, Math.max(at, d.t - MAX_INPUT_LAG));
  if (input === 'focus') {
    if (d.opts.focus === false) return false;
    // 집중: 게이지가 가득 찼을 때만, 무엇을 하는 중이든 쓸 수 있다(박자 도전에는 없다)
    if (d.mode === 'rhythm' || d.focus < r.focusMax || isFocusing(d)) return false;
    d.focus = 0;
    d.focusUntil = d.t + r.focusDuration;
    d.events.push({ type: 'focus', t: d.t });
    return true;
  }
  if (d.clash) return input === 'attack' || input === 'heavy' || input === 'parry' ? clashPress(d) : false;
  // 연베기: 칼이 끝나기 조금 전(lead)부터 다시 베면 끝나자마자 다음 칼 — 그보다 일찍 누르면(연타) 이번 칼은 잇지 못한다
  const combo = d.data.player.combo;
  if (input === 'attack' && d.mode !== 'rhythm' && combo && p.action === 'attack' && p.attackKind === 'slash') {
    if (t0 < p.actionEnd - combo.lead || !p.attackLanded) {
      p.comboBroken = true;
      return false;
    }
    if (p.comboBroken || p.comboQueued || p.comboStep + 1 >= combo.steps.length) return false;
    p.comboQueued = true;
    return true;
  }
  if (p.action !== 'idle') return false;
  if (input === 'parry') {
    if (t0 - p.lastPress < r.parryLockout) return false;
    p.lastPress = t0;
    p.parryAt = t0;
    return true;
  }
  if (input === 'dodge') {
    if (t0 - p.lastDodge < r.dodgeLockout) return false;
    p.lastDodge = t0;
    p.action = 'dodge';
    p.actionStart = t0;
    p.actionEnd = t0 + r.dodgeDuration;
    p.iframeUntil = t0 + r.dodgeIframe;
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
  if (input === 'heavy') {
    if (!d.data.player.heavy) return false;
    startAttack(d, 'heavy', 0, d.t);
    return true;
  }
  // 끝난 칼에서 window 안에 다시 베어도 다음 칼로 잇는다(박자에 맞춰 떼었다 누르기)
  const next = combo && p.attackKind === 'slash' && !p.comboBroken && d.t - p.lastAttackEnd <= combo.window && p.comboStep + 1 < combo.steps.length ? p.comboStep + 1 : 0;
  startAttack(d, 'slash', next, d.t);
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
  /** 왕녀의 얼음(받아치면 안 된다) · 흐름이 멈추는 숨 */
  fragile?: boolean;
  breath?: boolean;
  /** 반격 자세(構): 베지 말고 기다린다 */
  stance?: boolean;
  /** 겨루기가 되는 공격: 결 연환이 이어졌고 무거운 공격 — 타격 순간에 노려 베면 칼끼리 맞부딪힌다 */
  clash?: boolean;
}

/** 화면용: 지금 결(타격 예고)이 보이는가와 고리 비율 */
export function cue(d: Duel): Cue {
  const f = d.foe;
  const focus = isFocusing(d) || !!d.opts.assistCue;
  const none: Cue = { visible: false, left: 0, ratio: 0, unblockable: false, faking: false, heavy: false, focus };
  if (f.state !== 'windup' || !f.move) return none;
  const m = d.foeDef.moves[f.move];
  const faking = f.fakeAt !== null && d.t < f.fakeAt;
  // 속임수: 가짜 순간까지는 그쪽으로 좁혀 들고, 지나면 진짜 순간으로 짧게 다시 좁혀 든다
  const target = faking ? f.fakeAt! : f.hitAt;
  // 집중 중이면 공격을 시작할 때부터 결이 보인다
  // 붉은 장력: 집중하지 않으면 결이 늦게(veil 비율만큼만) 보인다
  const veil = Math.min(d.opts.veil ?? 1, d.foeDef.gimmicks?.veil ?? 1);
  const lead = focus ? Math.max(d.data.rules.cueLead, target - f.stateStart) : d.data.rules.cueLead * veil;
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
    fragile: !!m.fragile,
    breath: !!m.breath,
    stance: !!m.stance,
    clash: clashChance(d),
  };
}

export const isOpen = (d: Duel): boolean => d.t <= d.openingUntil && d.foe.state !== 'stagger' && d.foe.state !== 'dead';

/** 박자 도전 정확도(0~1)와 등급 */
export function rhythmScore(d: Duel): { accuracy: number; rank: 'S' | 'A' | 'B' | 'C'; total: number } {
  const s = d.stats;
  const total = s.clean + s.good + s.miss;
  // PERFECT 1 · EXCELLENT 0.85 · GOOD 0.5 · MISS 0
  const accuracy = total ? (s.perfect + (s.clean - s.perfect) * 0.85 + s.good * 0.5) / total : 0;
  const rank = accuracy >= 0.92 && s.miss === 0 ? 'S' : accuracy >= 0.8 ? 'A' : accuracy >= 0.6 ? 'B' : 'C';
  return { accuracy, rank, total };
}

function regen(d: Duel, dt: number): void {
  const p = d.player;
  if (d.t - p.lastGuard > 600 && p.action !== 'broken') p.posture = Math.max(0, p.posture - (d.data.player.postureRegen * dt) / 1000);
  const f = d.foe;
  if (f.state === 'idle' && !f.pending) f.posture = Math.max(0, f.posture - (d.foeDef.postureRegen * dt) / 1000);
  // 재생 기믹: 몰아치지 않으면 체력이 다시 찬다
  const hpRegen = d.foeDef.gimmicks?.regen;
  if (hpRegen && d.mode === 'duel' && f.state !== 'dead' && f.state !== 'stagger' && d.t - d.lastFoeHurt > 2500) f.hp = Math.min(d.foeDef.hp, f.hp + (hpRegen * dt) / 1000);
}

/** 기술 동작 길이와 피해가 들어가는 순간(그림 연출과 맞춘다) */
export const TECH_DURATION = 900;
export const TECH_HIT = 420;

export const techOf = (d: Duel, id: string | null): TechDef | undefined => (id ? d.data.techs.find((t) => t.id === id) : undefined);

function stepPlayer(d: Duel): void {
  const p = d.player;
  if (p.action === 'tech' && !d.techLanded && d.t >= p.actionStart + TECH_HIT) {
    d.techLanded = true;
    landTech(d);
  }
  if (p.action === 'attack' && !p.attackLanded && d.t >= p.actionStart + p.attackHitAt) {
    p.attackLanded = true;
    landStrike(d);
  }
  if (p.action !== 'idle' && d.t >= p.actionEnd) {
    if (p.action === 'attack') p.lastAttackEnd = d.t;
    const chain = p.action === 'attack' && p.comboQueued;
    p.action = 'idle';
    // 미리 눌러 둔 연베기: 끊기지 않고 다음 칼
    if (chain && !d.result) startAttack(d, 'slash', p.comboStep + 1, d.t);
  }
}

function landStrike(d: Duel): void {
  const f = d.foe;
  const r = d.data.rules;
  const a = d.data.player.attack;
  if (f.state === 'dead') return;
  // 반격 자세(構)에 베면 되받아 맞는다
  if (f.state === 'windup' && f.move && d.foeDef.moves[f.move].stance) {
    const m = d.foeDef.moves[f.move];
    hurt(d, m.damage);
    d.stats.hits++;
    d.streak = 0;
    breakChain(d);
    updateCrisis(d);
    d.events.push({ type: 'stanceCounter', t: d.t, damage: m.damage });
    f.state = 'recover';
    f.stateStart = d.t;
    f.stateEnd = d.t + m.recover;
    f.fakeAt = null;
    if (d.player.hp <= 0 && !d.result) {
      d.result = 'lose';
      d.events.push({ type: 'lose', t: d.t });
    }
    return;
  }
  // 노려 벤 칼이 적의 타격과 거의 동시에 닿으면 칼끼리 맞부딪힌다
  if (f.state === 'windup' && canClash(d) && Math.abs(f.hitAt - d.t) <= r.clashWindow) {
    startClash(d);
    return;
  }
  // 베지 않는다: 비틀거리는 상대에게 결정타는 없다 — 칼등으로 누르기만 한다(체력 1 밑으로 안 내려감)
  if (f.state === 'stagger' && d.opts.finish === 'stagger' && d.mode === 'duel') {
    const dmg = a.damage;
    damageFoe(d, dmg);
    d.events.push({ type: 'strike', t: d.t, damage: dmg, counter: true, blocked: false });
    return;
  }
  if (f.state === 'stagger') {
    const dmg = Math.round(d.foeDef.hp * r.deathblow);
    damageFoe(d, dmg, undefined, true);
    f.posture = 0;
    d.stats.deathblows++;
    d.events.push({ type: 'deathblow', t: d.t, damage: dmg });
    // 2단계로 넘어가며 포효 중이면(maybePhase가 이미 숨 고르기로 바꿈) 그대로 둔다
    if (!checkFoeDown(d) && d.foe.state === 'stagger') setFoeIdle(d, 900);
    return;
  }
  const counter = isOpen(d);
  // 틈 밖의 베기는 적이 막는다: 피해는 조금, 체간도 조금. 연타하면 되받아친다
  const blocked = !counter;
  // 베기 종류: 연베기는 칼마다 배율, 강베기는 크게(막혀도 체간을 크게 깎는다)
  const p = d.player;
  const heavy = p.attackKind === 'heavy' ? d.data.player.heavy : undefined;
  const st = p.attackKind === 'slash' ? d.data.player.combo?.steps[p.comboStep] : undefined;
  const dMul = heavy ? heavy.damageMul : (st?.damageMul ?? 1);
  const pMul = heavy ? (counter ? heavy.postureMul : heavy.guardPostureMul) : (st?.postureMul ?? 1);
  const dmg = counter ? Math.round(a.damage * r.counterMul * dMul) : Math.max(1, Math.round(a.damage * r.foeGuardMul * dMul));
  damageFoe(d, dmg);
  f.posture += (counter ? r.counterPosture : r.foeGuardPosture) * pMul;
  if (counter) {
    d.stats.counters++;
    d.blockedRun = 0;
  } else d.blockedRun++;
  d.events.push({ type: 'strike', t: d.t, damage: dmg, counter, blocked, kind: p.attackKind, step: p.comboStep });
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
        // 베지 않는다: 비틀거림마다 한 단계씩 넘어간다(체력은 1 밑으로 안 내려가므로)
        if (d.opts.finish === 'stagger' && d.mode === 'duel' && d.phase < d.phaseCount && d.staggers >= d.phase) nextPhase(d);
        else setFoeIdle(d, 400);
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
  const acc = d.foeDef.gimmicks?.accelerate;
  if (acc && d.mode === 'duel') d.tempo = Math.max(acc.min, d.tempo * acc.step);
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
  let H = hitAt ?? d.t + Math.round(m.windup * d.tempo) + feint;
  // 번개: 대결에서는 박자가 튄다(악보에서는 악보대로)
  if (hitAt === undefined && m.element === 'lightning' && r.lightningJitter > 0) H += d.rng.int(-r.lightningJitter, r.lightningJitter);
  f.hitAt = Math.max(d.t + r.parry + 40, H);
  f.fakeAt = feint > 0 ? f.hitAt - feint : null;
  f.fakeShown = false;
  f.stateEnd = f.hitAt;
  // 받을 수 없는 기술은 이름을 외치며 나간다
  if (m.unblockable) d.events.push({ type: 'skill', t: d.t, move: moveId, name: m.name });
}

function judge(d: Duel, grade: Grade, t: number, judgement: Judgement): void {
  d.stats[grade]++;
  if (judgement === 'perfect') d.stats.perfect++;
  if (d.mode === 'rhythm') d.events.push({ type: 'judge', t, grade, judgement });
  else gainFocus(d, judgement);
}

function gainFocus(d: Duel, judgement: Judgement): void {
  if (judgement === 'miss' || isFocusing(d) || d.opts.focus === false) return;
  const r = d.data.rules;
  d.focus = Math.min(r.focusMax, d.focus + r.focusGain[judgement]);
}

/** 겨루기가 될 수 있는 베기인가: 대결에서, 베는 중이고, 앞 베기에서 clashCalm 넘게 쉬었다가 노려 벤 칼 */
/**
 * 겨루기 기회(화면 안내용, 2026-11-11): 지금 다가오는 공격이 겨루기가 될 수 있는가 — 하운이 연타 중이 아닐 때.
 * canClash의 조건 중 '이번 베기' 쪽만 뺀 것. 속임수는 가짜 순간을 지난 뒤에만.
 */
export function clashChance(d: Duel): boolean {
  const f = d.foe;
  const p = d.player;
  if (d.mode !== 'duel' || d.opts.clash === false || f.state !== 'windup' || !f.move) return false;
  const m = d.foeDef.moves[f.move];
  if (m.unblockable || m.stance || m.fragile || m.breath || !(m.clash ?? m.damage >= HEAVY_DAMAGE)) return false;
  if (f.fakeAt !== null && d.t < f.fakeAt) return false;
  if (d.chain < d.data.rules.clashMinChain) return false;
  return p.action !== 'attack' && d.t - p.lastAttackEnd >= d.data.rules.clashCalm * 0.5;
}

function canClash(d: Duel): boolean {
  const p = d.player;
  const f = d.foe;
  if (d.mode === 'rhythm' || d.opts.clash === false || p.action !== 'attack' || !f.move) return false;
  const m = d.foeDef.moves[f.move];
  // 받을 수 없는 공격·반격 자세·왕녀의 얼음·세 숨은 겨루기가 되지 않는다
  if (m.unblockable || m.stance || m.fragile || m.breath) return false;
  // 특수한 순간에만: 결 연환이 이어진 채, 적의 무거운 공격에 노려 벤 칼
  if (d.chain < d.data.rules.clashMinChain) return false;
  if (!(m.clash ?? m.damage >= HEAVY_DAMAGE)) return false;
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
    damageFoe(d, dmg);
    f.posture += d.foeDef.posture * r.clashWinPosture;
    f.stateEnd = t + r.counterWindow;
    d.openingUntil = t + r.counterWindow;
    p.action = 'idle';
    p.actionEnd = t;
    p.lastAttackEnd = t;
    gainFocus(d, 'excellent');
    d.stats.clashWins++;
    d.events.push({ type: 'clashWin', t, damage: dmg });
    if (checkFoeDown(d)) return;
    checkStagger(d);
    return;
  }
  // 밀렸다: 칼이 튕겨 나가며 베인다
  const dmg = Math.round(m.damage * r.clashLoseMul);
  hurt(d, dmg);
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
  if (!atLeast(judgement, d.chainMin)) d.chainMin = judgement;
  d.chainForce += force;
  d.events.push({ type: 'link', t, chain: d.chain, min: d.chainMin });
  const allowed = d.opts.techs;
  const best = [...d.data.techs]
    .filter((x) => !allowed || allowed.includes(x.id))
    .filter((x) => d.chain >= x.chain && atLeast(d.chainMin, x.min))
    .sort((a, b) => b.chain - a.chain || JUDGE_RANK[b.min] - JUDGE_RANK[a.min])[0];
  if (!best) return;
  const cur = techOf(d, d.techReady);
  const better = !cur || best.chain > cur.chain || (best.chain === cur.chain && JUDGE_RANK[best.min] > JUDGE_RANK[cur.min]);
  if (better) {
    d.techReady = best.id;
    d.techForce = d.chainForce;
    d.events.push({ type: 'techReady', t, tech: best.id });
  }
}

function breakChain(d: Duel): void {
  d.chain = 0;
  d.chainMin = 'perfect';
  d.chainForce = 0;
}

function landTech(d: Duel): void {
  const f = d.foe;
  const tech = techOf(d, d.techUsing);
  if (!tech || f.state === 'dead') return;
  const dmg = Math.round(d.foeDef.hp * tech.damage + d.techForce * tech.returnMul);
  damageFoe(d, dmg, tech.id);
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
  // 반격 자세를 끝까지 참았다: 치지 않고 자세가 풀리며 틈이 열린다
  if (m.stance) {
    p.parryAt = null;
    f.posture += m.posture;
    d.openingUntil = H + r.counterWindow;
    d.events.push({ type: 'stanceBreak', t: H });
    endure(d, H);
    f.state = 'recover';
    f.stateStart = H;
    f.stateEnd = H + m.recover;
    f.fakeAt = null;
    checkStagger(d);
    return;
  }
  // 노려 벤 칼이 아직 닿기 전인데 곧(clashWindow 안) 닿는다면 칼끼리 맞부딪힌다
  if (canClash(d) && !p.attackLanded && p.actionStart + d.data.player.attack.hitAt - H <= r.clashWindow) {
    startClash(d);
    return;
  }
  const since = p.parryAt === null ? Infinity : H - p.parryAt;
  p.parryAt = null;
  const rhythm = d.mode === 'rhythm';
  // 위기(배수의 진)면 PERFECT 폭이 넓어진다
  const ex = d.crisis ? r.crisisPerfectMul : 1;
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
      // 간파 정밀도: 무적 시간 한가운데 즈음(누르고 60~180ms 뒤 타격)이면 PERFECT
      const after = H - (p.iframeUntil - r.dodgeIframe);
      const judgement: Judgement = after >= 60 / ex && after <= 180 * ex ? 'perfect' : 'excellent';
      d.events.push({ type: 'mikiri', t: H, move: moveId, judgement });
      judge(d, 'clean', H, judgement);
      bumpStreak(d, H);
      link(d, judgement, m.damage, H);
      endure(d, H);
    } else {
      d.events.push({ type: 'evade', t: H, move: moveId });
      judge(d, 'good', H, 'good');
      link(d, 'good', m.damage, H);
      endure(d, H);
    }
  } else if (!m.unblockable && p.action !== 'broken' && since >= 0 && since <= r.parry) {
    const tier = streakTier(d);
    f.posture += m.posture * (r.parryPostureMul + tier * r.streakPostureBonus);
    d.openingUntil = H + r.counterWindow;
    d.stats.parries++;
    d.blockedRun = 0;
    const judgement: Judgement = since <= r.perfect * ex ? 'perfect' : 'excellent';
    d.events.push({ type: 'parry', t: H, move: moveId, element: m.element, heavy, judgement, lead: since });
    if (m.fragile && !rhythm) crack(d, H);
    if (m.breath) breathe(d, H);
    else if (d.breathRun) d.breathRun = 0;
    judge(d, 'clean', H, judgement);
    bumpStreak(d, H);
    link(d, judgement, m.damage, H);
    endure(d, H);
    if (m.element === 'fire' && !rhythm) burn(d, r.fireParryChip, H);
  } else if (!m.unblockable && p.action !== 'broken' && since >= 0 && since <= r.guard) {
    // 왕녀의 얼음은 막으면 다치지 않는다(받아치지 않고 감싸 막는 것이 맞다)
    let dmg = m.fragile ? 0 : Math.round(m.damage * r.guardChip);
    d.breathRun = 0;
    if (m.element === 'fire') dmg += r.fireGuardExtra;
    hurt(d, dmg);
    p.posture += rhythm ? 0 : r.guardPosture;
    p.lastGuard = H;
    d.stats.guards++;
    d.streak = 0;
    d.events.push({ type: 'guard', t: H, move: moveId, damage: dmg, element: m.element, lead: since });
    updateCrisis(d);
    judge(d, 'good', H, 'good');
    link(d, 'good', m.damage, H);
    endure(d, H);
    if (p.posture >= d.data.player.posture) {
      p.posture = 0;
      p.action = 'broken';
      p.actionStart = H;
      p.actionEnd = H + r.playerStagger;
      d.events.push({ type: 'guardBreak', t: H });
    }
  } else {
    d.breathRun = 0;
    hurt(d, m.damage);
    d.stats.hits++;
    if (m.unblockable) d.stats.redHits++;
    d.streak = 0;
    d.events.push({ type: 'hit', t: H, move: moveId, damage: m.damage, element: m.element, heavy, unblockable: !!m.unblockable, lead: Number.isFinite(since) && since >= 0 && since < 2000 ? since : null });
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
  if (p.hp <= 0 && d.result !== 'win') {
    d.result = 'lose';
    d.events.push({ type: 'lose', t: H });
    return;
  }
  if (d.result === 'lose') return;
  f.state = 'recover';
  f.stateStart = H;
  f.stateEnd = H + m.recover;
  f.fakeAt = null;
  if (!rhythm) checkStagger(d);
}

/**
 * 적이 다친다. 끝내는 법(opts.finish)이 있으면 체력이 1 밑으로 내려가지 않는다:
 * stagger(베지 않는다)는 언제나, unhae는 운해귀종이 아닌 피해일 때(처음 막히면 안내 사건을 한 번 낸다).
 */
function damageFoe(d: Duel, dmg: number, tech?: string, deathblow = false): void {
  const f = d.foe;
  const fin = d.mode === 'duel' ? d.opts.finish : undefined;
  // 운해귀종으로만: 마지막 단계에서만 막는다(앞 단계는 보통처럼 넘어간다)
  const last = d.phase >= d.phaseCount;
  const floor = fin === 'stagger' || (fin === 'unhae' && last && tech !== 'unhae') ? 1 : 0;
  // 갑옷 기믹: 이 단계에서 한 번 비틀거리기 전까지 베기·기술 피해가 줄어든다(결정타는 그대로)
  const armor = d.foeDef.gimmicks?.armor;
  if (armor && !d.armorBroken && !deathblow) dmg = Math.max(1, Math.round(dmg * armor));
  if (dmg > 0) d.lastFoeHurt = d.t;
  f.hp = Math.max(floor, f.hp - dmg);
  if (fin === 'unhae' && floor && f.hp === 1 && !d.finishHinted) {
    d.finishHinted = true;
    d.events.push({ type: 'finishHint', t: d.t, tech: 'unhae' });
  }
}

/** 쪼개지 않기: 왕녀의 얼음을 받아쳤다 — 금이 가고, 다 차면 진다 */
function crack(d: Duel, t: number): void {
  const max = d.opts.fragile;
  if (!max) return;
  d.cracks++;
  d.events.push({ type: 'crack', t, got: d.cracks, max });
  if (d.cracks >= max && !d.result) {
    d.result = 'lose';
    d.events.push({ type: 'lose', t, reason: 'fragile' });
  }
}

/** 세 숨: 흐름이 멈추는 숨을 이어서 받는다 — 셋째에 매듭이 드러나 체간이 가득 찬다 */
function breathe(d: Duel, t: number): void {
  d.breathRun++;
  d.events.push({ type: 'breath', t, got: d.breathRun });
  if (d.breathRun >= 3) {
    d.breathRun = 0;
    d.foe.posture = d.foeDef.posture;
    d.events.push({ type: 'knot', t });
  }
}

/** 하운이 다친다(대결에서만 — 박자 도전·수련장은 다치지 않는다) */
function hurt(d: Duel, dmg: number): void {
  if (d.mode === 'duel') d.player.hp = Math.max(d.opts.noLose ? 1 : 0, d.player.hp - dmg);
}

/** 버티기: 받기·막기·피하기를 해낼 때마다 센다. 다 채우면 이긴 것으로 끝(상대는 쓰러지지 않는다) */
function endure(d: Duel, t: number): void {
  const need = d.opts.survive;
  if (!need || d.result) return;
  d.endured++;
  d.events.push({ type: 'endure', t, got: d.endured, need });
  if (d.endured >= need) {
    d.result = 'win';
    d.events.push({ type: 'win', t, survived: true });
  }
}

/**
 * 다음 단계: 처음 상대 정의에 지금 단계까지의 수를 덧붙이고, 패턴·기믹·체력·체간을 그 단계 것으로 갈아 낀다.
 * 피해·체간 회복 배율(난이도·열쇠)은 새 수에도 똑같이 든다. 다시 일어서는 동안(roar)은 치지 않는다.
 */
function nextPhase(d: Duel): void {
  const base = d.baseDef;
  const phases = base.phases ?? [];
  const ph = phases[d.phase - 1];
  if (!ph) return;
  d.phase++;
  const added: Record<string, MoveDef> = {};
  for (const p of phases.slice(0, d.phase - 1)) for (const [k, m] of Object.entries(p.moves ?? {})) added[k] = { ...m, damage: Math.max(m.damage > 0 ? 1 : 0, Math.round(m.damage * d.phaseScale.damage)) };
  const speed = ph.speed ?? 1;
  const dm = ph.damageMul ?? 1;
  const moves = Object.fromEntries(Object.entries({ ...base.moves, ...added }).map(([k, m]) => [k, { ...m, windup: Math.round(m.windup * speed), damage: m.damage > 0 ? Math.max(1, Math.round(m.damage * dm)) : 0 }]));
  const patterns = phases.slice(0, d.phase - 1).reduce((acc, p) => p.patterns ?? acc, base.patterns);
  d.foeDef = {
    ...base,
    hp: ph.hp,
    posture: ph.posture ?? base.posture,
    postureRegen: (ph.postureRegen ?? base.postureRegen / d.phaseScale.regen) * d.phaseScale.regen,
    idle: ph.idle ?? base.idle,
    moves,
    patterns,
    gimmicks: ph.gimmicks ?? {},
    weather: ph.weather ?? base.weather,
  };
  const f = d.foe;
  f.hp = ph.hp;
  f.posture = 0;
  d.tempo = 1;
  d.armorBroken = false;
  d.breathRun = 0;
  d.openingUntil = -1;
  d.lastFoeHurt = d.t;
  setFoeIdle(d, ph.roar ?? 1600);
  d.events.push({ type: 'phase', t: d.t, name: ph.name, line: ph.line, n: d.phase, of: d.phaseCount });
}

function burn(d: Duel, dmg: number, t: number): void {
  if (dmg <= 0) return;
  hurt(d, dmg);
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
    d.staggers++;
    d.events.push({ type: 'stagger', t: d.t });
    if (d.foeDef.gimmicks?.armor && !d.armorBroken) {
      d.armorBroken = true;
      d.events.push({ type: 'armorBreak', t: d.t });
    }
    // 베지 않는다: 비틀거림이 다 차면 결정타 없이 끝난다(데려 내려온다)
    if (d.opts.finish === 'stagger' && d.mode === 'duel' && d.staggers >= (d.opts.staggerWin ?? 3)) {
      f.state = 'dead';
      f.stateStart = d.t;
      d.result = 'win';
      d.events.push({ type: 'win', t: d.t, subdued: true });
    }
  }
}

function checkFoeDown(d: Duel): boolean {
  const f = d.foe;
  if (f.hp > 0) return false;
  // 다단계: 격퇴해도 다음 단계가 남았으면 다시 일어선다
  if (d.mode === 'duel' && d.phase < d.phaseCount) {
    nextPhase(d);
    return false;
  }
  if (d.mode === 'practice') {
    // 수련장: 철목인은 다시 일어선다
    f.hp = d.foeDef.hp;
    f.posture = 0;
    d.events.push({ type: 'refill', t: d.t });
    return false;
  }
  f.state = 'dead';
  f.stateStart = d.t;
  f.move = null;
  d.result = 'win';
  d.events.push({ type: 'win', t: d.t });
  return true;
}

/**
 * 대결 등급(2026-11-10): 이긴 대결만 매긴다. 맞지 않고 PERFECT가 많을수록 높다.
 * 점수 = base + perfect × (PERFECT ÷ 판정 수) − hit × 맞음 − guard × 막음
 */
export function duelGrade(d: Duel): { rank: DuelRank; score: number } | null {
  if (d.result !== 'win') return null;
  const g = d.data.rules.grade;
  const s = d.stats;
  const judged = s.clean + s.good + s.miss;
  const ratio = judged ? s.perfect / judged : 0;
  const score = Math.round(g.base + g.perfect * ratio - g.hit * s.hits - g.guard * s.guards);
  const rank: DuelRank = score >= g.S ? 'S' : score >= g.A ? 'A' : score >= g.B ? 'B' : 'C';
  return { rank, score };
}

const RANK_ORDER: Record<DuelRank, number> = { S: 4, A: 3, B: 2, C: 1 };
/** 더 높은 등급 */
export const betterRank = (a: DuelRank | undefined, b: DuelRank): DuelRank => (a && RANK_ORDER[a] >= RANK_ORDER[b] ? a : b);

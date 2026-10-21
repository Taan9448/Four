// 런(한 번의 플레이) 상태: 파티 편성, 덱, 런 마나, 상흔, 플래그, 지도 진행.
import type { GameData } from './data';
import type { Effect, ModuleDef } from './schema';
import { createRng } from './rng';
import { findNode, generateStageMap, mutateMapForSurge, type MapNode, type StageMap } from './route';
import type { BattleOutcome, BattleSetup } from './battle';
import type { CardInstance } from './state';
import { measurePilgrimScale, type PilgrimScale } from './pilgrim-scale';
import { applyPilgrimGains, pilgrimBase, type PilgrimBase } from './pilgrim-gains';
export type { PilgrimScale } from './pilgrim-scale';
export { measurePilgrimScale } from './pilgrim-scale';
import { acquireCard, beginStageLoadout, COMMON, setLoadout, grantStarters, joinMidStage, ownerKey, recommendLoadout, swapCard, swappableCards, upgradeOwned, type Loadout } from './collection';
import {
  abyssAddCard,
  abyssEnemyMods,
  abyssStarters,
  abyssRewardOptions,
  abyssScale,
  advanceLoop,
  cureInjuries,
  gainAbyssCard,
  injure,
  isAbyss,
  relicAllowed,
  revealUnseenCard,
  runOath,
  stageNorm,
  trackBattle,
  trackChoice,
  trackLoopClear,
  trackTick,
  type AbyssState,
} from './abyss';

export interface RosterEntry {
  id: string;
  hp: number;
  maxHp: number;
  /** 레벨(1부터)과 지금 레벨에서 쌓인 경험치 */
  level: number;
  xp: number;
}

export interface RunState {
  seed: string;
  stageId: string;
  map: StageMap;
  position: string | null;
  visited: string[];
  roster: RosterEntry[];
  selected: string[];
  /** 이번 스테이지의 덱: 편성 + 필수 카드 + 이번 스테이지에 얻은 카드(GAME_DESIGN 9-1). 스테이지를 시작할 때 다시 만든다 */
  deck: CardInstance[];
  /** 보유 카드: 카드 id → 강화 단계(같은 카드는 한 장) */
  collection: Record<string, number>;
  /** 대강화 천장: 카드 id(심연은 카드 uid) → 지금 단계에서 실패한 횟수. 성공하면 지운다 */
  forgeFails?: Record<string, number>;
  /** 캠페인 보유 카드의 대강화 각인: 카드 id → 각인 id(고른 순서). 심연은 카드 인스턴스의 marks */
  engravings?: Record<string, string[]>;
  /** 대강화에 성공해 고를 각인(상점을 떠나면 첫 후보로 새긴다) */
  forgePending?: { uid: string; cardId: string; level: number; choices: string[] } | null;
  /** 편성: 주인(동료 id·'common') → 카드 id */
  loadout: Loadout;
  /** 갈래 보너스(출발 편성 기준): 동료 id → 켜진 아키타입 id(GAME_DESIGN 9-1) */
  loadoutFocus?: Record<string, string>;
  /** 편성 저장 칸(balance.loadout.presets개, 빈 칸 null) */
  presets: (Loadout | null)[];
  /** 스테이지를 시작하기 전 편성 화면을 띄워야 한다 */
  needsLoadout: boolean;
  /** 이번 스테이지에 얻은 카드(편성 칸 수와 상관없이 이 스테이지 동안 덱에) */
  stageGains: string[];
  mana: number;
  scar: number;
  flags: string[];
  usedModules: string[];
  supportActive: boolean;
  /** map: 지도 / stage_clear: 보스를 넘고 다음 스테이지 대기 / complete: 캠페인(구현된 범위) 끝 / defeat */
  status: 'map' | 'stage_clear' | 'complete' | 'defeat';
  counter: number;
  /** 레벨업으로 고를 카드 강화가 남은 동료 id(하나에 1장). 지도로 돌아가기 전에 고른다 */
  pendingUpgrades: string[];
  /** 아직 화면에 보여 주지 않은 레벨업 소식 */
  levelLog: LevelUp[];
  /** 경제(2026-10-08): 골드, 가진 유물, 물약 칸(빈 칸 null), 지금 들른 상점의 진열(나가면 그대로 남아 다시 들어와도 같다), 상점에서 카드를 바꾼 횟수 */
  gold: number;
  relics: string[];
  potions: (string | null)[];
  shop: ShopState | null;
  shopSwaps: number;
  /** 난이도(2026-10-08): 보통·어려움, 하드코어(쓰러진 동료는 돌아오지 않는다)와 그렇게 잃은 동료 */
  difficulty: Difficulty;
  hardcore: boolean;
  fallen: string[];
  /** 캠페인을 마친 런에서 스테이지마다 다시 해서 이긴 횟수 */
  replays: Record<string, number>;
  /** 스테이지 다시 하기 중이면 돌아갈 클리어한 런(결과는 그 런에 남기지 않는다. 이긴 횟수만) */
  replayOf: RunState | null;
  /** 클리어한 런(자유 여정, 2026-10-11): 다시 하다 전체 지도로 나간 스테이지의 진행(스테이지 id → 그 런). 그 장소를 다시 누르면 이어진다 */
  suspended?: Record<string, RunState>;
  /** 이야기로 일행을 떠난 동료의 마지막 상태(캠페인을 마치면 이 상태로 돌아온다) */
  departed?: RosterEntry[];
  /** 순례(2026-10-11 A안): 첫 순례 보상을 받은 스테이지 · 이룬 순례 도전(스테이지 id → 도전 id) */
  pilgrimRewarded?: Record<string, boolean>;
  challenges?: Record<string, string[]>;
  /** 순례 일행 보정: 출발 편성을 정할 때 고정한 값(GAME_DESIGN 2절, 2026-10-12 보정식 세 항). 없으면 그때그때 센다 */
  pilgrimScale?: PilgrimScale;
  /** 순례 누적(2026-10-21): 이 길을 출발할 때(멈춘 길은 이어서 걸 때)의 모습. 보스를 넘기면 여기서 달라진 만큼을 클리어한 런에 더한다 */
  pilgrimBase?: PilgrimBase;
  /** 이번 스테이지(심연은 굽이)를 시작할 때의 모습 — 끝 화면의 '얻은 것'·'상흔 +N'(2026-10-11 UI/UX 3-2) */
  stageStart?: StageStart;
  /** 결과 화면 통계 */
  stats: RunStats;
  /** 심연 런(GAME_DESIGN 16절). 없으면 캠페인 */
  mode?: 'campaign' | 'abyss';
  abyss?: AbyssState;
}

export type Difficulty = 'normal' | 'hard';

/** 결과 화면 통계(런 전체): 전투 집계를 더해 간다 */
export interface RunStats {
  /** 裂 틈새: 폭주가 연 수 · 들어간 수 */
  cracks?: { made: number; entered: number };
  battles: number;
  turns: number;
  kills: number;
  damage: number;
  crits: number;
  surges: number;
  /** 균열 폭주로 잃은 체력(아군 합, 옛 저장은 없음) */
  surgeHp?: number;
  /** 카드 id → 쓴 횟수 */
  cards: Record<string, number>;
  /** 진 런: 어디서 무엇에 쓰러졌나 */
  deathCause?: string;
  /** 전투마다 한 줄(사람 플레이 통계 내보내기 — 봇 보고서와 같은 칸) */
  log?: BattleLog[];
  /** 순례 도전 판정(길마다 새로, GAME_DESIGN 2절): 싸운 동료 · 전투가 끝날 때 쓰러져 있던 동료 수 · 들른 휴식·상점 칸 · 이긴 보스전(턴·결 노출·낸 카드) */
  fought?: string[];
  downed?: number;
  rests?: number;
  shops?: number;
  boss?: { turns: number; grain: number; cards: Record<string, number> };
}

/** 전투 한 번의 기록. 체력은 출전 멤버 합(전/후)과 최대 체력 합 */
export interface BattleLog {
  stageId: string;
  moduleId: string;
  type: string;
  floor: number;
  result: 'victory' | 'defeat';
  turns: number;
  hpBefore: number;
  hpAfter: number;
  hpMax: number;
  haunBefore: number;
  haunAfter: number;
}

export interface StageStart {
  relics: string[];
  scar: number;
  levels: Record<string, number>;
}

/** 스테이지·굽이를 시작할 때 적어 둔다(끝 화면이 이번에 얻은 유물·레벨·상흔을 비교한다) */
export function markStageStart(run: RunState): void {
  run.stageStart = { relics: [...run.relics], scar: run.scar, levels: Object.fromEntries(run.roster.map((r) => [r.id, r.level])) };
}

/** 이번 스테이지에 얻은 것: 카드(stageGains)·유물·레벨업·상흔 변화 */
export function stageGainsSummary(data: GameData, run: RunState): { cards: string[]; relics: string[]; levels: { name: string; from: number; to: number }[]; scarDelta: number } {
  const st = run.stageStart;
  const cards = run.stageGains.map((id) => data.cards.get(id)?.name ?? id);
  const relics = run.relics.filter((id) => !st?.relics.includes(id)).map((id) => data.relics.get(id)?.name ?? id);
  const levels = st
    ? run.roster.filter((r) => st.levels[r.id] !== undefined && r.level > st.levels[r.id]).map((r) => ({ name: data.characters.get(r.id)?.name ?? r.id, from: st.levels[r.id], to: r.level }))
    : [];
  return { cards, relics, levels, scarDelta: st ? run.scar - st.scar : 0 };
}

export function emptyStats(): RunStats {
  return { battles: 0, turns: 0, kills: 0, damage: 0, crits: 0, surges: 0, cards: {} };
}

/** 상점 진열: 노드마다 한 번 정해지고, 산 것은 sold */
export interface ShopState {
  nodeId: string;
  cards: { cardId: string; price: number; sold: boolean }[];
  relics: { relicId: string; price: number; sold: boolean }[];
  potions: { potionId: string; price: number; sold: boolean }[];
  /** 이 상점에서 카드 바꾸기·강화를 이미 썼다(상점마다 한 번) */
  swapUsed: boolean;
  upgradeUsed: boolean;
  /** 상흔 shopAt 이상일 때 연 상점: 값이 오르고, 꿰매기를 판다(GAME_DESIGN 7절) */
  scarred?: boolean;
  stitchUsed?: boolean;
  /** 대강화(대장간): 이 상점에서 망치를 댄 카드 uid — 상점마다 카드 한 장만(2026-10-15 사용자 요청) */
  forgeUid?: string;
}

export interface LevelUp {
  id: string;
  name: string;
  from: number;
  to: number;
  hpGain: number;
}

export interface RunOptions {
  stageId?: string;
  difficulty?: Difficulty;
  hardcore?: boolean;
  /** 왕일검 지원(원래 S3 합류). 프로토타입 디버그 토글용 */
  supportActive?: boolean;
}

/** 원작 순서(order)로 플레이 가능한 스테이지 */
export function playableStages(data: GameData) {
  return data.stages.filter((s) => s.playable).sort((a, b) => a.order - b.order);
}

export function createRun(data: GameData, seed: string, opts: RunOptions = {}): RunState {
  const stageId = opts.stageId ?? playableStages(data)[0].id;
  const haun = data.characters.get('haun')!;
  const run: RunState = {
    seed,
    stageId,
    map: { stageId, floors: [] },
    position: null,
    visited: [],
    roster: [{ id: 'haun', hp: haun.maxHp, maxHp: haun.maxHp, level: 1, xp: 0 }],
    selected: ['haun'],
    deck: [],
    collection: {},
    loadout: {},
    loadoutFocus: {},
    presets: Array.from({ length: data.balance.loadout.presets }, () => null),
    needsLoadout: true,
    stageGains: [],
    mana: data.balance.mana.max,
    scar: 0,
    flags: [],
    usedModules: [],
    supportActive: opts.supportActive ?? false,
    status: 'map',
    counter: 0,
    pendingUpgrades: [],
    levelLog: [],
    gold: data.balance.economy.startGold,
    relics: [],
    potions: Array.from({ length: data.balance.economy.potionSlots }, () => null),
    shop: null,
    shopSwaps: 0,
    difficulty: opts.difficulty ?? 'normal',
    hardcore: opts.hardcore ?? false,
    fallen: [],
    replays: {},
    replayOf: null,
    pilgrimRewarded: {},
    challenges: {},
    stats: emptyStats(),
  };
  // 하운과 공용의 시작 카드(각 10장)를 받고, 첫 스테이지 편성으로
  grantStarters(data, run, 'haun');
  grantStarters(data, run, COMMON);
  beginStageLoadout(data, run);
  // 새 캠페인의 첫 스테이지(S0 프롤로그)는 편성 화면 없이 추천 편성으로 바로 출발한다(2026-10-11 사용자 결정). 편성은 S1부터
  if (run.stageId === playableStages(data)[0]?.id) setLoadout(data, run, run.loadout);
  run.map = buildMap(data, run);
  markStageStart(run);
  return run;
}

/**
 * 디버그·확인용: 앞 스테이지를 건너뛰고 stageId에서 시작한다. 앞 스테이지들의 고정 스토리 노드(첫 선택지)와
 * 보스 clearEffects를 순서대로 적용해 동료·플래그·스토리 카드를 원작 흐름대로 맞춘다.
 */
export function createRunAt(data: GameData, seed: string, stageId: string, opts: RunOptions = {}): RunState {
  const target = data.stages.find((s) => s.id === stageId);
  if (!target?.playable) throw new Error(`플레이할 수 없는 스테이지: ${stageId}`);
  const run = createRun(data, seed, { ...opts, stageId });
  for (const st of playableStages(data).filter((s) => s.order < target.order)) {
    for (const p of [...st.pinned].sort((a, b) => a.floor - b.floor)) {
      const mod = data.modules.get(p.module)!;
      const choice = mod.content.choices?.find((c) => !c.condition);
      if (choice) applyRunOps(data, run, choice.effects);
      if (mod.once) run.usedModules.push(mod.id);
    }
    const boss = st.boss ? data.modules.get(st.boss) : undefined;
    if (boss?.content.clearEffects) applyRunOps(data, run, boss.content.clearEffects);
    // 앞 스테이지에서 쌓였을 경험치(대략). 강화는 무작위로 바로 적용
    for (const r of run.roster) if (data.characters.get(r.id)?.role === 'fighter') gainXp(data, run, r.id, data.balance.leveling.debugXpPerStage);
    run.gold += data.balance.economy.debugGoldPerStage;
    while (run.pendingUpgrades.length) applyLevelUpgrade(data, run, null);
  }
  run.levelLog = [];
  run.selected = run.roster.filter((r) => data.characters.get(r.id)?.role === 'fighter').slice(0, data.balance.party.max).map((r) => r.id);
  beginStageLoadout(data, run);
  run.map = buildMap(data, run);
  return run;
}

/** 받침 있는 낱말 뒤 '을', 없으면 '를' */
function josaEulReul(word: string): string {
  const c = word.charCodeAt(word.length - 1) - 0xac00;
  return c >= 0 && c <= 11171 && c % 28 !== 0 ? '을' : '를';
}

function buildMap(data: GameData, run: RunState): StageMap {
  return generateStageMap(data, run.stageId, createRng(run.seed).fork(`map:${run.stageId}`), {
    scar: run.scar,
    flags: run.flags,
    roster: run.roster.map((r) => r.id),
    usedModules: run.usedModules,
  });
}

/**
 * 스테이지 다시 하기(2026-10-08): 캠페인을 마친 런(hub)의 마지막 파티·덱·유물·물약·골드·레벨 그대로 stageId를 처음부터.
 * 다시 하는 런은 hub를 replayOf로 품고, 끝나면 hub로 돌아간다. 순례 누적(2026-10-21): 보스를 넘기면 그 길에서 달라진 것을 hub에 더한다
 */
export function startReplay(data: GameData, hub: RunState, stageId: string, opts: { fresh?: boolean } = {}): RunState {
  if (hub.status !== 'complete') throw new Error('캠페인을 마친 런에서만 다시 할 수 있다');
  const stage = playableStages(data).find((s) => s.id === stageId);
  if (!stage) throw new Error(`다시 할 수 없는 스테이지: ${stageId}`);
  // 돌아갈 클리어한 런: 이 스테이지를 뺀 나머지 멈춘 진행은 그대로 품는다(저장하면 함께 남는다)
  const { [stageId]: paused, ...others } = hub.suspended ?? {};
  const back: RunState = structuredClone({ ...hub, replayOf: null, suspended: others });
  if (paused && !opts.fresh) {
    // 멈춘 진행을 이어서: 그사이 클리어한 런에 들어온 것(다른 길·첫 순례 보상)에 이 길에서 달라진 만큼을 얹어 다시 맞춘다
    const run: RunState = structuredClone(paused);
    run.replayOf = back;
    rebaseWalk(data, run, hub);
    run.presets = structuredClone(hub.presets);
    return run;
  }
  const run: RunState = structuredClone({ ...hub, replayOf: null, suspended: undefined });
  delete run.suspended;
  run.replayOf = back;
  run.stageId = stageId;
  run.status = 'map';
  run.position = null;
  run.visited = [];
  run.shop = null;
  run.levelLog = [];
  run.pendingUpgrades = [];
  run.pilgrimBase = pilgrimBase(hub);
  // 이 길의 기록(순례 도전 판정용 전투 집계). 클리어한 런의 기록은 그대로 둔다
  run.stats = emptyStats();
  for (const r of run.roster) r.hp = r.maxHp;
  // 같은 시드라도 다시 할 때마다 다른 지도가 나오게 시드에 횟수를 붙인다
  run.seed = `${hub.seed}~${stageId}~${(hub.replays[stageId] ?? 0) + 1}`;
  beginStageLoadout(data, run);
  run.map = buildMap(data, run);
  crackMapByScar(data, run);
  markStageStart(run);
  return run;
}

/** 멈춘 길을 이어서 걸 때: 지금 hub에 이 길에서 달라진 만큼을 얹은 모습으로 맞추고, 그 hub를 새 기준으로 삼는다(지금 체력은 그대로) */
function rebaseWalk(data: GameData, run: RunState, hub: RunState): void {
  // 옛 저장(기준이 없는 멈춘 길)은 지금부터 센다
  const base = run.pilgrimBase ?? pilgrimBase(run);
  const next: RunState = structuredClone({ ...hub, replayOf: null, suspended: undefined, loadout: run.loadout });
  applyPilgrimGains(data, next, base, run);
  run.collection = next.collection;
  run.engravings = next.engravings;
  run.relics = next.relics;
  run.potions = next.potions;
  run.gold = next.gold;
  run.loadout = next.loadout;
  for (const r of run.roster) {
    const n = next.roster.find((x) => x.id === r.id);
    if (!n) continue;
    r.maxHp = n.maxHp;
    r.level = n.level;
    r.xp = n.xp;
    r.hp = Math.min(r.hp, r.maxHp);
  }
  for (const c of run.deck) if (run.collection[c.cardId] !== undefined) c.level = run.collection[c.cardId];
  run.pilgrimBase = pilgrimBase(hub);
}

/**
 * 다시 하기를 끝내고 hub로 돌아간다. 이겼으면 그 스테이지의 이긴 횟수를 올리고, 순례 누적(2026-10-21 사용자 결정):
 * 그 길에서 달라진 카드·강화·각인·유물·물약·골드·동료를 hub에 더한다(편성·출전도 그 길의 것으로). 지면 편성 저장 칸만 남긴다
 */
export function finishReplay(data: GameData, run: RunState): RunState {
  const hub = run.replayOf;
  if (!hub) throw new Error('다시 하는 중이 아니다');
  carryBack(hub, run);
  if (run.status === 'stage_clear' || run.status === 'complete') {
    hub.replays[run.stageId] = (hub.replays[run.stageId] ?? 0) + 1;
    applyPilgrimGains(data, hub, run.pilgrimBase ?? pilgrimBase(hub), run);
    hub.loadout = Object.fromEntries(Object.entries(run.loadout).map(([k, ids]) => [k, ids.filter((id) => hub.collection[id] !== undefined)]));
    hub.selected = [...run.selected];
  }
  if (hub.suspended) delete hub.suspended[run.stageId];
  return hub;
}

/**
 * 자유 여정(2026-10-11): 다시 하던 스테이지를 지도에서 멈추고 클리어 지도로 나간다. 진행(그 길의 덱·골드·유물·얻은 카드)은
 * hub.suspended에 남아 그 장소를 다시 누르면 이어진다(startReplay). 클리어한 런에는 편성 저장 칸만 남긴다(길에서 얻은 것은 보스를 넘길 때)
 */
export function suspendReplay(run: RunState): RunState {
  const hub = run.replayOf;
  if (!hub) throw new Error('다시 하는 중이 아니다');
  if (run.status !== 'map') throw new Error('지도에 서 있을 때만 멈출 수 있다');
  carryBack(hub, run);
  const paused: RunState = structuredClone({ ...run, replayOf: null });
  delete paused.suspended;
  hub.suspended = { ...(hub.suspended ?? {}), [run.stageId]: paused };
  return hub;
}

/** 멈춘 진행을 버린다(그 스테이지는 다음에 처음부터) */
export function discardSuspended(hub: RunState, stageId: string): void {
  if (hub.suspended) delete hub.suspended[stageId];
}

/** 다시 하기에서 클리어한 런에 늘 남기는 것: 편성 저장 칸(이기면 finishReplay가 길에서 달라진 것도 더한다) */
function carryBack(hub: RunState, run: RunState): void {
  hub.presets = structuredClone(run.presets);
}

/** 보유 카드 둘을 합친다: 어느 쪽에든 있으면 남기고, 강화 단계는 높은 쪽 */
export function mergeCollections(a: Record<string, number>, b: Record<string, number>): Record<string, number> {
  const out = { ...a };
  for (const [id, lv] of Object.entries(b)) out[id] = Math.max(out[id] ?? lv, lv);
  return out;
}

/**
 * 캠페인을 마치면(클리어 지도를 열 때) 일행을 다시 모은다(2026-10-11 사용자 요청): 이야기로 떠난 동료(S9의 카일·보른)와
 * 하드코어로 잃은 동료가 돌아온다. 떠날 때의 상태가 남아 있으면 그대로, 없으면 하운과 같은 레벨로. 체력은 가득. 돌아온 동료 이름
 */
export function restoreParty(data: GameData, run: RunState): string[] {
  if (run.status !== 'complete' || isAbyss(run)) return [];
  const haun = run.roster.find((r) => r.id === 'haun');
  const back: string[] = [];
  for (const def of data.characters.values()) {
    if (def.role !== 'fighter' || run.roster.some((r) => r.id === def.id)) continue;
    const kept = run.departed?.find((r) => r.id === def.id);
    const level = kept?.level ?? haun?.level ?? 1;
    const maxHp = kept?.maxHp ?? def.maxHp + def.hpPerLevel * (level - 1);
    run.roster.push({ id: def.id, hp: maxHp, maxHp, level, xp: kept?.xp ?? 0 });
    grantStarters(data, run, def.id);
    back.push(def.name);
  }
  if (back.length) run.loadout = recommendLoadout(data, run, run.loadout);
  for (const r of run.roster) r.hp = r.maxHp;
  run.fallen = [];
  run.departed = [];
  return back;
}

/** 보스를 넘은 뒤 다음 스테이지(원작 순서로 다음 playable). 없으면 null */
export function nextStage(data: GameData, run: RunState) {
  const cur = data.stages.find((s) => s.id === run.stageId)!;
  return playableStages(data).find((s) => s.order > cur.order) ?? null;
}

/**
 * 다음 스테이지로 넘어간다: 덱·동료·상흔·플래그는 이어지고, 지도는 새로, 체력은 balance.stage.healOnEnter만큼 회복.
 * 다음 스테이지가 없으면 캠페인(구현된 범위)을 마친다. 넘어갔으면 true
 */
export function advanceStage(data: GameData, run: RunState): boolean {
  if (run.status !== 'stage_clear') throw new Error('보스를 넘은 뒤에만 다음 스테이지로 간다');
  // 심연: 끝이 없다. 다음 굽이로
  if (isAbyss(run)) {
    advanceLoop(data, run);
    markStageStart(run);
    return true;
  }
  const next = nextStage(data, run);
  if (!next) {
    run.status = 'complete';
    return false;
  }
  run.stageId = next.id;
  run.position = null;
  run.visited = [];
  for (const r of run.roster) r.hp = Math.min(r.maxHp, r.hp + Math.floor(r.maxHp * data.balance.stage.healOnEnter));
  beginStageLoadout(data, run);
  run.map = buildMap(data, run);
  crackMapByScar(data, run);
  run.status = 'map';
  markStageStart(run);
  return true;
}

/** 카드를 얻는다(보상 고르기 등): 보유 목록에 영구로, 이번 스테이지 덱에도. 이미 있으면 강화(GAME_DESIGN 9-1). 결과 문구 */
export function addCard(data: GameData, run: RunState, cardId: string): string {
  // 심연: 보유 목록과 상관없이 덱에 바로(GAME_DESIGN 16절)
  return isAbyss(run) ? abyssAddCard(data, run, cardId) : acquireCard(data, run, cardId);
}

export function availableNodes(run: RunState): MapNode[] {
  if (run.status !== 'map') return [];
  if (!run.position) return run.map.floors[0];
  const here = findNode(run.map, run.position)!;
  return here.next.map((id) => findNode(run.map, id)!);
}

export interface Encounter {
  node: MapNode;
  module: ModuleDef;
}

export function enterNode(data: GameData, run: RunState, nodeId: string): Encounter {
  const node = availableNodes(run).find((n) => n.id === nodeId);
  if (!node) throw new Error(`지금 갈 수 없는 노드: ${nodeId}`);
  const module = data.modules.get(node.moduleId)!;
  run.position = node.id;
  run.visited.push(node.id);
  if (node.type === 'rest') run.stats.rests = (run.stats.rests ?? 0) + 1;
  if (node.type === 'shop') run.stats.shops = (run.stats.shops ?? 0) + 1;
  if (node.crack) (run.stats.cracks ??= { made: 0, entered: 0 }).entered += 1;
  if (module.once && !run.usedModules.includes(module.id)) run.usedModules.push(module.id);
  return { node, module };
}

export function isBattle(enc: Encounter): boolean {
  return ['battle', 'elite', 'boss'].includes(enc.node.type);
}

export function stageWorld(data: GameData, run: RunState) {
  return run.abyss?.world ?? data.stages.find((s) => s.id === run.stageId)!.world;
}

/** 모듈의 전투 보너스가 이번 편성·플래그로 켜지는가(condition: partyHas·flag) */
export function bonusActive(run: RunState, module: ModuleDef): boolean {
  const bonus = module.content.bonus;
  return (
    !!bonus &&
    (!bonus.condition.partyHas || run.selected.includes(bonus.condition.partyHas)) &&
    (!bonus.condition.flag || run.flags.includes(bonus.condition.flag))
  );
}

export function battleSetupFor(data: GameData, run: RunState, enc: Encounter): BattleSetup {
  const { bonus, startEffects: always = [], mana } = enc.module.content;
  const bonusOn = bonusActive(run, enc.module);
  const stage = data.stages.find((s) => s.id === run.stageId)!;
  // 모듈별 적 배율(2026-10-13): 등급·어려움·순례·심연 배율 뒤에 곱한다
  const modScale = { hp: enc.module.content.enemyScale?.hp ?? 1, dmg: enc.module.content.enemyScale?.dmg ?? 1 };
  if (isAbyss(run)) {
    // 심연: 모듈이 난 스테이지의 세계·마나 규칙(틈 굽이의 다른 세계 보스도 제 규칙으로), 굽이 배율. 스테이지·어려움 배율은 쓰지 않는다
    const own = data.stages.find((s) => s.id === enc.module.stage);
    const scale = abyssScale(data, run.abyss!.depth);
    const norm = stageNorm(data, own?.id ?? run.stageId);
    const shadow = enc.node.type === 'elite' && run.relics.some((id) => data.relics.get(id)?.rule === 'reveal_map') ? data.balance.abyss.shadowEliteDmg : 1;
    const boss = enc.node.type === 'boss' && enc.module.id !== data.balance.abyss.nemesisModule ? data.balance.abyss.bossDmgMul : 1;
    const haun = run.roster.find((r) => r.id === 'haun')!;
    return {
      world: own?.world ?? run.abyss!.world,
      party: run.selected.map((id) => {
        const r = run.roster.find((x) => x.id === id)!;
        return { id, hp: r.hp, maxHp: r.maxHp, level: r.level };
      }),
      enemies: enc.node.enemies ?? enc.module.content.enemies ?? [],
      surviveTurns: enc.module.content.surviveTurns,
      deck: run.deck,
      mana: run.mana,
      rng: createRng(run.seed).fork(`battle:${run.stageId}:${enc.node.id}`),
      supportActive: false,
      flags: run.flags,
      scar: run.scar,
      startEffects: [...always, ...(bonusOn ? bonus!.effects : [])],
      manaRule: mana ?? own?.mana ?? stage.mana,
      riftDecay: enc.module.content.riftDecay,
      riftDecayNote: enc.module.content.riftDecayNote,
      // 서약 '두꺼운 살'
      enemyHpScale: scale.hp * norm.hp * (runOath(data, run).enemyHpMul ?? 1) * modScale.hp,
      enemyDmgScale: scale.dmg * norm.dmg * shadow * boss * modScale.dmg,
      relics: run.relics,
      potions: run.potions,
      partyMax: data.balance.abyss.partyMax,
      enemyHitCap: Math.max(1, Math.floor(haun.maxHp * data.balance.abyss.oneHitCap)),
      laws: run.abyss!.laws ?? [],
      enemyMods: abyssEnemyMods(data, run, enc.module.id, enc.node, enc.node.enemies ?? enc.module.content.enemies ?? []),
    };
  }
  const pilgrim = pilgrimScale(data, run);
  return {
    world: stageWorld(data, run),
    party: run.selected.map((id) => {
      const r = run.roster.find((x) => x.id === id)!;
      return { id, hp: r.hp, maxHp: r.maxHp, level: r.level };
    }),
    enemies: enc.node.enemies ?? enc.module.content.enemies ?? [],
    surviveTurns: enc.module.content.surviveTurns,
    deck: run.deck,
    mana: run.mana,
    rng: createRng(run.seed).fork(`battle:${run.stageId}:${enc.node.id}`),
    supportActive: run.supportActive,
    haunOptional: !!run.replayOf,
    flags: run.flags,
    scar: run.scar,
    startEffects: [...always, ...(bonusOn ? bonus!.effects : [])],
    manaRule: mana ?? stage.mana,
    riftDecay: enc.module.content.riftDecay,
    riftDecayNote: enc.module.content.riftDecayNote,
    enemyHpScale: stage.enemyHpScale * (run.difficulty === 'hard' ? hardMul(data, stage.id).hp : 1) * pilgrim.hp * modScale.hp,
    enemyDmgScale:
      stage.enemyDmgScale * (run.difficulty === 'hard' ? hardMul(data, stage.id).dmg : 1) * (enc.node.type === 'boss' ? stage.bossDmgMul : 1) * pilgrim.dmg * modScale.dmg,
    relics: run.relics,
    potions: run.potions,
    surgeDamageMul: enc.module.content.surgeTutorial ? 0.5 : undefined,
    focusEffects: focusEffectsFor(data, run),
    // 裂 틈의 짐승: 첫 적에 틈의 접사 하나(GAME_DESIGN 7절)
    enemyMods: enc.node.crack && enc.node.enemies ? crackAffix(data, run, enc.node) : undefined,
  };
}

/** 갈래 보너스(GAME_DESIGN 9-1): 출전한 동료 중 출발 편성에서 갈래가 켜진 동료의 전투 시작 효과(그 동료를 출처로) */
export function focusEffectsFor(data: GameData, run: RunState): { member: string; arch: string; effects: Effect[] }[] {
  return run.selected.flatMap((id) => {
    const arch = run.loadoutFocus?.[id];
    const focus = arch ? data.characters.get(id)?.archetypes.find((a) => a.id === arch)?.focus : undefined;
    return focus ? [{ member: id, arch: arch!, effects: focus.effects }] : [];
  });
}

/** 틈의 짐승의 접사: 첫 적(엘리트)에 시드로 고른 접사 하나 */
function crackAffix(data: GameData, run: RunState, node: MapNode): ({ affixes: string[] } | undefined)[] {
  const pool = [...data.affixes.values()].filter((a) => !a.boss).map((a) => a.id);
  const id = createRng(run.seed).fork(`crack-affix:${run.stageId}:${node.id}`).pick(pool);
  return (node.enemies ?? []).map((_, i) => (i === 0 && id ? { affixes: [id] } : undefined));
}

/**
 * 폭주가 지도를 가른다(GAME_DESIGN 7절): 폭주 한 번마다 앞길 하나를 끊고 裂 틈새 하나(지도마다 maxCracks개까지).
 * 틈새는 시드로 틈의 짐승(이 스테이지 엘리트 + 접사 하나, 이기면 상흔 -5와 유물) 또는 틈새의 거래(감소 카드·봉인 유물)
 */
export function splitMapBySurge(data: GameData, run: RunState, surges: number, key: string, countSurges = true): number {
  const cfg = data.balance.rift.map;
  const world = stageWorld(data, run);
  const used = new Set(run.map.floors.flat().filter((n) => n.crack).map((n) => n.moduleId));
  const crackMods = [...data.modules.values()].filter((m) => m.stage === 'crack' && (!m.conditions.world || m.conditions.world === world));
  const elites = [...data.modules.values()].filter((m) => m.stage === run.stageId && m.type === 'elite' && m.content.enemies?.length);
  let made = 0;
  for (let i = 0; i < surges; i++) {
    const rng = createRng(run.seed).fork(`surge-map:${run.stageId}:${key}:${i}`);
    const mark = mutateMapForSurge(run.map, run.position, rng, cfg.maxCracks, () => {
      const beast = elites.length > 0 && rng.next() < cfg.beastChance;
      const options = crackMods.filter((m) => (beast ? m.type === 'elite' : m.type === 'event') && !used.has(m.id));
      const mod = options.length ? rng.pick(options) : null;
      if (!mod) return null;
      used.add(mod.id);
      return { moduleId: mod.id, type: mod.type, enemies: beast ? [...rng.pick(elites).content.enemies!] : undefined };
    });
    if (mark.crack) made += 1;
  }
  if (countSurges) run.map.surges = (run.map.surges ?? 0) + surges;
  (run.stats.cracks ??= { made: 0, entered: 0 }).made += made;
  return made;
}

/**
 * 상흔이 깊으면(balance.rift.map.scarCrackAt 이상) 새 지도에 들어선 직후 한 번 갈라진다 — 폭주 한 번과 같은 규칙으로
 * 앞길 하나가 끊기고 그 세계의 裂 틈새 하나가 열린다(GAME_DESIGN 7절, 2026-10-12). 캠페인·순례·심연 모두
 */
export function crackMapByScar(data: GameData, run: RunState): boolean {
  const at = data.balance.rift.map.scarCrackAt;
  if (at === undefined || run.scar < at) return false;
  splitMapBySurge(data, run, 1, 'scar', false);
  run.map.scarCrack = true;
  return true;
}

/** 전투 결과를 런에 반영한다. 이기면 모듈의 clearEffects(보스가 아니어도)를 적용하고 그 결과 메시지를 돌려준다 */
export function applyBattleOutcome(data: GameData, run: RunState, enc: Encounter, outcome: BattleOutcome): string[] {
  // 통계 기록: 반영 전의 체력(출전 멤버)
  const fought = outcome.party.map((p) => run.roster.find((x) => x.id === p.id)).filter((r): r is NonNullable<typeof r> => !!r);
  const hpBefore = fought.reduce((a, r) => a + r.hp, 0);
  const haunBefore = run.roster.find((r) => r.id === 'haun')?.hp ?? 0;
  for (const p of outcome.party) {
    const r = run.roster.find((x) => x.id === p.id);
    if (r) r.hp = Math.max(0, Math.min(r.maxHp, p.hp));
  }
  run.mana = outcome.mana;
  run.scar = Math.max(0, run.scar + outcome.scarGain);
  if (outcome.potions) run.potions = [...outcome.potions];
  // 결과 화면 통계
  const st = (run.stats ??= emptyStats());
  st.battles += 1;
  st.turns += outcome.turns ?? 0;
  const downed = new Set(outcome.downed ?? []);
  const after = (id: string) => (downed.has(id) || (outcome.result === 'defeat' && id === 'haun') ? 0 : (outcome.party.find((p) => p.id === id)?.hp ?? 0));
  (st.log ??= []).push({
    stageId: isAbyss(run) ? `d${run.abyss!.depth}` : run.stageId,
    moduleId: enc.module.id,
    type: enc.node.type,
    floor: enc.node.floor,
    result: outcome.result,
    turns: outcome.turns ?? 0,
    hpBefore,
    hpAfter: fought.reduce((a, r) => a + after(r.id), 0),
    hpMax: fought.reduce((a, r) => a + r.maxHp, 0),
    haunBefore,
    haunAfter: after('haun'),
  });
  st.fought = [...new Set([...(st.fought ?? []), ...fought.map((r) => r.id)])];
  st.downed = (st.downed ?? 0) + (outcome.downed ?? []).filter((id) => id !== 'haun').length;
  if (enc.node.type === 'boss' && outcome.result === 'victory') st.boss = { turns: outcome.turns ?? 0, grain: outcome.tally?.grain ?? 0, cards: { ...(outcome.tally?.cards ?? {}) } };
  if (outcome.tally) {
    st.kills += outcome.tally.kills;
    st.damage += outcome.tally.damage;
    st.crits += outcome.tally.crits;
    st.surges += outcome.tally.surges;
    st.surgeHp = (st.surgeHp ?? 0) + (outcome.tally.surgeHp ?? 0);
    for (const [id, n] of Object.entries(outcome.tally.cards)) st.cards[id] = (st.cards[id] ?? 0) + n;
  }
  if (outcome.result === 'defeat') {
    run.status = 'defeat';
    st.deathCause = `${enc.module.name} — ${outcome.tally?.haunHitBy ?? '알 수 없는 것'}`;
    return [];
  }
  const out: string[] = [];
  // 폭주 없이 보스를 넘기면 금이 조금 아문다(GAME_DESIGN 7절)
  const clean = data.balance.rift.scar.bossCleanBonus;
  if (enc.node.type === 'boss' && clean && (outcome.tally?.surges ?? 0) === 0 && run.scar > 0) {
    const before = run.scar;
    run.scar = Math.max(0, run.scar - clean);
    out.push(`폭주 없이 넘긴 싸움 — 상흔 -${before - run.scar}`);
  }
  // 그 스테이지 보스를 넘기면 폭주 여부와 상관없이 상흔이 덜린다(S8 혈전 — 틈 세계로 넘어가기 전, 2026-10-12)
  const cleared = data.balance.rift.scar.bossClearScar[run.stageId] ?? 0;
  if (enc.node.type === 'boss' && !isAbyss(run) && cleared && run.scar > 0) {
    const before = run.scar;
    run.scar = Math.max(0, run.scar - cleared);
    out.push(`${enc.module.name}${josaEulReul(enc.module.name)} 넘어 상흔 -${before - run.scar}`);
  }
  // 폭주가 지도를 가른다(스테이지가 이어질 때만 — 보스를 넘기면 지도가 끝난다)
  if ((outcome.tally?.surges ?? 0) > 0 && enc.node.type !== 'boss') {
    splitMapBySurge(data, run, outcome.tally!.surges, enc.node.id);
    out.push('폭주가 지도를 갈랐다 — 앞길 하나가 끊기고 裂 틈새가 열렸다.');
  }
  if (isAbyss(run)) {
    // 심연: 쓰러진 채 끝난 동료는 부상(다음 굽이까지 최대 체력 감소). 보스·엘리트 수는 점수에. 이야기 clearEffects는 없다
    const ab = run.abyss!;
    const rng = createRng(run.seed).fork(`injury:${enc.node.id}`);
    for (const id of outcome.downed ?? []) {
      const msg = id !== 'haun' && !(id in ab.injuries) ? injure(data, run, (ids) => rng.pick(ids), id) : null;
      if (msg) out.push(msg);
    }
    if (enc.node.type === 'elite') ab.elites += 1;
    if (enc.node.type === 'boss') ab.bosses += 1;
    awardBattleXp(data, run, enc.node.type);
    // 심연 모듈(틈의 짐승 등)의 clearEffects만. 캠페인 모듈의 이야기 보상은 없다
    if (enc.module.stage === 'abyss' || enc.module.stage === 'crack') out.push(...applyRunOps(data, run, enc.module.content.clearEffects ?? []));
    out.push(...fireRunRelics(data, run, 'victory'));
    if (!outcome.tally?.surges) out.push(...fireRunRelics(data, run, 'cleanVictory'));
    trackBattle(data, run, enc.module.id, enc.node.type, outcome.tally);
    if (enc.node.type === 'boss') {
      run.status = 'stage_clear';
      trackLoopClear(data, run);
    }
    return out;
  }
  // 하드코어: 전투가 끝날 때 쓰러져 있던 동료는 일행을 떠난다(하운은 쓰러지면 이미 패배)
  if (run.hardcore) {
    for (const id of outcome.downed ?? []) {
      if (id === 'haun' || !run.roster.some((r) => r.id === id)) continue;
      run.roster = run.roster.filter((r) => r.id !== id);
      run.selected = run.selected.filter((x) => x !== id);
      if (!run.fallen.includes(id)) run.fallen.push(id);
      out.push(`${data.characters.get(id)?.name ?? id} — 쓰러진 채 일어나지 못했다(하드코어)`);
    }
  }
  awardBattleXp(data, run, enc.node.type);
  out.push(...applyRunOps(data, run, enc.module.content.clearEffects ?? []));
  out.push(...fireRunRelics(data, run, 'victory'));
  if (!outcome.tally?.surges) out.push(...fireRunRelics(data, run, 'cleanVictory'));
  if (enc.node.type === 'boss') run.status = 'stage_clear';
  return out;
}

// ───────────────────────── 유물·물약(런) ─────────────────────────

/** 전투 밖 trigger(victory·rest·shopEnter)의 유물 효과를 런에 적용한다 */
export function fireRunRelics(data: GameData, run: RunState, trigger: 'victory' | 'cleanVictory' | 'rest' | 'shopEnter'): string[] {
  const out: string[] = [];
  for (const id of run.relics) {
    const relic = data.relics.get(id);
    if (relic?.trigger !== trigger) continue;
    const msgs = applyRunOps(data, run, relic.effects);
    if (msgs.length) out.push(`${relic.name}: ${msgs.join(', ')}`);
  }
  return out;
}

/** 유물을 얻는다(이미 있으면 무시). 얻는 순간(pickup) 효과를 적용한다 */
export function gainRelic(data: GameData, run: RunState, id: string): string[] {
  const relic = data.relics.get(id);
  if (!relic) throw new Error(`알 수 없는 유물: ${id}`);
  if (run.relics.includes(id)) return [];
  run.relics.push(id);
  const out = [`유물 획득: ${relic.name}`];
  if (relic.trigger === 'pickup') out.push(...applyRunOps(data, run, relic.effects));
  return out;
}

/** 물약을 빈 칸에 넣는다. 칸이 가득이면 false */
export function gainPotion(data: GameData, run: RunState, id: string): boolean {
  if (!data.potions.has(id)) throw new Error(`알 수 없는 물약: ${id}`);
  const i = run.potions.indexOf(null);
  if (i < 0) return false;
  run.potions[i] = id;
  return true;
}

/**
 * 전투 보상 카드 후보. 출전 멤버(와 공용)의 보상 풀에서, 노드 유형별 등급 가중치(balance.rewards.rarityWeights)로
 * 등급을 먼저 뽑고 그 등급에서 카드를 고른다. 같은 카드는 한 번만. 시드로 결정된다.
 */
export function rewardOptions(data: GameData, run: RunState, nodeId: string): string[] {
  if (isAbyss(run)) return abyssRewardOptions(data, run, nodeId, findNode(run.map, nodeId)?.type);
  const owners = new Set(run.selected);
  const pool = [...data.cards.values()].filter(
    (c) => c.pool === 'reward' && !c.essential && (owners.has(c.owner) || !data.characters.has(c.owner)),
  );
  const nodeType = findNode(run.map, nodeId)?.type;
  const weights = data.balance.rewards.rarityWeights[nodeType === 'elite' || nodeType === 'boss' ? nodeType : 'battle'];
  const rng = createRng(run.seed).fork(`reward:${run.stageId}:${nodeId}`);
  const left = rng.shuffle([...pool]);
  const picked: string[] = [];
  while (picked.length < data.balance.rewards.cardChoices && left.length) {
    const tiers = (Object.entries(weights) as [string, number][]).filter(([r, w]) => w > 0 && left.some((c) => c.rarity === r));
    // 가중치 있는 등급이 바닥나면 남은 카드에서 아무거나
    const tier = tiers.length ? rng.weighted(tiers, ([, w]) => w)![0] : left[0].rarity;
    const i = left.findIndex((c) => c.rarity === tier);
    picked.push(left.splice(i, 1)[0].id);
  }
  return picked;
}

// ───────────────────────── 레벨 ─────────────────────────

/** 다음 레벨까지 필요한 경험치(최대 레벨이면 null) */
export function xpToNext(data: GameData, level: number): number | null {
  const lv = data.balance.leveling;
  return level >= lv.maxLevel ? null : lv.toNext[level - 1] ?? lv.toNext[lv.toNext.length - 1];
}

/**
 * 경험치를 더하고 레벨을 올린다. 레벨마다 최대 체력 +hpPerLevel(그만큼 회복), upgradeEvery 레벨마다 고를 강화 1장.
 * 레벨업 소식은 run.levelLog에 쌓인다
 */
export function gainXp(data: GameData, run: RunState, id: string, amount: number): void {
  const r = run.roster.find((x) => x.id === id);
  const def = data.characters.get(id);
  if (!r || !def || amount <= 0) return;
  const lv = data.balance.leveling;
  r.xp += amount;
  const from = r.level;
  let need = xpToNext(data, r.level);
  while (need !== null && r.xp >= need) {
    r.xp -= need;
    r.level += 1;
    r.maxHp += def.hpPerLevel;
    r.hp = Math.min(r.maxHp, r.hp + def.hpPerLevel);
    if (r.level % lv.upgradeEvery === 0) run.pendingUpgrades.push(id);
    need = xpToNext(data, r.level);
  }
  if (need === null) r.xp = 0;
  if (r.level > from) run.levelLog.push({ id, name: def.name, from, to: r.level, hpGain: def.hpPerLevel * (r.level - from) });
}

/** 이긴 전투의 경험치: 출전한 동료는 전부, 쉬는 동료는 restShare만큼(내림) */
export function awardBattleXp(data: GameData, run: RunState, nodeType: string): void {
  const lv = data.balance.leveling;
  const base = nodeType === 'boss' ? lv.xp.boss : nodeType === 'elite' ? lv.xp.elite : lv.xp.battle;
  for (const r of run.roster) {
    if (data.characters.get(r.id)?.role !== 'fighter') continue;
    gainXp(data, run, r.id, run.selected.includes(r.id) ? base : Math.floor(base * lv.restShare));
  }
}

/** 레벨업 강화 후보: 그 동료의 카드 중 강화할 수 있는 것 */
export function levelUpgradeCandidates(data: GameData, run: RunState, member: string): CardInstance[] {
  return upgradeCandidates(data, run, { owner: member });
}

/**
 * 남은 레벨업 강화 하나를 처리한다. uid가 있으면 그 카드, null이면 무작위(봇·중간 시작). 후보가 없으면 건너뛴다
 */
export function applyLevelUpgrade(data: GameData, run: RunState, uid: string | null): string[] {
  const member = run.pendingUpgrades.shift();
  if (!member) return [];
  const pool = levelUpgradeCandidates(data, run, member);
  if (!pool.length) return [];
  run.counter += 1;
  const card = (uid && pool.find((c) => c.uid === uid)) || createRng(run.seed).fork(`levelup:${run.counter}`).pick(pool);
  upgradeCard(data, run, card);
  const def = data.cards.get(card.cardId)!;
  const skill = card.level > data.balance.upgrade.statLevels ? (card.level === 4 ? def.upgrade!.plus4 : def.upgrade!.plus5) : null;
  return [`카드 강화: ${def.name} +${card.level}${skill ? ` — 특수 스킬 「${skill.name}」` : ''}`];
}

// ───────────────────────── 파티 편성 ─────────────────────────

export function setParty(data: GameData, run: RunState, ids: string[]): void {
  const unique = [...new Set(ids)];
  // 순례(클리어 뒤 자유 여정)에서는 하운도 쉴 수 있다 — 네 명 중 마음대로(2026-10-11 사용자 요청)
  if (!unique.includes('haun') && !run.replayOf) throw new Error('하운은 항상 출전한다');
  if (!unique.length) throw new Error('한 명은 출전해야 한다');
  const max = isAbyss(run) ? data.balance.abyss.partyMax : data.balance.party.max;
  if (unique.length > max) throw new Error(`출전은 최대 ${max}명`);
  for (const id of unique) {
    if (!run.roster.some((r) => r.id === id)) throw new Error(`합류하지 않은 동료: ${id}`);
    if (data.characters.get(id)?.role !== 'fighter') throw new Error(`전투에 나설 수 없는 캐릭터: ${id}`);
  }
  run.selected = unique;
}

// ───────────────────────── 이벤트·휴식 선택지 ─────────────────────────

export interface ChoiceView {
  label: string;
  effects: Effect[];
  result?: string;
  source: 'module' | 'support';
  /** 확률 결과(하나가 시드 RNG로 정해진다) */
  outcomes?: { weight: number; effects: Effect[]; result: string }[];
  /** 고를 수 없는 까닭(골드 부족 등). 있으면 흐리게 보인다 */
  disabled?: string;
  /** 심연 휴식 '쉬고 버리기'(굽이마다 횟수 제한) */
  restDiscard?: true;
}

export function choicesFor(data: GameData, run: RunState, module: ModuleDef): ChoiceView[] {
  const list: ChoiceView[] = (module.content.choices ?? [])
    .filter((c) => !c.condition?.partyHas || run.selected.includes(c.condition.partyHas))
    .filter((c) => !c.condition?.partyLacks || !run.roster.some((r) => r.id === c.condition!.partyLacks))
    .filter((c) => !c.condition?.flag || run.flags.includes(c.condition.flag))
    .map((c) => ({
      label: c.label,
      effects: c.effects,
      result: c.result,
      outcomes: c.outcomes,
      source: 'module' as const,
      disabled: c.condition?.goldGte !== undefined && run.gold < c.condition.goldGte ? `골드 ${c.condition.goldGte} 필요` : undefined,
    }));
  // 심연의 휴식: 쉬고 버리기(쉬기와 함께 카드 1장, 굽이마다 restDiscards번), 부상이 있으면 치료(GAME_DESIGN 16절)
  if (module.type === 'rest' && isAbyss(run)) {
    const ab = run.abyss!;
    const rest = list.find((c) => c.effects.some((e) => e.op === 'heal_party'));
    const used = ab.restDiscard?.depth === ab.depth ? ab.restDiscard.used : 0;
    const limit = data.balance.abyss.restDiscards;
    if (limit > 0)
      list.push({
        label: '쉬고 버리기 — 쉬고, 덱에서 카드 한 장을 뺀다(굽이마다 한 번)',
        effects: [...(rest?.effects ?? []), { op: 'remove_card', choose: true }],
        result: '쉬면서 짐을 덜었다.',
        source: 'module',
        restDiscard: true,
        disabled: used >= limit ? '이번 굽이에 이미 버렸다' : run.deck.length <= 1 ? '덱이 너무 적다' : undefined,
      });
    if (Object.keys(run.abyss!.injuries).length) list.push({ label: '치료 — 부상을 모두 고친다', effects: [{ op: 'cure_injury' }], result: '상처를 싸맸다.', source: 'module' });
  }
  // 상흔이 restAt 이상이면 휴식 회복이 준다(applyChoice) — 고르기 전에 보이게
  if (module.type === 'rest' && run.scar >= data.balance.rift.scar.restAt) {
    const pct = Math.round((1 - data.balance.rift.scar.restHealMul) * 100);
    for (const c of list) if (c.effects.some((e) => e.op === 'heal_party')) c.label += ` (상흔 ${data.balance.rift.scar.restAt}+: 회복 -${pct}%)`;
  }
  // 꿰매기: 상흔을 덜어 낸다(GAME_DESIGN 7절 — 캠페인·심연 모두, 상흔이 있으면 휴식마다)
  if (module.type === 'rest' && run.scar > 0) {
    const sc = data.balance.rift.scar;
    list.push({
      label: `꿰매기 — 상흔 -${sc.stitch}, 골드 ${sc.stitchGold}`,
      effects: [{ op: 'scar', amount: -sc.stitch }, { op: 'gain_gold', amount: -sc.stitchGold }],
      result: '하늘의 금을 몇 땀 꿰맸다.',
      source: 'module',
      disabled: run.gold < sc.stitchGold ? `골드 ${sc.stitchGold} 필요` : undefined,
    });
  }
  if (module.type === 'rest' && run.supportActive) {
    for (const rule of data.support.filter((r) => r.trigger === 'restOption')) {
      list.push({ label: `[왕일검] ${rule.name}`, effects: rule.effects, result: rule.description, source: 'support' });
    }
  }
  return list;
}

/** pick: 선택지에 고르는 강화(upgrade_card choose)가 있으면 사람이 고른 카드 uid. 휴식 노드면 rest 유물이 뒤따른다 */
/** gains: 얻고 잃은 것을 모을 목록(화면용, RunGain) */
export function applyChoice(data: GameData, run: RunState, module: ModuleDef, index: number, pick?: string, gains?: RunGain[]): string[] {
  const choice = choicesFor(data, run, module)[index];
  if (!choice) throw new Error('없는 선택지');
  if (choice.disabled) throw new Error(`고를 수 없는 선택지: ${choice.disabled}`);
  // 굽이의 법칙 '무거운 발': 휴식의 회복이 줄어든다. 상흔이 restAt 이상이면 금 간 하늘 아래서 덜 쉬어진다
  const sc = data.balance.rift.scar;
  const healMul = module.type === 'rest' ? lawRunMul(data, run, 'restHealMul') * (run.scar >= sc.restAt ? sc.restHealMul : 1) : 1;
  const effects = healMul === 1 ? choice.effects : choice.effects.map((e) => (e.op === 'heal_party' ? { ...e, ratio: e.ratio !== undefined ? e.ratio * healMul : undefined, amount: e.amount !== undefined ? Math.floor(e.amount * healMul) : undefined } : e));
  const out = applyRunOps(data, run, effects, { pick, gains });
  // 확률 결과: 노드마다 정해진 수열로 하나를 고른다(같은 시드면 같은 결과)
  if (choice.outcomes?.length) {
    const o = createRng(run.seed).fork(`outcome:${run.stageId}:${run.position}:${module.id}`).weighted(choice.outcomes, (x) => x.weight)!;
    out.unshift(o.result);
    out.push(...applyRunOps(data, run, o.effects, { pick, gains }));
  }
  if (choice.restDiscard) {
    const ab = run.abyss!;
    ab.restDiscard = { depth: ab.depth, used: (ab.restDiscard?.depth === ab.depth ? ab.restDiscard.used : 0) + 1 };
  }
  if (module.type === 'rest') out.push(...fireRunRelics(data, run, 'rest'));
  if (isAbyss(run)) trackChoice(data, run, module, [...new Set(choice.effects.map((e) => e.op))]);
  return out;
}

/** 지금 굽이의 법칙들(과 서약)이 거는 런 배율(휴식 회복·골드). 없으면 1 */
export function lawRunMul(data: GameData, run: RunState, key: 'restHealMul' | 'goldMul'): number {
  const oath = key === 'restHealMul' && run.abyss ? (runOath(data, run).restHealMul ?? 1) : 1;
  return (run.abyss?.laws ?? []).reduce((m, id) => m * (data.laws.get(id)?.run[key] ?? 1), oath);
}

/** 선택지가 보유 카드 한 장을 사람에게 고르게 하는가(카드 바꾸기·팔기: pick은 카드 id) */
export function choiceCardPick(choice: { effects: Effect[] }): Effect | undefined {
  return choice.effects.find((e) => (e.op === 'swap_card' || e.op === 'sell_card') && e.choose);
}

/** 선택지가 강화할 카드를 사람에게 고르게 하는가 */
export function choiceNeedsPick(choice: { effects: Effect[] }): Effect | undefined {
  return choice.effects.find((e) => e.op === 'upgrade_card' && e.choose);
}

/** 선택지가 덱에서 뺄 카드를 사람에게 고르게 하는가(pick은 카드 uid) */
export function choiceRemovePick(choice: { effects: Effect[] }): Effect | undefined {
  return choice.effects.find((e) => e.op === 'remove_card' && e.choose);
}

/**
 * 심연: 전투 보상을 넘어갈 때 받는 것(balance.abyss.skipReward). gold — 골드, remove — 고른 카드(pick) 한 장을 덱에서 뺀다.
 * 캠페인은 아무것도 없다(얻은 카드는 보유로 남으니 넘어갈 이유가 적다)
 */
export function skipReward(data: GameData, run: RunState, kind: 'gold' | 'remove', pick?: string): string[] {
  if (!isAbyss(run)) return [];
  const cfg = data.balance.abyss.skipReward;
  if (kind === 'gold') return cfg.gold ? applyRunOps(data, run, [{ op: 'gain_gold', amount: cfg.gold }]) : [];
  if (!cfg.remove || !pick) return [];
  return applyRunOps(data, run, [{ op: 'remove_card', choose: true }], { pick });
}

/** 덱에서 뺄 수 있는 카드(filter에 맞음) */
export function removeCandidates(data: GameData, run: RunState, filter?: Effect['filter']): CardInstance[] {
  return run.deck.filter((c) => matchesFilter(data, c, filter));
}

/** 카드 한 장 강화: 캠페인은 보유 카드 종류에(같은 카드 모두), 심연은 그 한 장만 */
function upgradeCard(data: GameData, run: RunState, c: CardInstance): void {
  if (isAbyss(run)) c.level = Math.min(data.balance.upgrade.maxLevel, c.level + 1);
  else upgradeOwned(data, run, c.cardId);
}

/** 강화할 수 있는 카드(강화 정의가 있고 최대 단계 미만, filter에 맞음) */
export function upgradeCandidates(data: GameData, run: RunState, filter?: Effect['filter']): CardInstance[] {
  return run.deck.filter(
    (c) => !!data.cards.get(c.cardId)!.upgrade && c.level < data.balance.upgrade.maxLevel && matchesFilter(data, c, filter),
  );
}

function matchesFilter(data: GameData, card: CardInstance, filter: Effect['filter']): boolean {
  const def = data.cards.get(card.cardId)!;
  if (!filter) return true;
  if (filter.pool !== undefined && def.pool !== filter.pool) return false;
  if (filter.owner !== undefined && def.owner !== filter.owner) return false;
  if (filter.costNeigongGte !== undefined && def.cost.neigong < filter.costNeigongGte) return false;
  return true;
}

/** 런 단위 동작 해석. 결과 메시지 목록을 돌려준다. opts.pick: 고르는 강화에서 사람이 고른 카드 uid */
/**
 * 화면용(2026-10-21 #1374): 효과 묶음이 얻고 잃은 것. 문자열 메시지(msg)와 짝을 이뤄, 결과 화면이 칩 대신 유물·카드·물약을 실물로,
 * 체력은 동료별 숫자로 보인다
 */
export type RunGain =
  | { kind: 'relic' | 'card' | 'potion'; id: string; msg: string }
  | { kind: 'hp'; msg: string; members: { id: string; before: number; after: number; max: number }[] };

/** opts.gains: 얻고 잃은 것을 이 목록에 모은다(화면용, 결과는 같다) */
export function applyRunOps(data: GameData, run: RunState, effects: Effect[], opts: { pick?: string; gains?: RunGain[] } = {}): string[] {
  const out: string[] = [];
  const note = (g: RunGain) => opts.gains?.push(g);
  /** 카드를 얻는 메시지면 화면에 카드로(한정·고유로 못 얻었으면 글만) */
  const cardMsg = (id: string, msg: string) => {
    if (msg.startsWith('카드 획득')) note({ kind: 'card', id, msg });
    return msg;
  };
  for (const e of effects) {
    run.counter += 1;
    const rng = createRng(run.seed).fork(`ops:${run.stageId}:${run.position}:${run.counter}`);
    switch (e.op) {
      case 'gain_potion_slot':
        // 물약 칸 하나 더(빈 칸)
        for (let i = 0; i < (e.amount ?? 1); i++) run.potions.push(null);
        out.push(`물약 칸 +${e.amount ?? 1}`);
        break;
      case 'gain_random_card': {
        if (isAbyss(run)) {
          // 심연: 풀(합류 동료·공용) 중 등급이 맞는 것
          const owners = new Set([...run.roster.map((r) => r.id), COMMON]);
          const pool = Object.keys(run.abyss!.pool)
            .map((id) => data.cards.get(id)!)
            .filter((d) => owners.has(ownerKey(data, d)) && (!e.rarity || (e.rarity as string[]).includes(d.rarity)) && !(d.type === 'power' && runOath(data, run).noPowers));
          for (let i = 0; i < (e.count ?? 1) && pool.length; i++) {
            const id = rng.pick(pool).id;
            out.push(cardMsg(id, abyssAddCard(data, run, id)));
          }
          break;
        }
        // 합류한 동료·공용의 보상 카드 중 등급이 맞는 것(없는 카드 우선)
        const owners = new Set([...run.roster.map((r) => r.id), 'common']);
        const all = [...data.cards.values()].filter(
          (d) => d.pool === 'reward' && !d.essential && owners.has(d.owner) && (!e.rarity || (e.rarity as string[]).includes(d.rarity)),
        );
        const fresh = all.filter((d) => run.collection[d.id] === undefined);
        for (let i = 0; i < (e.count ?? 1); i++) {
          const pool = fresh.length ? fresh : all;
          if (!pool.length) break;
          const d = rng.pick(pool);
          fresh.splice(fresh.indexOf(d), 1);
          out.push(cardMsg(d.id, acquireCard(data, run, d.id)));
        }
        break;
      }
      case 'swap_card':
      case 'sell_card': {
        if (isAbyss(run)) {
          // 심연: 덱의 카드 한 장(고른 카드 id, 없으면 가장 값싼 카드). 바꾸기는 같은 주인의 풀 카드로
          const rank: Record<string, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, special: 0 };
          const deck = run.deck.filter((c) => data.cards.get(c.cardId)!.type !== 'status');
          const c = (opts.pick ? deck.find((x) => x.cardId === opts.pick || x.uid === opts.pick) : undefined) ??
            [...deck].sort((a, b) => rank[data.cards.get(a.cardId)!.rarity] - rank[data.cards.get(b.cardId)!.rarity] || a.level - b.level || a.uid.localeCompare(b.uid))[0];
          if (!c) break;
          const def = data.cards.get(c.cardId)!;
          run.deck = run.deck.filter((x) => x.uid !== c.uid);
          if (e.op === 'swap_card') {
            const owner = ownerKey(data, def);
            const pool = Object.keys(run.abyss!.pool).filter(
              (id) => id !== c.cardId && ownerKey(data, data.cards.get(id)!) === owner && !(data.cards.get(id)!.type === 'power' && runOath(data, run).noPowers),
            );
            if (pool.length) {
              const to = rng.pick(pool);
              abyssAddCard(data, run, to);
              out.push(`카드 바꾸기: ${def.name} → ${data.cards.get(to)!.name}`);
            } else run.deck.push(c);
          } else {
            run.gold += e.amount ?? 0;
            out.push(`카드를 넘겼다: ${def.name} — 골드 +${e.amount ?? 0}`);
          }
          break;
        }
        // 보유 카드 한 장(고른 카드 id, 없으면 가장 값싼 카드): 바꾸기는 같은 주인의 다른 카드로, 팔기는 골드 amount
        const can = swappableCards(data, run);
        const rank: Record<string, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, special: 0 };
        const id =
          (opts.pick && can.includes(opts.pick) ? opts.pick : undefined) ??
          [...can].sort((a, b) => rank[data.cards.get(a)!.rarity] - rank[data.cards.get(b)!.rarity] || (run.collection[a] ?? 0) - (run.collection[b] ?? 0) || a.localeCompare(b))[0];
        if (!id) break;
        const name = data.cards.get(id)!.name;
        if (e.op === 'swap_card') {
          const r = swapCard(data, run, id, (pool) => rng.pick(pool));
          if (r) out.push(`카드 바꾸기: ${name} → ${data.cards.get(r.to)!.name}`);
        } else {
          delete run.collection[id];
          for (const key of Object.keys(run.loadout)) run.loadout[key] = run.loadout[key].filter((x) => x !== id);
          run.deck = run.deck.filter((c) => c.cardId !== id);
          run.stageGains = run.stageGains.filter((x) => x !== id);
          run.gold += e.amount ?? 0;
          out.push(`카드를 넘겼다: ${name} — 골드 +${e.amount ?? 0}`);
        }
        break;
      }
      case 'gain_card': {
        const def = data.cards.get(e.card ?? '');
        if (!def) throw new Error(`gain_card: 알 수 없는 카드 ${e.card}`);
        for (let i = 0; i < (e.count ?? 1); i++) out.push(cardMsg(def.id, addCard(data, run, def.id)));
        break;
      }
      case 'remove_card': {
        // 이번 스테이지 덱에서만 뺀다(보유 카드는 그대로, GAME_DESIGN 9-1)
        // count장(틈의 메아리: 동료 시작 카드 4장). 고르는 버리기(심연 휴식·틈의 거래)는 사람이 고른 카드 uid, 아니면 무작위
        for (let i = 0; i < (e.count ?? 1); i++) {
          const pool = run.deck.filter((c) => matchesFilter(data, c, e.filter));
          if (!pool.length) break;
          const c = (e.choose && opts.pick ? pool.find((x) => x.uid === opts.pick) : undefined) ?? rng.pick(pool);
          run.deck = run.deck.filter((x) => x.uid !== c.uid);
          out.push(`카드 제거: ${data.cards.get(c.cardId)!.name}`);
        }
        break;
      }
      case 'upgrade_card': {
        // 한 번에 한 단계씩(+1). 고르는 강화는 사람이 고른 카드, 아니면 무작위
        const pool = upgradeCandidates(data, run, e.filter);
        const chosen = e.choose && opts.pick ? pool.filter((c) => c.uid === opts.pick) : rng.shuffle([...pool]).slice(0, e.count ?? 1);
        for (const c of chosen) {
          upgradeCard(data, run, c);
          const def = data.cards.get(c.cardId)!;
          const skill = c.level > data.balance.upgrade.statLevels ? (c.level === 4 ? def.upgrade!.plus4 : def.upgrade!.plus5) : null;
          out.push(`카드 강화: ${def.name} +${c.level}${skill ? ` — 특수 스킬 「${skill.name}」` : ''}`);
        }
        break;
      }
      case 'heal_party': {
        const members: { id: string; before: number; after: number; max: number }[] = [];
        for (const r of run.roster.filter((x) => run.selected.includes(x.id))) {
          const amount = e.ratio !== undefined ? Math.floor(r.maxHp * e.ratio) : (e.amount ?? 0);
          const before = r.hp;
          // 음수면 체력 손실(이벤트로는 쓰러지지 않는다: 최소 1)
          r.hp = Math.max(Math.min(r.hp, 1), Math.min(r.maxHp, r.hp + amount));
          members.push({ id: r.id, before, after: r.hp, max: r.maxHp });
        }
        // 손실이면 '회복'이라 하지 않는다(2026-10-21 #1374 — 피 묻은 약장수의 체력 -160이 '출전 동료 회복'으로 보였다)
        const lose = (e.ratio ?? e.amount ?? 0) < 0;
        const msg = lose ? `출전 동료 체력 ${e.amount !== undefined ? e.amount : `-${Math.round(-(e.ratio ?? 0) * 100)}%`}` : '출전 동료 회복';
        out.push(msg);
        note({ kind: 'hp', msg, members });
        break;
      }
      case 'gain_run_mana':
        run.mana = Math.max(0, Math.min(data.balance.mana.max, run.mana + (e.amount ?? 0)));
        out.push(`마나 ${e.amount! >= 0 ? '+' : ''}${e.amount}`);
        break;
      case 'scar':
        run.scar = Math.max(0, run.scar + (e.amount ?? 0));
        out.push((e.amount ?? 0) <= -99 ? '상흔을 모두 지웠다' : `상흔 ${e.amount}`);
        break;
      case 'gain_abyss_card':
        if (isAbyss(run)) {
          let picked = '';
          const msg = gainAbyssCard(data, run, (pool) => {
            const d = rng.pick(pool);
            picked = d.id;
            return d;
          });
          out.push(picked ? cardMsg(picked, msg) : msg);
        }
        break;
      case 'reveal_unseen_card':
        if (isAbyss(run)) out.push(revealUnseenCard(data, run, (pool) => rng.pick(pool)));
        break;
      case 'injure': {
        const msg = isAbyss(run) ? injure(data, run, (ids) => rng.pick(ids)) : null;
        out.push(msg ?? '다친 사람은 없다');
        break;
      }
      case 'cure_injury':
        out.push(...cureInjuries(data, run));
        break;
      case 'set_flag':
        if (e.flag && !run.flags.includes(e.flag)) run.flags.push(e.flag);
        break;
      case 'join_party': {
        const def = data.characters.get(e.member ?? '');
        if (!def) throw new Error(`join_party: 알 수 없는 캐릭터 ${e.member}`);
        if (run.roster.some((r) => r.id === def.id)) break;
        // 하드코어로 잃은 동료는 다시 합류하지 않는다
        if (run.fallen.includes(def.id)) {
          out.push(`${def.name}의 자리는 비어 있다`);
          break;
        }
        if (isAbyss(run) && def.role === 'fighter') {
          // 심연 '구원': 하운 레벨 -1로 합류, 시작 카드(abyss.starters.mate장)가 덱에, 모두 출전
          const level = Math.max(1, (run.roster.find((r) => r.id === 'haun')?.level ?? 1) - 1);
          const maxHp = def.maxHp + def.hpPerLevel * (level - 1);
          run.roster.push({ id: def.id, hp: maxHp, maxHp, level, xp: 0 });
          run.selected.push(def.id);
          run.abyss!.mates.push(def.id);
          for (const id of abyssStarters(data, def.id, data.balance.abyss.starters.mate, !!runOath(data, run).noPowers)) out.push(abyssAddCard(data, run, id));
          out.push(`${def.name} 합류`);
          break;
        }
        if (def.role === 'support') {
          run.supportActive = true;
          if (!run.flags.includes(`support:${def.id}`)) run.flags.push(`support:${def.id}`);
        } else {
          // 동료는 하운 레벨 -1로 합류한다(늦게 온 동료가 너무 뒤처지지 않게)
          const level = Math.max(1, (run.roster.find((r) => r.id === 'haun')?.level ?? 1) - 1);
          const maxHp = def.maxHp + def.hpPerLevel * (level - 1);
          run.roster.push({ id: def.id, hp: maxHp, maxHp, level, xp: 0 });
          // 시작 카드 10장을 받고 추천 편성으로 바로 덱에(GAME_DESIGN 9-1)
          joinMidStage(data, run, def.id);
          if (run.selected.length < data.balance.party.max) run.selected.push(def.id);
        }
        out.push(`${def.name} 합류`);
        break;
      }
      case 'leave_party': {
        // 떠난 동료의 상태를 남겨 두었다가 캠페인을 마치면 그대로 돌려놓는다(restoreParty)
        const gone = run.roster.find((r) => r.id === e.member);
        if (gone && !isAbyss(run)) run.departed = [...(run.departed ?? []).filter((r) => r.id !== gone.id), structuredClone(gone)];
        run.roster = run.roster.filter((r) => r.id !== e.member);
        run.selected = run.selected.filter((id) => id !== e.member);
        // 빈자리는 남은 동료로 채운다(S5: 보른·카일이 남으면 하운+엘리아)
        for (const r of run.roster) {
          if (run.selected.length >= data.balance.party.max) break;
          if (!run.selected.includes(r.id) && data.characters.get(r.id)?.role === 'fighter') run.selected.push(r.id);
        }
        out.push(`${data.characters.get(e.member ?? '')?.name ?? e.member} 이탈`);
        break;
      }
      case 'gain_gold':
        run.gold = Math.max(0, run.gold + (e.amount ?? 0));
        out.push((e.amount ?? 0) <= -9999 ? '골드를 모두 냈다' : `골드 ${e.amount! >= 0 ? '+' : ''}${e.amount}`);
        break;
      case 'gain_max_hp':
        // 전투에 나서는 동료 모두(합류한 동료 전부)의 최대 체력과 체력
        for (const r of run.roster.filter((x) => data.characters.get(x.id)?.role === 'fighter')) {
          r.maxHp = Math.max(1, r.maxHp + (e.amount ?? 0));
          r.hp = Math.max(1, Math.min(r.maxHp, r.hp + (e.amount ?? 0)));
        }
        out.push(`동료 모두 최대 체력 ${e.amount! >= 0 ? '+' : ''}${e.amount}`);
        break;
      case 'gain_relic': {
        // relic이 없으면 가지지 않은 유물 중 무작위(영웅·전설 제외 — rarity가 있으면 그 등급만. 심연 전용은 심연에서만)
        let id = e.relic;
        if (!id) {
          const pool = [...data.relics.values()].filter(
            (r) =>
              relicAllowed(run, r) &&
              !run.relics.includes(r.id) &&
              (e.rarity ? (e.rarity as string[]).includes(r.rarity) : r.rarity !== 'epic' && r.rarity !== 'legendary'),
          );
          id = pool.length ? rng.pick(pool).id : undefined;
        }
        if (id) {
          const had = run.relics.includes(id);
          const msgs = gainRelic(data, run, id);
          if (!had && msgs.length) note({ kind: 'relic', id, msg: msgs[0] });
          out.push(...msgs);
        }
        else {
          run.gold += 50;
          out.push('더 얻을 유물이 없다 — 골드 +50');
        }
        break;
      }
      case 'gain_potion': {
        const def = data.potions.get(e.potion ?? '');
        if (!def) throw new Error(`gain_potion: 알 수 없는 물약 ${e.potion}`);
        if (gainPotion(data, run, def.id)) {
          out.push(`물약 획득: ${def.name}`);
          note({ kind: 'potion', id: def.id, msg: `물약 획득: ${def.name}` });
        } else out.push(`물약 칸이 가득해 ${def.name}을(를) 두고 왔다`);
        break;
      }
      default:
        throw new Error(`전투 동작 "${e.op}"은 런 단위에서 쓸 수 없다`);
    }
  }
  // 심연 업적 셈(가장 많았던 골드·상흔, 덱의 틈의 카드)
  if (run.abyss) trackTick(data, run);
  return out;
}

/** 어려움 배율(스테이지별, 없으면 1) */
/**
 * 순례 일행 보정(GAME_DESIGN 2절, 2026-10-12 보정식 세 항): 클리어한 일행으로 다시 걷는 길(replayOf)만. 그 밖에는 1.
 * 1 + max(0, 하운 레벨 − 기준 레벨) × 레벨당 + 유물 수 × relicPct + 출발 편성 평균 강화 × upgradePct, 상한 maxHp·maxDmg(어려움 배율에 곱한다).
 * 출발 편성을 정하면(setLoadout) run.pilgrimScale에 고정한다 — 길에서 레벨·유물·강화가 늘어도 그 길의 적은 그대로
 */
export function pilgrimScale(data: GameData, run: Pick<RunState, 'replayOf' | 'roster' | 'relics' | 'stageId' | 'loadout' | 'collection'> & { pilgrimScale?: PilgrimScale }): PilgrimScale {
  if (!run.replayOf) return { hp: 1, dmg: 1, level: 0, relics: 0, upgrade: 0 };
  if (run.pilgrimScale) return run.pilgrimScale;
  return measurePilgrimScale(data, run);
}

export function hardMul(data: GameData, stageId: string): { hp: number; dmg: number } {
  return data.balance.difficulty.hard.byStage[stageId] ?? { hp: 1, dmg: 1 };
}

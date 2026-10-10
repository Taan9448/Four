// 심연(深淵, GAME_DESIGN 16절): 스토리를 마친 뒤 열리는 끝없는 로그라이크 드래프트 런.
// 굽이(지도 하나)마다 세계·보스가 시드로 정해지고, 캠페인의 모듈·적·배경·마나 규칙을 그대로 쓴다.
// 보상 풀은 이 저장 칸의 보유 카드 + 도감에 기록된 카드(본 적 있는 카드)와 열린 틈의 카드. 얻은 카드는 덱에만 들어간다(보유 목록과 무관).
import type { GameData } from './data';
import type { AchievementDef, CardDef, ModuleDef, OathMods, StageDef, World } from './schema';
import { createRng } from './rng';
import { generateStageMap, type MapNode } from './route';
import type { EnemyMod } from './effects';
import type { CardInstance } from './state';
import { createRun, emptyStats, gainRelic, type RunState } from './run';
import { COMMON, ownerKey } from './collection';

export interface AbyssState {
  /** 사람이 보는 시드(굽이마다 run.seed는 이 시드에 굽이 번호를 붙인 것) */
  baseSeed: string;
  /** 지금 굽이(1부터) */
  depth: number;
  world: World;
  /** 이번 굽이의 보스 모듈 */
  boss: string;
  /** 지나온 굽이(지금 굽이 포함) */
  loops: { depth: number; world: World; boss: string; stageId: string; laws?: string[]; pinned?: { floor: number; module: string }[] }[];
  /** 지금 굽이의 법칙(data/abyss_laws.json) */
  laws?: string[];
  /** 지금까지 나온 틈의 짐승(상흔 beastEvery마다 하나) */
  beasts?: number;
  /** 시작할 때 고른 동료(하운 제외)와 길(시작 유물) */
  mates: string[];
  paths: string[];
  /** 심연 풀: 카드 id → 시작 강화 단계(보유 카드는 캠페인 단계, 도감에만 있으면 0) */
  pool: Record<string, number>;
  /** 열린 틈의 카드 */
  unlocked: string[];
  /** 이번 런에서 처음 본 카드(틈의 거래 '본 적 없는 카드 보기') */
  revealed: string[];
  bosses: number;
  elites: number;
  /** 상점 카드 지우기를 쓴 횟수(쓸수록 비싸진다) */
  removals: number;
  /** 휴식 '쉬고 버리기'를 쓴 굽이와 그 굽이에서 쓴 횟수(굽이마다 restDiscards번) */
  restDiscard?: { depth: number; used: number };
  /** 부상: 동료 id → 줄어든 최대 체력(다음 굽이에 돌아온다) */
  injuries: Record<string, number>;
  /** 3차: 서약 단계(0~15), 일일 심연이면 날짜(yyyymmdd)와 그날 모든 굽이에 붙는 법칙 */
  oath?: number;
  daily?: string;
  dailyLaws?: string[];
  /** 업적 셈(이 런 안에서) */
  track?: AbyssTrack;
}

/** 업적(data/abyss_achievements.json)을 재는 런 안의 셈 */
export interface AbyssTrack {
  startMates: number;
  nemesisKills: number;
  beastKills: number;
  affixKills: number;
  trades: number;
  /** 상흔이 가장 높았을 때 쓰러뜨린 굽이 보스(그때 상흔), 하운 체력 비율이 가장 낮았을 때 쓰러뜨린 굽이 보스(그때 비율) */
  bossScarMax: number;
  bossLowHp: number;
  /** 한 전투에서 터뜨린 결 노출의 최대 */
  grainBattleMax: number;
  /** 심법 카드를 낸 적이 있다 / 그 전까지 넘은 굽이 */
  powerPlayed: boolean;
  noPowerDepth: number;
  /** 고른 선택지의 "모듈:동작" */
  choiceOps: string[];
  /** 넘은 굽이의 세계, 넘은 굽이에 걸렸던 법칙 수의 최대, 굽이를 넘을 때 부상 동료 수의 최대 */
  worlds: World[];
  lawsClearMax: number;
  injuredClearMax: number;
  /** 굽이를 넘을 때 덱 장수(굽이 번호 → 장수) */
  deckAtClear: Record<string, number>;
  riftInDeckMax: number;
  maxGold: number;
  maxScar: number;
  /** 상흔 0으로 넘은 가장 깊은 굽이 */
  scarZeroDepth: number;
}

export function emptyTrack(startMates: number): AbyssTrack {
  return {
    startMates,
    nemesisKills: 0,
    beastKills: 0,
    affixKills: 0,
    trades: 0,
    bossScarMax: 0,
    bossLowHp: 1,
    grainBattleMax: 0,
    powerPlayed: false,
    noPowerDepth: 0,
    choiceOps: [],
    worlds: [],
    lawsClearMax: 0,
    injuredClearMax: 0,
    deckAtClear: {},
    riftInDeckMax: 0,
    maxGold: 0,
    maxScar: 0,
    scarZeroDepth: 0,
  };
}

export const isAbyss = (run: Pick<RunState, 'mode'>): boolean => run.mode === 'abyss';

/** 굽이마다 다른 시드(전투·보상·상점·사건의 수열이 굽이끼리 겹치지 않게) */
export const loopSeed = (base: string, depth: number) => `${base}~d${depth}`;

/** 심연의 길(시작 유물) 전체 */
export const abyssPaths = (data: GameData) => [...data.relics.values()].filter((r) => r.rarity === 'path');

/** 시드로 길 후보 balance.abyss.pathOffer개(열린 길 중에서. 생략하면 전부) */
export function pathOffer(data: GameData, seed: string, unlocked?: string[]): string[] {
  const rng = createRng(seed).fork('abyss:paths');
  return rng
    .shuffle(abyssPaths(data).map((r) => r.id).filter((id) => !unlocked || unlocked.includes(id)))
    .slice(0, data.balance.abyss.pathOffer);
}

// ───────── 서약·해금·일일(3차) ─────────

/** 서약 단계까지의 규칙(같은 키는 높은 단계가 이긴다) */
export function oathMods(data: GameData, level: number): OathMods {
  const out: OathMods = {};
  for (const o of data.oaths) if (o.level <= level) Object.assign(out, o.mods);
  return out;
}

/** 이 런의 서약 규칙 */
export const runOath = (data: GameData, run: Pick<RunState, 'abyss'>): OathMods => oathMods(data, run.abyss?.oath ?? 0);

/**
 * 고를 수 있는 가장 높은 서약: 넘은 굽이 - depthOffset(5굽이 → 3단계), 또는 서약 L로 stepDepth굽이를 넘었으면 L+1.
 * oathCleared: stepDepth굽이를 넘은 가장 높은 서약 단계(없으면 -1)
 */
export function oathMax(data: GameData, bestCleared: number, oathCleared = -1): number {
  const cfg = data.balance.abyss.oath;
  return Math.max(0, Math.min(data.oaths.length, Math.max(bestCleared - cfg.depthOffset, oathCleared + 1)));
}

/** 서약 단계의 점수 배율 */
export const oathScoreMul = (data: GameData, level: number) => data.balance.abyss.oath.scoreMul ** level;

/** 업적이 여는 것(틈의 카드·길) → 그 업적 */
export function unlockSource(data: GameData): Map<string, AchievementDef> {
  const out = new Map<string, AchievementDef>();
  for (const a of data.achievements.values()) for (const id of [a.unlock.card, a.unlock.path]) if (id) out.set(id, a);
  return out;
}

/** 열린 틈의 카드: 업적이 걸리지 않은 것(처음부터) + 이룬 업적이 연 것 */
export function unlockedRift(data: GameData, achieved: readonly string[]): string[] {
  const src = unlockSource(data);
  return riftCards(data)
    .filter((c) => !src.has(c.id) || achieved.includes(src.get(c.id)!.id))
    .map((c) => c.id);
}

/** 열린 길 */
export function unlockedPaths(data: GameData, achieved: readonly string[]): string[] {
  const src = unlockSource(data);
  return abyssPaths(data)
    .filter((r) => !src.has(r.id) || achieved.includes(src.get(r.id)!.id))
    .map((r) => r.id);
}

/** 일일 심연 시드: 그날 날짜(지역 시간) */
export function dailySeed(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `D${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}`;
}

/** 일일 심연의 정해진 것: 동료·길·서약·그날의 법칙(모두 시드로, 해금과 상관없이) */
export function dailyPlan(data: GameData, seed: string): { mates: string[]; paths: string[]; oath: number; laws: string[] } {
  const cfg = data.balance.abyss.daily;
  const rng = createRng(seed).fork('abyss:daily');
  const fighters = [...data.characters.values()].filter((c) => c.role === 'fighter' && c.id !== 'haun').map((c) => c.id);
  const oath = rng.int(cfg.oath[0], cfg.oath[1]);
  const maxMates = oathMods(data, oath).maxMates ?? fighters.length;
  const count = Math.min(maxMates, rng.int(cfg.mates[0], cfg.mates[1]));
  const mates = rng.shuffle([...fighters]).slice(0, count);
  const paths = pathOffer(data, seed).slice(0, pathPicks(data, count).picks);
  const laws = rng.shuffle([...data.laws.keys()]).slice(0, cfg.laws);
  return { mates, paths, oath, laws };
}

/** 동료 수(1~3)에 따른 고를 길 개수와 덤 골드 */
export function pathPicks(data: GameData, mateCount: number): { picks: number; gold: number } {
  return data.balance.abyss.pathPicks[String(mateCount)] ?? { picks: 1, gold: 0 };
}

/** 서약 '닫힌 마음': 심법이 나오지 않는다 */
const oathAllows = (data: GameData, run: Pick<RunState, 'abyss'>, def: CardDef | undefined) => !!def && !(def.type === 'power' && runOath(data, run).noPowers);

/** 심연 보상에 나올 수 있는 카드인가(시작·보상 카드. 이야기·상태·틈의 카드 제외) */
const poolable = (def: CardDef | undefined) => !!def && (def.pool === 'starter' || def.pool === 'reward') && !def.essential;

/**
 * 심연 풀: 시작 카드 ∪ 저장 칸의 보유 카드(강화 단계 그대로) ∪ 도감에 기록된 카드(+0). 도감 기록 단계는 쓰지 않는다
 * (본 적만 있는 카드는 +0, 같은 카드라도 보유한 쪽이 세다 — GAME_DESIGN 16절)
 */
export function abyssPool(data: GameData, collection: Record<string, number>, codexCards: Record<string, number> | string[]): Record<string, number> {
  const out: Record<string, number> = {};
  // 시작 카드는 늘 본 것(어느 저장이든 처음부터 가진다)
  for (const d of data.cards.values()) if (d.pool === 'starter') out[d.id] = 0;
  for (const id of Array.isArray(codexCards) ? codexCards : Object.keys(codexCards)) if (poolable(data.cards.get(id))) out[id] = 0;
  // 가져오는 강화는 importMax(+2)까지: +3 이상은 심연 안 강화로만(2026-10-10, 풀 크기에 따른 난이도 차 줄이기)
  const cap = Math.min(data.balance.abyss.importMax, data.balance.upgrade.maxLevel);
  for (const [id, lv] of Object.entries(collection)) if (poolable(data.cards.get(id))) out[id] = Math.min(lv, cap);
  return out;
}

/** 틈의 카드 전체(1차는 처음부터 모두 열린다) */
export const riftCards = (data: GameData) => [...data.cards.values()].filter((c) => c.pool === 'abyss');

/** 주인별 풀 크기(시작 화면 안내) */
export function poolByOwner(data: GameData, pool: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of Object.keys(pool)) {
    const key = ownerKey(data, data.cards.get(id)!);
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

/** 시작 덱의 한 주인 몫: 그 주인의 시작 카드에서 공격 절반(올림) + 나머지(데이터 순서, 결정적). noPowers면 심법을 뺀다 */
export function abyssStarters(data: GameData, owner: string, n: number, noPowers = false): string[] {
  const all = [...data.cards.values()].filter((d) => d.pool === 'starter' && ownerKey(data, d) === owner && !(noPowers && d.type === 'power'));
  const attacks = all.filter((d) => d.type === 'attack');
  const others = all.filter((d) => d.type !== 'attack');
  const pick = [...attacks.slice(0, Math.ceil(n / 2)), ...others.slice(0, n - Math.min(attacks.length, Math.ceil(n / 2)))];
  for (const d of all) if (pick.length < n && !pick.includes(d)) pick.push(d);
  return pick.slice(0, n).map((d) => d.id);
}

function instance(run: RunState, cardId: string, level: number): CardInstance {
  run.counter += 1;
  return { uid: `c${run.counter}`, cardId, level };
}

export interface AbyssStart {
  /** 하운과 함께 갈 동료(1~3명) */
  mates: string[];
  /** 고른 길(동료 수에 따라 1~2개) */
  paths: string[];
  pool: Record<string, number>;
  /** 열린 틈의 카드(생략하면 전부) */
  unlocked?: string[];
  /** 열린 길(생략하면 전부) */
  unlockedPaths?: string[];
  /** 서약 단계(0~15) */
  oath?: number;
  /** 일일 심연: 날짜와 그날의 법칙 */
  daily?: { date: string; laws: string[] };
}

/** 새 심연 런: 하운 + 동료, 시작 덱, 길(시작 유물), 1굽이 */
export function createAbyssRun(data: GameData, seed: string, start: AbyssStart): RunState {
  const ab = data.balance.abyss;
  const oath = Math.max(0, Math.min(data.oaths.length, start.oath ?? 0));
  const mods = oathMods(data, oath);
  const mates = [...new Set(start.mates)].filter((id) => id !== 'haun' && data.characters.get(id)?.role === 'fighter');
  const mateMax = Math.min(ab.partyMax - 1, mods.maxMates ?? Infinity);
  if (mates.length < 1 || mates.length > mateMax) throw new Error(`심연 동료는 1~${mateMax}명`);
  const picks = pathPicks(data, mates.length);
  const offer = pathOffer(data, seed, start.daily ? undefined : start.unlockedPaths);
  const paths = [...new Set(start.paths)];
  if (paths.length !== picks.picks || !paths.every((p) => offer.includes(p))) throw new Error(`길은 후보 ${offer.join(', ')} 중 ${picks.picks}개`);

  const run = createRun(data, loopSeed(seed, 1));
  run.mode = 'abyss';
  run.collection = {};
  run.loadout = {};
  run.presets = [];
  run.needsLoadout = false;
  run.stageGains = [];
  run.roster = ['haun', ...mates].map((id) => {
    const def = data.characters.get(id)!;
    const max = id === 'haun' && mods.haunMaxHp ? mods.haunMaxHp : def.maxHp;
    return { id, hp: max, maxHp: max, level: 1, xp: 0 };
  });
  run.selected = run.roster.map((r) => r.id);
  run.flags = [];
  run.stats = emptyStats();
  run.gold = (mods.startGold ?? data.balance.economy.startGold) + picks.gold;
  run.scar = mods.startScar ?? 0;
  if (mods.potionSlots !== undefined) run.potions = Array.from({ length: mods.potionSlots }, () => null);
  run.abyss = {
    baseSeed: seed,
    depth: 0,
    world: 'elheim',
    boss: '',
    loops: [],
    mates,
    paths,
    pool: { ...start.pool },
    unlocked: start.unlocked ?? riftCards(data).map((c) => c.id),
    revealed: [],
    bosses: 0,
    elites: 0,
    removals: 0,
    injuries: {},
    laws: [],
    beasts: 0,
    oath,
    daily: start.daily?.date,
    dailyLaws: start.daily?.laws,
    track: emptyTrack(mates.length),
  };
  const level = (id: string) => run.abyss!.pool[id] ?? 0;
  const noPow = !!mods.noPowers;
  run.deck = [
    ...abyssStarters(data, 'haun', ab.starters.haun, noPow),
    ...abyssStarters(data, COMMON, ab.starters.common, noPow),
    ...mates.flatMap((m) => abyssStarters(data, m, ab.starters.mate, noPow)),
  ].map((id) => instance(run, id, level(id)));
  for (const p of paths) gainRelic(data, run, p);
  trackTick(data, run);
  beginLoop(data, run, 1);
  return run;
}

/** 굽이 n의 세계와 보스(시드로). 숙적 굽이(5·10·15…)는 틈 세계의 모르데카이의 잔향 */
export function planLoop(data: GameData, ab: AbyssState, depth: number): { world: World; boss: string; stageId: string; laws: string[] } {
  const cfg = data.balance.abyss;
  const mods = oathMods(data, ab.oath ?? 0);
  const rng = createRng(ab.baseSeed).fork(`abyss:loop:${depth}`);
  const prev = ab.loops[ab.loops.length - 1];
  // 법칙: 굽이 표(서약 '첫 굽이의 법칙'이면 최소 lawsMin) + 일일 심연의 그날 법칙(모든 굽이에)
  const fixed = ab.dailyLaws ?? [];
  const count = Math.max(scheduled(cfg.lawsAt, depth), mods.lawsMin ?? 0);
  const laws = [
    ...fixed,
    ...createRng(ab.baseSeed)
      .fork(`abyss:laws:${depth}`)
      .shuffle([...data.laws.keys()].filter((id) => !fixed.includes(id)))
      .slice(0, count),
  ];
  if (depth % nemesisEvery(data, ab) === 0) return { world: 'rift', boss: cfg.nemesisModule, stageId: rng.pick(cfg.worlds.rift.stages), laws };
  const all = Object.keys(cfg.worlds) as World[];
  let worlds = depth === 1 ? cfg.firstWorlds : all.filter((w) => w !== prev?.world && (w !== 'rift' || depth >= cfg.riftFrom));
  if (!worlds.length) worlds = all;
  const world = rng.pick(worlds);
  const own = cfg.worlds[world].bosses;
  const everyBoss = all.flatMap((w) => cfg.worlds[w].bosses);
  const base = own.length ? own : everyBoss;
  const bosses = base.filter((b) => b !== prev?.boss);
  return { world, boss: rng.pick(bosses.length ? bosses : base), stageId: rng.pick(cfg.worlds[world].stages), laws };
}

/** 숙적 굽이 간격(서약 '가까운 숙적'이면 좁다) */
export const nemesisEvery = (data: GameData, ab: Pick<AbyssState, 'oath'>) => oathMods(data, ab.oath ?? 0).nemesisEvery ?? data.balance.abyss.nemesisEvery;

/** [이 굽이부터, 개수] 표에서 depth의 개수(가장 큰 시작 굽이가 이긴다) */
export function scheduled(table: [number, number][], depth: number): number {
  let n = 0;
  for (const [from, count] of [...table].sort((a, b) => a[0] - b[0])) if (depth >= from) n = count;
  return n;
}

/** 이 모듈이 심연 지도에 나올 수 있는가(세계의 스테이지 모듈·어디서나 사건·심연 모듈) */
export function abyssEligible(data: GameData, world: World, roster: string[], mod: ModuleDef, used: Set<string>): boolean {
  const cfg = data.balance.abyss;
  if (mod.abyss === false || mod.type === 'story' || mod.type === 'boss') return false;
  if (!(cfg.worlds[world].stages.includes(mod.stage) || mod.stage === '*' || mod.stage === 'abyss')) return false;
  if ((mod.once || mod.stage === '*') && used.has(mod.id)) return false;
  // 틈의 거래는 한 지도에 하나
  if (mod.tags.includes('trade') && [...used].some((id) => data.modules.get(id)?.tags.includes('trade'))) return false;
  const c = mod.conditions;
  if (c.flag !== undefined) return false;
  if (c.partyHas !== undefined && !roster.includes(c.partyHas)) return false;
  // 동료 합류·이탈 사건은 이야기라 뺀다
  const ops = (mod.content.choices ?? []).flatMap((ch) => ch.effects.map((e) => e.op));
  if (ops.includes('join_party') || ops.includes('leave_party')) return false;
  return true;
}

/** 굽이 지도의 스테이지 정의: 그 세계 스테이지를 바탕으로 층수·보스·노드 비율만 심연 것으로 */
export function abyssStage(data: GameData, stageId: string, boss: string, pinned: { floor: number; module: string }[] = [], oath = 0): StageDef {
  const cfg = data.balance.abyss;
  const source = data.stages.find((s) => s.id === stageId)!;
  // 서약 '막아선 자': 한 층을 엘리트로
  const elite = oathMods(data, oath).eliteFloor;
  const forcedTypes = elite ? { ...cfg.forcedTypes, [String(elite)]: 'elite' as const } : cfg.forcedTypes;
  return { ...source, floors: cfg.floors, pinned, boss, typeWeights: cfg.typeWeights, forcedTypes, templateEvents: true };
}

/**
 * 굽이에 정해진 노드: eventDepth굽이의 사건(동료 자리가 남았으면 구원, 가득하면 틈의 메아리),
 * 상흔 beastEvery마다 틈의 짐승(추격 엘리트) 하나
 */
function loopPins(data: GameData, run: RunState, depth: number): { floor: number; module: string }[] {
  const cfg = data.balance.abyss;
  const ab = run.abyss!;
  const pins: { floor: number; module: string }[] = [];
  if (depth === cfg.eventDepth) {
    const fighters = run.roster.filter((r) => data.characters.get(r.id)?.role === 'fighter').length;
    // 서약 '둘만의 길'이면 자리가 없다
    const cap = Math.min(cfg.partyMax, 1 + (runOath(data, run).maxMates ?? cfg.partyMax));
    pins.push({ floor: cfg.eventFloor, module: fighters < cap ? cfg.rescueModule : cfg.echoModule });
  }
  if (Math.floor(run.scar / cfg.beastEvery) > (ab.beasts ?? 0)) {
    ab.beasts = (ab.beasts ?? 0) + 1;
    const floor = pins.some((p) => p.floor === cfg.beastFloor) ? cfg.beastFloor + 1 : cfg.beastFloor;
    pins.push({ floor, module: cfg.beastModule });
  }
  return pins;
}

/** 굽이 depth를 시작한다: 세계·보스·지도, 굽이 시드 */
export function beginLoop(data: GameData, run: RunState, depth: number): void {
  const ab = run.abyss!;
  const plan = planLoop(data, ab, depth);
  ab.depth = depth;
  ab.world = plan.world;
  ab.boss = plan.boss;
  ab.laws = plan.laws;
  const pinned = loopPins(data, run, depth);
  ab.loops.push({ depth, ...plan, pinned });
  run.seed = loopSeed(ab.baseSeed, depth);
  run.stageId = plan.stageId;
  run.position = null;
  run.visited = [];
  run.usedModules = [];
  run.shop = null;
  run.status = 'map';
  const stage = abyssStage(data, plan.stageId, plan.boss, pinned, ab.oath ?? 0);
  const roster = run.roster.map((r) => r.id);
  run.map = generateStageMap(data, plan.stageId, createRng(run.seed).fork('map'), { scar: run.scar, flags: [], roster, usedModules: [] }, {
    stage,
    eligible: (mod, _floor, used) => abyssEligible(data, plan.world, roster, mod, used),
    scarWeight: data.balance.abyss.scarWeightPerPoint,
  });
}

/** 숙적을 몇 번째 만나는가(지금 굽이 포함) */
export const nemesisEncounter = (data: GameData, ab: AbyssState) => ab.loops.filter((l) => l.boss === data.balance.abyss.nemesisModule).length;

/**
 * 전투의 적마다 덧붙이는 것: 접사(엘리트는 굽이에 따라 1~2개, 깊은 굽이에서는 일반 적에도), 숙적 성장
 * (격노가 enrageStep씩 빨라지고 흐름 포식 스택 +1, knotFrom번째부터 매듭 knotStacks. 첫 만남은 옅은 잔향 — 격노가 늦고 덜 먹는다)
 */
export function abyssEnemyMods(data: GameData, run: RunState, moduleId: string, node: Pick<MapNode, 'id'>, enemies: string[]): (EnemyMod | undefined)[] {
  const ab = run.abyss!;
  const cfg = data.balance.abyss;
  const rng = createRng(run.seed).fork(`affix:${run.stageId}:${node.id}`);
  const all = [...data.affixes.values()];
  return enemies.map((id) => {
    const def = data.enemies.get(id);
    if (!def) return undefined;
    if (moduleId === cfg.nemesisModule && def.tier === 'boss') {
      const n = nemesisEncounter(data, ab);
      const traits = [];
      if (def.traits.some((t) => t.status === 'flow_eater')) traits.push({ status: 'flow_eater', stacks: n });
      if (def.traits.some((t) => t.status === 'knot')) traits.push({ status: 'knot', stacks: n >= cfg.nemesis.knotFrom ? cfg.nemesis.knotStacks : 1 });
      const borders = cfg.nemesis.borderHpScale;
      const border = borders ? { transformHpScale: borders[Math.min(n, borders.length) - 1] } : {};
      const faint = n === 1 ? cfg.nemesis.faint : undefined;
      if (faint) return { traits, enrageShift: -faint.enrageDelay, feedMul: faint.feedMul, ...border };
      return { traits, enrageShift: cfg.nemesis.enrageStep * (n - 1), ...border };
    }
    const count =
      def.tier === 'elite'
        ? Math.max(scheduled(cfg.affixesAt.elite, ab.depth), runOath(data, run).eliteAffixMin ?? 0)
        : def.tier === 'normal'
          ? scheduled(cfg.affixesAt.normal, ab.depth)
          : 0;
    if (!count) return undefined;
    const pool = all.filter((a) => def.tier !== 'boss' || a.boss);
    return { affixes: rng.shuffle(pool.map((a) => a.id)).slice(0, count) };
  });
}

/** 굽이 보스를 넘은 뒤 다음 굽이로: 부상이 낫고, 체력 healOnLoop 회복 */
export function advanceLoop(data: GameData, run: RunState): void {
  const ab = run.abyss!;
  if (run.status !== 'stage_clear') throw new Error('굽이 보스를 넘은 뒤에만 다음 굽이로 간다');
  // 서약 '아물지 않는 상처'면 부상이 그대로
  if (!runOath(data, run).injuriesPersist) {
    for (const [id, amount] of Object.entries(ab.injuries)) {
      const r = run.roster.find((x) => x.id === id);
      if (r) r.maxHp += amount;
    }
    ab.injuries = {};
  }
  for (const r of run.roster) r.hp = Math.min(r.maxHp, Math.max(1, r.hp) + Math.floor(r.maxHp * data.balance.abyss.healOnLoop));
  beginLoop(data, run, ab.depth + 1);
}

/** 동료 한 명 부상(하운 제외, 아직 부상이 아닌 동료 중 무작위): 다음 굽이까지 최대 체력 -injuryRatio */
export function injure(data: GameData, run: RunState, pick: (ids: string[]) => string, who?: string): string | null {
  const ab = run.abyss;
  if (!ab) return null;
  const can = run.roster.filter((r) => r.id !== 'haun' && !(r.id in ab.injuries)).map((r) => r.id);
  const id = who && can.includes(who) ? who : can.length ? pick(can) : null;
  if (!id) return null;
  const r = run.roster.find((x) => x.id === id)!;
  const amount = Math.floor(r.maxHp * data.balance.abyss.injuryRatio);
  ab.injuries[id] = amount;
  r.maxHp -= amount;
  r.hp = Math.max(1, Math.min(r.hp, r.maxHp));
  return `${data.characters.get(id)?.name ?? id} 부상 — 다음 굽이까지 최대 체력 -${amount}`;
}

/** 부상을 모두 고친다 */
export function cureInjuries(data: GameData, run: RunState): string[] {
  const ab = run.abyss;
  if (!ab) return [];
  const out: string[] = [];
  for (const [id, amount] of Object.entries(ab.injuries)) {
    const r = run.roster.find((x) => x.id === id);
    if (r) r.maxHp += amount;
    out.push(`${data.characters.get(id)?.name ?? id} 부상이 나았다`);
  }
  ab.injuries = {};
  return out;
}

/** 심연에서 카드를 얻는다: 덱에 바로(같은 카드 여러 장 가능). 강화는 풀의 시작 단계 */
export function abyssAddCard(data: GameData, run: RunState, cardId: string): string {
  const def = data.cards.get(cardId);
  if (!def) throw new Error(`알 수 없는 카드: ${cardId}`);
  run.deck.push(instance(run, cardId, run.abyss?.pool[cardId] ?? 0));
  return `카드 획득: ${def.name}${run.abyss?.pool[cardId] ? ` +${run.abyss.pool[cardId]}` : ''}`;
}

/** 이미 덱에 든 심법(파워)은 후보에서 뺀다(한 종류 1장) */
const powerInDeck = (data: GameData, run: RunState, id: string) => data.cards.get(id)?.type === 'power' && run.deck.some((c) => c.cardId === id);

/** 심연 보상 후보: 풀(합류 동료·공용) 중 등급 가중치로, 슬롯마다 riftCardChance로 열린 틈의 카드 */
export function abyssRewardOptions(data: GameData, run: RunState, nodeId: string, nodeType: string | undefined): string[] {
  const ab = run.abyss!;
  const owners = new Set([...run.roster.map((r) => r.id), COMMON]);
  const fits = (id: string) => {
    const d = data.cards.get(id);
    return !!d && owners.has(ownerKey(data, d)) && !powerInDeck(data, run, id) && oathAllows(data, run, d);
  };
  const left = Object.keys(ab.pool).filter(fits).map((id) => data.cards.get(id)!);
  const rift = ab.unlocked.filter(fits).map((id) => data.cards.get(id)!);
  const weights = data.balance.rewards.rarityWeights[nodeType === 'elite' || nodeType === 'boss' ? nodeType : 'battle'];
  const rng = createRng(run.seed).fork(`reward:${run.stageId}:${nodeId}`);
  const pool = rng.shuffle([...left]);
  const riftLeft = rng.shuffle([...rift]);
  const mods = runOath(data, run);
  const base = run.relics.some((id) => data.relics.get(id)?.rule === 'needle') ? data.balance.abyss.needleRewardChoices : data.balance.rewards.cardChoices;
  const n = Math.min(base, mods.rewardChoices ?? base);
  const picked: string[] = [];
  // 서약 '틈의 손': 틈의 카드 한 장은 반드시(첫 칸)
  if (mods.riftInReward && riftLeft.length) picked.push(riftLeft.shift()!.id);
  while (picked.length < n && (pool.length || riftLeft.length)) {
    if (riftLeft.length && (rng.next() < data.balance.abyss.riftCardChance || !pool.length)) {
      picked.push(riftLeft.shift()!.id);
      continue;
    }
    const tiers = (Object.entries(weights) as [string, number][]).filter(([r, w]) => w > 0 && pool.some((c) => c.rarity === r));
    const tier = tiers.length ? rng.weighted(tiers, ([, w]) => w)![0] : pool[0].rarity;
    const i = pool.findIndex((c) => c.rarity === tier);
    picked.push(pool.splice(i, 1)[0].id);
  }
  return picked;
}

/** 상점 진열 후보(합류 동료·공용의 풀 카드) */
export function abyssShopPool(data: GameData, run: RunState): CardDef[] {
  const owners = new Set([...run.roster.map((r) => r.id), COMMON]);
  return Object.keys(run.abyss!.pool)
    .map((id) => data.cards.get(id)!)
    .filter((d) => owners.has(ownerKey(data, d)) && !powerInDeck(data, run, d.id) && oathAllows(data, run, d));
}

/** 상점의 틈의 카드 한 칸 후보 */
export function abyssShopRift(data: GameData, run: RunState): CardDef[] {
  const owners = new Set([...run.roster.map((r) => r.id), COMMON]);
  return run.abyss!.unlocked.map((id) => data.cards.get(id)!).filter((d) => d && owners.has(ownerKey(data, d)) && !powerInDeck(data, run, d.id) && oathAllows(data, run, d));
}

/** 틈의 거래: 열린 틈의 카드 한 장(희귀 이상)을 덱에 */
export function gainAbyssCard(data: GameData, run: RunState, pick: (pool: CardDef[]) => CardDef): string {
  const pool = abyssShopRift(data, run).filter((d) => ['rare', 'epic', 'legendary'].includes(d.rarity));
  if (!pool.length) {
    run.gold += 50;
    return '받을 틈의 카드가 없다 — 골드 +50';
  }
  return abyssAddCard(data, run, pick(pool).id);
}

/** 틈의 거래 '본 적 없는 카드 보기': 풀에 없는 카드(합류 동료·공용) 한 장을 보여 주고 풀에 넣는다(얻지는 않는다) */
export function revealUnseenCard(data: GameData, run: RunState, pick: (pool: CardDef[]) => CardDef): string {
  const ab = run.abyss!;
  const owners = new Set([...run.roster.map((r) => r.id), COMMON]);
  const pool = [...data.cards.values()].filter((d) => poolable(d) && !(d.id in ab.pool) && owners.has(ownerKey(data, d)));
  if (!pool.length) {
    run.gold += 40;
    return '더 볼 카드가 없다 — 골드 40을 돌려받았다';
  }
  const d = pick(pool);
  ab.pool[d.id] = 0;
  ab.revealed.push(d.id);
  return `처음 보는 초식: ${d.name} — 도감에 적었다. 이제 보상에 나올 수 있다`;
}

/** 카드 지우기 가격(바늘의 길이면 공짜) */
export function removePrice(data: GameData, run: RunState): number {
  if (run.relics.some((id) => data.relics.get(id)?.rule === 'needle')) return 0;
  return data.balance.abyss.removePrice + data.balance.abyss.removeStep * (run.abyss?.removals ?? 0);
}

/**
 * 스테이지 맞춤: 스테이지마다 적의 기본 체력·피해가 달라(뒤 스테이지일수록 크다), 일반 전투 적의 평균을 S1에 맞추는 배율.
 * 데이터에서 계산한다(적을 고쳐도 따라온다)
 */
const normCache = new WeakMap<GameData, Map<string, { hp: number; dmg: number }>>();
export function stageNorm(data: GameData, stageId: string): { hp: number; dmg: number } {
  let cache = normCache.get(data);
  if (!cache) normCache.set(data, (cache = new Map()));
  const hit = cache.get(stageId);
  if (hit) return hit;
  const avg = (sid: string) => {
    let hp = 0;
    let dmg = 0;
    let n = 0;
    for (const m of data.modules.values()) {
      if (m.stage !== sid || m.type !== 'battle') continue;
      for (const id of m.content.enemies ?? []) {
        const e = data.enemies.get(id)!;
        const hits = e.moves.map((mv) => mv.effects.filter((x) => x.op === 'damage').reduce((a, x) => a + (x.amount ?? 0) * (x.times ?? 1), 0)).filter((x) => x > 0);
        hp += e.maxHp;
        dmg += hits.length ? hits.reduce((a, b) => a + b, 0) / hits.length : 0;
        n += 1;
      }
    }
    return n ? { hp: hp / n, dmg: dmg / n } : null;
  };
  const base = avg('s1');
  const own = avg(stageId);
  const out = base && own ? { hp: base.hp / own.hp, dmg: base.dmg / own.dmg } : { hp: 1, dmg: 1 };
  cache.set(stageId, out);
  return out;
}

/** 지금 굽이의 적 배율(굽이 n: 기본 × (1 + step × (n-1))). deep.from굽이부터는 굽이마다 deep 단계만큼 오른다 */
export function abyssScale(data: GameData, depth: number): { hp: number; dmg: number } {
  const cfg = data.balance.abyss;
  const from = cfg.deep?.from ?? Infinity;
  const near = Math.min(depth, from) - 1;
  const far = Math.max(0, depth - from);
  return {
    hp: cfg.hpBase * (1 + cfg.hpStep * near + (cfg.deep?.hpStep ?? 0) * far),
    dmg: cfg.dmgBase * (1 + cfg.dmgStep * near + (cfg.deep?.dmgStep ?? 0) * far),
  };
}

/** 점수: 넘은 굽이 × depth + 보스 × boss + 엘리트 × elite + 남은 하운 체력 비율 × hp */
export function abyssScore(data: GameData, run: RunState): number {
  const ab = run.abyss!;
  const s = data.balance.abyss.score;
  const haun = run.roster.find((r) => r.id === 'haun');
  const cleared = ab.depth - (run.status === 'stage_clear' ? 0 : 1);
  const hp = haun && run.status !== 'defeat' ? haun.hp / haun.maxHp : 0;
  return Math.round((cleared * s.depth + ab.bosses * s.boss + ab.elites * s.elite + hp * s.hp) * oathScoreMul(data, ab.oath ?? 0));
}

/** 넘은 굽이 수 */
export const abyssCleared = (run: RunState) => run.abyss!.depth - (run.status === 'stage_clear' ? 0 : 1);

// ───────── 업적 셈(3차) ─────────

const track = (run: RunState) => (run.abyss!.track ??= emptyTrack(run.abyss!.mates.length));

/** 늘 재는 것: 가장 많았던 골드·상흔, 덱의 틈의 카드 수 */
export function trackTick(data: GameData, run: RunState): void {
  if (!run.abyss) return;
  const t = track(run);
  t.maxGold = Math.max(t.maxGold, run.gold);
  t.maxScar = Math.max(t.maxScar, run.scar);
  t.riftInDeckMax = Math.max(t.riftInDeckMax, run.deck.filter((c) => data.cards.get(c.cardId)?.pool === 'abyss').length);
}

/** 이긴 전투: 숙적·짐승·보스 처치, 접사 적 처치, 결 노출, 심법 */
export function trackBattle(
  data: GameData,
  run: RunState,
  moduleId: string,
  nodeType: string,
  tally: { affixKills?: number; grain?: number; cards: Record<string, number> } | undefined,
): void {
  const t = track(run);
  const cfg = data.balance.abyss;
  if (moduleId === cfg.nemesisModule) t.nemesisKills += 1;
  if (moduleId === cfg.beastModule) t.beastKills += 1;
  if (nodeType === 'boss') {
    t.bossScarMax = Math.max(t.bossScarMax, run.scar);
    const haun = run.roster.find((r) => r.id === 'haun');
    if (haun) t.bossLowHp = Math.min(t.bossLowHp, haun.hp / haun.maxHp);
  }
  t.affixKills += tally?.affixKills ?? 0;
  t.grainBattleMax = Math.max(t.grainBattleMax, tally?.grain ?? 0);
  if (Object.keys(tally?.cards ?? {}).some((id) => data.cards.get(id)?.type === 'power')) t.powerPlayed = true;
  trackTick(data, run);
}

/** 굽이를 넘었을 때(보스를 쓰러뜨린 직후) */
export function trackLoopClear(data: GameData, run: RunState): void {
  const ab = run.abyss!;
  const t = track(run);
  trackTick(data, run);
  if (!t.worlds.includes(ab.world)) t.worlds.push(ab.world);
  t.lawsClearMax = Math.max(t.lawsClearMax, ab.laws?.length ?? 0);
  t.injuredClearMax = Math.max(t.injuredClearMax, Object.keys(ab.injuries).length);
  t.deckAtClear[String(ab.depth)] = run.deck.length;
  if (!t.powerPlayed) t.noPowerDepth = ab.depth;
  if (t.maxScar === 0) t.scarZeroDepth = ab.depth;
}

/** 고른 선택지(틈의 거래 셈, "모듈:동작") */
export function trackChoice(data: GameData, run: RunState, module: ModuleDef, ops: string[]): void {
  const t = track(run);
  if (module.tags.includes('trade') && ops.length) t.trades += 1;
  for (const op of ops) if (!t.choiceOps.includes(`${module.id}:${op}`)) t.choiceOps.push(`${module.id}:${op}`);
  trackTick(data, run);
}

/** 업적 하나를 이 런이 채웠는가. ctx: 런 밖의 것(도감 카드 수) */
export function achievementMet(data: GameData, run: RunState, a: AchievementDef, ctx: { codexCards?: number } = {}): boolean {
  const ab = run.abyss;
  if (!ab) return false;
  const t = track(run);
  const c = a.check;
  const cleared = abyssCleared(run);
  switch (c.kind) {
    case 'cleared':
      return cleared >= c.n;
    case 'nemesisKills':
    case 'beastKills':
    case 'affixKills':
    case 'trades':
      return t[c.kind] >= c.n;
    case 'elites':
      return ab.elites >= c.n;
    case 'bosses':
      return ab.bosses >= c.n;
    case 'bossWithScar':
      return t.bossScarMax >= c.n;
    case 'lowHpBoss':
      return t.bossLowHp <= c.n;
    case 'injuredClear':
      return t.injuredClearMax >= c.n;
    case 'noPowerDepth':
      return t.noPowerDepth >= c.n;
    case 'grainBattle':
      return t.grainBattleMax >= c.n;
    case 'mates':
      return t.startMates === c.mates && cleared >= c.n;
    case 'withMate':
      return run.roster.some((r) => r.id === c.mate) && cleared >= c.n;
    case 'codexCards':
      return (ctx.codexCards ?? 0) >= c.n;
    case 'score':
      return abyssScore(data, run) >= c.n;
    case 'oath':
      return (ab.oath ?? 0) >= (c.oath ?? 0) && cleared >= c.n;
    case 'choice':
      return t.choiceOps.includes(`${c.module}:${c.op}`);
    case 'worlds':
      return t.worlds.length >= c.n;
    case 'lawsClear':
      return t.lawsClearMax >= c.n;
    case 'smallDeck':
      return Object.entries(t.deckAtClear).some(([d, size]) => Number(d) >= (c.depth ?? 1) && size <= c.n);
    case 'riftInDeck':
      return t.riftInDeckMax >= c.n;
    case 'gold':
      return t.maxGold >= c.n;
    case 'scarZeroDepth':
      return t.scarZeroDepth >= c.n;
  }
}

/** 이 런이 채운 업적 중 아직 이루지 않은 것 */
export function newAchievements(data: GameData, run: RunState, achieved: readonly string[], ctx: { codexCards?: number } = {}): AchievementDef[] {
  return [...data.achievements.values()].filter((a) => !achieved.includes(a.id) && achievementMet(data, run, a, ctx));
}

/** 굽이 이름: "심연 3굽이 · 엘하임" */
export const WORLD_NAME: Record<World, string> = { murim: '무림', elheim: '엘하임', nocturna: '마왕성', rift: '세계의 틈' };
export const loopLabel = (ab: AbyssState) => `심연 ${ab.depth}굽이 · ${WORLD_NAME[ab.world]}`;

// ───────── 심연 기록(저장 칸과 상관없이 브라우저에 하나, 3차) ─────────

export interface AbyssMeta {
  /** 이룬 업적 id(틈의 카드·길이 열린다) */
  achievements: string[];
  /** 굽이 번호 → 그 굽이에서 멈춘 횟수 */
  deaths: Record<string, number>;
  /** balance.abyss.oath.stepDepth굽이를 넘은 가장 높은 서약 단계(-1: 없음) */
  oathCleared: number;
  /** 일일 심연: 날짜(yyyymmdd) → 그날 최고 기록 */
  daily: Record<string, { score: number; cleared: number; ended: boolean }>;
}

export const emptyAbyssMeta = (): AbyssMeta => ({ achievements: [], deaths: {}, oathCleared: -1, daily: {} });

/** 깨졌거나 옛 기록도 받아 준다. 데이터에 없는 업적은 버린다 */
export function parseAbyssMeta(data: GameData, text: string | null): AbyssMeta {
  const m = emptyAbyssMeta();
  if (!text) return m;
  try {
    const raw = JSON.parse(text) as Partial<AbyssMeta>;
    m.achievements = Array.isArray(raw.achievements) ? [...new Set(raw.achievements.filter((id) => typeof id === 'string' && data.achievements.has(id)))] : [];
    for (const [d, n] of Object.entries(raw.deaths ?? {})) if (Number(n) > 0) m.deaths[d] = Number(n);
    m.oathCleared = Number.isFinite(Number(raw.oathCleared)) ? Math.max(-1, Number(raw.oathCleared)) : -1;
    for (const [d, r] of Object.entries(raw.daily ?? {}))
      if (r && typeof r === 'object') m.daily[d] = { score: Number(r.score) || 0, cleared: Number(r.cleared) || 0, ended: !!r.ended };
  } catch {
    /* 깨진 기록: 빈 기록 */
  }
  return m;
}

/**
 * 굽이를 넘었을 때(ended false)·런이 끝났을 때(ended true) 기록을 갱신한다: 새 업적, 서약 단계, 멈춘 굽이, 일일 기록.
 * 새로 이룬 업적을 돌려준다
 */
export function updateAbyssMeta(data: GameData, meta: AbyssMeta, run: RunState, opts: { ended: boolean; codexCards?: number }): AchievementDef[] {
  const ab = run.abyss!;
  const fresh = newAchievements(data, run, meta.achievements, { codexCards: opts.codexCards });
  meta.achievements.push(...fresh.map((a) => a.id));
  const cleared = abyssCleared(run);
  if (cleared >= data.balance.abyss.oath.stepDepth) meta.oathCleared = Math.max(meta.oathCleared, ab.oath ?? 0);
  if (opts.ended) meta.deaths[String(ab.depth)] = (meta.deaths[String(ab.depth)] ?? 0) + 1;
  if (ab.daily) {
    const score = abyssScore(data, run);
    const prev = meta.daily[ab.daily];
    if (!prev || score >= prev.score) meta.daily[ab.daily] = { score, cleared, ended: opts.ended };
  }
  return fresh;
}

/** 업적이 여는 것의 이름(틈의 카드 또는 길) */
export function unlockName(data: GameData, a: AchievementDef): string {
  if (a.unlock.card) return `틈의 카드 「${data.cards.get(a.unlock.card)?.name ?? a.unlock.card}」`;
  if (a.unlock.path) return `${data.relics.get(a.unlock.path)?.name ?? a.unlock.path}`;
  return '';
}

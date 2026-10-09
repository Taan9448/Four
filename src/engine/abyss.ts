// 심연(深淵, GAME_DESIGN 16절): 스토리를 마친 뒤 열리는 끝없는 로그라이크 드래프트 런.
// 굽이(지도 하나)마다 세계·보스가 시드로 정해지고, 캠페인의 모듈·적·배경·마나 규칙을 그대로 쓴다.
// 보상 풀은 이 저장 칸의 보유 카드 + 도감에 기록된 카드(본 적 있는 카드)와 열린 틈의 카드. 얻은 카드는 덱에만 들어간다(보유 목록과 무관).
import type { GameData } from './data';
import type { CardDef, ModuleDef, StageDef, World } from './schema';
import { createRng } from './rng';
import { generateStageMap } from './route';
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
  loops: { depth: number; world: World; boss: string; stageId: string }[];
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
  /** 부상: 동료 id → 줄어든 최대 체력(다음 굽이에 돌아온다) */
  injuries: Record<string, number>;
}

export const isAbyss = (run: Pick<RunState, 'mode'>): boolean => run.mode === 'abyss';

/** 굽이마다 다른 시드(전투·보상·상점·사건의 수열이 굽이끼리 겹치지 않게) */
export const loopSeed = (base: string, depth: number) => `${base}~d${depth}`;

/** 심연의 길(시작 유물) 전체 */
export const abyssPaths = (data: GameData) => [...data.relics.values()].filter((r) => r.rarity === 'path');

/** 시드로 길 후보 balance.abyss.pathOffer개 */
export function pathOffer(data: GameData, seed: string): string[] {
  const rng = createRng(seed).fork('abyss:paths');
  return rng
    .shuffle(abyssPaths(data).map((r) => r.id))
    .slice(0, data.balance.abyss.pathOffer);
}

/** 동료 수(1~3)에 따른 고를 길 개수와 덤 골드 */
export function pathPicks(data: GameData, mateCount: number): { picks: number; gold: number } {
  return data.balance.abyss.pathPicks[String(mateCount)] ?? { picks: 1, gold: 0 };
}

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
  for (const [id, lv] of Object.entries(collection)) if (poolable(data.cards.get(id))) out[id] = Math.min(lv, data.balance.upgrade.maxLevel);
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

/** 시작 덱의 한 주인 몫: 그 주인의 시작 카드에서 공격 절반(올림) + 나머지(데이터 순서, 결정적) */
export function abyssStarters(data: GameData, owner: string, n: number): string[] {
  const all = [...data.cards.values()].filter((d) => d.pool === 'starter' && ownerKey(data, d) === owner);
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
}

/** 새 심연 런: 하운 + 동료, 시작 덱, 길(시작 유물), 1굽이 */
export function createAbyssRun(data: GameData, seed: string, start: AbyssStart): RunState {
  const ab = data.balance.abyss;
  const mates = [...new Set(start.mates)].filter((id) => id !== 'haun' && data.characters.get(id)?.role === 'fighter');
  if (mates.length < 1 || mates.length > ab.partyMax - 1) throw new Error(`심연 동료는 1~${ab.partyMax - 1}명`);
  const picks = pathPicks(data, mates.length);
  const offer = pathOffer(data, seed);
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
    return { id, hp: def.maxHp, maxHp: def.maxHp, level: 1, xp: 0 };
  });
  run.selected = run.roster.map((r) => r.id);
  run.flags = [];
  run.stats = emptyStats();
  run.gold = data.balance.economy.startGold + picks.gold;
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
  };
  const level = (id: string) => run.abyss!.pool[id] ?? 0;
  run.deck = [
    ...abyssStarters(data, 'haun', ab.starters.haun),
    ...abyssStarters(data, COMMON, ab.starters.common),
    ...mates.flatMap((m) => abyssStarters(data, m, ab.starters.mate)),
  ].map((id) => instance(run, id, level(id)));
  for (const p of paths) gainRelic(data, run, p);
  beginLoop(data, run, 1);
  return run;
}

/** 굽이 n의 세계와 보스(시드로). 숙적 굽이(5·10·15…)는 틈 세계의 모르데카이의 잔향 */
export function planLoop(data: GameData, ab: AbyssState, depth: number): { world: World; boss: string; stageId: string } {
  const cfg = data.balance.abyss;
  const rng = createRng(ab.baseSeed).fork(`abyss:loop:${depth}`);
  const prev = ab.loops[ab.loops.length - 1];
  if (depth % cfg.nemesisEvery === 0) return { world: 'rift', boss: cfg.nemesisModule, stageId: rng.pick(cfg.worlds.rift.stages) };
  const all = Object.keys(cfg.worlds) as World[];
  let worlds = depth === 1 ? cfg.firstWorlds : all.filter((w) => w !== prev?.world && (w !== 'rift' || depth >= cfg.riftFrom));
  if (!worlds.length) worlds = all;
  const world = rng.pick(worlds);
  const own = cfg.worlds[world].bosses;
  const everyBoss = all.flatMap((w) => cfg.worlds[w].bosses);
  const base = own.length ? own : everyBoss;
  const bosses = base.filter((b) => b !== prev?.boss);
  return { world, boss: rng.pick(bosses.length ? bosses : base), stageId: rng.pick(cfg.worlds[world].stages) };
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
export function abyssStage(data: GameData, stageId: string, boss: string): StageDef {
  const cfg = data.balance.abyss;
  const source = data.stages.find((s) => s.id === stageId)!;
  return { ...source, floors: cfg.floors, pinned: [], boss, typeWeights: cfg.typeWeights, forcedTypes: cfg.forcedTypes, templateEvents: true };
}

/** 굽이 depth를 시작한다: 세계·보스·지도, 굽이 시드 */
export function beginLoop(data: GameData, run: RunState, depth: number): void {
  const ab = run.abyss!;
  const plan = planLoop(data, ab, depth);
  ab.depth = depth;
  ab.world = plan.world;
  ab.boss = plan.boss;
  ab.loops.push({ depth, ...plan });
  run.seed = loopSeed(ab.baseSeed, depth);
  run.stageId = plan.stageId;
  run.position = null;
  run.visited = [];
  run.usedModules = [];
  run.shop = null;
  run.status = 'map';
  const stage = abyssStage(data, plan.stageId, plan.boss);
  const roster = run.roster.map((r) => r.id);
  run.map = generateStageMap(data, plan.stageId, createRng(run.seed).fork('map'), { scar: run.scar, flags: [], roster, usedModules: [] }, {
    stage,
    eligible: (mod, _floor, used) => abyssEligible(data, plan.world, roster, mod, used),
  });
}

/** 굽이 보스를 넘은 뒤 다음 굽이로: 부상이 낫고, 체력 healOnLoop 회복 */
export function advanceLoop(data: GameData, run: RunState): void {
  const ab = run.abyss!;
  if (run.status !== 'stage_clear') throw new Error('굽이 보스를 넘은 뒤에만 다음 굽이로 간다');
  for (const [id, amount] of Object.entries(ab.injuries)) {
    const r = run.roster.find((x) => x.id === id);
    if (r) r.maxHp += amount;
  }
  ab.injuries = {};
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
    return !!d && owners.has(ownerKey(data, d)) && !powerInDeck(data, run, id);
  };
  const left = Object.keys(ab.pool).filter(fits).map((id) => data.cards.get(id)!);
  const rift = ab.unlocked.filter(fits).map((id) => data.cards.get(id)!);
  const weights = data.balance.rewards.rarityWeights[nodeType === 'elite' || nodeType === 'boss' ? nodeType : 'battle'];
  const rng = createRng(run.seed).fork(`reward:${run.stageId}:${nodeId}`);
  const pool = rng.shuffle([...left]);
  const riftLeft = rng.shuffle([...rift]);
  const n = run.relics.some((id) => data.relics.get(id)?.rule === 'needle') ? data.balance.abyss.needleRewardChoices : data.balance.rewards.cardChoices;
  const picked: string[] = [];
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
    .filter((d) => owners.has(ownerKey(data, d)) && !powerInDeck(data, run, d.id));
}

/** 상점의 틈의 카드 한 칸 후보 */
export function abyssShopRift(data: GameData, run: RunState): CardDef[] {
  const owners = new Set([...run.roster.map((r) => r.id), COMMON]);
  return run.abyss!.unlocked.map((id) => data.cards.get(id)!).filter((d) => d && owners.has(ownerKey(data, d)) && !powerInDeck(data, run, d.id));
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

/** 지금 굽이의 적 배율(굽이 n: 기본 × (1 + step × (n-1))) */
export function abyssScale(data: GameData, depth: number): { hp: number; dmg: number } {
  const cfg = data.balance.abyss;
  return { hp: cfg.hpBase * (1 + cfg.hpStep * (depth - 1)), dmg: cfg.dmgBase * (1 + cfg.dmgStep * (depth - 1)) };
}

/** 점수: 넘은 굽이 × depth + 보스 × boss + 엘리트 × elite + 남은 하운 체력 비율 × hp */
export function abyssScore(data: GameData, run: RunState): number {
  const ab = run.abyss!;
  const s = data.balance.abyss.score;
  const haun = run.roster.find((r) => r.id === 'haun');
  const cleared = ab.depth - (run.status === 'stage_clear' ? 0 : 1);
  const hp = haun && run.status !== 'defeat' ? haun.hp / haun.maxHp : 0;
  return Math.round(cleared * s.depth + ab.bosses * s.boss + ab.elites * s.elite + hp * s.hp);
}

/** 굽이 이름: "심연 3굽이 · 엘하임" */
export const WORLD_NAME: Record<World, string> = { murim: '무림', elheim: '엘하임', nocturna: '마왕성', rift: '세계의 틈' };
export const loopLabel = (ab: AbyssState) => `심연 ${ab.depth}굽이 · ${WORLD_NAME[ab.world]}`;

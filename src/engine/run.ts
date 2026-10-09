// 런(한 번의 플레이) 상태: 파티 편성, 덱, 런 마나, 상흔, 플래그, 지도 진행.
import type { GameData } from './data';
import type { Effect, ModuleDef } from './schema';
import { createRng } from './rng';
import { findNode, generateStageMap, type MapNode, type StageMap } from './route';
import type { BattleOutcome, BattleSetup } from './battle';
import type { CardInstance } from './state';
import { acquireCard, beginStageLoadout, COMMON, grantStarters, joinMidStage, swapCard, swappableCards, upgradeOwned, type Loadout } from './collection';

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
  /** 편성: 주인(동료 id·'common') → 카드 id */
  loadout: Loadout;
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
  /** 결과 화면 통계 */
  stats: RunStats;
}

export type Difficulty = 'normal' | 'hard';

/** 결과 화면 통계(런 전체): 전투 집계를 더해 간다 */
export interface RunStats {
  battles: number;
  turns: number;
  kills: number;
  damage: number;
  crits: number;
  surges: number;
  /** 카드 id → 쓴 횟수 */
  cards: Record<string, number>;
  /** 진 런: 어디서 무엇에 쓰러졌나 */
  deathCause?: string;
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
    stats: emptyStats(),
  };
  // 하운과 공용의 시작 카드(각 10장)를 받고, 첫 스테이지 편성으로
  grantStarters(data, run, 'haun');
  grantStarters(data, run, COMMON);
  beginStageLoadout(data, run);
  run.map = buildMap(data, run);
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
 * 다시 하는 런은 hub를 replayOf로 품고, 끝나면(이기든 지든) hub로 돌아간다. 다시 한 결과는 hub에 남기지 않는다(이긴 횟수만)
 */
export function startReplay(data: GameData, hub: RunState, stageId: string): RunState {
  if (hub.status !== 'complete') throw new Error('캠페인을 마친 런에서만 다시 할 수 있다');
  const stage = playableStages(data).find((s) => s.id === stageId);
  if (!stage) throw new Error(`다시 할 수 없는 스테이지: ${stageId}`);
  const run: RunState = structuredClone({ ...hub, replayOf: null });
  run.replayOf = structuredClone({ ...hub, replayOf: null });
  run.stageId = stageId;
  run.status = 'map';
  run.position = null;
  run.visited = [];
  run.shop = null;
  run.levelLog = [];
  run.pendingUpgrades = [];
  for (const r of run.roster) r.hp = r.maxHp;
  // 같은 시드라도 다시 할 때마다 다른 지도가 나오게 시드에 횟수를 붙인다
  run.seed = `${hub.seed}~${stageId}~${(hub.replays[stageId] ?? 0) + 1}`;
  beginStageLoadout(data, run);
  run.map = buildMap(data, run);
  return run;
}

/**
 * 다시 하기를 끝내고 hub로 돌아간다. 이겼으면 그 스테이지의 이긴 횟수를 올린다.
 * 보유 카드(얻은 카드·강화)와 편성 저장 칸은 이기든 지든 hub에 남긴다(GAME_DESIGN 9-1)
 */
export function finishReplay(run: RunState): RunState {
  const hub = run.replayOf;
  if (!hub) throw new Error('다시 하는 중이 아니다');
  if (run.status === 'stage_clear' || run.status === 'complete') hub.replays[run.stageId] = (hub.replays[run.stageId] ?? 0) + 1;
  hub.collection = structuredClone(run.collection);
  hub.presets = structuredClone(run.presets);
  hub.loadout = structuredClone(run.loadout);
  return hub;
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
  run.status = 'map';
  return true;
}

/** 카드를 얻는다(보상 고르기 등): 보유 목록에 영구로, 이번 스테이지 덱에도. 이미 있으면 강화(GAME_DESIGN 9-1). 결과 문구 */
export function addCard(data: GameData, run: RunState, cardId: string): string {
  return acquireCard(data, run, cardId);
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
  if (module.once && !run.usedModules.includes(module.id)) run.usedModules.push(module.id);
  return { node, module };
}

export function isBattle(enc: Encounter): boolean {
  return ['battle', 'elite', 'boss'].includes(enc.node.type);
}

export function stageWorld(data: GameData, run: RunState) {
  return data.stages.find((s) => s.id === run.stageId)!.world;
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
  return {
    world: stageWorld(data, run),
    party: run.selected.map((id) => {
      const r = run.roster.find((x) => x.id === id)!;
      return { id, hp: r.hp, maxHp: r.maxHp, level: r.level };
    }),
    enemies: enc.module.content.enemies ?? [],
    surviveTurns: enc.module.content.surviveTurns,
    deck: run.deck,
    mana: run.mana,
    rng: createRng(run.seed).fork(`battle:${run.stageId}:${enc.node.id}`),
    supportActive: run.supportActive,
    flags: run.flags,
    scar: run.scar,
    startEffects: [...always, ...(bonusOn ? bonus!.effects : [])],
    manaRule: mana ?? stage.mana,
    enemyHpScale: stage.enemyHpScale * (run.difficulty === 'hard' ? hardMul(data, stage.id).hp : 1),
    enemyDmgScale: stage.enemyDmgScale * (run.difficulty === 'hard' ? hardMul(data, stage.id).dmg : 1),
    relics: run.relics,
    potions: run.potions,
  };
}

/** 전투 결과를 런에 반영한다. 이기면 모듈의 clearEffects(보스가 아니어도)를 적용하고 그 결과 메시지를 돌려준다 */
export function applyBattleOutcome(data: GameData, run: RunState, enc: Encounter, outcome: BattleOutcome): string[] {
  for (const p of outcome.party) {
    const r = run.roster.find((x) => x.id === p.id);
    if (r) r.hp = Math.max(0, Math.min(r.maxHp, p.hp));
  }
  run.mana = outcome.mana;
  run.scar += outcome.scarGain;
  if (outcome.potions) run.potions = [...outcome.potions];
  // 결과 화면 통계
  const st = (run.stats ??= emptyStats());
  st.battles += 1;
  st.turns += outcome.turns ?? 0;
  if (outcome.tally) {
    st.kills += outcome.tally.kills;
    st.damage += outcome.tally.damage;
    st.crits += outcome.tally.crits;
    st.surges += outcome.tally.surges;
    for (const [id, n] of Object.entries(outcome.tally.cards)) st.cards[id] = (st.cards[id] ?? 0) + n;
  }
  if (outcome.result === 'defeat') {
    run.status = 'defeat';
    st.deathCause = `${enc.module.name} — ${outcome.tally?.haunHitBy ?? '알 수 없는 것'}`;
    return [];
  }
  // 하드코어: 전투가 끝날 때 쓰러져 있던 동료는 일행을 떠난다(하운은 쓰러지면 이미 패배)
  const out: string[] = [];
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
  if (enc.node.type === 'boss') run.status = 'stage_clear';
  return out;
}

// ───────────────────────── 유물·물약(런) ─────────────────────────

/** 전투 밖 trigger(victory·rest·shopEnter)의 유물 효과를 런에 적용한다 */
export function fireRunRelics(data: GameData, run: RunState, trigger: 'victory' | 'rest' | 'shopEnter'): string[] {
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
  upgradeOwned(data, run, card.cardId);
  const def = data.cards.get(card.cardId)!;
  const skill = card.level > data.balance.upgrade.statLevels ? (card.level === 4 ? def.upgrade!.plus4 : def.upgrade!.plus5) : null;
  return [`카드 강화: ${def.name} +${card.level}${skill ? ` — 특수 스킬 「${skill.name}」` : ''}`];
}

// ───────────────────────── 파티 편성 ─────────────────────────

export function setParty(data: GameData, run: RunState, ids: string[]): void {
  const unique = [...new Set(ids)];
  if (!unique.includes('haun')) throw new Error('하운은 항상 출전한다');
  if (unique.length > data.balance.party.max) throw new Error(`출전은 최대 ${data.balance.party.max}명`);
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
}

export function choicesFor(data: GameData, run: RunState, module: ModuleDef): ChoiceView[] {
  const list: ChoiceView[] = (module.content.choices ?? [])
    .filter((c) => !c.condition?.partyHas || run.selected.includes(c.condition.partyHas))
    .filter((c) => !c.condition?.flag || run.flags.includes(c.condition.flag))
    .map((c) => ({
      label: c.label,
      effects: c.effects,
      result: c.result,
      outcomes: c.outcomes,
      source: 'module' as const,
      disabled: c.condition?.goldGte !== undefined && run.gold < c.condition.goldGte ? `골드 ${c.condition.goldGte} 필요` : undefined,
    }));
  if (module.type === 'rest' && run.supportActive) {
    for (const rule of data.support.filter((r) => r.trigger === 'restOption')) {
      list.push({ label: `[왕일검] ${rule.name}`, effects: rule.effects, result: rule.description, source: 'support' });
    }
  }
  return list;
}

/** pick: 선택지에 고르는 강화(upgrade_card choose)가 있으면 사람이 고른 카드 uid. 휴식 노드면 rest 유물이 뒤따른다 */
export function applyChoice(data: GameData, run: RunState, module: ModuleDef, index: number, pick?: string): string[] {
  const choice = choicesFor(data, run, module)[index];
  if (!choice) throw new Error('없는 선택지');
  if (choice.disabled) throw new Error(`고를 수 없는 선택지: ${choice.disabled}`);
  const out = applyRunOps(data, run, choice.effects, { pick });
  // 확률 결과: 노드마다 정해진 수열로 하나를 고른다(같은 시드면 같은 결과)
  if (choice.outcomes?.length) {
    const o = createRng(run.seed).fork(`outcome:${run.stageId}:${run.position}:${module.id}`).weighted(choice.outcomes, (x) => x.weight)!;
    out.unshift(o.result);
    out.push(...applyRunOps(data, run, o.effects, { pick }));
  }
  if (module.type === 'rest') out.push(...fireRunRelics(data, run, 'rest'));
  return out;
}

/** 선택지가 보유 카드 한 장을 사람에게 고르게 하는가(카드 바꾸기·팔기: pick은 카드 id) */
export function choiceCardPick(choice: { effects: Effect[] }): Effect | undefined {
  return choice.effects.find((e) => (e.op === 'swap_card' || e.op === 'sell_card') && e.choose);
}

/** 선택지가 강화할 카드를 사람에게 고르게 하는가 */
export function choiceNeedsPick(choice: { effects: Effect[] }): Effect | undefined {
  return choice.effects.find((e) => e.op === 'upgrade_card' && e.choose);
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
export function applyRunOps(data: GameData, run: RunState, effects: Effect[], opts: { pick?: string } = {}): string[] {
  const out: string[] = [];
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
          out.push(acquireCard(data, run, d.id));
        }
        break;
      }
      case 'swap_card':
      case 'sell_card': {
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
        for (let i = 0; i < (e.count ?? 1); i++) out.push(acquireCard(data, run, def.id));
        break;
      }
      case 'remove_card': {
        // 이번 스테이지 덱에서만 뺀다(보유 카드는 그대로, GAME_DESIGN 9-1)
        const pool = run.deck.filter((c) => matchesFilter(data, c, e.filter));
        if (pool.length) {
          const c = rng.pick(pool);
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
          upgradeOwned(data, run, c.cardId);
          const def = data.cards.get(c.cardId)!;
          const skill = c.level > data.balance.upgrade.statLevels ? (c.level === 4 ? def.upgrade!.plus4 : def.upgrade!.plus5) : null;
          out.push(`카드 강화: ${def.name} +${c.level}${skill ? ` — 특수 스킬 「${skill.name}」` : ''}`);
        }
        break;
      }
      case 'heal_party':
        for (const r of run.roster.filter((x) => run.selected.includes(x.id))) {
          const amount = e.ratio !== undefined ? Math.floor(r.maxHp * e.ratio) : (e.amount ?? 0);
          // 음수면 체력 손실(이벤트로는 쓰러지지 않는다: 최소 1)
          r.hp = Math.max(Math.min(r.hp, 1), Math.min(r.maxHp, r.hp + amount));
        }
        out.push('출전 동료 회복');
        break;
      case 'gain_run_mana':
        run.mana = Math.max(0, Math.min(data.balance.mana.max, run.mana + (e.amount ?? 0)));
        out.push(`마나 ${e.amount! >= 0 ? '+' : ''}${e.amount}`);
        break;
      case 'scar':
        run.scar = Math.max(0, run.scar + (e.amount ?? 0));
        out.push(`상흔 ${e.amount}`);
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
        out.push(`골드 ${e.amount! >= 0 ? '+' : ''}${e.amount}`);
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
        // relic이 없으면 가지지 않은 유물 중 무작위(보스 유물 제외, rarity가 있으면 그 등급만)
        let id = e.relic;
        if (!id) {
          const pool = [...data.relics.values()].filter(
            (r) => r.rarity !== 'boss' && !run.relics.includes(r.id) && (!e.rarity || (e.rarity as string[]).includes(r.rarity)),
          );
          id = pool.length ? rng.pick(pool).id : undefined;
        }
        if (id) out.push(...gainRelic(data, run, id));
        else {
          run.gold += 50;
          out.push('더 얻을 유물이 없다 — 골드 +50');
        }
        break;
      }
      case 'gain_potion': {
        const def = data.potions.get(e.potion ?? '');
        if (!def) throw new Error(`gain_potion: 알 수 없는 물약 ${e.potion}`);
        out.push(gainPotion(data, run, def.id) ? `물약 획득: ${def.name}` : `물약 칸이 가득해 ${def.name}을(를) 두고 왔다`);
        break;
      }
      default:
        throw new Error(`전투 동작 "${e.op}"은 런 단위에서 쓸 수 없다`);
    }
  }
  return out;
}

/** 어려움 배율(스테이지별, 없으면 1) */
export function hardMul(data: GameData, stageId: string): { hp: number; dmg: number } {
  return data.balance.difficulty.hard.byStage[stageId] ?? { hp: 1, dmg: 1 };
}

// 런(한 번의 플레이) 상태: 파티 편성, 덱, 런 마나, 상흔, 플래그, 지도 진행.
import type { GameData } from './data';
import type { Effect, ModuleDef } from './schema';
import { createRng } from './rng';
import { findNode, generateStageMap, type MapNode, type StageMap } from './route';
import type { BattleOutcome, BattleSetup } from './battle';
import type { CardInstance } from './state';

export interface RosterEntry {
  id: string;
  hp: number;
  maxHp: number;
}

export interface RunState {
  seed: string;
  stageId: string;
  map: StageMap;
  position: string | null;
  visited: string[];
  roster: RosterEntry[];
  selected: string[];
  deck: CardInstance[];
  mana: number;
  scar: number;
  flags: string[];
  usedModules: string[];
  supportActive: boolean;
  /** map: 지도 / stage_clear: 보스를 넘고 다음 스테이지 대기 / complete: 캠페인(구현된 범위) 끝 / defeat */
  status: 'map' | 'stage_clear' | 'complete' | 'defeat';
  counter: number;
}

export interface RunOptions {
  stageId?: string;
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
    roster: [{ id: 'haun', hp: haun.maxHp, maxHp: haun.maxHp }],
    selected: ['haun'],
    deck: [],
    mana: data.balance.mana.max,
    scar: 0,
    flags: [],
    usedModules: [],
    supportActive: opts.supportActive ?? false,
    status: 'map',
    counter: 0,
  };
  for (const cardId of haun.starterDeck) addCard(run, cardId);
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
  }
  run.selected = run.roster.filter((r) => data.characters.get(r.id)?.role === 'fighter').slice(0, data.balance.party.max).map((r) => r.id);
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
  run.map = buildMap(data, run);
  run.status = 'map';
  return true;
}

export function addCard(run: RunState, cardId: string, level = 0): CardInstance {
  run.counter += 1;
  const card = { uid: `c${run.counter}`, cardId, level };
  run.deck.push(card);
  return card;
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

export function battleSetupFor(data: GameData, run: RunState, enc: Encounter): BattleSetup {
  const { bonus, startEffects: always = [], mana } = enc.module.content;
  const bonusOn =
    !!bonus &&
    (!bonus.condition.partyHas || run.selected.includes(bonus.condition.partyHas)) &&
    (!bonus.condition.flag || run.flags.includes(bonus.condition.flag));
  const stage = data.stages.find((s) => s.id === run.stageId)!;
  return {
    world: stageWorld(data, run),
    party: run.selected.map((id) => {
      const r = run.roster.find((x) => x.id === id)!;
      return { id, hp: r.hp, maxHp: r.maxHp };
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
  };
}

/** 전투 결과를 런에 반영한다. 보스를 이기면 clearEffects를 적용하고 그 결과 메시지를 돌려준다 */
export function applyBattleOutcome(data: GameData, run: RunState, enc: Encounter, outcome: BattleOutcome): string[] {
  for (const p of outcome.party) {
    const r = run.roster.find((x) => x.id === p.id);
    if (r) r.hp = Math.max(0, Math.min(r.maxHp, p.hp));
  }
  run.mana = outcome.mana;
  run.scar += outcome.scarGain;
  if (outcome.result === 'defeat') {
    run.status = 'defeat';
    return [];
  }
  if (enc.node.type !== 'boss') return [];
  run.status = 'stage_clear';
  return applyRunOps(data, run, enc.module.content.clearEffects ?? []);
}

/**
 * 전투 보상 카드 후보. 출전 멤버(와 공용)의 보상 풀에서, 노드 유형별 등급 가중치(balance.rewards.rarityWeights)로
 * 등급을 먼저 뽑고 그 등급에서 카드를 고른다. 같은 카드는 한 번만. 시드로 결정된다.
 */
export function rewardOptions(data: GameData, run: RunState, nodeId: string): string[] {
  const owners = new Set(run.selected);
  const pool = [...data.cards.values()].filter(
    (c) => c.pool === 'reward' && (owners.has(c.owner) || !data.characters.has(c.owner)),
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
}

export function choicesFor(data: GameData, run: RunState, module: ModuleDef): ChoiceView[] {
  const list: ChoiceView[] = (module.content.choices ?? [])
    .filter((c) => !c.condition?.partyHas || run.selected.includes(c.condition.partyHas))
    .filter((c) => !c.condition?.flag || run.flags.includes(c.condition.flag))
    .map((c) => ({ label: c.label, effects: c.effects, result: c.result, source: 'module' as const }));
  if (module.type === 'rest' && run.supportActive) {
    for (const rule of data.support.filter((r) => r.trigger === 'restOption')) {
      list.push({ label: `[왕일검] ${rule.name}`, effects: rule.effects, result: rule.description, source: 'support' });
    }
  }
  return list;
}

/** pick: 선택지에 고르는 강화(upgrade_card choose)가 있으면 사람이 고른 카드 uid */
export function applyChoice(data: GameData, run: RunState, module: ModuleDef, index: number, pick?: string): string[] {
  const choice = choicesFor(data, run, module)[index];
  if (!choice) throw new Error('없는 선택지');
  return applyRunOps(data, run, choice.effects, { pick });
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
      case 'gain_card': {
        const def = data.cards.get(e.card ?? '');
        if (!def) throw new Error(`gain_card: 알 수 없는 카드 ${e.card}`);
        for (let i = 0; i < (e.count ?? 1); i++) addCard(run, def.id);
        out.push(`카드 획득: ${def.name}`);
        break;
      }
      case 'remove_card': {
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
          c.level += 1;
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
        if (def.role === 'support') {
          run.supportActive = true;
          if (!run.flags.includes(`support:${def.id}`)) run.flags.push(`support:${def.id}`);
        } else {
          run.roster.push({ id: def.id, hp: def.maxHp, maxHp: def.maxHp });
          for (const cardId of def.starterDeck) addCard(run, cardId);
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
      default:
        throw new Error(`전투 동작 "${e.op}"은 런 단위에서 쓸 수 없다`);
    }
  }
  return out;
}

// 전투 진행: 생성 → 플레이어 턴(카드 사용) → 턴 종료 → 적 턴 → 다음 턴.
import type { GameData } from './data';
import type { Effect, World, WorldMana } from './schema';
import type { Rng } from './rng';
import {
  addStatus,
  changeRift,
  checkCondition,
  dealDamage,
  drawCards,
  fireSupport,
  hasSkipTurn,
  loseHp,
  newCard,
  previewDamage,
  previewDamageOn,
  runEffects,
  setResult,
} from './effects';
import {
  alive,
  isFusion,
  resolveCard,
  type BattleState,
  type CardInstance,
  type Combatant,
  type EnemyState,
  type Intent,
} from './state';

export interface PartySlot {
  id: string;
  hp: number;
  maxHp: number;
}

export interface BattleSetup {
  world: World;
  party: PartySlot[];
  enemies: string[];
  deck: CardInstance[];
  /** 전투 시작 전 마나(무림·틈처럼 이월하는 세계에서 쓰임) */
  mana: number;
  rng: Rng;
  /** 왕일검 지원 규칙 활성 여부 */
  supportActive: boolean;
  flags?: string[];
  scar?: number;
  /** 모듈 보너스 등 전투 시작 효과 */
  startEffects?: Effect[];
  /** 이 턴 수를 버티면 승리(모듈 content.surviveTurns) */
  surviveTurns?: number;
  /** 마나 규칙 덮어쓰기(스테이지 mana → 모듈 content.mana). 생략하면 세계 기본값 */
  manaRule?: WorldMana;
}

export function createBattle(data: GameData, setup: BattleSetup): BattleState {
  const bal = data.balance;
  if (setup.party.length === 0 || setup.party.length > bal.party.max) {
    throw new Error(`출전 인원은 1~${bal.party.max}명이어야 한다`);
  }
  if (!setup.party.some((p) => p.id === 'haun')) throw new Error('하운은 항상 출전한다');

  const party: Combatant[] = setup.party.map((p, i) => {
    const def = data.characters.get(p.id);
    if (!def || def.role !== 'fighter') throw new Error(`출전할 수 없는 캐릭터: ${p.id}`);
    return { uid: `p${i}`, defId: p.id, name: def.name, side: 'party', hp: p.hp, maxHp: p.maxHp, block: 0, statuses: {}, downed: p.hp <= 0 };
  });
  const enemies: EnemyState[] = setup.enemies.map((id, i) => {
    const def = data.enemies.get(id);
    if (!def) throw new Error(`알 수 없는 적: ${id}`);
    const statuses: Record<string, number> = {};
    for (const t of def.traits) statuses[t.status] = t.stacks;
    const maxHp = def.maxHp + (def.hpPerScar ?? 0) * (setup.scar ?? 0);
    return {
      uid: `e${i}`, defId: id, name: def.name, side: 'enemy', hp: maxHp, maxHp, block: 0,
      statuses, downed: false, moveCursor: 0, lastMoves: [], intent: null,
    };
  });

  const worldMana = setup.manaRule ?? bal.mana.worlds[setup.world];
  const startMana =
    worldMana.battleStart === 'full' ? bal.mana.max : worldMana.battleStart === 'carry' ? setup.mana : worldMana.battleStart;
  const state: BattleState = {
    data,
    rng: setup.rng,
    world: setup.world,
    turn: 0,
    neigong: 0,
    neigongMax: bal.neigongPerTurn,
    manaRule: worldMana,
    mana: Math.max(0, Math.min(bal.mana.max, startMana)),
    rift: 0,
    party,
    enemies,
    draw: [],
    hand: [],
    discard: [],
    exhaust: [],
    events: [],
    log: [],
    result: null,
    surviveTurns: setup.surviveTurns ?? null,
    survived: false,
    supportRules: setup.supportActive ? data.support : [],
    supportUsed: [],
    flags: setup.flags ?? [],
    scar: setup.scar ?? 0,
    uidCounter: 0,
  };

  // 출전 멤버의 카드만 덱에 들어간다(공용 카드는 항상)
  const members = new Set(setup.party.map((p) => p.id));
  const deck = setup.deck.filter((c) => {
    const owner = data.cards.get(c.cardId)?.owner;
    return owner === undefined || !data.characters.has(owner) || members.has(owner);
  });
  state.draw = state.rng.shuffle(deck.map((c) => ({ ...c })));
  // 선천(innate) 카드는 맨 위로
  state.draw.sort((a, b) => Number(resolveCard(data, a).keywords.includes('innate')) - Number(resolveCard(data, b).keywords.includes('innate')));

  fireSupport(state, 'battleStart', {});
  if (setup.startEffects?.length) {
    runEffects(state, setup.startEffects, { source: party.find((p) => p.defId === 'haun')! });
  }
  startPlayerTurn(state);
  return state;
}

function startPlayerTurn(state: BattleState): void {
  const bal = state.data.balance;
  state.turn += 1;
  state.events.push({ type: 'turn', turn: state.turn });
  state.neigong = state.neigongMax;
  if (state.turn > 1) {
    const per = state.manaRule.perTurn;
    state.mana = Math.max(0, Math.min(bal.mana.max, state.mana + per));
  }
  for (const p of state.party) p.block = 0;
  applyTurnStartStatuses(state, state.party);
  if (state.result) return;
  drawCards(state, bal.handSize);
  fireSupport(state, 'turnStart', {});
  rollIntents(state);
}

function applyTurnStartStatuses(state: BattleState, list: Combatant[]): void {
  for (const c of alive(list)) {
    for (const [id, stacks] of Object.entries(c.statuses)) {
      const per = state.data.statuses.get(id)?.modifiers.turnStartDamagePerStack;
      if (!per || stacks <= 0) continue;
      // 음수면 회복(고르몬: 산이 메운다)
      if (per > 0) loseHp(state, c, per * stacks);
      else {
        const healed = Math.min(c.maxHp - c.hp, -per * stacks);
        if (healed > 0) {
          c.hp += healed;
          state.events.push({ type: 'heal', targetUid: c.uid, amount: healed });
        }
      }
    }
  }
}

function decayStatuses(state: BattleState, list: Combatant[], when: 'ownTurnEnd' | 'roundEnd'): void {
  for (const c of list) {
    for (const [id, stacks] of Object.entries(c.statuses)) {
      const def = state.data.statuses.get(id);
      if (!def || def.decay === 0 || def.decayAt !== when) continue;
      const next = stacks - def.decay;
      if (next <= 0) delete c.statuses[id];
      else c.statuses[id] = next;
    }
  }
}

// ───────────────────────── 적 의도 ─────────────────────────

/** 적이 노릴 수 있는 아군: 흐르지 않는 자(고리 멈추기)는 빠진다 */
function targetable(state: BattleState): Combatant[] {
  return alive(state.party).filter((p) => !isUnseen(state, p));
}

function isUnseen(state: BattleState, c: Combatant): boolean {
  return Object.entries(c.statuses).some(([id, n]) => n > 0 && state.data.statuses.get(id)?.special === 'unseen');
}

function pickTarget(state: BattleState, targeting: string): Combatant | null {
  const pool = targetable(state);
  if (pool.length === 0) return null;
  switch (targeting) {
    case 'lowest_hp':
      return [...pool].sort((a, b) => a.hp - b.hp)[0];
    case 'highest_hp':
      return [...pool].sort((a, b) => b.hp - a.hp)[0];
    case 'haun':
      return pool.find((p) => p.defId === 'haun') ?? pool[0];
    default:
      return state.rng.pick(pool);
  }
}

function rollIntents(state: BattleState): void {
  for (const enemy of alive(state.enemies)) {
    const def = state.data.enemies.get(enemy.defId)!;
    let move = def.moves[0];
    if (def.pattern === 'cycle') {
      move = def.moves[enemy.moveCursor % def.moves.length];
      enemy.moveCursor += 1;
    } else {
      // 같은 행동을 세 번 연속 하지 않는다
      const banned = enemy.lastMoves.length >= 2 && enemy.lastMoves[0] === enemy.lastMoves[1] ? enemy.lastMoves[0] : null;
      const options = def.moves.filter((m) => m.id !== banned);
      move = state.rng.weighted(options, (m) => m.weight) ?? def.moves[0];
    }
    enemy.lastMoves = [move.id, ...enemy.lastMoves].slice(0, 2);
    const targetsParty = move.effects.some(
      (e) => (e.target ?? (e.op === 'damage' || e.op === 'apply_status' ? 'enemy' : 'self')) === 'enemy',
    );
    const target = targetsParty ? pickTarget(state, move.targeting) : null;
    enemy.intent = { moveId: move.id, name: move.name, kind: move.intent, targetUid: target?.uid ?? null };
  }
}

export interface IntentView {
  intent: Intent;
  /** 공격이면 1회 예상 피해와 횟수 */
  damage?: { perHit: number; times: number; all: boolean };
}

export function describeIntent(state: BattleState, enemy: EnemyState): IntentView | null {
  if (!enemy.intent) return null;
  const def = state.data.enemies.get(enemy.defId)!;
  const move = def.moves.find((m) => m.id === enemy.intent!.moveId)!;
  const dmg = move.effects.find((e) => e.op === 'damage');
  if (!dmg) return { intent: enemy.intent };
  return {
    intent: enemy.intent,
    damage: { perHit: previewDamage(state, enemy, dmg.amount ?? 0), times: dmg.times ?? 1, all: dmg.target === 'all_enemies' },
  };
}

export interface IncomingHit {
  enemyName: string;
  moveName: string;
  perHit: number;
  times: number;
}

/** 아군 한 명이 이번 적 턴에 받을 피해 예고 */
export interface IncomingView {
  /** 방어 전 피해 합 */
  raw: number;
  /** 지금 방어로 막을 양 */
  blocked: number;
  /** 체력에서 깎일 양 */
  hpLoss: number;
  /** 이대로면 쓰러진다 */
  lethal: boolean;
  hits: IncomingHit[];
}

/**
 * 받을 피해 예고: 적 의도(대상은 의도를 정할 때 이미 골랐다)를 따라 아군마다 이번 적 턴의 피해를 더하고 지금 방어를 뺀다.
 * 도발·움직이지 못함·전체 공격·힘·약화·취약을 반영한다. 적 행동 중에 바뀌는 것(다른 적의 버프, 쓰러진 대상의 재선택)은 넣지 않는다.
 */
export function incomingDamage(state: BattleState): Map<string, IncomingView> {
  const out = new Map<string, IncomingView>();
  const party = alive(state.party);
  const taunter = party.find((p) => (p.statuses.taunt ?? 0) > 0);
  for (const enemy of alive(state.enemies)) {
    if (!enemy.intent || hasSkipTurn(state, enemy)) continue;
    const move = state.data.enemies.get(enemy.defId)!.moves.find((m) => m.id === enemy.intent!.moveId);
    if (!move) continue;
    for (const e of move.effects) {
      if (e.op !== 'damage') continue;
      const target = e.target ?? 'enemy';
      let targets: Combatant[] = [];
      if (target === 'all_enemies') targets = party;
      else if (target === 'enemy') {
        const uid = taunter && enemy.intent.targetUid ? taunter.uid : enemy.intent.targetUid;
        const t = party.find((p) => p.uid === uid);
        if (t && !isUnseen(state, t)) targets = [t];
      }
      const times = e.times ?? 1;
      for (const t of targets) {
        const perHit = previewDamageOn(state, enemy, t, e.amount ?? 0);
        const v = out.get(t.uid) ?? { raw: 0, blocked: 0, hpLoss: 0, lethal: false, hits: [] };
        v.raw += perHit * times;
        v.hits.push({ enemyName: enemy.name, moveName: move.name, perHit, times });
        out.set(t.uid, v);
      }
    }
  }
  for (const [uid, v] of out) {
    const t = party.find((p) => p.uid === uid)!;
    v.blocked = Math.min(t.block, v.raw);
    v.hpLoss = v.raw - v.blocked;
    v.lethal = v.hpLoss >= t.hp;
  }
  return out;
}

// ───────────────────────── 카드 사용 ─────────────────────────

export type PlayCheck = { ok: true } | { ok: false; reason: string };

export function cardOwner(state: BattleState, inst: CardInstance): Combatant | undefined {
  const owner = state.data.cards.get(inst.cardId)?.owner;
  const member = state.party.find((p) => p.defId === owner);
  if (member) return member;
  // 공용 카드는 하운이 쓴다. 출전하지 않은 동료의 카드는 주인이 없다.
  return owner && state.data.characters.has(owner) ? undefined : state.party.find((p) => p.defId === 'haun');
}

export function needsTarget(state: BattleState, inst: CardInstance): 'enemy' | 'ally' | null {
  const t = resolveCard(state.data, inst).def.target;
  return t === 'enemy' ? 'enemy' : t === 'ally' ? 'ally' : null;
}

export function canPlay(state: BattleState, handIndex: number): PlayCheck {
  if (state.result) return { ok: false, reason: '전투가 끝났다' };
  const inst = state.hand[handIndex];
  if (!inst) return { ok: false, reason: '카드 없음' };
  const card = resolveCard(state.data, inst);
  if (card.keywords.includes('unplayable')) return { ok: false, reason: '사용할 수 없는 카드' };
  const owner = cardOwner(state, inst);
  if (!owner || owner.downed) return { ok: false, reason: '카드 주인이 쓰러졌다' };
  if (hasSkipTurn(state, owner)) return { ok: false, reason: `${owner.name}이(가) 움직일 수 없다` };
  if (state.neigong < card.cost.neigong) return { ok: false, reason: '내공 부족' };
  if (state.mana < card.cost.mana) return { ok: false, reason: '마나 부족' };
  return { ok: true };
}

export function playCard(state: BattleState, handIndex: number, targetUid?: string): PlayCheck {
  const check = canPlay(state, handIndex);
  if (!check.ok) return check;
  const inst = state.hand[handIndex];
  const card = resolveCard(state.data, inst);
  const need = needsTarget(state, inst);
  if (need === 'enemy' && !alive(state.enemies).some((e) => e.uid === targetUid)) {
    return { ok: false, reason: '대상을 골라야 한다' };
  }
  if (need === 'ally' && !alive(state.party).some((p) => p.uid === targetUid)) {
    return { ok: false, reason: '아군 대상을 골라야 한다' };
  }
  const owner = cardOwner(state, inst)!;
  state.neigong -= card.cost.neigong;
  state.mana -= card.cost.mana;
  state.hand.splice(handIndex, 1);
  state.events.push({ type: 'card', cardId: inst.cardId, sourceUid: owner.uid });
  state.log.push(`${owner.name}: ${card.def.name}${isFusion(card) ? ' [융합]' : ''}`);
  runEffects(state, card.effects, { source: owner, card, chosenUid: targetUid });
  if (card.keywords.includes('exhaust')) state.exhaust.push(inst);
  else state.discard.push(inst);
  return { ok: true };
}

/** 전투 상태 복제(데이터·지원 규칙은 공유, RNG는 같은 위치에서 이어지는 사본) */
export function cloneBattle(s: BattleState): BattleState {
  const unit = <T extends Combatant>(c: T): T => ({ ...c, statuses: { ...c.statuses } });
  const cards = (list: CardInstance[]) => list.map((c) => ({ ...c }));
  return {
    ...s,
    rng: s.rng.clone(),
    party: s.party.map(unit),
    enemies: s.enemies.map((e) => ({ ...unit(e), lastMoves: [...e.lastMoves], intent: e.intent ? { ...e.intent } : null })),
    draw: cards(s.draw),
    hand: cards(s.hand),
    discard: cards(s.discard),
    exhaust: cards(s.exhaust),
    events: [],
    log: [],
    supportUsed: [...s.supportUsed],
    flags: [...s.flags],
  };
}

/** 카드 한 장을 썼을 때 대상마다 들어갈 피해 */
export interface CardPreviewHit {
  /** 체력에서 깎일 양(흡수는 뺀다) */
  hpLoss: number;
  /** 방어로 막힐 양 */
  blocked: number;
  /** 피해 횟수 */
  hits: number;
  /** 이 카드로 쓰러진다 */
  kills: boolean;
}

/**
 * 피해 미리보기: 전투 상태를 복제해 그 카드를 실제로 써 보고 피해 이벤트를 모은다.
 * 힘·약화·취약·결 노출·방어·특수 상태 등 엔진의 계산을 그대로 따르므로 화면 숫자와 실제 피해가 어긋나지 않는다.
 * 쓸 수 없는 카드면 빈 지도.
 */
export function previewCard(state: BattleState, handIndex: number, targetUid?: string): Map<string, CardPreviewHit> {
  const out = new Map<string, CardPreviewHit>();
  if (!canPlay(state, handIndex).ok) return out;
  const c = cloneBattle(state);
  if (!playCard(c, handIndex, targetUid).ok) return out;
  for (const ev of c.events) {
    if (ev.type !== 'damage' || ev.absorbed) continue;
    const v = out.get(ev.targetUid) ?? { hpLoss: 0, blocked: 0, hits: 0, kills: false };
    v.hpLoss += ev.amount;
    v.blocked += ev.blocked;
    v.hits += 1;
    out.set(ev.targetUid, v);
  }
  for (const [uid, v] of out) {
    const before = [...state.party, ...state.enemies].find((u) => u.uid === uid);
    v.kills = !!before && !before.downed && !![...c.party, ...c.enemies].find((u) => u.uid === uid)?.downed;
  }
  return out;
}

// ───────────────────────── 턴 종료와 적 턴 ─────────────────────────

export function endTurn(state: BattleState): void {
  if (state.result) return;
  const bal = state.data.balance;
  // 손패 정리(유지 카드 제외)
  const keep: CardInstance[] = [];
  for (const c of state.hand) {
    if (resolveCard(state.data, c).keywords.includes('retain')) keep.push(c);
    else state.discard.push(c);
  }
  state.hand = keep;
  decayStatuses(state, state.party, 'ownTurnEnd');

  // 균열: 세계별 감쇠 뒤, 임계치 이상이면 틈의 잔향
  const decay = bal.rift.decay[state.world];
  if (decay > 0 && state.rift > 0) changeRift(state, -decay);
  if (state.rift >= bal.rift.echoThreshold) {
    state.discard.push(newCard(state, bal.rift.echoCard));
    state.events.push({ type: 'echo' });
    state.log.push('틈의 잔향이 덱에 섞였다.');
  }

  enemyTurn(state);
  if (state.result) return;
  // 버티기 전투: 정한 턴의 적 행동까지 견디면 승리
  if (state.surviveTurns !== null && state.turn >= state.surviveTurns) {
    state.survived = true;
    state.events.push({ type: 'survived', turns: state.turn });
    state.log.push(`${state.turn}턴을 버텼다.`);
    setResult(state, 'victory');
    return;
  }
  decayStatuses(state, state.enemies, 'ownTurnEnd');
  decayStatuses(state, [...state.party, ...state.enemies], 'roundEnd');
  startPlayerTurn(state);
}

function enemyTurn(state: BattleState): void {
  for (const e of state.enemies) e.block = 0;
  applyTurnStartStatuses(state, state.enemies);
  for (const enemy of state.enemies) {
    if (state.result) return;
    if (enemy.downed || !enemy.intent) continue;
    if (hasSkipTurn(state, enemy)) {
      state.events.push({ type: 'skip', uid: enemy.uid });
      state.log.push(`${enemy.name}은(는) 움직이지 못한다.`);
      continue;
    }
    const def = state.data.enemies.get(enemy.defId)!;
    const move = def.moves.find((m) => m.id === enemy.intent!.moveId)!;
    // 도발한 동료가 있으면 그쪽으로, 원래 대상이 쓰러졌으면 다시 고른다
    let targetUid = enemy.intent.targetUid ?? undefined;
    const taunter = alive(state.party).find((p) => (p.statuses.taunt ?? 0) > 0);
    if (targetUid && taunter) targetUid = taunter.uid;
    const intended = targetUid ? state.party.find((p) => p.uid === targetUid) : undefined;
    if (intended?.downed) targetUid = pickTarget(state, move.targeting)?.uid;
    else if (intended && isUnseen(state, intended)) {
      // 흐르지 않는 자: 냄새를 놓친다. 다른 아군이 있으면 그쪽으로, 없으면 헛손질
      const other = pickTarget(state, move.targeting);
      if (!other) {
        state.events.push({ type: 'enemy_action', uid: enemy.uid, moveName: move.name });
        state.events.push({ type: 'skip', uid: enemy.uid });
        state.log.push(`${enemy.name}: ${move.name} — 하운을 놓쳤다.`);
        continue;
      }
      targetUid = other.uid;
    }
    state.events.push({ type: 'enemy_action', uid: enemy.uid, moveName: move.name });
    state.log.push(`${enemy.name}: ${move.name}`);
    runEffects(state, move.effects, { source: enemy, chosenUid: targetUid });
  }
  if (!state.result && alive(state.party).length === 0) setResult(state, 'defeat');
}

// ───────────────────────── 결과 ─────────────────────────

export interface BattleOutcome {
  result: 'victory' | 'defeat';
  /** 버티기로 끝났다 */
  survived: boolean;
  party: { id: string; hp: number }[];
  mana: number;
  scarGain: number;
}

export function battleOutcome(state: BattleState): BattleOutcome | null {
  if (!state.result) return null;
  const bal = state.data.balance;
  return {
    result: state.result,
    survived: state.survived,
    party: state.party.map((p) => ({ id: p.defId, hp: p.downed ? bal.party.reviveHp : p.hp })),
    mana: state.mana,
    scarGain: Math.floor(state.rift * bal.rift.scarRatio),
  };
}

/** 테스트·디버그용: 엔진 내부 도우미를 다시 내보낸다 */
export const _internal = { addStatus, dealDamage, changeRift, checkCondition, drawCards };

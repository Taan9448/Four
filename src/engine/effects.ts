// 효과 해석기. 카드·적 행동·지원 규칙의 효과는 모두 여기서 기본 동작의 조합으로만 해석된다.
// 카드별 개별 코드는 두지 않는다. 기본 동작 목록은 docs/CARD_EFFECTS.md 참고.
import { BATTLE_OPS, type Condition, type Effect, type SupportRule } from './schema';
import {
  alive,
  findCombatant,
  statusName,
  type BattleState,
  type CardInstance,
  type Combatant,
  type ResolvedCard,
} from './state';

export interface EffectContext {
  /** 효과를 일으킨 쪽. null이면 지원 규칙 등 시스템(아군 편으로 취급). */
  source: Combatant | null;
  card?: ResolvedCard;
  /** 카드/행동이 지정한 대상 */
  chosenUid?: string;
  /** 지원 규칙을 일으킨 적 */
  triggerUid?: string;
}

const BATTLE_OP_SET = new Set<string>(BATTLE_OPS);

// ───────────────────────── 조건과 수치 ─────────────────────────

export function checkCondition(
  state: BattleState,
  cond: Condition | undefined,
  ctx: EffectContext,
  target?: Combatant,
): boolean {
  if (!cond) return true;
  if (cond.riftGte !== undefined && state.rift < cond.riftGte) return false;
  if (cond.riftLte !== undefined && state.rift > cond.riftLte) return false;
  if (cond.targetHasStatus !== undefined && !((target?.statuses[cond.targetHasStatus] ?? 0) > 0)) return false;
  if (cond.targetStatusGte !== undefined) {
    const [s, n] = cond.targetStatusGte;
    if ((target?.statuses[s] ?? 0) < n) return false;
  }
  if (cond.world !== undefined) {
    const worlds = Array.isArray(cond.world) ? cond.world : [cond.world];
    if (!worlds.includes(state.world)) return false;
  }
  if (cond.partyHas !== undefined && !state.party.some((p) => p.defId === cond.partyHas && !p.downed)) return false;
  if (cond.turnMod !== undefined && state.turn % cond.turnMod[0] !== cond.turnMod[1]) return false;
  if (cond.enemyId !== undefined || cond.hpRatioLte !== undefined) {
    const trig = ctx.triggerUid ? findCombatant(state, ctx.triggerUid) : target;
    if (!trig) return false;
    if (cond.enemyId !== undefined && trig.defId !== cond.enemyId) return false;
    if (cond.hpRatioLte !== undefined && trig.hp / trig.maxHp > cond.hpRatioLte) return false;
  }
  if (cond.flag !== undefined && !state.flags.includes(cond.flag)) return false;
  if (cond.scarMin !== undefined && state.scar < cond.scarMin) return false;
  // floorRange는 경로 생성용 조건이라 전투에서는 항상 참
  return true;
}

function amountOf(state: BattleState, effect: Effect, target?: Combatant): number {
  let amount = effect.amount ?? effect.stacks ?? 0;
  const sc = effect.scale;
  if (sc) {
    let per = 0;
    if (sc.per === 'rift') per = state.rift;
    else if (sc.per === 'hand') per = state.hand.length;
    else if (sc.per === 'mana') per = state.mana;
    else if (sc.per === 'targetStatus' && sc.status) per = target?.statuses[sc.status] ?? 0;
    amount += sc.amount * per;
  }
  return amount;
}

// ───────────────────────── 대상 ─────────────────────────

function sidesOf(state: BattleState, source: Combatant | null) {
  const side = source?.side ?? 'party';
  const own: Combatant[] = side === 'party' ? state.party : state.enemies;
  const opposing: Combatant[] = side === 'party' ? state.enemies : state.party;
  return { own, opposing };
}

function defaultTarget(effect: Effect, ctx: EffectContext): NonNullable<Effect['target']> {
  const cardTarget = ctx.card?.def.target;
  switch (effect.op) {
    case 'damage':
    case 'apply_status':
    case 'reveal_grain':
      return cardTarget === 'all_enemies' ? 'all_enemies' : 'enemy';
    default:
      return cardTarget === 'all_allies' ? 'all_allies' : 'self';
  }
}

export function resolveTargets(state: BattleState, effect: Effect, ctx: EffectContext): Combatant[] {
  const target = effect.target ?? defaultTarget(effect, ctx);
  const { own, opposing } = sidesOf(state, ctx.source);
  const haun = state.party.find((p) => p.defId === 'haun') ?? state.party[0];
  const chosen = ctx.chosenUid ? findCombatant(state, ctx.chosenUid) : undefined;
  switch (target) {
    case 'self':
      return [ctx.source ?? haun].filter((c) => c && !c.downed);
    case 'ally': {
      if (chosen && own.includes(chosen) && !chosen.downed) return [chosen];
      return [ctx.source ?? haun].filter((c) => c && !c.downed);
    }
    case 'enemy': {
      if (chosen && opposing.includes(chosen) && !chosen.downed) return [chosen];
      const pool = alive(opposing);
      return pool.length ? [state.rng.pick(pool)] : [];
    }
    case 'all_enemies':
      return alive(opposing);
    case 'all_allies':
      return alive(own);
    case 'random_enemy': {
      const pool = alive(opposing);
      return pool.length ? [state.rng.pick(pool)] : [];
    }
    case 'trigger_enemy': {
      const t = ctx.triggerUid ? findCombatant(state, ctx.triggerUid) : undefined;
      return t && !t.downed ? [t] : [];
    }
  }
}

// ───────────────────────── 상태 ─────────────────────────

export function addStatus(state: BattleState, target: Combatant, status: string, stacks: number): void {
  if (!state.data.statuses.has(status)) throw new Error(`알 수 없는 상태: ${status}`);
  const next = (target.statuses[status] ?? 0) + stacks;
  if (next <= 0) delete target.statuses[status];
  else target.statuses[status] = next;
  state.events.push({ type: 'status', targetUid: target.uid, status, stacks });
  if (stacks > 0) state.log.push(`${target.name}: ${statusName(state, status)} ${stacks > 0 ? '+' : ''}${stacks}`);
  // 매듭: 결 노출이 임계치에 이르면 매듭이 드러난다
  if (
    status === 'grain' &&
    (target.statuses.knot ?? 0) > 0 &&
    !(target.statuses.knot_exposed > 0) &&
    (target.statuses.grain ?? 0) >= state.data.balance.grain.knotThreshold
  ) {
    target.statuses.knot_exposed = 1;
    state.events.push({ type: 'status', targetUid: target.uid, status: 'knot_exposed', stacks: 1 });
    state.log.push(`${target.name}의 매듭이 드러났다.`);
  }
}

function statusModifier(state: BattleState, c: Combatant, key: 'damageDealtMul' | 'damageTakenMul'): number {
  let mul = 1;
  for (const [id, stacks] of Object.entries(c.statuses)) {
    if (stacks <= 0) continue;
    const m = state.data.statuses.get(id)?.modifiers[key];
    if (m !== undefined) mul *= m;
  }
  return mul;
}

function strengthBonus(state: BattleState, c: Combatant): number {
  let add = 0;
  for (const [id, stacks] of Object.entries(c.statuses)) {
    const per = state.data.statuses.get(id)?.modifiers.damageDealtAddPerStack;
    if (per !== undefined) add += per * stacks;
  }
  return add;
}

export function hasSkipTurn(state: BattleState, c: Combatant): boolean {
  return Object.entries(c.statuses).some(([id, n]) => n > 0 && state.data.statuses.get(id)?.modifiers.skipTurn);
}

/** 의도 표시용: 공격 1회의 예상 피해(대상 보정 제외) */
export function previewDamage(state: BattleState, source: Combatant, base: number): number {
  return Math.max(0, Math.floor((base + strengthBonus(state, source)) * statusModifier(state, source, 'damageDealtMul')));
}

// ───────────────────────── 피해·균열 ─────────────────────────

export function dealDamage(
  state: BattleState,
  source: Combatant | null,
  target: Combatant,
  base: number,
  ctx: EffectContext,
): void {
  if (target.downed) return;
  const bal = state.data.balance;
  let dmg = base;
  if (source) {
    dmg += strengthBonus(state, source);
    dmg *= statusModifier(state, source, 'damageDealtMul');
  }
  const card = ctx.card;
  const usesFlow = !!card && (card.cost.neigong > 0 || card.cost.mana > 0);
  // 무형: 내공만 소모하는 공격은 절반
  if (card && target.statuses.incorporeal > 0 && card.cost.neigong > 0 && card.cost.mana === 0) {
    dmg *= bal.incorporealMultiplier;
  }
  // 결 노출: 1스택 소모, 피해 증가, 방어 무시
  let grain = false;
  if (source?.side === 'party' && (target.statuses.grain ?? 0) > 0) {
    grain = true;
    target.statuses.grain -= 1;
    if (target.statuses.grain <= 0) delete target.statuses.grain;
    dmg *= 1 + bal.grain.damageBonus;
  }
  dmg *= statusModifier(state, target, 'damageTakenMul');
  dmg = Math.max(0, Math.floor(dmg));

  // 흐름 포식: 흐름을 쓴 카드의 피해를 먹는다
  if (usesFlow && target.statuses.flow_eater > 0) {
    target.maxHp += dmg;
    target.hp += dmg;
    state.events.push({ type: 'damage', sourceUid: source?.uid ?? null, targetUid: target.uid, amount: dmg, blocked: 0, grain, absorbed: true });
    state.log.push(`${target.name}이(가) 흐름을 먹었다. (+${dmg})`);
    return;
  }

  let blocked = 0;
  if (!(grain && bal.grain.ignoreBlock)) {
    blocked = Math.min(target.block, dmg);
    target.block -= blocked;
  }
  const hpLoss = dmg - blocked;
  target.hp = Math.max(0, target.hp - hpLoss);
  state.events.push({ type: 'damage', sourceUid: source?.uid ?? null, targetUid: target.uid, amount: hpLoss, blocked, grain, absorbed: false });
  state.log.push(`${source?.name ?? '?'} → ${target.name} 피해 ${hpLoss}${blocked ? ` (방어 ${blocked})` : ''}${grain ? ' [결]' : ''}`);
  if (target.hp <= 0) knockOut(state, target);
  if (target.side === 'enemy' && !target.downed) {
    fireSupport(state, 'enemyDamaged', { triggerUid: target.uid });
  }
}

export function loseHp(state: BattleState, target: Combatant, amount: number): void {
  if (target.downed || amount <= 0) return;
  target.hp = Math.max(0, target.hp - amount);
  state.events.push({ type: 'damage', sourceUid: null, targetUid: target.uid, amount, blocked: 0, grain: false, absorbed: false });
  if (target.hp <= 0) knockOut(state, target);
}

function knockOut(state: BattleState, target: Combatant): void {
  target.downed = true;
  target.block = 0;
  if (target.side === 'party') {
    state.events.push({ type: 'downed', uid: target.uid });
    state.log.push(`${target.name}이(가) 쓰러졌다.`);
    if (target.defId === 'haun') setResult(state, 'defeat');
  } else {
    state.events.push({ type: 'death', uid: target.uid });
    state.log.push(`${target.name} 처치.`);
    if (alive(state.enemies).length === 0) setResult(state, 'victory');
  }
}

export function setResult(state: BattleState, result: 'victory' | 'defeat'): void {
  if (state.result) return;
  state.result = result;
  state.events.push({ type: 'result', result });
}

export function changeRift(state: BattleState, delta: number): void {
  const bal = state.data.balance.rift;
  const before = state.rift;
  state.rift = Math.max(0, Math.min(bal.max, state.rift + delta));
  if (state.rift === before) return;
  state.events.push({ type: 'rift', value: state.rift, delta: state.rift - before });
  if (delta > 0) fireSupport(state, 'riftChanged', {});
  if (state.rift >= bal.max) {
    state.events.push({ type: 'surge' });
    state.log.push('균열 폭주! 하늘이 갈라진다.');
    for (const p of alive(state.party)) loseHp(state, p, bal.surgeDamage);
    const v = state.rift;
    state.rift = bal.surgeResetTo;
    state.events.push({ type: 'rift', value: state.rift, delta: state.rift - v });
  }
}

// ───────────────────────── 카드 더미 ─────────────────────────

export function newCard(state: BattleState, cardId: string, level = 0): CardInstance {
  state.uidCounter += 1;
  return { uid: `b${state.uidCounter}`, cardId, level };
}

function ownerOf(state: BattleState, cardId: string): Combatant | undefined {
  const owner = state.data.cards.get(cardId)?.owner;
  return state.party.find((p) => p.defId === owner);
}

export function drawCards(state: BattleState, n: number): void {
  const maxHand = state.data.balance.maxHand;
  let drawn = 0;
  let guard = 0;
  while (drawn < n && guard++ < 200) {
    if (state.hand.length >= maxHand) return;
    if (state.draw.length === 0) {
      if (state.discard.length === 0) return;
      state.draw = state.rng.shuffle(state.discard);
      state.discard = [];
    }
    const card = state.draw.pop()!;
    const owner = ownerOf(state, card.cardId);
    if (owner?.downed) {
      // 쓰러진 동료의 카드는 뽑히는 즉시 버려진다
      state.discard.push(card);
      state.events.push({ type: 'dead_draw', cardId: card.cardId });
      continue;
    }
    state.hand.push(card);
    drawn++;
  }
}

// ───────────────────────── 해석기 ─────────────────────────

export function runEffects(state: BattleState, effects: Effect[], ctx: EffectContext): void {
  for (const effect of effects) {
    if (state.result) return;
    if (!BATTLE_OP_SET.has(effect.op)) {
      throw new Error(`런 단위 동작 "${effect.op}"은 전투에서 쓸 수 없다`);
    }
    applyEffect(state, effect, ctx);
  }
}

function applyEffect(state: BattleState, effect: Effect, ctx: EffectContext): void {
  const needsTarget = !['gain_neigong', 'gain_mana', 'draw', 'discard', 'rift', 'add_card'].includes(effect.op);
  if (!needsTarget) {
    if (!checkCondition(state, effect.condition, ctx)) return;
    const amount = amountOf(state, effect);
    switch (effect.op) {
      case 'gain_neigong':
        state.neigong = Math.max(0, state.neigong + amount);
        return;
      case 'gain_mana':
        state.mana = Math.max(0, Math.min(state.data.balance.mana.max, state.mana + amount));
        return;
      case 'draw':
        drawCards(state, amount);
        return;
      case 'discard':
        for (let i = 0; i < amount && state.hand.length > 0; i++) {
          const idx = state.rng.int(0, state.hand.length - 1);
          state.discard.push(...state.hand.splice(idx, 1));
        }
        return;
      case 'rift':
        changeRift(state, amount);
        return;
      case 'add_card': {
        const cardId = effect.card;
        if (!cardId || !state.data.cards.has(cardId)) throw new Error(`add_card: 알 수 없는 카드 ${cardId}`);
        for (let i = 0; i < (effect.count ?? 1); i++) {
          const c = newCard(state, cardId);
          if (effect.to === 'hand' && state.hand.length < state.data.balance.maxHand) state.hand.push(c);
          else if (effect.to === 'draw') state.draw.splice(state.rng.int(0, state.draw.length), 0, c);
          else state.discard.push(c);
        }
        return;
      }
    }
    return;
  }

  const targets = resolveTargets(state, effect, ctx);
  if (effect.op === 'damage' && ctx.source && targets.length) {
    state.events.push({ type: 'attack', sourceUid: ctx.source.uid, targetUids: targets.map((t) => t.uid) });
  }
  for (const target of targets) {
    if (!checkCondition(state, effect.condition, ctx, target)) continue;
    const amount = amountOf(state, effect, target);
    switch (effect.op) {
      case 'damage':
        for (let i = 0; i < (effect.times ?? 1); i++) {
          if (target.downed || state.result) break;
          dealDamage(state, ctx.source, target, amount, ctx);
        }
        break;
      case 'block':
        target.block += amount;
        state.events.push({ type: 'block', targetUid: target.uid, amount });
        break;
      case 'heal': {
        const healed = Math.min(target.maxHp - target.hp, amount);
        target.hp += healed;
        state.events.push({ type: 'heal', targetUid: target.uid, amount: healed });
        break;
      }
      case 'apply_status':
        if (!effect.status) throw new Error('apply_status: status 필요');
        addStatus(state, target, effect.status, effect.stacks ?? effect.amount ?? 1);
        break;
      case 'remove_status':
        if (!effect.status) throw new Error('remove_status: status 필요');
        if (effect.stacks === undefined) {
          delete target.statuses[effect.status];
          state.events.push({ type: 'status', targetUid: target.uid, status: effect.status, stacks: 0 });
        } else addStatus(state, target, effect.status, -effect.stacks);
        break;
      case 'reveal_grain':
        addStatus(state, target, 'grain', effect.stacks ?? effect.amount ?? 1);
        break;
      case 'taunt':
        addStatus(state, target, 'taunt', effect.stacks ?? effect.amount ?? 1);
        break;
    }
  }
}

// ───────────────────────── 지원 규칙 ─────────────────────────

export function fireSupport(
  state: BattleState,
  trigger: SupportRule['trigger'],
  extra: Pick<EffectContext, 'triggerUid'>,
): void {
  for (const rule of state.supportRules) {
    if (rule.trigger !== trigger) continue;
    if (rule.oncePerBattle && state.supportUsed.includes(rule.id)) continue;
    const ctx: EffectContext = { source: null, triggerUid: extra.triggerUid };
    if (!checkCondition(state, rule.condition, ctx)) continue;
    if (rule.oncePerBattle) state.supportUsed.push(rule.id);
    state.events.push({ type: 'support', ruleId: rule.id, name: rule.name });
    state.log.push(`[왕일검] ${rule.name}`);
    runEffects(state, rule.effects, ctx);
  }
}

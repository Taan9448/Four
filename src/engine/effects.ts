// 효과 해석기. 카드·적 행동·지원 규칙의 효과는 모두 여기서 기본 동작의 조합으로만 해석된다.
// 카드별 개별 코드는 두지 않는다. 기본 동작 목록은 docs/CARD_EFFECTS.md 참고.
import { BATTLE_OPS, type Condition, type Effect, type Element, type RelicDef, type StatusTrigger, type SupportRule } from './schema';
import {
  alive,
  findCombatant,
  statusName,
  type BattleState,
  type CardInstance,
  type Combatant,
  type EnemyState,
  type ResolvedCard,
} from './state';

export interface EffectContext {
  /** 효과를 일으킨 쪽. null이면 지원 규칙 등 시스템(아군 편으로 취급). */
  source: Combatant | null;
  card?: ResolvedCard;
  /** 카드/행동이 지정한 대상 */
  chosenUid?: string;
  /** 지원 규칙을 일으킨 적 / 상태 발동(attacked)의 공격자 */
  triggerUid?: string;
  /** 상태 발동(perStack)의 스택 수: 효과 수치에 곱한다 */
  mult?: number;
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

/** 효과 수치: 기본값(없으면 fallback) + 비례(scale) → 상태 발동이면 스택 수를 곱한다 */
export function amountOf(state: BattleState, effect: Effect, target: Combatant | undefined, ctx: EffectContext, fallback = 0): number {
  let amount = effect.amount ?? effect.stacks ?? fallback;
  const sc = effect.scale;
  if (sc) {
    const self = ctx.source;
    let per = 0;
    switch (sc.per) {
      case 'rift':
        per = state.rift;
        break;
      case 'hand':
        per = state.hand.length;
        break;
      case 'mana':
        per = state.mana;
        break;
      case 'targetStatus':
        per = sc.status ? (target?.statuses[sc.status] ?? 0) : 0;
        break;
      case 'selfStatus':
        per = sc.status ? (self?.statuses[sc.status] ?? 0) : 0;
        break;
      case 'cardsPlayed':
        per = state.cardsPlayed ?? 0;
        break;
      case 'block':
        per = self?.block ?? 0;
        break;
      case 'missingHp':
        per = self ? self.maxHp - self.hp : 0;
        break;
      case 'enemies':
        per = alive(state.enemies).length;
        break;
    }
    let add = Math.floor(sc.amount * per);
    if (sc.max !== undefined) add = Math.min(add, sc.max);
    amount += add;
  }
  return amount * (ctx.mult ?? 1);
}

// ───────────────────────── 적 만들기 ─────────────────────────

/** 적 하나를 전투에 세운다: 스테이지·등급 배율, 특성 상태. uid는 e<번호> */
export function spawnEnemy(state: Pick<BattleState, 'data' | 'scar' | 'enemyHpScale' | 'enemies'>, id: string, index: number): EnemyState {
  const def = state.data.enemies.get(id);
  if (!def) throw new Error(`알 수 없는 적: ${id}`);
  const statuses: Record<string, number> = {};
  for (const t of def.traits) statuses[t.status] = t.stacks;
  const tier = state.data.balance.enemyTiers[def.tier];
  const maxHp = Math.round((def.maxHp + (def.hpPerScar ?? 0) * (state.scar ?? 0)) * (state.enemyHpScale ?? 1) * (tier?.hp ?? 1));
  let uid = `e${index}`;
  for (let n = index; state.enemies.some((e) => e.uid === uid); n++) uid = `e${n + 1}`;
  return {
    uid, defId: id, name: def.name, side: 'enemy', hp: maxHp, maxHp, block: 0,
    statuses, downed: false, moveCursor: 0, lastMoves: [], intent: null, dmgMul: tier?.dmg ?? 1,
  };
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
    case 'dispel':
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

export function hasSpecial(state: BattleState, c: Combatant, special: string): boolean {
  return Object.entries(c.statuses).some(([id, n]) => n > 0 && state.data.statuses.get(id)?.special === special);
}

export function addStatus(state: BattleState, target: Combatant, status: string, stacks: number): void {
  if (!state.data.statuses.has(status)) throw new Error(`알 수 없는 상태: ${status}`);
  // 피의 덮개(천마혈공): 결이 피에 덮여 드러나지 않는다
  if (status === 'grain' && stacks > 0 && hasSpecial(state, target, 'blood_cover')) {
    state.events.push({ type: 'status', targetUid: target.uid, status: 'grain', stacks: 0 });
    state.log.push(`${target.name}: 피가 결을 덮었다.`);
    return;
  }
  const next = (target.statuses[status] ?? 0) + stacks;
  if (next <= 0) delete target.statuses[status];
  else target.statuses[status] = next;
  state.events.push({ type: 'status', targetUid: target.uid, status, stacks });
  if (stacks > 0) state.log.push(`${target.name}: ${statusName(state, status)} ${stacks > 0 ? '+' : ''}${stacks}`);
  // 냉기: 임계치(보스는 더 높다)에 이르면 얼어붙는다 — 냉기를 비우고 빙결 1
  if (stacks > 0 && state.data.statuses.get(status)?.special === 'chill') {
    const el = state.data.balance.elements;
    const boss = target.side === 'enemy' && state.data.enemies.get(target.defId)?.tier === 'boss';
    if ((target.statuses[status] ?? 0) >= (boss ? el.bossFreezeAt : el.freezeAt)) {
      delete target.statuses[status];
      state.events.push({ type: 'status', targetUid: target.uid, status, stacks: 0 });
      state.log.push(`${target.name}이(가) 얼어붙었다.`);
      addStatus(state, target, el.freezeStatus, 1);
    }
  }
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
  return Math.max(0, Math.floor((enemyBase(state, source, base) + strengthBonus(state, source)) * statusModifier(state, source, 'damageDealtMul')));
}

/** 적의 피해 기본값에 스테이지 공격력 배율(enemyDmgScale)·등급 배율(dmgMul)을 건다(반올림). 아군은 그대로 */
function enemyBase(state: BattleState, source: Combatant | null, base: number): number {
  if (source?.side !== 'enemy') return base;
  const mul = (state.enemyDmgScale ?? 1) * ((source as EnemyState).dmgMul ?? 1);
  return mul !== 1 ? Math.round(base * mul) : base;
}

/** 받을 피해 예고용: 대상의 받는 피해 보정(취약 등)까지 넣은 1회 피해. dealDamage와 같은 순서로 계산한다 */
export function previewDamageOn(state: BattleState, source: Combatant, target: Combatant, base: number): number {
  const dmg = (enemyBase(state, source, base) + strengthBonus(state, source)) * statusModifier(state, source, 'damageDealtMul') * statusModifier(state, target, 'damageTakenMul');
  return Math.max(0, Math.floor(dmg));
}

// ───────────────────────── 피해·균열 ─────────────────────────

export function dealDamage(
  state: BattleState,
  source: Combatant | null,
  target: Combatant,
  base: number,
  ctx: EffectContext,
  element?: Element,
): void {
  if (target.downed) return;
  const bal = state.data.balance;
  let dmg = enemyBase(state, source, base);
  if (source) {
    dmg += strengthBonus(state, source);
    dmg *= statusModifier(state, source, 'damageDealtMul');
  }
  const card = ctx.card;
  const usesFlow = !!card && (card.cost.neigong > 0 || card.cost.mana > 0);
  // 꿰맬 자리: 실(thread) 카드가 아니면 들어가지 않는다
  if (hasSpecial(state, target, 'seam') && !card?.keywords.includes('thread')) {
    state.events.push({ type: 'damage', sourceUid: source?.uid ?? null, targetUid: target.uid, amount: 0, blocked: 0, grain: false, absorbed: false });
    state.log.push(`${target.name}: 실이 아니면 꿰맬 수 없다.`);
    return;
  }
  // 틈의 굶주림: 내공을 2 이상 실은 카드는 먹혀서 절반만 들어간다
  const fed = !!card && card.cost.neigong >= 2 && hasSpecial(state, target, 'hungry');
  if (fed) dmg *= 0.5;
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
  // 속성: 약점이면 더, 내성이면 덜 들어간다
  const affinity = elementAffinity(state, target, element);
  if (affinity === 'weak') dmg *= bal.elements.weakMultiplier;
  else if (affinity === 'resist') dmg *= bal.elements.resistMultiplier;
  // 치명타: 아군 카드의 피해 한 번마다 굴린다(미리보기 복제·수치 시험에서는 굴리지 않는다)
  let crit = false;
  // 치명타는 따로 떼어 둔 수열(critRng)로 굴려, 미리보기(굴리지 않음)와 실제의 다른 무작위(무작위 대상 등)가 어긋나지 않게 한다.
  // 적에게 주는 피해만(자기 피해 카드는 굴리지 않는다)
  if (source?.side === 'party' && target.side === 'enemy' && card && !state.noCrit) {
    const chance = critChance(state, source);
    if (chance > 0 && (state.critRng ?? state.rng).next() < chance) {
      crit = true;
      dmg *= hasRule(state, 'crit_heavy') ? bal.relicRules.critHeavyMultiplier : bal.crit.multiplier;
    }
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
  if (state.tally) {
    if (source?.side === 'party' && target.side === 'enemy') {
      state.tally.damage += hpLoss;
      if (crit) state.tally.crits += 1;
    }
    if (target.side === 'party' && target.defId === 'haun' && hpLoss > 0) state.tally.haunHitBy = source?.name ?? '알 수 없는 것';
  }
  state.events.push({
    type: 'damage',
    sourceUid: source?.uid ?? null,
    targetUid: target.uid,
    amount: hpLoss,
    blocked,
    grain,
    absorbed: false,
    crit,
    element,
    weak: affinity === 'weak',
    resisted: affinity === 'resist',
  });
  state.log.push(
    `${source?.name ?? '?'} → ${target.name} 피해 ${hpLoss}${blocked ? ` (방어 ${blocked})` : ''}${grain ? ' [결]' : ''}${crit ? ' [치명]' : ''}${affinity === 'weak' ? ' [약점]' : affinity === 'resist' ? ' [내성]' : ''}`,
  );
  if (hpLoss > 0 || blocked > 0) applyElement(state, target, element);
  if (target.hp <= 0) {
    knockOut(state, target);
    // 벤 짐승의 기운이 금으로 빨려 올라간다
    if (fed && target.downed) {
      state.log.push('벤 짐승의 기운이 하늘의 금으로 빨려 올라갔다.');
      changeRift(state, 1);
    }
  }
  if (target.side === 'enemy' && !target.downed) {
    fireSupport(state, 'enemyDamaged', { triggerUid: target.uid });
  }
  if (!target.downed && source && source !== target) fireStatusTriggers(state, target, 'attacked', { attackerUid: source.uid });
  if (!target.downed && hpLoss > 0) fireStatusTriggers(state, target, 'hpLost', { attackerUid: source?.uid });
}

/** 대상의 속성 상성: 적 정의의 weak·resist(아군은 없음) */
export function elementAffinity(state: BattleState, target: Combatant, element: Element | undefined): 'weak' | 'resist' | null {
  if (!element || target.side !== 'enemy') return null;
  const def = state.data.enemies.get(target.defId);
  if (def?.resist.includes(element)) return 'resist';
  if (def?.weak.includes(element)) return 'weak';
  return null;
}

/** 치명타 확률: 캐릭터의 crit(없으면 balance.crit.chance) + 레벨마다 leveling.critPerLevel */
export function critChance(state: BattleState, c: Combatant): number {
  if (c.side !== 'party') return 0;
  const base = state.data.characters.get(c.defId)?.crit ?? state.data.balance.crit.chance;
  return base + ((c.level ?? 1) - 1) * state.data.balance.leveling.critPerLevel;
}

/**
 * 속성 상태 붙이기: 화염 → 화상, 냉기 → 냉기(쌓이면 빙결). 내성이 있으면 붙지 않는다.
 * 상극: 화염은 냉기를 녹이고, 냉기는 화상을 끈다
 */
function applyElement(state: BattleState, target: Combatant, element: Element | undefined): void {
  if (!element || target.downed || elementAffinity(state, target, element) === 'resist') return;
  const el = state.data.balance.elements;
  const opposite = el[element === 'fire' ? 'ice' : 'fire'].status;
  if ((target.statuses[opposite] ?? 0) > 0) {
    delete target.statuses[opposite];
    state.events.push({ type: 'status', targetUid: target.uid, status: opposite, stacks: 0 });
    state.log.push(`${target.name}: ${element === 'fire' ? '냉기가 녹았다' : '불이 꺼졌다'}.`);
  }
  addStatus(state, target, el[element].status, el[element].stacks);
}

export function loseHp(state: BattleState, target: Combatant, amount: number): void {
  if (target.downed || amount <= 0) return;
  if (state.tally && target.defId === 'haun' && target.side === 'party') state.tally.haunHitBy = '독·화상·자해 같은 체력 손실';
  target.hp = Math.max(0, target.hp - amount);
  state.events.push({ type: 'damage', sourceUid: null, targetUid: target.uid, amount, blocked: 0, grain: false, absorbed: false });
  if (target.hp <= 0) knockOut(state, target);
  else fireStatusTriggers(state, target, 'hpLost');
}

function knockOut(state: BattleState, target: Combatant): void {
  if (target.side === 'enemy' && hasTransform(state, target, 'downed')) {
    transformEnemy(state, target as EnemyState);
    return;
  }
  target.downed = true;
  target.block = 0;
  if (target.side === 'party') {
    state.events.push({ type: 'downed', uid: target.uid });
    state.log.push(`${target.name}이(가) 쓰러졌다.`);
    if (target.defId === 'haun') setResult(state, 'defeat');
    else fireRelics(state, 'allyDowned');
  } else {
    state.events.push({ type: 'death', uid: target.uid });
    state.log.push(`${target.name} 처치.`);
    if (state.tally) state.tally.kills += 1;
    fireRelics(state, 'enemyDowned');
    const def = state.data.enemies.get(target.defId);
    if (def?.deathEffects.length) runEffects(state, def.deathEffects, { source: target });
    // 짝이 쓰러지면 변신(사무결 ← 곽도진, 셀리아스 ← 왕녀의 얼음)
    for (const e of alive(state.enemies)) {
      const t = state.data.enemies.get(e.defId)?.transform;
      if (t?.triggers.includes('partnerDowned') && t.partner === target.defId) transformEnemy(state, e);
    }
    const left = alive(state.enemies);
    if (left.length === 1 && hasTransform(state, left[0], 'lastStanding')) transformEnemy(state, left[0] as EnemyState);
    if (alive(state.enemies).length === 0) setResult(state, 'victory');
  }
}

function hasTransform(state: BattleState, c: Combatant, trigger: 'downed' | 'lastStanding'): boolean {
  return !!state.data.enemies.get(c.defId)?.transform?.triggers.includes(trigger);
}

/** 보스 2단계: 적 정의를 into로 바꾸고 체력을 채운다. 이번 차례에는 행동하지 않는다 */
function transformEnemy(state: BattleState, enemy: EnemyState): void {
  const t = state.data.enemies.get(enemy.defId)!.transform!;
  const into = state.data.enemies.get(t.into)!;
  const from = enemy.name;
  enemy.defId = into.id;
  enemy.name = into.name;
  const tier = state.data.balance.enemyTiers[into.tier];
  enemy.maxHp = Math.round((into.maxHp + (into.hpPerScar ?? 0) * state.scar) * (state.enemyHpScale ?? 1) * (tier?.hp ?? 1));
  enemy.dmgMul = tier?.dmg ?? 1;
  enemy.hp = enemy.maxHp;
  enemy.block = 0;
  enemy.downed = false;
  enemy.statuses = Object.fromEntries(into.traits.map((tr) => [tr.status, tr.stacks]));
  enemy.moveCursor = 0;
  enemy.lastMoves = [];
  enemy.intent = null;
  state.events.push({ type: 'transform', uid: enemy.uid, from, into: into.id, text: t.text });
  state.log.push(`${from} → ${into.name}: ${t.text}`);
  const haun = alive(state.party).find((p) => p.defId === 'haun');
  if (t.partyEffects.length && haun) runEffects(state, t.partyEffects, { source: haun });
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
  if (delta > 0) {
    fireSupport(state, 'riftChanged', {});
    fireRelics(state, 'riftChanged');
  }
  if (state.rift >= bal.max) {
    state.events.push({ type: 'surge' });
    if (state.tally) state.tally.surges += 1;
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
  const needsTarget = !['gain_neigong', 'gain_mana', 'draw', 'discard', 'rift', 'add_card', 'neigong_max', 'summon'].includes(effect.op);
  if (!needsTarget) {
    if (!checkCondition(state, effect.condition, ctx)) return;
    const amount = amountOf(state, effect, undefined, ctx);
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
      case 'discard': {
        // filter.owner: 그 주인의 카드만(하운의 숨을 끊는다 → 하운 카드만 버린다)
        const owner = effect.filter?.owner;
        for (let i = 0; i < amount; i++) {
          const idxs = state.hand.map((c, j) => j).filter((j) => !owner || state.data.cards.get(state.hand[j].cardId)?.owner === owner);
          if (!idxs.length) break;
          const [card] = state.hand.splice(state.rng.pick(idxs), 1);
          state.discard.push(card);
          state.events.push({ type: 'discard', cardId: card.cardId });
        }
        return;
      }
      case 'summon': {
        // 소환: 적 편에 새 적을 세운다(이번 차례에는 의도가 없어 쉰다)
        const def = effect.enemy ? state.data.enemies.get(effect.enemy) : undefined;
        if (!def) throw new Error(`summon: 알 수 없는 적 ${effect.enemy}`);
        for (let i = 0; i < (effect.count ?? 1); i++) {
          if (alive(state.enemies).length >= state.data.balance.maxEnemies) break;
          const e = spawnEnemy(state, def.id, state.enemies.length);
          state.enemies.push(e);
          state.events.push({ type: 'summon', uid: e.uid, sourceUid: ctx.source?.uid ?? null });
          state.log.push(`${ctx.source?.name ?? ''}이(가) ${def.name}을(를) 불렀다.`);
        }
        return;
      }
      case 'rift':
        changeRift(state, amount);
        return;
      case 'neigong_max':
        // 이번 전투에서 턴마다 차는 내공(마지막 한 땀: 팔 년 내공을 실로 뽑는다)
        state.neigongMax = Math.max(0, state.neigongMax + amount);
        state.events.push({ type: 'neigong_max', value: state.neigongMax });
        state.log.push(`내공의 고리 ${amount >= 0 ? '+' : ''}${amount} (턴마다 ${state.neigongMax})`);
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
  if (effect.op === 'damage' && ctx.source && !ctx.source.downed && targets.length) {
    state.events.push({ type: 'attack', sourceUid: ctx.source.uid, targetUids: targets.map((t) => t.uid) });
  }
  for (const target of targets) {
    if (!checkCondition(state, effect.condition, ctx, target)) continue;
    const amount = amountOf(state, effect, target, ctx, ['apply_status', 'reveal_grain', 'taunt'].includes(effect.op) ? 1 : 0);
    switch (effect.op) {
      case 'damage':
        for (let i = 0; i < (effect.times ?? 1); i++) {
          if (target.downed || state.result) break;
          dealDamage(state, ctx.source, target, amount, ctx, effect.element);
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
        addStatus(state, target, effect.status, amount);
        break;
      case 'lose_hp':
        loseHp(state, target, amount);
        break;
      case 'remove_status':
        if (!effect.status) throw new Error('remove_status: status 필요');
        if (effect.stacks === undefined) {
          delete target.statuses[effect.status];
          state.events.push({ type: 'status', targetUid: target.uid, status: effect.status, stacks: 0 });
        } else addStatus(state, target, effect.status, -effect.stacks);
        break;
      case 'reveal_grain':
        addStatus(state, target, 'grain', amount);
        break;
      case 'taunt':
        addStatus(state, target, 'taunt', amount);
        break;
      case 'dispel': {
        // 돌려보내기(운해귀종): 강화(buff) 상태와 방어를 걷어 낸다
        for (const id of Object.keys(target.statuses)) {
          if (state.data.statuses.get(id)?.kind !== 'buff') continue;
          delete target.statuses[id];
          state.events.push({ type: 'status', targetUid: target.uid, status: id, stacks: 0 });
        }
        if (target.block > 0) {
          target.block = 0;
          state.events.push({ type: 'block', targetUid: target.uid, amount: 0 });
        }
        state.log.push(`${target.name}: 흩어진 것이 제자리로 돌아갔다.`);
        break;
      }
    }
  }
}

// ───────────────────────── 상태 발동(파워) ─────────────────────────

/** 발동이 발동을 부르는 깊이 한도(되갚기끼리 끝없이 주고받지 않게) */
const MAX_TRIGGER_DEPTH = 2;

/**
 * holder가 가진 상태 중 on이 맞는 발동을 일으킨다(CARD_EFFECTS 4-1). 효과의 출처는 holder,
 * trigger_enemy는 공격자(attacked·hpLost)다. perStack이면 수치에 스택 수를 곱한다
 */
export function fireStatusTriggers(
  state: BattleState,
  holder: Combatant,
  on: StatusTrigger['on'],
  info: { card?: ResolvedCard; cardOwnerUid?: string; attackerUid?: string } = {},
): void {
  if (state.result || holder.downed) return;
  const depth = state.triggerDepth ?? 0;
  if (depth >= MAX_TRIGGER_DEPTH) return;
  for (const [id, stacks] of Object.entries(holder.statuses)) {
    if (stacks <= 0) continue;
    const def = state.data.statuses.get(id);
    if (!def?.triggers.length) continue;
    for (const t of def.triggers) {
      if (t.on !== on) continue;
      if (on === 'cardPlayed') {
        const card = info.card;
        if (!card) continue;
        if (t.cardType && card.def.type !== t.cardType) continue;
        if (t.keyword && !card.keywords.includes(t.keyword)) continue;
        if (t.ownCards && info.cardOwnerUid !== holder.uid) continue;
      }
      const ctx: EffectContext = { source: holder, triggerUid: info.attackerUid, mult: t.perStack ? stacks : 1 };
      if (!checkCondition(state, t.condition, ctx, holder)) continue;
      state.triggerDepth = depth + 1;
      try {
        state.events.push({ type: 'power', uid: holder.uid, status: id });
        runEffects(state, t.effects, ctx);
      } finally {
        state.triggerDepth = depth;
      }
      if (state.result || holder.downed) return;
    }
  }
}

/** 한 편 전체에 발동(차례 시작·끝, 카드를 낸 뒤) */
export function fireSideTriggers(state: BattleState, list: Combatant[], on: StatusTrigger['on'], info: Parameters<typeof fireStatusTriggers>[3] = {}): void {
  for (const c of alive(list)) {
    if (state.result) return;
    fireStatusTriggers(state, c, on, info);
  }
}

// ───────────────────────── 지원 규칙·유물 ─────────────────────────

/** 가진 유물 중 규칙(rule) 유물이 있는가 */
export function hasRule(state: Pick<BattleState, 'data' | 'relics'>, rule: NonNullable<RelicDef['rule']>): boolean {
  return state.relics.some((id) => state.data.relics.get(id)?.rule === rule);
}

/**
 * 가진 유물 중 trigger가 맞는 것의 효과를 하운을 출처로 일으킨다(전투 안 trigger만).
 * cardPlayed는 cardType·keyword로 거르고, every면 맞는 카드 n장째마다
 */
export function fireRelics(
  state: BattleState,
  trigger: 'battleStart' | 'turnStart' | 'turnEnd' | 'enemyDowned' | 'allyDowned' | 'cardPlayed' | 'riftChanged',
  info: { card?: ResolvedCard } = {},
): void {
  if (!state.relics.length || state.result) return;
  const haun = state.party.find((p) => p.defId === 'haun' && !p.downed) ?? state.party.find((p) => !p.downed);
  for (const id of state.relics) {
    const relic = state.data.relics.get(id);
    if (!relic || relic.trigger !== trigger || !relic.effects.length) continue;
    if (trigger === 'cardPlayed') {
      const card = info.card;
      if (!card) continue;
      if (relic.cardType && card.def.type !== relic.cardType) continue;
      if (relic.keyword && !card.keywords.includes(relic.keyword)) continue;
      if (relic.every) {
        const counters = (state.relicCounters ??= {});
        counters[id] = (counters[id] ?? 0) + 1;
        if (counters[id] % relic.every !== 0) continue;
      }
    }
    const key = `relic:${id}`;
    if (relic.oncePerBattle && state.supportUsed.includes(key)) continue;
    const ctx: EffectContext = { source: haun ?? null };
    if (!checkCondition(state, relic.condition, ctx)) continue;
    if (relic.oncePerBattle) state.supportUsed.push(key);
    state.events.push({ type: 'relic', relicId: id, name: relic.name });
    runEffects(state, relic.effects, ctx);
    if (state.result) return;
  }
}

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

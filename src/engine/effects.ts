// 효과 해석기. 카드·적 행동·지원 규칙의 효과는 모두 여기서 기본 동작의 조합으로만 해석된다.
// 카드별 개별 코드는 두지 않는다. 기본 동작 목록은 docs/CARD_EFFECTS.md 참고.
import { BATTLE_OPS, ELEMENTS, type Condition, type Effect, type Element, type RelicDef, type StatusTrigger, type SupportRule } from './schema';
import {
  alive,
  findCombatant,
  statusName,
  type BattleState,
  type CardInstance,
  type Combatant,
  type EnemyState,
  type ResolvedCard,
  leader,
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
  // 효과를 일으킨 쪽의 방어가 이만큼 이상(오천의 무덤: 차례 끝에 방어가 남아 있으면)
  if (cond.selfBlockGte !== undefined && (ctx.source?.block ?? 0) < cond.selfBlockGte) return false;
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
      case 'consumed':
        per = state.consumed ?? 0;
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
/**
 * 적을 세울 때 덧붙이는 것(심연): 접사(이름 앞에 붙고 체력·특성·공격 효과), 특성 더하기(굽이의 법칙·숙적 성장 — 스택을 그 값으로),
 * 격노를 당기는 턴 수
 */
export interface EnemyMod {
  affixes?: string[];
  traits?: { status: string; stacks: number }[];
  /** 격노를 당기는 턴 수(음수면 늦춘다) */
  enrageShift?: number;
  /** 흐름 포식이 먹는 양 배율 */
  feedMul?: number;
  /** 변신한 모습의 체력 배율(전투의 적 체력 배율 대신) */
  transformHpScale?: number;
}

export function spawnEnemy(state: Pick<BattleState, 'data' | 'scar' | 'enemyHpScale' | 'enemies'>, id: string, index: number, mod?: EnemyMod): EnemyState {
  const def = state.data.enemies.get(id);
  if (!def) throw new Error(`알 수 없는 적: ${id}`);
  const statuses: Record<string, number> = {};
  for (const t of def.traits) statuses[t.status] = t.stacks;
  const affixes = (mod?.affixes ?? []).map((a) => state.data.affixes.get(a)).filter((a): a is NonNullable<typeof a> => !!a);
  for (const a of affixes) for (const t of a.traits) statuses[t.status] = Math.max(statuses[t.status] ?? 0, t.stacks);
  for (const t of mod?.traits ?? []) statuses[t.status] = Math.max(statuses[t.status] ?? 0, t.stacks);
  const tier = state.data.balance.enemyTiers[def.tier];
  const hpMul = affixes.reduce((m, a) => m * (a.hpMul ?? 1), 1);
  const maxHp = Math.round((def.maxHp + (def.hpPerScar ?? 0) * (state.scar ?? 0)) * (state.enemyHpScale ?? 1) * (tier?.hp ?? 1) * hpMul);
  let uid = `e${index}`;
  for (let n = index; state.enemies.some((e) => e.uid === uid); n++) uid = `e${n + 1}`;
  const enemy: EnemyState = {
    uid, defId: id, name: [...affixes.map((a) => a.name), def.name].join(' '), side: 'enemy', hp: maxHp, maxHp, block: 0,
    statuses, downed: false, moveCursor: 0, lastMoves: [], intent: null, dmgMul: tier?.dmg ?? 1,
  };
  if (affixes.length) enemy.affixes = affixes.map((a) => a.id);
  if (def.enrage && mod?.enrageShift) enemy.enrageAt = Math.max(1, def.enrage.afterTurn - mod.enrageShift);
  if (mod?.feedMul !== undefined && mod.feedMul !== 1) enemy.feedMul = mod.feedMul;
  if (mod?.transformHpScale !== undefined) enemy.transformHpScale = mod.transformHpScale;
  return enemy;
}

// ───────────────────────── 대상 ─────────────────────────

function sidesOf(state: BattleState, source: Combatant | null) {
  const side = source?.side ?? 'party';
  const own: Combatant[] = side === 'party' ? state.party : state.enemies;
  const opposing: Combatant[] = side === 'party' ? state.enemies : state.party;
  return { own, opposing };
}

/**
 * 효과에 target이 없을 때의 대상: 적에게 거는 효과(피해·상태 부여·결 노출·걷어 내기)는 카드가 '적 전체'면 적 전체, 아니면 적 하나.
 * 그 밖의 효과(방어·회복·체력 잃기·자원 등)는 카드가 '아군 전체'면 아군 전체, 아니면 자신. 카드 글(text.ts)도 이 규칙을 그대로 쓴다
 */
export function defaultTargetFor(op: Effect['op'], cardTarget: string | undefined): NonNullable<Effect['target']> {
  switch (op) {
    case 'damage':
    case 'apply_status':
    case 'reveal_grain':
    case 'dispel':
      return cardTarget === 'all_enemies' ? 'all_enemies' : 'enemy';
    default:
      return cardTarget === 'all_allies' ? 'all_allies' : 'self';
  }
}

function defaultTarget(effect: Effect, ctx: EffectContext): NonNullable<Effect['target']> {
  return defaultTargetFor(effect.op, ctx.card?.def.target);
}

export function resolveTargets(state: BattleState, effect: Effect, ctx: EffectContext): Combatant[] {
  const target = effect.target ?? defaultTarget(effect, ctx);
  const { own, opposing } = sidesOf(state, ctx.source);
  const haun = leader(state);
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

/** 이 상태를 싣는 속성의 임계(냉기 → 빙결, 감전 → 마비). 없으면 undefined */
function elementThreshold(state: BattleState, status: string): { at: number; bossAt: number; into: string } | undefined {
  const el = state.data.balance.elements;
  for (const k of ELEMENTS) if (el[k].status === status) return el[k].threshold;
  return undefined;
}

export function addStatus(state: BattleState, target: Combatant, status: string, stacks: number): void {
  if (!state.data.statuses.has(status)) throw new Error(`알 수 없는 상태: ${status}`);
  // 피의 덮개(천마혈공): 결이 피에 덮여 드러나지 않는다
  if (status === 'grain' && stacks > 0 && hasSpecial(state, target, 'blood_cover')) {
    state.events.push({ type: 'status', targetUid: target.uid, status: 'grain', stacks: 0 });
    state.log.push(`${target.name}: 피가 결을 덮었다.`);
    return;
  }
  // 교차 잠금 금지: 빙결 중에는 감전이, 마비 중에는 냉기가 쌓이지 않는다(statuses[].blockedBy)
  if (stacks > 0) {
    const blocker = state.data.statuses.get(status)!.blockedBy.find((b) => (target.statuses[b] ?? 0) > 0);
    if (blocker) {
      state.events.push({ type: 'status', targetUid: target.uid, status, stacks: 0 });
      state.log.push(`${target.name}: ${statusName(state, blocker)} 상태라 ${statusName(state, status)}이(가) 스며들지 않는다.`);
      return;
    }
  }
  const next = (target.statuses[status] ?? 0) + stacks;
  if (next <= 0) delete target.statuses[status];
  else target.statuses[status] = next;
  state.events.push({ type: 'status', targetUid: target.uid, status, stacks });
  if (stacks > 0) state.log.push(`${target.name}: ${statusName(state, status)} ${stacks > 0 ? '+' : ''}${stacks}`);
  // 속성 임계: 냉기·감전이 at(보스는 bossAt)에 이르면 비우고 빙결·마비 1(balance.elements[].threshold)
  if (stacks > 0) {
    const th = elementThreshold(state, status);
    if (th) {
      const boss = target.side === 'enemy' && state.data.enemies.get(target.defId)?.tier === 'boss';
      if ((target.statuses[status] ?? 0) >= (boss ? th.bossAt : th.at)) {
        delete target.statuses[status];
        state.events.push({ type: 'status', targetUid: target.uid, status, stacks: 0 });
        state.log.push(`${target.name}: ${statusName(state, th.into)}에 걸렸다.`);
        addStatus(state, target, th.into, 1);
      }
    }
  }
  // 매듭: 결 노출이 임계치에 이르면 매듭이 드러난다
  if (
    status === 'grain' &&
    (target.statuses.knot ?? 0) > 0 &&
    !(target.statuses.knot_exposed > 0) &&
    // 매듭 스택이 많으면(심연의 숙적) 더 많은 결을 읽어야 드러난다
    (target.statuses.grain ?? 0) >= state.data.balance.grain.knotThreshold + (target.statuses.knot - 1)
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
  return hitCap(state, source, target, Math.max(0, Math.floor(dmg)));
}

/** 심연의 한 방 상한: 적이 아군에게 주는 피해 한 번은 enemyHitCap을 넘지 않는다 */
function hitCap(state: BattleState, source: Combatant | null, target: Combatant, dmg: number): number {
  return state.enemyHitCap && source?.side === 'enemy' && target.side === 'party' ? Math.min(dmg, state.enemyHitCap) : dmg;
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
    if (state.tally) state.tally.grain = (state.tally.grain ?? 0) + 1;
    target.statuses.grain -= 1;
    if (target.statuses.grain <= 0) delete target.statuses.grain;
    dmg *= 1 + bal.grain.damageBonus;
  }
  // 속성: 약점이면 더, 내성이면 덜 들어간다
  const affinity = elementAffinity(state, target, element);
  if (affinity === 'weak') dmg *= bal.elements.weakMultiplier;
  else if (affinity === 'resist') dmg *= bal.elements.resistMultiplier;
  // 전도: 냉기가 붙은 적에게 번개는 더 들어간다(냉기는 남는다)
  const conducted = isConducted(state, target, element);
  if (conducted) dmg *= bal.elements[element!].conduct!.multiplier;
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
  dmg = hitCap(state, source, target, Math.max(0, Math.floor(dmg)));

  // 흐름 포식: 흐름을 쓴 카드의 피해를 먹는다
  if (usesFlow && target.statuses.flow_eater > 0) {
    // 스택이 쌓이면(심연의 숙적) 먹는 양이 스택마다 50% 늘어난다. 옅은 잔향(첫 만남)은 feedMul만큼만 먹는다
    const fed = Math.floor(dmg * (1 + 0.5 * (target.statuses.flow_eater - 1)) * ((target as EnemyState).feedMul ?? 1));
    target.maxHp += fed;
    target.hp += fed;
    state.events.push({ type: 'damage', sourceUid: source?.uid ?? null, targetUid: target.uid, amount: fed, blocked: 0, grain, absorbed: true });
    state.log.push(`${target.name}이(가) 흐름을 먹었다. (+${fed})`);
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
    conducted,
  });
  state.log.push(
    `${source?.name ?? '?'} → ${target.name} 피해 ${hpLoss}${blocked ? ` (방어 ${blocked})` : ''}${grain ? ' [결]' : ''}${crit ? ' [치명]' : ''}${affinity === 'weak' ? ' [약점]' : affinity === 'resist' ? ' [내성]' : ''}`,
  );
  if (conducted) state.log.push(`${target.name}: 젖은 몸에 번개가 튀었다(×${bal.elements[element!].conduct!.multiplier}).`);
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

/** 전도: 이 속성에 conduct가 있고 대상에 그 상태(냉기)가 붙어 있는가 */
export function isConducted(state: BattleState, target: Combatant, element: Element | undefined): boolean {
  if (!element) return false;
  const c = state.data.balance.elements[element].conduct;
  return !!c && (target.statuses[c.ifTargetHas] ?? 0) > 0;
}

/**
 * 속성 상태 붙이기: 화염 → 화상, 냉기 → 냉기(쌓이면 빙결), 번개 → 감전(쌓이면 마비). 내성이 있으면 붙지 않는다.
 * 상극(balance.elements.opposites): 화염은 냉기를 녹이고, 냉기는 화상을 끈다. 번개는 아무것도 지우지 않는다
 */
function applyElement(state: BattleState, target: Combatant, element: Element | undefined): void {
  if (!element || target.downed || elementAffinity(state, target, element) === 'resist') return;
  const el = state.data.balance.elements;
  for (const pair of el.opposites) {
    if (!pair.includes(element)) continue;
    const other = pair[0] === element ? pair[1] : pair[0];
    const opposite = el[other].status;
    if ((target.statuses[opposite] ?? 0) > 0) {
      delete target.statuses[opposite];
      state.events.push({ type: 'status', targetUid: target.uid, status: opposite, stacks: 0 });
      state.log.push(`${target.name}: ${statusName(state, opposite)}이(가) 사라졌다.`);
    }
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
    // 하운이 쓰러지면 패배. 하운이 출전하지 않은 순례에서는 모두 쓰러져야 패배
    if (target.defId === 'haun' || (!state.party.some((p) => p.defId === 'haun') && !alive(state.party).length)) setResult(state, 'defeat');
    else fireRelics(state, 'allyDowned');
  } else {
    state.events.push({ type: 'death', uid: target.uid });
    state.log.push(`${target.name} 처치.`);
    if (state.tally) {
      state.tally.kills += 1;
      if ((target as EnemyState).affixes?.length) state.tally.affixKills = (state.tally.affixKills ?? 0) + 1;
    }
    fireRelics(state, 'enemyDowned');
    const def = state.data.enemies.get(target.defId);
    if (def?.deathEffects.length) runEffects(state, def.deathEffects, { source: target });
    // 접사(메아리치는 등)의 쓰러질 때 효과
    for (const a of (target as EnemyState).affixes ?? []) {
      const fx = state.data.affixes.get(a)?.deathEffects;
      if (fx?.length) runEffects(state, fx, { source: target });
    }
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
  enemy.maxHp = Math.round((into.maxHp + (into.hpPerScar ?? 0) * state.scar) * (enemy.transformHpScale ?? state.enemyHpScale ?? 1) * (tier?.hp ?? 1));
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
  const haun = leader(state, true);
  if (t.partyEffects.length && haun) runEffects(state, t.partyEffects, { source: haun });
}

export function setResult(state: BattleState, result: 'victory' | 'defeat'): void {
  if (state.result) return;
  state.result = result;
  state.events.push({ type: 'result', result });
}

export function changeRift(state: BattleState, delta: number): void {
  const bal = state.data.balance.rift;
  // 봉인(seal): 균열이 오를 때 스택 하나가 1을 막고 사라진다(일행 누구의 봉인이든, 앞자리부터)
  if (delta > 0) {
    let blocked = 0;
    for (const p of alive(state.party)) {
      while (delta > 0 && (p.statuses.seal ?? 0) > 0) {
        p.statuses.seal -= 1;
        if (!p.statuses.seal) delete p.statuses.seal;
        delta -= 1;
        blocked += 1;
      }
    }
    if (blocked) {
      state.events.push({ type: 'sealed', amount: blocked });
      state.log.push(`봉인이 금 ${blocked}을 막았다.`);
    }
    if (delta <= 0) return;
  }
  const before = state.rift;
  state.rift = Math.max(0, Math.min(bal.max, state.rift + delta));
  if (state.rift === before) return;
  state.events.push({ type: 'rift', value: state.rift, delta: state.rift - before });
  if (delta > 0) {
    fireSupport(state, 'riftChanged', {});
    fireRelics(state, 'riftChanged');
  }
  if (state.rift >= bal.max) surge(state);
}

/**
 * 폭주(GAME_DESIGN 7절, 2026-10-11 개편): ① 일행 체력 손실(방어 무시, ×n) ② 적 힘 +1·포식자 회복 ③ 잔향을 손패에 ④ 상흔. 균열은 surgeResetTo로
 * 보스 격노·기절·즉사 같은 것은 더하지 않는다
 */
function surge(state: BattleState): void {
  const bal = state.data.balance.rift;
  state.surgeCount = (state.surgeCount ?? 0) + 1;
  const n = bal.surgeEscalate ? state.surgeCount : 1;
  state.events.push({ type: 'surge', count: state.surgeCount });
  if (state.tally) state.tally.surges += 1;
  state.log.push(`균열 폭주${n > 1 ? ` ×${n}` : ''}! 하늘이 갈라진다.`);
  // ① 일행 전체: 최대 체력의 surgeRatio(올림) + 하운 surgeHaunExtra, n번째 폭주는 ×n
  const mul = state.surgeDamageMul ?? 1;
  for (const p of alive(state.party)) {
    const base = Math.ceil(p.maxHp * bal.surgeRatio) + (p.defId === 'haun' ? bal.surgeHaunExtra : 0);
    const amount = Math.max(1, Math.floor(base * n * mul));
    const hp = p.hp;
    loseHp(state, p, amount);
    if (state.tally) state.tally.surgeHp = (state.tally.surgeHp ?? 0) + Math.max(0, hp - Math.max(0, p.hp));
    if (state.result) return;
  }
  // ② 적 전체 힘, 흐름을 먹는 적(흐름 포식·틈의 굶주림)은 체력을 채운다
  for (const e of alive(state.enemies)) {
    if (bal.surgeEnemyStrength) addStatus(state, e, 'strength', bal.surgeEnemyStrength);
    if (bal.surgeEnemyHeal && (e.statuses.flow_eater > 0 || hasSpecial(state, e, 'hungry'))) {
      const healed = Math.min(e.maxHp - e.hp, bal.surgeEnemyHeal);
      if (healed > 0) {
        e.hp += healed;
        state.events.push({ type: 'heal', targetUid: e.uid, amount: healed });
      }
    }
  }
  // ③ 틈의 잔향을 손패에(가득 차면 버린 더미)
  for (let i = 0; i < bal.surgeEchoToHand; i++) addEcho(state, 'hand');
  if (bal.surgeEchoToHand) state.events.push({ type: 'echo' });
  // ④ 상흔(전투 결과에 더한다)
  if (state.tally) state.tally.surgeScar = (state.tally.surgeScar ?? 0) + bal.surgeScar;
  const v = state.rift;
  state.rift = bal.surgeResetTo;
  state.events.push({ type: 'rift', value: state.rift, delta: state.rift - v });
}

/** 틈의 잔향 한 장(손패 · 버린 더미). 규칙 유물 half_echo면 두 장에 한 장만 들어온다. 들어왔으면 true */
export function addEcho(state: BattleState, to: 'hand' | 'discard'): boolean {
  if (hasRule(state, 'half_echo')) {
    state.echoSkips = (state.echoSkips ?? 0) + 1;
    if (state.echoSkips % 2 === 1) return false;
  }
  const c = newCard(state, state.data.balance.rift.echoCard);
  if (to === 'hand' && state.hand.length < state.data.balance.maxHand) state.hand.push(c);
  else state.discard.push(c);
  return true;
}

/** 카드 거르기(filter: owner · pool · costNeigongGte) */
function cardMatches(state: BattleState, cardId: string, filter: Effect['filter']): boolean {
  const def = state.data.cards.get(cardId);
  if (!def) return false;
  if (!filter) return true;
  if (filter.owner !== undefined && def.owner !== filter.owner) return false;
  if (filter.pool !== undefined && def.pool !== filter.pool) return false;
  if (filter.costNeigongGte !== undefined && def.cost.neigong < filter.costNeigongGte) return false;
  return true;
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
    if (effect.oncePerBattle) {
      const key = `${ctx.card?.def.id ?? ''}:${effect.op}`;
      if ((state.onceUsed ??= []).includes(key)) continue;
      if (checkCondition(state, effect.condition, ctx)) state.onceUsed.push(key);
    }
    applyEffect(state, effect, ctx);
  }
}

function applyEffect(state: BattleState, effect: Effect, ctx: EffectContext): void {
  const needsTarget = !['gain_neigong', 'gain_mana', 'draw', 'discard', 'rift', 'add_card', 'neigong_max', 'summon', 'consume_rift', 'scar', 'cost_next', 'recall', 'copy_card', 'reveal_intent', 'purge', 'delay_enrage'].includes(effect.op);
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
      case 'consume_rift': {
        // 균열 소비: amount가 있으면 그만큼까지, 없으면 전부. 소비한 양은 뒤 효과의 scale per consumed
        const n = Math.min(state.rift, effect.amount ?? state.rift);
        state.consumed = n;
        if (n > 0) {
          changeRift(state, -n);
          state.log.push(`균열 ${n}을 소비했다.`);
        }
        return;
      }
      case 'cost_next':
        // 다음에 내는 카드의 내공 비용 -N(가벼운 다음 수, 카드를 낸 사람에게)
        if (ctx.source) addStatus(state, ctx.source, 'cost_down', amount);
        return;
      case 'recall': {
        // 소멸 더미에서 카드 amount(기본 1)장을 손패로(filter로 거른다, 무작위)
        for (let i = 0; i < Math.max(1, amount); i++) {
          if (state.hand.length >= state.data.balance.maxHand) break;
          const idxs = state.exhaust.map((_, j) => j).filter((j) => cardMatches(state, state.exhaust[j].cardId, effect.filter));
          if (!idxs.length) break;
          const [card] = state.exhaust.splice(state.rng.pick(idxs), 1);
          state.hand.push(card);
          state.events.push({ type: 'recall', cardId: card.cardId });
          state.log.push(`${state.data.cards.get(card.cardId)?.name ?? card.cardId}을(를) 되찾았다.`);
        }
        return;
      }
      case 'copy_card': {
        // 손패의 카드 하나를 복제해 손패에(이번 전투에서만, 내면 소멸). 상태 카드는 빼고 filter로 거른다
        for (let i = 0; i < Math.max(1, amount); i++) {
          if (state.hand.length >= state.data.balance.maxHand) break;
          const pool = state.hand.filter((c) => state.data.cards.get(c.cardId)?.type !== 'status' && cardMatches(state, c.cardId, effect.filter));
          if (!pool.length) break;
          const src = state.rng.pick(pool);
          const copy = { ...newCard(state, src.cardId, src.level), temp: true };
          state.hand.push(copy);
          state.events.push({ type: 'copy', cardId: src.cardId });
          state.log.push(`${state.data.cards.get(src.cardId)?.name ?? src.cardId}을(를) 하나 더 쥐었다.`);
        }
        return;
      }
      case 'reveal_intent':
        // 안개 속의 눈: 이번 차례에는 법칙 '안개'가 가린 적의 의도가 보인다
        state.intentRevealTurn = state.turn;
        state.log.push('안개 너머로 적이 무엇을 하려는지 보였다.');
        return;
      case 'purge': {
        // effect.card를 손패·버린 더미·뽑을 더미에서 amount장까지(그 순서로) 소멸시킨다(잔향 먹는 금)
        let left = Math.max(1, amount);
        for (const pile of [state.hand, state.discard, state.draw]) {
          for (let i = pile.length - 1; i >= 0 && left > 0; i--) {
            if (pile[i].cardId !== effect.card) continue;
            const [card] = pile.splice(i, 1);
            state.exhaust.push(card);
            state.events.push({ type: 'purge', cardId: card.cardId });
            left--;
          }
        }
        const n = Math.max(1, amount) - left;
        if (n > 0) state.log.push(`${state.data.cards.get(effect.card ?? '')?.name ?? effect.card} ${n}장을 걷어 냈다.`);
        return;
      }
      case 'delay_enrage': {
        // 격노 늦추기: 살아 있는 적의 격노(과 법칙의 격노)가 amount턴 늦게 온다. 이미 격노했으면 지금부터 amount턴 쉰다
        const later = (at: number) => (at >= state.turn ? at : state.turn) + amount;
        for (const e of state.enemies) {
          const def = state.data.enemies.get(e.defId);
          if (e.downed || !def?.enrage) continue;
          e.enrageAt = later(e.enrageAt ?? def.enrage.afterTurn);
        }
        if (state.lawEnrage) state.lawEnrage = state.lawEnrage.map((le) => ({ ...le, afterTurn: later(le.afterTurn) }));
        state.log.push(`격노가 ${amount}턴 늦춰졌다.`);
        return;
      }
      case 'scar':
        // 전투 중 상흔(은빛 바느질 -1 · 틈의 카드의 대가 +2): 전투 결과의 상흔에 더한다
        if (state.tally) state.tally.surgeScar = (state.tally.surgeScar ?? 0) + amount;
        state.scar = Math.max(0, state.scar + amount);
        state.events.push({ type: 'scar', delta: amount });
        state.log.push(`상흔 ${amount >= 0 ? '+' : ''}${amount}`);
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
      case 'keep_block':
        // 이번 차례에 얻은 방어가 다음 차례 시작에 사라지지 않는다(한 번)
        addStatus(state, target, 'block_kept', 1);
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

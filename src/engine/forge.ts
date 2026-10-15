// 대강화 각인(GAME_DESIGN 16절 ⑦, 2026-10-15 개편): +6~+9 성공마다 카드에 맞는 각인 몇 개 중 하나를 골라 새긴다.
// 각인·각성 데이터는 data/forge.json, 카드 모습에 적용하는 것은 state.ts resolveCard.
import type { GameData } from './data';
import type { ForgeMod } from './schema';
import { createRng } from './rng';
import { isEnemyDebuff, isPrice, resolveCard, type CardInstance } from './state';
import type { RunState } from './run';

/** 이 카드(지금 모습)가 이 각인을 받을 수 있는가. 이미 새긴 각인은 다시 받지 않는다 */
export function engravingAllowed(data: GameData, inst: CardInstance, mod: ForgeMod): boolean {
  if ((inst.marks ?? []).includes(mod.id)) return false;
  const card = resolveCard(data, inst);
  const w = mod.when;
  const effects = card.effects;
  if (w.types && !w.types.includes(card.def.type as never)) return false;
  if (w.hasOp && !effects.some((e) => w.hasOp!.includes(e.op))) return false;
  if (w.plainDamage && !effects.some((e) => e.op === 'damage' && !e.element)) return false;
  if (w.target && !w.target.includes(card.def.target)) return false;
  if (w.costMin !== undefined && card.cost.neigong + card.cost.mana < w.costMin) return false;
  if (w.without && w.without.some((k) => card.keywords.includes(k))) return false;
  if (w.hasPrice && !effects.some(isPrice)) return false;
  if (w.debuffs && !effects.some((e) => isEnemyDebuff(data, e, card.def.target))) return false;
  return true;
}

/** 각인 후보: 받을 수 있는 각인 중 balance offer개(시드·카드·단계로 정해진다) */
export function engravingOffer(data: GameData, run: RunState, inst: CardInstance, key: string): string[] {
  const pool = data.forge.engravings.filter((m) => engravingAllowed(data, inst, m)).map((m) => m.id);
  return createRng(run.seed).fork(`engrave:${key}:${inst.level}`).shuffle(pool).slice(0, data.balance.upgrade.forge.offer);
}

/** 고를 각인이 남았는가 */
export function engravingPending(run: RunState): NonNullable<RunState['forgePending']> | null {
  return run.forgePending ?? null;
}

/** 각인을 새긴다: 캠페인은 보유 카드(같은 카드의 덱 인스턴스 모두), 심연은 그 카드 한 장 */
export function chooseEngraving(data: GameData, run: RunState, id: string): { ok: true; message: string } | { ok: false; reason: string } {
  const p = run.forgePending;
  if (!p) return { ok: false, reason: '고를 각인이 없다' };
  if (!p.choices.includes(id)) return { ok: false, reason: '후보에 없는 각인' };
  const mod = data.forge.engravings.find((m) => m.id === id)!;
  const target = run.deck.find((c) => c.uid === p.uid);
  if (run.abyss) {
    if (target) target.marks = [...(target.marks ?? []), id];
  } else {
    run.engravings ??= {};
    const marks = [...(run.engravings[p.cardId] ?? []), id];
    run.engravings[p.cardId] = marks;
    for (const c of run.deck) if (c.cardId === p.cardId) c.marks = [...marks];
  }
  run.forgePending = null;
  return { ok: true, message: `각인 ◆${mod.name}: ${data.cards.get(p.cardId)?.name ?? ''} — ${mod.text}` };
}

/** 상점을 떠날 때 고르지 않은 각인은 첫 후보로 새긴다 */
export function settleEngraving(data: GameData, run: RunState): void {
  if (run.forgePending?.choices.length) chooseEngraving(data, run, run.forgePending.choices[0]);
  else run.forgePending = null;
}

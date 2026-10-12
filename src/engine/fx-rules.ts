// 이펙트 규칙(GAME_DESIGN 13절, 2026-10-12): 카드 특성 → 공격 이펙트·피격 이펙트·시전 이펙트. data/fx.json의 규칙을 위에서부터 본다.
// 카드에 직접 적힌 fx·hitFx가 가장 먼저다(카드별 연출을 지정한 7장 등).
import type { GameData } from './data';
import type { CardDef } from './schema';

export interface CardFx {
  fx?: string;
  hitFx?: string;
  castFx?: string;
}

/** 카드가 싣는 속성(피해 효과의 element 중 처음 것) */
function cardElement(card: CardDef): 'fire' | 'ice' | undefined {
  for (const e of card.effects) if (e.op === 'damage' && e.element) return e.element as 'fire' | 'ice';
  return undefined;
}

export function cardFx(data: GameData, card: CardDef): CardFx {
  const out: CardFx = { fx: card.fx, hitFx: card.hitFx };
  const element = cardElement(card);
  const tags = card.tags ?? [];
  for (const r of data.fx.rules) {
    const w = r.when;
    if (w.owner !== undefined && w.owner !== card.owner) continue;
    if (w.tag !== undefined && !tags.includes(w.tag)) continue;
    if (w.element !== undefined && w.element !== element) continue;
    if (w.type !== undefined && w.type !== card.type) continue;
    if (w.target !== undefined && w.target !== card.target) continue;
    if (w.pool !== undefined && w.pool !== card.pool) continue;
    out.fx ??= r.fx;
    out.hitFx ??= r.hitFx;
    out.castFx ??= r.castFx;
  }
  return out;
}

/** 규칙과 이벤트가 쓰는 이펙트 id 전부(데이터 검사용) */
export function fxRuleIds(data: GameData): string[] {
  const ids = new Set<string>(Object.values(data.fx.events).filter((x): x is string => !!x));
  for (const r of data.fx.rules) for (const id of [r.fx, r.hitFx, r.castFx]) if (id) ids.add(id);
  return [...ids];
}

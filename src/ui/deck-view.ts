// 덱 보기: 카드 묶음(덱 전체, 또는 전투 중 손패·더미별)을 카드 모양 그대로 보여 준다.
import type { GameData } from '../engine/data';
import { resolveCard, type CardInstance } from '../engine/state';
import { cardView } from './card-view';
import { h } from './dom';
import { openOverlay } from './overlay';

export interface CardGroup {
  label: string;
  cards: CardInstance[];
  /** 뽑을 더미처럼 순서를 보여 주면 안 되는 묶음은 정렬해서 보여 준다 */
  hint?: string;
}

/** 같은 카드·같은 강화 단계는 한 장으로 모으고 ×n을 붙인다. 주인 → 이름 순 */
function stacks(data: GameData, cards: CardInstance[]): { inst: CardInstance; count: number }[] {
  const map = new Map<string, { inst: CardInstance; count: number }>();
  for (const c of cards) {
    const key = `${c.cardId}#${c.level}`;
    const s = map.get(key);
    if (s) s.count++;
    else map.set(key, { inst: c, count: 1 });
  }
  const order = [...data.characters.keys()];
  const rank = (owner: string) => (order.includes(owner) ? order.indexOf(owner) : order.length);
  return [...map.values()].sort((a, b) => {
    const da = resolveCard(data, a.inst).def;
    const db = resolveCard(data, b.inst).def;
    return rank(da.owner) - rank(db.owner) || da.name.localeCompare(db.name, 'ko') || a.inst.level - b.inst.level;
  });
}

/** mark: 이 카드 id들(지금 화면의 보상·상점 후보)에 '보유 중 +L' 배지 */
export function deckGroupsView(data: GameData, groups: CardGroup[], mark?: ReadonlySet<string>): HTMLElement {
  return h(
    'div',
    { class: 'deck-view' },
    groups.map((g) =>
      h(
        'section',
        { class: 'deck-group' },
        groups.length > 1 || g.hint ? h('h3', {}, `${g.label} (${g.cards.length})`, g.hint ? h('small', {}, g.hint) : null) : null,
        g.cards.length
          ? h(
              'div',
              { class: 'deck-cards' },
              stacks(data, g.cards).map(({ inst, count }) =>
                h(
                  'div',
                  { class: `deck-card${mark?.has(inst.cardId) ? ' marked' : ''}` },
                  cardView(data, inst),
                  count > 1 ? h('span', { class: 'deck-count' }, `×${count}`) : null,
                  mark?.has(inst.cardId) ? h('span', { class: 'deck-mark' }, `보유 중 +${inst.level}`) : null,
                ),
              ),
            )
          : h('p', { class: 'hint' }, '없음'),
      ),
    ),
  );
}

export function openDeck(data: GameData, title: string, groups: CardGroup[], mark?: ReadonlySet<string>): { close: () => void; el: HTMLElement } {
  return openOverlay(title, deckGroupsView(data, groups, mark), { wide: true });
}

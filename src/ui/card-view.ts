// 카드 한 장의 DOM.
import type { GameData } from '../engine/data';
import { isFusion, resolveCard, type CardInstance } from '../engine/state';
import { cardText } from '../engine/text';
import { h } from './dom';

const RARITY_LABEL: Record<string, string> = { common: '일반', uncommon: '고급', rare: '희귀', epic: '영웅', legendary: '전설' };

export function cardView(data: GameData, inst: CardInstance | string, opts: { disabled?: string; selected?: boolean } = {}): HTMLElement {
  const card = resolveCard(data, inst);
  const def = card.def;
  const owner = data.characters.get(def.owner);
  const pips = (n: number, cls: string) => Array.from({ length: n }, () => h('span', { class: `pip ${cls}` }));
  return h(
    'div',
    {
      class: `card card-${def.type} rarity-${def.rarity}${isFusion(card) ? ' card-fusion' : ''}${opts.disabled ? ' card-disabled' : ''}${opts.selected ? ' card-selected' : ''}`,
      style: owner ? `--owner:${owner.color}` : '',
      title: opts.disabled ?? def.flavor ?? '',
    },
    h('div', { class: 'card-cost' }, pips(card.cost.neigong, 'pip-neigong'), pips(card.cost.mana, 'pip-mana'), card.cost.neigong + card.cost.mana === 0 ? h('span', { class: 'pip-zero' }, '0') : null),
    h('div', { class: 'card-name' }, def.name, card.level ? h('span', { class: `card-level${card.level > 3 ? ' card-level-skill' : ''}` }, ` +${card.level}`) : null),
    h('div', { class: 'card-owner' }, owner?.name ?? (def.owner === 'status' ? '상태' : '공용'), def.rarity !== 'special' ? h('span', { class: 'card-rarity' }, RARITY_LABEL[def.rarity]) : null),
    h('div', { class: 'card-text' }, cardText(data, inst)),
    def.flavor ? h('div', { class: 'card-flavor' }, def.flavor) : null,
  );
}

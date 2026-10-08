// 카드 한 장의 DOM. 틀은 출신 세계로 나눈다(GAME_DESIGN 13절): 무공(한지·먹·낙관) / 마법(엘하임: 청색 양피지·은테·마법진) / 융합(내공+마나).
import type { GameData } from '../engine/data';
import { isFusion, resolveCard, type CardInstance, type ResolvedCard } from '../engine/state';
import { cardText } from '../engine/text';
import { h } from './dom';

const RARITY_LABEL: Record<string, string> = { common: '일반', uncommon: '고급', rare: '희귀', epic: '영웅', legendary: '전설' };
const SEAL_BY_TYPE: Record<string, string> = { attack: '武', skill: '技', power: '心' };

export type CardWorld = 'murim' | 'elheim' | 'fusion' | 'status';

/** 카드 틀: 내공·마나를 함께 들면 융합, 하운·공용은 무공, 엘하임 동료는 마법, 상태·저주는 따로 */
export function cardWorld(card: ResolvedCard): CardWorld {
  const def = card.def;
  if (def.owner === 'status' || def.pool === 'status') return 'status';
  if (isFusion(card)) return 'fusion';
  return def.owner === 'haun' || def.owner === 'common' ? 'murim' : 'elheim';
}

export function cardView(data: GameData, inst: CardInstance | string, opts: { disabled?: string; selected?: boolean } = {}): HTMLElement {
  const card = resolveCard(data, inst);
  const def = card.def;
  const owner = data.characters.get(def.owner);
  const world = cardWorld(card);
  const pips = (n: number, cls: string) => Array.from({ length: n }, () => h('span', { class: `pip ${cls}` }));
  const zero = card.cost.neigong + card.cost.mana === 0;
  return h(
    'div',
    {
      class: `card t-${world} card-${def.type} rarity-${def.rarity}${opts.disabled ? ' card-disabled' : ''}${opts.selected ? ' card-selected' : ''}`,
      style: owner ? `--owner:${owner.color}` : '',
      title: opts.disabled ?? def.flavor ?? '',
    },
    def.rarity !== 'special' ? h('span', { class: `gem gem-${def.rarity}`, 'aria-hidden': 'true' }) : null,
    h('div', { class: 'card-cost', 'aria-label': `내공 ${card.cost.neigong} 마나 ${card.cost.mana}` }, pips(card.cost.neigong, 'pip-neigong'), pips(card.cost.mana, 'pip-mana'), zero ? h('span', { class: 'pip-zero' }, '0') : null),
    h('div', { class: 'card-name' }, def.name, card.level ? h('span', { class: `card-level${card.level > 3 ? ' card-level-skill' : ''}` }, ` +${card.level}`) : null),
    h('div', { class: 'card-owner' }, h('span', {}, owner?.name ?? (def.owner === 'status' ? '상태' : '공용')), def.rarity !== 'special' ? h('span', { class: 'card-rarity' }, RARITY_LABEL[def.rarity]) : null),
    h('div', { class: 'card-text' }, cardText(data, inst)),
    def.flavor ? h('div', { class: 'card-flavor' }, def.flavor) : null,
    world === 'murim' ? h('span', { class: 'seal', 'aria-hidden': 'true' }, def.seal ?? SEAL_BY_TYPE[def.type] ?? '武') : null,
    world === 'elheim' ? h('span', { class: 'circle', 'aria-hidden': 'true' }) : null,
  );
}

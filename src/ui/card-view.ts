// 카드 한 장의 DOM. 틀은 출신 세계로 나눈다(GAME_DESIGN 13절): 무공(한지·먹·낙관) / 마법(엘하임: 청색 양피지·은테·마법진) / 융합(내공+마나).
import type { GameData } from '../engine/data';
import { isFusion, resolveCard, type CardInstance, type ResolvedCard } from '../engine/state';
import { cardGlossary, cardText } from '../engine/text';
import { acquirePreview } from '../engine/collection';
import type { RunState } from '../engine/run';
import { tipAttrs } from './tooltip';
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
      class: `card t-${world} card-${def.type} rarity-${def.rarity}${def.pool === 'abyss' ? ' card-abyss' : ''}${opts.disabled ? ' card-disabled' : ''}${opts.selected ? ' card-selected' : ''}`,
      style: owner ? `--owner:${owner.color}` : '',
      title: opts.disabled ?? def.flavor ?? '',
    },
    def.rarity !== 'special' ? h('span', { class: `gem gem-${def.rarity}`, 'aria-hidden': 'true' }) : null,
    h('div', { class: 'card-cost', 'aria-label': `내공 ${card.cost.neigong} 마나 ${card.cost.mana}` }, pips(card.cost.neigong, 'pip-neigong'), pips(card.cost.mana, 'pip-mana'), zero ? h('span', { class: 'pip-zero' }, '0') : null),
    h('div', { class: 'card-name' }, def.name, card.level ? h('span', { class: `card-level${card.level > 3 ? ' card-level-skill' : ''}` }, ` +${card.level}`) : null),
    h('div', { class: 'card-owner' }, h('span', {}, owner?.name ?? (def.owner === 'status' ? '상태' : '공용')), def.rarity !== 'special' ? h('span', { class: 'card-rarity' }, RARITY_LABEL[def.rarity]) : null),
    h('div', { class: 'card-text', ...glossaryTip(data, inst) }, cardText(data, inst)),
    def.flavor ? h('div', { class: 'card-flavor' }, def.flavor) : null,
    world === 'murim' ? h('span', { class: 'seal', 'aria-hidden': 'true' }, def.seal ?? SEAL_BY_TYPE[def.type] ?? '武') : null,
    world === 'elheim' ? h('span', { class: 'circle', 'aria-hidden': 'true' }) : null,
  );
}

/** 카드 글 위에 마우스를 올리면 용어 풀이(키워드·상태·속성) */
function glossaryTip(data: GameData, inst: CardInstance | string): Record<string, string | undefined> {
  const lines = cardGlossary(data, inst);
  return lines.length ? tipAttrs('용어', lines.join('\n')) : {};
}

/**
 * 보상·상점의 카드: 얻으면 어떻게 되는지 표(새 카드 / 보유 +1 → +2 / 최대 강화 → 골드)를 붙이고, 받을 강화 단계로 보여 준다.
 * 심연은 보유 목록이 없어 풀의 강화 단계로만 보여 준다.
 */
export function offerCardView(data: GameData, run: RunState, cardId: string): HTMLElement {
  if (run.abyss) return cardView(data, { uid: `offer:${cardId}`, cardId, level: run.abyss.pool[cardId] ?? 0 });
  const p = acquirePreview(data, run, cardId);
  const el = cardView(data, { uid: `offer:${cardId}`, cardId, level: p.level });
  const [cls, label, tip] =
    p.kind === 'new'
      ? ['new', '새 카드', '아직 없는 카드. 보유 카드와 이번 스테이지 덱에 들어간다.']
      : p.kind === 'upgrade'
        ? ['up', `보유 +${p.from} → +${p.level}`, '이미 가진 카드라 보유 카드가 +1 강화된다(보이는 모습이 강화 뒤).']
        : ['max', `최대 강화 → 골드 +${p.gold}`, '이미 최대로 강화한 카드라 대신 골드를 받는다.'];
  el.prepend(h('span', { class: `offer-badge offer-${cls}`, ...tipAttrs(label, tip) }, label));
  return el;
}

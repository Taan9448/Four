// 카드 한 장의 DOM. 틀은 출신 세계로 나눈다(GAME_DESIGN 13절): 무공(한지·먹·낙관) / 마법(엘하임: 청색 양피지·은테·마법진) / 융합(내공+마나).
import type { GameData } from '../engine/data';
import { isFusion, resolveCard, type CardInstance, type ResolvedCard } from '../engine/state';
import { cardGlossary, cardText } from '../engine/text';
import { acquirePreview } from '../engine/collection';
import type { RunState } from '../engine/run';
import { frameUrl, spriteMeta } from '../render/assets';
import { isPxCardsPreview } from './debug';
import { tipAttrs } from './tooltip';
import { h } from './dom';

const RARITY_LABEL: Record<string, string> = { common: '일반', uncommon: '고급', rare: '희귀', epic: '영웅', legendary: '전설' };
const SEAL_BY_TYPE: Record<string, string> = { attack: '武', skill: '技', power: '心' };
const TYPE_LABEL: Record<string, string> = { attack: '공격', skill: '기술', power: '심법', status: '상태' };

/** 픽셀 카드 틀(Codex 그림 card_frame_*, 2026-10-11). 상태·저주는 무공 틀을 어둡게 */
const FRAME_ID: Record<CardWorld, string> = { murim: 'card_frame_murim', elheim: 'card_frame_magic', fusion: 'card_frame_fusion', status: 'card_frame_murim' };
/** card_gems 칸 번호: 1 내공 비용 · 2 마나 비용 · 3~7 등급 */
const GEM_CELL: Record<string, number> = { neigong: 1, mana: 2, common: 3, uncommon: 4, rare: 5, epic: 6, legendary: 7 };
/** 명세(specs/assets/card_frame_*.yaml)의 layout.art — 그림이 meta.window를 남기지 않았을 때 */
const ART_WINDOW: [number, number, number, number] = [16, 12, 96, 70];

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
  const frame = frameUrl(FRAME_ID[world], 1, { realOnly: !isPxCardsPreview() });
  if (frame) return pixelCardView(data, inst, card, world, frame, opts);
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

/**
 * 픽셀 카드(하스스톤형): 그림 창 아래에 카드 그림(없으면 한자 인장)을 깔고, 틀 위에 비용 보석·이름·등급 보석·글·종류를 얹는다.
 * 자리는 명세 layout(128×192 격자)과 같다(src/style.css .card-px). 그림 창은 자르기 도구가 잰 meta.window를 쓴다.
 */
function pixelCardView(
  data: GameData,
  inst: CardInstance | string,
  card: ResolvedCard,
  world: CardWorld,
  frame: string,
  opts: { disabled?: string; selected?: boolean },
): HTMLElement {
  const def = card.def;
  const owner = data.characters.get(def.owner);
  const realOnly = !isPxCardsPreview();
  const gem = (key: string) => frameUrl('card_gems', GEM_CELL[key], { realOnly });
  const [wx, wy, ww, wh] = spriteMeta(FRAME_ID[world])?.window ?? ART_WINDOW;
  // 비용: 내공·마나 중 있는 것을 왼쪽부터(융합은 왼쪽 내공 · 오른쪽 마나). 0이면 틀의 기본 자원으로 0
  const costs = (
    [
      ['neigong', card.cost.neigong],
      ['mana', card.cost.mana],
    ] as const
  ).filter(([, n]) => n > 0);
  if (!costs.length) costs.push([world === 'elheim' ? 'mana' : 'neigong', 0]);
  const costEl = ([kind, n]: readonly ['neigong' | 'mana', number], i: number) => {
    const url = gem(kind);
    return h(
      'span',
      { class: `cpx-cost cpx-cost-${kind} ${i ? 'cpx-cost-r' : 'cpx-cost-l'}${url ? '' : ' cpx-cost-css'}`, style: url ? `background-image:url(${url})` : '', 'aria-label': `${kind === 'neigong' ? '내공' : '마나'} ${n}` },
      String(n),
    );
  };
  const text = cardText(data, inst);
  const textSize = text.length > 72 ? ' cpx-text-xs' : text.length > 54 ? ' cpx-text-s' : text.length > 36 ? ' cpx-text-m' : '';
  const name = def.name + (card.level ? ` +${card.level}` : '');
  const nameSize = name.length > 9 ? ' cpx-name-s' : name.length > 7 ? ' cpx-name-m' : '';
  const rarityUrl = def.rarity !== 'special' ? gem(def.rarity) : null;
  const seal = world === 'elheim' ? '✧' : def.seal ?? SEAL_BY_TYPE[def.type] ?? '武';
  return h(
    'div',
    {
      class: `card card-px t-${world} card-${def.type} rarity-${def.rarity}${def.pool === 'abyss' ? ' card-abyss' : ''}${opts.disabled ? ' card-disabled' : ''}${opts.selected ? ' card-selected' : ''}`,
      style: owner ? `--owner:${owner.color}` : '',
      title: opts.disabled ?? def.flavor ?? '',
    },
    h('div', { class: 'cpx-art', style: `left:${wx - 2}px;top:${wy - 2}px;width:${ww + 4}px;height:${wh + 4}px`, 'aria-hidden': 'true' }, h('span', { class: 'cpx-seal' }, seal)),
    h('img', { class: 'cpx-frame', src: frame, alt: '', draggable: 'false' }),
    ...costs.map(costEl),
    h('div', { class: `cpx-name${nameSize}` }, def.name, card.level ? h('span', { class: `card-level${card.level > 3 ? ' card-level-skill' : ''}` }, ` +${card.level}`) : null),
    rarityUrl ? h('img', { class: 'cpx-rarity', src: rarityUrl, alt: RARITY_LABEL[def.rarity] ?? '' }) : def.rarity !== 'special' ? h('span', { class: `cpx-rarity gem gem-${def.rarity}`, 'aria-label': RARITY_LABEL[def.rarity] }) : null,
    h('div', { class: `cpx-text${textSize}`, ...glossaryTip(data, inst) }, text),
    h('div', { class: 'cpx-plaque' }, `${owner?.name ?? (def.owner === 'status' ? '상태' : '공용')} · ${TYPE_LABEL[def.type] ?? ''}`),
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

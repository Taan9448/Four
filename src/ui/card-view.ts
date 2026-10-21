// 카드 한 장의 DOM. 틀은 출신 세계로 나눈다(GAME_DESIGN 13절): 무공(한지·먹·낙관) / 마법(엘하임: 청색 양피지·은테·마법진) / 융합(내공+마나).
import type { GameData } from '../engine/data';
import { isFusion, resolveCard, type CardInstance, type ResolvedCard } from '../engine/state';
import { cardGlossary, cardTextParts, type CardTextParts } from '../engine/text';
import { acquirePreview, cardPoints } from '../engine/collection';
import type { RunState } from '../engine/run';
import { cardArtUrl, frameUrl, spriteMeta } from '../render/assets';
import { isPxCardsPreview } from './debug';
import { tipAttrs } from './tooltip';
import { h } from './dom';

const RARITY_LABEL: Record<string, string> = { common: '일반', uncommon: '고급', rare: '희귀', epic: '영웅', legendary: '전설' };
const SEAL_BY_TYPE: Record<string, string> = { attack: '武', skill: '技', power: '心' };
const TYPE_LABEL: Record<string, string> = { attack: '공격', skill: '기술', power: '심법', status: '상태' };

/** 대강화 틀 단계(+8·+9·+10, GAME_DESIGN 16절 ⑦): 카드에 forge-8 같은 이름을 붙인다 */
function forgeClass(card: ResolvedCard): string {
  return card.forge >= 3 ? ` card-forged forge-${card.level}` : card.forge ? ' card-forged' : '';
}

/** 대강화 각인·각성 표식: 카드 오른쪽 위에 새긴 순서대로 한 글자씩(각성은 금빛) */
function marksView(card: ResolvedCard): HTMLElement | null {
  if (!card.engravings.length && !card.awakening) return null;
  return h(
    'div',
    { class: 'card-marks-wrap', 'aria-label': `각인 ${card.engravings.map((m) => m.name).join('·')}${card.awakening ? ` · 각성 ${card.awakening.name}` : ''}` },
    card.engravings.length ? h('div', { class: 'card-marks' }, ...card.engravings.map((m) => h('span', { class: 'card-mark', title: `${m.name}: ${m.text}` }, m.glyph))) : null,
    card.awakening ? h('span', { class: 'card-mark card-mark-awaken', title: `${card.awakening.name}: ${card.awakening.text}` }, card.awakening.glyph) : null,
  );
}

/** 픽셀 카드 틀(Codex 그림 card_frame_*, 2026-10-11). 상태·저주는 무공 틀을 어둡게 */
const FRAME_ID: Record<CardWorld, string> = { murim: 'card_frame_murim', elheim: 'card_frame_magic', fusion: 'card_frame_fusion', status: 'card_frame_murim' };
/** card_gems 칸 번호: 1 내공 비용 · 2 마나 비용 · 3~7 등급 */
const GEM_CELL: Record<string, number> = { neigong: 1, mana: 2, common: 3, uncommon: 4, rare: 5, epic: 6, legendary: 7 };
/** 명세(specs/assets/card_frame_*.yaml)의 layout.art — 그림이 meta.window를 남기지 않았을 때 */
const ART_WINDOW: [number, number, number, number] = [16, 12, 96, 70];

export type CardWorld = 'murim' | 'elheim' | 'fusion' | 'status';

/** 카드 틀: 내공·마나를 함께 들면 융합, 하운·공용은 무공, 엘하임 동료는 마법, 상태·저주는 따로 */
/**
 * 카드 틀 색은 비용으로 정한다(2026-10-12 사용자 결정): 내공만 = 노랑(무공 틀), 마나만 = 파랑(마법 틀), 둘 다 = 반반(융합 틀).
 * 비용 0인 카드만 주인으로 가른다(하운·공용 = 무공, 그 밖 = 마법)
 */
export function cardWorld(card: ResolvedCard): CardWorld {
  const def = card.def;
  if (def.owner === 'status' || def.pool === 'status') return 'status';
  if (isFusion(card)) return 'fusion';
  if (card.cost.mana > 0) return 'elheim';
  if (card.cost.neigong > 0) return 'murim';
  return def.owner === 'haun' || def.owner === 'common' ? 'murim' : 'elheim';
}

/**
 * flavor(2026-10-11 UI/UX 1단계): 플레이버 글은 카드를 크게 볼 때만 — 'hover' 손패(올리거나 고르면 카드 위에) · 'full' 크게 보기(도감·상세).
 * 없으면(목록·편성·상점·보상 = compact) 그리지 않는다. 카드 틀 높이는 그대로
 */
/** 색각 보정의 등급 모양(일반 ◇ 고급 △ 희귀 ○ 영웅 ☆ 전설 ✦) */
const RARITY_SHAPE: Record<string, string> = { common: '◇', uncommon: '△', rare: '○', epic: '☆', legendary: '✦' };

export interface CardViewOpts {
  disabled?: string;
  selected?: boolean;
  flavor?: 'hover' | 'full';
}

export function cardView(data: GameData, inst: CardInstance | string, opts: CardViewOpts = {}): HTMLElement {
  const el = cardViewInner(data, inst, opts);
  // 화면의 카드 id(보유 카드 창이 '지금 보이는 후보'를 짚는다 — 2026-10-12 B2)
  el.dataset.cardId = typeof inst === 'string' ? inst : inst.cardId;
  return el;
}

function cardViewInner(data: GameData, inst: CardInstance | string, opts: CardViewOpts): HTMLElement {
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
      class: `card t-${world} card-${def.type} rarity-${def.rarity}${forgeClass(card)}${def.pool === 'abyss' ? ' card-abyss' : ''}${opts.disabled ? ' card-disabled' : ''}${opts.selected ? ' card-selected' : ''}`,
      style: owner ? `--owner:${owner.color}` : '',
      title: opts.disabled ?? '',
    },
    def.rarity !== 'special' ? h('span', { class: `gem gem-${def.rarity}`, 'aria-hidden': 'true' }) : null,
    h('div', { class: 'card-cost', 'aria-label': `내공 ${card.cost.neigong} 마나 ${card.cost.mana}` }, pips(card.cost.neigong, 'pip-neigong'), pips(card.cost.mana, 'pip-mana'), zero ? h('span', { class: 'pip-zero' }, '0') : null),
    h('div', { class: 'card-name' }, def.name, card.level ? h('span', { class: `card-level${card.level > 3 ? ' card-level-skill' : ''}${card.forge ? ' card-level-forge' : ''}` }, ` +${card.level}`) : null),
    marksView(card),
    h('div', { class: 'card-owner' }, h('span', {}, owner?.name ?? (def.owner === 'status' ? '상태' : '공용')), def.rarity !== 'special' ? h('span', { class: 'card-rarity' }, RARITY_LABEL[def.rarity]) : null),
    h('div', { class: 'card-text', ...glossaryTip(data, inst) }, ...textBlocks(cardTextParts(data, inst))),
    def.flavor && opts.flavor ? h('div', { class: `card-flavor${opts.flavor === 'hover' ? ' flavor-hover' : ''}` }, def.flavor) : null,
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
  opts: CardViewOpts,
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
  const parts = cardTextParts(data, inst);
  // 글씨 크기: 본문과 특수 스킬을 합친 길이로(특수 스킬 줄은 한 줄 몫을 더 친다)
  const len = parts.body.length + parts.skills.reduce((a, sk) => a + sk.name.length + sk.text.length + 10, 0);
  const textSize = len > 72 ? ' cpx-text-xs' : len > 54 ? ' cpx-text-s' : len > 36 ? ' cpx-text-m' : '';
  const slots = spriteMeta(FRAME_ID[world])?.slots;
  const at = (b: number[] | undefined, pad = 0) => (b ? `left:${b[0] + pad}px;top:${b[1] + pad}px;width:${b[2] - pad * 2}px;height:${b[3] - pad * 2}px` : '');
  const name = def.name + (card.level ? ` +${card.level}` : '');
  const nameSize = name.length > 9 ? ' cpx-name-s' : name.length > 7 ? ' cpx-name-m' : '';
  const rarityUrl = def.rarity !== 'special' ? gem(def.rarity) : null;
  const seal = world === 'elheim' ? '✧' : def.seal ?? SEAL_BY_TYPE[def.type] ?? '武';
  const artUrl = cardArtUrl(def.id);
  const shine = def.rarity === 'epic' || def.rarity === 'legendary';
  const forgeFrame = card.forge >= 3 ? frameUrl(`card_frame_forge_${card.level}`, 1, { realOnly }) : null;
  return h(
    'div',
    {
      class: `card card-px t-${world} card-${def.type} rarity-${def.rarity}${forgeClass(card)}${def.pool === 'abyss' ? ' card-abyss' : ''}${opts.disabled ? ' card-disabled' : ''}${opts.selected ? ' card-selected' : ''}`,
      style: owner ? `--owner:${owner.color}` : '',
      title: opts.disabled ?? '',
    },
    // 손패: 올리거나 고르면 카드 위에 플레이버 글(크게 보기는 부르는 쪽이 카드 아래에 따로)
    def.flavor && opts.flavor === 'hover' ? h('div', { class: 'cpx-flavor', 'aria-hidden': 'true' }, def.flavor) : null,
    // 카드 그림(card_art_*)이 들어왔으면 그림 창 아래에 꽉 채워 깐다. 없으면 주인 색 바탕에 한자 인장
    h(
      'div',
      { class: 'cpx-art', style: `left:${wx - 2}px;top:${wy - 2}px;width:${ww + 4}px;height:${wh + 4}px`, 'aria-hidden': 'true' },
      artUrl ? h('img', { class: 'cpx-art-img', src: artUrl, alt: '', draggable: 'false' }) : h('span', { class: 'cpx-seal' }, seal),
    ),
    // 영웅·전설의 움직임(2026-10-11): 테두리 빛(어디서나) · 그림 창 광택 · 전설은 금빛 티끌(손패·보상·크게 보기에서만, CSS)
    shine ? h('span', { class: 'cpx-glow', 'aria-hidden': 'true' }) : null,
    shine ? h('span', { class: 'cpx-sheen', style: `left:${wx}px;top:${wy}px;width:${ww}px;height:${wh}px`, 'aria-hidden': 'true' }) : null,
    h('img', { class: 'cpx-frame', src: frame, alt: '', draggable: 'false' }),
    // 대강화 +8·+9·+10 틀(Codex 그림 card_frame_forge_*, 틀 위에 겹치는 테두리). 그림이 오기 전에는 CSS 빛(forge-N)만
    forgeFrame ? h('img', { class: 'cpx-forge', src: forgeFrame, alt: '', draggable: 'false' }) : null,
    marksView(card),
    ...costs.map(costEl),
    h('div', { class: `cpx-name${nameSize}`, style: at(slots?.name) }, def.name, card.level ? h('span', { class: `card-level${card.level > 3 ? ' card-level-skill' : ''}${card.forge ? ' card-level-forge' : ''}` }, ` +${card.level}`) : null),
    // 색각 보정: 등급 보석 위에 모양(설정에서 켤 때만 보인다)
    def.rarity !== 'special' ? h('span', { class: 'cpx-rshape', 'aria-hidden': 'true' }, RARITY_SHAPE[def.rarity] ?? '') : null,
    rarityUrl ? h('img', { class: 'cpx-rarity', src: rarityUrl, alt: RARITY_LABEL[def.rarity] ?? '' }) : def.rarity !== 'special' ? h('span', { class: `cpx-rarity gem gem-${def.rarity}`, 'aria-label': RARITY_LABEL[def.rarity] }) : null,
    // 키워드(소멸·융합 등)는 글 칸 위 테두리에 걸친 배지로, 본문에는 넣지 않는다
    // 왼쪽에 두 개까지, 넘치면 오른쪽(가운데는 등급 보석 자리)
    ...[parts.keywords.slice(0, 2), parts.keywords.slice(2)].map((list, i) =>
      list.length ? h('div', { class: `cpx-kws cpx-kws-${i ? 'r' : 'l'}`, style: slots?.text ? `top:${slots.text[1] - 5}px` : '' }, ...list.map((k) => h('span', { class: `kw kw-${k.key}` }, k.label))) : null,
    ),
    fitText(h('div', { class: `cpx-text${textSize}${parts.keywords.length ? ' cpx-has-kw' : ''}`, style: at(slots?.text, 2), ...glossaryTip(data, inst) }, ...textBlocks(parts, true))),
    h('div', { class: 'cpx-plaque', style: at(slots?.plaque) }, `${owner?.name ?? (def.owner === 'status' ? '상태' : '공용')} · ${TYPE_LABEL[def.type] ?? ''}`),
    ...(def.rarity === 'legendary' ? [0, 1, 2, 3].map((i) => h('i', { class: 'cpx-spark', style: `left:${18 + i * 26 + (i % 2) * 6}px;top:${170 - (i % 2) * 20}px;animation-delay:${i * 0.9}s`, 'aria-hidden': 'true' })) : []),
  );
}

/** 글 칸에 넘치면 글씨를 0.5px씩 줄인다(화면에 붙은 뒤 한 번. 길이로 고른 크기에서 시작) */
function fitText(el: HTMLElement): HTMLElement {
  requestAnimationFrame(() => {
    if (!el.isConnected) return;
    let size = parseFloat(getComputedStyle(el).fontSize);
    while (el.scrollHeight > el.clientHeight + 1 && size > 8) {
      size -= 0.5;
      el.style.fontSize = `${size}px`;
    }
  });
  return el;
}

/**
 * 카드 글: 본문과 강화로 열린 특수 스킬(★, 금빛 줄로 따로). pixel이 아니면(CSS 틀) 키워드 배지도 글 위에 붙인다
 */
function textBlocks(parts: CardTextParts, pixel = false): HTMLElement[] {
  const out: (HTMLElement | null)[] = [
    !pixel && parts.keywords.length ? h('div', { class: 'card-kws' }, ...parts.keywords.map((k) => h('span', { class: `kw kw-${k.key}` }, k.label))) : null,
    parts.body ? h('div', { class: 'card-body' }, parts.body) : null,
    ...parts.skills.map((sk) => h('div', { class: 'card-skill' }, h('b', {}, `★${sk.name}`), h('span', {}, ` ${sk.text}`))),
  ];
  return out.filter((x): x is HTMLElement => !!x);
}

/** 카드 글 위에 마우스를 올리면 용어 풀이(키워드·상태·속성) */
/**
 * 카드 글에 마우스를 올리면: 카드 전체 설명(키워드 · 본문 · 강화로 열린 ★특수 스킬) → 용어 풀이.
 * +4·+5 특수 스킬이 붙으면 글 칸에 다 담기지 않아 글씨가 작아지므로 여기서 온전히 읽는다(2026-10-11 사용자 요청)
 */
function glossaryTip(data: GameData, inst: CardInstance | string): Record<string, string | undefined> {
  const card = resolveCard(data, inst);
  const parts = cardTextParts(data, inst);
  const terms = cardGlossary(data, inst);
  const lines = [
    parts.keywords.length ? `[${parts.keywords.map((k) => k.label).join(' · ')}]` : '',
    ...parts.body.split('\n'),
    ...parts.skills.map((sk) => `★${sk.name}(+${sk.level}) ${sk.text}`),
    ...parts.forge.map((f) => `${f.name.startsWith('◆') ? '' : '★'}${f.name}(+${f.level}) ${f.text}`),
    ...(terms.length ? ['---', '## 용어', ...terms] : []),
  ].filter(Boolean);
  return tipAttrs(`${card.def.name}${card.level ? ` +${card.level}` : ''}`, lines.join('\n'), 'card');
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
      ? ['new', `새 카드 · ${cardPoints(data, data.cards.get(cardId)!)}점`, '아직 없는 카드. 보유 카드에 들어가고, 다음 편성(여관·출발 전)에서 덱에 넣을 수 있다. N점 = 편성 점수.']
      : p.kind === 'upgrade'
        ? ['up', `보유 중 · 강화 +1`, `이미 가진 카드라 보유 카드가 +${p.from} → +${p.level}로 강화된다(보이는 모습이 강화 뒤).`]
        : ['max', `최대 강화 → 골드 +${p.gold}`, '이미 최대로 강화한 카드라 대신 골드를 받는다.'];
  el.prepend(h('span', { class: `offer-badge offer-${cls}`, ...tipAttrs(label, tip) }, label));
  return el;
}

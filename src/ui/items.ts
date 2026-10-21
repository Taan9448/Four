// 유물·물약 표식(2026-10-08): 아이콘 그림이 오기 전에는 한 글자(glyph) 인장으로 그린다. 마우스를 올리면 이름과 효과.
import type { GameData } from '../engine/data';
import { h } from './dom';
import { tipAttrs } from './tooltip';
import { sheetIconEl } from './icons';
import { openOverlay } from './overlay';

/** 아이콘 번호 → 시트: [시트 id, 첫 번호]. 번호가 첫 번호 이상인 마지막 시트의 (icon - 첫 번호 + 1)칸 */
const RELIC_SHEETS: [string, number][] = [['icons_relics', 1], ['icons_relics_b', 17], ['icons_relics_c', 25], ['icons_relics_d', 41], ['icons_relics_e', 57], ['icons_relics_f', 65], ['icons_relics_g', 71], ['icons_relics_h', 73], ['icons_relics_i', 74], ['icons_relics_j', 90], ['icons_relics_k', 106], ['icons_relics_l', 122]];
const POTION_SHEETS: [string, number][] = [['icons_potions', 1], ['icons_potions_b', 14], ['icons_potions_c', 24], ['icons_potions_d', 25], ['icons_potions_e', 41]];
const sheetIcon = (sheets: [string, number][], icon: number | undefined, glyph: string) => sheetIconEl(sheets, icon, glyph, 'item-icon');
const relicIcon = (icon: number | undefined, glyph: string) => sheetIcon(RELIC_SHEETS, icon, glyph);

const RELIC_RARITY: Record<string, string> = { common: '일반', uncommon: '고급', rare: '희귀', epic: '영웅', legendary: '전설', path: '길' };
const POTION_RARITY: Record<string, string> = { common: '일반', uncommon: '고급', rare: '희귀', epic: '영웅', legendary: '전설' };

export function relicChip(data: GameData, id: string, extra = ''): HTMLElement {
  const def = data.relics.get(id);
  if (!def) return h('span', {});
  return h(
    'span',
    {
      class: `relic-chip rarity-${def.rarity}${extra ? ` ${extra}` : ''}`,
      'data-relic': id,
      ...tipAttrs(`${def.name} · ${RELIC_RARITY[def.rarity]} 유물`, [def.description, def.flavor ? `\n${def.flavor}` : ''].join('')),
    },
    relicIcon(def.icon, def.glyph),
  );
}

/** 물약 칸 하나. id가 null이면 빈 칸 */
export function potionChip(data: GameData, id: string | null, opts: { onClick?: () => void; extra?: string } = {}): HTMLElement {
  const def = id ? data.potions.get(id) : undefined;
  if (!def) return h('span', { class: 'potion-chip empty', ...tipAttrs('빈 물약 칸', '전투 보상이나 상점에서 물약을 얻으면 여기에 들어간다.') });
  return h(
    opts.onClick ? 'button' : 'span',
    {
      class: `potion-chip rarity-${def.rarity}${opts.extra ? ` ${opts.extra}` : ''}`,
      onclick: opts.onClick,
      ...tipAttrs(`${def.name} · ${POTION_RARITY[def.rarity]} 물약${def.abyss ? ' · 심연 전용' : ''}`, `${def.description}${opts.onClick ? '\n\n누르면 쓴다(비용 없음).' : ''}`),
    },
    sheetIcon(POTION_SHEETS, def.icon, def.glyph),
  );
}

/** 유물이 일어나는 때(얻은 것 상자에 함께 적는다) */
const RELIC_TRIGGER: Record<string, string> = {
  battleStart: '전투 시작', turnStart: '차례 시작', turnEnd: '차례 끝', enemyDowned: '적이 쓰러질 때', allyDowned: '동료가 쓰러질 때',
  cardPlayed: '카드를 낼 때', riftChanged: '균열이 바뀔 때', pickup: '얻을 때', victory: '승리', cleanVictory: '다치지 않고 이길 때',
  rest: '휴식', shopEnter: '상점', passive: '늘',
};

/** 얻은 유물·물약 하나를 크게(이벤트 결과, 2026-10-21 #1374): 아이콘 · 이름 · 등급 · 때 · 효과 · 한 줄 이야기 */
export function gainItemView(data: GameData, kind: 'relic' | 'potion', id: string): HTMLElement {
  const relic = kind === 'relic' ? data.relics.get(id) : undefined;
  const potion = kind === 'potion' ? data.potions.get(id) : undefined;
  const def = relic ?? potion;
  if (!def) return h('span', {});
  const rarity = relic ? `${RELIC_RARITY[relic.rarity]} 유물` : `${POTION_RARITY[potion!.rarity]} 물약${potion!.abyss ? ' · 심연 전용' : ''}`;
  return h(
    'div',
    { class: `gain-item gain-${kind} rarity-${def.rarity}` },
    relic ? h('span', { class: `gain-icon relic-chip rarity-${relic.rarity}` }, relicIcon(relic.icon, relic.glyph)) : h('span', { class: `gain-icon potion-chip rarity-${potion!.rarity}` }, sheetIcon(POTION_SHEETS, potion!.icon, potion!.glyph)),
    h(
      'div',
      { class: 'gain-info' },
      h('div', { class: 'gain-title' }, h('b', {}, def.name), h('span', { class: 'gain-rarity' }, rarity), relic && RELIC_TRIGGER[relic.trigger] ? h('small', {}, RELIC_TRIGGER[relic.trigger]) : null),
      h('p', {}, def.description),
      relic?.flavor ? h('p', { class: 'gain-flavor' }, relic.flavor) : null,
    ),
  );
}

/** 골드 표시 */
export function goldChip(gold: number): HTMLElement {
  return h('span', { class: 'gold-chip', ...tipAttrs(`골드 ${gold}`, '전투에서 얻고 상점에서 쓴다.') }, h('i', {}), String(gold));
}

/** 보유 장비 창: 골드 · 물약 · 유물을 이름·효과와 함께 크게 */
export function openInventory(data: GameData, gold: number, potions: (string | null)[], relics: string[]): void {
  const row = (chip: HTMLElement, name: string, kind: string, text: string, flavor?: string) =>
    h('div', { class: 'gear-row' }, chip, h('div', {}, h('b', {}, name, h('small', {}, kind)), h('p', {}, text), flavor ? h('p', { class: 'gear-flavor' }, flavor) : null));
  openOverlay(
    '보유 장비',
    h(
      'div',
      { class: 'gear' },
      h('div', { class: 'gear-gold' }, goldChip(gold), h('span', {}, '전투에서 얻고 상점에서 쓴다.')),
      h('h3', {}, `물약 (${potions.filter(Boolean).length}/${potions.length})`),
      potions.some(Boolean)
        ? h(
            'div',
            { class: 'gear-list' },
            potions.map((id) => {
              const def = id ? data.potions.get(id) : undefined;
              return def ? row(potionChip(data, id, { extra: 'big' }), def.name, `${POTION_RARITY[def.rarity]} 물약${def.abyss ? ' · 심연 전용' : ''}`, def.description) : null;
            }),
          )
        : h('p', { class: 'hint' }, '물약 없음 — 전투 보상이나 상점에서 얻는다. 전투 중에 비용 없이 쓴다.'),
      h('h3', {}, `유물 (${relics.length})`),
      relics.length
        ? h(
            'div',
            { class: 'gear-list' },
            relics.map((id) => {
              const def = data.relics.get(id);
              return def ? row(relicChip(data, id, 'big'), def.name, `${RELIC_RARITY[def.rarity]} 유물`, def.description, def.flavor) : null;
            }),
          )
        : h('p', { class: 'hint' }, '유물 없음 — 엘리트·보스를 이기거나 상점에서 산다.'),
    ),
    { wide: true },
  );
}

/** 지도 오른쪽 칸: 골드 · 물약 칸 · 유물. 누르면 보유 장비 창 */
export function inventoryBox(data: GameData, gold: number, potions: (string | null)[], relics: string[]): HTMLElement {
  return h(
    'div',
    {
      class: 'box inventory clickable',
      role: 'button',
      tabindex: 0,
      title: '눌러서 보유 장비 보기',
      onclick: () => openInventory(data, gold, potions, relics),
      onkeydown: (e: Event) => (e as KeyboardEvent).key === 'Enter' && openInventory(data, gold, potions, relics),
    },
    h('h3', { class: 'inv-title' }, '보유 장비', h('small', {}, '눌러서 보기')),
    h('div', { class: 'inv-row' }, goldChip(gold), h('span', { class: 'potion-bar' }, potions.map((p) => potionChip(data, p)))),
    relics.length ? h('div', { class: 'relic-bar' }, relics.map((id) => relicChip(data, id))) : h('p', { class: 'hint' }, '유물 없음 — 엘리트·보스를 이기거나 상점에서 산다.'),
  );
}

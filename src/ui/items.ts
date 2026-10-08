// 유물·물약 표식(2026-10-08): 아이콘 그림이 오기 전에는 한 글자(glyph) 인장으로 그린다. 마우스를 올리면 이름과 효과.
import type { GameData } from '../engine/data';
import { h } from './dom';
import { tipAttrs } from './tooltip';
import { iconEl } from './icons';

/** 유물 아이콘: 1~16은 icons_relics, 17~은 icons_relics_b의 (icon-16)칸 */
const relicIcon = (icon: number | undefined, glyph: string) =>
  icon && icon > 16 ? iconEl('icons_relics_b', icon - 16, glyph, 'item-icon') : iconEl('icons_relics', icon, glyph, 'item-icon');

const RELIC_RARITY: Record<string, string> = { common: '일반', uncommon: '고급', rare: '희귀', boss: '보스' };
const POTION_RARITY: Record<string, string> = { common: '일반', uncommon: '고급', rare: '희귀' };

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
      ...tipAttrs(`${def.name} · ${POTION_RARITY[def.rarity]} 물약`, `${def.description}${opts.onClick ? '\n\n누르면 쓴다(비용 없음).' : ''}`),
    },
    iconEl('icons_potions', def.icon, def.glyph, 'item-icon'),
  );
}

/** 골드 표시 */
export function goldChip(gold: number): HTMLElement {
  return h('span', { class: 'gold-chip', ...tipAttrs(`골드 ${gold}`, '전투에서 얻고 상점에서 쓴다.') }, h('i', {}), String(gold));
}

/** 지도 오른쪽 칸: 골드 · 물약 칸 · 유물 */
export function inventoryBox(data: GameData, gold: number, potions: (string | null)[], relics: string[]): HTMLElement {
  return h(
    'div',
    { class: 'box inventory' },
    h('div', { class: 'inv-row' }, goldChip(gold), h('span', { class: 'potion-bar' }, potions.map((p) => potionChip(data, p)))),
    relics.length ? h('div', { class: 'relic-bar' }, relics.map((id) => relicChip(data, id))) : h('p', { class: 'hint' }, '유물 없음 — 엘리트·보스를 이기거나 상점에서 산다.'),
  );
}

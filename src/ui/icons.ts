// 상태·의도 아이콘. 실제 아이콘 그림(icons_status·icons_intent)이 들어오면 그 프레임을, 그 전에는 한자 한 글자 배지를 보여 준다.
import type { GameData } from '../engine/data';
import { frameUrl } from '../render/assets';
import { h } from './dom';
import { tipAttrs } from './tooltip';

/** icons_intent 시트의 칸 번호(specs/assets/icons_intent.yaml과 같다) */
const INTENT_FRAME: Record<string, number> = { attack: 1, defend: 2, buff: 3, debuff: 4, special: 5, block: 6 };
const INTENT_GLYPH: Record<string, string> = { attack: '攻', defend: '守', buff: '強', debuff: '咒', special: '奇', block: '盾' };
export const INTENT_LABEL: Record<string, string> = { attack: '공격', defend: '방어', buff: '강화', debuff: '약화', special: '특수' };

export function iconEl(sheet: string, frame: number | undefined, glyph: string, cls: string): HTMLElement {
  const url = frame ? frameUrl(sheet, frame, { realOnly: true }) : null;
  return url
    ? h('span', { class: `icon ${cls} has-art` }, h('img', { src: url, alt: '', draggable: 'false' }))
    : h('span', { class: `icon ${cls}` }, glyph);
}

/**
 * 유닛 아래 상태 표시: 진한 바탕의 이름표(아이콘 + 이름 + 스택). 해로운 상태는 붉은 바탕, 이로운 상태는 초록, 특성은 보라.
 * 배경 그림 위에서도 읽히도록 아이콘만 두지 않는다
 */
export function statusChip(data: GameData, id: string, stacks: number): HTMLElement {
  const def = data.statuses.get(id);
  const kind = def?.kind ?? 'buff';
  const el = h('span', { class: `status-chip chip-${kind}` }, iconEl('icons_status', def?.icon, def?.glyph ?? '?', `status-icon status-${kind}`), h('span', { class: 'st-name' }, def?.name ?? id), stacks > 1 || (stacks === 1 && kind !== 'trait') ? h('b', {}, stacks) : '');
  const kindLabel = kind === 'debuff' ? '해로운 상태' : kind === 'trait' ? '특성' : '이로운 상태';
  Object.entries(tipAttrs(`${def?.name ?? id}${stacks > 1 ? ` ${stacks}` : ''}`, `${def?.description ?? ''}\n${kindLabel}${def && def.decay > 0 ? ' · 턴마다 줄어든다' : ''}`, kind)).forEach(
    ([k, v]) => v && el.setAttribute(k, v),
  );
  return el;
}

/** 속성 표시: 화염 炎(붉은 주황) · 냉기 冷(하늘색) */
const ELEMENT_GLYPH: Record<string, string> = { fire: '炎', ice: '冷' };
const ELEMENT_NAME: Record<string, string> = { fire: '화염', ice: '냉기' };
export function elementMark(element: string): HTMLElement {
  return h('span', { class: `el-mark el-${element}`, title: ELEMENT_NAME[element] ?? element }, ELEMENT_GLYPH[element] ?? '?');
}

/** 적 정의의 약점·내성 이름표: "약점 냉기" / "내성 화염" */
export function affinityChip(data: GameData, kind: 'weak' | 'resist', element: string): HTMLElement {
  const el = data.balance.elements;
  const name = ELEMENT_NAME[element] ?? element;
  const body =
    kind === 'weak'
      ? `${name} 피해를 ${Math.round((el.weakMultiplier - 1) * 100)}% 더 받는다.`
      : `${name} 피해를 ${Math.round((1 - el.resistMultiplier) * 100)}% 덜 받고, ${name} 상태가 붙지 않는다.`;
  // 휴대폰은 이름을 숨기므로 한 글자(약·내)를 따로 둔다
  const chip = h(
    'span',
    { class: `status-chip chip-${kind}` },
    h('span', { class: 'st-short' }, kind === 'weak' ? '약' : '내'),
    elementMark(element),
    h('span', { class: 'st-name' }, kind === 'weak' ? `약점 ${name}` : `내성 ${name}`),
  );
  Object.entries(tipAttrs(kind === 'weak' ? `약점 — ${name}` : `내성 — ${name}`, body, kind === 'weak' ? 'debuff' : 'buff')).forEach(([k, v]) => v && chip.setAttribute(k, v));
  return chip;
}

export function intentIcon(kind: string): HTMLElement {
  return iconEl('icons_intent', INTENT_FRAME[kind], INTENT_GLYPH[kind] ?? '?', `intent-icon intent-${kind}`);
}

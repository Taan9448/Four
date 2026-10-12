// 상태·의도 아이콘. 실제 아이콘 그림(icons_status·icons_intent)이 들어오면 그 프레임을, 그 전에는 한자 한 글자 배지를 보여 준다.
import type { GameData } from '../engine/data';
import { frameUrl } from '../render/assets';
import { h } from './dom';
import { tipAttrs } from './tooltip';

/** icons_intent 시트의 칸 번호(specs/assets/icons_intent.yaml과 같다) */
const INTENT_FRAME: Record<string, number> = { attack: 1, defend: 2, buff: 3, debuff: 4, special: 5, block: 6 };
const INTENT_GLYPH: Record<string, string> = { attack: '攻', defend: '守', buff: '強', debuff: '咒', special: '奇', block: '盾' };
export const INTENT_LABEL: Record<string, string> = { attack: '공격', defend: '방어', buff: '강화', debuff: '약화', special: '특수' };

/**
 * 번호가 여러 시트에 이어지는 아이콘(상태·유물·물약): [시트 id, 첫 번호] 목록에서 번호가 첫 번호 이상인 마지막 시트의
 * (icon - 첫 번호 + 1)칸. 그림이 없으면 한 글자 배지
 */
export function sheetIconEl(sheets: [string, number][], icon: number | undefined, glyph: string, cls: string): HTMLElement {
  const [id, first] = [...sheets].reverse().find(([, f]) => (icon ?? 0) >= f) ?? sheets[0];
  return iconEl(id, icon ? icon - first + 1 : undefined, glyph, cls);
}

/** 상태 아이콘 시트: 1~12 icons_status · 13~28 icons_status_b · 29~43 icons_status_c · 44~47 icons_status_d · 48~53 icons_status_e(2026-10-11) · 54~ icons_status_f(2026-10-12 번개) */
const STATUS_SHEETS: [string, number][] = [['icons_status', 1], ['icons_status_b', 13], ['icons_status_c', 29], ['icons_status_d', 44], ['icons_status_e', 48], ['icons_status_f', 54]];

/**
 * 그림 아이콘이 왔으면 그림, 아니면 한자 그대로 — 둘레(.icon 테두리·바탕) 없이 cls 하나만(지도 노드·서약처럼 이미 모양이 있는 자리, 2026-10-12)
 */
export function artOrGlyph(sheet: string, frame: number, glyph: string, cls: string): HTMLElement {
  const url = frameUrl(sheet, frame, { realOnly: true });
  return url ? h('span', { class: `${cls} has-art` }, h('img', { src: url, alt: glyph, draggable: 'false' })) : h('span', { class: cls }, glyph);
}

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
  const el = h('span', { class: `status-chip chip-${kind}` }, sheetIconEl(STATUS_SHEETS, def?.icon, def?.glyph ?? '?', `status-icon status-${kind}`), h('span', { class: 'st-name' }, def?.name ?? id), stacks > 1 || (stacks === 1 && kind !== 'trait') ? h('b', {}, stacks) : '');
  const kindLabel = kind === 'debuff' ? '해로운 상태' : kind === 'trait' ? '특성' : '이로운 상태';
  Object.entries(tipAttrs(`${def?.name ?? id}${stacks > 1 ? ` ${stacks}` : ''}`, `${def?.description ?? ''}\n${kindLabel}${def && def.decay > 0 ? ' · 턴마다 줄어든다' : ''}`, kind)).forEach(
    ([k, v]) => v && el.setAttribute(k, v),
  );
  return el;
}

/** 속성 표시: 화염 炎(붉은 주황) · 냉기 冷(하늘색) · 번개 雷(노란빛) */
const ELEMENT_GLYPH: Record<string, string> = { fire: '炎', ice: '冷', lightning: '雷' };
const ELEMENT_NAME: Record<string, string> = { fire: '화염', ice: '냉기', lightning: '번개' };
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

/** 적 이름 아래 작은 게이지 이름표(매듭까지 남은 결·격노까지 남은 턴) */
export function gaugeChip(kind: 'knot' | 'enrage', short: string, label: string, tipTitle: string, tipBody: string): HTMLElement {
  const chip = h('span', { class: `status-chip chip-${kind}` }, h('span', { class: 'st-short' }, short), h('span', { class: 'st-name' }, label));
  Object.entries(tipAttrs(tipTitle, tipBody, kind === 'knot' ? 'debuff' : 'buff')).forEach(([k, v]) => v && chip.setAttribute(k, v));
  return chip;
}

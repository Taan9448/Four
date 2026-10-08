// 상태·의도 아이콘. 실제 아이콘 그림(icons_status·icons_intent)이 들어오면 그 프레임을, 그 전에는 한자 한 글자 배지를 보여 준다.
import type { GameData } from '../engine/data';
import { frameUrl } from '../render/assets';
import { h } from './dom';
import { tipAttrs } from './tooltip';

/** icons_intent 시트의 칸 번호(specs/assets/icons_intent.yaml과 같다) */
const INTENT_FRAME: Record<string, number> = { attack: 1, defend: 2, buff: 3, debuff: 4, special: 5, block: 6 };
const INTENT_GLYPH: Record<string, string> = { attack: '攻', defend: '守', buff: '強', debuff: '咒', special: '奇', block: '盾' };
export const INTENT_LABEL: Record<string, string> = { attack: '공격', defend: '방어', buff: '강화', debuff: '약화', special: '특수' };

function iconEl(sheet: string, frame: number | undefined, glyph: string, cls: string): HTMLElement {
  const url = frame ? frameUrl(sheet, frame, { realOnly: true }) : null;
  return url
    ? h('span', { class: `icon ${cls} has-art` }, h('img', { src: url, alt: '', draggable: 'false' }))
    : h('span', { class: `icon ${cls}` }, glyph);
}

/** 체력 막대 아래의 상태 아이콘(스택은 귀퉁이 숫자, 마우스를 올리면 설명) */
export function statusIcon(data: GameData, id: string, stacks: number): HTMLElement {
  const def = data.statuses.get(id);
  const kind = def?.kind ?? 'buff';
  const el = iconEl('icons_status', def?.icon, def?.glyph ?? '?', `status-icon status-${kind}`);
  const kindLabel = kind === 'debuff' ? '해로운 상태' : kind === 'trait' ? '특성' : '이로운 상태';
  Object.entries(tipAttrs(`${def?.name ?? id}${stacks > 1 ? ` ${stacks}` : ''}`, `${def?.description ?? ''}\n${kindLabel}${def && def.decay > 0 ? ' · 턴마다 줄어든다' : ''}`, kind)).forEach(
    ([k, v]) => v && el.setAttribute(k, v),
  );
  if (stacks > 1) el.appendChild(h('small', { class: 'stack' }, stacks));
  return el;
}

export function intentIcon(kind: string): HTMLElement {
  return iconEl('icons_intent', INTENT_FRAME[kind], INTENT_GLYPH[kind] ?? '?', `intent-icon intent-${kind}`);
}

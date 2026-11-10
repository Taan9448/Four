// 「결」 화면 공용: DOM 만들기, Codex UI 그림 자동 교체, 원소 이름(2026-11-10 main.ts에서 나눔)
import { frameUrl } from '../../src/render/assets';
import type { Element, FoeDef } from './duel';

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  e.append(...kids);
  return e;
}

/** 클릭하면 fn을 부르는 버튼 */
export function button(label: (Node | string)[] | string, cls: string, fn: () => void, attrs: Record<string, string> = {}): HTMLButtonElement {
  const b = el('button', { class: cls, type: 'button', ...attrs }, ...(typeof label === 'string' ? [label] : label));
  b.addEventListener('click', fn);
  return b;
}

export const ELEMENT_NAME: Record<Element, string> = { fire: '화염', ice: '냉기', lightning: '번개' };

export function elementsOf(f: FoeDef): Element[] {
  return [...new Set(Object.values(f.moves).map((m) => m.element).filter((e): e is Element => !!e))];
}

/** Codex 실제 그림 주소(임시 그림이면 null) */
export const realArt = (id: string, n = 1): string | null => frameUrl(id, n, { realOnly: true });

/**
 * 버튼·UI 그림(2026-11-09): Codex 그림(ui_gyeol_pads·icons_gyeol_pads·ui_gyeol_frames·title_gyeol)이 실제로 들어온 것만 쓴다.
 * 오기 전에는 지금의 CSS 바탕 그대로. 칸 번호: 버튼 판·아이콘은 PAD_ART 순서, 틀은 1 적 이름 · 2 하운 이름 · 3 결과 띠 · 4 상대 카드 · 5 먹 원.
 */
export const PAD_ART = ['attack', 'dodge', 'parry', 'tech', 'focus', 'back'] as const;
export type PadArt = (typeof PAD_ART)[number];
export function applyUiArt(): void {
  const root = document.documentElement;
  const use = (cls: string, vars: [string, string | null][]) => {
    if (vars.some(([, u]) => !u)) return;
    for (const [k, u] of vars) root.style.setProperty(k, `url("${u}")`);
    root.classList.add(cls);
  };
  use('art-pads', PAD_ART.map((p, i): [string, string | null] => [`--pad-${p}`, realArt('ui_gyeol_pads', i + 1)]));
  use('art-frames', [['--plate-foe', realArt('ui_gyeol_frames', 1)], ['--plate-me', realArt('ui_gyeol_frames', 2)], ['--plate-result', realArt('ui_gyeol_frames', 3)], ['--plate-card', realArt('ui_gyeol_frames', 4)], ['--enso', realArt('ui_gyeol_frames', 5)]]);
  use('art-title', [['--title-bg', realArt('title_gyeol', 1)]]);
  use('art-lobby', [['--lobby-bg', realArt('bg_gyeol_lobby', 1)]]);
}
/** 버튼 아이콘(icons_gyeol_pads가 오면) */
export function padIcon(kind: PadArt): HTMLImageElement | '' {
  const u = realArt('icons_gyeol_pads', PAD_ART.indexOf(kind) + 1);
  return u ? el('img', { class: 'pad-icon', src: u, alt: '' }) : '';
}

/** 박자 도전·대결 등급 아이콘 칸(icons_gyeol: 1 S · 2 A · 3 B · 4 C) */
export function rankBadge(rank: string | undefined, size: 'sm' | 'lg' = 'sm'): HTMLElement {
  const n = ({ S: 1, A: 2, B: 3, C: 4 } as Record<string, number>)[rank ?? ''];
  const u = n ? realArt('icons_gyeol', n) : null;
  if (u) return el('img', { class: `rank-icon ${size}`, src: u, alt: `등급 ${rank}` });
  return el('span', { class: `rank rank-${rank ?? 'none'} ${size}` }, rank ?? '—');
}

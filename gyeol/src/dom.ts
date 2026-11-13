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
  // 2026-11-13 먹·한지 통일: 옻칠·금속 판(ui_gyeol_pads·ui_gyeol_frames 1~4)은 더 쓰지 않는다. 먹 원(5번)만 「決」 뒤에.
  // 먹·한지 그림(ui_gyeol_ink: 1 먹 붓 판 · 2 주홍 붓 판 · 3 옅은 먹 판 · 4 이름 붓 띠 · 5 한지 결 · 6 붓 가름줄)이 오면 CSS가 그것을 쓴다
  use('art-enso', [['--enso', realArt('ui_gyeol_frames', 5)]]);
  use('art-ink', [1, 2, 3, 4, 5, 6].map((n): [string, string | null] => [`--ink-art-${n}`, realArt('ui_gyeol_ink', n)]));
  use('art-title', [['--title-bg', realArt('title_gyeol', 1)]]);
  use('art-lobby', [['--lobby-bg', realArt('bg_gyeol_lobby', 1)]]);
}
/** 먹 아이콘(icons_gyeol_ink, 2026-11-13) 칸 번호 */
export const INK_ICON = { attack: 1, heavy: 2, dodge: 3, parry: 4, tech: 5, focus: 6, story: 7, arena: 8, practice: 9, wardrobe: 10, records: 11, settings: 12, lock: 13, seal: 14, star: 15, back: 16 } as const;
export const inkIcon = (k: keyof typeof INK_ICON): string | null => realArt('icons_gyeol_ink', INK_ICON[k]);

/** 버튼 아이콘: 먹 아이콘(icons_gyeol_ink)이 오면 그것, 아니면 예전 icons_gyeol_pads, 둘 다 없으면 글자만 */
export function padIcon(kind: PadArt | 'heavy'): HTMLImageElement | '' {
  const u = inkIcon(kind === 'back' ? 'back' : kind) ?? (kind === 'heavy' ? null : realArt('icons_gyeol_pads', PAD_ART.indexOf(kind) + 1));
  return u ? el('img', { class: 'pad-icon', src: u, alt: '' }) : '';
}

/** 박자 도전·대결 등급 아이콘 칸(icons_gyeol: 1 S · 2 A · 3 B · 4 C) */
export function rankBadge(rank: string | undefined, size: 'sm' | 'lg' = 'sm'): HTMLElement {
  const n = ({ S: 1, A: 2, B: 3, C: 4 } as Record<string, number>)[rank ?? ''];
  const u = n ? realArt('icons_gyeol', n) : null;
  if (u) return el('img', { class: `rank-icon ${size}`, src: u, alt: `등급 ${rank}` });
  return el('span', { class: `rank rank-${rank ?? 'none'} ${size}` }, rank ?? '—');
}

/** 화면 오른쪽 아래에 잠깐 뜨는 알림(업적 등) */
export function toast(title: string, text: string): void {
  let box = document.querySelector<HTMLElement>('.toasts');
  if (!box) {
    box = el('div', { class: 'toasts', 'aria-live': 'polite' });
    document.body.append(box);
  }
  const t = el('div', { class: 'toast' }, el('b', {}, title), el('small', {}, text));
  box.append(t);
  setTimeout(() => t.classList.add('out'), 3600);
  setTimeout(() => t.remove(), 4200);
}

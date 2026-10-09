// 단계별 안내(투어): 화면의 실제 요소를 하나씩 비추며 짧게 설명한다(GAME_DESIGN 13절 '안내').
// 어두운 막에 구멍(스포트라이트)을 뚫고, 단계가 바뀌면 구멍이 다음 요소로 미끄러져 가며 말풍선이 따라 붙는다.
// 다음: 클릭·→·Enter·Space / 이전: ← / 건너뛰기: Esc. 본 안내는 브라우저에 기억해 다시 띄우지 않는다.
import { h } from './dom';
import { readStore, writeStore } from './storage';

export interface TourStep {
  /** 비출 요소(선택자 또는 요소). 없거나 화면에 없으면 가운데 말풍선만 */
  target?: string | HTMLElement | null;
  title: string;
  text: string;
  /** 비출 자리 여백(px) */
  pad?: number;
}

const SEEN_KEY = 'cheonoe.tours';

function seenList(): string[] {
  try {
    return JSON.parse(readStore(SEEN_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

export function tourSeen(id: string): boolean {
  return seenList().includes(id);
}

function markSeen(id: string): void {
  const list = seenList();
  if (!list.includes(id)) writeStore(SEEN_KEY, JSON.stringify([...list, id]));
}

/** 설정의 "안내 다시 보기": 본 안내 기록을 지운다 */
export function resetTours(): void {
  writeStore(SEEN_KEY, null);
}

let active: { close: () => void } | null = null;

/**
 * 안내를 띄운다. id를 주면 끝까지 보거나 건너뛸 때 본 것으로 기억한다(once면 이미 본 안내는 띄우지 않는다).
 * 요소가 아직 그려지는 중일 수 있어 한 박자 늦게 시작한다.
 */
export function runTour(steps: TourStep[], opts: { id?: string; once?: boolean; onDone?: () => void } = {}): void {
  if (!steps.length || (opts.once && opts.id && tourSeen(opts.id))) return;
  active?.close();
  let i = 0;
  const spot = h('div', { class: 'tour-spot' });
  const ring = h('div', { class: 'tour-ring' });
  const title = h('div', { class: 'tour-title' });
  const text = h('div', { class: 'tour-text' });
  const count = h('span', { class: 'tour-count' });
  const prev = h('button', { class: 'btn btn-small', onclick: (e: Event) => (e.stopPropagation(), go(i - 1)) }, '이전') as HTMLButtonElement;
  const next = h('button', { class: 'btn btn-small btn-primary', onclick: (e: Event) => (e.stopPropagation(), go(i + 1)) }, '다음') as HTMLButtonElement;
  const skip = h('button', { class: 'tour-skip', onclick: (e: Event) => (e.stopPropagation(), close()) }, '건너뛰기');
  const bubble = h('div', { class: 'tour-bubble', role: 'dialog', 'aria-live': 'polite' }, title, text, h('div', { class: 'tour-actions' }, count, skip, prev, next));
  const root = h('div', { class: 'tour', onclick: () => go(i + 1) }, spot, ring, bubble);

  const resolve = (t: TourStep['target']): HTMLElement | null => {
    if (!t) return null;
    const el = typeof t === 'string' ? document.querySelector<HTMLElement>(t) : t;
    if (!el || !el.isConnected) return null;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 ? el : null;
  };

  const place = () => {
    const step = steps[i];
    const el = resolve(step.target);
    const pad = step.pad ?? 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (el) {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      const r = el.getBoundingClientRect();
      const box = { left: r.left - pad, top: r.top - pad, width: r.width + pad * 2, height: r.height + pad * 2 };
      for (const node of [spot, ring]) Object.assign(node.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` });
      root.classList.remove('no-target');
      // 말풍선: 아래에 자리가 있으면 아래, 없으면 위. 가로는 대상 가운데에 맞추고 화면 안으로
      const bw = Math.min(360, vw - 24);
      const below = box.top + box.height + 14;
      const bh = bubble.offsetHeight || 150;
      // 아래·위 어디에도 다 들어가지 않으면(휴대폰 세로) 화면 안으로 눌러 넣는다
      const top = Math.min(below + bh < vh - 8 ? below : Math.max(8, box.top - bh - 14), Math.max(8, vh - bh - 8));
      const left = Math.min(Math.max(12, box.left + box.width / 2 - bw / 2), vw - bw - 12);
      Object.assign(bubble.style, { left: `${left}px`, top: `${top}px`, width: `${bw}px` });
    } else {
      root.classList.add('no-target');
      Object.assign(spot.style, { left: `${vw / 2}px`, top: `${vh / 2}px`, width: '0px', height: '0px' });
      Object.assign(ring.style, { left: `${vw / 2}px`, top: `${vh / 2}px`, width: '0px', height: '0px' });
      const bw = Math.min(400, vw - 24);
      Object.assign(bubble.style, { left: `${(vw - bw) / 2}px`, top: `${vh / 2 - 90}px`, width: `${bw}px` });
    }
  };

  const go = (n: number) => {
    if (n >= steps.length) return close();
    if (n < 0) return;
    i = n;
    const step = steps[i];
    title.textContent = step.title;
    text.textContent = step.text;
    count.textContent = `${i + 1} / ${steps.length}`;
    prev.disabled = i === 0;
    next.textContent = i === steps.length - 1 ? '알겠다' : '다음';
    // 말풍선은 단계마다 다시 떠오르고, 고리는 다시 맥박친다
    for (const node of [bubble, ring]) {
      node.classList.remove('pop');
      void node.offsetWidth;
      node.classList.add('pop');
    }
    place();
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') go(i + 1);
    else if (e.key === 'ArrowLeft') go(i - 1);
    else return;
    e.preventDefault();
    e.stopPropagation();
  };
  const onResize = () => place();

  // 화면에 뜨기 전에 다른 안내에 밀려 닫히면 본 것으로 치지 않는다
  let shown = false;
  function close() {
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', onResize);
    root.classList.add('out');
    setTimeout(() => root.remove(), 200);
    if (active === handle) active = null;
    if (!shown) return;
    if (opts.id) markSeen(opts.id);
    opts.onDone?.();
  }
  const handle = { close };
  active = handle;

  setTimeout(() => {
    if (active !== handle) return;
    shown = true;
    document.body.appendChild(root);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onResize);
    go(0);
  }, 350);
}

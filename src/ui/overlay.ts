// 화면 위에 뜨는 창(덱 보기·설정·확인). 바깥을 누르거나 Esc를 누르면 닫힌다.
import { h } from './dom';

export interface Overlay {
  el: HTMLElement;
  close: () => void;
}

export function openOverlay(title: string, body: HTMLElement, opts: { onClose?: () => void; wide?: boolean; className?: string } = {}): Overlay {
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  };
  const close = () => {
    document.removeEventListener('keydown', onKey, true);
    el.remove();
    opts.onClose?.();
  };
  const panel = h(
    'div',
    { class: `overlay-panel${opts.wide ? ' wide' : ''}${opts.className ? ` ${opts.className}` : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('header', { class: 'overlay-head' }, h('h2', {}, title), h('button', { class: 'btn overlay-close', 'aria-label': '닫기', onclick: () => close() }, '✕')),
    h('div', { class: 'overlay-body' }, body),
  );
  const el = h('div', { class: 'overlay', onclick: (e: Event) => e.target === el && close() }, panel);
  document.addEventListener('keydown', onKey, true);
  document.body.appendChild(el);
  return { el, close };
}

/**
 * 결과·확인 팝업(2026-10-11 사용자 확정 목업): 옻칠 판 + 금테 + 안쪽 붉은 실선 + 모서리 금장,
 * 위 가운데에 걸쳐 찍는 낙관(종류: 勝 승리 · 守 버팀 · 敗 패배 · 事 사건 · 昇 레벨업 · 終 스테이지 끝 · 問 확인),
 * 작은 띄어쓴 머리말, 붓글씨 제목(이기면 금빛 · 지면 잿빛), 한 줄 이야기, 숫자 집계 또는 색 칩, 버튼
 */
export interface PopOpts {
  seal: string;
  /** 낙관 색: 붉은 테(기본) · 붉은 바탕 · 회색 · 금 */
  sealKind?: 'line' | 'solid' | 'muted' | 'gold';
  eyebrow?: string;
  title: string;
  tone?: 'win' | 'lose' | 'plain';
  lead?: string | HTMLElement | null;
  stats?: [string, string | number][];
  /** 얻은 것(up) · 잃은 것(down) · 골드·카드(gold) · 마나(mana) */
  chips?: { text: string; kind: 'up' | 'down' | 'gold' | 'mana' }[];
  actions: HTMLElement[];
}

export function popPanel(o: PopOpts): HTMLElement {
  const spaced = (t: string) => [...t.replace(/\s+/g, '')].join(' ');
  return h(
    'div',
    { class: 'pop', role: 'dialog', 'aria-modal': 'true', 'aria-label': o.title },
    ...['tl', 'tr', 'bl', 'br'].map((c) => h('i', { class: `pop-corner ${c}`, 'aria-hidden': 'true' })),
    h('span', { class: `pop-seal${o.sealKind && o.sealKind !== 'line' ? ` ${o.sealKind}` : ''}`, 'aria-hidden': 'true' }, o.seal),
    o.eyebrow ? h('p', { class: 'pop-eyebrow' }, spaced(o.eyebrow)) : null,
    h('h2', { class: `pop-title${o.tone && o.tone !== 'plain' ? ` ${o.tone}` : ''}` }, o.title),
    o.lead ? (typeof o.lead === 'string' ? h('p', { class: 'pop-lead' }, o.lead) : o.lead) : null,
    o.stats?.length ? h('div', { class: 'pop-stats' }, o.stats.map(([label, v]) => h('span', {}, h('b', {}, String(v)), label))) : null,
    o.chips?.length ? h('div', { class: 'pop-chips' }, o.chips.map((c) => h('span', { class: `pop-chip ${c.kind}` }, c.text))) : null,
    h('div', { class: 'pop-actions' }, ...o.actions),
  );
}

/** 결과 한 줄을 칩 색으로: 잃은 것(−·잃·상흔 +) · 골드 · 마나 · 그 밖은 얻은 것 */
export function chipKind(text: string): 'up' | 'down' | 'gold' | 'mana' {
  if (/(^|\s)[-−]\d|잃|상흔 \+|부상|저주/.test(text)) return 'down';
  if (/골드|카드|유물|물약/.test(text)) return 'gold';
  if (/마나|내공/.test(text)) return 'mana';
  return 'up';
}

/** 예/아니오 확인 창(결과 팝업과 같은 판, 낙관 問). 바깥을 누르거나 Esc면 취소 */
export function confirmDialog(title: string, message: string, okLabel: string): Promise<boolean> {
  return new Promise((resolve) => {
    let answer = false;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    const close = () => {
      document.removeEventListener('keydown', onKey, true);
      el.remove();
      resolve(answer);
    };
    const ok = h('button', { class: 'btn btn-danger', onclick: () => ((answer = true), close()) }, okLabel);
    const el = h(
      'div',
      { class: 'overlay pop-overlay', onclick: (e: Event) => e.target === el && close() },
      popPanel({ seal: '問', sealKind: 'solid', eyebrow: '확인', title, tone: 'lose', lead: message, actions: [h('button', { class: 'btn', onclick: () => close() }, '취소'), ok] }),
    );
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(el);
    requestAnimationFrame(() => ok.focus());
  });
}

/**
 * 첫 폭주 안내(GAME_DESIGN 7절, 균열 개편 2026-10-11): 폭주 연출 뒤 전투를 멈추고 네 가지와 막는 법을 보인다. [알았다]로 닫는다
 * lines: [글자, 설명] — 작은 낙관 아이콘과 한 줄
 */
export function surgeGuide(lines: [string, string][], foot: string[]): Promise<void> {
  return new Promise((resolve) => {
    const close = () => {
      document.removeEventListener('keydown', onKey, true);
      el.remove();
      resolve();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') {
        e.stopPropagation();
        e.preventDefault();
        close();
      }
    };
    const ok = h('button', { class: 'btn btn-primary', onclick: () => close() }, '알았다');
    const list = h(
      'div',
      { class: 'surge-guide' },
      h('ol', {}, lines.map(([g, t]) => h('li', {}, h('span', { class: 'sg-glyph', 'aria-hidden': 'true' }, g), h('span', {}, t)))),
      foot.map((t) => h('p', { class: 'sg-foot' }, t)),
    );
    const el = h('div', { class: 'overlay pop-overlay surge-pop' }, popPanel({ seal: '裂', sealKind: 'solid', eyebrow: '첫 폭주', title: '폭주 — 하늘이 터졌다', tone: 'lose', lead: list, actions: [ok] }));
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(el);
    requestAnimationFrame(() => ok.focus());
  });
}

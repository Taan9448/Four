// 주석(툴팁): data-tip(본문)·data-tip-title(제목)이 붙은 요소에 마우스를 올리면(휴대폰은 누르면) 뜬다.
// 문서 하나에 창 하나를 두고 이벤트 위임으로 처리한다(요소마다 리스너를 달지 않는다).
import { h } from './dom';

let tip: HTMLElement | null = null;
let current: HTMLElement | null = null;
/** 손가락으로 연 주석: 화면이 바뀌며 생기는 마우스 경계 이벤트(pointerover)로 닫지 않는다 */
let byTouch = false;
/** 연 동안 대사 띠가 새로 뜨거나 카드가 떠오르면 자리를 다시 잡는다 */
let watcher: MutationObserver | null = null;
let settleTimer = 0;

function ensure(): HTMLElement {
  if (!tip) {
    tip = h('div', { class: 'tooltip', role: 'tooltip' });
    document.body.appendChild(tip);
  }
  return tip;
}

function show(el: HTMLElement): void {
  const t = ensure();
  current = el;
  t.replaceChildren();
  const title = el.dataset.tipTitle;
  if (title) t.appendChild(h('b', { class: `tooltip-title${el.dataset.tipKind ? ` tip-${el.dataset.tipKind}` : ''}` }, title));
  // 줄 표시: '---' 나눔 선 · '## ' 작은 머리말 · '★' 특수 스킬(금빛)
  for (const line of (el.dataset.tip ?? '').split('\n')) {
    if (!line) continue;
    if (line === '---') t.appendChild(h('i', { class: 'tip-sep', 'aria-hidden': 'true' }));
    else if (line.startsWith('## ')) t.appendChild(h('span', { class: 'tip-head' }, line.slice(3)));
    else t.appendChild(h('span', { class: line.startsWith('★') ? 'tip-skill' : '' }, line));
  }
  t.classList.toggle('wide', el.dataset.tipKind === 'card');
  t.classList.add('on');
  settle(el);
  if (!watcher) {
    watcher = new MutationObserver((list) => {
      if (current && list.some((m) => m.target instanceof Element && m.target.closest('[data-tip-avoid]'))) settle(current);
    });
  }
  watcher.disconnect();
  for (const a of document.querySelectorAll('[data-tip-avoid]')) watcher.observe(a, { childList: true, subtree: true });
}

/** 지금 자리를 잡고, 카드가 떠오르는 움직임·대사 띠가 나타나는 움직임이 끝날 때까지(0.6초) 매 프레임 따라간다 */
function settle(el: HTMLElement): void {
  place(el);
  cancelAnimationFrame(settleTimer);
  const until = performance.now() + 600;
  const step = () => {
    if (current !== el) return;
    place(el);
    if (performance.now() < until) settleTimer = requestAnimationFrame(step);
  };
  settleTimer = requestAnimationFrame(step);
}

/** 대상 위쪽 가운데, 화면 밖으로 나가면 안쪽으로, 피할 띠가 있으면 그 위로 */
function place(el: HTMLElement): void {
  const t = ensure();
  const r = el.getBoundingClientRect();
  const tw = t.offsetWidth;
  const th = t.offsetHeight;
  const left = Math.min(Math.max(8, r.left + r.width / 2 - tw / 2), window.innerWidth - tw - 8);
  const above = r.top - th - 8;
  let top = above >= 8 ? above : r.bottom + 8;
  // 피할 띠(전투 대사 띠 등, data-tip-avoid): 떠 있으면 그 위로 올린다(2026-10-12)
  for (const a of document.querySelectorAll<HTMLElement>('[data-tip-avoid]')) {
    if (!a.childElementCount) continue;
    const b = a.getBoundingClientRect();
    if (b.height < 1 || left + tw <= b.left || left >= b.right || top + th <= b.top || top >= b.bottom) continue;
    top = Math.max(8, b.top - th - 8);
  }
  t.style.left = `${left}px`;
  t.style.top = `${top}px`;
}

function hide(): void {
  current = null;
  byTouch = false;
  cancelAnimationFrame(settleTimer);
  watcher?.disconnect();
  tip?.classList.remove('on');
}

const target = (e: Event) => (e.target instanceof Element ? (e.target.closest('[data-tip],[data-tip-title]') as HTMLElement | null) : null);

let installed = false;
export function installTooltips(): void {
  if (installed) return;
  installed = true;
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return;
    const el = target(e);
    if (el && el !== current) {
      byTouch = false;
      show(el);
    } else if (!el && current && !byTouch) hide();
  });
  document.addEventListener('pointerdown', (e) => {
    // 휴대폰: 누르면 띄우고, 다른 곳을 누르면 닫는다(카드·유닛을 누르는 동작은 그대로 진행)
    if (e.pointerType !== 'touch') return;
    const el = target(e);
    if (el && el !== current) {
      show(el);
      byTouch = true;
    } else hide();
  });
  document.addEventListener('scroll', hide, true);
  window.addEventListener('blur', hide);
}

/** 화면을 다시 그려 대상이 사라졌으면 닫는다 */
export function pruneTooltip(): void {
  if (current && !current.isConnected) hide();
}

/** h()에 넘길 주석 속성 */
export function tipAttrs(title: string, body = '', kind?: string): Record<string, string | undefined> {
  return { 'data-tip-title': title, 'data-tip': body, 'data-tip-kind': kind };
}

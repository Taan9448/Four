// 폭주 그림(GAME_DESIGN 7절, 2026-10-13): 균열 폭주 때 화면 전체에 일러스트 + "하늘이 터졌다" + 네 가지 칩.
// 정해진 시간이 지나거나, 아무 곳이나 누르거나, 아무 키를 누르면 닫힌다. ?screen=surgecut으로도 본다.
import type { GameData } from '../engine/data';
import { frameUrl } from '../render/assets';
import { h } from './dom';
import { settings } from './settings';

export const SURGE_ART = 'cg_rift_surge';
/** 그림이 떠 있는 시간(전투 속도 배율을 곱한다) */
export const SURGE_CUT_MS = 2200;

/** 그림 위 네 가지 칩(같은 전투 n번째 폭주면 체력 손실도 ×n) */
export function surgeChips(data: GameData, count: number): [string, string][] {
  const b = data.balance.rift;
  return [
    ['血', `체력 −${Math.round(b.surgeRatio * 100) * count}%`],
    ['力', `적 힘 +${b.surgeEnemyStrength}`],
    ['響', `잔향 ${b.surgeEchoToHand}`],
    ['裂', `상흔 +${b.surgeScar}`],
  ];
}

export function surgeCut(data: GameData, count = 1, opts: { ms?: number } = {}): Promise<void> {
  const url = frameUrl(SURGE_ART, 1, { realOnly: true });
  const art = url
    ? h('img', { class: 'surge-cut-art', src: url, alt: '' })
    : h('div', { class: 'surge-cut-art surge-cut-fallback', 'aria-hidden': 'true' }, crackSvg());
  const skip = h('button', { class: 'btn btn-small surge-cut-skip', type: 'button' }, '건너뛰기 ▸');
  const el = h(
    'div',
    { class: 'surge-cut', role: 'dialog', 'aria-modal': 'true', 'aria-label': '균열 폭주' },
    art,
    h('div', { class: 'surge-cut-shade', 'aria-hidden': 'true' }),
    h(
      'div',
      { class: 'surge-cut-text' },
      h('div', { class: 'surge-cut-eyebrow' }, count > 1 ? `균열 폭주 ×${count}` : '균열 폭주'),
      h('div', { class: 'surge-cut-title' }, '하늘이 터졌다'),
      h('ul', { class: 'surge-cut-chips' }, surgeChips(data, count).map(([g, t]) => h('li', {}, h('b', { 'aria-hidden': 'true' }, g), t))),
    ),
    skip,
    h('small', { class: 'surge-cut-hint' }, '누르면 넘어간다'),
  );
  return new Promise((resolve) => {
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      clearTimeout(timer);
      document.removeEventListener('keydown', onKey, true);
      el.classList.add('out');
      setTimeout(() => {
        el.remove();
        resolve();
      }, 180);
    };
    // 전투 단축키(E·숫자)가 뒤에서 먹히지 않게 잡아 둔다
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Tab' || e.key === 'Shift') return;
      e.preventDefault();
      e.stopPropagation();
      close();
    };
    const timer = setTimeout(close, opts.ms ?? SURGE_CUT_MS * settings.speed);
    el.addEventListener('click', close);
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(el);
    requestAnimationFrame(() => skip.focus({ preventScroll: true }));
  });
}

/** 그림이 오기 전: 검붉은 바탕 위 금 선 */
function crackSvg(): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 300 200');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
  for (const d of ['M20 30 L80 52 L110 40 L150 70 L190 58 L230 86 L290 74', 'M150 70 L158 104 L146 132', 'M110 40 L104 18', 'M230 86 L246 112']) {
    const glow = document.createElementNS(NS, 'path');
    glow.setAttribute('d', d);
    glow.setAttribute('class', 'sc-glow');
    const line = document.createElementNS(NS, 'path');
    line.setAttribute('d', d);
    line.setAttribute('class', 'sc-line');
    svg.append(glow, line);
  }
  return svg;
}

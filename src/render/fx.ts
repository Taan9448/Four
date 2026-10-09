// 타격 연출: 피격 흔들림, 타격 멈춤, 카드 비행, 떠오르는 숫자, 짧은 번쩍임, 알림. 물리·파티클 엔진은 쓰지 않는다.

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function restartAnimation(el: HTMLElement, cls: string, ms: number): void {
  el.classList.remove(cls);
  void el.offsetWidth; // 리플로우로 애니메이션 재시작
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), ms);
}

/** 움직임 줄이기(운영체제 설정)면 흔들림·비행을 약하게 */
export const reducedMotion = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 화면 흔들림 세기 배율(설정: 0 끄기 · 0.5 약하게 · 1 보통). settings가 바꾼다 */
let shakeScale = 1;
export function setShakeScale(v: number): void {
  shakeScale = v;
}

// ───────────── 타격 멈춤(히트스톱) ─────────────
// 연출 시계: 타격 순간 잠깐 멈춘다. 스프라이트 재생기는 performance.now() 대신 fxNow()로 프레임을 고르므로 함께 멈추고,
// CSS 애니메이션은 문서에 hitstop 클래스를 걸어 멈춘다.
let frozenAt: number | null = null;
let frozenTotal = 0;
let thawTimer: ReturnType<typeof setTimeout> | null = null;

export function fxNow(): number {
  return (frozenAt ?? performance.now()) - frozenTotal;
}

/** ms 동안 연출을 멈춘다(겹치면 늘린다). 멈춤이 풀릴 때 resolve */
export function hitStop(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  if (frozenAt === null) {
    frozenAt = performance.now();
    document.documentElement.classList.add('hitstop');
  }
  if (thawTimer) clearTimeout(thawTimer);
  return new Promise<void>((resolve) => {
    thawTimer = setTimeout(() => {
      thawTimer = null;
      if (frozenAt !== null) frozenTotal += performance.now() - frozenAt;
      frozenAt = null;
      document.documentElement.classList.remove('hitstop');
      resolve();
    }, ms);
  });
}

// ───────────── 흔들림 ─────────────
const shaking = new WeakMap<HTMLElement, number>();

/**
 * 맞은 쪽 흔들림. power 0~1(피해가 클수록 크게), dir은 밀려나는 방향(-1 왼쪽, 1 오른쪽, 0 제자리).
 * 첫 순간 dir 쪽으로 크게 밀렸다가 좌우로 잦아든다. 요소의 transform을 건드리지 않게 CSS translate 속성만 쓴다.
 */
export function shake(el: HTMLElement, power: number, dir = 0): void {
  const amp = Math.min(1, Math.max(0, power)) * 16 * shakeScale * (reducedMotion() ? 0.3 : 1);
  if (amp < 0.5) return;
  const dur = 160 + power * 260;
  const start = performance.now();
  const seed = Math.random() * 10;
  const id = (shaking.get(el) ?? 0) + 1;
  shaking.set(el, id);
  const tick = (now: number) => {
    if (shaking.get(el) !== id) return;
    const t = (now - start) / dur;
    if (t >= 1) {
      el.style.translate = '';
      return;
    }
    const decay = (1 - t) * (1 - t);
    // 처음 15%는 밀려나는 쪽으로, 그 뒤로는 사인파로 잦아든다
    const push = dir * amp * 0.8 * Math.max(0, 1 - t / 0.15);
    const x = push + Math.sin(t * 38 + seed) * amp * decay;
    const y = Math.cos(t * 31 + seed * 2) * amp * 0.35 * decay;
    el.style.translate = `${x.toFixed(1)}px ${y.toFixed(1)}px`;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// ───────────── 카드 비행 ─────────────
export interface FlyOptions {
  /** 도착 크기 배율 */
  scale?: number;
  ms?: number;
  /** 도착 즈음 사라지기 */
  fade?: boolean;
  delay?: number;
}

/**
 * 요소(카드)의 복제본을 화면 위에 띄워 제자리(또는 fromRect: 이미 떼어 낸 요소의 마지막 자리)에서 to 자리(사각형 가운데)로 날린다. 원본은 건드리지 않는다.
 * 날아가는 동안 살짝 위로 휘고, 도착하며 작아진다.
 */
export function flyClone(el: HTMLElement, to: DOMRect, opts: FlyOptions = {}, fromRect?: DOMRect): Promise<void> {
  const from = fromRect ?? el.getBoundingClientRect();
  if (!from.width || !to.width) return Promise.resolve();
  const ms = (opts.ms ?? 280) * (reducedMotion() ? 0.5 : 1);
  const ghost = el.cloneNode(true) as HTMLElement;
  ghost.classList.add('card-ghost');
  ghost.classList.remove('card-selected');
  Object.assign(ghost.style, { position: 'fixed', left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px`, margin: '0', transform: 'none', zIndex: '900', visibility: 'visible' });
  document.body.appendChild(ghost);
  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  const s = opts.scale ?? 0.45;
  const anim = ghost.animate(
    [
      { transform: 'translate(0, 0) scale(1) rotate(0deg)', opacity: 1 },
      { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - 40}px) scale(${(1 + s) / 2 + 0.08}) rotate(${dx > 0 ? 6 : -6}deg)`, opacity: 1, offset: 0.45 },
      { transform: `translate(${dx}px, ${dy}px) scale(${s}) rotate(0deg)`, opacity: opts.fade === false ? 1 : 0 },
    ],
    { duration: ms, delay: opts.delay ?? 0, easing: 'cubic-bezier(.45,.05,.55,.95)', fill: 'forwards' },
  );
  return anim.finished.then(
    () => ghost.remove(),
    () => ghost.remove(),
  );
}

export interface TearOptions {
  ms?: number;
  /** 찢기 전에 이쪽(대상)으로 조금 다가간다 */
  toward?: DOMRect | null;
  /** 찢어지는 순간(화면 좌표의 솔기 가운데·카드 높이) — 그림 이펙트를 겹치는 자리 */
  onTear?: (x: number, y: number, height: number) => void;
}

/**
 * 찢긴 가장자리(x%, y%): 위에서 아래로 내려가는 큰 굽이 + 잔 톱니. 무작위 없이 고정 모양(엔진 밖이지만 같은 카드는 늘 같게)
 * 왼쪽 조각 = 이 선의 왼쪽, 오른쪽 조각 = 오른쪽
 */
const TEAR_EDGE: [number, number][] = Array.from({ length: 25 }, (_, i) => {
  const wave = Math.sin(i * 0.85) * 5 + Math.sin(i * 2.3) * 2;
  const tooth = i % 2 ? 2.4 : -2.4;
  return [Number((50 + wave + tooth).toFixed(1)), Number(((i / 24) * 100).toFixed(1))];
});

/**
 * 낸 카드 찢기(2026-10-09 다듬음): 복제본이 대상 쪽으로 떠올라 달아오르고, 잠깐 팽팽하게 버틴 뒤
 * 위쪽부터 톱니 선을 따라 벌어져(아래 끝을 축으로 돈다) 두 조각이 되어 좌우로 떨어지며 사라진다.
 * 찢긴 단면에는 밝은 종이 섬유 선이 보이고, 종잇조각·먹 방울이 튄다. 원본은 건드리지 않는다.
 */
export function tearCard(el: HTMLElement, opts: TearOptions = {}): Promise<void> {
  const rect = el.getBoundingClientRect();
  const w = el.offsetWidth;
  const hgt = el.offsetHeight;
  if (!rect.width || !w) return Promise.resolve();
  // 손패의 기울기·확대를 그대로 이어받는다
  const t0 = getComputedStyle(el).transform;
  const m = new DOMMatrixReadOnly(t0 === 'none' ? undefined : t0);
  const scale = Math.hypot(m.a, m.b) || 1;
  const rot = (Math.atan2(m.b, m.a) * 180) / Math.PI;
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const reduce = reducedMotion();
  const ms = (opts.ms ?? 700) * (reduce ? 0.5 : 1);
  // 떠오르는 자리: 위로 조금 + 대상 쪽으로 1/5
  const t = opts.toward;
  const dx = t ? (t.left + t.width / 2 - cx) * 0.2 : 0;
  const dy = (t ? (t.top + t.height / 2 - cy) * 0.12 : 0) - 46;
  const S = scale * 1.06;
  // 모든 키프레임이 같은 함수 목록을 쓰게 해 부드럽게 잇는다. 뒤의 translateY(50%) rotate translateY(-50%)는 "아래 끝을 축으로 돌기"
  const tf = (x: number, y: number, r: number, sc: number, open: number) =>
    `translate(-50%, -50%) translate(${x}px, ${y}px) rotate(${r}deg) scale(${sc}) translateY(50%) rotate(${open}deg) translateY(-50%)`;
  const edge = TEAR_EDGE.map(([x, y]) => `${x}% ${y}%`);
  const clips = [`polygon(0 0, ${edge.join(', ')}, 0 100%)`, `polygon(${[...edge].reverse().join(', ')}, 100% 0, 100% 100%)`];
  const fiber = TEAR_EDGE.map(([x, y]) => `${x},${y}`).join(' ');
  const halves = clips.map((clip, k) => {
    const g = el.cloneNode(true) as HTMLElement;
    g.classList.add('card-ghost', 'card-torn');
    g.classList.remove('card-selected');
    Object.assign(g.style, { position: 'fixed', left: `${cx}px`, top: `${cy}px`, width: `${w}px`, height: `${hgt}px`, margin: '0', zIndex: '900', visibility: 'visible', clipPath: clip, transformOrigin: '50% 50%' });
    // 찢긴 단면의 종이 섬유: 같은 선을 굵게 그려 반쪽만 보이게(나머지는 잘린다)
    g.insertAdjacentHTML(
      'beforeend',
      `<svg class="tear-edge" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline points="${fiber}" fill="none" stroke="#fffaf0" stroke-width="5" stroke-linejoin="bevel" vector-effect="non-scaling-stroke"/><polyline points="${fiber}" fill="none" stroke="#c9b48a" stroke-width="9" stroke-linejoin="bevel" stroke-opacity="0.45" vector-effect="non-scaling-stroke"/></svg>`,
    );
    document.body.appendChild(g);
    // 섬유 선은 찢어지기 시작할 때부터 보인다
    g.querySelector('.tear-edge')?.animate([{ opacity: 0 }, { opacity: 0, offset: 0.28 }, { opacity: 1, offset: 0.36 }, { opacity: 1 }], { duration: ms, fill: 'forwards' });
    const side = k === 0 ? -1 : 1;
    const glow = 'drop-shadow(0 0 10px rgba(255, 213, 138, 0.75))';
    const anim = g.animate(
      [
        { transform: tf(0, 0, rot, scale, 0), filter: 'brightness(1)', opacity: 1 },
        { transform: tf(dx, dy, 0, S, 0), filter: `brightness(1.08) ${glow}`, opacity: 1, offset: 0.18 },
        // 팽팽하게 버티는 순간(살짝 떨림)
        { transform: tf(dx + side * 0.8, dy, side * -1.2, S * 1.02, 0), filter: `brightness(1.15) ${glow}`, opacity: 1, offset: 0.27 },
        // 위쪽부터 벌어진다
        { transform: tf(dx + side * 3, dy, 0, S, side * 8), filter: 'brightness(1.05)', opacity: 1, offset: 0.38 },
        { transform: tf(dx + side * 20, dy + 10, side * 5, S, side * 16), filter: 'brightness(1)', opacity: 1, offset: 0.58 },
        { transform: tf(dx + side * 38, dy + 52, side * 11, S * 0.97, side * 21), filter: 'brightness(0.92)', opacity: 0.9, offset: 0.78 },
        // 떨어지며 사라진다
        { transform: tf(dx + side * 52, dy + 115, side * 16, S * 0.94, side * 25), filter: 'brightness(0.8)', opacity: 0 },
      ],
      { duration: ms, easing: 'cubic-bezier(.35,.1,.45,1)', fill: 'forwards' },
    );
    return anim.finished.then(
      () => g.remove(),
      () => g.remove(),
    );
  });
  // 찢기는 순간: 그림 이펙트 + 종잇조각·먹 방울(위로 튀었다가 떨어진다)
  const tearAt = ms * 0.34;
  const sx = cx + dx;
  const sy = cy + dy;
  const bits: Promise<void>[] = [];
  setTimeout(() => opts.onTear?.(sx, sy, hgt * S), tearAt);
  if (!reduce) {
    for (let i = 0; i < 9; i++) {
      const side = i % 2 ? 1 : -1;
      const b = document.createElement('i');
      b.className = `tear-bit${i % 3 === 0 ? ' ink' : ''}`;
      Object.assign(b.style, { left: `${sx}px`, top: `${sy + (i - 4) * hgt * S * 0.1}px` });
      document.body.appendChild(b);
      const fx = side * (30 + ((i * 37) % 46));
      const up = -14 - ((i * 29) % 22);
      const fall = 40 + ((i * 53) % 50);
      const spin = side * (140 + i * 35);
      const a = b.animate(
        [
          { transform: 'translate(-50%, -50%) scale(0.4) rotate(0deg)', opacity: 0 },
          { transform: `translate(calc(-50% + ${fx * 0.5}px), calc(-50% + ${up}px)) scale(1) rotate(${spin * 0.4}deg)`, opacity: 1, offset: 0.3 },
          { transform: `translate(calc(-50% + ${fx}px), calc(-50% + ${fall}px)) scale(0.8) rotate(${spin}deg)`, opacity: 0 },
        ],
        { duration: ms * 0.9, delay: tearAt, easing: 'cubic-bezier(.25,.6,.5,1)', fill: 'both' },
      );
      bits.push(a.finished.then(() => b.remove(), () => b.remove()));
    }
  }
  // 조각이 떨어지는 동안 다음 연출(피해)이 이어지게, 벌어진 직후에 끝낸다(조각은 스스로 사라진다)
  void Promise.all([...halves, ...bits]);
  return sleep(ms * 0.5);
}

/** 새로 들어온 요소(뽑은 카드)를 from 사각형에서 제자리로 끌어온다. 요소의 transform과 겹치지 않게 translate·scale 속성을 쓴다 */
export function flyIn(el: HTMLElement, from: DOMRect, delay = 0, ms = 260): void {
  const to = el.getBoundingClientRect();
  if (!from.width || !to.width) return;
  const dx = from.left + from.width / 2 - (to.left + to.width / 2);
  const dy = from.top + from.height / 2 - (to.top + to.height / 2);
  el.animate(
    [
      { translate: `${dx}px ${dy}px`, scale: '0.3', opacity: 0 },
      { translate: '0px 0px', scale: '1', opacity: 1 },
    ],
    { duration: ms * (reducedMotion() ? 0.5 : 1), delay, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'backwards' },
  );
}

export function flash(el: HTMLElement, color: 'white' | 'red' | 'blue' = 'white'): void {
  restartAnimation(el, `fx-flash-${color}`, 220);
}

export type FloatKind = 'damage' | 'heavy' | 'crit' | 'critical' | 'weak' | 'resist' | 'block' | 'heal' | 'status' | 'absorb' | 'rift';

/** layer 기준 좌표(x, y)에 숫자/글자를 띄운다 */
export function floatText(layer: HTMLElement, x: number, y: number, text: string, kind: FloatKind): void {
  const el = document.createElement('div');
  el.className = `float-text float-${kind}`;
  el.textContent = text;
  el.style.left = `${x + (Math.random() - 0.5) * 24}px`;
  el.style.top = `${y}px`;
  layer.appendChild(el);
  setTimeout(() => el.remove(), 1000);
}

/** 대상 요소 위에 숫자를 띄운다 */
export function floatOver(layer: HTMLElement, target: HTMLElement, text: string, kind: FloatKind): void {
  const lr = layer.getBoundingClientRect();
  const tr = target.getBoundingClientRect();
  floatText(layer, tr.left - lr.left + tr.width / 2, tr.top - lr.top + tr.height * 0.3, text, kind);
}

/** hold: 사라지기 시작할 때까지(ms). 기본 1.6초 */
export function toast(container: HTMLElement, text: string, kind: 'support' | 'info' | 'danger' = 'info', hold = 1600): void {
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.textContent = text;
  container.appendChild(el);
  setTimeout(() => el.classList.add('toast-out'), hold);
  setTimeout(() => el.remove(), hold + 500);
}

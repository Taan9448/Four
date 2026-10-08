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

export function toast(container: HTMLElement, text: string, kind: 'support' | 'info' | 'danger' = 'info'): void {
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.textContent = text;
  container.appendChild(el);
  setTimeout(() => el.classList.add('toast-out'), 1600);
  setTimeout(() => el.remove(), 2100);
}

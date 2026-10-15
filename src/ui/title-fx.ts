// 시작 화면 움직임(2026-10-11 사용자 결정, 목업 8층 모두): 세계관 그림(title_world) 위에 빛·안개·입자만 겹친다. 그림은 그대로다.
// 층의 자리는 그림 기준 비율(가운데 하늘의 금, 오른쪽 위 두 달)이라, 층 묶음(.title-stage)을 그림과 같은 3:2로 화면에 꽉 채운다(CSS).
// 입자(금의 불티 · 왼쪽 매화 꽃잎 · 오른쪽 마나 알갱이와 별)는 캔버스 하나에 그린다. 화면 연출을 끄거나 '움직임 줄이기'면 그리지 않는다.
// 장식이라 엔진의 시드 RNG가 아닌 Math.random을 쓴다(게임 결과와 무관).
import { isIdle } from '../render/idle';
import { h } from './dom';

/** 화면 연출이 꺼졌는가(설정의 '화면 연출' → 문서에 no-motion, 또는 기기의 움직임 줄이기) */
export function motionOff(): boolean {
  return document.documentElement.classList.contains('no-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** 장식 캔버스의 최대 픽셀 수(약 780×520) */
const MAX_PIXELS = 400_000;
/** 초당 30장 */
const FRAME_MS = 1000 / 30;

interface Ember { x: number; y: number; vx: number; vy: number; life: number }
interface Petal { x: number; y: number; vx: number; vy: number; r: number; vr: number; w: number }
interface Mote { x: number; y: number; vy: number; p: number; life: number }

/** 시작 화면 그림과 그 위의 움직임 층. 화면에서 빠지면 그리기를 멈춘다 */
export function titleStage(url: string): HTMLElement {
  const canvas = h('canvas', { class: 'title-fx', 'aria-hidden': 'true' }) as HTMLCanvasElement;
  const stage = h(
    'div',
    { class: 'title-stage', 'aria-hidden': 'true' },
    h('div', { class: 'title-art', style: `background-image:url("${url}")` }),
    h('div', { class: 'title-mist a' }),
    h('div', { class: 'title-mist b' }),
    h('div', { class: 'title-moon a' }),
    h('div', { class: 'title-moon b' }),
    h('div', { class: 'title-crack' }),
    canvas,
  );
  const ctx = canvas.getContext('2d');
  if (!ctx) return stage;
  let W = 0;
  let H = 0;
  const fit = () => {
    // 입자는 네모 점이라 고해상도가 필요 없다 — 화면의 절반 해상도 이하로 그려 CSS로 키운다(pixelated).
    // 큰 화면에서도 캔버스가 MAX_PIXELS를 넘지 않게 더 줄인다(2026-10-15 렉 줄이기)
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    const d = Math.min(0.5, Math.sqrt(MAX_PIXELS / Math.max(1, w * h)));
    W = canvas.width = Math.round(w * d);
    H = canvas.height = Math.round(h * d);
  };
  const rnd = (a: number, b: number) => a + Math.random() * (b - a);
  const embers: Ember[] = [];
  const petals: Petal[] = [];
  const motes: Mote[] = [];
  const stars = Array.from({ length: 26 }, () => ({ x: rnd(0.58, 0.99), y: rnd(0.02, 0.3), p: rnd(0, 6.28), s: rnd(0.6, 1.4) }));
  // 그림 픽셀처럼 네모 점으로(화면 폭 1200 기준 크기)
  const dot = (x: number, y: number, s: number, color: string) => {
    const k = Math.max(1, Math.round((s * W) / 1200));
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x * W), Math.round(y * H), k, k);
  };
  // 움직임은 경과 시간 기준(60fps 한 장 = 1): 주사율이 달라도 같은 빠르기
  let t = 0;
  /** 한 번에 나아가는 시간의 상한 — 오래 쉬다 돌아와도 입자가 튀지 않게(6장 = 0.1초) */
  const MAX_STEP = 6;
  const step = (k: number) => {
    t += k;
    // 프레임마다 p였던 생성 확률을 k장 동안으로
    const chance = (p: number) => Math.random() < 1 - (1 - p) ** k;
    if (embers.length < 14 && chance(0.18)) embers.push({ x: rnd(0.485, 0.515), y: rnd(0.12, 0.58), vy: rnd(-0.0016, -0.0008), vx: rnd(-0.0003, 0.0003), life: 1 });
    if (petals.length < 16 && chance(0.12)) petals.push({ x: rnd(-0.05, 0.4), y: -0.03, vx: rnd(0.0007, 0.0016), vy: rnd(0.0009, 0.0016), r: rnd(0, 6.28), vr: rnd(-0.05, 0.05), w: rnd(0, 6.28) });
    if (motes.length < 22 && chance(0.2)) motes.push({ x: rnd(0.56, 0.98), y: rnd(0.55, 1), vy: rnd(-0.0011, -0.0005), p: rnd(0, 6.28), life: 1 });
    for (let i = embers.length - 1; i >= 0; i--) {
      const e = embers[i];
      e.x += (e.vx + Math.sin(t * 0.05 + i) * 0.0002) * k;
      e.y += e.vy * k;
      e.life -= 0.008 * k;
      if (e.life <= 0) embers.splice(i, 1);
    }
    for (let i = petals.length - 1; i >= 0; i--) {
      const p = petals[i];
      p.x += (p.vx + Math.sin(t * 0.02 + p.w) * 0.0006) * k;
      p.y += p.vy * k;
      p.r += p.vr * k;
      if (p.y > 1.05 || p.x > 0.5) petals.splice(i, 1);
    }
    for (let i = motes.length - 1; i >= 0; i--) {
      const m = motes[i];
      m.y += m.vy * k;
      m.x += Math.sin(t * 0.03 + m.p) * 0.0004 * k;
      m.life -= 0.004 * k;
      if (m.life <= 0 || m.y < 0.2) motes.splice(i, 1);
    }
  };
  const paint = () => {
    ctx.clearRect(0, 0, W, H);
    for (const s of stars) {
      ctx.globalAlpha = 0.35 + 0.65 * Math.max(0, Math.sin(t * 0.03 * s.s + s.p));
      dot(s.x, s.y, 2.5, '#eaf4ff');
    }
    for (const e of embers) {
      ctx.globalAlpha = Math.min(1, e.life * 1.5);
      dot(e.x, e.y, 3, e.life > 0.5 ? '#ff8a5c' : '#ff3b3b');
    }
    for (const p of petals) {
      ctx.globalAlpha = 0.9;
      dot(p.x, p.y, 4 * (0.5 + Math.abs(Math.sin(p.r)) * 0.5), '#f7c1cf');
      dot(p.x + 0.002, p.y + 0.002, 2.5, '#e98aa4');
    }
    for (const m of motes) {
      ctx.globalAlpha = Math.min(1, m.life * 1.6) * (0.6 + 0.4 * Math.sin(t * 0.08 + m.p));
      dot(m.x, m.y, 3, '#8fd3ff');
    }
    ctx.globalAlpha = 1;
  };

  // 돌기: 초당 30장까지. 화면 연출을 끄거나 창을 떠나면(idle) 루프를 아예 세우고, 문서의 클래스(no-motion · idle)가
  // 바뀌거나 '움직임 줄이기'가 바뀌면 다시 깨운다 — 꺼진 동안 rAF·타이머를 남기지 않고, 다시 켜도 루프가 겹치지 않는다
  let running = false;
  let attached = false;
  let drawn = false;
  let last = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const watch = new MutationObserver(() => wake());
  const ro = new ResizeObserver(() => {
    fit();
    wake();
  });
  const dispose = () => {
    running = false;
    if (timer !== null) clearTimeout(timer);
    watch.disconnect();
    ro.disconnect();
    reduce.removeEventListener('change', wake);
  };
  function wake(): void {
    if (!stage.isConnected) {
      if (attached) dispose();
      return;
    }
    attached = true;
    if (motionOff() && drawn) {
      ctx!.clearRect(0, 0, W, H);
      drawn = false;
    }
    if (running || isIdle() || motionOff() || !W || !H) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(frame);
  }
  function frame(now: number): void {
    timer = null;
    if (!running) return;
    if (!stage.isConnected || isIdle() || motionOff()) {
      running = false;
      wake();
      return;
    }
    step(Math.min(MAX_STEP, Math.max(0, now - last) / (1000 / 60)));
    last = now;
    paint();
    drawn = true;
    timer = setTimeout(() => requestAnimationFrame(frame), FRAME_MS - 4);
  }
  ro.observe(canvas);
  watch.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  reduce.addEventListener('change', wake);
  return stage;
}

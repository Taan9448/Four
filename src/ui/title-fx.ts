// 시작 화면 움직임(2026-10-11 사용자 결정, 목업 8층 모두): 세계관 그림(title_world) 위에 빛·안개·입자만 겹친다. 그림은 그대로다.
// 층의 자리는 그림 기준 비율(가운데 하늘의 금, 오른쪽 위 두 달)이라, 층 묶음(.title-stage)을 그림과 같은 3:2로 화면에 꽉 채운다(CSS).
// 입자(금의 불티 · 왼쪽 매화 꽃잎 · 오른쪽 마나 알갱이와 별)는 캔버스 하나에 그린다. 화면 연출을 끄거나 '움직임 줄이기'면 그리지 않는다.
// 장식이라 엔진의 시드 RNG가 아닌 Math.random을 쓴다(게임 결과와 무관).
import { h } from './dom';

/** 화면 연출이 꺼졌는가(설정의 '화면 연출' → 문서에 no-motion, 또는 기기의 움직임 줄이기) */
export function motionOff(): boolean {
  return document.documentElement.classList.contains('no-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches;
}

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
    const d = Math.min(2, devicePixelRatio || 1);
    W = canvas.width = Math.round(canvas.offsetWidth * d);
    H = canvas.height = Math.round(canvas.offsetHeight * d);
  };
  const ro = new ResizeObserver(fit);
  ro.observe(canvas);
  const rnd = (a: number, b: number) => a + Math.random() * (b - a);
  const embers: Ember[] = [];
  const petals: Petal[] = [];
  const motes: Mote[] = [];
  const stars = Array.from({ length: 26 }, () => ({ x: rnd(0.58, 0.99), y: rnd(0.02, 0.3), p: rnd(0, 6.28), s: rnd(0.6, 1.4) }));
  // 그림 픽셀처럼 네모 점으로(화면 폭 1200 기준 크기)
  const dot = (x: number, y: number, s: number, color: string) => {
    const k = Math.max(2, Math.round((s * W) / 1200));
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x * W), Math.round(y * H), k, k);
  };
  let t = 0;
  let drawn = false;
  const frame = () => {
    if (!stage.isConnected) {
      ro.disconnect();
      return;
    }
    requestAnimationFrame(frame);
    if (!W || !H) return;
    if (motionOff()) {
      if (drawn) ctx.clearRect(0, 0, W, H);
      drawn = false;
      return;
    }
    t += 1;
    drawn = true;
    ctx.clearRect(0, 0, W, H);
    if (embers.length < 14 && Math.random() < 0.18) embers.push({ x: rnd(0.485, 0.515), y: rnd(0.12, 0.58), vy: rnd(-0.0016, -0.0008), vx: rnd(-0.0003, 0.0003), life: 1 });
    if (petals.length < 16 && Math.random() < 0.12) petals.push({ x: rnd(-0.05, 0.4), y: -0.03, vx: rnd(0.0007, 0.0016), vy: rnd(0.0009, 0.0016), r: rnd(0, 6.28), vr: rnd(-0.05, 0.05), w: rnd(0, 6.28) });
    if (motes.length < 22 && Math.random() < 0.2) motes.push({ x: rnd(0.56, 0.98), y: rnd(0.55, 1), vy: rnd(-0.0011, -0.0005), p: rnd(0, 6.28), life: 1 });
    for (const s of stars) {
      ctx.globalAlpha = 0.35 + 0.65 * Math.max(0, Math.sin(t * 0.03 * s.s + s.p));
      dot(s.x, s.y, 2.5, '#eaf4ff');
    }
    for (let i = embers.length - 1; i >= 0; i--) {
      const e = embers[i];
      e.x += e.vx + Math.sin(t * 0.05 + i) * 0.0002;
      e.y += e.vy;
      e.life -= 0.008;
      if (e.life <= 0) {
        embers.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = Math.min(1, e.life * 1.5);
      dot(e.x, e.y, 3, e.life > 0.5 ? '#ff8a5c' : '#ff3b3b');
    }
    for (let i = petals.length - 1; i >= 0; i--) {
      const p = petals[i];
      p.x += p.vx + Math.sin(t * 0.02 + p.w) * 0.0006;
      p.y += p.vy;
      p.r += p.vr;
      if (p.y > 1.05 || p.x > 0.5) {
        petals.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = 0.9;
      dot(p.x, p.y, 4 * (0.5 + Math.abs(Math.sin(p.r)) * 0.5), '#f7c1cf');
      dot(p.x + 0.002, p.y + 0.002, 2.5, '#e98aa4');
    }
    for (let i = motes.length - 1; i >= 0; i--) {
      const m = motes[i];
      m.y += m.vy;
      m.x += Math.sin(t * 0.03 + m.p) * 0.0004;
      m.life -= 0.004;
      if (m.life <= 0 || m.y < 0.2) {
        motes.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = Math.min(1, m.life * 1.6) * (0.6 + 0.4 * Math.sin(t * 0.08 + m.p));
      dot(m.x, m.y, 3, '#8fd3ff');
    }
    ctx.globalAlpha = 1;
  };
  requestAnimationFrame(frame);
  return stage;
}

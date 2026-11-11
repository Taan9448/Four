// 메인(운곡루 뒤뜰) 잔잔한 움직임(2026-11-11 사용자 요청 — 「천외귀환」 시작 화면처럼): 뒤뜰 그림(bg_gyeol_lobby) 위에 빛·안개·입자만 겹친다.
// 층 자리는 그림 기준 비율(왼쪽 위 달, 오른쪽 처마 등불 둘)이라 층 묶음(.lobby-stage)을 그림과 같은 3:2로 화면에 꽉 채운다(CSS).
// 입자(하늘의 별 · 뜰의 반딧불 · 왼쪽 대숲의 댓잎)는 캔버스 하나에 초당 30장. 움직임 줄이기·화면 품질 '낮음'·창을 떠남(idle)이면 그리지 않는다.
// 장식이라 Math.random을 쓴다(대결 판정과 무관).
import { isIdle } from '../../src/render/idle';
import { el } from './dom';
import { loadSave } from './save';

const MAX_PIXELS = 300_000;
const FRAME_MS = 1000 / 30;
const MAX_STEP = 6;

interface Fly { x: number; y: number; vx: number; vy: number; p: number; life: number }
interface Leaf { x: number; y: number; vx: number; vy: number; r: number; vr: number; w: number }

const motionOff = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches || loadSave().settings.quality === 'low';

/** 뒤뜰 그림과 그 위의 움직임 층. dawn이면 반딧불을 줄이고 별을 옅게. 화면에서 빠지면 그리기를 멈춘다 */
export function lobbyStage(url: string, dawn: boolean): HTMLElement {
  const canvas = el('canvas', { class: 'lobby-fx', 'aria-hidden': 'true' });
  const stage = el(
    'div',
    { class: 'lobby-stage', 'aria-hidden': 'true' },
    el('div', { class: 'lobby-art', style: `background-image:url("${url}")` }),
    el('div', { class: 'lobby-moon' }),
    el('div', { class: 'lobby-lantern a' }),
    el('div', { class: 'lobby-lantern b' }),
    el('div', { class: 'lobby-mist a' }),
    el('div', { class: 'lobby-mist b' }),
    canvas,
  );
  const ctx = canvas.getContext('2d');
  if (!ctx) return stage;
  let W = 0;
  let H = 0;
  const fit = () => {
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    const d = Math.min(0.5, Math.sqrt(MAX_PIXELS / Math.max(1, w * h)));
    W = canvas.width = Math.round(w * d);
    H = canvas.height = Math.round(h * d);
  };
  const rnd = (a: number, b: number) => a + Math.random() * (b - a);
  const flies: Fly[] = [];
  const leaves: Leaf[] = [];
  // 대숲과 처마 사이 하늘의 별
  const stars = Array.from({ length: 22 }, () => ({ x: rnd(0.27, 0.6), y: rnd(0.02, 0.22), p: rnd(0, 6.28), s: rnd(0.5, 1.3) }));
  const dot = (x: number, y: number, s: number, color: string) => {
    const k = Math.max(1, Math.round((s * W) / 1200));
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x * W), Math.round(y * H), k, k);
  };
  const maxFlies = dawn ? 4 : 14;
  let t = 0;
  const step = (k: number) => {
    t += k;
    const chance = (p: number) => Math.random() < 1 - (1 - p) ** k;
    if (flies.length < maxFlies && chance(0.05)) flies.push({ x: rnd(0.06, 0.75), y: rnd(0.5, 0.88), vx: rnd(-0.0004, 0.0004), vy: rnd(-0.0003, 0.0001), p: rnd(0, 6.28), life: 1 });
    if (leaves.length < 7 && chance(0.03)) leaves.push({ x: rnd(-0.02, 0.2), y: rnd(-0.03, 0.15), vx: rnd(0.0004, 0.001), vy: rnd(0.0007, 0.0013), r: rnd(0, 6.28), vr: rnd(-0.06, 0.06), w: rnd(0, 6.28) });
    for (let i = flies.length - 1; i >= 0; i--) {
      const f = flies[i];
      f.x += (f.vx + Math.sin(t * 0.017 + f.p) * 0.0005) * k;
      f.y += (f.vy + Math.cos(t * 0.013 + f.p) * 0.0003) * k;
      f.life -= 0.0018 * k;
      if (f.life <= 0) flies.splice(i, 1);
    }
    for (let i = leaves.length - 1; i >= 0; i--) {
      const l = leaves[i];
      l.x += (l.vx + Math.sin(t * 0.02 + l.w) * 0.0007) * k;
      l.y += l.vy * k;
      l.r += l.vr * k;
      if (l.y > 1.02 || l.x > 0.6) leaves.splice(i, 1);
    }
  };
  const paint = () => {
    ctx.clearRect(0, 0, W, H);
    for (const s of stars) {
      ctx.globalAlpha = (dawn ? 0.25 : 0.55) * Math.max(0, Math.sin(t * 0.025 * s.s + s.p));
      dot(s.x, s.y, 2.2, '#eef4ff');
    }
    for (const f of flies) {
      // 반딧불: 천천히 켜졌다 꺼진다(수명 처음·끝은 옅게)
      const glow = Math.max(0, Math.sin(t * 0.05 + f.p)) * Math.min(1, f.life * 3, (1 - f.life) * 6 + 0.2);
      ctx.globalAlpha = glow * 0.3;
      dot(f.x - 0.003, f.y - 0.004, 11, '#d8f27a');
      ctx.globalAlpha = glow;
      dot(f.x, f.y, 4.5, '#f4ffb0');
    }
    for (const l of leaves) {
      ctx.globalAlpha = 0.75;
      const len = 5 + Math.abs(Math.sin(l.r)) * 5;
      dot(l.x, l.y, len, '#6f8f4e');
      dot(l.x + 0.002, l.y + 0.001, 3, '#9fbf6a');
    }
    ctx.globalAlpha = 1;
  };

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

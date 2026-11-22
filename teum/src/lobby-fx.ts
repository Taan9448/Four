// 「틈」 메인·들어가기 잔잔한 움직임(2026-11-22 사용자 "메인 화면에 결이나 천외귀환처럼 잔잔한 애니메이션"):
// 키 아트(keyart_teum_lobby — 천마봉 위 갈라진 하늘) 위에 빛·안개·입자만 겹친다. 그림은 그대로다.
// 층 자리는 그림 기준 비율(가운데 위 붉은 균열, 오른쪽 계단의 등불 셋)이라 층 묶음(.lobby-stage)을 그림과 같은 3:2로 화면에 꽉 채운다(CSS).
// 입자: 균열에서 떨어지는 그림자 조각 · 균열 둘레 불티 · 계단 등불의 반딧불 · 아래에서 피어오르는 재. 초당 30장.
// 움직임 줄이기·창을 떠남(idle)·화면에서 빠지면 그리지 않는다. 장식이라 Math.random을 쓴다(게임 결과와 무관).
import { isIdle } from '../../src/render/idle';

const MAX_PIXELS = 360_000;
const FRAME_MS = 1000 / 30;

/** 그림 기준 자리(0~1): 균열 줄기(위 → 아래)와 등불 */
const CRACK: [number, number][] = [
  [0.62, 0.0],
  [0.615, 0.08],
  [0.6, 0.18],
  [0.61, 0.26],
  [0.595, 0.33],
  [0.6, 0.4],
];
const LANTERNS: [number, number][] = [
  [0.724, 0.555],
  [0.8, 0.5],
  [0.845, 0.635],
];

interface Shade { x: number; y: number; vx: number; vy: number; r: number; life: number; max: number }
interface Spark { x: number; y: number; vx: number; vy: number; life: number; max: number; hot: boolean }
interface Fly { x: number; y: number; vx: number; vy: number; p: number; life: number; home: number }

const motionOff = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 키 아트와 움직임 층. url이 없으면(그림이 오기 전) 먹빛 바탕 위에 균열만 */
export function lobbyStage(url: string | null): HTMLElement {
  const stage = document.createElement('div');
  stage.className = 'lobby-stage';
  stage.setAttribute('aria-hidden', 'true');
  const art = document.createElement('div');
  art.className = 'lobby-art';
  if (url) art.style.backgroundImage = `url("${url}")`;
  const glow = document.createElement('div');
  glow.className = 'lobby-glow';
  const mistA = document.createElement('div');
  mistA.className = 'lobby-mist a';
  const mistB = document.createElement('div');
  mistB.className = 'lobby-mist b';
  const flash = document.createElement('div');
  flash.className = 'lobby-flash';
  const canvas = document.createElement('canvas');
  canvas.className = 'lobby-fx';
  stage.append(art, glow, mistA, mistB, canvas, flash);
  for (const [x, y] of LANTERNS) {
    const l = document.createElement('i');
    l.className = 'lobby-lantern';
    l.style.left = `${x * 100}%`;
    l.style.top = `${y * 100}%`;
    l.style.animationDelay = `${-Math.random() * 3}s`;
    stage.append(l);
  }
  if (motionOff()) return stage;

  const shades: Shade[] = [];
  const sparks: Spark[] = [];
  const flies: Fly[] = [];
  let raf = 0;
  let last = 0;
  let nextFlash = performance.now() + 5000 + Math.random() * 6000;
  const crackAt = (k: number): [number, number] => {
    const i = Math.min(CRACK.length - 2, Math.floor(k * (CRACK.length - 1)));
    const f = k * (CRACK.length - 1) - i;
    return [CRACK[i][0] + (CRACK[i + 1][0] - CRACK[i][0]) * f, CRACK[i][1] + (CRACK[i + 1][1] - CRACK[i][1]) * f];
  };
  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    if (!stage.isConnected) {
      cancelAnimationFrame(raf);
      return;
    }
    if (isIdle() || now - last < FRAME_MS) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const r = stage.getBoundingClientRect();
    if (!r.width) return;
    const scale = Math.min(1, Math.sqrt(MAX_PIXELS / (r.width * r.height)));
    const W = Math.round(r.width * scale);
    const H = Math.round(r.height * scale);
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }
    const c = canvas.getContext('2d')!;
    c.clearRect(0, 0, W, H);
    // 균열에서 그림자 조각이 연기처럼 흘러내린다
    if (shades.length < 26 && Math.random() < 0.35) {
      const [x, y] = crackAt(Math.random() * 0.8);
      shades.push({ x: x * W + (Math.random() - 0.5) * W * 0.03, y: y * H, vx: (Math.random() - 0.5) * W * 0.02, vy: H * (0.015 + Math.random() * 0.02), r: W * (0.003 + Math.random() * 0.005), life: 0, max: 5 + Math.random() * 4 });
    }
    // 균열 둘레 불티(위로 흩어지며 사라진다)
    if (sparks.length < 70 && Math.random() < 0.9) {
      const [x, y] = crackAt(Math.random());
      sparks.push({ x: x * W + (Math.random() - 0.5) * W * 0.04, y: y * H, vx: (Math.random() - 0.5) * W * 0.03, vy: -H * (0.01 + Math.random() * 0.03), life: 0, max: 1.5 + Math.random() * 2.5, hot: Math.random() < 0.3 });
    }
    // 아래에서 피어오르는 재
    if (sparks.length < 90 && Math.random() < 0.25) sparks.push({ x: Math.random() * W, y: H * 1.02, vx: W * 0.004, vy: -H * (0.02 + Math.random() * 0.02), life: 0, max: 6 + Math.random() * 4, hot: false });
    // 등불 둘레 반딧불
    if (flies.length < 14 && Math.random() < 0.08) {
      const home = Math.floor(Math.random() * LANTERNS.length);
      const [x, y] = LANTERNS[home];
      flies.push({ x: x * W, y: y * H, vx: 0, vy: 0, p: Math.random() * 6, life: 0, home });
    }
    c.save();
    for (const s of shades) {
      s.life += dt;
      s.x += s.vx * dt + Math.sin(s.life * 1.3 + s.r) * W * 0.002;
      s.y += s.vy * dt;
      s.r += W * 0.0015 * dt;
      const a = Math.min(1, s.life / 0.8, (s.max - s.life) / 1.5) * 0.28;
      const g = c.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 3);
      g.addColorStop(0, `rgba(18,6,22,${a})`);
      g.addColorStop(0.6, `rgba(40,8,30,${a * 0.5})`);
      g.addColorStop(1, 'rgba(40,8,30,0)');
      c.fillStyle = g;
      c.beginPath();
      c.arc(s.x, s.y, s.r * 3, 0, Math.PI * 2);
      c.fill();
    }
    c.globalCompositeOperation = 'lighter';
    for (const s of sparks) {
      s.life += dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vx += (Math.random() - 0.5) * W * 0.01 * dt;
      const a = Math.min(1, s.life / 0.3, (s.max - s.life) / 0.8);
      c.fillStyle = s.hot ? `rgba(255,190,150,${a})` : `rgba(230,60,70,${a * 0.8})`;
      const sz = Math.max(1, W * (s.hot ? 0.0022 : 0.0016));
      c.fillRect(s.x, s.y, sz, sz);
    }
    for (const f of flies) {
      f.life += dt;
      f.p += dt;
      const [hx, hy] = LANTERNS[f.home];
      f.vx += ((hx * W - f.x) * 0.4 + (Math.random() - 0.5) * W * 0.6) * dt;
      f.vy += ((hy * H - f.y) * 0.4 + (Math.random() - 0.5) * H * 0.6) * dt;
      f.vx *= 0.96;
      f.vy *= 0.96;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      const a = Math.max(0, Math.sin(f.p * 2.2)) * Math.min(1, f.life, (12 - f.life) / 2);
      const g = c.createRadialGradient(f.x, f.y, 0, f.x, f.y, W * 0.006);
      g.addColorStop(0, `rgba(255,220,130,${a})`);
      g.addColorStop(1, 'rgba(255,200,100,0)');
      c.fillStyle = g;
      c.beginPath();
      c.arc(f.x, f.y, W * 0.006, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
    for (const arr of [shades, sparks]) for (let i = arr.length - 1; i >= 0; i--) if (arr[i].life > arr[i].max || arr[i].y > H * 1.1) arr.splice(i, 1);
    for (let i = flies.length - 1; i >= 0; i--) if (flies[i].life > 12) flies.splice(i, 1);
    // 가끔 균열이 번쩍(하늘이 더 벌어진다)
    if (now > nextFlash) {
      nextFlash = now + 7000 + Math.random() * 9000;
      flash.classList.remove('on');
      void flash.offsetWidth;
      flash.classList.add('on');
    }
  };
  raf = requestAnimationFrame(tick);
  return stage;
}

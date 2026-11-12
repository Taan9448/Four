// 「결」 4차 화면 연출(2026-11-09): 날씨·환경 입자, 대사 말풍선, 적별 결정타, 칼 맞부딪힘 겨루기, 위기·집중 화면.
// 화면만 다룬다(판정은 duel.ts). 무작위가 필요한 입자는 자체 LCG로 정해진 순서대로 뽑는다.
import type { SpriteAsset } from '../../src/render/assets';
import type { Duel, FinisherDef, Weather } from './duel';
import { CONTACT, FOE_X, GROUND, H, PLAYER_X, SCALE, W } from './layout';

/* ───────────── 날씨·환경 입자 ───────────── */

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 강한 타격에 흩어지는 힘(줄어든다) */
  kx: number;
  ky: number;
  size: number;
  rot: number;
  spin: number;
  phase: number;
  age: number;
  /** 같은 날씨 안의 두 번째 모양(낙엽 사이 반딧불, 재 사이 불티 …) */
  alt: boolean;
  /** 캐릭터 앞에 그린다 */
  front: boolean;
  tone: number;
}

export interface WeatherState {
  kind: Weather;
  motes: Mote[];
  seed: number;
}

const COUNT: Record<Weather, number> = { leaves: 34, snow: 90, rain: 130, ash: 60, embers: 70 };

function rnd(w: WeatherState): number {
  w.seed = (Math.imul(w.seed, 1664525) + 1013904223) >>> 0;
  return w.seed / 4294967296;
}

export function createWeather(kind: Weather | undefined): WeatherState | null {
  if (!kind) return null;
  const w: WeatherState = { kind, motes: [], seed: 0x9e3779b9 };
  for (let i = 0; i < COUNT[kind]; i++) w.motes.push(spawn(w, true));
  return w;
}

function spawn(w: WeatherState, anywhere: boolean): Mote {
  const r = () => rnd(w);
  const m: Mote = { x: r() * (W + 160) - 80, y: anywhere ? r() * H : -12, vx: 0, vy: 0, kx: 0, ky: 0, size: 2, rot: r() * 6.28, spin: (r() - 0.5) * 4, phase: r() * 6.28, age: 0, alt: false, front: r() < 0.28, tone: r() };
  switch (w.kind) {
    case 'leaves':
      m.alt = r() < 0.3; // 반딧불
      if (m.alt) {
        m.y = anywhere ? 120 + r() * (GROUND - 120) : GROUND - r() * 200;
        m.vx = (r() - 0.5) * 16;
        m.vy = (r() - 0.5) * 10;
        m.size = 2 + r() * 1.5;
      } else {
        m.vx = 14 + r() * 26;
        m.vy = 26 + r() * 34;
        m.size = 4 + r() * 3;
      }
      break;
    case 'snow':
      m.vx = 6 + r() * 14;
      m.vy = 26 + r() * 40;
      m.size = 1.5 + r() * 2.5;
      break;
    case 'rain':
      m.vx = -110 - r() * 40;
      m.vy = 700 + r() * 260;
      m.size = 1;
      m.x = r() * (W + 300);
      if (!anywhere) m.y = -40 - r() * 80;
      break;
    case 'ash':
      m.alt = r() < 0.2; // 불티
      if (m.alt) {
        m.y = anywhere ? r() * H : H + 10;
        m.vx = 6 + r() * 14;
        m.vy = -(30 + r() * 40);
      } else {
        m.vx = 8 + r() * 16;
        m.vy = 14 + r() * 24;
      }
      m.size = 2 + r() * 1.5;
      break;
    case 'embers':
      m.alt = r() < 0.25; // 내려앉는 재
      if (m.alt) {
        m.vx = 10 + r() * 16;
        m.vy = 16 + r() * 22;
      } else {
        m.y = anywhere ? r() * H : H + 10;
        m.vx = (r() - 0.5) * 30;
        m.vy = -(40 + r() * 70);
      }
      m.size = 2 + r() * 2;
      break;
  }
  return m;
}

/** 입자를 dt(초)만큼 움직인다 */
export function stepWeather(w: WeatherState, dt: number): void {
  const decay = Math.exp(-3 * dt);
  for (let i = 0; i < w.motes.length; i++) {
    const m = w.motes[i];
    m.age += dt;
    m.rot += m.spin * dt;
    const sway = w.kind === 'leaves' && !m.alt ? Math.sin(m.age * 1.8 + m.phase) * 26 : w.kind === 'snow' ? Math.sin(m.age * 1.3 + m.phase) * 14 : w.kind === 'embers' && !m.alt ? Math.sin(m.age * 3 + m.phase) * 18 : 0;
    if (w.kind === 'leaves' && m.alt) {
      // 반딧불은 제자리 근처를 맴돈다
      m.vx += Math.sin(m.age * 0.9 + m.phase) * 6 * dt;
      m.vy += Math.cos(m.age * 0.7 + m.phase) * 6 * dt;
    }
    m.x += (m.vx + sway + m.kx) * dt;
    m.y += (m.vy + m.ky) * dt;
    m.kx *= decay;
    m.ky *= decay;
    const rising = m.vy < 0;
    const gone = m.x < -100 || m.x > W + 100 || (rising ? m.y < -20 : m.y > (w.kind === 'rain' ? GROUND + 30 : H + 20)) || (w.kind === 'leaves' && m.alt && m.age > 14);
    if (gone) w.motes[i] = spawn(w, false);
  }
}

/** 강한 타격: 그 자리 둘레의 입자가 바깥으로 흩어진다 */
export function gust(w: WeatherState | null, x: number, y: number, power: number): void {
  if (!w) return;
  for (const m of w.motes) {
    const dx = m.x - x;
    const dy = m.y - y;
    const dist = Math.hypot(dx, dy);
    if (dist > 320 || dist < 1) continue;
    const k = power * (1 - dist / 320);
    m.kx += (dx / dist) * k;
    m.ky += (dy / dist) * k * 0.7;
  }
}

const LEAF = ['#5f6e32', '#8a6a2a', '#4a5a2a', '#a07a34'];

/** 반딧불 빛(한 번 그려 둔다) */
let fireflyGlow: HTMLCanvasElement | null = null;
function fireflySprite(): HTMLCanvasElement {
  if (fireflyGlow) return fireflyGlow;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 32;
  const c = cv.getContext('2d')!;
  const g = c.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(230,255,150,1)');
  g.addColorStop(1, 'rgba(160,220,90,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, 32, 32);
  fireflyGlow = cv;
  return cv;
}

/** density: 화면 품질에 따라 그릴 입자 비율(1 전부 · 0.5 절반 · 0 없음) */
export function drawWeather(ctx: CanvasRenderingContext2D, w: WeatherState | null, front: boolean, now: number, density = 1): void {
  if (!w || density <= 0) return;
  const every = density >= 1 ? 1 : Math.round(1 / density);
  ctx.save();
  for (let i = 0; i < w.motes.length; i += every) {
    const m = w.motes[i];
    if (m.front !== front) continue;
    switch (w.kind) {
      case 'leaves':
        if (m.alt) {
          const a = 0.35 + 0.45 * Math.max(0, Math.sin(now / 420 + m.phase * 3));
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = a;
          ctx.drawImage(fireflySprite(), m.x - m.size * 4, m.y - m.size * 4, m.size * 8, m.size * 8);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
        } else {
          ctx.save();
          ctx.translate(m.x, m.y);
          ctx.rotate(m.rot);
          ctx.fillStyle = LEAF[Math.floor(m.tone * LEAF.length)];
          ctx.globalAlpha = front ? 0.9 : 0.6;
          ctx.fillRect(-m.size / 2, -m.size * 0.28, m.size, m.size * 0.56);
          ctx.restore();
        }
        break;
      case 'snow':
        ctx.globalAlpha = front ? 0.9 : 0.55;
        ctx.fillStyle = '#f2f8ff';
        ctx.fillRect(m.x, m.y, m.size * (front ? 1.4 : 1), m.size * (front ? 1.4 : 1));
        break;
      case 'rain':
        ctx.globalAlpha = front ? 0.45 : 0.25;
        ctx.strokeStyle = '#b8c8ff';
        ctx.lineWidth = front ? 1.5 : 1;
        ctx.beginPath();
        ctx.moveTo(m.x, m.y);
        ctx.lineTo(m.x - (m.vx + m.kx) * 0.03, m.y - (m.vy + m.ky) * 0.03);
        ctx.stroke();
        if (m.y > GROUND - 6 && front) {
          // 땅에 튀는 빗방울
          ctx.fillStyle = 'rgba(190,205,255,0.35)';
          ctx.fillRect(m.x - 3, GROUND + 4, 6, 1);
        }
        break;
      case 'ash':
      case 'embers': {
        const ember = w.kind === 'embers' ? !m.alt : m.alt;
        if (ember) {
          const a = 0.5 + 0.5 * Math.sin(now / 90 + m.phase * 5);
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 0.5 + 0.4 * a;
          ctx.fillStyle = m.tone > 0.5 ? '#ffb347' : '#ff7a2a';
          ctx.fillRect(m.x, m.y, m.size, m.size);
          ctx.globalAlpha = 0.18 * a;
          ctx.fillRect(m.x - m.size, m.y - m.size, m.size * 3, m.size * 3);
          ctx.globalCompositeOperation = 'source-over';
        } else {
          ctx.globalAlpha = front ? 0.7 : 0.45;
          ctx.fillStyle = m.tone > 0.5 ? '#8a8790' : '#5d5a62';
          ctx.fillRect(m.x, m.y, m.size, m.size);
        }
        break;
      }
    }
  }
  ctx.restore();
}

/* ───────────── 대사 말풍선 ───────────── */

export interface Bubble {
  who: 'player' | 'foe';
  text: string;
  born: number;
  life: number;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width > max && cur) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

/** 말풍선: 하운은 한지 빛, 적은 붉은 먹빛. 머리 위에 튀어나왔다가 사라진다 */
const BUBBLE_PAD = 12;
const bubbleCache = new Map<string, { cv: HTMLCanvasElement; bw: number; bh: number }>();
/** 말풍선 판(그림자·테두리·글자)을 대사마다 한 번 그려 둔다 */
function bubbleArt(text: string, player: boolean, u: number): { cv: HTMLCanvasElement; bw: number; bh: number } {
  const key = `${player ? 'p' : 'f'}:${u.toFixed(2)}:${text}`;
  const hit = bubbleCache.get(key);
  if (hit) return hit;
  if (bubbleCache.size > 80) bubbleCache.clear();
  const cv = document.createElement('canvas');
  const c = cv.getContext('2d')!;
  const font = `700 ${Math.round(17 * u)}px "Nanum Myeongjo", "Song Myung", serif`;
  c.font = font;
  const lines = wrap(c, text, 220 * u);
  const tw = Math.max(...lines.map((l) => c.measureText(l).width));
  const lh = 22 * u;
  const bw = tw + 26;
  const bh = lines.length * lh + 16;
  cv.width = Math.ceil(bw + BUBBLE_PAD * 2);
  cv.height = Math.ceil(bh + BUBBLE_PAD * 2);
  c.translate(BUBBLE_PAD, BUBBLE_PAD);
  c.beginPath();
  c.roundRect(0, 0, bw, bh, 10);
  c.fillStyle = player ? 'rgba(243,234,214,0.96)' : 'rgba(34,14,14,0.94)';
  c.shadowColor = 'rgba(0,0,0,0.5)';
  c.shadowBlur = 8;
  c.fill();
  c.shadowBlur = 0;
  c.lineWidth = 2;
  c.strokeStyle = player ? '#3a2c1c' : '#b0453a';
  c.stroke();
  c.font = font;
  c.fillStyle = player ? '#2a2016' : '#ffe9e0';
  c.textAlign = 'center';
  c.textBaseline = 'top';
  lines.forEach((l, i) => c.fillText(l, bw / 2, 9 + i * lh));
  const art = { cv, bw, bh };
  bubbleCache.set(key, art);
  return art;
}

/** zoom: 화면에 줄여 보이는 비율(휴대폰이면 글자를 키운다) */
export function drawBubbles(ctx: CanvasRenderingContext2D, bubbles: Bubble[], now: number, foeScale: number, zoom = 1): void {
  const u = Math.max(1, Math.min(1.8, zoom * 0.62));
  for (const b of bubbles) {
    const el = now - b.born;
    if (el < 0 || el > b.life) continue;
    const pop = el < 140 ? 0.85 + 0.15 * (el / 140) : 1;
    const alpha = el > b.life - 260 ? (b.life - el) / 260 : Math.min(1, el / 80);
    const player = b.who === 'player';
    const ax = player ? PLAYER_X - 6 : FOE_X + 14;
    const ay = player ? GROUND - 262 : Math.max(100, GROUND - 272 * foeScale);
    const art = bubbleArt(b.text, player, u);
    // 꼬리 끝이 머리 위(ax, ay)에 오게, 판은 화면 안으로 민다
    const x = Math.max(10, Math.min(W - 10 - art.bw, ax - art.bw / 2));
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(ax, ay);
    ctx.scale(pop, pop);
    ctx.translate(-ax, -ay);
    ctx.drawImage(art.cv, x - BUBBLE_PAD, ay - 14 - art.bh - BUBBLE_PAD);
    // 꼬리(판이 밀려도 머리를 가리키게 따로 그린다)
    ctx.beginPath();
    ctx.moveTo(ax - 8, ay - 15);
    ctx.lineTo(ax, ay);
    ctx.lineTo(ax + 8, ay - 15);
    ctx.closePath();
    ctx.fillStyle = player ? 'rgba(243,234,214,0.96)' : 'rgba(34,14,14,0.94)';
    ctx.fill();
    ctx.restore();
  }
}

/* ───────────── 적별 결정타 ───────────── */

export interface Finisher {
  def: FinisherDef;
  /** Codex fx_gyeol_finisher_<적 id> */
  sprite: string;
  born: number;
}

const FIN_COLOR: Record<FinisherDef['style'], { core: string; rgb: string }> = {
  cross: { core: '#f2f0ff', rgb: '200,190,255' },
  chain: { core: '#fff0d0', rgb: '255,150,60' },
  shatter: { core: '#f2fbff', rgb: '170,230,255' },
  shadow: { core: '#f0e0ff', rgb: '190,120,255' },
  quench: { core: '#f2fbff', rgb: '150,210,255' },
};

/** 결정타: Codex 그림이 오면 그것을 크게, 없으면 적마다 다른 코드 연출 */
export function drawFinisher(ctx: CanvasRenderingContext2D, fx: Record<string, SpriteAsset | null>, f: Finisher | null, now: number): void {
  if (!f) return;
  const e = now - f.born;
  const real = fx[f.sprite];
  if (real) {
    const n = 1 + Math.floor(e / (1000 / real.meta.fps));
    if (n > real.meta.frames) return;
    const img = real.images[n - 1];
    if (!img) return;
    const s = SCALE * 2.2;
    ctx.drawImage(img, FOE_X - (real.meta.frameW * s) / 2, CONTACT.y - (real.meta.frameH * s) / 2, real.meta.frameW * s, real.meta.frameH * s);
    return;
  }
  if (e > 1300) return;
  const cx = FOE_X;
  const cy = CONTACT.y;
  const col = FIN_COLOR[f.def.style];
  ctx.save();
  const slash = (delay: number, rot: number, len: number, thick: number) => {
    const k = (e - delay) / 420;
    if (k < 0 || k >= 1) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    const w = len * Math.min(1, k * 6);
    const g = ctx.createLinearGradient(0, -thick, 0, thick);
    g.addColorStop(0, `rgba(${col.rgb},0)`);
    g.addColorStop(0.5, `rgba(255,255,255,${1 - k})`);
    g.addColorStop(1, `rgba(${col.rgb},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(-w / 2, -thick * (1 - k * 0.7), w, thick * 2 * (1 - k * 0.7));
    ctx.restore();
  };
  switch (f.def.style) {
    case 'cross': {
      // 단영: 그림자를 X로 끊고, 검은 연기가 흩어진다
      slash(0, -0.7, 460, 12);
      slash(110, 0.7, 460, 12);
      for (let i = 0; i < 12; i++) {
        const k = Math.min(1, Math.max(0, e - 120) / 900);
        const a = (i / 12) * Math.PI * 2;
        const r = 30 + 170 * k * (0.6 + ((i * 37) % 10) / 25);
        ctx.fillStyle = `rgba(18,16,28,${0.55 * (1 - k)})`;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.7, 16 + 24 * k, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'chain': {
      // 쇄련단: 달군 사슬 고리가 조각나 사방으로 튄다
      slash(0, -0.35, 420, 10);
      const t = Math.max(0, e - 60) / 1000;
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2 + 0.2;
        const v = 260 + ((i * 53) % 9) * 30;
        const x = cx + Math.cos(a) * v * t;
        const y = cy + Math.sin(a) * v * t - 120 * t + 420 * t * t;
        const k = Math.min(1, t / 1.1);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(t * 9 + i);
        ctx.strokeStyle = `rgba(255,${150 - k * 90},${60 - k * 40},${1 - k})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(0, 0, 9, 5, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      if (e < 300) {
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 140);
        g.addColorStop(0, `rgba(255,170,80,${0.7 * (1 - e / 300)})`);
        g.addColorStop(1, 'rgba(255,120,40,0)');
        ctx.fillStyle = g;
        ctx.fillRect(cx - 140, cy - 140, 280, 280);
      }
      break;
    }
    case 'shatter': {
      // 빙결파: 얼음 갑옷이 결대로 갈라져 조각이 터진다
      slash(0, -1.2, 380, 9);
      const t = Math.max(0, e - 80) / 1000;
      const k = Math.min(1, t / 1.1);
      for (let i = 0; i < 22; i++) {
        const a = (i / 22) * Math.PI * 2 + (i % 3) * 0.2;
        const v = 200 + ((i * 41) % 11) * 26;
        const x = cx + Math.cos(a) * v * t;
        const y = cy + Math.sin(a) * v * t * 0.8 + 380 * t * t;
        const s = 6 + (i % 4) * 3;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(t * 6 * (i % 2 ? 1 : -1) + a);
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = i % 3 ? '#bfeaff' : '#ffffff';
        ctx.strokeStyle = '#5fb8e6';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, -s);
        ctx.lineTo(s * 0.6, s * 0.7);
        ctx.lineTo(-s * 0.6, s * 0.5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = `rgba(220,245,255,${0.8 * (1 - k)})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, 30 + 260 * Math.min(1, t * 2), 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'shadow': {
      // 영멸: 보랏빛 잔상 세 번이 엇갈려 베고, 그림자가 먹물처럼 흩어진다
      slash(0, -0.4, 420, 9);
      slash(80, 0.35, 420, 9);
      slash(160, -1.15, 380, 11);
      const k = Math.min(1, Math.max(0, e - 200) / 900);
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + 0.5;
        const r = 40 + 150 * k;
        ctx.fillStyle = `rgba(40,10,60,${0.6 * (1 - k)})`;
        ctx.beginPath();
        ctx.ellipse(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.6, 22 * (1 - k * 0.5), 10, a, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'quench': {
      // 멸화일섬: 하늘에서 내리그은 푸른 일섬이 불을 가르고, 불티가 터졌다가 김으로 식는다
      const k = Math.min(1, e / 500);
      if (e < 500) {
        ctx.globalCompositeOperation = 'lighter';
        const w = 34 * (1 - k) + 3;
        const g = ctx.createLinearGradient(cx - w, 0, cx + w, 0);
        g.addColorStop(0, 'rgba(120,190,255,0)');
        g.addColorStop(0.5, `rgba(255,255,255,${1 - k})`);
        g.addColorStop(1, 'rgba(120,190,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(cx - w, 0, w * 2, GROUND + 20);
        ctx.globalCompositeOperation = 'source-over';
      }
      const t = e / 1000;
      for (let i = 0; i < 30; i++) {
        const a = (i / 30) * Math.PI * 2;
        const v = 220 + ((i * 29) % 7) * 40;
        const kk = Math.min(1, t / 0.7);
        ctx.fillStyle = `rgba(255,${160 + (i % 3) * 30},70,${1 - kk})`;
        ctx.fillRect(cx + Math.cos(a) * v * t, cy + Math.sin(a) * v * t + 200 * t * t, 4, 4);
      }
      for (let i = 0; i < 8; i++) {
        const st = Math.max(0, e - 300 - i * 60) / 900;
        if (st <= 0 || st >= 1) continue;
        ctx.fillStyle = `rgba(220,226,235,${0.35 * (1 - st)})`;
        ctx.beginPath();
        ctx.arc(cx + (i - 4) * 18 + Math.sin(st * 5 + i) * 10, cy + 40 - 220 * st, 14 + 30 * st, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
  }
  ctx.restore();
}

/** 결정타 이름: 금빛 먹 띠 위에 한자와 이름(화면 위쪽 가운데) */
export function drawFinisherName(ctx: CanvasRenderingContext2D, f: Finisher | null, now: number): void {
  if (!f) return;
  const el = now - f.born;
  const life = 1500;
  if (el < 0 || el > life) return;
  const inK = Math.min(1, el / 180);
  const alpha = el < life - 300 ? 1 : (life - el) / 300;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(W / 2, 132);
  ctx.scale(0.9 + 0.1 * inK, 0.9 + 0.1 * inK);
  const w = 360;
  const h = 54;
  const g = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
  g.addColorStop(0, 'rgba(60,40,6,0)');
  g.addColorStop(0.15, 'rgba(70,46,8,0.9)');
  g.addColorStop(0.85, 'rgba(70,46,8,0.9)');
  g.addColorStop(1, 'rgba(60,40,6,0)');
  ctx.fillStyle = g;
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.strokeStyle = 'rgba(255,214,120,0.7)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-w / 2 + 30, -h / 2);
  ctx.lineTo(w / 2 - 30, -h / 2);
  ctx.moveTo(-w / 2 + 30, h / 2);
  ctx.lineTo(w / 2 - 30, h / 2);
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '800 30px "Song Myung", "Nanum Myeongjo", serif';
  ctx.shadowColor = '#ffd27a';
  ctx.shadowBlur = 16;
  ctx.lineWidth = 5;
  ctx.strokeStyle = 'rgba(0,0,0,0.9)';
  const label = f.def.name;
  ctx.strokeText(label, 0, 1);
  ctx.fillStyle = '#ffe9b0';
  ctx.fillText(label, 0, 1);
  ctx.restore();
}

/* ───────────── 칼 맞부딪힘 겨루기 ───────────── */

/** 겨루기 중 두 칼이 맞붙은 자리가 밀린 만큼(오른쪽 + = 하운이 민다) */
export function clashShift(d: Duel): number {
  return d.clash ? (d.clash.balance - 0.5) * 80 : 0;
}

/** 맞붙은 칼날의 불꽃: Codex fx_gyeol_clash(반복)가 오면 그것, 없으면 깜빡이는 별빛 */
export function drawClashSparks(ctx: CanvasRenderingContext2D, d: Duel, real: SpriteAsset | null, now: number): void {
  if (!d.clash) return;
  const x = CONTACT.x + clashShift(d);
  const y = CONTACT.y - 10;
  if (real) {
    const n = 1 + (Math.floor(now / (1000 / real.meta.fps)) % real.meta.frames);
    const img = real.images[n - 1];
    if (img) {
      const s = SCALE * 1.4;
      ctx.drawImage(img, x - (real.meta.frameW * s) / 2, y - (real.meta.frameH * s) / 2, real.meta.frameW * s, real.meta.frameH * s);
    }
    return;
  }
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const fl = 0.7 + 0.3 * Math.sin(now / 30);
  const g = ctx.createRadialGradient(x, y, 0, x, y, 70);
  g.addColorStop(0, `rgba(255,255,255,${0.9 * fl})`);
  g.addColorStop(0.3, `rgba(255,214,140,${0.5 * fl})`);
  g.addColorStop(1, 'rgba(255,170,80,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - 70, y - 70, 140, 140);
  ctx.strokeStyle = `rgba(255,240,200,${0.8 * fl})`;
  ctx.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.floor(now / 50) * 0.7;
    const r = 26 + ((i * 17 + Math.floor(now / 50)) % 5) * 9;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * 8, y + Math.sin(a) * 8);
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    ctx.stroke();
  }
  ctx.restore();
}

/** 겨루기 막대: 왼쪽 푸른빛이 하운, 오른쪽 붉은빛이 적. 가운데 금을 넘겨 두면 이긴다 */
export function drawClashBar(ctx: CanvasRenderingContext2D, d: Duel, now: number): void {
  const c = d.clash;
  if (!c) return;
  const w = 340;
  const h = 16;
  const x = W / 2 - w / 2;
  // 화면 아래쪽 땅 위(위쪽은 적 말풍선·체력 막대 자리)
  const y = GROUND + 36;
  const el = d.t - c.start;
  const pop = 1 + 0.25 * Math.max(0, 1 - el / 160);
  ctx.save();
  ctx.translate(W / 2, y);
  ctx.scale(pop, pop);
  ctx.translate(-W / 2, -y);
  ctx.textAlign = 'center';
  ctx.font = '900 34px "Song Myung", "Nanum Myeongjo", serif';
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.strokeText('겨루기!', W / 2, y - 12);
  const tg = ctx.createLinearGradient(0, y - 42, 0, y - 8);
  tg.addColorStop(0, '#ffffff');
  tg.addColorStop(1, '#ffc94a');
  ctx.fillStyle = tg;
  ctx.fillText('겨루기!', W / 2, y - 12);
  // 막대
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.beginPath();
  ctx.roundRect(x - 4, y - 4, w + 8, h + 8, 8);
  ctx.fill();
  const split = x + w * c.balance;
  const lg = ctx.createLinearGradient(x, 0, split, 0);
  lg.addColorStop(0, '#2f6fb8');
  lg.addColorStop(1, '#bfe4ff');
  ctx.fillStyle = lg;
  ctx.fillRect(x, y, split - x, h);
  const rg = ctx.createLinearGradient(split, 0, x + w, 0);
  rg.addColorStop(0, '#ffb0a0');
  rg.addColorStop(1, '#a8231a');
  ctx.fillStyle = rg;
  ctx.fillRect(split, y, x + w - split, h);
  // 가운데 금
  ctx.fillStyle = '#ffe08a';
  ctx.fillRect(W / 2 - 1, y - 6, 2, h + 12);
  // 맞붙은 자리의 불꽃
  ctx.globalCompositeOperation = 'lighter';
  const fl = 0.6 + 0.4 * Math.sin(now / 35);
  const g = ctx.createRadialGradient(split, y + h / 2, 0, split, y + h / 2, 22);
  g.addColorStop(0, `rgba(255,255,255,${fl})`);
  g.addColorStop(1, 'rgba(255,200,120,0)');
  ctx.fillStyle = g;
  ctx.fillRect(split - 22, y + h / 2 - 22, 44, 44);
  ctx.globalCompositeOperation = 'source-over';
  // 남은 시간
  const left = Math.max(0, (c.end - d.t) / (c.end - c.start));
  ctx.fillStyle = 'rgba(255,240,200,0.7)';
  ctx.fillRect(x, y + h + 7, w * left, 3);
  ctx.font = '800 18px "Song Myung", "Nanum Myeongjo", serif';
  ctx.lineWidth = 4;
  const pulse = 0.65 + 0.35 * Math.sin(now / 70);
  ctx.globalAlpha = pulse;
  ctx.strokeText('J · K 연타!', W / 2, y + h + 28);
  ctx.fillStyle = '#fff1d6';
  ctx.fillText('J · K 연타!', W / 2, y + h + 28);
  ctx.restore();
}

/* ───────────── 위기·집중 화면 ───────────── */

/** 위기(배수의 진): 화면 가장자리가 붉게 맥박친다(심장 소리와 같은 박자) */
/** 가장자리 어둠·붉음(원형 그라데이션)은 한 번 그려 두고 투명도만 바꾼다 */
const vignettes = new Map<string, HTMLCanvasElement>();
function vignette(color: string, inner: number): HTMLCanvasElement {
  const key = `${color}:${inner}`;
  let cv = vignettes.get(key);
  if (cv) return cv;
  cv = document.createElement('canvas');
  cv.width = W / 2;
  cv.height = H / 2;
  const c = cv.getContext('2d')!;
  c.scale(0.5, 0.5);
  const g = c.createRadialGradient(W / 2, H / 2, H * inner, W / 2, H / 2, W * 0.62);
  g.addColorStop(0, `rgba(${color},0)`);
  g.addColorStop(1, `rgba(${color},1)`);
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  vignettes.set(key, cv);
  return cv;
}

export function drawCrisis(ctx: CanvasRenderingContext2D, beat: number, now: number): void {
  const pulse = Math.exp(-(now - beat) / 200);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.globalAlpha = 0.32 + 0.3 * pulse;
  ctx.drawImage(vignette('150,8,8', 0.35), 0, 0, W, H);
  ctx.restore();
}

/** 집중(심안): 화면이 푸르스름하게 가라앉고, 하운에게서 먹빛 고리가 번진다. 끝날 즈음 옅어진다 */
export function drawFocus(ctx: CanvasRenderingContext2D, d: Duel, now: number): void {
  if (d.t >= d.focusUntil || d.result) return;
  const left = (d.focusUntil - d.t) / d.data.rules.focusDuration;
  const k = Math.min(1, left * 4);
  ctx.save();
  ctx.fillStyle = `rgba(14,28,52,${0.28 * k})`;
  ctx.fillRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = true;
  ctx.globalAlpha = 0.55 * k;
  ctx.drawImage(vignette('0,6,20', 0.3), 0, 0, W, H);
  ctx.globalAlpha = 1;
  for (let i = 0; i < 3; i++) {
    const p = ((now / 1400 + i / 3) % 1);
    ctx.strokeStyle = `rgba(170,210,255,${0.3 * (1 - p) * k})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(PLAYER_X, GROUND - 120, 40 + 420 * p, 26 + 260 * p, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.font = '800 22px "Song Myung", serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = `rgba(200,225,255,${0.85 * k})`;
  ctx.fillText('심안', W / 2, H - 22);
  ctx.restore();
}

/* ───────────── 수련장 판정 폭 막대(2026-11-10) ───────────── */

export interface PracticeMark {
  /** 타격 몇 ms 전에 눌렀나(null: 누르지 않았거나 너무 이르다) */
  lead: number | null;
  kind: 'perfect' | 'excellent' | 'good' | 'miss';
  born: number;
}

const MARK_COLOR: Record<PracticeMark['kind'], string> = { perfect: '#ffe08a', excellent: '#ffb24a', good: '#8fc0ff', miss: '#ff6a5a' };

/**
 * 화면 아래 가운데: 오른쪽 끝이 타격 순간, 왼쪽으로 갈수록 이르다. 막기(파랑)·EXCELLENT(주황)·PERFECT(금) 폭과
 * 최근 누른 자리(점), 평균 시점을 보인다. 폭은 지금 규칙(난이도 포함)을 그대로 쓴다.
 */
export function drawPracticeBar(ctx: CanvasRenderingContext2D, rules: { parry: number; perfect: number; guard: number }, p: { marks: PracticeMark[]; drill: string }, now: number): void {
  const span = Math.max(rules.guard + 80, 500);
  // 왼쪽 아래 하운 이름 판·체력 막대를 비켜 조금 오른쪽에
  const w = 400;
  const x1 = W / 2 + 40 + w / 2;
  const x0 = x1 - w;
  // 화면 아래는 버튼이 겹쳐 뜬다(2026-11-11) — 적 이름판 아래로
  const y = 150;
  const xAt = (lead: number) => x1 - (Math.min(span, Math.max(0, lead)) / span) * w;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(x0 - 8, y - 22, w + 46, 50);
  const band = (from: number, to: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(xAt(to), y - 6, xAt(from) - xAt(to), 12);
  };
  band(rules.parry, rules.guard, 'rgba(110,160,230,0.55)');
  band(rules.perfect, rules.parry, 'rgba(255,170,70,0.75)');
  band(0, rules.perfect, 'rgba(255,224,138,0.95)');
  // 타격 순간
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x1, y - 12, 2, 24);
  ctx.font = '700 12px "IBM Plex Sans KR", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(230,236,255,0.85)';
  ctx.fillText('막기', (xAt(rules.guard) + xAt(rules.parry)) / 2, y + 22);
  ctx.fillText('EXCELLENT', (xAt(rules.parry) + xAt(rules.perfect)) / 2, y + 22);
  ctx.fillText('PERF', (xAt(rules.perfect) + x1) / 2, y + 22);
  ctx.fillText('타격', x1, y - 14);
  // 누른 자리: 최근 것일수록 진하다, 막 찍힌 것은 크게
  const n = p.marks.length;
  p.marks.forEach((m, i) => {
    const age = (now - m.born) / 1000;
    const alpha = 0.25 + 0.75 * ((i + 1) / n);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = MARK_COLOR[m.kind];
    if (m.lead === null) {
      // 누르지 않았거나(늦음) 너무 이르다: 막대 오른쪽 밖에 ×
      ctx.font = '900 16px sans-serif';
      ctx.fillText('×', x1 + 18, y + 6);
    } else {
      const r = age < 0.25 ? 7 - age * 12 : 4;
      ctx.beginPath();
      ctx.arc(xAt(m.lead), y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  ctx.globalAlpha = 1;
  const leads = p.marks.filter((m) => m.lead !== null).slice(-8).map((m) => m.lead!);
  ctx.textAlign = 'left';
  ctx.font = '700 14px "Nanum Myeongjo", serif';
  ctx.fillStyle = '#f2ead8';
  ctx.fillText(`수련: ${p.drill}`, x0 - 4, y - 30);
  if (leads.length) {
    const avg = Math.round(leads.reduce((a, b) => a + b, 0) / leads.length);
    ctx.textAlign = 'right';
    ctx.fillText(`평균 타격 ${avg}ms 전에 눌렀다`, x1 + 36, y - 30);
  }
  ctx.restore();
}

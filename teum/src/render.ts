// 「틈」 그리기(2026-11-18): 엔진 상태를 캔버스에. 그림은 「천외귀환」·「결」 것을 그대로(대기·쓰러짐·기술 이펙트),
// 걷기·바닥 타일·아이콘은 Codex 그림이 오면 쓰고(realOnly) 오기 전에는 코드로 그린다(GAME_DESIGN 7절).
import { loadSprite, spriteSource, type SpriteAsset } from '../../src/render/assets';
import { FOES, RUN, WEAPONS, xpNeed, stat, type FxEvent, type State } from './sim';

type Anim = SpriteAsset | null;
export interface Art {
  hero: { idle: Anim; walk: Anim; death: Anim };
  foes: Map<string, { idle: Anim; death: Anim }>;
  fx: Map<string, Anim>;
  tiles: Map<string, Anim>;
  icons: Anim;
}

const real = async (id: string): Promise<Anim> => (spriteSource(id) === 'sprites' ? loadSprite(id) : null);

export async function loadArt(s: State): Promise<Art> {
  const sp = s.hero.sprite;
  const [idle, walk, death] = await Promise.all([loadSprite(`${sp}_idle`), real(`${sp}_walk`), real(`${sp}_death`)]);
  const foes = new Map<string, { idle: Anim; death: Anim }>();
  await Promise.all(
    [...FOES.values()].map(async (f) => {
      const [i, d] = await Promise.all([loadSprite(`${f.sprite}_idle`), real(`${f.sprite}_death`)]);
      foes.set(f.id, { idle: i, death: d });
    }),
  );
  const fxIds = new Set<string>(['fx_hit_slash', 'fx_hit_shock']);
  for (const w of WEAPONS.values()) if (w.fx) fxIds.add(w.fx), fxIds.add(w.fx.replace(/_a$/, '_b'));
  fxIds.add(`fx_gyeol_tech_${s.hero.ult.id}_a`);
  fxIds.add(`fx_gyeol_tech_${s.hero.ult.id}_b`);
  const fx = new Map<string, Anim>();
  await Promise.all([...fxIds].map(async (id) => fx.set(id, await real(id))));
  const tiles = new Map<string, Anim>();
  await Promise.all(RUN.acts.map(async (a) => tiles.set(a.ground, await real(a.ground))));
  return { hero: { idle, walk, death }, foes, fx, tiles, icons: await real('icons_teum') };
}

/** 잠깐 남는 연출(베기 자국·고리·낙뢰·숫자·쓰러짐) */
interface Mark {
  e: FxEvent;
  born: number;
  /** 쓰러짐: 그림·방향 */
  flip?: boolean;
}
export interface View {
  marks: Mark[];
  banner: { text: string; born: number; kind: string } | null;
  shake: number;
  hurtFlash: number;
  ultFlash: { born: number; fx: string; color: string } | null;
}
export const emptyView = (): View => ({ marks: [], banner: null, shake: 0, hurtFlash: -9, ultFlash: null });

/** 엔진이 이번 칸에 낸 사건을 연출로 옮긴다 */
export function absorb(v: View, s: State, now: number): void {
  for (const e of s.events) {
    if (e.type === 'event' || e.type === 'act') v.banner = { text: e.type === 'act' ? e.name : e.text, born: now, kind: e.type === 'act' ? 'act' : e.kind };
    else if (e.type === 'chest') v.banner = { text: e.text, born: now, kind: 'chest' };
    else if (e.type === 'hurt') {
      v.hurtFlash = now;
      v.shake = Math.max(v.shake, 6);
    } else if (e.type === 'ult') {
      v.ultFlash = { born: now, fx: e.fx, color: e.color };
      v.shake = 16;
    } else if (e.type === 'hit') {
      // 숫자는 치명과 큰 피해 위주로(많으면 화면이 글자로 덮인다)
      if (e.crit || e.damage >= 40 || v.marks.length < 120) v.marks.push({ e, born: now });
    } else if (e.type === 'kill') {
      v.marks.push({ e, born: now, flip: e.x < s.player.x });
      if (e.rank) v.shake = Math.max(v.shake, e.rank === 'boss' ? 14 : 8);
    } else v.marks.push({ e, born: now });
  }
  s.events.length = 0;
  if (v.marks.length > 260) v.marks.splice(0, v.marks.length - 260);
}

function frame(a: SpriteAsset, ms: number, offset = 0): CanvasImageSource | null {
  const n = Math.floor((ms + offset) / (1000 / a.meta.fps)) % a.meta.frames;
  return a.images[n] ?? null;
}

function drawSpriteAt(ctx: CanvasRenderingContext2D, a: SpriteAsset, img: CanvasImageSource, x: number, y: number, scale: number, flip: boolean, rot = 0, alpha = 1): void {
  const w = a.meta.frameW * scale;
  const h = a.meta.frameH * scale;
  const [ax, ay] = a.meta.anchor;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(img, -w * ax, -h * ay, w, h);
  ctx.restore();
}

/** 바닥: Codex 타일이 오면 깔고, 오기 전에는 칸마다 고정된 무늬(돌·풀·금)를 코드로 */
function drawGround(ctx: CanvasRenderingContext2D, s: State, art: Art, cx: number, cy: number, W: number, H: number): void {
  const act = RUN.acts[s.act];
  const tile = art.tiles.get(act.ground);
  ctx.fillStyle = act.color[0];
  ctx.fillRect(cx - W / 2, cy - H / 2, W, H);
  if (tile) {
    const img = tile.images[0];
    const tw = tile.meta.frameW;
    const th = tile.meta.frameH;
    for (let x = Math.floor((cx - W / 2) / tw) * tw; x < cx + W / 2; x += tw) for (let y = Math.floor((cy - H / 2) / th) * th; y < cy + H / 2; y += th) ctx.drawImage(img, x, y, tw, th);
    return;
  }
  const cell = 64;
  ctx.fillStyle = act.color[1];
  for (let gx = Math.floor((cx - W / 2) / cell); gx <= Math.ceil((cx + W / 2) / cell); gx++)
    for (let gy = Math.floor((cy - H / 2) / cell); gy <= Math.ceil((cy + H / 2) / cell); gy++) {
      const h = ((gx * 73856093) ^ (gy * 19349663)) >>> 0;
      if (h % 5 > 1) continue;
      const x = gx * cell + (h % 37);
      const y = gy * cell + ((h >> 6) % 41);
      const r = 2 + (h % 4);
      ctx.fillRect(x, y, r * 2, r);
      if (h % 23 === 0) {
        // 틈의 금: 가늘고 붉은 금
        ctx.strokeStyle = s.act === 2 ? 'rgba(200,40,60,0.35)' : 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 18, y + 9);
        ctx.lineTo(x + 30, y + 4);
        ctx.stroke();
      }
    }
}

const ICON = { gem: 1, chest: 2, food: 3, magnet: 4 } as const;
function drawIcon(ctx: CanvasRenderingContext2D, art: Art, kind: keyof typeof ICON, x: number, y: number, size: number): boolean {
  const a = art.icons;
  const img = a?.images[ICON[kind] - 1];
  if (!a || !img) return false;
  ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
  return true;
}

export function draw(ctx: CanvasRenderingContext2D, s: State, art: Art, v: View, now: number, W: number, H: number, zoom: number, dpr = 1): void {
  const p = s.player;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  const shake = v.shake > 0.3 ? v.shake : 0;
  v.shake *= 0.88;
  const sx = shake ? (Math.sin(now * 0.07) * shake) / 2 : 0;
  const sy = shake ? (Math.cos(now * 0.09) * shake) / 2 : 0;
  // 세계 좌표 → 화면: 인물이 가운데
  ctx.translate(W / 2 + sx, H / 2 + sy);
  ctx.scale(zoom, zoom);
  ctx.translate(-p.x, -p.y);
  const vw = W / zoom;
  const vh = H / zoom;
  drawGround(ctx, s, art, p.x, p.y, vw + 80, vh + 80);
  const inView = (x: number, y: number, m = 80) => Math.abs(x - p.x) < vw / 2 + m && Math.abs(y - p.y) < vh / 2 + m;

  // 장판(화살비·낙석)
  for (const z of s.zones) {
    const k = Math.max(0, Math.min(1, (z.until - s.t) / 0.4));
    ctx.fillStyle = hexA(z.color, 0.16 * k + 0.06);
    ctx.strokeStyle = hexA(z.color, 0.5 * k);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(z.x, z.y, z.r, z.r * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // 떨어지는 것들
    for (let i = 0; i < 4; i++) {
      const ph = ((now / 260 + i * 0.27 + z.x * 0.01) % 1 + 1) % 1;
      const ox = Math.sin(i * 2.3 + z.y) * z.r * 0.6;
      ctx.strokeStyle = hexA(z.color, 0.8 * (1 - ph));
      ctx.beginPath();
      ctx.moveTo(z.x + ox, z.y - 90 + ph * 90 - 20);
      ctx.lineTo(z.x + ox, z.y - 90 + ph * 90);
      ctx.stroke();
    }
  }
  // 결 조각·물건
  for (const g of s.gems) {
    if (!inView(g.x, g.y)) continue;
    const big = g.xp >= 10;
    if (drawIcon(ctx, art, 'gem', g.x, g.y, big ? 22 : 14)) continue;
    ctx.fillStyle = big ? '#ffd27a' : g.xp >= 3 ? '#7fd6c8' : '#8fd3ff';
    ctx.beginPath();
    const r = big ? 8 : 5;
    ctx.moveTo(g.x, g.y - r);
    ctx.lineTo(g.x + r * 0.7, g.y);
    ctx.lineTo(g.x, g.y + r);
    ctx.lineTo(g.x - r * 0.7, g.y);
    ctx.closePath();
    ctx.fill();
  }
  for (const it of s.items) {
    const bob = Math.sin(now / 200) * 3;
    if (drawIcon(ctx, art, it.kind, it.x, it.y - 10 + bob, 30)) continue;
    ctx.fillStyle = it.kind === 'chest' ? '#c89a3a' : it.kind === 'food' ? '#f1efe6' : '#4fb4ff';
    ctx.strokeStyle = '#1d2433';
    ctx.lineWidth = 2;
    if (it.kind === 'chest') {
      ctx.fillRect(it.x - 12, it.y - 20 + bob, 24, 16);
      ctx.strokeRect(it.x - 12, it.y - 20 + bob, 24, 16);
      ctx.fillStyle = '#ffe08a';
      ctx.fillRect(it.x - 2, it.y - 15 + bob, 4, 5);
    } else {
      ctx.beginPath();
      ctx.arc(it.x, it.y - 10 + bob, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  // 그림자 무리(아래쪽이 앞) + 쓰러짐 + 인물을 y 순서로
  const draws: { y: number; fn: () => void }[] = [];
  for (const f of s.foes) {
    if (!inView(f.x, f.y, 140)) continue;
    const a = art.foes.get(f.def.id)?.idle;
    draws.push({
      y: f.y,
      fn: () => {
        // 발밑 그림자
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(f.x, f.y, f.def.radius * 0.9, f.def.radius * 0.35, 0, 0, Math.PI * 2);
        ctx.fill();
        const img = a ? frame(a, now, f.uid * 97) : null;
        const bob = Math.abs(Math.sin(now / 140 + f.uid)) * 3;
        if (a && img) {
          // 「천외귀환」 적은 왼쪽을 본다: 인물이 오른쪽에 있으면 뒤집는다
          const flip = p.x > f.x;
          drawSpriteAt(ctx, a, img, f.x, f.y - bob, f.def.scale, flip, Math.sin(now / 160 + f.uid) * 0.05);
          if (s.t - f.hitAt < 0.08) {
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            drawSpriteAt(ctx, a, img, f.x, f.y - bob, f.def.scale, flip, 0, 0.55);
            ctx.restore();
          }
        } else {
          ctx.fillStyle = s.t - f.hitAt < 0.08 ? '#ffffff' : '#3a2a40';
          ctx.beginPath();
          ctx.arc(f.x, f.y - f.def.radius, f.def.radius, 0, Math.PI * 2);
          ctx.fill();
        }
        if (s.t < f.slowUntil) {
          ctx.fillStyle = 'rgba(159,230,255,0.25)';
          ctx.beginPath();
          ctx.ellipse(f.x, f.y - 2, f.def.radius, f.def.radius * 0.4, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        // 정예·보스 체력 띠
        if (f.def.rank) {
          const w = f.def.radius * 2.4;
          ctx.fillStyle = 'rgba(0,0,0,0.6)';
          ctx.fillRect(f.x - w / 2, f.y + 6, w, 5);
          ctx.fillStyle = f.def.rank === 'boss' ? '#e0303a' : '#ffb02e';
          ctx.fillRect(f.x - w / 2, f.y + 6, (w * Math.max(0, f.hp)) / f.maxHp, 5);
        }
      },
    });
  }
  for (const m of v.marks) {
    if (m.e.type !== 'kill') continue;
    const e = m.e;
    const fa = art.foes.get(e.foe);
    const age = now - m.born;
    if (!fa) continue;
    const scale = FOE_SCALE.get(e.foe) ?? 0.45;
    draws.push({
      y: e.y - 1,
      fn: () => {
        if (fa.death) {
          const n = Math.min(fa.death.meta.frames, 1 + Math.floor(age / (1000 / Math.max(10, fa.death.meta.fps))));
          const alpha = age > 900 ? Math.max(0, 1 - (age - 900) / 400) : 1;
          const img = fa.death.images[n - 1];
          if (img) drawSpriteAt(ctx, fa.death, img, e.x, e.y, scale, !m.flip, 0, alpha);
        } else if (fa.idle) {
          const k = Math.min(1, age / 350);
          const img = fa.idle.images[0];
          if (img) drawSpriteAt(ctx, fa.idle, img, e.x, e.y, scale * (1 - 0.3 * k), !m.flip, (m.flip ? -1 : 1) * k * 1.2, 1 - k);
        }
      },
    });
  }
  draws.push({ y: p.y, fn: () => drawHero(ctx, s, art, now) });
  draws.sort((a, b) => a.y - b.y);
  for (const d of draws) d.fn();

  // 둘레 칼·결계(무공 상태에서 바로 계산)
  const area = stat.area(s);
  for (const w of s.weapons) {
    const d = WEAPONS.get(w.id)!;
    const L = d.levels[Math.min(w.lv, d.levels.length) - 1];
    if (d.kind === 'orbit') {
      const period = L.cooldown * stat.haste(s);
      const on = L.duration >= period || s.t % period < L.duration;
      if (!on) continue;
      const R = 72 * L.area * area;
      for (let i = 0; i < L.count; i++) {
        const a = s.t * L.speed + (i / L.count) * Math.PI * 2;
        const bx = p.x + Math.cos(a) * R;
        const by = p.y - 24 + Math.sin(a) * R * 0.8;
        const g = ctx.createRadialGradient(bx, by, 0, bx, by, 18 * area);
        g.addColorStop(0, 'rgba(255,255,255,0.95)');
        g.addColorStop(0.45, hexA(d.color, 0.8));
        g.addColorStop(1, hexA(d.color, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(bx, by, 18 * area, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (d.kind === 'aura') {
      const R = 90 * L.area * area;
      ctx.strokeStyle = hexA(d.color, 0.35 + 0.1 * Math.sin(now / 200));
      ctx.fillStyle = hexA(d.color, 0.07);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - 10, R, R * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
  // 탄
  for (const sh of s.shots) {
    if (!inView(sh.x, sh.y)) continue;
    const ang = Math.atan2(sh.vy, sh.vx);
    ctx.save();
    ctx.translate(sh.x, sh.y);
    ctx.rotate(ang);
    const len = sh.weapon ? sh.r * 2.6 : sh.r * 1.6;
    const g = ctx.createLinearGradient(-len, 0, sh.r, 0);
    g.addColorStop(0, hexA(sh.color, 0));
    g.addColorStop(0.7, hexA(sh.color, 0.85));
    g.addColorStop(1, '#ffffff');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(-len / 2 + sh.r / 2, 0, len / 2 + sh.r / 2, sh.r * (sh.weapon && WEAPONS.get(sh.weapon)?.kind === 'wave' ? 1 : 0.6), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // 잠깐 남는 연출
  for (const m of v.marks) {
    const e = m.e;
    const age = (now - m.born) / 1000;
    if (e.type === 'slash') {
      const k = age / 0.18;
      if (k > 1) continue;
      ctx.strokeStyle = hexA(e.color, 0.9 * (1 - k));
      ctx.lineWidth = 10 * (1 - k) + 2;
      ctx.beginPath();
      ctx.arc(e.x, e.y - 20, e.r * (0.7 + 0.3 * k), e.angle - e.arc / 2, e.angle + e.arc / 2);
      ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${0.8 * (1 - k)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(e.x, e.y - 20, e.r * (0.62 + 0.3 * k), e.angle - e.arc / 2.6, e.angle + e.arc / 2.6);
      ctx.stroke();
    } else if (e.type === 'nova') {
      const k = age / 0.45;
      if (k > 1) continue;
      ctx.strokeStyle = hexA(e.color, 0.8 * (1 - k));
      ctx.lineWidth = 8 * (1 - k) + 2;
      ctx.beginPath();
      ctx.ellipse(e.x, e.y - 10, e.r * k, e.r * k * 0.75, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (e.type === 'strike') {
      const k = age / 0.35;
      if (k > 1) continue;
      const fx = e.fx ? art.fx.get(e.fx) : null;
      if (fx) {
        const n = Math.min(fx.meta.frames - 1, Math.floor(k * fx.meta.frames));
        const img = fx.images[n];
        const size = e.r * 3.2;
        if (img) ctx.drawImage(img, e.x - size / 2, e.y - size * 0.75, size, size);
      } else {
        ctx.fillStyle = hexA(e.color, 0.75 * (1 - k));
        ctx.fillRect(e.x - 6 * (1 - k) - 2, e.y - 400, 12 * (1 - k) + 4, 400);
        ctx.beginPath();
        ctx.ellipse(e.x, e.y, e.r * (0.5 + k), e.r * 0.4 * (0.5 + k), 0, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (e.type === 'graze') {
      const k = age / 0.3;
      if (k > 1) continue;
      ctx.strokeStyle = `rgba(255,236,170,${1 - k})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(e.x, e.y - 20, RUN.dash.graze.radius * k, 0, Math.PI * 2);
      ctx.stroke();
    } else if (e.type === 'hit') {
      const k = age / 0.6;
      if (k > 1) continue;
      ctx.font = `${e.crit ? 800 : 600} ${e.crit ? 18 : 13}px "IBM Plex Sans KR", sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = e.crit ? `rgba(255,214,90,${1 - k})` : `rgba(255,255,255,${0.85 * (1 - k)})`;
      ctx.strokeStyle = `rgba(0,0,0,${0.7 * (1 - k)})`;
      ctx.lineWidth = 3;
      const y = e.y - 44 - k * 22;
      ctx.strokeText(String(e.damage), e.x, y);
      ctx.fillText(String(e.damage), e.x, y);
    }
  }
  v.marks = v.marks.filter((m) => now - m.born < (m.e.type === 'kill' ? 1400 : 700));
  // 천외귀운: 「결」 기술 이펙트를 화면 가운데 크게
  if (v.ultFlash) {
    const age = now - v.ultFlash.born;
    const a = art.fx.get(v.ultFlash.fx);
    const b = art.fx.get(v.ultFlash.fx.replace(/_a$/, '_b'));
    if (a) {
      const fps = a.meta.fps || 20;
      const n = Math.floor(age / (1000 / fps));
      const sheet = n < a.meta.frames ? a : b;
      const idx = n < a.meta.frames ? n : n - a.meta.frames;
      const img = sheet && idx < sheet.meta.frames ? sheet.images[idx] : null;
      const size = Math.min(vw, vh) * 1.1;
      if (img) ctx.drawImage(img, p.x - size / 2, p.y - size / 2 - 30, size, size);
    }
    if (age > 1600) v.ultFlash = null;
  }

  // 화면 고정(HUD): 글자 크기는 CSS 픽셀 기준(고해상도 화면에서도 같은 크기)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  W /= dpr;
  H /= dpr;
  if (v.ultFlash) {
    const age = now - v.ultFlash.born;
    ctx.fillStyle = hexA(v.ultFlash.color, Math.max(0, 0.45 - age / 1200));
    ctx.fillRect(0, 0, W, H);
  }
  const hk = (now - v.hurtFlash) / 300;
  if (hk < 1) {
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
    g.addColorStop(0, 'rgba(160,0,0,0)');
    g.addColorStop(1, `rgba(160,0,0,${0.45 * (1 - hk)})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  drawHud(ctx, s, v, now, W, H);
}

const FOE_SCALE = new Map<string, number>();
export function rememberFoeScales(list: Iterable<{ id: string; scale: number }>): void {
  for (const f of list) FOE_SCALE.set(f.id, f.scale);
}

function drawHero(ctx: CanvasRenderingContext2D, s: State, art: Art, now: number): void {
  const p = s.player;
  const flip = Math.cos(p.facing) < 0;
  const scale = 0.62;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, 22, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  const dashing = s.t < p.dashUntil;
  const blink = s.t < p.hurtUntil && Math.floor(now / 60) % 2 === 0;
  const walk = p.moving && art.hero.walk;
  const a = s.result === 'lose' && art.hero.death ? art.hero.death : walk ? art.hero.walk : art.hero.idle;
  if (a) {
    const img = s.result === 'lose' && art.hero.death ? a.images[a.images.length - 1] : frame(a, now);
    if (img) {
      // 걷기 그림이 오기 전: 대기 그림을 통통 튀며 앞으로 기울인다
      const bob = p.moving && !walk ? Math.abs(Math.sin(now / 90)) * 5 : 0;
      const tilt = p.moving && !walk ? (flip ? -1 : 1) * (0.08 + Math.sin(now / 90) * 0.04) : 0;
      if (dashing) for (let i = 1; i <= 3; i++) drawSpriteAt(ctx, a, img, p.x - p.dashX * i * 16, p.y - p.dashY * i * 16, scale, flip, tilt, 0.18 * (4 - i));
      drawSpriteAt(ctx, a, img, p.x, p.y - bob, scale, flip, tilt, blink ? 0.4 : 1);
    }
  }
  // 머리 위 체력 띠
  const w = 46;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(p.x - w / 2, p.y + 8, w, 5);
  ctx.fillStyle = p.hp / p.maxHp < 0.3 ? '#ff5a4a' : '#6fdc6a';
  ctx.fillRect(p.x - w / 2, p.y + 8, (w * p.hp) / p.maxHp, 5);
}

function drawHud(ctx: CanvasRenderingContext2D, s: State, v: View, now: number, W: number, H: number): void {
  const font = (px: number, wt = 700) => `${wt} ${px}px "IBM Plex Sans KR", "Nanum Myeongjo", sans-serif`;
  // 경험 띠
  const need = xpNeed(s.level);
  ctx.fillStyle = 'rgba(8,10,16,0.75)';
  ctx.fillRect(0, 0, W, 14);
  ctx.fillStyle = '#4fb4ff';
  ctx.fillRect(0, 0, (W * Math.min(1, s.xp / need)) | 0, 14);
  ctx.font = font(11);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#fff';
  ctx.fillText(`Lv.${s.level}`, W - 8, 11);
  // 시계
  const t = Math.floor(s.t);
  const over = s.t > RUN.length;
  ctx.textAlign = 'center';
  ctx.font = font(30, 800);
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  const clock = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  ctx.strokeText(clock, W / 2, 50);
  ctx.fillStyle = over ? '#ff5a4a' : '#f3ead8';
  ctx.fillText(clock, W / 2, 50);
  ctx.font = font(12, 600);
  ctx.fillStyle = 'rgba(243,234,216,0.75)';
  const next = RUN.events.find((e) => e.kind === 'boss' && e.at > s.t);
  ctx.fillText(over ? '틈 폭주 — 그림자가 점점 세게 친다' : next ? `${RUN.acts[s.act].name} · 다음 매듭 ${Math.floor(next.at / 60)}:${String(next.at % 60).padStart(2, '0')}` : RUN.acts[s.act].name, W / 2, 68);
  // 왼쪽 위: 무공·심법
  ctx.textAlign = 'left';
  let y = 34;
  ctx.font = font(12, 700);
  for (const w of s.weapons) {
    const d = WEAPONS.get(w.id)!;
    const label = `${d.name} ${d.evolved ? '★' : `Lv.${w.lv}`}`;
    ctx.fillStyle = 'rgba(8,10,16,0.6)';
    ctx.fillRect(8, y - 13, ctx.measureText(label).width + 16, 18);
    ctx.fillStyle = d.color;
    ctx.fillRect(8, y - 13, 3, 18);
    ctx.fillStyle = '#f3ead8';
    ctx.fillText(label, 16, y);
    y += 21;
  }
  y += 4;
  ctx.font = font(11, 600);
  const ps = [...s.passives.entries()].map(([id, lv]) => `${PASSIVE_NAME.get(id) ?? id} ${lv}`);
  // 좁은 화면(휴대폰 세로)에서는 가운데 막 이름과 겹치므로 심법 줄을 빼고 무공 칸만
  if (ps.length && W >= 560) {
    ctx.fillStyle = 'rgba(243,234,216,0.7)';
    ctx.fillText(ps.join(' · '), 10, y);
  }
  // 오른쪽 위: 쓰러뜨림
  ctx.textAlign = 'right';
  ctx.font = font(13, 700);
  ctx.fillStyle = '#f3ead8';
  ctx.fillText(`쓰러뜨림 ${s.kills}`, W - 12, 36);
  // 알림 띠
  if (v.banner) {
    const age = now - v.banner.born;
    if (age > 2600) v.banner = null;
    else {
      const a = Math.min(1, age / 200, (2600 - age) / 400);
      const boss = v.banner.kind === 'boss';
      ctx.textAlign = 'center';
      ctx.font = font(boss ? 26 : 18, 800);
      const yy = H * 0.24;
      ctx.fillStyle = `rgba(8,6,10,${0.6 * a})`;
      ctx.fillRect(0, yy - (boss ? 34 : 26), W, boss ? 48 : 36);
      ctx.fillStyle = boss ? `rgba(255,90,74,${a})` : v.banner.kind === 'chest' ? `rgba(255,224,138,${a})` : `rgba(243,234,216,${a})`;
      ctx.fillText(v.banner.text, W / 2, yy);
    }
  }
}

export let PASSIVE_NAME = new Map<string, string>();
export function rememberPassives(list: Iterable<{ id: string; name: string }>): void {
  PASSIVE_NAME = new Map([...list].map((p) => [p.id, p.name]));
}

function hexA(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, '$1$1') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, a))})`;
}

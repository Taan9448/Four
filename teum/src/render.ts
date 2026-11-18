// 「틈」 그리기(2026-11-18 2차): 지형 판 · 그림자 · 무공 · 예고 원 · 지도(오른쪽 위) · 상태창(아래).
// 그림은 「천외귀환」·「결」 것을 그대로 쓰고, Codex 그림(바닥 타일·지형 조각·소품·아이콘)은 오면 쓰고(realOnly) 오기 전에는 코드로 그린다.
import { loadSprite, spriteSource, type SpriteAsset } from '../../src/render/assets';
import { CHAPTER_LENGTH, chapterEvents, FOES, PASSIVES, RULES, WEAPONS, stat, xpNeed, type FxEvent, type ItemKind, type State } from './sim';
import { CELL, T } from './terrain';

type Anim = SpriteAsset | null;
export interface Art {
  hero: { idle: Anim; walk: Anim; death: Anim };
  foes: Map<string, { idle: Anim; death: Anim }>;
  fx: Map<string, Anim>;
  ground: Anim;
  terrain: Anim;
  props: Anim;
  icons: Anim;
  items: Anim;
  skills: Anim[];
}
export interface Options {
  shake: boolean;
  numbers: boolean;
  map: 'small' | 'large';
}

const real = async (id: string): Promise<Anim> => (spriteSource(id) === 'sprites' ? loadSprite(id) : null);

/** 무공·심법 아이콘 칸(icons_teum_skills_1·2·3, 16칸씩): 무공 순서 다음에 심법 */
export const SKILL_ICON = new Map<string, number>([...[...WEAPONS.keys()], ...[...PASSIVES.keys()]].map((id, i) => [id, i]));

export async function loadArt(s: State, sprite = s.hero.sprite): Promise<Art> {
  const [idle, walk, death] = await Promise.all([loadSprite(`${sprite}_idle`), real(`${sprite}_walk`), real(`${sprite}_death`)]);
  const foes = new Map<string, { idle: Anim; death: Anim }>();
  const ids = new Set<string>([...Object.values(s.chapter.roles).flat(), s.chapter.roles.mid, s.chapter.roles.boss]);
  for (const id of [...ids]) for (const k of FOES.get(id)?.skills ?? []) if (k.kind === 'summon') ids.add(k.foe);
  await Promise.all(
    [...ids].map(async (id) => {
      const f = FOES.get(id);
      if (!f) return;
      const [i, d] = await Promise.all([loadSprite(`${f.sprite}_idle`), real(`${f.sprite}_death`)]);
      foes.set(id, { idle: i, death: d });
    }),
  );
  const fxIds = new Set<string>();
  for (const w of WEAPONS.values()) if (w.fx) fxIds.add(w.fx), fxIds.add(w.fx.replace(/_a$/, '_b'));
  for (const id of ids) for (const k of FOES.get(id)?.skills ?? []) if ('fx' in k && k.fx) fxIds.add(k.fx);
  fxIds.add(`fx_gyeol_tech_${s.hero.ult.id}_a`);
  fxIds.add(`fx_gyeol_tech_${s.hero.ult.id}_b`);
  const fx = new Map<string, Anim>();
  await Promise.all([...fxIds].map(async (id) => fx.set(id, await real(id))));
  const [ground, terrain, props, icons, items, ...skills] = await Promise.all([real(s.chapter.ground), real(s.chapter.terrain), real('props_teum'), real('icons_teum'), real('icons_teum_items'), real('icons_teum_skills_1'), real('icons_teum_skills_2'), real('icons_teum_skills_3')]);
  return { hero: { idle, walk, death }, foes, fx, ground, terrain, props, icons, items, skills };
}

interface Mark {
  e: FxEvent;
  born: number;
  flip?: boolean;
}
export interface View {
  marks: Mark[];
  banner: { text: string; born: number; kind: string } | null;
  shake: number;
  hurtFlash: number;
  ultFlash: { born: number; fx: string; color: string } | null;
  flash: { born: number; color: string } | null;
  minimap: HTMLCanvasElement | null;
}
export const emptyView = (): View => ({ marks: [], banner: null, shake: 0, hurtFlash: -9, ultFlash: null, flash: null, minimap: null });

const ITEM_NAME: Record<ItemKind, string> = { food: '주먹밥', herb: '약초', magnet: '물지게', bomb: '벽력탄', frost: '서리 부적', gold: '금화', chest: '상자' };

export function absorb(v: View, s: State, now: number, opt: Options): void {
  for (const e of s.events) {
    if (e.type === 'event') v.banner = { text: e.text, born: now, kind: e.kind };
    else if (e.type === 'chest') v.banner = { text: e.text, born: now, kind: 'chest' };
    else if (e.type === 'hurt') {
      v.hurtFlash = now;
      if (opt.shake) v.shake = Math.max(v.shake, 6);
    } else if (e.type === 'ult') {
      v.ultFlash = { born: now, fx: e.fx, color: e.color };
      if (opt.shake) v.shake = 16;
    } else if (e.type === 'bomb') {
      v.flash = { born: now, color: '#fff2c0' };
      if (opt.shake) v.shake = 18;
    } else if (e.type === 'freeze') v.flash = { born: now, color: '#9fe6ff' };
    else if (e.type === 'item' && e.kind !== 'gold' && e.kind !== 'chest') v.banner = { text: ITEM_NAME[e.kind], born: now, kind: 'item' };
    else if (e.type === 'hit') {
      if (opt.numbers && (e.crit || e.damage >= 40 || v.marks.length < 120)) v.marks.push({ e, born: now });
    } else if (e.type === 'kill') {
      v.marks.push({ e, born: now, flip: e.x < s.player.x });
      if (e.rank && opt.shake) v.shake = Math.max(v.shake, e.rank === 'boss' ? 14 : 8);
    } else v.marks.push({ e, born: now });
  }
  s.events.length = 0;
  if (v.marks.length > 300) v.marks.splice(0, v.marks.length - 300);
}

function frame(a: SpriteAsset, ms: number, offset = 0): CanvasImageSource | null {
  return a.images[Math.floor((ms + offset) / (1000 / a.meta.fps)) % a.meta.frames] ?? null;
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

const hash = (x: number, y: number) => ((x * 73856093) ^ (y * 19349663)) >>> 0;

/** 지형: 바닥(타일·무늬) → 위험·느림·다리 → 벽(윗면 + 앞면으로 높이). 지형 조각 그림(terrain_teum_<장>)이 오면 칸마다 그 그림 */
function drawTerrain(ctx: CanvasRenderingContext2D, s: State, art: Art, x0: number, y0: number, x1: number, y1: number, now: number): void {
  const t = s.terrain;
  const [floor, floor2, wall, hazard] = s.chapter.color;
  ctx.fillStyle = floor;
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  if (art.ground) {
    const img = art.ground.images[0];
    const tw = art.ground.meta.frameW;
    const th = art.ground.meta.frameH;
    for (let x = Math.floor(x0 / tw) * tw; x < x1; x += tw) for (let y = Math.floor(y0 / th) * th; y < y1; y += th) ctx.drawImage(img, x, y, tw, th);
  }
  const cx0 = Math.max(0, Math.floor(x0 / CELL));
  const cy0 = Math.max(0, Math.floor(y0 / CELL));
  const cx1 = Math.min(t.w - 1, Math.ceil(x1 / CELL));
  const cy1 = Math.min(t.h - 1, Math.ceil(y1 / CELL));
  const piece = (n: number) => art.terrain?.images[n - 1] ?? null;
  // 바닥 무늬·위험·느림·다리
  for (let cy = cy0; cy <= cy1; cy++)
    for (let cx = cx0; cx <= cx1; cx++) {
      const c = t.cells[cy * t.w + cx];
      const x = cx * CELL;
      const y = cy * CELL;
      const h = hash(cx, cy);
      if (c === T.Floor) {
        const img = piece(h % 3 === 0 ? 2 : 1);
        if (img && !art.ground) ctx.drawImage(img, x, y, CELL, CELL);
        else if (!art.ground && h % 5 < 2) {
          ctx.fillStyle = floor2;
          ctx.fillRect(x + (h % 23), y + ((h >> 5) % 27), 4 + (h % 6), 3);
        }
      } else if (c === T.Hazard) {
        const img = piece(5);
        if (img) ctx.drawImage(img, x, y, CELL, CELL);
        else {
          ctx.fillStyle = hazard;
          ctx.globalAlpha = 0.85;
          ctx.fillRect(x, y, CELL, CELL);
          ctx.globalAlpha = 0.25 + 0.15 * Math.sin(now / 400 + cx * 0.7 + cy * 0.4);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(x + (h % 20), y + ((h >> 4) % 30), 10, 2);
          ctx.globalAlpha = 1;
        }
      } else if (c === T.Slow) {
        const img = piece(6);
        if (img) ctx.drawImage(img, x, y, CELL, CELL);
        else {
          ctx.fillStyle = 'rgba(0,0,0,0.22)';
          ctx.fillRect(x, y, CELL, CELL);
          ctx.fillStyle = floor2;
          for (let i = 0; i < 3; i++) ctx.fillRect(x + ((h >> (i * 3)) % 32), y + ((h >> (i * 4 + 2)) % 32), 6, 3);
        }
      } else if (c === T.Bridge) {
        const img = piece(7);
        if (img) ctx.drawImage(img, x, y, CELL, CELL);
        else {
          ctx.fillStyle = hazard;
          ctx.fillRect(x, y, CELL, CELL);
          ctx.fillStyle = '#6e5440';
          ctx.fillRect(x + 2, y, CELL - 4, CELL);
          ctx.fillStyle = '#4a3426';
          for (let k = 0; k < 4; k++) ctx.fillRect(x + 2, y + k * 10 + 8, CELL - 4, 2);
        }
      }
    }
  // 벽: 앞면(아래쪽이 비었으면 그림자 진 높이) + 윗면
  for (let cy = cy0; cy <= cy1; cy++)
    for (let cx = cx0; cx <= cx1; cx++) {
      if (t.cells[cy * t.w + cx] !== T.Wall) continue;
      const x = cx * CELL;
      const y = cy * CELL;
      const below = cy + 1 < t.h ? t.cells[(cy + 1) * t.w + cx] : T.Wall;
      const top = piece(3);
      const face = piece(4);
      if (below !== T.Wall) {
        if (face) ctx.drawImage(face, x, y + CELL - 14, CELL, 18);
        else {
          ctx.fillStyle = 'rgba(0,0,0,0.45)';
          ctx.fillRect(x, y + CELL - 4, CELL, 14);
          ctx.fillStyle = shade(wall, -0.35);
          ctx.fillRect(x, y + CELL - 14, CELL, 14);
        }
      }
      if (top) ctx.drawImage(top, x, y - 14, CELL, CELL);
      else {
        ctx.fillStyle = wall;
        ctx.fillRect(x, y - 14, CELL, CELL);
        const h = hash(cx, cy);
        ctx.fillStyle = shade(wall, 0.18);
        ctx.fillRect(x + (h % 14), y - 12 + ((h >> 4) % 14), 8, 4);
      }
    }
}

const ICON_IDX: Partial<Record<ItemKind | 'gem', [keyof Art, number]>> = { gem: ['icons', 1], chest: ['icons', 2], food: ['icons', 3], magnet: ['icons', 4], herb: ['items', 1], bomb: ['items', 2], frost: ['items', 3], gold: ['items', 4] };
const ITEM_COLOR: Record<ItemKind, string> = { food: '#f1efe6', herb: '#6aa84f', magnet: '#4fb4ff', bomb: '#ff6a3a', frost: '#9fe6ff', gold: '#ffd27a', chest: '#c89a3a' };
function drawItemIcon(ctx: CanvasRenderingContext2D, art: Art, kind: ItemKind | 'gem', x: number, y: number, size: number): boolean {
  const ref = ICON_IDX[kind];
  const sheet = ref ? (art[ref[0]] as Anim) : null;
  const img = sheet?.images[ref![1] - 1];
  if (!img) return false;
  ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
  return true;
}

export function draw(ctx: CanvasRenderingContext2D, s: State, art: Art, v: View, now: number, W: number, H: number, zoom: number, dpr: number, opt: Options): void {
  const p = s.player;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  const shake = v.shake > 0.3 ? v.shake : 0;
  v.shake *= 0.88;
  const sx = shake ? (Math.sin(now * 0.07) * shake) / 2 : 0;
  const sy = shake ? (Math.cos(now * 0.09) * shake) / 2 : 0;
  ctx.fillStyle = '#05040a';
  ctx.fillRect(0, 0, W, H);
  ctx.translate(W / 2 + sx, H / 2 + sy);
  ctx.scale(zoom, zoom);
  ctx.translate(-p.x, -p.y);
  const vw = W / zoom;
  const vh = H / zoom;
  drawTerrain(ctx, s, art, p.x - vw / 2 - 60, p.y - vh / 2 - 60, p.x + vw / 2 + 60, p.y + vh / 2 + 60, now);
  const inView = (x: number, y: number, m = 80) => Math.abs(x - p.x) < vw / 2 + m && Math.abs(y - p.y) < vh / 2 + m;

  // 무공 장판
  for (const z of s.zones) {
    const k = Math.max(0, Math.min(1, (z.until - s.t) / 0.4));
    ctx.fillStyle = hexA(z.color, 0.16 * k + 0.06);
    ctx.strokeStyle = hexA(z.color, 0.5 * k);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(z.x, z.y, z.r, z.r * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    for (let i = 0; i < 4; i++) {
      const ph = (((now / 260 + i * 0.27 + z.x * 0.01) % 1) + 1) % 1;
      const ox = Math.sin(i * 2.3 + z.y) * z.r * 0.6;
      ctx.strokeStyle = hexA(z.color, 0.8 * (1 - ph));
      ctx.beginPath();
      ctx.moveTo(z.x + ox, z.y - 110 + ph * 90);
      ctx.lineTo(z.x + ox, z.y - 90 + ph * 90);
      ctx.stroke();
    }
  }
  // 예고 원(내려찍기·낙석): 안쪽이 차오르면 떨어진다
  for (const m of s.slams) {
    const k = Math.min(1, (s.t - m.born) / Math.max(0.01, m.at - m.born));
    ctx.strokeStyle = hexA(m.color, 0.85);
    ctx.fillStyle = hexA(m.color, 0.12 + 0.2 * k);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(m.x, m.y, m.r, m.r * 0.65, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = hexA(m.color, 0.3);
    ctx.beginPath();
    ctx.ellipse(m.x, m.y, m.r * k, m.r * 0.65 * k, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // 결 조각·물건
  for (const g of s.gems) {
    if (!inView(g.x, g.y)) continue;
    const big = g.xp >= 10;
    if (drawItemIcon(ctx, art, 'gem', g.x, g.y, big ? 22 : 14)) continue;
    ctx.fillStyle = big ? '#ffd27a' : g.xp >= 3 ? '#7fd6c8' : '#8fd3ff';
    const r = big ? 8 : 5;
    ctx.beginPath();
    ctx.moveTo(g.x, g.y - r);
    ctx.lineTo(g.x + r * 0.7, g.y);
    ctx.lineTo(g.x, g.y + r);
    ctx.lineTo(g.x - r * 0.7, g.y);
    ctx.closePath();
    ctx.fill();
  }
  for (const it of s.items) {
    if (!inView(it.x, it.y)) continue;
    const bob = Math.sin(now / 200 + it.x) * 3;
    // 빛기둥: 멀리서도 보이게
    if (it.kind === 'chest') {
      const g = ctx.createLinearGradient(it.x, it.y - 120, it.x, it.y);
      g.addColorStop(0, 'rgba(255,224,138,0)');
      g.addColorStop(1, 'rgba(255,224,138,0.35)');
      ctx.fillStyle = g;
      ctx.fillRect(it.x - 10, it.y - 120, 20, 120);
    }
    const prop = it.kind === 'chest' ? art.props?.images[3] : null;
    if (prop) ctx.drawImage(prop, it.x - 22, it.y - 36 + bob, 44, 44);
    else if (!drawItemIcon(ctx, art, it.kind, it.x, it.y - 12 + bob, it.kind === 'chest' ? 34 : 26)) {
      ctx.fillStyle = ITEM_COLOR[it.kind];
      ctx.strokeStyle = '#1d2433';
      ctx.lineWidth = 2;
      if (it.kind === 'chest') {
        ctx.fillRect(it.x - 13, it.y - 22 + bob, 26, 18);
        ctx.strokeRect(it.x - 13, it.y - 22 + bob, 26, 18);
        ctx.fillStyle = '#ffe08a';
        ctx.fillRect(it.x - 2, it.y - 17 + bob, 4, 6);
      } else {
        ctx.beginPath();
        ctx.arc(it.x, it.y - 12 + bob, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#1d2433';
        ctx.font = '700 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(ITEM_NAME[it.kind][0], it.x, it.y - 8 + bob);
      }
    }
  }

  // 그림자·소품·쓰러짐·인물: y 순서
  const draws: { y: number; fn: () => void }[] = [];
  for (const pr of s.props) {
    if (!pr.alive || !inView(pr.x, pr.y)) continue;
    draws.push({
      y: pr.y,
      fn: () => {
        const img = art.props?.images[pr.kind];
        if (img) return void ctx.drawImage(img, pr.x - 20, pr.y - 34, 40, 40);
        // 대체: 항아리 · 등불
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(pr.x, pr.y, 11, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        if (pr.kind === 0) {
          ctx.fillStyle = '#8f5a3a';
          ctx.beginPath();
          ctx.ellipse(pr.x, pr.y - 11, 10, 12, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#5a3420';
          ctx.fillRect(pr.x - 6, pr.y - 25, 12, 4);
        } else {
          ctx.fillStyle = '#3a3440';
          ctx.fillRect(pr.x - 2, pr.y - 30, 4, 30);
          ctx.fillStyle = `rgba(255,200,110,${0.75 + 0.2 * Math.sin(now / 180 + pr.x)})`;
          ctx.fillRect(pr.x - 7, pr.y - 40, 14, 12);
        }
      },
    });
  }
  for (const f of s.foes) {
    if (!inView(f.x, f.y, 140)) continue;
    const a = art.foes.get(f.def.id)?.idle;
    draws.push({
      y: f.y,
      fn: () => {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(f.x, f.y, f.def.radius * 0.9, f.def.radius * 0.35, 0, 0, Math.PI * 2);
        ctx.fill();
        const img = a ? frame(a, now, f.uid * 97) : null;
        const frozen = s.t < s.freezeUntil;
        const bob = frozen ? 0 : Math.abs(Math.sin(now / 140 + f.uid)) * 3 + (f.def.fly ? 10 + Math.sin(now / 300 + f.uid) * 4 : 0);
        const fuse = f.fuseAt && Math.floor(now / 80) % 2 === 0;
        if (a && img) {
          const flip = p.x > f.x;
          drawSpriteAt(ctx, a, img, f.x, f.y - bob, f.def.scale, flip, frozen ? 0 : Math.sin(now / 160 + f.uid) * 0.05);
          if (s.t - f.hitAt < 0.08 || fuse) {
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
        if (frozen || s.t < f.slowUntil) {
          ctx.fillStyle = frozen ? 'rgba(159,230,255,0.4)' : 'rgba(159,230,255,0.25)';
          ctx.beginPath();
          ctx.ellipse(f.x, f.y - 2, f.def.radius, f.def.radius * 0.4, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        if (f.def.rank === 'elite') {
          const w = f.def.radius * 2.4;
          ctx.fillStyle = 'rgba(0,0,0,0.6)';
          ctx.fillRect(f.x - w / 2, f.y + 6, w, 5);
          ctx.fillStyle = '#ffb02e';
          ctx.fillRect(f.x - w / 2, f.y + 6, (w * Math.max(0, f.hp)) / f.maxHp, 5);
        }
      },
    });
  }
  for (const m of v.marks) {
    if (m.e.type !== 'kill') continue;
    const e = m.e;
    const fa = art.foes.get(e.foe);
    const def = FOES.get(e.foe);
    if (!fa || !def) continue;
    const age = now - m.born;
    draws.push({
      y: e.y - 1,
      fn: () => {
        if (fa.death) {
          const n = Math.min(fa.death.meta.frames, 1 + Math.floor(age / (1000 / Math.max(10, fa.death.meta.fps))));
          const img = fa.death.images[n - 1];
          if (img) drawSpriteAt(ctx, fa.death, img, e.x, e.y, def.scale, !m.flip, 0, age > 900 ? Math.max(0, 1 - (age - 900) / 400) : 1);
        } else if (fa.idle) {
          const k = Math.min(1, age / 350);
          const img = fa.idle.images[0];
          if (img) drawSpriteAt(ctx, fa.idle, img, e.x, e.y, def.scale * (1 - 0.3 * k), !m.flip, (m.flip ? -1 : 1) * k * 1.2, 1 - k);
        }
      },
    });
  }
  draws.push({ y: p.y, fn: () => drawHero(ctx, s, art, now) });
  draws.sort((a, b) => a.y - b.y);
  for (const d of draws) d.fn();

  // 둘레 칼·결계
  const area = stat.area(s);
  for (const w of s.weapons) {
    const d = WEAPONS.get(w.id)!;
    const L = d.levels[Math.min(w.lv, d.levels.length) - 1];
    if (d.kind === 'orbit') {
      const period = L.cooldown * stat.haste(s);
      if (!(L.duration >= period || s.t % period < L.duration)) continue;
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
    ctx.save();
    ctx.translate(sh.x, sh.y);
    ctx.rotate(Math.atan2(sh.vy, sh.vx));
    const len = sh.weapon ? sh.r * 2.6 : sh.r * 1.8;
    const g = ctx.createLinearGradient(-len, 0, sh.r, 0);
    g.addColorStop(0, hexA(sh.color, 0));
    g.addColorStop(0.7, hexA(sh.color, 0.9));
    g.addColorStop(1, '#ffffff');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(-len / 2 + sh.r / 2, 0, len / 2 + sh.r / 2, sh.r * (sh.weapon && WEAPONS.get(sh.weapon)?.kind === 'wave' ? 1 : 0.65), 0, 0, Math.PI * 2);
    ctx.fill();
    if (!sh.weapon) {
      // 적 탄은 테두리로 또렷하게
      ctx.strokeStyle = 'rgba(20,10,10,0.8)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
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
    } else if (e.type === 'strike' || e.type === 'skill') {
      const k = age / 0.45;
      if (k > 1) continue;
      const fx = e.fx ? art.fx.get(e.fx) : null;
      const r = e.type === 'strike' ? e.r : 70;
      if (fx) {
        const n = Math.min(fx.meta.frames - 1, Math.floor(k * fx.meta.frames));
        const img = fx.images[n];
        const size = r * 3.2;
        if (img) ctx.drawImage(img, e.x - size / 2, e.y - size * 0.7, size, size);
      } else {
        ctx.fillStyle = hexA(e.color, 0.7 * (1 - k));
        if (e.type === 'strike') ctx.fillRect(e.x - 6 * (1 - k) - 2, e.y - 400, 12 * (1 - k) + 4, 400);
        ctx.beginPath();
        ctx.ellipse(e.x, e.y, r * (0.5 + k), r * 0.45 * (0.5 + k), 0, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (e.type === 'burst' || e.type === 'bomb' || e.type === 'prop') {
      const life = e.type === 'bomb' ? 0.6 : 0.3;
      const k = age / life;
      if (k > 1) continue;
      const r = e.type === 'bomb' ? RULES.items.bomb.radius : e.type === 'burst' ? e.r : 26;
      ctx.strokeStyle = e.type === 'prop' ? `rgba(220,180,120,${1 - k})` : `rgba(255,170,90,${1 - k})`;
      ctx.lineWidth = e.type === 'bomb' ? 10 * (1 - k) + 2 : 4;
      ctx.beginPath();
      ctx.ellipse(e.x, e.y - 10, r * k, r * 0.7 * k, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (e.type === 'graze') {
      const k = age / 0.3;
      if (k > 1) continue;
      ctx.strokeStyle = `rgba(255,236,170,${1 - k})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(e.x, e.y - 20, RULES.dash.graze.radius * k, 0, Math.PI * 2);
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
  if (v.ultFlash) {
    const age = now - v.ultFlash.born;
    const a = art.fx.get(v.ultFlash.fx);
    const b = art.fx.get(v.ultFlash.fx.replace(/_a$/, '_b'));
    if (a) {
      const n = Math.floor(age / (1000 / (a.meta.fps || 20)));
      const sheet = n < a.meta.frames ? a : b;
      const idx = n < a.meta.frames ? n : n - a.meta.frames;
      const img = sheet && idx < sheet.meta.frames ? sheet.images[idx] : null;
      const size = Math.min(vw, vh) * 1.1;
      if (img) ctx.drawImage(img, p.x - size / 2, p.y - size / 2 - 30, size, size);
    }
    if (age > 1600) v.ultFlash = null;
  }

  // ── 화면 고정(CSS 픽셀) ──
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cw = W / dpr;
  const ch = H / dpr;
  if (s.t < s.slowUntil) {
    ctx.fillStyle = 'rgba(220,240,255,0.10)';
    ctx.fillRect(0, 0, cw, ch);
  }
  if (s.t < s.freezeUntil) {
    ctx.fillStyle = 'rgba(159,230,255,0.12)';
    ctx.fillRect(0, 0, cw, ch);
  }
  for (const f of [v.ultFlash && { born: v.ultFlash.born, color: v.ultFlash.color, life: 1200 }, v.flash && { ...v.flash, life: 500 }]) {
    if (!f) continue;
    const a = Math.max(0, 0.45 - (now - f.born) / f.life);
    if (a <= 0) continue;
    ctx.fillStyle = hexA(f.color, a);
    ctx.fillRect(0, 0, cw, ch);
  }
  const hk = (now - v.hurtFlash) / 300;
  if (hk < 1) {
    const g = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.3, cw / 2, ch / 2, Math.max(cw, ch) * 0.7);
    g.addColorStop(0, 'rgba(160,0,0,0)');
    g.addColorStop(1, `rgba(160,0,0,${0.45 * (1 - hk)})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cw, ch);
  }
  drawHud(ctx, s, art, v, now, cw, ch, opt);
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
  const dead = s.result === 'lose' && art.hero.death;
  const a = dead ? art.hero.death : walk ? art.hero.walk : art.hero.idle;
  if (!a) return;
  const img = dead ? a.images[a.images.length - 1] : frame(a, now);
  if (!img) return;
  const bob = p.moving && !walk ? Math.abs(Math.sin(now / 90)) * 5 : 0;
  const tilt = p.moving && !walk ? (flip ? -1 : 1) * (0.08 + Math.sin(now / 90) * 0.04) : 0;
  if (dashing) for (let i = 1; i <= 3; i++) drawSpriteAt(ctx, a, img, p.x - p.dashX * i * 16, p.y - p.dashY * i * 16, scale, flip, tilt, 0.18 * (4 - i));
  drawSpriteAt(ctx, a, img, p.x, p.y - bob, scale, flip, tilt, blink ? 0.4 : 1);
  const w = 46;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(p.x - w / 2, p.y + 8, w, 5);
  ctx.fillStyle = p.hp / p.maxHp < 0.3 ? '#ff5a4a' : '#6fdc6a';
  ctx.fillRect(p.x - w / 2, p.y + 8, (w * p.hp) / p.maxHp, 5);
}

/** 오른쪽 위 지도: 지형은 장마다 한 번 그려 두고, 점(인물·그림자·보스·상자·물건)만 매번 */
function drawMinimap(ctx: CanvasRenderingContext2D, s: State, v: View, x: number, y: number, size: number, now: number): void {
  const t = s.terrain;
  if (!v.minimap) {
    const c = document.createElement('canvas');
    c.width = t.w;
    c.height = t.h;
    const g = c.getContext('2d')!;
    const img = g.createImageData(t.w, t.h);
    const [floor, , wall, hazard] = s.chapter.color.map(rgb);
    for (let i = 0; i < t.w * t.h; i++) {
      const k = t.cells[i];
      const col = k === T.Wall ? wall : k === T.Hazard ? hazard : k === T.Bridge ? [110, 84, 64] : k === T.Slow ? floor.map((n) => n * 0.7) : floor;
      img.data.set([col[0], col[1], col[2], 255], i * 4);
    }
    g.putImageData(img, 0, 0);
    v.minimap = c;
  }
  ctx.save();
  ctx.fillStyle = 'rgba(8,8,12,0.75)';
  ctx.fillRect(x - 3, y - 3, size + 6, size + 6);
  ctx.strokeStyle = 'rgba(243,234,216,0.45)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 3.5, y - 3.5, size + 7, size + 7);
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = 0.9;
  ctx.drawImage(v.minimap, x, y, size, size);
  ctx.globalAlpha = 1;
  const k = size / (t.w * CELL);
  const dot = (wx: number, wy: number, r: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(x + wx * k - r / 2, y + wy * k - r / 2, r, r);
  };
  for (const f of s.foes) if (!f.def.rank) dot(f.x, f.y, 2, '#ff5a4a');
  for (const it of s.items) dot(it.x, it.y, it.kind === 'chest' ? 5 : 3, it.kind === 'chest' ? '#ffd27a' : '#f3ead8');
  for (const f of s.foes) if (f.def.rank) dot(f.x, f.y, f.boss ? 8 : 6, f.boss ? '#ff2a3a' : '#ffb02e');
  // 화면에 보이는 범위
  ctx.strokeStyle = 'rgba(243,234,216,0.35)';
  ctx.strokeRect(x + (s.player.x - s.view) * k, y + (s.player.y - s.view * 0.6) * k, s.view * 2 * k, s.view * 1.2 * k);
  dot(s.player.x, s.player.y, 5 + Math.sin(now / 200), '#7fd6ff');
  ctx.restore();
}

/** 아래 상태창: 무공 6칸 · 심법 6칸(아이콘 · Lv 점) */
function drawStatusBar(ctx: CanvasRenderingContext2D, s: State, art: Art, x: number, y: number, slot: number): void {
  const slots = RULES.player.slots;
  const gap = 4;
  const totalW = (slots.weapons + slots.passives) * (slot + gap) + 14;
  ctx.fillStyle = 'rgba(8,8,12,0.72)';
  ctx.fillRect(x - 8, y - 8, totalW, slot + 22);
  ctx.strokeStyle = 'rgba(243,234,216,0.25)';
  ctx.strokeRect(x - 8.5, y - 8.5, totalW, slot + 22);
  const cellAt2 = (i: number, extra: number) => x + i * (slot + gap) + extra;
  const drawSlot = (cx: number, id: string | null, lv: number, max: number, color: string, label: string, evolved: boolean) => {
    ctx.fillStyle = id ? 'rgba(30,26,36,0.95)' : 'rgba(30,26,36,0.4)';
    ctx.fillRect(cx, y, slot, slot);
    ctx.strokeStyle = id ? hexA(color, 0.9) : 'rgba(243,234,216,0.15)';
    ctx.strokeRect(cx + 0.5, y + 0.5, slot - 1, slot - 1);
    if (!id) return;
    const idx = SKILL_ICON.get(id) ?? -1;
    const sheet = art.skills[Math.floor(idx / 16)];
    const img = sheet?.images[idx % 16];
    if (img) ctx.drawImage(img, cx + 3, y + 3, slot - 6, slot - 6);
    else {
      ctx.fillStyle = hexA(color, 0.35);
      ctx.fillRect(cx + 3, y + 3, slot - 6, slot - 6);
      ctx.fillStyle = '#f3ead8';
      ctx.font = `800 ${Math.round(slot * 0.42)}px "Nanum Myeongjo", serif`;
      ctx.textAlign = 'center';
      ctx.fillText(label, cx + slot / 2, y + slot * 0.66);
    }
    // Lv 점(각성은 별)
    ctx.textAlign = 'center';
    if (evolved) {
      ctx.fillStyle = '#ffd27a';
      ctx.font = '800 11px sans-serif';
      ctx.fillText('★', cx + slot / 2, y + slot + 11);
      return;
    }
    for (let i = 0; i < max; i++) {
      ctx.fillStyle = i < lv ? '#ffd27a' : 'rgba(243,234,216,0.2)';
      ctx.fillRect(cx + slot / 2 - (max * 6) / 2 + i * 6, y + slot + 4, 4, 4);
    }
  };
  for (let i = 0; i < slots.weapons; i++) {
    const w = s.weapons[i];
    const d = w ? WEAPONS.get(w.id)! : null;
    drawSlot(cellAt2(i, 0), w?.id ?? null, w?.lv ?? 0, d?.levels.length ?? 5, d?.color ?? '#888', d?.name[0] ?? '', !!d?.evolved);
  }
  const ps = [...s.passives.entries()];
  for (let i = 0; i < slots.passives; i++) {
    const [id, lv] = ps[i] ?? [null, 0];
    const pd = id ? PASSIVES.get(id) : null;
    drawSlot(cellAt2(slots.weapons + i, 14), id, lv, pd?.max ?? 5, '#c8b4ff', pd?.name[0] ?? '', false);
  }
  ctx.fillStyle = 'rgba(243,234,216,0.35)';
  ctx.fillRect(cellAt2(slots.weapons, 4), y + 4, 2, slot - 8);
}

function drawHud(ctx: CanvasRenderingContext2D, s: State, art: Art, v: View, now: number, W: number, H: number, opt: Options): void {
  const font = (px: number, wt = 700) => `${wt} ${px}px "IBM Plex Sans KR", "Nanum Myeongjo", sans-serif`;
  const need = xpNeed(s.level);
  ctx.fillStyle = 'rgba(8,10,16,0.75)';
  ctx.fillRect(0, 0, W, 12);
  ctx.fillStyle = '#4fb4ff';
  ctx.fillRect(0, 0, (W * Math.min(1, s.xp / need)) | 0, 12);
  ctx.font = font(10);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#fff';
  ctx.fillText(`Lv.${s.level}`, 6, 10);
  // 시계: 장에 남은 시간
  const left = Math.max(0, CHAPTER_LENGTH - s.t);
  const over = s.t > CHAPTER_LENGTH;
  const clock = over ? `+${fmt(s.t - CHAPTER_LENGTH)}` : fmt(left);
  ctx.textAlign = 'center';
  ctx.font = font(28, 800);
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.strokeText(clock, W / 2, 46);
  ctx.fillStyle = over ? '#ff5a4a' : '#f3ead8';
  ctx.fillText(clock, W / 2, 46);
  ctx.font = font(12, 600);
  ctx.fillStyle = 'rgba(243,234,216,0.78)';
  const next = chapterEvents(s.chapter).find((e) => e.at > s.t && (e.kind === 'bigwave' || e.kind === 'mid' || e.kind === 'boss'));
  const nextName = next ? (next.kind === 'bigwave' ? '빅웨이브' : next.kind === 'mid' ? '중간 보스' : '보스') : '';
  // 좁은 화면(휴대폰 세로)에서는 지도와 겹치지 않게 다음 이정표만
  const narrow = W < 520;
  ctx.fillText(over ? '틈 폭주 — 보스를 쓰러뜨려라' : `${narrow ? '' : s.chapter.name}${next ? `${narrow ? '' : ' · '}${nextName}까지 ${fmt(next.at - s.t)}` : ''}`, narrow ? W / 2 - 40 : W / 2, 64);
  // 보스 체력 띠
  if (s.boss && !s.boss.dead) {
    const bw = Math.min(520, W - 260);
    const bx = (W - bw) / 2;
    ctx.fillStyle = 'rgba(8,6,10,0.75)';
    ctx.fillRect(bx - 4, 74, bw + 8, 22);
    ctx.fillStyle = '#5a1020';
    ctx.fillRect(bx, 84, bw, 8);
    ctx.fillStyle = '#e0303a';
    ctx.fillRect(bx, 84, (bw * Math.max(0, s.boss.hp)) / s.boss.maxHp, 8);
    ctx.font = font(10, 700);
    ctx.fillStyle = '#f3ead8';
    ctx.fillText(s.boss.def.name, W / 2, 82);
  }
  // 왼쪽 위: 쓰러뜨림·금화
  ctx.textAlign = 'left';
  ctx.font = font(12, 700);
  ctx.fillStyle = '#f3ead8';
  ctx.fillText(`쓰러뜨림 ${s.chapterKills}`, 10, 32);
  ctx.fillStyle = '#ffd27a';
  ctx.fillText(`금화 ${s.gold}`, 10, 50);
  // 오른쪽 위 지도
  const mapSize = opt.map === 'large' ? Math.min(220, W * 0.3) : Math.min(150, W * 0.28);
  drawMinimap(ctx, s, v, W - mapSize - 12, 20, mapSize, now);
  // 아래 상태창
  const slot = W < 640 ? 26 : 34;
  const barW = (RULES.player.slots.weapons + RULES.player.slots.passives) * (slot + 4) + 14;
  drawStatusBar(ctx, s, art, Math.max(10, (W - barW) / 2), H - slot - 22, slot);
  // 알림 띠
  if (v.banner) {
    const age = now - v.banner.born;
    if (age > 2600) v.banner = null;
    else {
      const a = Math.min(1, age / 200, (2600 - age) / 400);
      const big = v.banner.kind === 'boss' || v.banner.kind === 'bigwave' || v.banner.kind === 'mid';
      ctx.textAlign = 'center';
      ctx.font = font(big ? 24 : 16, 800);
      const yy = H * 0.26;
      ctx.fillStyle = `rgba(8,6,10,${0.6 * a})`;
      ctx.fillRect(0, yy - (big ? 32 : 24), W, big ? 46 : 34);
      ctx.fillStyle = big ? `rgba(255,90,74,${a})` : v.banner.kind === 'chest' ? `rgba(255,224,138,${a})` : `rgba(243,234,216,${a})`;
      ctx.fillText(v.banner.text, W / 2, yy);
    }
  }
}

const fmt = (t: number) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

function rgb(hex: string): number[] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, '$1$1') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function shade(hex: string, k: number): string {
  const [r, g, b] = rgb(hex).map((c) => Math.max(0, Math.min(255, Math.round(k > 0 ? c + (255 - c) * k : c * (1 + k)))));
  return `rgb(${r},${g},${b})`;
}
function hexA(hex: string, a: number): string {
  const [r, g, b] = rgb(hex);
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a))})`;
}

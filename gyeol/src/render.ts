// 「결」 캔버스 그리기(2026-11-09). 「천외귀환」 그림을 assets manifest로 불러와, 대결 시계(d.t)로 프레임을 고른다.
// 프레임 수와 타격 프레임(events.hit)은 meta.json을 그대로 따르고, 공격 그림은 windup·recover 시간에 맞춰 늘인다.
// 「결」 전용 그림(받기·피하기 동작, 결 이펙트 12프레임, 결정타, 연속 박자 기운, 아이콘)은 Codex 실제 그림이 왔을 때만 쓰고,
// 오기 전에는 코드로 그린 대체 연출을 쓴다(임시 상자 그림은 쓰지 않는다).
import { loadSprite, type SpriteAsset } from '../../src/render/assets';
import { cue, isOpen, streakTier, type Duel, type Element } from './duel';

export const W = 960;
export const H = 540;
const GROUND = 452;
const SCALE = 2.6;
export const PLAYER_X = 330;
export const FOE_X = 640;
export const CONTACT = { x: (PLAYER_X + FOE_X) / 2, y: GROUND - 120 };

/** icons_gyeol 칸 번호(명세 frame_notes와 같다) */
export const ICON = { S: 1, A: 2, B: 3, C: 4, perfect: 5, good: 6, miss: 7, evade: 8, danger: 9 } as const;

type Anim = SpriteAsset | null;
export interface Sprites {
  player: { idle: Anim; attack: Anim; hit: Anim; parry: Anim; dodge: Anim };
  foe: { idle: Anim; attack: Anim; hit: Anim };
  bg: Anim;
  fx: Record<string, Anim>;
}

/** Codex 실제 그림만(임시 상자 그림은 null) */
const real = async (id: string): Promise<Anim> => {
  const a = await loadSprite(id);
  return a && a.source === 'sprites' ? a : null;
};

export async function loadSprites(playerPrefix: string, foePrefix: string, bg: string): Promise<Sprites> {
  const ids = {
    pi: loadSprite(`${playerPrefix}_idle`),
    pa: loadSprite(`${playerPrefix}_attack`),
    ph: loadSprite(`${playerPrefix}_hit`),
    pp: real(`${playerPrefix}_parry`),
    pd: real(`${playerPrefix}_dodge`),
    fi: loadSprite(`${foePrefix}_idle`),
    fa: loadSprite(`${foePrefix}_attack`),
    fh: loadSprite(`${foePrefix}_hit`),
    bg: loadSprite(bg),
  };
  const fxIds = ['fx_hit_slash', 'fx_hit_blunt', 'fx_hit_fire', 'fx_hit_ice', 'fx_hit_shock', 'fx_hit_grain'];
  const gyeolFx = ['fx_gyeol_parry_a', 'fx_gyeol_parry_b', 'fx_gyeol_deathblow', 'fx_gyeol_aura_1', 'fx_gyeol_aura_2', 'fx_gyeol_aura_3', 'icons_gyeol'];
  const [pi, pa, ph, pp, pd, fi, fa, fh, b, ...fx] = await Promise.all([
    ids.pi, ids.pa, ids.ph, ids.pp, ids.pd, ids.fi, ids.fa, ids.fh, ids.bg,
    ...fxIds.map((id) => loadSprite(id)),
    ...gyeolFx.map((id) => real(id)),
  ]);
  const all = [...fxIds, ...gyeolFx];
  return {
    player: { idle: pi, attack: pa, hit: ph, parry: pp, dodge: pd },
    foe: { idle: fi, attack: fa, hit: fh },
    bg: b,
    fx: Object.fromEntries(all.map((id, i) => [id, fx[i]])),
  };
}

export const ELEMENT_COLOR: Record<Element | 'none' | 'danger', { line: string; glow: string; spark: string }> = {
  none: { line: '200,230,255', glow: '#9fd0ff', spark: '#e8f4ff' },
  fire: { line: '255,150,70', glow: '#ff8a3a', spark: '#ffc27a' },
  ice: { line: '170,230,255', glow: '#9fe6ff', spark: '#e6fbff' },
  lightning: { line: '200,150,255', glow: '#b07cff', spark: '#e8d4ff' },
  danger: { line: '255,70,60', glow: '#ff3b30', spark: '#ff9a8a' },
};

/** 화면 효과(실제 시간 기준) */
export interface Fx {
  sparks: { x: number; y: number; vx: number; vy: number; born: number; life: number; color: string; size: number }[];
  texts: { x: number; y: number; text: string; color: string; born: number; size: number; icon?: number }[];
  bursts: { x: number; y: number; sprite: string; born: number; scale: number }[];
  /** 결 패링 연출(Codex 12프레임이 없으면 코드로 그린 금빛 연꽃) */
  blooms: { x: number; y: number; born: number; color: string; big: boolean }[];
  slashes: { born: number }[];
  flash: { color: string; born: number; life: number; strength: number } | null;
  shake: { power: number; born: number; life: number } | null;
  /** 받기 자세를 잠깐 보인다(실제 시간) */
  guardPose: number;
}

export const emptyFx = (): Fx => ({ sparks: [], texts: [], bursts: [], blooms: [], slashes: [], flash: null, shake: null, guardPose: -Infinity });

/** 흔들림은 더 센 쪽을 남긴다(약한 흔들림이 강한 흔들림을 덮지 않게) */
export function addShake(fx: Fx, now: number, power: number, life: number): void {
  const cur = fx.shake;
  const curLeft = cur ? cur.power * Math.max(0, 1 - (now - cur.born) / cur.life) : 0;
  if (power >= curLeft) fx.shake = { power, born: now, life };
}

function frameOf(asset: SpriteAsset, n: number): CanvasImageSource | null {
  const i = Math.max(1, Math.min(asset.meta.frames, n)) - 1;
  return asset.images[i] ?? null;
}

function loopFrame(asset: SpriteAsset, ms: number): number {
  return 1 + (Math.floor(ms / (1000 / asset.meta.fps)) % asset.meta.frames);
}

/** 공격 그림: 1..(hit-1)을 windup에, hit..끝을 recover에 펼친다 */
function strikeFrame(asset: SpriteAsset, phase: 'windup' | 'recover', elapsed: number, span: number): number {
  const hit = asset.meta.events.hit ?? Math.ceil(asset.meta.frames / 2);
  const k = Math.max(0, Math.min(0.999, elapsed / Math.max(1, span)));
  if (phase === 'windup') return 1 + Math.floor(k * (hit - 1));
  return hit + Math.floor(k * (asset.meta.frames - hit + 1));
}

function drawSprite(ctx: CanvasRenderingContext2D, asset: Anim, frame: number, x: number, opts: { alpha?: number; tint?: string; scale?: number; y?: number } = {}): void {
  if (!asset) return;
  const img = frameOf(asset, frame);
  if (!img) return;
  const s = (opts.scale ?? 1) * SCALE;
  const w = asset.meta.frameW * s;
  const h = asset.meta.frameH * s;
  const [ax, ay] = asset.meta.anchor;
  ctx.save();
  ctx.globalAlpha = opts.alpha ?? 1;
  ctx.translate(x, opts.y ?? GROUND);
  ctx.drawImage(opts.tint ? tinted(img, asset.meta.frameW, asset.meta.frameH, opts.tint) : img, -w * ax, -h * ay, w, h);
  ctx.restore();
}

/** 색 입히기는 따로 된 작은 캔버스에서 한다(본 캔버스에서 하면 뒤 배경까지 물든다) */
let tintCanvas: HTMLCanvasElement | null = null;
function tinted(img: CanvasImageSource, w: number, h: number, color: string): CanvasImageSource {
  tintCanvas ??= document.createElement('canvas');
  if (tintCanvas.width !== w || tintCanvas.height !== h) {
    tintCanvas.width = w;
    tintCanvas.height = h;
  }
  const c = tintCanvas.getContext('2d')!;
  c.globalCompositeOperation = 'source-over';
  c.clearRect(0, 0, w, h);
  c.drawImage(img, 0, 0, w, h);
  c.globalCompositeOperation = 'source-atop';
  c.fillStyle = color;
  c.fillRect(0, 0, w, h);
  return tintCanvas;
}

export function drawIcon(ctx: CanvasRenderingContext2D, sp: Sprites, n: number, x: number, y: number, size: number): boolean {
  const a = sp.fx.icons_gyeol;
  if (!a) return false;
  const img = frameOf(a, n);
  if (!img) return false;
  ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
  return true;
}

export function draw(ctx: CanvasRenderingContext2D, d: Duel, sp: Sprites, fx: Fx, now: number): void {
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (fx.shake) {
    const k = 1 - (now - fx.shake.born) / fx.shake.life;
    if (k > 0) {
      const p = fx.shake.power * k * k;
      ctx.translate((Math.sin(now * 0.11) * p) | 0, (Math.cos(now * 0.17) * p * 0.7) | 0);
    }
  }
  drawBackground(ctx, sp);
  drawAura(ctx, d, sp, now);
  drawPlayer(ctx, d, sp, fx, now);
  drawFoe(ctx, d, sp);
  drawCue(ctx, d, now);
  drawEffects(ctx, sp, fx, now);
  ctx.restore();
  if (fx.flash) {
    const k = 1 - (now - fx.flash.born) / fx.flash.life;
    if (k > 0) {
      ctx.fillStyle = fx.flash.color;
      ctx.globalAlpha = k * fx.flash.strength;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
  }
}

function drawBackground(ctx: CanvasRenderingContext2D, sp: Sprites): void {
  ctx.fillStyle = '#0d0b10';
  ctx.fillRect(-40, -40, W + 80, H + 80);
  const bg = sp.bg ? frameOf(sp.bg, 1) : null;
  if (bg && sp.bg) {
    const s = W / sp.bg.meta.frameW;
    const h = sp.bg.meta.frameH * s;
    ctx.drawImage(bg, 0, H - h + 40, W, h);
    ctx.fillStyle = 'rgba(8,6,12,0.45)';
    ctx.fillRect(0, 0, W, H);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  for (const x of [PLAYER_X, FOE_X]) {
    ctx.beginPath();
    ctx.ellipse(x, GROUND + 4, 70, 12, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** 연속 박자 기운: 단계 1 푸른 결 · 2 금빛 띠 · 3 흰 금빛 불꽃과 나뭇결 후광 */
function drawAura(ctx: CanvasRenderingContext2D, d: Duel, sp: Sprites, now: number): void {
  const tier = streakTier(d);
  if (tier <= 0) return;
  const a = sp.fx[`fx_gyeol_aura_${Math.min(3, tier)}`];
  if (a) {
    drawSprite(ctx, a, loopFrame(a, now), PLAYER_X, { alpha: 0.9 });
    return;
  }
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const t = now / 1000;
  if (tier >= 3) {
    // 등 뒤 나뭇결 후광
    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = `rgba(255,214,120,${0.28 - i * 0.05})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(PLAYER_X, GROUND - 175, 56 + i * 16, 60 + i * 17, t * 0.4 + i, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  const lines = tier >= 3 ? 14 : tier === 2 ? 9 : 5;
  for (let i = 0; i < lines; i++) {
    const phase = t * (tier >= 2 ? 1.6 : 0.9) + i * 1.7;
    const x0 = PLAYER_X + Math.sin(phase) * (tier >= 2 ? 52 : 34);
    const hgt = 70 + ((i * 37) % 60) + (tier - 1) * 40;
    const color = tier >= 3 ? `rgba(255,240,190,${0.5 + 0.3 * Math.sin(phase * 2)})` : tier === 2 ? 'rgba(255,205,110,0.55)' : 'rgba(140,210,255,0.45)';
    ctx.strokeStyle = color;
    ctx.lineWidth = tier >= 3 ? 4 : 2.5;
    ctx.beginPath();
    ctx.moveTo(x0, GROUND);
    ctx.bezierCurveTo(x0 + Math.sin(phase + 1) * 26, GROUND - hgt * 0.4, x0 - Math.sin(phase + 2) * 26, GROUND - hgt * 0.75, x0 + Math.sin(phase) * 10, GROUND - hgt);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPlayer(ctx: CanvasRenderingContext2D, d: Duel, sp: Sprites, fx: Fx, now: number): void {
  const p = d.player;
  const t = d.t;
  if (p.action === 'attack' && sp.player.attack) {
    const a = d.data.player.attack;
    const el = t - p.actionStart;
    const f = el < a.hitAt ? strikeFrame(sp.player.attack, 'windup', el, a.hitAt) : strikeFrame(sp.player.attack, 'recover', el - a.hitAt, a.duration - a.hitAt);
    drawSprite(ctx, sp.player.attack, f, PLAYER_X);
  } else if (p.action === 'dodge') {
    const k = Math.min(1, (t - p.actionStart) / d.data.rules.dodgeDuration);
    if (sp.player.dodge) {
      drawSprite(ctx, sp.player.dodge, 1 + Math.floor(k * sp.player.dodge.meta.frames), PLAYER_X);
    } else {
      // 대체: 뒤로 낮게 비켜서며 잔상을 남긴다
      const off = Math.sin(k * Math.PI) * 70;
      if (sp.player.idle) {
        drawSprite(ctx, sp.player.idle, 1, PLAYER_X, { alpha: 0.25 * (1 - k), tint: 'rgba(255,120,110,0.5)' });
        drawSprite(ctx, sp.player.idle, 1, PLAYER_X - off, { scale: 1 - Math.sin(k * Math.PI) * 0.12 });
      }
    }
  } else if ((p.action === 'hurt' || p.action === 'broken') && sp.player.hit) {
    const f = 1 + Math.min(sp.player.hit.meta.frames - 1, Math.floor((t - p.actionStart) / 90));
    drawSprite(ctx, sp.player.hit, f, PLAYER_X, { tint: p.action === 'broken' ? 'rgba(120,120,160,0.35)' : undefined });
  } else if (now - fx.guardPose < 260 && (sp.player.parry || sp.player.attack)) {
    if (sp.player.parry) {
      const k = (now - fx.guardPose) / 260;
      drawSprite(ctx, sp.player.parry, 1 + Math.floor(k * sp.player.parry.meta.frames), PLAYER_X);
    } else drawSprite(ctx, sp.player.attack, 2, PLAYER_X);
  } else if (sp.player.idle) {
    drawSprite(ctx, sp.player.idle, loopFrame(sp.player.idle, t), PLAYER_X);
  }
  if (d.result === 'lose') {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(PLAYER_X - 80, GROUND - 200, 160, 200);
  }
}

function drawFoe(ctx: CanvasRenderingContext2D, d: Duel, sp: Sprites): void {
  const f = d.foe;
  const t = d.t;
  const open = isOpen(d);
  const move = f.move ? d.foeDef.moves[f.move] : null;
  const tint = open ? 'rgba(255,214,120,0.18)' : move?.unblockable && f.state === 'windup' ? 'rgba(255,40,30,0.22)' : undefined;
  if (f.state === 'windup' && sp.foe.attack && move) {
    // 속임수: 가짜 순간까지 들어 올렸다가, 끌어 두는 동안 타격 직전 칸에 멈춰 떤다
    const fakeSpan = (f.fakeAt ?? f.hitAt) - f.stateStart;
    const holding = f.fakeAt !== null && t >= f.fakeAt;
    const frame = holding ? strikeFrame(sp.foe.attack, 'windup', 1, 1) : strikeFrame(sp.foe.attack, 'windup', t - f.stateStart, fakeSpan);
    const jit = holding ? Math.sin(t * 0.08) * 2 : 0;
    drawSprite(ctx, sp.foe.attack, frame, FOE_X + jit, { tint });
  } else if (f.state === 'recover' && sp.foe.attack && move) {
    drawSprite(ctx, sp.foe.attack, strikeFrame(sp.foe.attack, 'recover', t - f.stateStart, move.recover), FOE_X, { tint });
  } else if (f.state === 'stagger' && sp.foe.hit) {
    const wob = Math.sin(t * 0.03) * 4;
    drawSprite(ctx, sp.foe.hit, 2, FOE_X + wob, { tint: 'rgba(255,240,200,0.22)' });
  } else if (f.state === 'dead' && sp.foe.hit) {
    const k = Math.max(0, 1 - (t - f.stateStart) / 900);
    drawSprite(ctx, sp.foe.hit, sp.foe.hit.meta.frames, FOE_X, { alpha: k });
  } else if (sp.foe.idle) {
    drawSprite(ctx, sp.foe.idle, loopFrame(sp.foe.idle, t), FOE_X, { tint });
  }
  if (open) {
    const k = (d.openingUntil - t) / d.data.rules.counterWindow;
    ctx.save();
    ctx.strokeStyle = `rgba(255,220,130,${0.35 + 0.6 * k})`;
    ctx.lineWidth = 3;
    ctx.shadowColor = '#ffd27a';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(FOE_X - 34, GROUND - 190);
    ctx.lineTo(FOE_X - 8, GROUND - 140);
    ctx.lineTo(FOE_X - 22, GROUND - 110);
    ctx.lineTo(FOE_X + 10, GROUND - 60);
    ctx.stroke();
    ctx.restore();
  }
}

/** 결: 원소마다 색과 결의 모양이 다르다. 붉은 결은 받을 수 없다(피하기). 속임수는 고리가 가짜 순간에 닿았다가 다시 좁혀 든다 */
function drawCue(ctx: CanvasRenderingContext2D, d: Duel, now: number): void {
  const c = cue(d);
  if (!c.visible) return;
  const r = d.data.rules;
  const key = c.unblockable ? 'danger' : (c.element ?? 'none');
  const col = ELEMENT_COLOR[key];
  const inPerfect = !c.faking && !c.unblockable && c.left <= r.perfect;
  const alpha = 0.3 + 0.7 * (1 - c.ratio);
  const cx = CONTACT.x - 40;
  const cy = CONTACT.y;
  const sx = FOE_X - 30;
  const sy = GROUND - 150;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const lineColor = inPerfect ? `rgba(255,214,120,${alpha})` : `rgba(${col.line},${alpha})`;
  ctx.strokeStyle = lineColor;
  ctx.shadowColor = inPerfect ? '#ffd27a' : col.glow;
  ctx.shadowBlur = 16;
  ctx.lineWidth = inPerfect || c.unblockable ? 4 : 2.5;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  if (c.element === 'lightning') {
    // 번개: 지그재그로 튄다
    const n = 7;
    for (let i = 1; i <= n; i++) {
      const k = i / n;
      const jag = i === n ? 0 : (((i * 53 + Math.floor(now / 70)) % 7) - 3) * 7;
      ctx.lineTo(sx + (cx - sx) * k, sy + (cy - sy) * k + jag);
    }
  } else {
    ctx.quadraticCurveTo((sx + cx) / 2, cy - 40 * c.ratio, cx, cy);
  }
  ctx.stroke();
  // 원소 알갱이가 결을 따라 흐른다
  ctx.shadowBlur = 0;
  if (c.element === 'fire' || c.element === 'ice' || c.unblockable) {
    for (let i = 0; i < 6; i++) {
      const k = ((now / 600 + i / 6) % 1);
      const x = sx + (cx - sx) * k;
      const y = sy + (cy - sy) * k - Math.sin(k * Math.PI) * 30 * c.ratio + (c.element === 'fire' ? -8 * Math.sin(now / 90 + i) : 0);
      ctx.fillStyle = `rgba(${col.line},${0.8 * alpha})`;
      const s = c.element === 'ice' ? 3 : 4;
      if (c.element === 'ice') {
        ctx.fillRect(x - s, y, s * 2 + 1, 1);
        ctx.fillRect(x, y - s, 1, s * 2 + 1);
      } else ctx.fillRect(x - s / 2, y - s / 2, s, s);
    }
  }
  // 과녁 고리와 좁혀 드는 고리
  const target = 16;
  ctx.lineWidth = 2;
  ctx.strokeStyle = c.unblockable ? 'rgba(255,90,80,0.7)' : 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  ctx.arc(cx, cy, target, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = inPerfect ? 4 : 2.5;
  ctx.strokeStyle = lineColor;
  ctx.shadowColor = ctx.strokeStyle as string;
  ctx.shadowBlur = inPerfect ? 14 : 6;
  ctx.beginPath();
  if (c.element === 'lightning') {
    // 번개 고리는 각진 고리
    const rad = target + 110 * c.ratio;
    for (let i = 0; i <= 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const rr = rad + (i % 2 ? 5 : -5);
      if (i === 0) ctx.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      else ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
  } else ctx.arc(cx, cy, target + 110 * c.ratio, 0, Math.PI * 2);
  ctx.stroke();
  // 붉은 결: 위험 표식(받을 수 없다 — 피하라)
  if (c.unblockable) {
    ctx.shadowBlur = 0;
    const pulse = 0.6 + 0.4 * Math.sin(now / 80);
    ctx.font = '800 34px "Song Myung", serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.strokeText('危', FOE_X, GROUND - 230);
    ctx.fillStyle = `rgba(255,70,60,${pulse})`;
    ctx.fillText('危', FOE_X, GROUND - 230);
  }
  // 속임수: 가짜 순간이 지나면 진짜 결이 다시 좁혀 든다는 표시
  if (!c.faking && d.foe.fakeAt !== null) {
    ctx.shadowBlur = 0;
    ctx.font = '800 22px "Nanum Myeongjo", serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,240,200,0.9)';
    ctx.fillText('…지금!', cx, cy - 60);
  }
  ctx.restore();
}

/** 결 패링: 칼끝에서 금빛 나뭇결이 연꽃처럼 피어난다(Codex 12프레임 fx_gyeol_parry_a·b가 오면 그것으로) */
function drawBloom(ctx: CanvasRenderingContext2D, sp: Sprites, b: Fx['blooms'][number], now: number): void {
  const el = now - b.born;
  const A = sp.fx.fx_gyeol_parry_a;
  const B = sp.fx.fx_gyeol_parry_b;
  if (A && B) {
    const n = 1 + Math.floor(el / (1000 / A.meta.fps));
    const sheet = n <= A.meta.frames ? A : B;
    const f = n <= A.meta.frames ? n : n - A.meta.frames;
    if (f > sheet.meta.frames) return;
    const img = frameOf(sheet, f);
    if (!img) return;
    const s = SCALE * (b.big ? 1.5 : 1.15);
    ctx.drawImage(img, b.x - (sheet.meta.frameW * s) / 2, b.y - (sheet.meta.frameH * s) / 2, sheet.meta.frameW * s, sheet.meta.frameH * s);
    return;
  }
  const life = 560;
  const k = el / life;
  if (k >= 1) return;
  const ease = 1 - (1 - k) ** 3;
  const size = (b.big ? 1.4 : 1) * 120;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.translate(b.x, b.y);
  // 흰 중심 번쩍임
  const core = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 0.5 * (1 - k * 0.5));
  core.addColorStop(0, `rgba(255,255,255,${0.9 * (1 - k)})`);
  core.addColorStop(0.4, `rgba(255,220,140,${0.5 * (1 - k)})`);
  core.addColorStop(1, 'rgba(255,200,100,0)');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.5, 0, Math.PI * 2);
  ctx.fill();
  // 연꽃잎 같은 나뭇결 선 여덟(두 겹)
  for (let layer = 0; layer < 2; layer++) {
    const petals = 8;
    const rot = layer * (Math.PI / petals) + ease * 0.5;
    const len = size * (layer ? 0.75 : 1) * ease;
    ctx.strokeStyle = layer ? `rgba(220,240,255,${0.7 * (1 - k)})` : b.color.replace('ALPHA', String(0.95 * (1 - k)));
    ctx.lineWidth = layer ? 2 : 3;
    for (let i = 0; i < petals; i++) {
      const a = rot + (i / petals) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 10, Math.sin(a) * 10);
      ctx.quadraticCurveTo(Math.cos(a + 0.45) * len * 0.6, Math.sin(a + 0.45) * len * 0.6, Math.cos(a + 0.12) * len, Math.sin(a + 0.12) * len);
      ctx.quadraticCurveTo(Math.cos(a - 0.3) * len * 0.55, Math.sin(a - 0.3) * len * 0.55, Math.cos(a) * 10, Math.sin(a) * 10);
      ctx.stroke();
    }
  }
  // 충격파 고리 둘
  for (let i = 0; i < 2; i++) {
    const kk = Math.max(0, ease - i * 0.15);
    ctx.strokeStyle = `rgba(255,230,170,${0.6 * (1 - k)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, size * 1.3 * kk, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/** 결정타 대체 연출: 화면을 가로지르는 금빛 일섬 */
function drawSlash(ctx: CanvasRenderingContext2D, sp: Sprites, born: number, now: number): void {
  const el = now - born;
  const real = sp.fx.fx_gyeol_deathblow;
  if (real) {
    const n = 1 + Math.floor(el / (1000 / real.meta.fps));
    if (n > real.meta.frames) return;
    const img = frameOf(real, n);
    if (!img) return;
    const s = SCALE * 2;
    ctx.drawImage(img, FOE_X - (real.meta.frameW * s) / 2, CONTACT.y - (real.meta.frameH * s) / 2, real.meta.frameW * s, real.meta.frameH * s);
    return;
  }
  const k = el / 500;
  if (k >= 1) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.translate(FOE_X, CONTACT.y);
  ctx.rotate(-0.55);
  const w = 520 * Math.min(1, k * 4);
  ctx.fillStyle = `rgba(255,240,200,${1 - k})`;
  ctx.fillRect(-w / 2, -3 - 6 * (1 - k), w, 6 + 12 * (1 - k));
  ctx.strokeStyle = `rgba(255,200,100,${0.8 * (1 - k)})`;
  ctx.lineWidth = 2;
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 60, 0);
    ctx.lineTo(i * 60 + 20, (i % 2 ? 1 : -1) * 50 * Math.min(1, k * 3));
    ctx.stroke();
  }
  ctx.restore();
}

function drawEffects(ctx: CanvasRenderingContext2D, sp: Sprites, fx: Fx, now: number): void {
  for (const b of fx.bursts) {
    const a = sp.fx[b.sprite];
    if (!a) continue;
    const n = 1 + Math.floor((now - b.born) / (1000 / a.meta.fps));
    if (n > a.meta.frames) continue;
    const img = frameOf(a, n);
    if (!img) continue;
    const s = SCALE * b.scale;
    ctx.drawImage(img, b.x - (a.meta.frameW * s) / 2, b.y - (a.meta.frameH * s) / 2, a.meta.frameW * s, a.meta.frameH * s);
  }
  for (const b of fx.blooms) drawBloom(ctx, sp, b, now);
  for (const s of fx.slashes) drawSlash(ctx, sp, s.born, now);
  for (const s of fx.sparks) {
    const k = (now - s.born) / s.life;
    if (k >= 1) continue;
    const t = (now - s.born) / 1000;
    ctx.fillStyle = s.color;
    ctx.globalAlpha = 1 - k;
    ctx.fillRect(s.x + s.vx * t, s.y + s.vy * t + 300 * t * t, s.size, s.size);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center';
  for (const tx of fx.texts) {
    const k = (now - tx.born) / 900;
    if (k >= 1) continue;
    ctx.globalAlpha = 1 - k * k;
    const y = tx.y - k * 40;
    if (tx.icon && drawIcon(ctx, sp, tx.icon, tx.x - tx.size * 1.6, y - tx.size * 0.35, tx.size * 1.2)) {
      // 아이콘이 있으면 글자 왼쪽에
    }
    ctx.font = `800 ${tx.size}px "Song Myung", "Nanum Myeongjo", serif`;
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.strokeText(tx.text, tx.x, y);
    ctx.fillStyle = tx.color;
    ctx.fillText(tx.text, tx.x, y);
  }
  ctx.globalAlpha = 1;
}

/** 오래된 효과를 지운다 */
export function pruneFx(fx: Fx, now: number): void {
  fx.sparks = fx.sparks.filter((s) => now - s.born < s.life);
  fx.texts = fx.texts.filter((t) => now - t.born < 900);
  fx.bursts = fx.bursts.filter((b) => now - b.born < 600);
  fx.blooms = fx.blooms.filter((b) => now - b.born < 700);
  fx.slashes = fx.slashes.filter((s) => now - s.born < 600);
  if (fx.flash && now - fx.flash.born > fx.flash.life) fx.flash = null;
  if (fx.shake && now - fx.shake.born > fx.shake.life) fx.shake = null;
}

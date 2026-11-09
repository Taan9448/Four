// 「결」 캔버스 그리기(2026-11-09). 「천외귀환」 그림을 assets manifest로 불러와, 대결 시계(d.t)로 프레임을 고른다.
// 프레임 수와 타격 프레임(events.hit)은 meta.json을 그대로 따르고, 공격 그림은 windup·recover 시간에 맞춰 늘인다.
import { loadSprite, type SpriteAsset } from '../../src/render/assets';
import { cue, isOpen, type Duel } from './duel';

export const W = 960;
export const H = 540;
const GROUND = 452;
const SCALE = 2.6;
export const PLAYER_X = 330;
export const FOE_X = 640;

export interface Sprites {
  player: { idle: SpriteAsset | null; attack: SpriteAsset | null; hit: SpriteAsset | null };
  foe: { idle: SpriteAsset | null; attack: SpriteAsset | null; hit: SpriteAsset | null };
  bg: SpriteAsset | null;
  fx: Record<string, SpriteAsset | null>;
}

export async function loadSprites(playerPrefix: string, foePrefix: string, bg: string): Promise<Sprites> {
  const [pi, pa, ph, fi, fa, fh, b, grain, slash, blunt, fire] = await Promise.all([
    loadSprite(`${playerPrefix}_idle`),
    loadSprite(`${playerPrefix}_attack`),
    loadSprite(`${playerPrefix}_hit`),
    loadSprite(`${foePrefix}_idle`),
    loadSprite(`${foePrefix}_attack`),
    loadSprite(`${foePrefix}_hit`),
    loadSprite(bg),
    loadSprite('fx_hit_grain'),
    loadSprite('fx_hit_slash'),
    loadSprite('fx_hit_blunt'),
    loadSprite('fx_hit_fire'),
  ]);
  return { player: { idle: pi, attack: pa, hit: ph }, foe: { idle: fi, attack: fa, hit: fh }, bg: b, fx: { grain, slash, blunt, fire } };
}

/** 화면 효과(실제 시간 기준): 불꽃·글자·번쩍임 */
export interface Fx {
  sparks: { x: number; y: number; vx: number; vy: number; born: number; life: number; color: string }[];
  texts: { x: number; y: number; text: string; color: string; born: number; size: number }[];
  bursts: { x: number; y: number; sprite: string; born: number; scale: number }[];
  flash: { color: string; born: number; life: number } | null;
  shake: { power: number; born: number; life: number } | null;
  /** 받기 자세를 잠깐 보인다(실제 시간) */
  guardPose: number;
}

export const emptyFx = (): Fx => ({ sparks: [], texts: [], bursts: [], flash: null, shake: null, guardPose: -Infinity });

export const CONTACT = { x: (PLAYER_X + FOE_X) / 2, y: GROUND - 120 };

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

function drawSprite(ctx: CanvasRenderingContext2D, asset: SpriteAsset | null, frame: number, x: number, opts: { alpha?: number; tint?: string; flip?: boolean; scale?: number } = {}): void {
  if (!asset) return;
  const img = frameOf(asset, frame);
  if (!img) return;
  const s = (opts.scale ?? 1) * SCALE;
  const w = asset.meta.frameW * s;
  const h = asset.meta.frameH * s;
  const [ax, ay] = asset.meta.anchor;
  ctx.save();
  ctx.globalAlpha = opts.alpha ?? 1;
  ctx.translate(x, GROUND);
  if (opts.flip) ctx.scale(-1, 1);
  ctx.drawImage(img, -w * ax, -h * ay, w, h);
  if (opts.tint) {
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = opts.tint;
    ctx.fillRect(-w * ax, -h * ay, w, h);
  }
  ctx.restore();
}

export function draw(ctx: CanvasRenderingContext2D, d: Duel, sp: Sprites, fx: Fx, now: number): void {
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (fx.shake) {
    const k = 1 - (now - fx.shake.born) / fx.shake.life;
    if (k > 0) ctx.translate((Math.sin(now * 0.09) * fx.shake.power * k) | 0, (Math.cos(now * 0.13) * fx.shake.power * 0.6 * k) | 0);
  }
  drawBackground(ctx, sp);
  drawPlayer(ctx, d, sp, fx, now);
  drawFoe(ctx, d, sp);
  drawCue(ctx, d);
  drawEffects(ctx, sp, fx, now);
  ctx.restore();
  if (fx.flash) {
    const k = 1 - (now - fx.flash.born) / fx.flash.life;
    if (k > 0) {
      ctx.fillStyle = fx.flash.color;
      ctx.globalAlpha = k * 0.55;
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
    // 대결에 눈이 가도록 배경을 어둡게
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

function drawPlayer(ctx: CanvasRenderingContext2D, d: Duel, sp: Sprites, fx: Fx, now: number): void {
  const p = d.player;
  const t = d.t;
  if (p.action === 'attack' && sp.player.attack) {
    const a = d.data.player.attack;
    const el = t - p.actionStart;
    const f = el < a.hitAt ? strikeFrame(sp.player.attack, 'windup', el, a.hitAt) : strikeFrame(sp.player.attack, 'recover', el - a.hitAt, a.duration - a.hitAt);
    drawSprite(ctx, sp.player.attack, f, PLAYER_X);
  } else if ((p.action === 'hurt' || p.action === 'broken') && sp.player.hit) {
    const f = 1 + Math.min(sp.player.hit.meta.frames - 1, Math.floor((t - p.actionStart) / 90));
    drawSprite(ctx, sp.player.hit, f, PLAYER_X, { tint: p.action === 'broken' ? 'rgba(120,120,160,0.35)' : undefined });
  } else if (now - fx.guardPose < 170 && sp.player.attack) {
    // 받기 자세(전용 그림이 오기 전까지 베기 그림의 들어 올린 칸으로 대신)
    drawSprite(ctx, sp.player.attack, 2, PLAYER_X);
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
  const tint = open ? 'rgba(255,214,120,0.18)' : undefined;
  if (f.state === 'windup' && sp.foe.attack && f.move) {
    const m = d.foeDef.moves[f.move];
    drawSprite(ctx, sp.foe.attack, strikeFrame(sp.foe.attack, 'windup', t - f.stateStart, m.windup), FOE_X, { tint });
  } else if (f.state === 'recover' && sp.foe.attack && f.move) {
    const m = d.foeDef.moves[f.move];
    drawSprite(ctx, sp.foe.attack, strikeFrame(sp.foe.attack, 'recover', t - f.stateStart, m.recover), FOE_X, { tint });
  } else if (f.state === 'stagger' && sp.foe.hit) {
    // 비틀거림: 피격 그림 가운데 칸을 흔들며
    const wob = Math.sin(t * 0.03) * 4;
    drawSprite(ctx, sp.foe.hit, 2, FOE_X + wob, { tint: 'rgba(255,240,200,0.22)' });
  } else if (f.state === 'dead' && sp.foe.hit) {
    const k = Math.max(0, 1 - (t - f.stateStart) / 900);
    drawSprite(ctx, sp.foe.hit, sp.foe.hit.meta.frames, FOE_X, { alpha: k });
  } else if (sp.foe.idle) {
    drawSprite(ctx, sp.foe.idle, loopFrame(sp.foe.idle, t), FOE_X, { tint });
  }
  if (open) {
    // 되돌아오는 틈: 적 몸에 금빛 금이 그어진다
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

/** 결: 적의 공격 결이 하운에게 보인다 — 가는 빛줄기와, 타격 순간에 과녁 고리와 겹치는 좁혀 드는 고리 */
function drawCue(ctx: CanvasRenderingContext2D, d: Duel): void {
  const c = cue(d);
  if (!c.visible) return;
  const r = d.data.rules;
  const inPerfect = c.left <= r.perfect;
  const alpha = 0.25 + 0.75 * (1 - c.ratio);
  const cx = CONTACT.x - 40;
  const cy = CONTACT.y;
  ctx.save();
  ctx.lineCap = 'round';
  // 결의 줄기: 적 → 접점
  const grad = ctx.createLinearGradient(FOE_X - 30, GROUND - 150, cx, cy);
  grad.addColorStop(0, `rgba(255,255,255,0)`);
  grad.addColorStop(1, inPerfect ? `rgba(255,214,120,${alpha})` : `rgba(200,230,255,${alpha})`);
  ctx.strokeStyle = grad;
  ctx.lineWidth = inPerfect ? 4 : 2;
  ctx.shadowColor = inPerfect ? '#ffd27a' : '#9fd0ff';
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.moveTo(FOE_X - 30, GROUND - 150);
  ctx.quadraticCurveTo((FOE_X + cx) / 2, cy - 40 * c.ratio, cx, cy);
  ctx.stroke();
  // 과녁 고리(받는 자리)와 좁혀 드는 고리 — 두 고리가 겹칠 때가 타격
  const target = 16;
  ctx.shadowBlur = 0;
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  ctx.arc(cx, cy, target, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = inPerfect ? 4 : 2.5;
  ctx.strokeStyle = inPerfect ? `rgba(255,214,120,${alpha})` : `rgba(200,230,255,${alpha})`;
  ctx.beginPath();
  ctx.arc(cx, cy, target + 110 * c.ratio, 0, Math.PI * 2);
  ctx.stroke();
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
  for (const s of fx.sparks) {
    const k = (now - s.born) / s.life;
    if (k >= 1) continue;
    const t = (now - s.born) / 1000;
    ctx.fillStyle = s.color;
    ctx.globalAlpha = 1 - k;
    ctx.fillRect(s.x + s.vx * t, s.y + s.vy * t + 300 * t * t, 4, 4);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center';
  for (const tx of fx.texts) {
    const k = (now - tx.born) / 900;
    if (k >= 1) continue;
    ctx.globalAlpha = 1 - k * k;
    ctx.font = `800 ${tx.size}px "Song Myung", "Nanum Myeongjo", serif`;
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.strokeText(tx.text, tx.x, tx.y - k * 40);
    ctx.fillStyle = tx.color;
    ctx.fillText(tx.text, tx.x, tx.y - k * 40);
  }
  ctx.globalAlpha = 1;
}

/** 오래된 효과를 지운다 */
export function pruneFx(fx: Fx, now: number): void {
  fx.sparks = fx.sparks.filter((s) => now - s.born < s.life);
  fx.texts = fx.texts.filter((t) => now - t.born < 900);
  fx.bursts = fx.bursts.filter((b) => now - b.born < 600);
  if (fx.flash && now - fx.flash.born > fx.flash.life) fx.flash = null;
  if (fx.shake && now - fx.shake.born > fx.shake.life) fx.shake = null;
}

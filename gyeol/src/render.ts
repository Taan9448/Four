// 「결」 캔버스 그리기(2026-11-09). 「천외귀환」 그림을 assets manifest로 불러와, 대결 시계(d.t)로 프레임을 고른다.
// 프레임 수와 타격 프레임(events.hit)은 meta.json을 그대로 따르고, 공격 그림은 windup·recover 시간에 맞춰 늘인다.
// 「결」 전용 그림(받기·피하기 동작, 결 이펙트 12프레임, 결정타, 연속 박자 기운, 아이콘)은 Codex 실제 그림이 왔을 때만 쓰고,
// 오기 전에는 코드로 그린 대체 연출을 쓴다(임시 상자 그림은 쓰지 않는다).
import { loadSprite, type SpriteAsset } from '../../src/render/assets';
import { cue, isOpen, streakTier, TECH_DURATION, TECH_HIT, type Duel, type Element } from './duel';

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
  player: { idle: Anim; attack: Anim; hit: Anim; parry: Anim; dodge: Anim; death: Anim; tech: Anim };
  foe: { idle: Anim; attack: Anim; hit: Anim; death: Anim };
  bg: Anim;
  fx: Record<string, Anim>;
}

/** Codex 실제 그림만(임시 상자 그림은 null) */
const real = async (id: string): Promise<Anim> => {
  const a = await loadSprite(id);
  return a && a.source === 'sprites' ? a : null;
};

export async function loadSprites(playerPrefix: string, foePrefix: string, bg: string, skillFx: string[] = []): Promise<Sprites> {
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
  const techFx = TECH_IDS.flatMap((t) => [`fx_gyeol_tech_${t}_a`, `fx_gyeol_tech_${t}_b`]);
  const gyeolFx = ['fx_gyeol_parry_a', 'fx_gyeol_parry_b', 'fx_gyeol_deathblow', 'fx_gyeol_aura_1', 'fx_gyeol_aura_2', 'fx_gyeol_aura_3', 'icons_gyeol', 'fx_gyeol_danger_charge', 'fx_gyeol_tech_ready', ...techFx, ...skillFx];
  const [pi, pa, ph, pp, pd, fi, fa, fh, b, pTech, pDeath, fDeath, ...fx] = await Promise.all([
    ids.pi, ids.pa, ids.ph, ids.pp, ids.pd, ids.fi, ids.fa, ids.fh, ids.bg,
    real(`${playerPrefix}_tech`),
    real(`${playerPrefix}_death`),
    real(`${foePrefix}_death`),
    ...fxIds.map((id) => loadSprite(id)),
    ...gyeolFx.map((id) => real(id)),
  ]);
  const all = [...fxIds, ...gyeolFx];
  return {
    player: { idle: pi, attack: pa, hit: ph, parry: pp, dodge: pd, death: pDeath, tech: pTech },
    foe: { idle: fi, attack: fa, hit: fh, death: fDeath },
    bg: b,
    fx: Object.fromEntries(all.map((id, i) => [id, fx[i]])),
  };
}

/** 진하운의 기술(duel.json techs) — 색과 Codex 이펙트 id(fx_gyeol_tech_<id>_a·b) */
export const TECH_IDS = ['nakun', 'byeogun', 'unhae'] as const;
export const TECH_COLOR: Record<string, { core: string; glow: string; rgb: string }> = {
  nakun: { core: '#f2f8ff', glow: '#a8d8ff', rgb: '190,225,255' },
  byeogun: { core: '#e6f6ff', glow: '#4fb4ff', rgb: '90,180,255' },
  unhae: { core: '#fff6d6', glow: '#ffd27a', rgb: '255,214,120' },
};

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
  /** 판정 글자(EXCELLENT·GREAT·GOOD·MISS·HIT·COUNTER·BREAK) — 자리마다 하나 */
  judges: { word: JudgeWord; sub: string; x: number; y: number; born: number; slot: 'center' | 'foe' }[];
  /** 연속 받기 숫자(1, 2, 3…) */
  combo: { n: number; tier: number; born: number; up: boolean } | null;
  /** 받을 수 없는 기술 이름 띠 */
  banner: { name: string; born: number; element?: Element } | null;
  /** 결 연환 표시(끊기지 않고 받은 수, 모두 EXCELLENT인가) */
  chain: { n: number; pure: boolean };
  /** 기술 연출(쓴 순간부터, 실제 시간) */
  tech: { id: string; born: number } | null;
  /** 끝 장면: 느린 화면 동안 위아래 검은 띠와 쓰러지는 쪽으로 다가가기 */
  finale: { born: number; x: number } | null;
  flash: { color: string; born: number; life: number; strength: number } | null;
  shake: { power: number; born: number; life: number } | null;
  /** 받기 자세를 잠깐 보인다(실제 시간) */
  guardPose: number;
}

export const emptyFx = (): Fx => ({ sparks: [], texts: [], bursts: [], blooms: [], slashes: [], judges: [], combo: null, banner: null, tech: null, chain: { n: 0, pure: true }, finale: null, flash: null, shake: null, guardPose: -Infinity });

export type JudgeWord = 'EXCELLENT' | 'GREAT' | 'GOOD' | 'MISS' | 'HIT' | 'COUNTER' | 'BREAK';

/** 판정 글자 모양: 크기·색(위→아래)·윤곽·빛·기울기·지속 */
const JUDGE_STYLE: Record<JudgeWord, { size: number; top: string; bottom: string; edge: string; glow: string; tilt: number; life: number; shine?: boolean; stars?: boolean; crack?: boolean }> = {
  EXCELLENT: { size: 52, top: '#ffffff', bottom: '#ffc94a', edge: '#3a2205', glow: '#ffd27a', tilt: -0.04, life: 1000, shine: true, stars: true },
  GREAT: { size: 50, top: '#fff1c4', bottom: '#e8a53a', edge: '#33200a', glow: '#ffb24a', tilt: -0.03, life: 900, shine: true },
  GOOD: { size: 42, top: '#eef6ff', bottom: '#7fa6d6', edge: '#121a2b', glow: '#8fc0ff', tilt: 0, life: 800 },
  MISS: { size: 42, top: '#c9a7a0', bottom: '#7a2a24', edge: '#1a0806', glow: '#ff3b30', tilt: 0.05, life: 850, crack: true },
  HIT: { size: 30, top: '#ffffff', bottom: '#ffb36a', edge: '#2a1206', glow: '#ff9a4a', tilt: -0.12, life: 500 },
  COUNTER: { size: 46, top: '#fff3d6', bottom: '#ff6a2a', edge: '#2a0c04', glow: '#ff7a2a', tilt: -0.1, life: 850, shine: true },
  BREAK: { size: 48, top: '#ffffff', bottom: '#ffe08a', edge: '#2a1a04', glow: '#fff0c0', tilt: 0, life: 1100, shine: true, stars: true },
};

/** 판정 글자를 띄운다(같은 자리의 앞 글자는 바로 지운다 — 겹쳐 읽기 어렵지 않게) */
export function judge(fx: Fx, word: JudgeWord, sub: string, now: number, slot: 'center' | 'foe' = 'center'): void {
  fx.judges = fx.judges.filter((j) => j.slot !== slot);
  // 하운 쪽(받기 판정)은 접점 아래쪽, 적 쪽(HIT·COUNTER·BREAK)은 적 머리 위 — 동시에 떠도 겹치지 않게
  const x = slot === 'foe' ? FOE_X + 40 : PLAYER_X + 70;
  const y = slot === 'foe' ? CONTACT.y - 175 : CONTACT.y - 70;
  fx.judges.push({ word, sub, x, y, born: now, slot });
}

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

/** 지금 그리는 캐릭터의 크기 배율(2026-11-09, duel.json scale) — drawPlayer·drawFoe가 정한다 */
let actorScale = 1;
let foeScale = 1;

function drawSprite(ctx: CanvasRenderingContext2D, asset: Anim, frame: number, x: number, opts: { alpha?: number; tint?: string; scale?: number; y?: number; rot?: number } = {}): void {
  if (!asset) return;
  const img = frameOf(asset, frame);
  if (!img) return;
  const s = (opts.scale ?? 1) * SCALE * actorScale;
  const w = asset.meta.frameW * s;
  const h = asset.meta.frameH * s;
  const [ax, ay] = asset.meta.anchor;
  ctx.save();
  ctx.globalAlpha = opts.alpha ?? 1;
  ctx.translate(x, opts.y ?? GROUND);
  if (opts.rot) ctx.rotate(opts.rot);
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
  if (fx.finale) {
    // 끝 장면: 쓰러지는 쪽으로 천천히 다가간다
    const k = Math.min(1, (now - fx.finale.born) / 900);
    const z = 1 + 0.18 * (1 - (1 - k) ** 3);
    const fy = GROUND - 120;
    ctx.translate(fx.finale.x, fy);
    ctx.scale(z, z);
    ctx.translate(-fx.finale.x, -fy);
  }
  drawBackground(ctx, sp);
  foeScale = d.foeDef.scale ?? 1;
  readyFx = sp.fx.fx_gyeol_tech_ready ?? null;
  actorScale = d.data.player.scale ?? 1;
  drawAura(ctx, d, sp, now);
  drawTechAura(ctx, d, now);
  drawPlayer(ctx, d, sp, fx, now);
  actorScale = foeScale;
  drawFoe(ctx, d, sp);
  actorScale = 1;
  drawCue(ctx, d, now);
  drawEffects(ctx, sp, fx, now);
  ctx.restore();
  drawCombo(ctx, fx, now);
  drawChain(ctx, fx);
  drawBanner(ctx, fx, now);
  if (fx.finale) {
    const k = Math.min(1, (now - fx.finale.born) / 500);
    const bar = 54 * (1 - (1 - k) ** 2);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, bar);
    ctx.fillRect(0, H - bar, W, bar);
  }
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

/** 쓰러짐: Codex death 그림이 있으면 그것을, 없으면 피격 마지막 칸을 기울여 눕히며 흐리게 */
function drawFall(ctx: CanvasRenderingContext2D, death: Anim, hit: Anim, x: number, elapsed: number, dir: 1 | -1): void {
  if (death) {
    const n = 1 + Math.floor(elapsed / (1000 / death.meta.fps));
    drawSprite(ctx, death, Math.min(death.meta.frames, n), x);
    return;
  }
  if (!hit) return;
  // 느린 화면(대결 시계 0.25배) 안에서 1.5초쯤 걸려 눕도록 대결 시계 360ms에 걸쳐 쓰러진다
  const k = Math.min(1, elapsed / 360);
  const ease = k * k;
  drawSprite(ctx, hit, hit.meta.frames, x + dir * 12 * ease, { rot: dir * (Math.PI / 2.2) * ease, alpha: 1 - Math.max(0, (elapsed - 700) / 600), y: GROUND + 10 * ease });
}

function drawPlayer(ctx: CanvasRenderingContext2D, d: Duel, sp: Sprites, fx: Fx, now: number): void {
  const p = d.player;
  const t = d.t;
  if (d.result === 'lose') {
    drawFall(ctx, sp.player.death, sp.player.hit, PLAYER_X, t - p.actionStart, -1);
    return;
  }
  if (p.action === 'tech') {
    // 기술: Codex 기술 동작이 있으면 그것, 없으면 베기 그림을 늘여 잔상 셋과 함께
    const k = Math.min(0.999, (t - p.actionStart) / TECH_DURATION);
    if (sp.player.tech) drawSprite(ctx, sp.player.tech, 1 + Math.floor(k * sp.player.tech.meta.frames), PLAYER_X);
    else if (sp.player.attack) {
      const el = t - p.actionStart;
      const f = el < TECH_HIT ? strikeFrame(sp.player.attack, 'windup', el, TECH_HIT) : strikeFrame(sp.player.attack, 'recover', el - TECH_HIT, TECH_DURATION - TECH_HIT);
      for (let i = 3; i >= 1; i--) drawSprite(ctx, sp.player.attack, Math.max(1, f - i), PLAYER_X - i * 14, { alpha: 0.18 * (4 - i), tint: 'rgba(170,220,255,0.6)' });
      drawSprite(ctx, sp.player.attack, f, PLAYER_X + Math.sin(k * Math.PI) * 30);
    }
    return;
  }
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
  } else if (f.state === 'dead') {
    drawFall(ctx, sp.foe.death, sp.foe.hit, FOE_X, t - f.stateStart, 1);
  } else if (sp.foe.idle) {
    drawSprite(ctx, sp.foe.idle, loopFrame(sp.foe.idle, t), FOE_X, { tint });
  }
  if (f.state === 'windup' && move?.unblockable && sp.fx.fx_gyeol_danger_charge) {
    const a = sp.fx.fx_gyeol_danger_charge;
    drawSprite(ctx, a, loopFrame(a, t), FOE_X, { alpha: 0.9 });
  }
  if (open) {
    const k = (d.openingUntil - t) / d.data.rules.counterWindow;
    ctx.save();
    ctx.strokeStyle = `rgba(255,220,130,${0.35 + 0.6 * k})`;
    ctx.lineWidth = 3;
    ctx.shadowColor = '#ffd27a';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(FOE_X - 34 * foeScale, GROUND - 190 * foeScale);
    ctx.lineTo(FOE_X - 8 * foeScale, GROUND - 140 * foeScale);
    ctx.lineTo(FOE_X - 22 * foeScale, GROUND - 110 * foeScale);
    ctx.lineTo(FOE_X + 10 * foeScale, GROUND - 60 * foeScale);
    ctx.stroke();
    ctx.restore();
  }
}

/** 결: 원소마다 색과 결의 모양이 다르다. 붉은 결은 받을 수 없다(피하기). 속임수는 고리가 가짜 순간에 닿았다가 다시 좁혀 든다 */
function drawCue(ctx: CanvasRenderingContext2D, d: Duel, now: number): void {
  if (d.result) return;
  const c = cue(d);
  if (!c.visible) return;
  const r = d.data.rules;
  const key = c.unblockable ? 'danger' : (c.element ?? 'none');
  const col = ELEMENT_COLOR[key];
  const inPerfect = !c.faking && !c.unblockable && c.left <= r.perfect;
  const alpha = 0.3 + 0.7 * (1 - c.ratio);
  const cx = CONTACT.x - 40;
  const cy = CONTACT.y;
  const sx = FOE_X - 30 * foeScale;
  const sy = GROUND - 150 * foeScale;
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
    ctx.strokeText('危', FOE_X, GROUND - 230 * foeScale);
    ctx.fillStyle = `rgba(255,70,60,${pulse})`;
    ctx.fillText('危', FOE_X, GROUND - 230 * foeScale);
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
  drawTech(ctx, sp, fx, now);
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
  for (const j of fx.judges) drawJudge(ctx, j, now);
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

/** 판정 글자: 크게 튀어나왔다가 자리 잡고, 위로 떠오르며 사라진다. EXCELLENT는 빛이 훑고 별이 반짝인다 */
function drawJudge(ctx: CanvasRenderingContext2D, j: Fx['judges'][number], now: number): void {
  const st = JUDGE_STYLE[j.word];
  const el = now - j.born;
  const k = el / st.life;
  if (k >= 1) return;
  const pop = 1 + 0.75 * Math.max(0, 1 - el / 110) ** 2 - (el > 110 && el < 200 ? 0.05 * Math.sin(((el - 110) / 90) * Math.PI) : 0);
  const alpha = k < 0.65 ? 1 : 1 - (k - 0.65) / 0.35;
  const drift = j.word === 'MISS' ? 14 * k : -22 * k;
  const shakeX = j.word === 'MISS' && el < 220 ? Math.sin(el * 0.25) * 5 * (1 - el / 220) : 0;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(j.x + shakeX, j.y + drift);
  ctx.rotate(st.tilt);
  ctx.scale(pop, pop);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${st.size}px "Cinzel", "Song Myung", serif`;
  const w = ctx.measureText(j.word).width;
  // 바깥 빛 + 굵은 어두운 윤곽
  ctx.lineJoin = 'round';
  ctx.shadowColor = st.glow;
  ctx.shadowBlur = 22;
  ctx.lineWidth = Math.max(6, st.size * 0.2);
  ctx.strokeStyle = st.edge;
  ctx.strokeText(j.word, 0, 0);
  ctx.shadowBlur = 0;
  // 채움: 위→아래 그라데이션, 빛나는 단계는 밝은 띠가 왼쪽에서 오른쪽으로 훑는다
  const v = ctx.createLinearGradient(0, -st.size * 0.5, 0, st.size * 0.45);
  v.addColorStop(0, st.top);
  v.addColorStop(1, st.bottom);
  ctx.fillStyle = v;
  ctx.fillText(j.word, 0, 0);
  if (st.shine) {
    const p = Math.min(1.2, el / 420) - 0.1;
    const h = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
    const stop = (x: number) => Math.max(0, Math.min(1, x));
    h.addColorStop(0, 'rgba(255,255,255,0)');
    h.addColorStop(stop(p - 0.12), 'rgba(255,255,255,0)');
    h.addColorStop(stop(p), 'rgba(255,255,255,0.85)');
    h.addColorStop(stop(p + 0.12), 'rgba(255,255,255,0)');
    h.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = h;
    ctx.fillText(j.word, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
  }
  // 위쪽 가는 밝은 선(새김 느낌)
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.strokeText(j.word, 0, -1);
  if (st.crack) {
    // MISS: 글자를 비스듬히 가르는 금
    ctx.strokeStyle = 'rgba(20,6,4,0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-w * 0.55, -st.size * 0.1);
    ctx.lineTo(-w * 0.1, st.size * 0.05);
    ctx.lineTo(w * 0.15, -st.size * 0.08);
    ctx.lineTo(w * 0.55, st.size * 0.12);
    ctx.stroke();
  }
  if (st.stars) {
    // 네 갈래 별 셋이 번갈아 반짝인다
    ctx.fillStyle = '#fffbe6';
    const pts: [number, number][] = [[-w * 0.55, -st.size * 0.45], [w * 0.52, -st.size * 0.3], [w * 0.3, st.size * 0.5]];
    pts.forEach(([sx, sy], i) => {
      const tw = Math.max(0, Math.sin(el / 90 + i * 2.1));
      const r = 9 * tw;
      if (r < 1) return;
      ctx.beginPath();
      ctx.moveTo(sx, sy - r);
      ctx.lineTo(sx + r * 0.25, sy - r * 0.25);
      ctx.lineTo(sx + r, sy);
      ctx.lineTo(sx + r * 0.25, sy + r * 0.25);
      ctx.lineTo(sx, sy + r);
      ctx.lineTo(sx - r * 0.25, sy + r * 0.25);
      ctx.lineTo(sx - r, sy);
      ctx.lineTo(sx - r * 0.25, sy - r * 0.25);
      ctx.closePath();
      ctx.fill();
    });
  }
  // 한국어 작은 글(결·간파·막음·놓침…)
  if (j.sub) {
    ctx.font = `800 ${Math.round(st.size * 0.38)}px "Song Myung", "Nanum Myeongjo", serif`;
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.strokeText(j.sub, 0, st.size * 0.62);
    ctx.fillStyle = st.top;
    ctx.fillText(j.sub, 0, st.size * 0.62);
  }
  ctx.restore();
}

/** 기술 준비: 하운 둘레에 기술 색의 고리가 맥박친다(Codex fx_gyeol_tech_ready가 오면 그것) */
function drawTechAura(ctx: CanvasRenderingContext2D, d: Duel, now: number): void {
  if (!d.techReady || d.result) return;
  const col = TECH_COLOR[d.techReady] ?? TECH_COLOR.unhae;
  const real = readyFx;
  if (real) {
    drawSprite(ctx, real, loopFrame(real, now), PLAYER_X, { alpha: 0.95, tint: `rgba(${col.rgb},0.35)` });
    return;
  }
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const pulse = 0.5 + 0.5 * Math.sin(now / 160);
  for (let i = 0; i < 3; i++) {
    ctx.strokeStyle = `rgba(${col.rgb},${(0.45 - i * 0.12) * (0.6 + 0.4 * pulse)})`;
    ctx.lineWidth = 3 - i * 0.6;
    ctx.beginPath();
    ctx.ellipse(PLAYER_X, GROUND - 4, 60 + i * 14 + pulse * 6, 12 + i * 3, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let i = 0; i < 8; i++) {
    const a = now / 700 + (i / 8) * Math.PI * 2;
    const y = GROUND - 30 - ((now / 6 + i * 40) % 170);
    ctx.fillStyle = `rgba(${col.rgb},${0.7 * (1 - (GROUND - 30 - y) / 170)})`;
    ctx.fillRect(PLAYER_X + Math.cos(a) * 46, y, 3, 3);
  }
  ctx.restore();
}
let readyFx: Anim = null;

/** 기술 연출: Codex fx_gyeol_tech_<id>_a·b(12프레임)가 오면 적 위에 크게, 없으면 코드로 그린 연출 */
function drawTech(ctx: CanvasRenderingContext2D, sp: Sprites, fx: Fx, now: number): void {
  const tc = fx.tech;
  if (!tc) return;
  const el = now - tc.born;
  const A = sp.fx[`fx_gyeol_tech_${tc.id}_a`];
  const B = sp.fx[`fx_gyeol_tech_${tc.id}_b`];
  // 컷인(약 700ms) 뒤에 터진다
  const start = 700;
  const e = el - start;
  const col = TECH_COLOR[tc.id] ?? TECH_COLOR.unhae;
  if (A && B) {
    if (e < 0) return;
    const n = 1 + Math.floor(e / (1000 / A.meta.fps));
    const sheet = n <= A.meta.frames ? A : B;
    const f = n <= A.meta.frames ? n : n - A.meta.frames;
    if (f > sheet.meta.frames) return;
    const img = frameOf(sheet, f);
    if (!img) return;
    const s = SCALE * 2.6;
    const cx = tc.id === 'unhae' ? CONTACT.x + 40 : FOE_X;
    ctx.drawImage(img, cx - (sheet.meta.frameW * s) / 2, CONTACT.y - (sheet.meta.frameH * s) / 2, sheet.meta.frameW * s, sheet.meta.frameH * s);
    return;
  }
  if (e < -500 || e > 1100) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  if (tc.id === 'nakun') {
    // 낙운무흔: 구름 띠가 하늘에서 소용돌이치며 적에게 내려앉는다
    for (let i = 0; i < 7; i++) {
      const k = Math.max(0, Math.min(1, (e + 400 - i * 50) / 600));
      if (k <= 0) continue;
      const a0 = i * 0.9 + k * 4;
      const r = 160 * (1 - k) + 30;
      const x = FOE_X + Math.cos(a0) * r;
      const y = CONTACT.y - 260 * (1 - k) + Math.sin(a0) * r * 0.35;
      const g = ctx.createRadialGradient(x, y, 0, x, y, 46);
      g.addColorStop(0, `rgba(${col.rgb},${0.55 * (1 - Math.max(0, e - 600) / 500)})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, 46, 0, Math.PI * 2);
      ctx.fill();
    }
    if (e > 0) {
      const k = Math.min(1, e / 500);
      ctx.strokeStyle = `rgba(${col.rgb},${0.8 * (1 - k)})`;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.ellipse(FOE_X, GROUND - 10, 40 + 200 * k, 12 + 40 * k, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (tc.id === 'byeogun') {
    // 벽운단하: 하늘에서 내리꽂는 푸른 세로 일섬이 구름과 강을 가른다
    if (e < 0) {
      const k = (e + 500) / 500;
      ctx.strokeStyle = `rgba(${col.rgb},${0.3 + 0.5 * k})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(FOE_X, 0);
      ctx.lineTo(FOE_X, (GROUND + 20) * k);
      ctx.stroke();
    } else {
      const k = Math.min(1, e / 900);
      const w = 70 * (1 - k) + 4;
      const g = ctx.createLinearGradient(FOE_X - w, 0, FOE_X + w, 0);
      g.addColorStop(0, 'rgba(80,170,255,0)');
      g.addColorStop(0.45, `rgba(${col.rgb},${0.9 * (1 - k)})`);
      g.addColorStop(0.5, `rgba(255,255,255,${1 - k})`);
      g.addColorStop(0.55, `rgba(${col.rgb},${0.9 * (1 - k)})`);
      g.addColorStop(1, 'rgba(80,170,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(FOE_X - w, -20, w * 2, H + 40);
      // 갈라진 하늘의 금
      ctx.strokeStyle = `rgba(${col.rgb},${0.7 * (1 - k)})`;
      ctx.lineWidth = 2;
      for (let i = 0; i < 8; i++) {
        const y = 40 + i * 60;
        ctx.beginPath();
        ctx.moveTo(FOE_X, y);
        ctx.lineTo(FOE_X + (i % 2 ? 1 : -1) * (60 + 140 * k), y + 20);
        ctx.stroke();
      }
      // 물보라
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI - Math.PI;
        const r = 30 + 260 * k;
        ctx.fillStyle = `rgba(200,235,255,${0.8 * (1 - k)})`;
        ctx.fillRect(FOE_X + Math.cos(a) * r, GROUND + Math.sin(a) * r * 0.5, 4, 4);
      }
    }
  } else {
    // 운해귀종: 하운 둘레에 구름바다가 소용돌이치고, 받아낸 힘이 금빛 물줄기가 되어 적에게 돌아간다
    const k0 = Math.min(1, (e + 500) / 500);
    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = `rgba(${col.rgb},${0.5 * k0 * (e > 400 ? Math.max(0, 1 - (e - 400) / 500) : 1)})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(PLAYER_X, GROUND - 120, 50 + i * 26, 18 + i * 10, now / 300 + i, 0, Math.PI * 1.6);
      ctx.stroke();
    }
    if (e > -200) {
      const k = Math.min(1, (e + 200) / 500);
      for (let i = 0; i < 12; i++) {
        const off = (i - 6) * 14;
        ctx.strokeStyle = `rgba(${col.rgb},${0.8 * (1 - Math.max(0, e - 300) / 700)})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(PLAYER_X + 20, GROUND - 120 + off * 0.5);
        const ex = PLAYER_X + 20 + (FOE_X - PLAYER_X - 20) * k;
        ctx.bezierCurveTo(PLAYER_X + 120, GROUND - 260 + off, FOE_X - 160, GROUND - 40 - off, ex, CONTACT.y + off * 0.3);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

/** 연속 받기 숫자: 받을 때마다 크게 튀어나오고, 단계가 오르면 더 크게 빛난다 */
function drawCombo(ctx: CanvasRenderingContext2D, fx: Fx, now: number): void {
  const c = fx.combo;
  if (!c) return;
  const el = now - c.born;
  if (el > 2200) return;
  const pop = 1 + (c.up ? 0.9 : 0.55) * Math.max(0, 1 - el / 140) ** 2;
  const alpha = el < 1600 ? 1 : 1 - (el - 1600) / 600;
  const color = c.tier >= 3 ? ['#ffffff', '#ffe08a'] : c.tier === 2 ? ['#fff1c4', '#e8a53a'] : c.tier === 1 ? ['#eaf7ff', '#6fb8ff'] : ['#f2efe8', '#a8a093'];
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(PLAYER_X - 150, GROUND - 260);
  ctx.scale(pop, pop);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = '900 64px "Cinzel", serif';
  ctx.lineJoin = 'round';
  ctx.shadowColor = color[1];
  ctx.shadowBlur = c.tier >= 1 ? 20 : 8;
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#120c06';
  ctx.strokeText(String(c.n), 0, 0);
  ctx.shadowBlur = 0;
  const g = ctx.createLinearGradient(0, -52, 0, 4);
  g.addColorStop(0, color[0]);
  g.addColorStop(1, color[1]);
  ctx.fillStyle = g;
  ctx.fillText(String(c.n), 0, 0);
  ctx.font = '800 18px "Song Myung", serif';
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.strokeText('연속 박자', 0, 24);
  ctx.fillStyle = color[0];
  ctx.fillText('연속 박자', 0, 24);
  ctx.restore();
}

/** 결 연환 구슬 다섯: 이어 받은 만큼 찬다(모두 EXCELLENT면 금빛, 섞이면 은빛). 3에 낙운무흔, 5에 벽운단하·운해귀종 */
const CHAIN_PIPS = 10;

function drawChain(ctx: CanvasRenderingContext2D, fx: Fx): void {
  const c = fx.chain;
  if (c.n <= 0 || fx.finale) return;
  const x0 = PLAYER_X - 150 - 19 * 4.5;
  const y = GROUND - 210;
  ctx.save();
  // 구슬 열 개: 5(낙운무흔·벽운단하)와 10(운해귀종)에 금테
  const gap = 19;
  for (let i = 0; i < CHAIN_PIPS; i++) {
    const on = i < c.n;
    const x = x0 + i * gap;
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fillStyle = on ? (c.pure ? '#ffd27a' : '#c9d4e6') : 'rgba(0,0,0,0.45)';
    ctx.shadowColor = on ? (c.pure ? '#ffd27a' : '#9fc0ec') : 'transparent';
    ctx.shadowBlur = on ? 10 : 0;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = i === 4 || i === 9 ? '#fff0c0' : 'rgba(255,255,255,0.4)';
    ctx.stroke();
  }
  ctx.font = '800 15px "Song Myung", serif';
  ctx.textAlign = 'center';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.strokeText(`결 연환 ${c.n}`, x0 + gap * 4.5, y + 26);
  ctx.fillStyle = c.pure ? '#ffe9b0' : '#d8e2f2';
  ctx.fillText(`결 연환 ${c.n}`, x0 + gap * 4.5, y + 26);
  ctx.restore();
}

/** 받을 수 없는 기술 이름: 붉은 먹 띠 위에 적이 외친 기술명이 미끄러져 들어온다 */
function drawBanner(ctx: CanvasRenderingContext2D, fx: Fx, now: number): void {
  const b = fx.banner;
  if (!b) return;
  const el = now - b.born;
  const life = 1400;
  if (el > life) return;
  const inK = Math.min(1, el / 160);
  const alpha = el < life - 300 ? 1 : (life - el) / 300;
  const col = ELEMENT_COLOR[b.element ?? 'danger'];
  ctx.save();
  ctx.globalAlpha = alpha;
  const cx = FOE_X - 40 + (1 - inK) * 120;
  const cy = GROUND - 300;
  // 먹 붓질 띠(가장자리가 들쭉날쭉한 기울어진 띠)
  ctx.translate(cx, cy);
  ctx.rotate(-0.04);
  ctx.beginPath();
  const w = 300;
  const h = 46;
  ctx.moveTo(-w / 2, -h / 2 + 6);
  for (let i = 0; i <= 12; i++) ctx.lineTo(-w / 2 + (w * i) / 12, -h / 2 + ((i * 37) % 9) - 2);
  for (let i = 12; i >= 0; i--) ctx.lineTo(-w / 2 + (w * i) / 12 + ((i * 13) % 7), h / 2 - ((i * 29) % 8));
  ctx.closePath();
  const g = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
  g.addColorStop(0, 'rgba(90,10,10,0)');
  g.addColorStop(0.12, 'rgba(120,14,14,0.92)');
  g.addColorStop(0.88, 'rgba(120,14,14,0.92)');
  g.addColorStop(1, 'rgba(90,10,10,0)');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = `rgba(${col.line},0.7)`;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '800 30px "Song Myung", "Nanum Myeongjo", serif';
  ctx.shadowColor = col.glow;
  ctx.shadowBlur = 14;
  ctx.lineWidth = 5;
  ctx.strokeStyle = 'rgba(0,0,0,0.9)';
  ctx.strokeText(`「${b.name}」`, 0, 2);
  ctx.fillStyle = '#fff1e8';
  ctx.fillText(`「${b.name}」`, 0, 2);
  ctx.restore();
}

/** 오래된 효과를 지운다 */
export function pruneFx(fx: Fx, now: number): void {
  fx.sparks = fx.sparks.filter((s) => now - s.born < s.life);
  fx.texts = fx.texts.filter((t) => now - t.born < 900);
  fx.bursts = fx.bursts.filter((b) => now - b.born < 600);
  fx.blooms = fx.blooms.filter((b) => now - b.born < 700);
  fx.slashes = fx.slashes.filter((s) => now - s.born < 600);
  fx.judges = fx.judges.filter((j) => now - j.born < JUDGE_STYLE[j.word].life);
  if (fx.tech && now - fx.tech.born > 2600) fx.tech = null;
  if (fx.flash && now - fx.flash.born > fx.flash.life) fx.flash = null;
  if (fx.shake && now - fx.shake.born > fx.shake.life) fx.shake = null;
}

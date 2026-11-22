// 「틈」 소리(2026-11-22 사용자 "게임에 맞는 소리 디자인 전면 추가"): 효과음은 「틈」 전용 합성(WebAudio) —
// 맞히기·치명·쓰러뜨림·결 조각(연속으로 주우면 음이 오른다)·레벨업·보법·마지막 기술·맞음·적 탄·예고·터짐·상자·금화·가게·간파·보스.
// 배경음악은 「천외귀환」 합성 곡(src/render/audio playBgm)을 장면에 맞춰 고른다: 메인 title · 장 battle · 마지막 장/무한 rift · 보스 boss.
// 브라우저는 첫 입력 전에는 소리를 막으므로 첫 클릭·키 입력 때 켠다. 장식이라 Math.random을 쓴다(게임 결과와 무관).
import { initAudio, playBgm, setVolumes } from '../../src/render/audio';
import type { Mood } from '../../src/render/music';

export type TeumSfx =
  | 'hit'
  | 'crit'
  | 'kill'
  | 'gem'
  | 'level'
  | 'dash'
  | 'ult'
  | 'hurt'
  | 'shot'
  | 'warn'
  | 'boom'
  | 'chest'
  | 'coin'
  | 'shop'
  | 'buy'
  | 'counter'
  | 'boss'
  | 'heal'
  | 'zap'
  | 'pick'
  | 'evolve'
  | 'select'
  | 'lose'
  | 'win';

export interface SoundOptions {
  master: number;
  bgm: number;
  sfx: number;
}
export const DEFAULT_SOUND: SoundOptions = { master: 0.8, bgm: 0.5, sfx: 0.8 };

let ctx: AudioContext | null = null;
let out: GainNode;
let comp: DynamicsCompressorNode;
let noise: AudioBuffer;
let vol: SoundOptions = { ...DEFAULT_SOUND };
const lastAt = new Map<TeumSfx, number>();
/** 결 조각을 잇달아 주우면 음이 오른다(0.45초 안) */
let gemStep = 0;
let gemAt = 0;
let started = false;

export function initSound(opts: Partial<SoundOptions> = {}): void {
  vol = { ...DEFAULT_SOUND, ...opts };
  if (started) return applyVolumes();
  started = true;
  initAudio();
  applyVolumes();
  const unlock = () => {
    start();
    if (ctx?.state === 'suspended') void ctx.resume();
  };
  window.addEventListener('pointerdown', unlock, { capture: true });
  window.addEventListener('keydown', unlock, { capture: true });
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) void ctx.suspend();
    else void ctx.resume();
  });
}

export function setSound(opts: SoundOptions): void {
  vol = { ...opts };
  applyVolumes();
}
function applyVolumes(): void {
  setVolumes({ master: vol.master, bgm: vol.bgm, sfx: vol.sfx * 0.6 });
  if (ctx) out.gain.setTargetAtTime(vol.master * vol.sfx * 0.9, ctx.currentTime, 0.05);
}

function start(): void {
  if (ctx || typeof AudioContext === 'undefined') return;
  ctx = new AudioContext();
  comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 6;
  out = ctx.createGain();
  out.gain.value = vol.master * vol.sfx * 0.9;
  out.connect(comp).connect(ctx.destination);
  noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

function env(at: number, attack: number, peak: number, dur: number, dest: AudioNode): GainNode {
  const g = ctx!.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  g.connect(dest);
  return g;
}
function tone(type: OscillatorType, hz: number, at: number, dur: number, peak: number, dest: AudioNode, to?: number, attack = 0.004): void {
  const o = ctx!.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(hz, at);
  if (to) o.frequency.exponentialRampToValueAtTime(to, at + dur);
  o.connect(env(at, attack, peak, dur, dest));
  o.start(at);
  o.stop(at + dur + 0.02);
}
function hiss(at: number, dur: number, peak: number, dest: AudioNode, filter: { type: BiquadFilterType; hz: number; to?: number; q?: number }, attack = 0.003): void {
  const s = ctx!.createBufferSource();
  s.buffer = noise;
  const f = ctx!.createBiquadFilter();
  f.type = filter.type;
  f.frequency.setValueAtTime(filter.hz, at);
  if (filter.to) f.frequency.exponentialRampToValueAtTime(filter.to, at + dur);
  f.Q.value = filter.q ?? 1;
  s.connect(f).connect(env(at, attack, peak, dur, dest));
  s.start(at, Math.random() * 0.5);
  s.stop(at + dur + 0.02);
}

/** 같은 소리가 너무 촘촘히 겹치지 않게(초당 몇 번까지) */
const GAP: Partial<Record<TeumSfx, number>> = { hit: 0.035, crit: 0.06, kill: 0.04, gem: 0.03, shot: 0.08, warn: 0.15, boom: 0.08, coin: 0.05, zap: 0.1, heal: 0.2 };
/** 오음계(결 조각 오르는 음) */
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

/** 효과음 하나. pan: -1(왼)~1(오른), vol: 0~1 */
export function play(name: TeumSfx, opts: { pan?: number; vol?: number } = {}): void {
  if (!ctx || ctx.state !== 'running' || vol.sfx <= 0 || vol.master <= 0) return;
  const now = ctx.currentTime;
  if (now - (lastAt.get(name) ?? -1) < (GAP[name] ?? 0.02)) return;
  lastAt.set(name, now);
  const g = ctx.createGain();
  g.gain.value = opts.vol ?? 1;
  const p = ctx.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, opts.pan ?? 0));
  g.connect(p).connect(out);
  const t = now + 0.003;
  const r = () => 0.9 + Math.random() * 0.2;
  switch (name) {
    case 'hit':
      // 베고 꿰는 짧은 타격: 마른 소음 + 낮은 퉁
      hiss(t, 0.06, 0.32, g, { type: 'bandpass', hz: 1800 * r(), to: 700, q: 1.4 });
      tone('triangle', 220 * r(), t, 0.07, 0.22, g, 90);
      break;
    case 'crit':
      hiss(t, 0.09, 0.45, g, { type: 'highpass', hz: 2500 });
      tone('square', 1320 * r(), t, 0.1, 0.12, g, 880);
      tone('sine', 160, t, 0.16, 0.4, g, 60);
      break;
    case 'kill':
      // 그림자가 흩어진다: 아래로 쓸리는 숨 + 작은 방울
      hiss(t, 0.18, 0.22, g, { type: 'lowpass', hz: 2400, to: 300 });
      tone('sine', 520 * r(), t + 0.01, 0.12, 0.12, g, 260);
      break;
    case 'gem': {
      gemStep = now - gemAt < 0.45 ? Math.min(PENTA.length - 1, gemStep + 1) : 0;
      gemAt = now;
      const hz = 880 * 2 ** (PENTA[gemStep] / 12);
      tone('sine', hz, t, 0.12, 0.16, g);
      tone('triangle', hz * 2, t, 0.06, 0.05, g);
      break;
    }
    case 'pick':
      tone('triangle', 660, t, 0.08, 0.2, g, 990);
      tone('sine', 1320, t + 0.06, 0.12, 0.14, g);
      break;
    case 'level':
      [0, 4, 7, 12, 16].forEach((st, i) => tone('triangle', 523 * 2 ** (st / 12), t + i * 0.06, 0.25, 0.22, g));
      hiss(t, 0.5, 0.08, g, { type: 'highpass', hz: 6000 });
      break;
    case 'select':
      tone('triangle', 784, t, 0.09, 0.2, g);
      tone('triangle', 1175, t + 0.05, 0.14, 0.18, g);
      break;
    case 'dash':
      hiss(t, 0.2, 0.35, g, { type: 'bandpass', hz: 600, to: 3600, q: 0.8 }, 0.02);
      break;
    case 'ult':
      tone('sawtooth', 70, t, 0.9, 0.35, g, 40, 0.02);
      tone('sine', 55, t, 1.0, 0.55, g, 30);
      hiss(t, 1.0, 0.3, g, { type: 'lowpass', hz: 4000, to: 200 }, 0.01);
      [0, 7, 12, 19].forEach((st, i) => tone('triangle', 392 * 2 ** (st / 12), t + 0.15 + i * 0.07, 0.6, 0.12, g));
      break;
    case 'hurt':
      tone('square', 140, t, 0.16, 0.3, g, 70);
      hiss(t, 0.12, 0.35, g, { type: 'lowpass', hz: 1200, to: 300 });
      break;
    case 'shot':
      tone('square', 900 * r(), t, 0.08, 0.06, g, 380);
      break;
    case 'warn':
      tone('sine', 320, t, 0.35, 0.12, g, 640, 0.05);
      break;
    case 'boom':
      tone('sine', 120, t, 0.45, 0.6, g, 35);
      hiss(t, 0.45, 0.5, g, { type: 'lowpass', hz: 2200, to: 120 });
      break;
    case 'zap':
      for (let i = 0; i < 4; i++) tone('sawtooth', 1200 + Math.random() * 1400, t + i * 0.025, 0.04, 0.08, g);
      hiss(t, 0.12, 0.2, g, { type: 'highpass', hz: 4000 });
      break;
    case 'chest':
      [0, 4, 7, 11, 14, 19].forEach((st, i) => tone('sine', 660 * 2 ** (st / 12), t + i * 0.05, 0.3, 0.14, g));
      break;
    case 'evolve':
      [0, 7, 12, 16, 19, 24].forEach((st, i) => tone('triangle', 330 * 2 ** (st / 12), t + i * 0.09, 0.8, 0.16, g));
      tone('sine', 82, t, 1.4, 0.4, g);
      break;
    case 'coin':
      tone('square', 1568, t, 0.05, 0.08, g);
      tone('square', 2093, t + 0.05, 0.1, 0.08, g);
      break;
    case 'buy':
      tone('triangle', 988, t, 0.08, 0.16, g);
      tone('triangle', 1319, t + 0.07, 0.14, 0.16, g);
      hiss(t, 0.05, 0.1, g, { type: 'highpass', hz: 5000 });
      break;
    case 'shop':
      // 작은 방울: 가게 문을 연다
      [0, 5, 9].forEach((st, i) => tone('sine', 1046 * 2 ** (st / 12), t + i * 0.08, 0.4, 0.1, g));
      break;
    case 'counter':
      // 간파: 징 + 맑은 종
      tone('sine', 196, t, 1.2, 0.4, g, 180);
      tone('triangle', 1568, t, 0.6, 0.18, g);
      tone('sine', 2349, t + 0.02, 0.5, 0.1, g);
      break;
    case 'boss':
      tone('sawtooth', 55, t, 1.6, 0.3, g, 48, 0.2);
      tone('sawtooth', 82, t + 0.1, 1.5, 0.2, g, 70, 0.2);
      hiss(t, 1.4, 0.15, g, { type: 'lowpass', hz: 600, to: 200 }, 0.3);
      break;
    case 'heal':
      tone('sine', 784, t, 0.3, 0.12, g, 1175);
      break;
    case 'lose':
      [0, -3, -7, -12].forEach((st, i) => tone('triangle', 392 * 2 ** (st / 12), t + i * 0.18, 0.5, 0.2, g));
      break;
    case 'win':
      [0, 4, 7, 12, 7, 12, 16].forEach((st, i) => tone('triangle', 523 * 2 ** (st / 12), t + i * 0.1, 0.4, 0.2, g));
      break;
  }
}

/** 배경음악: 장면에 맞는 곡(같은 곡이면 그대로) */
export function music(mood: Mood | null): void {
  playBgm(mood);
}

// 소리(2026-10-08): WebAudio로 합성한 효과음과 배경음악(악보는 src/render/music.ts).
// assets/audio/bgm/<곡>.(ogg|mp3)·assets/audio/sfx/<이름>.(ogg|mp3|wav) 파일이 있으면 합성 대신 그 파일을 쓴다(CC0·직접 만든 음원을 나중에 넣는 자리).
// 브라우저는 사용자가 한 번 누르기 전에는 소리를 막으므로, 첫 클릭·키 입력 때 켠다. 그 전의 요청(곡)은 기억했다가 켜질 때 튼다.
import { composeBar, midiToHz, TRACKS, type Mood, type NoteEvent, type Voice } from './music';

export type Sfx =
  | 'click'
  | 'card'
  | 'hit'
  | 'hit_heavy'
  | 'crit'
  | 'fire'
  | 'ice'
  | 'block'
  | 'heal'
  | 'status'
  | 'rift'
  | 'surge'
  | 'relic'
  | 'potion'
  | 'coin'
  | 'down'
  | 'transform'
  | 'levelup'
  | 'victory'
  | 'defeat'
  | 'turn'
  | 'cutin'
  | 'power'
  | 'summon'
  | 'enrage'
  | 'discard';

const files = import.meta.glob('../../assets/audio/**/*.{ogg,mp3,wav}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const fileFor = (kind: 'bgm' | 'sfx', name: string): string | undefined =>
  Object.entries(files).find(([path]) => new RegExp(`/audio/${kind}/${name}\\.(ogg|mp3|wav)$`).test(path))?.[1];

export interface Volumes {
  master: number;
  bgm: number;
  sfx: number;
}

let ctx: AudioContext | null = null;
let master: GainNode;
let bgmBus: GainNode;
let sfxBus: GainNode;
let noise: AudioBuffer;
let reverb: ConvolverNode;
let volumes: Volumes = { master: 0.8, bgm: 0.55, sfx: 0.8 };
let wanted: Mood | null = null;
const buffers = new Map<string, Promise<AudioBuffer | null>>();

/** 설정의 소리 크기(0~1) */
export function setVolumes(v: Volumes): void {
  volumes = { ...v };
  if (!ctx) return;
  const t = ctx.currentTime;
  master.gain.setTargetAtTime(volumes.master, t, 0.05);
  bgmBus.gain.setTargetAtTime(volumes.bgm * 0.6, t, 0.05);
  // 효과음은 음악 위로 들리게 조금 크게(제한기가 겹침을 누른다)
  sfxBus.gain.setTargetAtTime(volumes.sfx * 1.25, t, 0.05);
}

/** 첫 입력에 소리를 켠다(한 번만 걸면 된다) */
export function initAudio(): void {
  const unlock = () => {
    start();
    if (ctx?.state === 'suspended') void ctx.resume();
  };
  window.addEventListener('pointerdown', unlock, { capture: true });
  window.addEventListener('keydown', unlock, { capture: true });
  // 버튼 누르는 소리
  document.addEventListener('click', (e) => {
    const t = e.target as HTMLElement | null;
    if (t?.closest('button, .btn, [role=tab]')) sfx('click');
  });
  // 탭을 숨기면 쉰다
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) void ctx.suspend();
    else void ctx.resume();
  });
}

function start(): void {
  if (ctx || typeof AudioContext === 'undefined') return;
  ctx = new AudioContext();
  master = ctx.createGain();
  // 마지막에 거는 제한기: 타격이 겹쳐도 찢어지지 않게
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.15;
  master.connect(limiter).connect(ctx.destination);
  bgmBus = ctx.createGain();
  sfxBus = ctx.createGain();
  // 잔향: 짧은 소음을 줄여 가며 만든 방 울림(곡에만 조금)
  reverb = ctx.createConvolver();
  const len = Math.floor(ctx.sampleRate * 2.2);
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  }
  reverb.buffer = ir;
  const wet = ctx.createGain();
  wet.gain.value = 0.28;
  bgmBus.connect(master);
  bgmBus.connect(reverb).connect(wet).connect(master);
  sfxBus.connect(master);
  noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  setVolumes(volumes);
  if (wanted) {
    const m = wanted;
    wanted = null;
    playBgm(m);
  }
}

function loadFile(url: string): Promise<AudioBuffer | null> {
  let p = buffers.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => r.arrayBuffer())
      .then((b) => ctx!.decodeAudioData(b))
      .catch(() => null);
    buffers.set(url, p);
  }
  return p;
}

// ───────────────────────── 합성 도구 ─────────────────────────

/** 감쇠 포락선이 걸린 게인 */
function env(at: number, attack: number, peak: number, decay: number, out: AudioNode): GainNode {
  const g = ctx!.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  g.connect(out);
  return g;
}

function tone(type: OscillatorType, hz: number, at: number, dur: number, peak: number, out: AudioNode, opts: { attack?: number; to?: number; detune?: number } = {}): void {
  const o = ctx!.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(hz, at);
  if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, at + dur);
  if (opts.detune) o.detune.value = opts.detune;
  o.connect(env(at, opts.attack ?? 0.005, peak, dur, out));
  o.start(at);
  o.stop(at + (opts.attack ?? 0.005) + dur + 0.05);
}

function burst(at: number, dur: number, peak: number, out: AudioNode, filter: { type: BiquadFilterType; hz: number; to?: number; q?: number }): void {
  const s = ctx!.createBufferSource();
  s.buffer = noise;
  const f = ctx!.createBiquadFilter();
  f.type = filter.type;
  f.frequency.setValueAtTime(filter.hz, at);
  if (filter.to) f.frequency.exponentialRampToValueAtTime(filter.to, at + dur);
  f.Q.value = filter.q ?? 1;
  s.connect(f).connect(env(at, 0.004, peak, dur, out));
  s.start(at, Math.random() * 0.5);
  s.stop(at + dur + 0.05);
}

// ───────────────────────── 효과음 ─────────────────────────

/** 같은 소리가 한 순간에 겹쳐 터지지 않게(다단 공격 등) */
const lastAt = new Map<Sfx, number>();

export function sfx(name: Sfx, opts: { pan?: number; volume?: number } = {}): void {
  if (!ctx || ctx.state !== 'running' || volumes.sfx <= 0) return;
  const now = ctx.currentTime;
  if (now - (lastAt.get(name) ?? -1) < 0.03) return;
  lastAt.set(name, now);
  const out = ctx.createGain();
  out.gain.value = opts.volume ?? 1;
  const panner = ctx.createStereoPanner();
  panner.pan.value = Math.max(-1, Math.min(1, opts.pan ?? 0));
  out.connect(panner).connect(sfxBus);
  const url = fileFor('sfx', name);
  if (url) {
    void loadFile(url).then((buf) => {
      if (!buf || !ctx) return;
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.connect(out);
      s.start();
    });
    return;
  }
  const t = now + 0.005;
  switch (name) {
    case 'click':
      tone('triangle', 1400, t, 0.04, 0.12, out);
      break;
    case 'card':
      // 종이 스치는 소리
      burst(t, 0.12, 0.35, out, { type: 'bandpass', hz: 2500, to: 5000, q: 0.8 });
      break;
    case 'turn':
      tone('sine', 660, t, 0.25, 0.15, out);
      tone('sine', 990, t + 0.06, 0.3, 0.1, out);
      break;
    case 'hit':
      burst(t, 0.09, 0.6, out, { type: 'lowpass', hz: 3000, to: 600 });
      tone('sine', 180, t, 0.12, 0.6, out, { to: 70 });
      break;
    case 'hit_heavy':
      burst(t, 0.18, 0.8, out, { type: 'lowpass', hz: 2500, to: 300 });
      tone('sine', 140, t, 0.25, 0.9, out, { to: 45 });
      tone('square', 90, t, 0.08, 0.15, out, { to: 50 });
      break;
    case 'crit':
      burst(t, 0.2, 0.8, out, { type: 'lowpass', hz: 4000, to: 300 });
      tone('sine', 150, t, 0.3, 1, out, { to: 40 });
      // 쇳소리
      tone('triangle', 2400, t, 0.35, 0.18, out, { to: 1800 });
      tone('sine', 3600, t + 0.01, 0.25, 0.1, out);
      break;
    case 'fire':
      // 확 붙는 불길
      burst(t, 0.45, 1, out, { type: 'bandpass', hz: 500, to: 2400, q: 0.6 });
      burst(t, 0.2, 0.5, out, { type: 'lowpass', hz: 400 });
      break;
    case 'ice':
      for (const [i, hz] of [2600, 3500, 4400].entries()) tone('sine', hz, t + i * 0.03, 0.3, 0.1, out);
      burst(t, 0.15, 0.2, out, { type: 'highpass', hz: 5000 });
      break;
    case 'block':
      // 막는 소리: 둔탁한 나무 + 쇠
      tone('triangle', 420, t, 0.12, 0.35, out, { to: 300 });
      burst(t, 0.06, 0.3, out, { type: 'bandpass', hz: 1800, q: 2 });
      break;
    case 'heal':
      [72, 76, 79, 84].forEach((m, i) => tone('sine', midiToHz(m), t + i * 0.06, 0.4, 0.14, out, { attack: 0.02 }));
      break;
    case 'status':
      tone('triangle', 520, t, 0.15, 0.12, out, { to: 380 });
      break;
    case 'rift':
      tone('sawtooth', 70, t, 0.6, 0.18, out, { to: 52, attack: 0.05 });
      tone('sine', 1760, t, 0.4, 0.05, out, { detune: 30 });
      break;
    case 'surge':
      tone('sawtooth', 55, t, 1.2, 0.35, out, { to: 30, attack: 0.08 });
      burst(t, 1.1, 0.5, out, { type: 'lowpass', hz: 200, to: 2000 });
      tone('square', 110, t + 0.1, 0.8, 0.08, out, { detune: 25 });
      break;
    case 'relic':
      tone('sine', 1320, t, 0.3, 0.12, out);
      tone('sine', 1980, t + 0.05, 0.3, 0.08, out);
      break;
    case 'potion':
      // 병 따는 소리 + 꿀꺽
      burst(t, 0.05, 0.3, out, { type: 'bandpass', hz: 1500, q: 3 });
      tone('sine', 300, t + 0.08, 0.15, 0.3, out, { to: 600 });
      break;
    case 'coin':
      tone('square', 1800, t, 0.06, 0.08, out);
      tone('square', 2400, t + 0.06, 0.18, 0.08, out);
      break;
    case 'down':
      tone('sine', 220, t, 0.6, 0.4, out, { to: 60 });
      burst(t, 0.3, 0.3, out, { type: 'lowpass', hz: 800, to: 100 });
      break;
    case 'transform':
      tone('sawtooth', 80, t, 1.0, 0.25, out, { to: 160, attack: 0.1 });
      tone('sine', 40, t, 1.2, 0.5, out);
      burst(t, 0.8, 0.3, out, { type: 'bandpass', hz: 300, to: 3000 });
      break;
    case 'levelup':
      [67, 71, 74, 79].forEach((m, i) => tone('triangle', midiToHz(m), t + i * 0.08, 0.5, 0.18, out));
      break;
    case 'victory':
      [69, 72, 76, 81].forEach((m, i) => tone('triangle', midiToHz(m), t + i * 0.12, i === 3 ? 1.4 : 0.4, 0.2, out));
      tone('sine', midiToHz(45), t, 1.6, 0.3, out);
      break;
    case 'cutin':
      // 검을 뽑는 쇳소리
      burst(t, 0.3, 0.5, out, { type: 'highpass', hz: 3000, to: 6000 });
      tone('triangle', 2200, t + 0.05, 0.4, 0.12, out, { to: 2600 });
      break;
    case 'power':
      [74, 79, 86].forEach((m, i) => tone('sine', midiToHz(m), t + i * 0.05, 0.35, 0.08, out, { attack: 0.02 }));
      break;
    case 'summon':
      tone('sawtooth', 110, t, 0.5, 0.18, out, { to: 70, attack: 0.05 });
      burst(t, 0.4, 0.3, out, { type: 'bandpass', hz: 400, to: 1200 });
      break;
    case 'enrage':
      tone('sawtooth', 90, t, 0.6, 0.3, out, { to: 140, attack: 0.03 });
      tone('square', 60, t, 0.5, 0.15, out);
      break;
    case 'discard':
      burst(t, 0.1, 0.25, out, { type: 'bandpass', hz: 1800, to: 900, q: 0.7 });
      break;
    case 'defeat':
      [64, 63, 60, 57].forEach((m, i) => tone('triangle', midiToHz(m), t + i * 0.28, i === 3 ? 1.6 : 0.5, 0.18, out));
      tone('sine', midiToHz(33), t, 2.2, 0.35, out);
      break;
  }
}

// ───────────────────────── 배경음악 ─────────────────────────

interface Playing {
  mood: Mood;
  gain: GainNode;
  timer: number | null;
  source: AudioBufferSourceNode | null;
}
let playing: Playing | null = null;

function voice(v: Voice, ev: NoteEvent, at: number, beat: number, out: AudioNode): void {
  const hz = midiToHz(ev.midi);
  const len = ev.length * beat;
  const vel = ev.velocity;
  switch (v) {
    case 'pluck':
      // 고쟁: 세모파 + 살짝 내려앉는 음높이 + 빠른 감쇠
      tone('triangle', hz * 1.01, at, Math.min(1.6, len + 0.6), 0.28 * vel, out, { to: hz });
      tone('sine', hz * 2, at, 0.25, 0.06 * vel, out);
      break;
    case 'harp':
      tone('sine', hz, at, Math.min(1.8, len + 0.8), 0.22 * vel, out);
      tone('triangle', hz * 2, at, 0.3, 0.04 * vel, out);
      break;
    case 'bell':
      tone('sine', hz, at, 2.2, 0.18 * vel, out);
      tone('sine', hz * 2.76, at, 0.9, 0.06 * vel, out);
      tone('sine', hz * 5.4, at, 0.4, 0.03 * vel, out);
      break;
    case 'glass':
      tone('sine', hz * 2, at, 2.8, 0.1 * vel, out, { attack: 0.3, detune: 12 });
      tone('sine', hz * 3.01, at, 2.0, 0.04 * vel, out, { attack: 0.4 });
      break;
    case 'pad': {
      const o = ctx!.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = hz;
      const f = ctx!.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 900;
      const g = ctx!.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.linearRampToValueAtTime(0.05 * vel, at + Math.min(1.2, len * 0.4));
      g.gain.linearRampToValueAtTime(0.0001, at + len + 0.3);
      o.connect(f).connect(g).connect(out);
      o.start(at);
      o.stop(at + len + 0.4);
      break;
    }
    case 'drone': {
      for (const det of [-6, 6]) {
        const o = ctx!.createOscillator();
        o.type = 'sine';
        o.frequency.value = hz;
        o.detune.value = det;
        const g = ctx!.createGain();
        g.gain.setValueAtTime(0.0001, at);
        g.gain.linearRampToValueAtTime(0.12 * vel, at + len * 0.3);
        g.gain.linearRampToValueAtTime(0.0001, at + len + 0.2);
        o.connect(g).connect(out);
        o.start(at);
        o.stop(at + len + 0.3);
      }
      break;
    }
    case 'bass':
      tone('triangle', hz, at, len, 0.32 * vel, out);
      tone('sine', hz / 2, at, len, 0.2 * vel, out);
      break;
    case 'drum':
      // 큰북(타고): 내려앉는 사인 + 가죽 소음
      tone('sine', 110, at, 0.35, 0.7 * vel, out, { to: 42 });
      burst(at, 0.08, 0.25 * vel, out, { type: 'lowpass', hz: 900 });
      break;
    case 'hat':
      burst(at, 0.04, 0.12 * vel, out, { type: 'highpass', hz: 6000 });
      break;
  }
}

/** 곡을 바꾼다(같은 곡이면 그대로). 1.2초 동안 엇갈려 바뀐다. null이면 멈춤 */
export function playBgm(mood: Mood | null): void {
  if (!ctx) {
    wanted = mood;
    return;
  }
  if (playing?.mood === mood) return;
  const t = ctx.currentTime;
  if (playing) {
    const old = playing;
    old.gain.gain.cancelScheduledValues(t);
    old.gain.gain.setValueAtTime(old.gain.gain.value, t);
    old.gain.gain.linearRampToValueAtTime(0.0001, t + 1.2);
    if (old.timer !== null) clearInterval(old.timer);
    setTimeout(() => {
      old.source?.stop();
      old.gain.disconnect();
    }, 1500);
    playing = null;
  }
  if (!mood) return;
  const url = fileFor('bgm', mood);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.linearRampToValueAtTime(url ? 1 : TRACKS[mood].gain, t + 1.2);
  gain.connect(bgmBus);
  const now: Playing = { mood, gain, timer: null, source: null };
  playing = now;

  if (url) {
    void loadFile(url).then((buf) => {
      if (!buf || !ctx || playing !== now) return;
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      s.connect(gain);
      s.start();
      now.source = s;
    });
    return;
  }

  // 합성: 0.1초마다 0.4초 앞까지 마디를 미리 걸어 둔다
  const track = TRACKS[mood];
  const beat = 60 / track.bpm;
  const barLen = beat * track.beatsPerBar;
  let bar = 0;
  let barStart = t + 0.1;
  const schedule = () => {
    if (!ctx || playing !== now) return;
    while (barStart < ctx.currentTime + 0.4) {
      for (const ev of composeBar(track, bar)) voice(ev.voice, ev, barStart + ev.beat * beat, beat, gain);
      bar += 1;
      barStart += barLen;
    }
  };
  schedule();
  now.timer = window.setInterval(schedule, 100);
}

export const currentBgm = (): Mood | null => playing?.mood ?? wanted;

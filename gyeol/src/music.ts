// 「결」 음악(2026-11-11 사용자 요청 — "패링 리듬 액션인데 음악적 효과가 너무 없다"): 모든 화면에 곡, 대결은 지역·보스 곡,
// 연속 박자 단계에 따라 층이 쌓이고(작은 북 → 선율 겹침 → 종), 받아칠 때마다 곡의 음계 위 음이 울려 받은 결이 선율이 된다.
// 마디는 「천외귀환」 합성 음악의 악보 함수(src/render/music.ts composeBar · degreeToMidi)로 만들고, 소리는 여기서 합성한다
// (「천외귀환」 소리 함수는 곡 목록이 정해져 있어 그대로 쓸 수 없다 — 그쪽 코드는 고치지 않는다). 곡 정의는 gyeol/data/music.json.
// 연출용이라 Math.random을 쓴다(판정과 무관).
import musicRaw from '../data/music.json';
import { composeBar, degreeToMidi, midiToHz, type Mood, type NoteEvent, type Track, type Voice } from '../../src/render/music';

interface TrackDef {
  bpm: number;
  root: number;
  scale: string;
  progression: number[];
  lead: Voice | null;
  density: number;
  rest: number;
  backing: Track['backing'];
  gain: number;
}
interface MusicData {
  scales: Record<string, number[]>;
  tracks: Record<string, TrackDef>;
  screens: Record<string, string | null>;
  regions: Record<string, string>;
  bossTrack: string;
  finalTrack: string;
  finalFoes: string[];
  layers: { hat: number; double: number; bell: number };
  notes: { parryStep: number; parryTop: number; perfectChord: number[] };
}
export const MUSIC = musicRaw as unknown as MusicData;

/** 곡 정의 → 「천외귀환」 악보 함수가 읽는 Track(이름은 선율 씨앗으로만 쓰인다) */
export function trackOf(id: string, bpm?: number): Track | null {
  const t = MUSIC.tracks[id];
  if (!t) return null;
  return { mood: id as Mood, bpm: bpm ?? t.bpm, beatsPerBar: 4, root: t.root, scale: MUSIC.scales[t.scale] ?? MUSIC.scales.penta, progression: t.progression, lead: t.lead, density: t.density, rest: t.rest, backing: t.backing, gain: t.gain };
}

/** 대결 곡: 마지막 보스 → 보스(3단계 이상) → 지역(배경 그림) */
export function battleTrack(foe: { id: string; bg?: string; phases?: unknown[] }): string {
  if (MUSIC.finalFoes.includes(foe.id)) return MUSIC.finalTrack;
  if ((foe.phases?.length ?? 0) >= 2) return MUSIC.bossTrack;
  return (foe.bg && MUSIC.regions[foe.bg]) || 'murim';
}

/** 박자 도전 악보의 빠르기: 결 사이 간격의 가운데 값을 한 박(또는 두 박)으로 — 90~140 사이 */
export function chartBpm(steps: { at: number }[]): number {
  const gaps = steps
    .slice(1)
    .map((s, i) => s.at - steps[i].at)
    .filter((g) => g > 120)
    .sort((a, b) => a - b);
  if (!gaps.length) return MUSIC.tracks.rhythm.bpm;
  let bpm = 60000 / gaps[Math.floor(gaps.length / 2)];
  while (bpm < 90) bpm *= 2;
  while (bpm > 140) bpm /= 2;
  return Math.round(bpm);
}

/** 연속 박자 단계에 쌓는 층(순수 함수 — 테스트한다) */
export function layerEvents(track: Track, bar: number, intensity: number, base: NoteEvent[]): NoteEvent[] {
  const out: NoteEvent[] = [];
  const L = MUSIC.layers;
  const chord = track.progression[bar % track.progression.length];
  if (intensity >= L.hat) for (let b = 0.25; b < 4; b += 0.5) out.push({ voice: 'hat', beat: b, length: 0.2, midi: 0, velocity: 0.25 });
  if (intensity >= L.double) for (const e of base) if (e.voice === track.lead) out.push({ ...e, midi: e.midi + 12, velocity: e.velocity * 0.45 });
  if (intensity >= L.bell) for (let b = 0; b < 4; b += 1) out.push({ voice: 'bell', beat: b, length: 1, midi: degreeToMidi(track, chord + (b % 2 ? 4 : 2), 1), velocity: 0.35 });
  return out;
}

/* ───────── 소리 ───────── */

let ctx: AudioContext | null = null;
let musicBus: GainNode | null = null;
let noteBus: GainNode | null = null;
let filter: BiquadFilterNode | null = null;
let vol = { music: 0.45, notes: 0.65 };

function audio(): AudioContext | null {
  try {
    if (!ctx) {
      ctx = new AudioContext();
      filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 18000;
      musicBus = ctx.createGain();
      noteBus = ctx.createGain();
      musicBus.gain.value = vol.music;
      noteBus.gain.value = vol.notes;
      musicBus.connect(filter).connect(ctx.destination);
      noteBus.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

// 브라우저는 사람이 한 번 누르기 전에는 소리를 막는다 — 첫 입력에 깨우고 기다리던 곡을 튼다
let unlocked = false;
function unlock(): void {
  if (unlocked) return;
  const c = audio();
  if (!c) return;
  void c.resume().then(() => {
    unlocked = c.state === 'running';
    if (unlocked && wanted && !playing) start(wanted.id, wanted.bpm);
  });
}
if (typeof window !== 'undefined') {
  for (const ev of ['pointerdown', 'keydown'] as const) window.addEventListener(ev, unlock, { capture: true });
}

/** 설정의 소리 크기(전체 × 배경 음악 / 전체 × 효과음) */
export function setMusicVolumes(master: number, bgm: number, sfx: number): void {
  vol = { music: master * bgm * 0.8, notes: master * sfx * 0.9 };
  if (ctx && musicBus && noteBus) {
    musicBus.gain.setTargetAtTime(duck ? vol.music * 0.35 : vol.music, ctx.currentTime, 0.1);
    noteBus.gain.setTargetAtTime(vol.notes, ctx.currentTime, 0.05);
  }
}

function tone(type: OscillatorType, hz: number, at: number, len: number, gain: number, out: AudioNode, o: { to?: number; attack?: number; detune?: number } = {}): void {
  const c = ctx!;
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(hz, at);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, at + len);
  if (o.detune) osc.detune.value = o.detune;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(gain, at + (o.attack ?? 0.008));
  g.gain.exponentialRampToValueAtTime(0.0001, at + len);
  osc.connect(g).connect(out);
  osc.start(at);
  osc.stop(at + len + 0.05);
}

function noise(at: number, len: number, gain: number, out: AudioNode, f: { type: BiquadFilterType; hz: number }): void {
  const c = ctx!;
  const buf = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * len)), c.sampleRate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / ch.length);
  const src = c.createBufferSource();
  src.buffer = buf;
  const bq = c.createBiquadFilter();
  bq.type = f.type;
  bq.frequency.value = f.hz;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(bq).connect(g).connect(out);
  src.start(at);
}

/** 악기 하나(「천외귀환」 합성 악기와 같은 소리를 이쪽에서 다시 만든다) */
function play(ev: NoteEvent, at: number, beat: number, out: AudioNode): void {
  const hz = midiToHz(ev.midi);
  const len = ev.length * beat;
  const v = ev.velocity;
  switch (ev.voice) {
    case 'pluck':
      tone('triangle', hz * 1.01, at, Math.min(1.6, len + 0.6), 0.28 * v, out, { to: hz });
      tone('sine', hz * 2, at, 0.25, 0.06 * v, out);
      break;
    case 'harp':
      tone('sine', hz, at, Math.min(1.8, len + 0.8), 0.22 * v, out);
      tone('triangle', hz * 2, at, 0.3, 0.04 * v, out);
      break;
    case 'bell':
      tone('sine', hz, at, 2.2, 0.18 * v, out);
      tone('sine', hz * 2.76, at, 0.9, 0.06 * v, out);
      tone('sine', hz * 5.4, at, 0.4, 0.03 * v, out);
      break;
    case 'glass':
      tone('sine', hz * 2, at, 2.8, 0.1 * v, out, { attack: 0.3, detune: 12 });
      tone('sine', hz * 3.01, at, 2.0, 0.04 * v, out, { attack: 0.4 });
      break;
    case 'pad':
      tone('sawtooth', hz, at, len + 0.3, 0.035 * v, out, { attack: Math.min(1.2, len * 0.4) });
      break;
    case 'drone':
      tone('sine', hz, at, len + 0.2, 0.12 * v, out, { attack: len * 0.3, detune: -6 });
      tone('sine', hz, at, len + 0.2, 0.12 * v, out, { attack: len * 0.3, detune: 6 });
      break;
    case 'bass':
      tone('triangle', hz, at, len, 0.32 * v, out);
      tone('sine', hz / 2, at, len, 0.2 * v, out);
      break;
    case 'drum':
      tone('sine', 110, at, 0.35, 0.7 * v, out, { to: 42 });
      noise(at, 0.08, 0.25 * v, out, { type: 'lowpass', hz: 900 });
      break;
    case 'hat':
      noise(at, 0.04, 0.12 * v, out, { type: 'highpass', hz: 6000 });
      break;
  }
}

interface Playing {
  id: string;
  track: Track;
  gain: GainNode;
  timer: number;
  bar: number;
  barStart: number;
}
let playing: Playing | null = null;
let wanted: { id: string; bpm?: number } | null = null;
let intensity = 0;
let duck = false;

function stopPlaying(fade = 1): void {
  if (!ctx || !playing) return;
  const old = playing;
  clearInterval(old.timer);
  const t = ctx.currentTime;
  old.gain.gain.cancelScheduledValues(t);
  old.gain.gain.setValueAtTime(old.gain.gain.value, t);
  old.gain.gain.linearRampToValueAtTime(0.0001, t + fade);
  setTimeout(() => old.gain.disconnect(), fade * 1000 + 300);
  playing = null;
}

function start(id: string, bpm?: number): void {
  const c = audio();
  const track = trackOf(id, bpm);
  if (!c || !track || !musicBus) return;
  stopPlaying();
  const gain = c.createGain();
  const t = c.currentTime;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.linearRampToValueAtTime(track.gain, t + 1.2);
  gain.connect(musicBus);
  const now: Playing = { id, track, gain, timer: 0, bar: 0, barStart: t + 0.12 };
  const beat = 60 / track.bpm;
  const schedule = () => {
    if (!ctx || playing !== now) return;
    while (now.barStart < ctx.currentTime + 0.4) {
      const base = composeBar(track, now.bar);
      for (const ev of [...base, ...layerEvents(track, now.bar, intensity, base)]) play(ev, now.barStart + ev.beat * beat, beat, gain);
      now.bar += 1;
      now.barStart += beat * track.beatsPerBar;
    }
  };
  playing = now;
  schedule();
  now.timer = window.setInterval(schedule, 100);
}

/** 곡을 바꾼다(같은 곡·같은 빠르기면 그대로, null이면 멈춤). 소리가 아직 막혀 있으면 첫 입력 뒤에 튼다 */
export function setMusic(id: string | null, bpm?: number): void {
  wanted = id ? { id, bpm } : null;
  intensity = 0;
  setCrisis(false);
  if (!id) return stopPlaying(1.2);
  if (playing?.id === id && (!bpm || playing.track.bpm === bpm)) return;
  if (!ctx || ctx.state !== 'running') {
    audio();
    if (!unlocked) return;
  }
  start(id, bpm);
}

/** 연속 박자 단계(0~3): 다음 마디부터 층이 쌓인다 */
export function setIntensity(n: number): void {
  intensity = Math.max(0, Math.min(3, n));
}

/** 위기: 곡이 물속처럼 멀어진다(높은 소리를 깎는다) */
export function setCrisis(on: boolean): void {
  if (!ctx || !filter) return;
  filter.frequency.setTargetAtTime(on ? 900 : 18000, ctx.currentTime, 0.25);
}

/** 일시 정지·장면 창: 곡을 낮춘다 */
export function setDuck(on: boolean): void {
  duck = on;
  if (ctx && musicBus) musicBus.gain.setTargetAtTime(on ? vol.music * 0.35 : vol.music, ctx.currentTime, 0.15);
}

/* ───────── 받아친 결이 선율이 된다 ───────── */

const current = (): Track => playing?.track ?? trackOf('murim')!;
let parryDegree = 0;

/**
 * 판정 소리: parry(받기 — 연속 박자만큼 음계를 오른다, PERFECT면 종 화음) · miss(맞음 — 반음 부딪힘) ·
 * deathblow(결정타 — 마침 화음) · stagger(체간 붕괴 — 북) · phase(다음 단계 — 낮은 울림 + 북 굴림) · win · lose
 */
export function musicalHit(kind: 'parry' | 'perfect' | 'miss' | 'deathblow' | 'stagger' | 'phase' | 'win' | 'lose', streak = 0): void {
  const c = audio();
  if (!c || c.state !== 'running' || !noteBus) return;
  const tr = current();
  const t = c.currentTime + 0.005;
  const N = MUSIC.notes;
  const n = tr.scale.length;
  switch (kind) {
    case 'parry':
    case 'perfect': {
      parryDegree = streak <= 1 ? 0 : Math.min(N.parryTop, parryDegree + N.parryStep);
      const deg = n + parryDegree;
      play({ voice: 'pluck', beat: 0, length: 0.5, midi: degreeToMidi(tr, deg, 1), velocity: 0.9 }, t, 0.4, noteBus);
      if (kind === 'perfect') for (const k of N.perfectChord) play({ voice: 'bell', beat: 0, length: 1, midi: degreeToMidi(tr, deg + k, 1), velocity: 0.55 }, t + 0.02, 0.4, noteBus);
      break;
    }
    case 'miss':
      parryDegree = 0;
      play({ voice: 'bass', beat: 0, length: 0.6, midi: tr.root - 12, velocity: 0.9 }, t, 0.4, noteBus);
      play({ voice: 'glass', beat: 0, length: 0.6, midi: tr.root + 1, velocity: 0.7 }, t, 0.4, noteBus);
      break;
    case 'stagger':
      play({ voice: 'drum', beat: 0, length: 0.5, midi: 0, velocity: 1 }, t, 0.4, noteBus);
      play({ voice: 'drum', beat: 0, length: 0.5, midi: 0, velocity: 0.8 }, t + 0.12, 0.4, noteBus);
      break;
    case 'deathblow':
    case 'win':
      // 마침 화음: 5도 → 으뜸(아래에서 위로 펼친다)
      [0, 2, 4, n].forEach((k, i) => play({ voice: 'bell', beat: 0, length: 1.5, midi: degreeToMidi(tr, k, 1), velocity: 0.6 }, t + i * 0.07, 0.5, noteBus!));
      play({ voice: 'drum', beat: 0, length: 0.5, midi: 0, velocity: 1 }, t, 0.4, noteBus);
      break;
    case 'lose':
      [4, 2, 0].forEach((k, i) => play({ voice: 'harp', beat: 0, length: 2, midi: degreeToMidi(tr, k, 0), velocity: 0.6 }, t + i * 0.22, 0.6, noteBus!));
      break;
    case 'phase':
      play({ voice: 'drone', beat: 0, length: 3, midi: tr.root - 24, velocity: 0.9 }, t, 0.5, noteBus);
      for (let i = 0; i < 6; i++) play({ voice: 'drum', beat: 0, length: 0.3, midi: 0, velocity: 0.4 + i * 0.1 }, t + i * 0.08, 0.3, noteBus);
      break;
  }
}

/** 시험용 */
export const musicState = () => ({ id: playing?.id ?? wanted?.id ?? null, intensity, unlocked });

// 합성 배경음악의 악보(순수 함수, WebAudio 없이 테스트한다). src/render/audio.ts가 이 악보를 소리로 바꾼다.
// 곡마다 박자·음계·화성 진행·악기 구성을 두고, 마디마다 선율을 곡 이름 + 마디 번호로 정한 의사 난수로 만든다
// (같은 곡은 늘 같은 선율 — 엔진의 시드 RNG와는 상관없는 연출용).

export type Mood = 'title' | 'murim' | 'elheim' | 'nocturna' | 'rift' | 'battle' | 'boss' | 'ending';

/** 악기: pluck 고쟁(뜯는 현) · harp 하프 · bell 종 · pad 깔린 화음 · bass 낮은 현 · drum 큰북 · hat 작은 북 · drone 낮은 울림 · glass 유리 소리 */
export type Voice = 'pluck' | 'harp' | 'bell' | 'pad' | 'bass' | 'drum' | 'hat' | 'drone' | 'glass';

export interface NoteEvent {
  voice: Voice;
  /** 마디 시작에서 몇 박 뒤 */
  beat: number;
  /** 길이(박) */
  length: number;
  /** MIDI 음 번호(북은 무시) */
  midi: number;
  /** 0~1 */
  velocity: number;
}

export interface Track {
  mood: Mood;
  bpm: number;
  beatsPerBar: number;
  /** 근음(MIDI) 기준 음계 간격 */
  root: number;
  scale: number[];
  /** 마디마다 화음의 근음(음계 안 몇 번째 음) */
  progression: number[];
  /** 선율 악기와 한 마디의 음 수(밀도), 쉼표 확률 */
  lead: Voice | null;
  density: number;
  rest: number;
  /** 반주 */
  backing: 'drone' | 'pad' | 'harp' | 'battle' | 'boss' | 'rift';
  /** 곡 전체 크기(조용한 장소 곡은 키우고 전투 곡은 그대로 — 곡끼리 들리는 크기를 맞춘다) */
  gain: number;
}

const PENTA_MINOR = [0, 3, 5, 7, 10];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10];
const HARMONIC_MINOR = [0, 2, 3, 5, 7, 8, 11];

export const TRACKS: Record<Mood, Track> = {
  // 시작 화면: 느린 고쟁 + 넓은 화음(두 세계 — 무림의 오음계에 엘하임의 화음)
  title: { mood: 'title', bpm: 66, beatsPerBar: 4, root: 57, scale: PENTA_MINOR, progression: [0, 3, 2, 4], lead: 'pluck', density: 4, rest: 0.35, backing: 'pad', gain: 2.4 },
  // 무림: 고쟁 오음계, 낮은 울림
  murim: { mood: 'murim', bpm: 72, beatsPerBar: 4, root: 57, scale: PENTA_MINOR, progression: [0, 0, 3, 2], lead: 'pluck', density: 6, rest: 0.3, backing: 'drone', gain: 2.2 },
  // 엘하임: 하프 분산화음, 도리아
  elheim: { mood: 'elheim', bpm: 84, beatsPerBar: 4, root: 62, scale: DORIAN, progression: [0, 6, 5, 6], lead: 'bell', density: 3, rest: 0.4, backing: 'harp', gain: 2.1 },
  // 마왕성: 프리지아, 낮은 울림 위 종소리
  nocturna: { mood: 'nocturna', bpm: 58, beatsPerBar: 4, root: 52, scale: PHRYGIAN, progression: [0, 1, 0, 5], lead: 'bell', density: 2, rest: 0.45, backing: 'drone', gain: 2.6 },
  // 세계의 틈: 어긋난 울림과 유리 소리
  rift: { mood: 'rift', bpm: 50, beatsPerBar: 4, root: 50, scale: [0, 1, 4, 6, 7, 10], progression: [0, 3, 0, 2], lead: 'glass', density: 2, rest: 0.55, backing: 'rift', gain: 3 },
  // 전투: 큰북·베이스 반복 위 고쟁
  battle: { mood: 'battle', bpm: 118, beatsPerBar: 4, root: 57, scale: PENTA_MINOR, progression: [0, 0, 3, 4], lead: 'pluck', density: 8, rest: 0.25, backing: 'battle', gain: 1 },
  // 보스: 더 빠르고 낮게, 화성 단음계
  boss: { mood: 'boss', bpm: 132, beatsPerBar: 4, root: 52, scale: HARMONIC_MINOR, progression: [0, 5, 3, 4], lead: 'pluck', density: 8, rest: 0.2, backing: 'boss', gain: 1 },
  // 엔딩: 느리고 밝은 오음계, 하프 반주(파일 assets/audio/bgm/ending.ogg가 있으면 그것)
  ending: { mood: 'ending', bpm: 60, beatsPerBar: 4, root: 60, scale: [0, 2, 4, 7, 9], progression: [0, 3, 4, 0], lead: 'bell', density: 3, rest: 0.4, backing: 'harp', gain: 2.2 },
};

/** 곡 이름 + 마디 번호로 정하는 의사 난수(mulberry32) */
function rand(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);

/** 음계 안 degree번째 음(옥타브를 넘으면 올라간다) */
export function degreeToMidi(track: Track, degree: number, octave = 0): number {
  const n = track.scale.length;
  const oct = Math.floor(degree / n);
  const idx = ((degree % n) + n) % n;
  return track.root + track.scale[idx] + 12 * (oct + octave);
}

/** 곡의 bar번째 마디(0부터). 8마디마다 선율이 되풀이되고, 16마디마다 변주 */
export function composeBar(track: Track, bar: number): NoteEvent[] {
  const events: NoteEvent[] = [];
  const beats = track.beatsPerBar;
  const chord = track.progression[bar % track.progression.length];
  const phrase = bar % 8;
  const variation = Math.floor(bar / 16) % 2;
  const r = rand(hash(track.mood) + phrase * 977 + variation * 131);
  const triad = [chord, chord + 2, chord + 4];

  // 반주
  switch (track.backing) {
    case 'drone':
      events.push({ voice: 'drone', beat: 0, length: beats, midi: degreeToMidi(track, chord, -2), velocity: 0.55 });
      if (phrase % 2 === 0) events.push({ voice: 'drone', beat: 0, length: beats, midi: degreeToMidi(track, chord + 4, -2), velocity: 0.3 });
      break;
    case 'pad':
      for (const d of triad) events.push({ voice: 'pad', beat: 0, length: beats, midi: degreeToMidi(track, d, -1), velocity: 0.35 });
      events.push({ voice: 'drone', beat: 0, length: beats, midi: degreeToMidi(track, chord, -2), velocity: 0.4 });
      break;
    case 'harp':
      // 분산화음: 8분음표로 위아래
      [0, 1, 2, 3, 2, 1, 0, 1].forEach((i, k) =>
        events.push({ voice: 'harp', beat: k * (beats / 8), length: 1.5, midi: degreeToMidi(track, [...triad, chord + 7][i], -1), velocity: 0.45 - (k % 2) * 0.1 }),
      );
      events.push({ voice: 'pad', beat: 0, length: beats, midi: degreeToMidi(track, chord, -2), velocity: 0.3 });
      break;
    case 'rift':
      events.push({ voice: 'drone', beat: 0, length: beats, midi: degreeToMidi(track, chord, -2), velocity: 0.5 });
      events.push({ voice: 'drone', beat: 0, length: beats, midi: degreeToMidi(track, chord, -2) + 1, velocity: 0.28 });
      break;
    case 'battle':
    case 'boss': {
      const boss = track.backing === 'boss';
      // 큰북: 1·3박(보스는 1·2½·3), 작은 북: 엇박
      const drums = boss ? [0, 1.5, 2, 3, 3.5] : [0, 2, 2.75];
      for (const b of drums) events.push({ voice: 'drum', beat: b, length: 0.5, midi: 0, velocity: b === 0 ? 1 : 0.7 });
      for (let b = 0.5; b < beats; b += 1) events.push({ voice: 'hat', beat: b, length: 0.25, midi: 0, velocity: 0.35 });
      // 베이스: 8분음표 반복(근음 · 근음 · 5도 · 근음 …)
      const pattern = boss ? [0, 0, 0, 1, 0, 0, 2, 1] : [0, 0, 2, 0, 0, 0, 2, 3];
      pattern.forEach((p, k) => events.push({ voice: 'bass', beat: k * 0.5, length: 0.45, midi: degreeToMidi(track, chord + [0, 0, 4, 2][p], -2), velocity: k % 2 ? 0.55 : 0.75 }));
      if (phrase % 4 === 0) for (const d of triad) events.push({ voice: 'pad', beat: 0, length: beats, midi: degreeToMidi(track, d, -1), velocity: 0.22 });
      break;
    }
  }

  // 선율: 화음 음에서 출발해 한두 칸씩 걷는다. 마디 끝은 길게
  if (track.lead) {
    const step = beats / track.density;
    let degree = triad[Math.floor(r() * 3)] + track.scale.length;
    for (let i = 0; i < track.density; i++) {
      const last = i === track.density - 1;
      if (r() < track.rest && !last) continue;
      const move = [-2, -1, -1, 0, 1, 1, 2][Math.floor(r() * 7)];
      degree = Math.max(track.scale.length - 2, Math.min(track.scale.length * 2 + 2, degree + move));
      // 마디 끝음은 화음 음으로
      if (last) degree = triad.reduce((best, d) => (Math.abs(d + track.scale.length - degree) < Math.abs(best - degree) ? d + track.scale.length : best), triad[0] + track.scale.length);
      events.push({ voice: track.lead, beat: i * step, length: last ? step * 2 : step, midi: degreeToMidi(track, degree), velocity: 0.5 + r() * 0.25 });
    }
  }
  return events;
}

/** 장소·노드에 맞는 곡: 전투면 battle/boss, 아니면 세계 */
export function moodFor(world: string | undefined, battle?: 'battle' | 'elite' | 'boss'): Mood {
  if (battle === 'boss') return 'boss';
  if (battle) return 'battle';
  return world === 'elheim' || world === 'nocturna' || world === 'rift' || world === 'murim' ? world : 'title';
}

export const midiToHz = (m: number) => 440 * 2 ** ((m - 69) / 12);

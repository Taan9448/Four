import { describe, expect, it } from 'vitest';
import { composeBar, moodFor, TRACKS, type Mood } from '../src/render/music';

describe('합성 배경음악 악보', () => {
  const moods = Object.keys(TRACKS) as Mood[];

  it('같은 곡·같은 마디는 늘 같은 악보, 8마디마다 선율이 되풀이된다', () => {
    for (const m of moods) {
      expect(composeBar(TRACKS[m], 3)).toEqual(composeBar(TRACKS[m], 3));
      const lead = (bar: number) => composeBar(TRACKS[m], bar).filter((e) => e.voice === TRACKS[m].lead);
      expect(lead(9)).toEqual(lead(1));
    }
  });

  it('모든 음은 마디 안에서 시작하고, 북이 아닌 음은 곡의 음계 안에 있다', () => {
    for (const m of moods) {
      const t = TRACKS[m];
      const inScale = new Set(t.scale.map((x) => (t.root + x) % 12));
      for (let bar = 0; bar < 32; bar++)
        for (const e of composeBar(t, bar)) {
          expect(e.beat).toBeGreaterThanOrEqual(0);
          expect(e.beat).toBeLessThan(t.beatsPerBar);
          expect(e.velocity).toBeGreaterThan(0);
          expect(e.velocity).toBeLessThanOrEqual(1);
          // 세계의 틈의 어긋난 울림(반음 위 겹침)만 예외
          if (e.voice !== 'drum' && e.voice !== 'hat' && !(t.backing === 'rift' && e.voice === 'drone')) expect(inScale.has(e.midi % 12)).toBe(true);
        }
    }
  });

  it('전투 곡에는 북이 있고, 장소 곡에는 없다', () => {
    const hasDrum = (m: Mood) => composeBar(TRACKS[m], 0).some((e) => e.voice === 'drum');
    expect(hasDrum('battle')).toBe(true);
    expect(hasDrum('boss')).toBe(true);
    for (const m of ['title', 'murim', 'elheim', 'nocturna', 'rift'] as Mood[]) expect(hasDrum(m)).toBe(false);
  });

  it('장소·노드로 곡을 고른다', () => {
    expect(moodFor('elheim')).toBe('elheim');
    expect(moodFor('nocturna', 'boss')).toBe('boss');
    expect(moodFor('murim', 'elite')).toBe('battle');
    expect(moodFor(undefined)).toBe('title');
  });
});

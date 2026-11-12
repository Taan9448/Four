// 「결」 음악(2026-11-11): 곡 정의·대결 곡 고르기·악보 빠르기·연속 박자 층(소리 없이 악보만)
import { describe, expect, it } from 'vitest';
import { composeBar } from '../../src/render/music';
import { battleTrack, chartBpm, layerEvents, MUSIC, trackOf } from '../src/music';
import duelRaw from '../data/duel.json';

const foes = (duelRaw as unknown as { foes: { id: string; bg?: string; phases?: unknown[]; chart?: { steps: { at: number }[] } }[] }).foes;

describe('「결」 음악', () => {
  it('모든 곡이 악보 함수로 마디를 만든다(음계 이름이 있다)', () => {
    for (const id of Object.keys(MUSIC.tracks)) {
      const t = trackOf(id)!;
      expect(MUSIC.scales[MUSIC.tracks[id].scale]).toBeTruthy();
      const bar = composeBar(t, 3);
      expect(bar.length).toBeGreaterThan(0);
      for (const e of bar) expect(Number.isFinite(e.midi)).toBe(true);
    }
  });

  it('화면 곡·지역 곡은 있는 곡만 가리킨다', () => {
    for (const v of [...Object.values(MUSIC.screens), ...Object.values(MUSIC.regions), MUSIC.bossTrack, MUSIC.finalTrack]) if (v) expect(MUSIC.tracks[v]).toBeTruthy();
  });

  it('대결 곡: 마지막 보스 → 보스(단계 둘 이상) → 지역', () => {
    expect(battleTrack({ id: 'mordecai', phases: [1, 2, 3] })).toBe('final');
    expect(battleTrack({ id: 'ignis', phases: [1, 2] })).toBe('boss');
    expect(battleTrack({ id: 'x', bg: 'bg_nocturna' })).toBe('nocturna');
    for (const f of foes) expect(MUSIC.tracks[battleTrack(f)]).toBeTruthy();
  });

  it('박자 도전 곡의 빠르기는 악보 간격에서 90~140', () => {
    for (const f of foes.filter((x) => x.chart)) {
      const bpm = chartBpm(f.chart!.steps);
      expect(bpm).toBeGreaterThanOrEqual(90);
      expect(bpm).toBeLessThanOrEqual(140);
    }
    expect(chartBpm([{ at: 0 }, { at: 500 }, { at: 1000 }])).toBe(120);
  });

  it('연속 박자 단계가 오를수록 층이 쌓인다', () => {
    const t = trackOf('murim')!;
    const base = composeBar(t, 0);
    const n = [0, 1, 2, 3].map((k) => layerEvents(t, 0, k, base).length);
    expect(n[0]).toBe(0);
    expect(n[1]).toBeGreaterThan(0);
    expect(n[2]).toBeGreaterThan(n[1]);
    expect(n[3]).toBeGreaterThan(n[2]);
  });
});

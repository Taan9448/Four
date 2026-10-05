import { describe, expect, it } from 'vitest';
import { createRng } from '../src/engine/rng';
import { generateStageMap, validateMap, type RouteContext } from '../src/engine/route';
import { data } from './helpers';

const ctx = (over: Partial<RouteContext> = {}): RouteContext => ({ scar: 0, flags: [], roster: ['haun'], usedModules: [], ...over });
const gen = (seed: string, over: Partial<RouteContext> = {}) =>
  generateStageMap(data, 's1', createRng(seed).fork('map:s1'), ctx(over));

describe('경로 생성기', () => {
  it('같은 시드면 같은 지도', () => {
    expect(JSON.stringify(gen('ALPHA'))).toBe(JSON.stringify(gen('ALPHA')));
  });

  it('다른 시드면 다른 지도', () => {
    const maps = new Set(['A', 'B', 'C', 'D', 'E'].map((s) => JSON.stringify(gen(s))));
    expect(maps.size).toBeGreaterThan(1);
  });

  it('200개 시드에서 생성 제약을 모두 지킨다', () => {
    for (let i = 0; i < 200; i++) {
      const map = gen(`seed-${i}`);
      expect(validateMap(data, map), `seed-${i}`).toEqual([]);
    }
  });

  it('고정 노드(동료 합류, 운하검 탄생)와 보스는 모든 지도에 같은 자리에 있다', () => {
    for (const seed of ['x', 'y', 'z']) {
      const map = gen(seed);
      expect(map.floors[0].map((n) => n.moduleId)).toEqual(['s1_story_companions']);
      expect(map.floors[6].map((n) => n.moduleId)).toEqual(['s1_story_unha_sword']);
      const boss = map.floors[map.floors.length - 1];
      expect(boss.map((n) => n.moduleId)).toEqual(['s1_boss_ignis']);
      // 보스 직전 층은 휴식
      expect(map.floors[8].every((n) => n.type === 'rest')).toBe(true);
    }
  });

  it('이미 쓴 once 모듈은 다시 나오지 않는다', () => {
    for (let i = 0; i < 30; i++) {
      const map = gen(`once-${i}`, { usedModules: ['s1_event_campfire'] });
      expect(map.floors.flat().some((n) => n.moduleId === 's1_event_campfire')).toBe(false);
    }
  });

  it('층 범위 조건을 지킨다(협곡 도롱뇽은 5층 이후)', () => {
    for (let i = 0; i < 50; i++) {
      for (const n of gen(`range-${i}`).floors.flat()) {
        if (n.moduleId === 's1_battle_salamanders') expect(n.floor).toBeGreaterThanOrEqual(5);
      }
    }
  });

  it('노드 유형이 고르게 섞인다', () => {
    const types = new Set<string>();
    for (let i = 0; i < 20; i++) gen(`mix-${i}`).floors.flat().forEach((n) => types.add(n.type));
    expect([...types].sort()).toEqual(['battle', 'boss', 'elite', 'event', 'inn', 'rest', 'story']);
  });
});

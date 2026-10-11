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

  it('고정 노드(두 개의 달, 첫눈의 개울가)와 보스는 모든 지도에 같은 자리에 있다', () => {
    for (const seed of ['x', 'y', 'z']) {
      const map = gen(seed);
      expect(map.floors[0].map((n) => n.moduleId)).toEqual(['s1_story_two_moons']);
      expect(map.floors[6].map((n) => n.moduleId)).toEqual(['s1_story_first_snow']);
      const boss = map.floors[map.floors.length - 1];
      expect(boss.map((n) => n.moduleId)).toEqual(['s1_boss_veilak']);
      // 보스 직전 층은 휴식
      expect(map.floors[8].every((n) => n.type === 'rest')).toBe(true);
    }
  });

  it('이미 쓴 once 모듈은 다시 나오지 않는다', () => {
    const once = [...data.modules.values()].filter((m) => m.stage === 's1' && m.once && m.type === 'event').map((m) => m.id);
    expect(once.length).toBeGreaterThan(0);
    for (let i = 0; i < 30; i++) {
      const map = gen(`once-${i}`, { usedModules: once });
      expect(map.floors.flat().some((n) => once.includes(n.moduleId))).toBe(false);
    }
  });

  it('층 범위 조건을 지킨다', () => {
    for (let i = 0; i < 50; i++) {
      for (const n of gen(`range-${i}`).floors.flat()) {
        const fr = data.modules.get(n.moduleId)?.conditions.floorRange;
        if (fr && n.type !== 'story' && n.type !== 'boss') {
          expect(n.floor).toBeGreaterThanOrEqual(fr[0]);
          expect(n.floor).toBeLessThanOrEqual(fr[1]);
        }
      }
    }
  });

  it('노드 유형이 고르게 섞인다', () => {
    const types = new Set<string>();
    for (let i = 0; i < 20; i++) gen(`mix-${i}`).floors.flat().forEach((n) => types.add(n.type));
    expect([...types].sort()).toEqual(['battle', 'boss', 'elite', 'event', 'inn', 'rest', 'shop', 'story']);
  });
});

describe('폭주가 지도를 가른다(GAME_DESIGN 7절, 2026-10-11)', () => {
  it('길 하나를 끊어도 모든 노드가 닿고 보스까지 이어진다, 裂 틈새는 지도마다 3개까지, 같은 시드면 같은 결과', async () => {
    const { applyBattleOutcome, createRunAt, availableNodes, enterNode } = await import('../src/engine/run');
    const { mutateMapForSurge } = await import('../src/engine/route');
    for (const stageId of ['s3', 's6', 's8']) {
      for (const seed of ['CR1', 'CR2', 'CR3']) {
        const run = createRunAt(data, seed, stageId);
        const enc = enterNode(data, run, availableNodes(run)[0].id);
        const party = run.selected.map((id) => ({ id, hp: run.roster.find((r) => r.id === id)!.hp }));
        const outcome = { result: 'victory' as const, survived: false, party, mana: run.mana, scarGain: 6, tally: { kills: 1, damage: 0, crits: 0, surges: 2, cards: {} } };
        const copy = structuredClone(run);
        applyBattleOutcome(data, run, enc, outcome);
        applyBattleOutcome(data, copy, enc, structuredClone(outcome));
        expect(validateMap(data, run.map)).toEqual([]);
        expect(run.map.surges).toBe(2);
        expect(JSON.stringify(run.map)).toBe(JSON.stringify(copy.map));
        const cracks = run.map.floors.flat().filter((n) => n.crack);
        expect(cracks.length).toBeGreaterThan(0);
        for (const n of cracks) {
          const mod = data.modules.get(n.moduleId)!;
          expect(mod.stage).toBe('crack');
          if (n.type === 'elite') expect(n.enemies?.length).toBeGreaterThan(0);
        }
        // 더 터져도 틈새는 3개까지
        for (let i = 0; i < 6; i++) mutateMapForSurge(run.map, run.position, createRng(`x${i}`), 3, (node) => ({ moduleId: node.moduleId, type: 'event' }));
        expect(run.map.floors.flat().filter((n) => n.crack).length).toBeLessThanOrEqual(3);
        expect(validateMap(data, run.map)).toEqual([]);
      }
    }
  });

  it('틈의 짐승: 그 스테이지의 엘리트 적에 접사 하나, 이기면 상흔 -5', async () => {
    const { applyBattleOutcome, battleSetupFor, createRunAt, splitMapBySurge } = await import('../src/engine/run');
    const run = createRunAt(data, 'BEAST', 's6');
    for (let i = 0; i < 6 && !run.map.floors.flat().some((n) => n.crack && n.type === 'elite'); i++) splitMapBySurge(data, run, 1, `t${i}`);
    const node = run.map.floors.flat().find((n) => n.crack && n.type === 'elite');
    expect(node).toBeTruthy();
    const enc = { node: node!, module: data.modules.get(node!.moduleId)! };
    const setup = battleSetupFor(data, run, enc);
    expect(setup.enemies).toEqual(node!.enemies);
    expect(setup.enemyMods?.[0]?.affixes?.length).toBe(1);
    run.scar = 9;
    const party = run.selected.map((id) => ({ id, hp: run.roster.find((r) => r.id === id)!.hp }));
    applyBattleOutcome(data, run, enc, { result: 'victory', survived: false, party, mana: run.mana, scarGain: 0, tally: { kills: 1, damage: 0, crits: 0, surges: 0, cards: {} } });
    expect(run.scar).toBe(4);
  });
});

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

/**
 * 만든 적·모듈이 실제 지도에 나오는가(2026-10-25 사용자 요청 — "몬스터를 만든 게 실제로는 맵에 안 나오는 게 있다").
 * 나올 수 있는 층(floorRange)이 고정 이야기 층이나 정해진 상점·휴식 층과만 겹치면 그 모듈은 영영 뽑히지 않는다
 */
describe('모듈·적이 지도에 나올 수 있다', () => {
  const route = data.balance.route;
  const pinnedIds = new Set(data.stages.flatMap((s) => s.pinned.map((p) => p.module)));
  const floorsFor = (moduleId: string): number[] => {
    const m = data.modules.get(moduleId)!;
    const stage = data.stages.find((s) => s.id === m.stage);
    if (!stage) return [];
    const pinned = new Set(stage.pinned.map((p) => p.floor));
    const r = m.conditions.floorRange;
    const out: number[] = [];
    for (let f = 1; f <= stage.floors; f++) {
      const forced = stage.forcedTypes[String(f)];
      if (pinned.has(f)) continue;
      if (forced ? forced !== m.type : (stage.typeWeights[m.type as keyof typeof stage.typeWeights] ?? 0) <= 0) continue;
      if (r && (f < r[0] || f > r[1])) continue;
      if (m.type === 'elite' && !forced && f < route.eliteMinFloor) continue;
      out.push(f);
    }
    return out;
  };

  it('캠페인 스테이지의 뽑는 모듈마다 나올 수 있는 층이 하나 이상 있다', () => {
    const dead = [...data.modules.values()]
      .filter((m) => data.stages.some((s) => s.id === m.stage) && m.type !== 'boss' && m.type !== 'story' && !pinnedIds.has(m.id) && m.weight > 0)
      .filter((m) => floorsFor(m.id).length === 0)
      .map((m) => `${m.id} floorRange=${JSON.stringify(m.conditions.floorRange)}`);
    expect(dead).toEqual([]);
  });

  it('조건 깃발·동료는 어딘가에서 세워지거나 합류한다', () => {
    // 깃발을 세우는 곳: 모듈 내용(선택지·전투 결과)의 set_flag
    const setters = JSON.stringify([...data.modules.values()].map((m) => m.content));
    const missing = [...data.modules.values()].flatMap((m) => {
      const c = m.conditions;
      const out: string[] = [];
      if (c.flag && !setters.includes(`"flag":"${c.flag}"`)) out.push(`${m.id} flag ${c.flag}`);
      if (c.partyHas && !data.characters.has(c.partyHas)) out.push(`${m.id} partyHas ${c.partyHas}`);
      return out;
    });
    expect(missing).toEqual([]);
  });

  it('게임의 적은 모두 어느 전투에 나온다(모듈·보스·심연 또는 변신·소환으로)', () => {
    const inModules = new Set([...data.modules.values()].flatMap((m) => [...(m.content.enemies ?? [])]));
    const viaEnemy = new Set<string>();
    for (const e of data.enemies.values()) {
      if (e.transform) viaEnemy.add(e.transform.into);
      for (const mv of e.moves) for (const ef of mv.effects) if (ef.enemy) viaEnemy.add(ef.enemy);
    }
    const orphans = [...data.enemies.keys()].filter((id) => !id.startsWith('test_') && !inModules.has(id) && !viaEnemy.has(id));
    expect(orphans).toEqual([]);
  });

  it('시드 300개면 캠페인 스테이지의 모듈(이야기 제외)이 모두 한 번 이상 지도에 나온다 — 전투 없는 노드 연속 한도까지 따져서', () => {
    const flags = [...new Set([...data.modules.values()].map((m) => m.conditions.flag).filter((f): f is string => !!f))];
    const roster = [...data.characters.keys()];
    const seen = new Set<string>();
    for (const st of data.stages) {
      for (let i = 0; i < 300; i++) {
        const map = generateStageMap(data, st.id, createRng(`seen-${i}`).fork(`map:${st.id}`), ctx({ scar: i % 8, flags, roster }));
        for (const n of map.floors.flat()) if (n.moduleId) seen.add(n.moduleId);
      }
    }
    // 세계의 틈(S9)은 자유 층(3·6·9층)이 모두 이야기 노드 둘 뒤라 전투 없는 노드 연속 한도에 걸려 사건·휴식이 캠페인에 못 나온다
    // (그 사건들은 심연의 틈 세계 굽이에서 나온다 — 심연 지도에는 이야기 노드가 없다)
    const abyssOnly = (m: { stage: string; type: string }) => m.stage === 's9' && (m.type === 'event' || m.type === 'rest');
    const never = [...data.modules.values()]
      .filter((m) => data.stages.some((s) => s.id === m.stage) && m.type !== 'story' && !abyssOnly(m))
      .filter((m) => !seen.has(m.id))
      .map((m) => m.id);
    expect(never).toEqual([]);
  });
});

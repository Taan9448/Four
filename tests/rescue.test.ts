// 구출(op rescue, 2026-10-31 개작 원고 B안): 사건에서 데리고 나온 사람 수를 런에 세고, 스테이지 끝 화면이 이번 스테이지 몫을 보인다
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/engine/data';
import { applyRunOps, createRunAt, markStageStart, stageGainsSummary } from '../src/engine/run';
import { deserializeRun, serializeRun } from '../src/engine/save';

const data = gameData();

describe('구출', () => {
  it('rescue는 런에 사람 수를 더하고 이번 스테이지 몫을 따로 센다', () => {
    const run = createRunAt(data, 'RESCUE', 's1');
    markStageStart(run);
    expect(stageGainsSummary(data, run).rescued).toBe(0);
    const msgs = applyRunOps(data, run, [{ op: 'rescue', amount: 43 }]);
    expect(msgs).toContain('구한 사람 43명');
    expect(run.rescued).toBe(43);
    expect(stageGainsSummary(data, run).rescued).toBe(43);
    // 다음 스테이지에서는 새로 센다
    markStageStart(run);
    applyRunOps(data, run, [{ op: 'rescue', amount: 12 }]);
    expect(run.rescued).toBe(55);
    expect(stageGainsSummary(data, run).rescued).toBe(12);
  });

  it('음수는 0으로, 저장해도 남는다', () => {
    const run = createRunAt(data, 'RESCUE2', 's1');
    applyRunOps(data, run, [{ op: 'rescue', amount: -5 }, { op: 'rescue', amount: 9 }]);
    expect(run.rescued).toBe(9);
    const back = deserializeRun(data, serializeRun(run))!.run;
    expect(back.rescued).toBe(9);
  });
});

describe('잠깐 떠났다 돌아오는 동료', () => {
  it('leave_party 뒤 join_party는 떠날 때의 레벨·경험치·편성으로 돌아온다', () => {
    const run = createRunAt(data, 'REJOIN', 's2');
    const born = run.roster.find((r) => r.id === 'born')!;
    born.level = 5;
    born.xp = 7;
    born.maxHp += 40;
    const loadout = [...(run.loadout.born ?? [])];
    applyRunOps(data, run, [{ op: 'leave_party', member: 'born' }]);
    expect(run.roster.some((r) => r.id === 'born')).toBe(false);
    applyRunOps(data, run, [{ op: 'join_party', member: 'born' }]);
    const back = run.roster.find((r) => r.id === 'born')!;
    expect(back.level).toBe(5);
    expect(back.xp).toBe(7);
    expect(run.departed?.some((r) => r.id === 'born') ?? false).toBe(false);
    expect(run.loadout.born).toEqual(loadout);
  });
});

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

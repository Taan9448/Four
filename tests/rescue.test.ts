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

describe('원작 B안: 잠깐 빠지는 동료가 데이터에 맞게 들어 있다', () => {
  const ops = (id: string) => JSON.stringify(data.modules.get(id)?.content ?? {});
  it('S2 보른은 둘째 층에서 사슬로 들어가고 여섯째 층에서 돌아온다', () => {
    expect(ops('s2_story_into_chains')).toContain('"leave_party","member":"born"');
    expect(ops('s2_story_six_doors')).toContain('"join_party","member":"born"');
  });
  it('S8 엘리아는 일곱째 굽이에 남고 혈전 뒤에 돌아온다', () => {
    const stair = data.modules.get('s8_story_broken_stair')!;
    for (const ch of stair.content.choices ?? []) expect(ch.effects.some((e) => e.op === 'leave_party' && e.member === 'elia')).toBe(true);
    expect(data.modules.get('s8_boss_blood_hall')!.content.clearEffects?.some((e) => e.op === 'join_party' && e.member === 'elia')).toBe(true);
  });
  it('S6·S7 구출 사건이 원작 인원으로 들어 있다', () => {
    const r = (id: string) => (data.modules.get(id)!.content.clearEffects ?? []).filter((e) => e.op === 'rescue').reduce((n, e) => n + (e.amount ?? 0), 0);
    expect(r('s6_battle_ambush')).toBe(12);
    expect(r('s6_boss_full_moon')).toBe(97);
    expect(r('s7_elite_three_talents')).toBe(42);
    expect(r('s7_elite_poison_hand')).toBe(185);
    expect(r('s7_boss_blood_hand')).toBe(30);
  });
});

// 난이도·하드코어·스테이지 다시 하기(2026-10-08)
import { describe, expect, it } from 'vitest';
import { applyBattleOutcome, applyRunOps, battleSetupFor, createRun, createRunAt, finishReplay, startReplay, type Encounter } from '../src/engine/run';
import { deserializeRun, serializeRun } from '../src/engine/save';
import { data } from './helpers';

const encounter = (stage: string): Encounter => {
  const module = [...data.modules.values()].find((m) => m.stage === stage && m.type === 'battle')!;
  return { node: { id: 'n1-0', floor: 1, index: 0, type: 'battle', moduleId: module.id, next: [] }, module: { ...module, content: { ...module.content, clearEffects: [] } } };
};

describe('난이도', () => {
  it('어려움은 적 체력·공격력 배율을 곱한다', () => {
    const normal = createRunAt(data, 'D', 's3');
    const hard = createRunAt(data, 'D', 's3', { difficulty: 'hard' });
    const enc = encounter('s3');
    const a = battleSetupFor(data, normal, enc);
    const b = battleSetupFor(data, hard, enc);
    expect(b.enemyHpScale).toBeCloseTo(a.enemyHpScale! * data.balance.difficulty.hard.enemyHpMul);
    expect(b.enemyDmgScale).toBeCloseTo(a.enemyDmgScale! * data.balance.difficulty.hard.enemyDmgMul);
  });

  it('하드코어: 전투가 끝날 때 쓰러져 있던 동료는 떠나고 다시 합류하지 않는다', () => {
    const run = createRunAt(data, 'HC', 's3', { hardcore: true });
    const mate = run.selected.find((id) => id !== 'haun')!;
    const msgs = applyBattleOutcome(data, run, encounter('s3'), {
      result: 'victory',
      survived: false,
      party: run.selected.map((id) => ({ id, hp: id === mate ? 1 : 50 })),
      mana: run.mana,
      scarGain: 0,
      downed: [mate],
    });
    expect(run.roster.some((r) => r.id === mate)).toBe(false);
    expect(run.fallen).toContain(mate);
    expect(msgs.some((m) => m.includes('하드코어'))).toBe(true);
    applyRunOps(data, run, [{ op: 'join_party', member: mate }]);
    expect(run.roster.some((r) => r.id === mate)).toBe(false);
  });

  it('하드코어가 아니면 쓰러진 동료는 체력 1로 돌아온다', () => {
    const run = createRunAt(data, 'HC', 's3');
    const mate = run.selected.find((id) => id !== 'haun')!;
    applyBattleOutcome(data, run, encounter('s3'), { result: 'victory', survived: false, party: run.selected.map((id) => ({ id, hp: id === mate ? 1 : 50 })), mana: run.mana, scarGain: 0, downed: [mate] });
    expect(run.roster.find((r) => r.id === mate)!.hp).toBe(1);
  });
});

describe('스테이지 다시 하기', () => {
  it('마친 런의 파티로 그 스테이지를 처음부터, 끝나면 이긴 횟수만 남는다', () => {
    const hub = createRunAt(data, 'HUB', 's9');
    hub.status = 'complete';
    hub.gold = 123;
    const replay = startReplay(data, hub, 's2');
    expect(replay.stageId).toBe('s2');
    expect(replay.status).toBe('map');
    expect(replay.deck.length).toBe(hub.deck.length);
    expect(replay.roster.every((r) => r.hp === r.maxHp)).toBe(true);
    replay.gold = 0;
    replay.status = 'stage_clear';
    const back = finishReplay(replay);
    expect(back.status).toBe('complete');
    expect(back.gold).toBe(123);
    expect(back.replays.s2).toBe(1);
    expect(() => startReplay(data, createRun(data, 'X'), 's1')).toThrow();
  });

  it('마친 런과 다시 하는 런은 저장에서 살아남는다', () => {
    const hub = createRunAt(data, 'HUB', 's9');
    hub.status = 'complete';
    expect(deserializeRun(data, serializeRun(hub))?.run.status).toBe('complete');
    const replay = startReplay(data, hub, 's4');
    const loaded = deserializeRun(data, serializeRun(replay))!;
    expect(loaded.run.replayOf?.status).toBe('complete');
  });
});

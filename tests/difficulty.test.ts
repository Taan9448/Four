// 난이도·하드코어·스테이지 다시 하기(2026-10-08)
import { describe, expect, it } from 'vitest';
import { applyBattleOutcome, applyRunOps, battleSetupFor, createRun, createRunAt, discardSuspended, finishReplay, mergeCollections, restoreParty, startReplay, suspendReplay, type Encounter } from '../src/engine/run';
import { deserializeRun, serializeRun } from '../src/engine/save';
import { createBattle, endTurn } from '../src/engine/battle';
import { createRng } from '../src/engine/rng';
import { EnemyDef } from '../src/engine/schema';
import { cards, data, enemyTiers } from './helpers';

const encounter = (stage: string): Encounter => {
  const module = [...data.modules.values()].find((m) => m.stage === stage && m.type === 'battle')!;
  return { node: { id: 'n1-0', floor: 1, index: 0, type: 'battle', moduleId: module.id, next: [] }, module: { ...module, content: { ...module.content, clearEffects: [] } } };
};

describe('난이도', () => {
  it('어려움은 스테이지별 적 체력·공격력 배율을 곱한다(중반이 가장 무겁다 — 2026-10-12)', () => {
    const normal = createRunAt(data, 'D', 's3');
    const hard = createRunAt(data, 'D', 's3', { difficulty: 'hard' });
    const enc = encounter('s3');
    const a = battleSetupFor(data, normal, enc);
    const b = battleSetupFor(data, hard, enc);
    expect(b.enemyHpScale).toBeCloseTo(a.enemyHpScale! * data.balance.difficulty.hard.byStage.s3.hp);
    expect(b.enemyDmgScale).toBeCloseTo(a.enemyDmgScale! * data.balance.difficulty.hard.byStage.s3.dmg);
    const by = data.balance.difficulty.hard.byStage;
    // 중반(S2~S5)이 앞(S0~S1)·뒤(S6~S9)보다 같거나 무겁다
    for (const mid of ['s2', 's3', 's4', 's5'] as const)
      for (const other of ['s0', 's1', 's6', 's7', 's8', 's9'] as const) {
        expect(by[mid].hp).toBeGreaterThanOrEqual(by[other].hp);
        expect(by[mid].dmg).toBeGreaterThanOrEqual(by[other].dmg);
      }
    expect(by.s3.hp).toBeGreaterThan(by.s0.hp);
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

  it('전투 기록(사람 플레이 통계): 전투마다 모듈·결과·턴·체력 전후가 한 줄씩 남는다', () => {
    const run = createRunAt(data, 'LOG', 's3');
    const mate = run.selected.find((id) => id !== 'haun')!;
    const before = run.roster.filter((r) => run.selected.includes(r.id)).reduce((a, r) => a + r.hp, 0);
    const enc = encounter('s3');
    applyBattleOutcome(data, run, enc, { result: 'victory', survived: false, party: run.selected.map((id) => ({ id, hp: id === mate ? 10 : 500 })), mana: run.mana, scarGain: 0, downed: [mate], turns: 4 });
    const log = run.stats!.log!;
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ stageId: 's3', moduleId: enc.module.id, type: 'battle', result: 'victory', turns: 4, hpBefore: before, haunAfter: 500 });
    expect(log[0].hpAfter).toBe(500 * (run.selected.length - 1)); // 쓰러진 동료는 0으로 센다
    expect(deserializeRun(data, serializeRun(run))!.run.stats!.log).toEqual(log);
  });

  it('하드코어가 아니면 쓰러진 동료는 체력 10으로 돌아온다', () => {
    const run = createRunAt(data, 'HC', 's3');
    const mate = run.selected.find((id) => id !== 'haun')!;
    applyBattleOutcome(data, run, encounter('s3'), { result: 'victory', survived: false, party: run.selected.map((id) => ({ id, hp: id === mate ? 10 : 500 })), mana: run.mana, scarGain: 0, downed: [mate] });
    expect(run.roster.find((r) => r.id === mate)!.hp).toBe(10);
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

describe('자유 여정(2026-10-11)', () => {
  const cleared = () => {
    const hub = createRunAt(data, 'FREE', 's9');
    hub.status = 'complete';
    return hub;
  };

  it('캠페인을 마치면 이야기로 떠난 동료가 떠날 때의 상태로 돌아와 4명이 된다', () => {
    const run = createRunAt(data, 'PARTY', 's9');
    const kyle = run.roster.find((r) => r.id === 'kyle')!;
    kyle.level = 7;
    kyle.maxHp = 880;
    applyRunOps(data, run, [{ op: 'leave_party', member: 'kyle' }, { op: 'leave_party', member: 'born' }]);
    expect(run.roster.map((r) => r.id)).toEqual(['haun', 'elia']);
    expect(restoreParty(data, run)).toEqual([]); // 캠페인 중에는 돌아오지 않는다
    run.status = 'complete';
    expect(restoreParty(data, run).length).toBe(2);
    expect(run.roster.map((r) => r.id).sort()).toEqual(['born', 'elia', 'haun', 'kyle']);
    expect(run.roster.find((r) => r.id === 'kyle')).toMatchObject({ level: 7, maxHp: 880, hp: 880 });
    expect(Object.keys(run.loadout)).toEqual(expect.arrayContaining(['kyle', 'born']));
    expect(restoreParty(data, run)).toEqual([]); // 한 번만
  });

  it('하드코어로 잃은 동료도 클리어 뒤에는 하운의 레벨로 돌아온다', () => {
    const run = cleared();
    run.roster = run.roster.filter((r) => r.id !== 'born');
    run.fallen = ['born'];
    restoreParty(data, run);
    expect(run.fallen).toEqual([]);
    expect(run.roster.find((r) => r.id === 'born')!.level).toBe(run.roster.find((r) => r.id === 'haun')!.level);
  });

  it('다시 하다 멈추면 진행이 남고, 그 장소를 다시 누르면 그 자리에서 이어진다', () => {
    const hub = cleared();
    const a = startReplay(data, hub, 's1');
    a.visited = [a.map.floors[0][0].id];
    a.position = a.map.floors[0][0].id;
    a.gold = 5;
    const back = suspendReplay(a);
    expect(back.status).toBe('complete');
    expect(back.suspended?.s1?.position).toBe(a.position);
    expect(back.gold).toBe(hub.gold); // 그 길의 골드는 그 길 안에서만
    // 다른 곳을 걷는 동안에도 멈춘 진행은 남는다(저장되는 hub 안에)
    const b = startReplay(data, back, 's3');
    expect(b.replayOf?.suspended?.s1).toBeTruthy();
    expect(b.suspended).toBeUndefined();
    const hub2 = suspendReplay(b);
    expect(Object.keys(hub2.suspended!).sort()).toEqual(['s1', 's3']);
    const again = startReplay(data, hub2, 's1');
    expect(again.position).toBe(a.position);
    expect(again.gold).toBe(5);
    expect(again.replayOf?.suspended?.s1).toBeUndefined();
    expect(again.replayOf?.suspended?.s3).toBeTruthy();
    // 처음부터 다시(fresh)는 멈춘 진행을 버린다
    expect(startReplay(data, hub2, 's1', { fresh: true }).position).toBeNull();
    discardSuspended(hub2, 's3');
    expect(hub2.suspended?.s3).toBeUndefined();
  });

  it('멈춰 둔 길에서 얻은 카드는 그 길에만 남고, 이어서 걸으면 다시 쓸 수 있다', () => {
    expect(mergeCollections({ a: 1, b: 0 }, { b: 2, c: 0 })).toEqual({ a: 1, b: 2, c: 0 });
    const hub = cleared();
    const a = startReplay(data, hub, 's1');
    a.collection.extra_a = 0;
    const mid = suspendReplay(a);
    expect(mid.collection.extra_a).toBeUndefined();
    expect(mid.suspended?.s1?.collection.extra_a).toBe(0);
    expect(startReplay(data, mid, 's1').collection.extra_a).toBe(0);
  });

  it('멈춘 진행은 저장에서 살아남고, 데이터가 맞지 않는 것만 버린다', () => {
    const hub = cleared();
    const back = suspendReplay(startReplay(data, hub, 's2'));
    back.suspended!.s5 = structuredClone({ ...back.suspended!.s2, stageId: 's5' }); // 지도와 스테이지가 어긋난 진행
    const loaded = deserializeRun(data, serializeRun(back))!.run;
    expect(Object.keys(loaded.suspended!)).toEqual(['s2']);
    const playing = startReplay(data, loaded, 's4');
    expect(deserializeRun(data, serializeRun(playing))!.run.replayOf?.suspended?.s2).toBeTruthy();
  });
});

describe('적 등급 배율·격노(GAME_DESIGN 12절)', () => {
  const setup = (enemies: string[]) => ({
    world: 'elheim' as const,
    party: [{ id: 'haun', hp: 600, maxHp: 600 }],
    enemies,
    deck: cards('haun_step', 'haun_step', 'haun_step', 'haun_step', 'haun_step'),
    mana: 0,
    rng: createRng('TIER'),
    supportActive: false,
  });

  it('일반 적은 체력 배율을 곱하고, 공격 피해에는 피해 배율이 걸린다', () => {
    const saved = data.balance.enemyTiers;
    data.balance.enemyTiers = { normal: { hp: 2, dmg: 0.5 } };
    try {
      const s = createBattle(data, setup(['test_wolf']));
      const def = data.enemies.get('test_wolf')!;
      expect(s.enemies[0].maxHp).toBe(def.maxHp * 2);
      expect(s.enemies[0].dmgMul).toBe(0.5);
    } finally {
      data.balance.enemyTiers = saved;
    }
    // 실제 수치: 일반은 단단하고 약하게(체력 > 1, 피해 < 1)
    expect(enemyTiers.normal!.hp).toBeGreaterThan(1);
    expect(enemyTiers.normal!.dmg).toBeLessThan(1);
  });

  it('격노: 정한 턴부터 적의 차례마다 효과가 일어난다', () => {
    data.enemies.set(
      'test_enrage',
      EnemyDef.parse({
        id: 'test_enrage', name: '격노 시험', maxHp: 9999, pattern: 'cycle',
        moves: [{ id: 'wait', name: '기다림', intent: 'buff', effects: [{ op: 'block', amount: 10 }] }],
        enrage: { afterTurn: 3, text: '격노했다', effects: [{ op: 'apply_status', status: 'strength', stacks: 2, target: 'self' }] },
      }),
    );
    const s = createBattle(data, setup(['test_enrage']));
    endTurn(s);
    endTurn(s);
    expect(s.enemies[0].statuses.strength ?? 0).toBe(0);
    endTurn(s);
    expect(s.enemies[0].statuses.strength).toBe(2);
    expect(s.events.some((e) => e.type === 'enrage')).toBe(true);
    endTurn(s);
    expect(s.enemies[0].statuses.strength).toBe(4);
  });
});

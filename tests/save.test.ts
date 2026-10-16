import { describe, expect, it } from 'vitest';
import { applyChoice, availableNodes, createRun, createRunAt, enterNode, rewardOptions } from '../src/engine/run';
import { deserializeRun, SAVE_VERSION, serializeRun } from '../src/engine/save';
import { data } from './helpers';

describe('저장·이어하기', () => {
  it('저장한 런을 불러오면 같은 상태에서 같은 결과로 이어진다', () => {
    const run = createRun(data, 'SAVE1', { stageId: 's1' });
    const enc = enterNode(data, run, availableNodes(run)[0].id);
    applyChoice(data, run, enc.module, 0);
    const text = serializeRun(run, 123);
    const loaded = deserializeRun(data, text)!;
    expect(loaded.savedAt).toBe(123);
    expect(loaded.run).toEqual(run);
    // 시드 RNG가 런 상태(counter)에서 이어지므로 다음 노드의 보상 후보도 같다
    const next = availableNodes(run)[0].id;
    const a = enterNode(data, run, next);
    const b = enterNode(data, loaded.run, next);
    expect(b.module.id).toBe(a.module.id);
    expect(rewardOptions(data, loaded.run, next)).toEqual(rewardOptions(data, run, next));
  });

  it('후반 스테이지 런도 왕복한다', () => {
    const run = createRunAt(data, 'SAVE2', 's5');
    expect(deserializeRun(data, serializeRun(run))!.run).toEqual(run);
  });

  it('깨졌거나 버전이 다르거나 데이터와 맞지 않는 저장은 버린다', () => {
    const run = createRun(data, 'SAVE3');
    const good = JSON.parse(serializeRun(run));
    expect(deserializeRun(data, null)).toBeNull();
    expect(deserializeRun(data, '{not json')).toBeNull();
    expect(deserializeRun(data, JSON.stringify({ ...good, version: SAVE_VERSION + 1 }))).toBeNull();
    const badCard = structuredClone(good);
    badCard.run.deck[0].cardId = 'no_such_card';
    expect(deserializeRun(data, JSON.stringify(badCard))).toBeNull();
    const badModule = structuredClone(good);
    badModule.run.map.floors[0][0].moduleId = 'no_such_module';
    expect(deserializeRun(data, JSON.stringify(badModule))).toBeNull();
    const badStage = structuredClone(good);
    badStage.run.stageId = 'nowhere';
    expect(deserializeRun(data, JSON.stringify(badStage))).toBeNull();
  });

  it('진 런은 이어 갈 수 없고, 마친 런(완결)은 클리어 지도로 남는다', () => {
    const run = createRun(data, 'SAVE4');
    run.status = 'defeat';
    expect(deserializeRun(data, serializeRun(run))).toBeNull();
    run.status = 'complete';
    expect(deserializeRun(data, serializeRun(run))).not.toBeNull();
    run.status = 'stage_clear';
    expect(deserializeRun(data, serializeRun(run))).not.toBeNull();
  });
});

describe('저장 5 — 데미지·체력 10배(2026-10-12)', () => {
  it('저장 4 이하의 체력·최대 체력·전투 기록은 10배로 읽는다(지금 저장은 그대로)', () => {
    const run = createRun(data, 'HPX10');
    const haun = run.roster[0];
    haun.hp = 55;
    haun.maxHp = 70;
    run.stats.damage = 123;
    const old = JSON.parse(serializeRun(run, 1));
    old.version = 4;
    const loaded = deserializeRun(data, JSON.stringify(old))!;
    expect(loaded.run.roster[0].hp).toBe(550);
    expect(loaded.run.roster[0].maxHp).toBe(700);
    expect(loaded.run.stats.damage).toBe(1230);
    const same = deserializeRun(data, serializeRun(run, 1))!;
    expect(same.run.roster[0].hp).toBe(55);
    expect(SAVE_VERSION).toBe(5);
  });
});

describe('대강화 저장 정리(2026-10-15)', () => {
  it('데이터에 없는 각인은 지우고, 덱에 없는 카드의 각인 고르기는 버린다', () => {
    const run = createRun(data, 'SAVEF');
    const c = run.deck[0];
    c.marks = ['refine', 'no_such_mark'];
    run.engravings = { [c.cardId]: ['no_such_mark', 'light'], no_such_card: ['refine'] };
    run.forgePending = { uid: c.uid, cardId: c.cardId, level: 7, choices: ['no_such_mark', 'edge'] };
    const a = deserializeRun(data, serializeRun(run))!.run;
    expect(a.deck[0].marks).toEqual(['refine']);
    expect(a.engravings).toEqual({ [c.cardId]: ['light'] });
    expect(a.forgePending?.choices).toEqual(['edge']);
    run.forgePending = { uid: 'gone', cardId: c.cardId, level: 7, choices: ['edge'] };
    expect(deserializeRun(data, serializeRun(run))!.run.forgePending).toBeNull();
    run.forgePending = { uid: c.uid, cardId: c.cardId, level: 7, choices: ['no_such_mark'] };
    expect(deserializeRun(data, serializeRun(run))!.run.forgePending).toBeNull();
  });
});

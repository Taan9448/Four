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

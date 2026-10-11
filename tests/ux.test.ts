// UI/UX 개선(2026-10-11) 중 엔진에 걸린 것: 스테이지 끝 '얻은 것' · 폭주로 잃은 체력
import { describe, expect, it } from 'vitest';
import { changeRift } from '../src/engine/effects';
import { createRun, markStageStart, stageGainsSummary } from '../src/engine/run';
import { battle, data } from './helpers';

describe('스테이지 끝 화면의 얻은 것(3-2)', () => {
  it('스테이지를 시작할 때와 비교해 얻은 카드·유물·레벨업·상흔 변화를 낸다', () => {
    const run = createRun(data, 'UX1');
    expect(run.stageStart).toBeDefined();
    run.stageGains.push([...data.cards.keys()][0]);
    run.relics.push([...data.relics.keys()][0]);
    run.roster[0].level += 2;
    run.scar += 3;
    const g = stageGainsSummary(data, run);
    expect(g.cards).toHaveLength(1);
    expect(g.relics).toEqual([data.relics.get([...data.relics.keys()][0])!.name]);
    expect(g.levels).toEqual([{ name: data.characters.get('haun')!.name, from: 1, to: 3 }]);
    expect(g.scarDelta).toBe(3);
    markStageStart(run);
    expect(stageGainsSummary(data, run).scarDelta).toBe(0);
    expect(stageGainsSummary(data, run).relics).toEqual([]);
  });
});

describe('결과 화면: 폭주로 잃은 체력(3-3)', () => {
  it('균열 폭주가 아군에게 준 체력 손실을 전투 집계에 더한다', () => {
    const s = battle();
    s.tally = { kills: 0, damage: 0, crits: 0, surges: 0, cards: {} };
    const before = s.party.reduce((a, p) => a + p.hp, 0);
    changeRift(s, data.balance.rift.max);
    const after = s.party.reduce((a, p) => a + Math.max(0, p.hp), 0);
    expect(s.tally.surges).toBe(1);
    expect(s.tally.surgeHp).toBe(before - after);
    expect(s.tally.surgeHp).toBeGreaterThan(0);
  });
});

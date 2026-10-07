// S5 세계의 틈: 지도, 보른·카일이 남는 연출, 모르데카이(흐름 포식·매듭·날 얹기), 캠페인 끝
import { describe, expect, it } from 'vitest';
import { createBattle, playCard, type BattleOutcome } from '../src/engine/battle';
import { createRng } from '../src/engine/rng';
import { generateStageMap, validateMap } from '../src/engine/route';
import {
  advanceStage,
  applyBattleOutcome,
  applyChoice,
  availableNodes,
  battleSetupFor,
  createRun,
  createRunAt,
  enterNode,
  isBattle,
  setParty,
} from '../src/engine/run';
import { data, give } from './helpers';

const ROSTER = ['haun', 'elia', 'kyle', 'born'];
const gen = (seed: string) =>
  generateStageMap(data, 's5', createRng(seed).fork('map:s5'), { scar: 0, flags: [], roster: ROSTER, usedModules: [] });

const bossEnc = () => {
  const module = data.modules.get('s5_boss_mordecai')!;
  return { node: { id: 'f10n0', floor: 10, index: 0, type: 'boss' as const, moduleId: module.id, next: [] }, module };
};

describe('S5 세계의 틈', () => {
  it('200개 시드에서 지도 제약을 지키고, 틈·먼저 가·멋있는 장면·마지막 휴식·모르데카이는 같은 자리에 있다', () => {
    for (let i = 0; i < 200; i++) {
      const map = gen(`s5-${i}`);
      expect(validateMap(data, map), `s5-${i}`).toEqual([]);
      expect(map.floors[0].map((n) => n.moduleId)).toEqual(['s5_story_into_rift']);
      expect(map.floors[6].map((n) => n.moduleId)).toEqual(['s5_story_born_stays']);
      expect(map.floors[7].map((n) => n.moduleId)).toEqual(['s5_story_kyle_stays']);
      expect(map.floors[8].every((n) => n.type === 'rest')).toBe(true);
      expect(map.floors[9].map((n) => n.moduleId)).toEqual(['s5_boss_mordecai']);
    }
  });

  it('createRunAt(S5): 앞의 모든 스테이지를 거쳐 동료 셋·왕일검·하늘이 갈라짐(sky_split)을 갖추고 시작한다', () => {
    const run = createRunAt(data, 'AT-S5', 's5');
    expect(run.roster.map((r) => r.id)).toEqual(ROSTER);
    expect(run.supportActive).toBe(true);
    expect(run.flags).toEqual(expect.arrayContaining(['void_key', 'sky_crack', 'sky_split']));
    expect(availableNodes(run).map((n) => n.moduleId)).toEqual(['s5_story_into_rift']);
  });

  it('먼저 가 → 멋있는 장면: 보른과 카일이 남고, 엘리아가 출전하지 않았어도 하운+엘리아만 남는다', () => {
    const run = createRunAt(data, 'STAY', 's5');
    setParty(data, run, ['haun', 'kyle', 'born']);
    applyChoice(data, run, data.modules.get('s5_story_born_stays')!, 0);
    expect(run.roster.map((r) => r.id)).toEqual(['haun', 'elia', 'kyle']);
    expect(run.selected).toEqual(['haun', 'kyle', 'elia']);
    applyChoice(data, run, data.modules.get('s5_story_kyle_stays')!, 0);
    expect(run.selected).toEqual(['haun', 'elia']);
    expect(run.flags).toEqual(expect.arrayContaining(['born_stays', 'kyle_stays']));
  });

  it('모르데카이: 시작하자마자 날 얹기가 손에(더미에 두 장 더), 흐름을 쓴 공격은 먹히고 매듭이 드러나면 날 얹기가 통한다', () => {
    const run = createRunAt(data, 'MORDECAI', 's5');
    const state = createBattle(data, battleSetupFor(data, run, bossEnc()));
    const m = state.enemies[0];
    expect(state.hand.filter((c) => c.cardId === 'haun_place_blade')).toHaveLength(1);
    expect(state.draw.filter((c) => c.cardId === 'haun_place_blade')).toHaveLength(2);
    state.neigong = 20;
    state.mana = 10;
    playCard(state, give(state, 'haun_byeogun'), m.uid);
    expect(m.hp).toBeGreaterThan(200); // 벽운단하는 먹혔다
    playCard(state, give(state, 'haun_read_grain'), m.uid);
    playCard(state, give(state, 'haun_read_grain'), m.uid);
    expect(m.statuses.knot_exposed).toBe(1);
    const before = m.hp;
    playCard(state, state.hand.findIndex((c) => c.cardId === 'haun_place_blade'), m.uid);
    expect(before - m.hp).toBeGreaterThanOrEqual(40);
  });

  it('S5를 끝까지 진행하면 틈이 닫히고(rift_sealed) 캠페인이 끝난다. 엔딩 장면은 에필로그', () => {
    const run = createRunAt(data, 'S5-RUN', 's5');
    const win = (): BattleOutcome => ({ result: 'victory', survived: false, party: run.selected.map((id) => ({ id, hp: 10 })), mana: run.mana, scarGain: 0 });
    let guard = 0;
    while (run.status === 'map' && guard++ < 30) {
      const enc = enterNode(data, run, availableNodes(run)[0].id);
      if (isBattle(enc)) {
        if (enc.node.type === 'boss') expect(run.selected).toEqual(['haun', 'elia']);
        createBattle(data, battleSetupFor(data, run, enc));
        applyBattleOutcome(data, run, enc, win());
      } else {
        applyChoice(data, run, enc.module, 0, run.deck[0].uid);
      }
    }
    expect(run.status).toBe('stage_clear');
    expect(run.flags).toContain('rift_sealed');
    expect(advanceStage(data, run)).toBe(false);
    expect(run.status).toBe('complete');
    const stage = data.stages.find((s) => s.id === run.stageId)!;
    expect(data.scenes.has(stage.endingScene!)).toBe(true);
  });

  it('S4 보스를 넘으면 S5로 넘어가 갈라지는 하늘에서 시작한다', () => {
    const run = createRun(data, 'S4-S5', { stageId: 's4' });
    run.status = 'stage_clear';
    expect(advanceStage(data, run)).toBe(true);
    expect(run.stageId).toBe('s5');
    expect(availableNodes(run).map((n) => n.moduleId)).toEqual(['s5_story_into_rift']);
  });
});

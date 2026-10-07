// S0 청운산(프롤로그): 지도, 버티기 전투, S0 → S1 스테이지 이동
import { describe, expect, it } from 'vitest';
import { createBattle, endTurn, type BattleOutcome } from '../src/engine/battle';
import { createRng } from '../src/engine/rng';
import { generateStageMap, validateMap } from '../src/engine/route';
import {
  advanceStage,
  applyBattleOutcome,
  applyChoice,
  availableNodes,
  battleSetupFor,
  createRun,
  enterNode,
  isBattle,
} from '../src/engine/run';
import { battle, data } from './helpers';

const gen = (seed: string) =>
  generateStageMap(data, 's0', createRng(seed).fork('map:s0'), { scar: 0, flags: [], roster: ['haun'], usedModules: [] });

describe('S0 청운산', () => {
  it('새 런은 원작 순서의 첫 스테이지(S0)에서 하운 혼자 시작한다', () => {
    const run = createRun(data, 'S0-START');
    expect(run.stageId).toBe('s0');
    expect(run.roster.map((r) => r.id)).toEqual(['haun']);
  });

  it('200개 시드에서 지도 제약을 지키고, 튜토리얼·밀담·귀곡애는 같은 자리에 있다', () => {
    for (let i = 0; i < 200; i++) {
      const map = gen(`s0-${i}`);
      expect(validateMap(data, map), `s0-${i}`).toEqual([]);
      expect(map.floors[0].map((n) => n.moduleId)).toEqual(['s0_tutorial_woodpile']);
      expect(map.floors[2].map((n) => n.moduleId)).toEqual(['s0_story_secret_talk']);
      expect(map.floors[3].every((n) => n.type === 'event')).toBe(true);
      expect(map.floors[4].map((n) => n.moduleId)).toEqual(['s0_boss_ghost_cliff']);
    }
  });

  it('귀곡애: 곽도진은 이길 수 없지만 3턴을 버티면 승리(버티기)로 끝난다', () => {
    const s = battle({ world: 'murim', enemies: ['kwak_dojin_cliff'], surviveTurns: 3 });
    endTurn(s);
    endTurn(s);
    expect(s.result).toBeNull();
    endTurn(s);
    expect(s.result).toBe('victory');
    expect(s.survived).toBe(true);
    // 검기 7 + 쾌검 4×3 + 운해귀종 20
    expect(s.party[0].hp).toBe(60 - 7 - 12 - 20);
    expect(s.events.some((e) => e.type === 'survived')).toBe(true);
  });

  it('귀곡애: 버티기 전에 하운이 쓰러지면 패배', () => {
    const s = battle({ world: 'murim', enemies: ['kwak_dojin_cliff'], surviveTurns: 3 });
    s.party[0].hp = 5;
    endTurn(s);
    expect(s.result).toBe('defeat');
    expect(s.survived).toBe(false);
  });

  it('S0을 끝까지 진행하면 S1로 넘어가 덱은 이어지고 체력은 회복된다', () => {
    const run = createRun(data, 'S0-RUN');
    const win = (hp: number): BattleOutcome => ({ result: 'victory', survived: false, party: [{ id: 'haun', hp }], mana: run.mana, scarGain: 0 });
    let guard = 0;
    while (run.status === 'map' && guard++ < 20) {
      const enc = enterNode(data, run, availableNodes(run)[0].id);
      if (isBattle(enc)) {
        const setup = battleSetupFor(data, run, enc);
        if (enc.node.type === 'boss') expect(setup.surviveTurns).toBe(3);
        createBattle(data, setup);
        applyBattleOutcome(data, run, enc, win(20));
      } else {
        applyChoice(data, run, enc.module, 0);
      }
    }
    expect(run.status).toBe('stage_clear');
    expect(run.flags).toContain('overheard_pact');
    const deckSize = run.deck.length;
    expect(advanceStage(data, run)).toBe(true);
    expect(run.stageId).toBe('s1');
    expect(run.status).toBe('map');
    expect(run.deck.length).toBe(deckSize);
    expect(run.roster[0].hp).toBe(run.roster[0].maxHp);
    expect(availableNodes(run).map((n) => n.moduleId)).toEqual(['s1_story_companions']);
  });

  it('마지막 플레이 가능 스테이지를 넘으면 캠페인(구현 범위)이 끝난다', () => {
    const run = createRun(data, 'END', { stageId: 's1' });
    run.status = 'stage_clear';
    expect(advanceStage(data, run)).toBe(false);
    expect(run.status).toBe('complete');
  });

  it('이벤트 체력 손실로는 쓰러지지 않는다', () => {
    const run = createRun(data, 'HPLOSS');
    run.roster[0].hp = 3;
    const slope = data.modules.get('s0_event_forest_slope')!;
    run.position = 'f4n0';
    applyChoice(data, run, slope, 0);
    expect(run.roster[0].hp).toBe(1);
  });
});

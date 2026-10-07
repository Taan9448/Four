// S2 마왕성 노크투르나: 지도, 사천왕 보너스, 바르가스전의 천외귀운, S1 → S2 이동, clearEffects
import { describe, expect, it } from 'vitest';
import { createBattle, type BattleOutcome } from '../src/engine/battle';
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
import { data } from './helpers';

const ROSTER = ['haun', 'elia', 'kyle', 'born'];
const gen = (seed: string) =>
  generateStageMap(data, 's2', createRng(seed).fork('map:s2'), { scar: 0, flags: ['unha_sword'], roster: ROSTER, usedModules: [] });

/** S1을 마친 상태의 런(동료 셋 합류, 운하검) */
function s2Run(seed: string, party = ['haun', 'elia', 'kyle']) {
  const run = createRun(data, seed, { stageId: 's2' });
  for (const id of ROSTER.slice(1)) {
    const def = data.characters.get(id)!;
    run.roster.push({ id, hp: def.maxHp, maxHp: def.maxHp });
  }
  run.flags.push('met_companions', 'unha_sword');
  setParty(data, run, party);
  return run;
}

describe('S2 마왕성 노크투르나', () => {
  it('200개 시드에서 지도 제약을 지키고, 성문 이야기·마지막 휴식·바르가스는 같은 자리에 있다', () => {
    for (let i = 0; i < 200; i++) {
      const map = gen(`s2-${i}`);
      expect(validateMap(data, map), `s2-${i}`).toEqual([]);
      expect(map.floors[0].map((n) => n.moduleId)).toEqual(['s2_story_castle_gate']);
      expect(map.floors[9].every((n) => n.type === 'rest')).toBe(true);
      expect(map.floors[10].map((n) => n.moduleId)).toEqual(['s2_boss_vargas']);
      // 사천왕은 한 지도에 한 번씩만
      const elites = map.floors.flat().filter((n) => n.type === 'elite').map((n) => n.moduleId);
      expect(new Set(elites).size).toBe(elites.length);
    }
  });

  it('사천왕 엘리트 보너스는 짝이 되는 동료가 출전했을 때만 붙는다', () => {
    const pairs: [string, string][] = [
      ['s2_elite_ice_queen', 'elia'],
      ['s2_elite_earth_giant', 'born'],
      ['s2_elite_shadow_assassin', 'kyle'],
    ];
    for (const [moduleId, member] of pairs) {
      const module = data.modules.get(moduleId)!;
      const others = ROSTER.filter((id) => id !== member && id !== 'haun').slice(0, 2);
      const node = { id: 'f5n0', floor: 5, index: 0, type: 'elite' as const, moduleId, next: [] };
      const withIt = battleSetupFor(data, s2Run('B1', ['haun', member]), { node, module });
      const without = battleSetupFor(data, s2Run('B2', ['haun', ...others]), { node, module });
      expect(withIt.startEffects?.length, moduleId).toBeGreaterThan(0);
      expect(without.startEffects, moduleId).toEqual([]);
      const state = createBattle(data, withIt);
      const status = module.content.bonus!.effects[0].status!;
      expect(state.enemies[0].statuses[status], moduleId).toBeGreaterThan(0);
    }
  });

  it('바르가스전: 시작하자마자 천외귀운이 손에 들어온다', () => {
    const run = s2Run('VARGAS');
    const module = data.modules.get('s2_boss_vargas')!;
    const node = { id: 'f11n0', floor: 11, index: 0, type: 'boss' as const, moduleId: module.id, next: [] };
    const state = createBattle(data, battleSetupFor(data, run, { node, module }));
    expect(state.hand.map((c) => c.cardId)).toContain('haun_cheonoe');
    expect(run.deck.some((c) => c.cardId === 'haun_cheonoe')).toBe(false);
  });

  it('S2를 끝까지 진행하면 바르가스를 이긴 뒤 천외귀운을 영구로 얻는다', () => {
    const run = s2Run('S2-RUN');
    const win = (): BattleOutcome => ({
      result: 'victory',
      survived: false,
      party: run.selected.map((id) => ({ id, hp: 10 })),
      mana: run.mana,
      scarGain: 0,
    });
    let guard = 0;
    let clearMessages: string[] = [];
    while (run.status === 'map' && guard++ < 30) {
      const enc = enterNode(data, run, availableNodes(run)[0].id);
      if (isBattle(enc)) {
        createBattle(data, battleSetupFor(data, run, enc));
        clearMessages = applyBattleOutcome(data, run, enc, win());
      } else {
        applyChoice(data, run, enc.module, 0, run.deck[0].uid);
      }
    }
    expect(run.status).toBe('stage_clear');
    expect(run.flags).toContain('nocturna');
    expect(run.flags).toContain('void_key');
    expect(run.deck.filter((c) => c.cardId === 'haun_cheonoe')).toHaveLength(1);
    expect(clearMessages).toContain('카드 획득: 천외귀운');
  });

  it('보스가 아닌 전투는 clearEffects를 적용하지 않는다', () => {
    const run = s2Run('NOCLEAR');
    const enc = enterNode(data, run, availableNodes(run)[0].id);
    applyChoice(data, run, enc.module, 1);
    const next = enterNode(data, run, availableNodes(run)[0].id);
    const before = run.deck.length;
    if (isBattle(next)) {
      const out = applyBattleOutcome(data, run, next, { result: 'victory', survived: false, party: [], mana: run.mana, scarGain: 0 });
      expect(out).toEqual([]);
    }
    expect(run.deck.length).toBe(before);
    expect(run.status).toBe('map');
  });

  it('S1 보스를 넘으면 S2로 넘어가 성문 이야기에서 시작한다', () => {
    const run = createRun(data, 'S1-S2', { stageId: 's1' });
    run.status = 'stage_clear';
    expect(advanceStage(data, run)).toBe(true);
    expect(run.stageId).toBe('s2');
    expect(availableNodes(run).map((n) => n.moduleId)).toEqual(['s2_story_castle_gate']);
  });

  it('createRunAt(S2): 앞 스테이지의 고정 스토리를 거쳐 동료 셋·운하검을 갖추고 성문에서 시작한다', () => {
    const run = createRunAt(data, 'AT-S2', 's2');
    expect(run.stageId).toBe('s2');
    expect(run.roster.map((r) => r.id)).toEqual(ROSTER);
    expect(run.selected).toHaveLength(data.balance.party.max);
    expect(run.flags).toEqual(expect.arrayContaining(['met_companions', 'unha_sword']));
    expect(run.deck.some((c) => c.cardId === 'haun_byeogun')).toBe(true);
    expect(availableNodes(run).map((n) => n.moduleId)).toEqual(['s2_story_castle_gate']);
  });
});

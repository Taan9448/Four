// S4 천마봉: 지도, 진법 선택, 곽도진+사무결 2인 보스, 붉은 거인 변신, 도진아, S3 → S4 이동
import { describe, expect, it } from 'vitest';
import { createBattle, endTurn, type BattleOutcome } from '../src/engine/battle';
import { dealDamage } from '../src/engine/effects';
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
} from '../src/engine/run';
import type { EnemyState } from '../src/engine/state';
import { battle, data } from './helpers';

const ROSTER = ['haun', 'elia', 'kyle', 'born'];
const gen = (seed: string) =>
  generateStageMap(data, 's4', createRng(seed).fork('map:s4'), { scar: 0, flags: [], roster: ROSTER, usedModules: [] });

const boss = (supportActive = false) => battle({ world: 'murim', enemies: ['kwak_dojin', 'sa_mugyeol'], mana: 2, supportActive });
const kill = (s: ReturnType<typeof boss>, e: EnemyState) => dealDamage(s, null, e, e.hp + e.block + 100, { source: null });

describe('S4 천마봉', () => {
  it('200개 시드에서 지도 제약을 지키고, 구천 계단·마지막 휴식·혈전은 같은 자리에 있다', () => {
    for (let i = 0; i < 200; i++) {
      const map = gen(`s4-${i}`);
      expect(validateMap(data, map), `s4-${i}`).toEqual([]);
      expect(map.floors[0].map((n) => n.moduleId)).toEqual(['s4_story_nine_stairs']);
      expect(map.floors[9].every((n) => n.type === 'rest')).toBe(true);
      expect(map.floors[10].map((n) => n.moduleId)).toEqual(['s4_boss_blood_hall']);
    }
  });

  it('createRunAt(S4): 왕일검 지원·운해귀종·천외귀운을 갖추고, 진법 셋 중 하나를 고른다', () => {
    const run = createRunAt(data, 'AT-S4', 's4');
    expect(run.supportActive).toBe(true);
    expect(run.flags).toEqual(expect.arrayContaining(['reunion', 'sky_crack']));
    expect(run.deck.some((c) => c.cardId === 'haun_unhae')).toBe(true);
    const enc = enterNode(data, run, availableNodes(run)[0].id);
    expect(enc.module.content.choices).toHaveLength(3);
    applyChoice(data, run, enc.module, 2);
    expect(run.flags).toContain('formation_plum');
  });

  it('곽도진이 쓰러지면 혼자 남은 사무결이 붉은 거인으로 변신하고, 엘리아의 마나와 천외귀운이 손에 들어온다', () => {
    const s = boss();
    const [kwak, sa] = s.enemies;
    sa.hp = 40;
    kill(s, kwak);
    expect(kwak.downed).toBe(true);
    expect(s.result).toBeNull();
    expect(sa.defId).toBe('sa_mugyeol_giant');
    expect(sa.hp).toBe(sa.maxHp);
    expect(sa.maxHp).toBe(data.enemies.get('sa_mugyeol_giant')!.maxHp);
    expect(sa.intent).toBeNull();
    expect(s.mana).toBe(2 + 5);
    expect(s.hand.some((c) => c.cardId === 'haun_cheonoe')).toBe(true);
    expect(s.events.some((e) => e.type === 'transform' && e.uid === sa.uid)).toBe(true);
  });

  it('변신한 차례에는 행동하지 않고, 다음 차례부터 거인의 행동을 한다. 거인을 쓰러뜨리면 승리', () => {
    const s = boss();
    const [kwak, sa] = s.enemies;
    kill(s, kwak);
    const hpBefore = s.party[0].hp;
    endTurn(s);
    expect(s.party[0].hp).toBe(hpBefore); // 거인은 이번 적 차례에 쉬었다
    expect(data.enemies.get('sa_mugyeol_giant')!.moves.map((m) => m.id)).toContain(sa.intent!.moveId);
    kill(s, sa);
    expect(s.result).toBe('victory');
  });

  it('사무결을 먼저 쓰러뜨려도 그 자리에서 거인으로 변신한다(곽도진은 그대로)', () => {
    const s = boss();
    const [kwak, sa] = s.enemies;
    kill(s, sa);
    expect(sa.downed).toBe(false);
    expect(sa.defId).toBe('sa_mugyeol_giant');
    expect(kwak.defId).toBe('kwak_dojin');
    kill(s, kwak);
    expect(sa.defId).toBe('sa_mugyeol_giant'); // 거인은 다시 변신하지 않는다
    expect(s.result).toBeNull();
  });

  it('왕일검 지원: 곽도진의 체력이 절반 아래로 떨어지면 "도진아"로 굳는다', () => {
    const s = boss(true);
    const kwak = s.enemies[0];
    dealDamage(s, null, kwak, Math.ceil(kwak.maxHp / 2) + 1, { source: null });
    expect(kwak.statuses.stun).toBe(1);
    expect(s.events.some((e) => e.type === 'support' && e.ruleId === 'wang_dojin')).toBe(true);
  });

  it('S4를 끝까지 진행하면 혈전을 넘고 하늘이 갈라진다(sky_split)', () => {
    const run = createRunAt(data, 'S4-RUN', 's4');
    const win = (): BattleOutcome => ({ result: 'victory', survived: false, party: run.selected.map((id) => ({ id, hp: 10 })), mana: run.mana, scarGain: 0 });
    let guard = 0;
    while (run.status === 'map' && guard++ < 30) {
      const enc = enterNode(data, run, availableNodes(run)[0].id);
      if (isBattle(enc)) {
        createBattle(data, battleSetupFor(data, run, enc));
        applyBattleOutcome(data, run, enc, win());
      } else {
        applyChoice(data, run, enc.module, 0, run.deck[0].uid);
      }
    }
    expect(run.status).toBe('stage_clear');
    expect(run.flags).toContain('sky_split');
  });

  it('S3 보스를 넘으면 S4로 넘어가 구천 계단에서 시작한다', () => {
    const run = createRun(data, 'S3-S4', { stageId: 's3' });
    run.status = 'stage_clear';
    expect(advanceStage(data, run)).toBe(true);
    expect(run.stageId).toBe('s4');
    expect(availableNodes(run).map((n) => n.moduleId)).toEqual(['s4_story_nine_stairs']);
  });
});

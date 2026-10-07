// S3 혈로: 지도, 운곡촌 첫 전투, 폐사찰 재회(왕일검 합류·운해귀종), 무림 마나, S2 → S3 이동
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
} from '../src/engine/run';
import { data } from './helpers';

const ROSTER = ['haun', 'elia', 'kyle', 'born'];
const gen = (seed: string) =>
  generateStageMap(data, 's3', createRng(seed).fork('map:s3'), { scar: 0, flags: [], roster: ROSTER, usedModules: [] });

describe('S3 혈로', () => {
  it('200개 시드에서 지도 제약을 지키고, 운곡촌·폐사찰·마지막 휴식·분타주는 같은 자리에 있다', () => {
    for (let i = 0; i < 200; i++) {
      const map = gen(`s3-${i}`);
      expect(validateMap(data, map), `s3-${i}`).toEqual([]);
      expect(map.floors[0].map((n) => n.moduleId)).toEqual(['s3_story_unggok']);
      expect(map.floors[2].map((n) => n.moduleId)).toEqual(['s3_story_reunion']);
      expect(map.floors[10].every((n) => n.type === 'rest')).toBe(true);
      expect(map.floors[11].map((n) => n.moduleId)).toEqual(['s3_boss_branch_lord']);
    }
  });

  it('createRunAt(S3): S2까지의 흐름(동료 셋·운하검·천외귀운·공허의 열쇠)을 갖추고 운곡촌에서 시작한다', () => {
    const run = createRunAt(data, 'AT-S3', 's3');
    expect(run.roster.map((r) => r.id)).toEqual(ROSTER);
    expect(run.flags).toEqual(expect.arrayContaining(['unha_sword', 'nocturna', 'void_key']));
    expect(run.deck.filter((c) => c.cardId === 'haun_cheonoe')).toHaveLength(1);
    expect(run.supportActive).toBe(false);
    expect(availableNodes(run).map((n) => n.moduleId)).toEqual(['s3_story_unggok']);
  });

  it('운곡촌은 장면 뒤 전투로 시작하고, 무림에서는 전투 시작 마나가 런 마나 그대로다', () => {
    const run = createRunAt(data, 'UNGGOK', 's3');
    run.mana = 4;
    const enc = enterNode(data, run, availableNodes(run)[0].id);
    expect(isBattle(enc)).toBe(true);
    expect(enc.module.content.scene).toBe('s3_scene_inverted');
    const state = createBattle(data, battleSetupFor(data, run, enc));
    expect(state.world).toBe('murim');
    expect(state.mana).toBe(4);
  });

  it('폐사찰 재회: 왕일검이 지원으로 합류(파티 슬롯 없음)하고 운해귀종을 얻는다', () => {
    const run = createRunAt(data, 'REUNION', 's3');
    const module = data.modules.get('s3_story_reunion')!;
    const before = run.roster.length;
    applyChoice(data, run, module, 0);
    expect(run.supportActive).toBe(true);
    expect(run.flags).toContain('support:wang');
    expect(run.roster.length).toBe(before);
    expect(run.deck.some((c) => c.cardId === 'haun_unhae')).toBe(true);
  });

  it('S3를 끝까지 진행하면 분타주를 넘고 하늘의 금(sky_crack)을 본다', () => {
    const run = createRunAt(data, 'S3-RUN', 's3');
    const win = (): BattleOutcome => ({
      result: 'victory',
      survived: false,
      party: run.selected.map((id) => ({ id, hp: 10 })),
      mana: run.mana,
      scarGain: 0,
    });
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
    expect(run.flags).toEqual(expect.arrayContaining(['reunion', 'sky_crack']));
    expect(run.supportActive).toBe(true);
  });

  it('S2 보스를 넘으면 S3로 넘어가 운곡촌에서 시작한다', () => {
    const run = createRun(data, 'S2-S3', { stageId: 's2' });
    run.status = 'stage_clear';
    expect(advanceStage(data, run)).toBe(true);
    expect(run.stageId).toBe('s3');
    expect(availableNodes(run).map((n) => n.moduleId)).toEqual(['s3_story_unggok']);
  });
});

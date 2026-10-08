// 10스테이지 캠페인(원작 4권, GAME_DESIGN 3절): 스테이지마다 지도 제약·고정 노드·보스, 스테이지 사이의 약속(플래그·카드·동료),
// 원작 보스 기믹(이그니스의 협곡 장악, 셀리아스와 왕녀의 얼음, 바르가스의 쐐기, 혈수마군의 피의 덮개, 혈전의 붉은 거인,
// 모르데카이와 마지막 한 땀), 무림·틈의 마나 규칙.
import { describe, expect, it } from 'vitest';
import { createBattle, playCard, type BattleOutcome } from '../src/engine/battle';
import { createRng } from '../src/engine/rng';
import { generateStageMap, validateMap } from '../src/engine/route';
import {
  advanceStage,
  applyBattleOutcome,
  applyRunOps,
  battleSetupFor,
  createRunAt,
  playableStages,
  setParty,
  type Encounter,
} from '../src/engine/run';
import { alive, type BattleState } from '../src/engine/state';
import { data, give } from './helpers';

const STAGES = playableStages(data);
const ROSTER = ['haun', 'elia', 'kyle', 'born'];

function bossEnc(stageId: string): Encounter {
  const st = data.stages.find((s) => s.id === stageId)!;
  const module = data.modules.get(st.boss!)!;
  return { node: { id: 'boss', floor: st.floors + 1, index: 0, type: 'boss', moduleId: module.id, next: [] }, module };
}

function bossBattle(stageId: string, seed = 'BOSS'): BattleState {
  const run = createRunAt(data, seed, stageId);
  return createBattle(data, battleSetupFor(data, run, bossEnc(stageId)));
}

describe('캠페인 구조', () => {
  it('스테이지 10개가 원작 순서로 모두 플레이 가능하다', () => {
    expect(STAGES.map((s) => s.id)).toEqual(['s0', 's1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9']);
  });

  for (const st of STAGES) {
    it(`${st.id} ${st.name}: 100개 시드에서 지도 제약을 지키고 고정 노드·보스가 제자리에 있다`, () => {
      const roster = st.id === 's0' ? ['haun'] : ROSTER;
      for (let i = 0; i < 100; i++) {
        const map = generateStageMap(data, st.id, createRng(`${st.id}-${i}`).fork(`map:${st.id}`), { scar: 0, flags: [], roster, usedModules: [] });
        expect(validateMap(data, map), `${st.id}-${i}`).toEqual([]);
        for (const p of st.pinned) expect(map.floors[p.floor - 1].map((n) => n.moduleId)).toEqual([p.module]);
        expect(map.floors[st.floors].map((n) => n.moduleId)).toEqual([st.boss]);
      }
    });
  }

  it('createRunAt으로 각 스테이지를 시작하면 원작 흐름의 동료·플래그·카드를 갖춘다', () => {
    const at = (id: string) => createRunAt(data, `AT-${id}`, id);
    expect(at('s1').roster.map((r) => r.id)).toEqual(['haun']);
    const s2 = at('s2');
    expect(s2.roster.map((r) => r.id)).toEqual(ROSTER);
    expect(s2.flags).toEqual(expect.arrayContaining(['met_companions', 'ugly_sword', 'silien_seed']));
    const s3 = at('s3');
    expect(s3.flags).toEqual(expect.arrayContaining(['byeogun', 'red_sword']));
    // 이야기 카드는 보유 카드로(편성에서 고른다, GAME_DESIGN 9-1)
    expect(Object.keys(s3.collection)).toEqual(expect.arrayContaining(['haun_byeogun', 'kyle_red_sword']));
    const s5 = at('s5');
    expect(s5.flags).toEqual(expect.arrayContaining(['kyle_knight', 'durin_hammer']));
    expect(s5.collection.born_durin_hammer).toBeDefined();
    const s6 = at('s6');
    expect(s6.flags).toEqual(expect.arrayContaining(['rift_known', 'void_key', 'cheonoe']));
    expect(s6.deck.map((c) => c.cardId)).toContain('haun_cheonoe');
    expect(s6.supportActive).toBe(false);
    const s7 = at('s7');
    expect(s7.supportActive).toBe(true);
    expect(s7.flags).toContain('seokdu');
    expect(s7.deck.map((c) => c.cardId)).not.toContain('haun_unhae'); // 운해귀종은 낙안봉 뒤
    const s9 = at('s9');
    expect(s9.flags).toEqual(expect.arrayContaining(['sky_crack', 'unhae', 'elia_bridge']));
    expect(s9.deck.map((c) => c.cardId)).toContain('haun_unhae');
    expect(s9.mana).toBe(0); // 일곱째 굽이의 다리에 남은 마나를 모두 썼다
  });

  it('무림 스테이지(S0·S6~S8)의 선택지는 마나를 채우지 않는다(원작: 무림은 마나가 차지 않는다)', () => {
    const bad: string[] = [];
    for (const m of data.modules.values()) {
      const st = data.stages.find((s) => s.id === m.stage)!;
      if (st.world !== 'murim' && st.world !== 'rift') continue;
      for (const c of m.content.choices ?? []) for (const e of c.effects) if (e.op === 'gain_run_mana' && (e.amount ?? 0) > 0) bad.push(`${m.id}: ${c.label}`);
    }
    expect(bad).toEqual([]);
  });
});

describe('원작 보스 기믹', () => {
  it('S0 귀곡애: 이길 수 없는 전투 — 5턴을 버티면 승리', () => {
    const s = bossBattle('s0');
    expect(s.surviveTurns).toBe(5);
  });

  it('S1 실바렌: 죽은 숲(마나 0에서 시작), 군단장이 쓰러지면 졸개가 무너진다', () => {
    const s = bossBattle('s1');
    expect(s.mana).toBe(0);
    const veilak = s.enemies.find((e) => e.defId === 'veilak')!;
    veilak.hp = 1;
    veilak.statuses = {};
    s.neigong = 5;
    playCard(s, give(s, 'haun_chop'), veilak.uid);
    expect(alive(s.enemies)).toHaveLength(0);
    expect(s.result).toBe('victory');
  });

  it('S2 이그니스: 협곡 장악(마나 0, 차지 않음), 손에 든 흐름에 올라타기가 마나를 채운다', () => {
    const s = bossBattle('s2');
    expect(s.mana).toBe(0);
    const i = s.hand.findIndex((c) => c.cardId === 'haun_ride_flow');
    expect(i).toBeGreaterThanOrEqual(0);
    playCard(s, i, s.enemies[0].uid);
    expect(s.mana).toBe(10);
  });

  it('S3 셀리아스: 왕녀의 얼음이 깨지면 셀리아스가 부서진다', () => {
    const s = bossBattle('s3');
    const ice = s.enemies.find((e) => e.defId === 'princess_ice')!;
    ice.hp = 1;
    ice.statuses = {};
    ice.block = 0;
    s.neigong = 5;
    playCard(s, give(s, 'haun_chop'), ice.uid);
    expect(s.enemies.some((e) => e.defId === 'celias_shattered')).toBe(true);
  });

  it('S4 고르몬: 산이 메운다 — 두린의 망치가 끊는다', () => {
    const run = createRunAt(data, 'GORMON', 's4');
    setParty(data, run, ['haun', 'born', 'kyle']);
    const s = createBattle(data, battleSetupFor(data, run, bossEnc('s4')));
    const g = s.enemies.find((e) => e.defId === 'gormon')!;
    expect(g.statuses.mountain_regen).toBeGreaterThan(0);
    s.neigong = 5;
    playCard(s, give(s, 'born_durin_hammer'), g.uid);
    expect(g.statuses.mountain_regen).toBeUndefined();
  });

  it('S5 바르가스: 쐐기가 있고, 시작 손패에 천외귀운', () => {
    const s = bossBattle('s5');
    expect(s.enemies.some((e) => e.defId === 'wedge')).toBe(true);
    expect(s.hand.some((c) => c.cardId === 'haun_cheonoe')).toBe(true);
  });

  it('S7 혈수마군: 피의 덮개 — 결 읽기가 듣지 않고 천외귀운이 덮개를 벗긴다', () => {
    const s = bossBattle('s7');
    const h = s.enemies.find((e) => e.defId === 'hyeolsu')!;
    s.neigong = 10;
    playCard(s, give(s, 'haun_read_grain'), h.uid);
    expect(h.statuses.grain).toBeUndefined();
    s.mana = 10;
    playCard(s, give(s, 'haun_cheonoe'));
    expect(h.statuses.blood_cover).toBeUndefined();
  });

  it('S8 혈전: 곽도진이 쓰러지면 그 피로 사무결이 붉은 거인이 되고, 천외귀운이 손에 들어온다', () => {
    const s = bossBattle('s8');
    const kwak = s.enemies.find((e) => e.defId === 'kwak_dojin')!;
    kwak.hp = 1;
    kwak.block = 0;
    kwak.statuses = {};
    s.neigong = 5;
    playCard(s, give(s, 'haun_chop'), kwak.uid);
    expect(s.enemies.some((e) => e.defId === 'sa_mugyeol_giant' && !e.downed)).toBe(true);
    expect(s.hand.some((c) => c.cardId === 'haun_cheonoe')).toBe(true);
    expect(s.result).toBeNull();
  });

  it('S9 모르데카이 → 마지막 한 땀: 고리 멈추기가 손에(쓰면 날 얹기), 쓰러지면 찢긴 경계로 바뀌고 실이 손에 들어온다', () => {
    const run = createRunAt(data, 'END', 's9');
    applyRunOps(data, run, [{ op: 'set_flag', flag: 'arden_ice' }, { op: 'leave_party', member: 'born' }, { op: 'leave_party', member: 'kyle' }]);
    expect(run.selected).toEqual(['haun', 'elia']);
    const s = createBattle(data, battleSetupFor(data, run, bossEnc('s9')));
    expect(s.mana).toBe(0);
    const m = s.enemies.find((e) => e.defId === 'mordecai')!;
    // 고리 멈추기: 숨까지 멈춰 흐르지 않는 자가 되고, 결을 드러내고, 날을 얹을 자리가 손에 들어온다
    playCard(s, s.hand.findIndex((c) => c.cardId === 'haun_stop_ring'), m.uid);
    expect(s.party[0].statuses.still).toBe(1);
    expect(s.hand.some((c) => c.cardId === 'haun_place_blade')).toBe(true);
    m.hp = 1;
    m.statuses = {};
    m.block = 0;
    playCard(s, s.hand.findIndex((c) => c.cardId === 'haun_place_blade'), m.uid);
    const border = s.enemies.find((e) => e.defId === 'torn_border')!;
    expect(border).toBeDefined();
    expect(border.statuses.seam).toBe(1);
    for (const id of ['haun_thread', 'haun_unhae', 'elia_ice_thread', 'elia_silver_seed']) expect(s.hand.some((c) => c.cardId === id), id).toBe(true);
    // 실이 아닌 공격은 꿰맬 자리에 들어가지 않는다
    const hp = border.hp;
    s.neigong = 5;
    playCard(s, give(s, 'haun_chop'), border.uid);
    expect(border.hp).toBe(hp);
    playCard(s, s.hand.findIndex((c) => c.cardId === 'haun_thread'), border.uid);
    expect(border.hp).toBeLessThan(hp);
    expect(s.neigongMax).toBe(2);
  });

  it('S9를 이기면 캠페인이 끝난다(에필로그)', () => {
    const run = createRunAt(data, 'FIN', 's9');
    const outcome: BattleOutcome = { result: 'victory', survived: false, party: run.selected.map((id) => ({ id, hp: 10 })), mana: 0, scarGain: 0 };
    applyBattleOutcome(data, run, bossEnc('s9'), outcome);
    expect(run.status).toBe('stage_clear');
    expect(advanceStage(data, run)).toBe(false);
    expect(run.status).toBe('complete');
    expect(data.scenes.has(data.stages.find((s) => s.id === 's9')!.endingScene!)).toBe(true);
  });
});

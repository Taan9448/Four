import { describe, expect, it } from 'vitest';
import { battleOutcome, canPlay, createBattle, endTurn, playCard, scarStartRift } from '../src/engine/battle';
import {
  advanceStage,
  applyBattleOutcome,
  applyChoice,
  availableNodes,
  battleSetupFor,
  choicesFor,
  createRun,
  enterNode,
  isBattle,
  rewardOptions,
  setParty,
} from '../src/engine/run';
import { data } from './helpers';

describe('런 진행', () => {
  it('하운 혼자 시작하고, 1층 스토리에서 동료가 합류한다(출전 최대 3명). 엘하임이라는 이름은 2층 여관에서', () => {
    const run = createRun(data, 'RUN1', { stageId: 's1' });
    expect(run.roster.map((r) => r.id)).toEqual(['haun']);
    const [first] = availableNodes(run);
    const enc = enterNode(data, run, first.id);
    expect(enc.module.id).toBe('s1_story_two_moons');
    applyChoice(data, run, enc.module, 0);
    expect(run.roster.map((r) => r.id)).toEqual(['haun', 'elia', 'kyle', 'born']);
    expect(run.selected).toEqual(['haun', 'elia', 'kyle']);
    expect(run.deck.some((c) => c.cardId === 'elia_fireball')).toBe(true);
    const enc2 = enterNode(data, run, availableNodes(run)[0].id);
    expect(enc2.module.id).toBe('s1_story_silver_bell');
    applyChoice(data, run, enc2.module, 0);
    expect(run.flags).toContain('met_companions');
  });

  it('편성 규칙: 하운 필수, 최대 3명, 합류한 전투원만', () => {
    const run = createRun(data, 'RUN2', { stageId: 's1' });
    expect(() => setParty(data, run, ['haun', 'elia'])).toThrow();
    const enc = enterNode(data, run, availableNodes(run)[0].id);
    applyChoice(data, run, enc.module, 0);
    setParty(data, run, ['haun', 'elia']);
    expect(run.selected).toEqual(['haun', 'elia']);
    expect(() => setParty(data, run, ['elia', 'kyle'])).toThrow();
    expect(() => setParty(data, run, ['haun', 'elia', 'kyle', 'born'])).toThrow();
  });

  it('전투 노드에서 출전 멤버로 전투가 만들어지고, 결과가 런에 반영된다', () => {
    const run = createRun(data, 'RUN3', { stageId: 's1' });
    const enc0 = enterNode(data, run, availableNodes(run)[0].id);
    applyChoice(data, run, enc0.module, 0);
    setParty(data, run, ['haun', 'elia']);
    // 전투 모듈 하나를 직접 고른다(2·3층은 고정 이야기 노드)
    const module = [...data.modules.values()].find((m) => m.stage === 's1' && m.type === 'battle' && m.content.enemies?.every((e) => e === 'shadow_wolf'))!;
    const enc = { node: { id: 'f4n0', floor: 4, index: 0, type: 'battle' as const, moduleId: module.id, next: [] }, module };
    expect(isBattle(enc)).toBe(true);
    const state = createBattle(data, battleSetupFor(data, run, enc));
    expect(state.party.map((p) => p.defId)).toEqual(['haun', 'elia']);
    for (const e of state.enemies) e.hp = 1;
    state.rift = 4;
    while (!state.result) {
      // 편성에 따라 손패가 다르다: 쓸 수 있는 공격 카드 아무거나
      const i = state.hand.findIndex((c, k) => data.cards.get(c.cardId)!.type === 'attack' && data.cards.get(c.cardId)!.target === 'enemy' && canPlay(state, k).ok);
      if (i < 0) {
        endTurn(state);
        continue;
      }
      playCard(state, i, state.enemies.find((e) => !e.downed)!.uid);
    }
    expect(state.result).toBe('victory');
    applyBattleOutcome(data, run, enc, battleOutcome(state)!);
    // 남은 균열 × scarRatio가 상흔이 된다(편성에 따라 균열을 내리는 공격이 끼어 4에서 줄 수 있다)
    expect(run.scar).toBe(Math.floor(state.rift * data.balance.rift.scarRatio) + (state.tally?.surgeScar ?? 0));
    expect(run.scar).toBeGreaterThan(0);
    expect(run.status).toBe('map');
  });

  it('보상 카드 후보는 출전 멤버의 보상 풀에서, 시드로 결정된다', () => {
    const run = createRun(data, 'RUN4', { stageId: 's1' });
    const a = rewardOptions(data, run, 'f2n0');
    expect(a).toEqual(rewardOptions(data, run, 'f2n0'));
    // 출전한 동료(하운)의 카드 + 공용 카드
    expect(a.every((id) => ['haun', 'common'].includes(data.cards.get(id)!.owner))).toBe(true);
    expect(a.length).toBe(3);
  });

  it('보상 등급은 노드 유형별 가중치를 따른다: 일반 전투에는 전설이, 보스에는 일반·고급이 나오지 않고, 보스일수록 높은 등급이 잦다', () => {
    const run = createRun(data, 'RARITY', { stageId: 's1' });
    run.roster.push({ id: 'elia', hp: 420, maxHp: 420, level: 1, xp: 0 }, { id: 'kyle', hp: 520, maxHp: 520, level: 1, xp: 0 });
    run.selected = ['haun', 'elia', 'kyle'];
    const tally = (type: 'battle' | 'elite' | 'boss') => {
      const node = run.map.floors.flat().find((n) => n.type === type)!;
      const counts: Record<string, number> = {};
      for (let i = 0; i < 300; i++) {
        run.seed = `R${i}`;
        for (const id of rewardOptions(data, run, node.id)) {
          const r = data.cards.get(id)!.rarity;
          counts[r] = (counts[r] ?? 0) + 1;
        }
      }
      return counts;
    };
    const battle = tally('battle');
    const boss = tally('boss');
    expect(battle.legendary ?? 0).toBe(0);
    expect(boss.uncommon ?? 0).toBe(0);
    expect(boss.common ?? 0).toBe(0);
    expect((boss.epic ?? 0) / 900).toBeGreaterThan((battle.epic ?? 0) / 900);
  });

  it('휴식의 수련은 사람이 고른 카드를 한 단계 강화하고, +5를 넘지 않는다', () => {
    const run = createRun(data, 'UPG', { stageId: 's1' });
    const rest = data.modules.get('s1_rest_campfire')!;
    const train = choicesFor(data, run, rest).findIndex((c) => c.label === '수련한다');
    const target = run.deck.find((c) => c.cardId === 'haun_read_grain')!;
    for (let i = 0; i < 7; i++) applyChoice(data, run, rest, train, target.uid);
    expect(target.level).toBe(5);
    expect(run.deck.filter((c) => c.uid !== target.uid).every((c) => c.level === 0)).toBe(true);
  });

  it('왕일검 지원이 켜지면 휴식 노드에 토납 수련이 추가된다', () => {
    const rest = data.modules.get('s1_rest_campfire')!;
    const off = createRun(data, 'RUN5', { stageId: 's1' });
    const on = createRun(data, 'RUN5', { stageId: 's1', supportActive: true });
    expect(choicesFor(data, off, rest).length).toBe(2);
    expect(choicesFor(data, on, rest).map((c) => c.label)).toContain('[왕일검] 토납 수련');
  });

  it('같은 시드면 같은 지도로 시작한다', () => {
    expect(JSON.stringify(createRun(data, 'SAME').map)).toBe(JSON.stringify(createRun(data, 'SAME').map));
  });
});

describe('상흔 두 단계(GAME_DESIGN 7절, 2026-10-11 개편)', () => {
  const rest = data.modules.get('s1_rest_campfire')!;
  it('상흔이 있으면 휴식에 꿰매기(상흔 -3, 골드 60), 상흔 10 이상이면 회복 -20%', () => {
    const run = createRun(data, 'SCAR1', { stageId: 's1' });
    expect(choicesFor(data, run, rest).some((c) => c.label.startsWith('꿰매기'))).toBe(false);
    run.scar = 12;
    run.gold = 100;
    const list = choicesFor(data, run, rest);
    const stitch = list.findIndex((c) => c.label.startsWith('꿰매기'));
    expect(stitch).toBeGreaterThan(-1);
    expect(list.find((c) => c.effects.some((e) => e.op === 'heal_party'))!.label).toContain('회복 -20%');
    applyChoice(data, run, rest, stitch);
    expect(run.scar).toBe(9);
    expect(run.gold).toBe(40);
    // 회복 감소: 상흔 10 이상이면 30% 회복이 24%로
    const haun = run.roster[0];
    run.scar = 10;
    haun.hp = 1;
    applyChoice(data, run, rest, 0);
    expect(haun.hp).toBe(1 + Math.floor(haun.maxHp * 0.3 * 0.8));
  });

  it('폭주 없이 보스를 이기면 상흔 -bossCleanBonus, 폭주가 있었으면 그대로(+폭주 상흔)', () => {
    for (const surges of [0, 1]) {
      const run = createRun(data, `SCAR2${surges}`, { stageId: 's1' });
      run.scar = 8;
      const boss = run.map.floors.flat().find((n) => n.type === 'boss')!;
      const enc = { node: boss, module: data.modules.get(boss.moduleId!)! };
      const party = run.selected.map((id) => ({ id, hp: run.roster.find((r) => r.id === id)!.hp }));
      applyBattleOutcome(data, run, enc as never, { result: 'victory', survived: false, party, mana: run.mana, scarGain: surges * 3, tally: { kills: 1, damage: 0, crits: 0, surges, cards: {} } });
      expect(run.scar).toBe(surges ? 11 : Math.max(0, 8 - data.balance.rift.scar.bossCleanBonus));
    }
  });

  it('S8 혈전을 넘기면 폭주가 있었어도 상흔 -bossClearScar(2026-10-12)', () => {
    const cut = data.balance.rift.scar.bossClearScar.s8;
    expect(cut).toBeGreaterThan(0);
    const run = createRun(data, 'SCAR8', { stageId: 's8' });
    run.scar = 20;
    const boss = run.map.floors.flat().find((n) => n.type === 'boss')!;
    const enc = { node: boss, module: data.modules.get(boss.moduleId!)! };
    const party = run.selected.map((id) => ({ id, hp: run.roster.find((r) => r.id === id)!.hp }));
    const out = applyBattleOutcome(data, run, enc as never, { result: 'victory', survived: false, party, mana: run.mana, scarGain: 0, tally: { kills: 1, damage: 0, crits: 0, surges: 1, cards: {} } });
    expect(run.scar).toBe(20 - cut);
    expect(out).toContain(`혈전을 넘어 상흔 -${cut}`);
  });

  it('전투 시작 균열 상한은 세계별(틈 세계는 낮게)', () => {
    const per = data.balance.rift.scar.startRiftPer;
    const max = data.balance.rift.scar.startRiftMax;
    expect(scarStartRift(data, per * 10, 'murim')).toBe(max.murim);
    expect(scarStartRift(data, per * 10, 'rift')).toBe(max.rift);
    expect(max.rift).toBeLessThan(max.murim);
    expect(scarStartRift(data, per, 'rift')).toBe(1);
  });

  it('상흔 scarCrackAt 이상으로 다음 스테이지에 들어서면 지도가 한 번 갈라진다(폭주 수에는 안 셈)', () => {
    const at = data.balance.rift.map.scarCrackAt!;
    for (const scar of [at - 1, at]) {
      const run = createRun(data, 'SCARMAP', { stageId: 's1' });
      run.scar = scar;
      run.status = 'stage_clear';
      expect(advanceStage(data, run)).toBe(true);
      const cracked = run.map.floors.flat().some((n) => n.crack);
      expect(!!run.map.scarCrack).toBe(scar >= at);
      expect(cracked || (run.map.cuts?.length ?? 0) > 0).toBe(scar >= at);
      expect(run.map.surges ?? 0).toBe(0);
    }
  });
});

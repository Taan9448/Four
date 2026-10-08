import { describe, expect, it } from 'vitest';
import { battleOutcome, createBattle, playCard } from '../src/engine/battle';
import {
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
      const i = state.hand.findIndex((c) => ['haun_chop', 'elia_fireball'].includes(c.cardId));
      if (i < 0) break;
      playCard(state, i, state.enemies.find((e) => !e.downed)!.uid);
    }
    expect(state.result).toBe('victory');
    applyBattleOutcome(data, run, enc, battleOutcome(state)!);
    expect(run.scar).toBe(2);
    expect(run.status).toBe('map');
  });

  it('보상 카드 후보는 출전 멤버의 보상 풀에서, 시드로 결정된다', () => {
    const run = createRun(data, 'RUN4', { stageId: 's1' });
    const a = rewardOptions(data, run, 'f2n0');
    expect(a).toEqual(rewardOptions(data, run, 'f2n0'));
    expect(a.every((id) => data.cards.get(id)!.owner === 'haun')).toBe(true);
    expect(a.length).toBe(3);
  });

  it('보상 등급은 노드 유형별 가중치를 따른다: 일반·전설은 나오지 않고, 엘리트·보스일수록 높은 등급이 잦다', () => {
    const run = createRun(data, 'RARITY', { stageId: 's1' });
    run.roster.push({ id: 'elia', hp: 42, maxHp: 42, level: 1, xp: 0 }, { id: 'kyle', hp: 52, maxHp: 52, level: 1, xp: 0 });
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
    expect(battle.common ?? 0).toBe(0);
    expect(battle.legendary ?? 0).toBe(0);
    expect(boss.uncommon ?? 0).toBe(0);
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

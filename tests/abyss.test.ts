// 심연(GAME_DESIGN 16절): 굽이·숙적·보상 풀·덱 직접 추가·제거·배율·동료 1~3명·길·틈의 거래·저장
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/engine/data';
import {
  abyssPool,
  abyssStage,
  advanceLoop,
  createAbyssRun,
  pathOffer,
  pathPicks,
  planLoop,
  removePrice,
  riftCards,
} from '../src/engine/abyss';
import { applyChoice, applyRunOps, battleSetupFor, choicesFor, enterNode, rewardOptions, availableNodes, type RunState } from '../src/engine/run';
import { createBattle } from '../src/engine/battle';
import { validateMap } from '../src/engine/route';
import { buyRemove, openShop } from '../src/engine/economy';
import { deserializeRun, serializeRun } from '../src/engine/save';
import { playAbyss } from '../src/sim/bot';

const data = gameData();
const pool = abyssPool(data, { haun_byeogun: 3, elia_fireball: 2 }, ['kyle_strike', 'born_axe', 'common_punch', ...[...data.cards.values()].filter((c) => c.pool === 'reward').slice(0, 30).map((c) => c.id)]);
const start = (seed: string, mates: string[]) => {
  const offer = pathOffer(data, seed);
  return createAbyssRun(data, seed, { mates, paths: offer.slice(0, pathPicks(data, mates.length).picks), pool });
};

describe('심연', () => {
  it('풀: 시작 카드 ∪ 보유(강화 그대로) ∪ 도감(+0). 이야기 카드는 빠진다', () => {
    expect(pool.elia_fireball).toBe(2);
    expect(pool.kyle_strike).toBe(0);
    expect(pool.haun_byeogun).toBeUndefined(); // 이야기 카드
    expect(Object.keys(pool).every((id) => ['starter', 'reward'].includes(data.cards.get(id)!.pool))).toBe(true);
  });

  it('시작: 동료 수에 따라 덱 14·18·22장, 2명이면 골드 +50, 보유 목록은 비어 있다', () => {
    const ab = data.balance.abyss;
    for (const [mates, deck] of [[['elia'], 14], [['elia', 'kyle'], 18], [['elia', 'kyle', 'born'], 22]] as const) {
      const run = start(`S${mates.length}`, [...mates]);
      expect(run.deck.length).toBe(deck);
      expect(run.selected.length).toBe(mates.length + 1);
      expect(Object.keys(run.collection)).toEqual([]);
      const pathGold = run.relics.filter((id) => id === 'path_debt').length * 150;
      expect(run.gold).toBe(data.balance.economy.startGold + pathPicks(data, mates.length).gold + pathGold);
      expect(run.relics.filter((id) => data.relics.get(id)!.rarity === 'path').length).toBe(ab.pathPicks[String(mates.length)].picks);
    }
    // 시작 카드의 강화는 풀의 단계
    expect(start('S1', ['elia']).deck.find((c) => c.cardId === 'elia_fireball')?.level).toBe(2);
    expect(() => createAbyssRun(data, 'X', { mates: [], paths: [], pool })).toThrow();
  });

  it('굽이: 첫 굽이는 무림·엘하임, 같은 세계는 이어지지 않고, 틈은 3굽이부터, 5·10·15굽이는 숙적', () => {
    for (const seed of ['P1', 'P2', 'P3', 'P4']) {
      const ab = start(seed, ['elia']).abyss!;
      expect(data.balance.abyss.firstWorlds).toContain(ab.world);
      for (let d = 2; d <= 16; d++) {
        const prev = ab.loops[ab.loops.length - 1];
        const plan = planLoop(data, ab, d);
        if (d % 5 === 0) expect(plan.boss).toBe(data.balance.abyss.nemesisModule);
        else {
          expect(plan.world).not.toBe(prev.world);
          if (d < data.balance.abyss.riftFrom) expect(plan.world).not.toBe('rift');
        }
        ab.loops.push({ depth: d, ...plan });
      }
    }
  });

  it('지도: 굽이마다 규칙을 지키고, 이야기·합류 사건이 없고, 틈의 거래는 한 지도에 하나', () => {
    for (const seed of ['M1', 'M2', 'M3']) {
      const run = start(seed, ['elia', 'kyle']);
      for (let d = 1; d <= 6; d++) {
        const stage = abyssStage(data, run.stageId, run.abyss!.boss);
        expect(validateMap(data, run.map, stage)).toEqual([]);
        const mods = run.map.floors.flat().map((n) => data.modules.get(n.moduleId)!);
        expect(mods.some((m) => m.type === 'story')).toBe(false);
        expect(mods.filter((m) => m.tags.includes('trade')).length).toBeLessThanOrEqual(1);
        expect(mods[mods.length - 1].id).toBe(run.abyss!.boss);
        run.status = 'stage_clear';
        advanceLoop(data, run);
      }
    }
  });

  it('보상: 풀(합류 동료·공용)과 틈의 카드에서만, 덱에 바로 들어가고 보유 목록은 그대로', () => {
    const run = start('R1', ['elia']);
    const node = availableNodes(run)[0];
    const allowed = new Set([...Object.keys(pool), ...riftCards(data).map((c) => c.id)]);
    for (let i = 0; i < 20; i++) {
      const opts = rewardOptions(data, run, `${node.id}_${i}`);
      for (const id of opts) {
        expect(allowed.has(id)).toBe(true);
        const owner = data.cards.get(id)!.owner;
        expect(['haun', 'elia', 'common']).toContain(owner);
      }
    }
    const before = run.deck.length;
    applyRunOps(data, run, [{ op: 'gain_card', card: 'elia_fireball' }, { op: 'gain_card', card: 'elia_fireball' }]);
    expect(run.deck.length).toBe(before + 2);
    expect(run.deck.filter((c) => c.cardId === 'elia_fireball').every((c) => c.level === 2)).toBe(true);
    expect(Object.keys(run.collection)).toEqual([]);
  });

  it('배율: 굽이가 깊을수록 적이 세지고, 동료 4명이 함께 싸우며, 한 방 상한이 걸린다', () => {
    const run = start('B1', ['elia', 'kyle', 'born']);
    const enc = enterNode(data, run, availableNodes(run)[0].id);
    const s1 = battleSetupFor(data, run, enc);
    expect(s1.party.length).toBe(4);
    expect(() => createBattle(data, s1)).not.toThrow();
    run.abyss!.depth = 6;
    const s6 = battleSetupFor(data, run, enc);
    expect(s6.enemyHpScale!).toBeGreaterThan(s1.enemyHpScale!);
    expect(s6.enemyDmgScale!).toBeGreaterThan(s1.enemyDmgScale!);
    expect(s6.enemyHitCap).toBe(Math.floor(70 * data.balance.abyss.oneHitCap));
  });

  it('제거: 휴식의 버리기(고른 카드), 상점 지우기는 쓸수록 비싸다', () => {
    const run = start('C1', ['elia']);
    const rest = [...data.modules.values()].find((m) => m.type === 'rest' && m.stage === 's1')!;
    const choices = choicesFor(data, run, rest);
    const i = choices.findIndex((c) => c.label.startsWith('버리기'));
    expect(i).toBeGreaterThanOrEqual(0);
    const target = run.deck[3];
    applyChoice(data, run, rest, i, target.uid);
    expect(run.deck.some((c) => c.uid === target.uid)).toBe(false);

    run.gold = 500;
    run.shop = null;
    openShop(data, run, 'shopA');
    const p1 = removePrice(data, run);
    expect(buyRemove(data, run, run.deck[0].uid).ok).toBe(true);
    expect(removePrice(data, run)).toBe(p1 + data.balance.abyss.removeStep);
    expect(buyRemove(data, run, run.deck[0].uid).ok).toBe(false); // 상점마다 한 번
  });

  it('틈의 거래: 본 적 없는 카드는 풀에 들어가고, 부상은 다음 굽이에 낫고, 상흔을 모두 지울 수 있다', () => {
    const run = start('T1', ['elia', 'kyle']);
    const size = Object.keys(run.abyss!.pool).length;
    applyRunOps(data, run, [{ op: 'reveal_unseen_card' }]);
    expect(Object.keys(run.abyss!.pool).length).toBe(size + 1);
    expect(run.abyss!.revealed.length).toBe(1);

    const kyle = run.roster.find((r) => r.id !== 'haun')!;
    const max = kyle.maxHp;
    applyRunOps(data, run, [{ op: 'injure' }]);
    const injured = run.roster.find((r) => r.id in run.abyss!.injuries)!;
    expect(injured.maxHp).toBeLessThan(injured.id === kyle.id ? max : 999);
    run.status = 'stage_clear';
    advanceLoop(data, run);
    expect(run.abyss!.injuries).toEqual({});
    expect(run.abyss!.depth).toBe(2);
    expect(run.seed).not.toBe(start('T1', ['elia', 'kyle']).seed);

    run.scar = 7;
    applyRunOps(data, run, [{ op: 'scar', amount: -999 }, { op: 'gain_gold', amount: -99999 }]);
    expect(run.scar).toBe(0);
    expect(run.gold).toBe(0);
  });

  it('저장: 심연 런을 저장했다 되살리면 같다', () => {
    const run = start('V1', ['born']);
    const back = deserializeRun(data, serializeRun(run))!.run as RunState;
    expect(back.mode).toBe('abyss');
    expect(back.abyss!.depth).toBe(1);
    expect(back.deck.length).toBe(run.deck.length);
  });

  it('봇이 심연을 몇 굽이 둔다(멈추지 않고 끝난다)', () => {
    for (const mates of [['elia'], ['kyle', 'born']]) {
      const r = playAbyss(data, `BOT${mates.length}`, { mates, pool }, undefined, 3);
      expect(r.depth).toBeGreaterThanOrEqual(1);
      expect(r.depth).toBeLessThanOrEqual(3);
    }
  });
});

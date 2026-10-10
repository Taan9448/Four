// 심연(GAME_DESIGN 16절): 굽이·숙적·보상 풀·덱 직접 추가·제거·배율·동료 1~3명·길·틈의 거래·저장
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/engine/data';
import {
  abyssPool,
  abyssScale,
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
import { createBattle, playCard } from '../src/engine/battle';
import { spawnEnemy } from '../src/engine/effects';
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
    // 가져오는 강화는 importMax(+2)까지
    expect(abyssPool(data, { elia_fireball: 5 }, []).elia_fireball).toBe(data.balance.abyss.importMax);
  });

  it('배율: deep.from굽이부터 굽이마다 더 가파르게 오른다', () => {
    const ab = data.balance.abyss;
    const deep = ab.deep!;
    const at = (n: number) => abyssScale(data, n);
    expect(at(1)).toEqual({ hp: ab.hpBase, dmg: ab.dmgBase });
    expect(at(deep.from).hp).toBeCloseTo(ab.hpBase * (1 + ab.hpStep * (deep.from - 1)));
    expect(at(deep.from + 1).hp - at(deep.from).hp).toBeCloseTo(ab.hpBase * deep.hpStep);
    expect(at(deep.from + 1).dmg - at(deep.from).dmg).toBeCloseTo(ab.dmgBase * deep.dmgStep);
    expect(at(deep.from).hp - at(deep.from - 1).hp).toBeCloseTo(ab.hpBase * ab.hpStep);
  });

  it('숙적과 서약 막아선 자의 엘리트는 유물을 떨구지 않는다(골드는 그대로)', async () => {
    const { rollLoot } = await import('../src/engine/economy');
    const run = start('NL1', ['elia']);
    const nem = { id: 'x', floor: 9, index: 0, type: 'boss' as const, moduleId: data.balance.abyss.nemesisModule, next: [] };
    const boss = { ...nem, moduleId: 's1_boss_veilak' };
    expect(rollLoot(data, run, nem).relicChoices).toEqual([]);
    expect(rollLoot(data, run, nem).gold).toBeGreaterThan(0);
    expect(rollLoot(data, run, boss).relicChoices.length).toBeGreaterThan(0);
    const elite = { id: 'y', floor: 6, index: 0, type: 'elite' as const, moduleId: 's1_elite_x', next: [] };
    expect(rollLoot(data, run, elite).relic).not.toBeNull();
    run.abyss!.oath = 5; // 막아선 자: 6층 엘리트
    expect(rollLoot(data, run, elite).relic).toBeNull();
    expect(rollLoot(data, run, { ...elite, floor: 4 }).relic).not.toBeNull();
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

describe('심연 2차', () => {
  it('법칙: 2굽이 1개 · 5굽이 2개 · 9굽이 3개, 겹치지 않는다', async () => {
    const { planLoop: plan } = await import('../src/engine/abyss');
    const ab = start('L1', ['elia']).abyss!;
    expect(ab.laws).toEqual([]);
    for (const [d, n] of [[2, 1], [4, 1], [5, 2], [8, 2], [9, 3], [14, 3]] as const) {
      const laws = plan(data, ab, d).laws;
      expect(laws.length).toBe(n);
      expect(new Set(laws).size).toBe(n);
    }
  });

  it('법칙이 전투에 걸린다: 두 개의 달(손패 6·내공 2), 마른 하늘, 결이 보인다, 굶주림, 안개', () => {
    const run = start('L2', ['elia']);
    const enc = enterNode(data, run, availableNodes(run)[0].id);
    const setup = battleSetupFor(data, run, enc);
    const b = createBattle(data, { ...setup, laws: ['two_moons', 'dry_sky', 'grain_seen', 'hunger', 'fog'] });
    expect(b.hand.length).toBe(6);
    expect(b.neigongMax).toBe(2);
    expect(b.manaRule.perTurn).toBe(0);
    expect(b.hideIntent).toBe(true);
    for (const e of b.enemies) {
      expect(e.statuses.hungry).toBe(1);
      if (!e.statuses.blood_cover) expect(e.statuses.grain ?? 0).toBeGreaterThanOrEqual(1);
    }
  });

  it('무거운 발: 전투 골드 두 배, 휴식 회복 절반', async () => {
    const { rollLoot } = await import('../src/engine/economy');
    const run = start('L3', ['elia']);
    const node = { ...availableNodes(run)[0], type: 'battle' as const };
    const base = rollLoot(data, run, node).gold;
    run.abyss!.laws = ['heavy_feet'];
    expect(rollLoot(data, run, node).gold).toBe(base * 2);
    const rest = [...data.modules.values()].find((m) => m.type === 'rest' && m.stage === 's1' && m.content.choices?.some((c) => c.effects.some((e) => e.op === 'heal_party' && e.ratio)))!;
    const i = choicesFor(data, run, rest).findIndex((c) => c.effects.some((e) => e.op === 'heal_party' && e.ratio));
    const ratio = rest.content.choices![i].effects.find((e) => e.op === 'heal_party')!.ratio!;
    const haun = run.roster[0];
    haun.hp = 1;
    applyChoice(data, run, rest, i);
    expect(haun.hp).toBe(Math.min(haun.maxHp, 1 + Math.floor(haun.maxHp * ratio * 0.5)));
  });

  it('접사: 3굽이부터 엘리트에 붙고 이름 앞에 붙는다. 단단한은 체력 +30%, 빠른은 첫 턴에 두 번', async () => {
    const { abyssEnemyMods } = await import('../src/engine/abyss');
    const run = start('F1', ['elia']);
    const elite = [...data.enemies.values()].find((e) => e.tier === 'elite')!;
    run.abyss!.depth = 2;
    expect(abyssEnemyMods(data, run, 'x', { id: 'n1' }, [elite.id])[0]).toBeUndefined();
    run.abyss!.depth = 3;
    expect(abyssEnemyMods(data, run, 'x', { id: 'n1' }, [elite.id])[0]?.affixes?.length).toBe(1);
    run.abyss!.depth = 6;
    expect(abyssEnemyMods(data, run, 'x', { id: 'n1' }, [elite.id])[0]?.affixes?.length).toBe(2);
    const normal = [...data.enemies.values()].find((e) => e.tier === 'normal')!;
    run.abyss!.depth = 8;
    expect(abyssEnemyMods(data, run, 'x', { id: 'n1' }, [normal.id])[0]?.affixes?.length).toBe(1);

    const enc = enterNode(data, run, availableNodes(run)[0].id);
    const setup = battleSetupFor(data, run, enc);
    const plain = createBattle(data, { ...setup, enemies: [elite.id], enemyMods: [undefined] });
    const tough = createBattle(data, { ...setup, enemies: [elite.id], enemyMods: [{ affixes: ['tough', 'venom'] }] });
    expect(tough.enemies[0].maxHp).toBe(Math.round(plain.enemies[0].maxHp * 1.3));
    expect(tough.enemies[0].name.startsWith('단단한 독기 머금은')).toBe(true);
  });

  it('숙적 성장: 첫 만남은 옅은 잔향(격노 2턴 늦게·덜 먹음), 그 뒤 만날 때마다 격노가 빨라지고 흐름 포식이 쌓이며, 세 번째부터 매듭 4', async () => {
    const { abyssEnemyMods } = await import('../src/engine/abyss');
    const run = start('N1', ['elia']);
    const nem = data.balance.abyss.nemesisModule;
    const ab = run.abyss!;
    const mods = (n: number) => {
      ab.loops = Array.from({ length: n }, (_, i) => ({ depth: (i + 1) * 5, world: 'rift' as const, boss: nem, stageId: 's9' }));
      return abyssEnemyMods(data, run, nem, { id: 'boss' }, ['mordecai'])[0]!;
    };
    const faint = data.balance.abyss.nemesis.faint!;
    const borders = data.balance.abyss.nemesis.borderHpScale!;
    expect(mods(1)).toEqual({ traits: [{ status: 'flow_eater', stacks: 1 }, { status: 'knot', stacks: 1 }], enrageShift: -faint.enrageDelay, feedMul: faint.feedMul, transformHpScale: borders[0] });
    expect(mods(2).transformHpScale).toBe(borders[1]);
    expect(mods(9).transformHpScale).toBe(borders[borders.length - 1]);
    expect(mods(2).enrageShift).toBe(2);
    expect(mods(2).feedMul).toBeUndefined();
    expect(mods(3).traits).toContainEqual({ status: 'knot', stacks: 4 });

    // 옅은 잔향: 격노가 늦고, 흐름을 실은 카드의 피해를 덜 먹는다
    const enrage = data.enemies.get('mordecai')!.enrage!.afterTurn;
    const st = { data, scar: 0, enemyHpScale: 1, enemies: [] };
    const weak = spawnEnemy(st, 'mordecai', 0, mods(1));
    const full = spawnEnemy(st, 'mordecai', 0, mods(2));
    expect(weak.enrageAt).toBe(enrage + faint.enrageDelay);
    expect(full.enrageAt).toBe(enrage - 2);
    expect(weak.feedMul).toBe(faint.feedMul);
    expect(full.feedMul).toBeUndefined();
    expect(weak.transformHpScale).toBe(borders[0]);
  });

  it('숙적이 변신한 찢긴 경계의 체력은 굽이 배율이 아니라 만남마다의 배율을 따른다', () => {
    const run = start('B1', ['elia']);
    const nem = data.balance.abyss.nemesisModule;
    const ab = run.abyss!;
    ab.depth = 10;
    ab.loops = [5, 10].map((depth) => ({ depth, world: 'rift' as const, boss: nem, stageId: 's9' }));
    run.scar = 6;
    const enc = { module: data.modules.get(nem)!, node: { id: 'boss', floor: 9, index: 0, type: 'boss' as const, moduleId: nem, next: [] } };
    const s = createBattle(data, battleSetupFor(data, run, enc as never));
    const m = s.enemies.find((e) => e.defId === 'mordecai')!;
    playCard(s, s.hand.findIndex((c) => c.cardId === 'haun_stop_ring'), m.uid);
    m.hp = 1;
    m.statuses = {};
    m.block = 0;
    playCard(s, s.hand.findIndex((c) => c.cardId === 'haun_place_blade'), m.uid);
    const border = s.enemies.find((e) => e.defId === 'torn_border')!;
    const def = data.enemies.get('torn_border')!;
    const tier = data.balance.enemyTiers[def.tier]?.hp ?? 1;
    const scale = data.balance.abyss.nemesis.borderHpScale![1];
    expect(border.maxHp).toBe(Math.round((def.maxHp + (def.hpPerScar ?? 0) * s.scar) * scale * tier));
    expect(s.enemyHpScale!).toBeGreaterThan(scale); // 굽이 배율이었으면 훨씬 컸다
  });

  it('3굽이 사건: 동료 자리가 남았으면 구원(합류 + 시작 카드 4장), 가득하면 틈의 메아리', () => {
    const run = start('E1', ['elia']);
    for (let d = 1; d < 3; d++) {
      run.status = 'stage_clear';
      advanceLoop(data, run);
    }
    const rescue = run.map.floors[data.balance.abyss.eventFloor - 1];
    expect(rescue.length).toBe(1);
    expect(rescue[0].moduleId).toBe(data.balance.abyss.rescueModule);
    const mod = data.modules.get(rescue[0].moduleId)!;
    const choices = choicesFor(data, run, mod);
    expect(choices.some((c) => c.label.startsWith('엘리아'))).toBe(false); // 이미 일행
    const deck = run.deck.length;
    const i = choices.findIndex((c) => c.label.startsWith('카일'));
    applyChoice(data, run, mod, i);
    expect(run.roster.some((r) => r.id === 'kyle')).toBe(true);
    expect(run.selected).toContain('kyle');
    expect(run.deck.length).toBe(deck + data.balance.abyss.starters.mate);

    const full = start('E2', ['elia', 'kyle', 'born']);
    for (let d = 1; d < 3; d++) {
      full.status = 'stage_clear';
      advanceLoop(data, full);
    }
    const echo = full.map.floors[data.balance.abyss.eventFloor - 1][0];
    expect(echo.moduleId).toBe(data.balance.abyss.echoModule);
    const em = data.modules.get(echo.moduleId)!;
    const before = full.deck.filter((c) => c.cardId.startsWith('elia_')).length;
    const deckBefore = full.deck.length;
    applyChoice(data, full, em, choicesFor(data, full, em).findIndex((c) => c.label.startsWith('엘리아')));
    expect(full.deck.filter((c) => data.cards.get(c.cardId)!.owner === 'elia' && data.cards.get(c.cardId)!.pool === 'starter').length).toBe(Math.max(0, before - 4));
    expect(full.deck.length).toBe(deckBefore - 4 + 1);
  });

  it('상흔: 10마다 다음 굽이에 틈의 짐승, 이기면 틈의 카드. 휴식의 꿰매기', () => {
    const run = start('S1', ['elia']);
    run.scar = 10;
    run.status = 'stage_clear';
    advanceLoop(data, run);
    const beast = run.map.floors.flat().filter((n) => n.moduleId === data.balance.abyss.beastModule);
    expect(beast.length).toBe(1);
    expect(beast[0].type).toBe('elite');
    run.status = 'stage_clear';
    advanceLoop(data, run);
    expect(run.map.floors.flat().some((n) => n.moduleId === data.balance.abyss.beastModule)).toBe(false); // 상흔 20이 되기 전엔 다시 없다

    const rest = [...data.modules.values()].find((m) => m.type === 'rest' && m.stage === 's1')!;
    run.gold = 100;
    run.scar = 5;
    const i = choicesFor(data, run, rest).findIndex((c) => c.label.startsWith('꿰매기'));
    applyChoice(data, run, rest, i);
    expect(run.scar).toBe(2);
    expect(run.gold).toBe(40);
  });

  it('사무결의 잔향: 덮개가 옅어졌다가 세 턴마다 다시 두른다', () => {
    const run = start('SA', ['elia']);
    const enc = enterNode(data, run, availableNodes(run)[0].id);
    const b = createBattle(data, { ...battleSetupFor(data, run, enc), enemies: ['sa_mugyeol_echo'], enemyMods: [undefined] });
    expect(b.enemies[0].statuses.blood_cover_fading).toBe(2);
  });
});

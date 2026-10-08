// 경제(2026-10-08): 전리품·상점·유물 trigger·물약
import { describe, expect, it } from 'vitest';
import { battleOutcome, usePotion } from '../src/engine/battle';
import { buyCard, buyPotion, buySwap, buyUpgrade, claimLoot, openShop, rollLoot, swapPrice } from '../src/engine/economy';
import { _internal } from '../src/engine/battle';
import { applyBattleOutcome, applyChoice, choicesFor, createRun, createRunAt, gainRelic, type Encounter } from '../src/engine/run';
import type { MapNode } from '../src/engine/route';
import { deserializeRun, serializeRun } from '../src/engine/save';
import { battle, data } from './helpers';

const node = (type: MapNode['type'], id = 'n1-0'): MapNode => ({ id, floor: 1, index: 0, type, moduleId: 'x', next: [] });

describe('전리품', () => {
  it('같은 시드·같은 노드면 같고, 골드는 노드 유형별 범위 안', () => {
    const run = createRun(data, 'LOOT');
    const a = rollLoot(data, run, node('battle'));
    expect(rollLoot(data, run, node('battle'))).toEqual(a);
    const [lo, hi] = data.balance.economy.gold.battle;
    expect(a.gold).toBeGreaterThanOrEqual(lo);
    expect(a.gold).toBeLessThanOrEqual(hi);
    expect(a.relic).toBeNull();
  });

  it('엘리트는 가지지 않은 유물 하나, 보스는 보스 유물을 앞에 둔 후보', () => {
    const run = createRun(data, 'LOOT');
    const elite = rollLoot(data, run, node('elite'));
    expect(elite.relic).not.toBeNull();
    expect(data.relics.get(elite.relic!)!.rarity).not.toBe('boss');
    const boss = rollLoot(data, run, node('boss'));
    expect(boss.relicChoices).toHaveLength(data.balance.economy.bossRelicChoices);
    expect(data.relics.get(boss.relicChoices[0])!.rarity).toBe('boss');
    expect(boss.potion).not.toBeNull(); // 보스는 물약이 반드시 떨어진다
  });

  it('받기: 골드가 더해지고 물약은 빈 칸에, 칸이 가득하면 남긴다', () => {
    const run = createRun(data, 'LOOT');
    const gold = run.gold;
    const r = claimLoot(data, run, { gold: 20, potion: 'wound_salve', relic: 'silver_bell', relicChoices: [] });
    expect(run.gold).toBe(gold + 20);
    expect(run.relics).toContain('silver_bell');
    expect(run.potions).toContain('wound_salve');
    expect(r.potionLeft).toBeNull();
    run.potions = run.potions.map(() => 'fire_flask');
    expect(claimLoot(data, run, { gold: 0, potion: 'wound_salve', relic: null, relicChoices: [] }).potionLeft).toBe('wound_salve');
  });
});

describe('상점', () => {
  it('진열은 노드마다 시드로 정해지고, 다시 들어와도 같다', () => {
    const run = createRunAt(data, 'SHOP', 's2');
    const a = openShop(data, run, 'n7-0');
    expect(a.cards).toHaveLength(data.balance.economy.shop.cards);
    expect(openShop(data, run, 'n7-0')).toBe(a);
    const other = createRunAt(data, 'SHOP', 's2');
    expect(openShop(data, other, 'n7-0')).toEqual(a);
  });

  it('사면 골드가 줄고 카드가 덱에, 모자라면 못 산다', () => {
    const run = createRunAt(data, 'SHOP', 's2');
    const shop = openShop(data, run, 'n7-0');
    run.gold = shop.cards[0].price;
    const id = shop.cards[0].cardId;
    const owned = run.collection[id];
    expect(buyCard(data, run, 0).ok).toBe(true);
    expect(run.gold).toBe(0);
    // 산 카드는 보유 목록에 영구로(이미 있으면 강화), 이번 스테이지 덱에도
    expect(run.collection[id]).toBe(owned === undefined ? 0 : Math.min(owned + 1, data.balance.upgrade.maxLevel));
    expect(run.deck.some((c) => c.cardId === id)).toBe(true);
    expect(buyCard(data, run, 0).ok).toBe(false); // 팔림
    expect(buyCard(data, run, 1).ok).toBe(false); // 골드 없음
  });

  it('카드 바꾸기는 상점마다 한 번, 쓸 때마다 값이 오른다. 편성 자리에 새 카드가 들어가고 덱 크기는 그대로. 강화는 +1(보유 카드에도)', () => {
    const run = createRunAt(data, 'SHOP', 's2');
    openShop(data, run, 'n7-0');
    run.gold = 1000;
    const before = swapPrice(data, run);
    const from = run.loadout.haun[0];
    const deck = run.deck.length;
    expect(buySwap(data, run, from).ok).toBe(true);
    expect(run.collection[from]).toBeUndefined();
    expect(run.loadout.haun).not.toContain(from);
    expect(run.loadout.haun).toHaveLength(data.balance.loadout.perCharacter);
    expect(run.deck).toHaveLength(deck);
    expect(swapPrice(data, run)).toBe(before + data.balance.economy.shop.swapStep);
    expect(buySwap(data, run, run.loadout.haun[1]).ok).toBe(false);
    const target = run.deck.find((c) => data.cards.get(c.cardId)!.upgrade && c.level < 5)!;
    const level = target.level;
    expect(buyUpgrade(data, run, target.uid).ok).toBe(true);
    expect(target.level).toBe(level + 1);
    expect(run.collection[target.cardId]).toBe(level + 1);
  });

  it('물약은 빈 칸이 있어야 산다', () => {
    const run = createRunAt(data, 'SHOP', 's2');
    openShop(data, run, 'n7-0');
    run.gold = 1000;
    run.potions = run.potions.map(() => 'fire_flask');
    expect(buyPotion(data, run, 0).ok).toBe(false);
  });
});

describe('유물', () => {
  it('전투 시작·차례 시작에 효과가 일어난다', () => {
    const s = battle({ relics: ['iron_bracer', 'moon_pendant'] });
    // 전투 시작 방어 5 + 첫 차례 시작 방어 3
    expect(s.party[0].block).toBe(8);
    expect(s.events.some((e) => e.type === 'relic' && e.relicId === 'iron_bracer')).toBe(true);
  });

  it('적이 쓰러질 때 효과가 일어난다', () => {
    const s = battle({ relics: ['blood_oath'], party: [{ id: 'haun', hp: 40, maxHp: 60 }] });
    _internal.dealDamage(s, s.party[0], s.enemies[0], 999, { source: s.party[0] });
    expect(s.result).toBe('victory');
    expect(s.party[0].hp).toBe(43);
  });

  it('얻는 순간·이긴 뒤·휴식 뒤 효과', () => {
    const run = createRunAt(data, 'RELIC', 's2');
    const hp = run.roster.map((r) => r.maxHp);
    gainRelic(data, run, 'silver_leaf');
    expect(run.roster.map((r) => r.maxHp)).toEqual(hp.map((x) => x + 6));
    gainRelic(data, run, 'herb_pouch');
    for (const r of run.roster) r.hp = 10;
    const module = [...data.modules.values()].find((m) => m.stage === 's2' && m.type === 'battle')!;
    const enc: Encounter = { node: node('battle'), module: { ...module, content: { ...module.content, clearEffects: [] } } };
    applyBattleOutcome(data, run, enc, { result: 'victory', survived: false, party: run.selected.map((id) => ({ id, hp: 10 })), mana: run.mana, scarGain: 0 });
    expect(run.roster.find((r) => r.id === 'haun')!.hp).toBe(14);
    gainRelic(data, run, 'cloud_tea');
    const rest = data.modules.get('s2_rest_red_camp')!;
    const before = run.roster.find((r) => r.id === 'haun')!.hp;
    const msgs = applyChoice(data, run, rest, choicesFor(data, run, rest).findIndex((c) => c.effects.some((e) => e.op === 'heal_party')));
    expect(msgs.some((m) => m.startsWith('운무차'))).toBe(true);
    expect(run.roster.find((r) => r.id === 'haun')!.hp).toBeGreaterThan(before);
  });
});

describe('물약', () => {
  it('쓰면 효과가 나고 칸이 비며, 전투 결과로 남은 칸을 돌려준다', () => {
    const s = battle({ potions: ['fire_flask', 'wound_salve', null] });
    const enemy = s.enemies[0];
    const hp = enemy.hp;
    expect(usePotion(s, 0).ok).toBe(false); // 대상이 필요하다
    expect(usePotion(s, 0, enemy.uid).ok).toBe(true);
    expect(enemy.hp).toBeLessThan(hp);
    expect(s.potions[0]).toBeNull();
    expect(usePotion(s, 0, enemy.uid).ok).toBe(false); // 빈 칸
    _internal.dealDamage(s, s.party[0], enemy, 999, { source: s.party[0] });
    expect(battleOutcome(s)!.potions).toEqual([null, 'wound_salve', null]);
  });
});

describe('저장', () => {
  it('경제 전의 저장은 시작 골드·빈 유물·빈 물약 칸으로 채운다', () => {
    const run = createRun(data, 'OLD');
    const old = JSON.parse(serializeRun(run));
    for (const k of ['gold', 'relics', 'potions', 'shop', 'shopSwaps']) delete old.run[k];
    const loaded = deserializeRun(data, JSON.stringify(old))!;
    expect(loaded.run.gold).toBe(data.balance.economy.startGold);
    expect(loaded.run.relics).toEqual([]);
    expect(loaded.run.potions).toHaveLength(data.balance.economy.potionSlots);
  });
});

// 유물 확장(C단계): 새 발동 시점·규칙 유물·물약 칸
import { describe, expect, it } from 'vitest';
import { endTurn, playCard } from '../src/engine/battle';
import { changeRift, loseHp } from '../src/engine/effects';
import { openShop } from '../src/engine/economy';
import { createRunAt, gainRelic } from '../src/engine/run';
import { battle, cards, data, give } from './helpers';

const big = (s: ReturnType<typeof battle>) => {
  for (const e of s.enemies) e.hp = e.maxHp = 999;
};

describe('유물 발동 시점', () => {
  it('cardPlayed + every: 공격 카드 3장째마다(숫돌 기름: 방어 3)', () => {
    const s = battle({ relics: ['whetstone_oil'] });
    big(s);
    s.neigong = 9;
    const block = () => s.party[0].block;
    const b0 = block();
    playCard(s, give(s, 'haun_chop'), s.enemies[0].uid);
    playCard(s, give(s, 'haun_step'));
    playCard(s, give(s, 'haun_chop'), s.enemies[0].uid);
    expect(block()).toBe(b0 + 5);
    playCard(s, give(s, 'haun_chop'), s.enemies[0].uid);
    expect(block()).toBe(b0 + 5 + 3);
  });

  it('riftChanged: 균열이 오를 때마다(금 간 종: 적 모두 피해 2)', () => {
    const s = battle({ relics: ['rift_bell'] });
    big(s);
    const hp = s.enemies[0].hp;
    changeRift(s, 2);
    expect(s.enemies[0].hp).toBe(hp - 2);
    changeRift(s, -1);
    expect(s.enemies[0].hp).toBe(hp - 2);
  });

  it('allyDowned: 동료가 쓰러질 때(불사조의 재는 한 번만)', () => {
    const s = battle({ relics: ['phoenix_ash'], party: [{ id: 'haun', hp: 30, maxHp: 60 }, { id: 'kyle', hp: 5, maxHp: 52 }, { id: 'born', hp: 5, maxHp: 70 }] });
    loseHp(s, s.party[1], 99);
    expect(s.party[0].hp).toBe(42);
    expect(s.party[0].statuses.strength).toBe(2);
    loseHp(s, s.party[2], 99);
    expect(s.party[0].hp).toBe(42);
  });

  it('turnEnd: 차례가 끝날 때(쇠 어깨받이: 방어 4가 적의 차례에 남는다)', () => {
    const s = battle({ relics: ['iron_shoulder'] });
    for (const e of s.enemies) e.intent = null;
    endTurn(s);
    expect(s.events.some((e) => e.type === 'relic' && e.relicId === 'iron_shoulder')).toBe(true);
  });
});

describe('규칙 유물', () => {
  it('keep_block: 차례가 바뀌어도 방어의 절반이 남는다', () => {
    const s = battle({ relics: ['stone_skin_amulet'] });
    for (const e of s.enemies) e.intent = null;
    s.party[0].block = 10;
    endTurn(s);
    expect(s.party[0].block).toBe(Math.floor(10 * data.balance.relicRules.keepBlockRatio));
  });

  it('hand_plus_one: 한 장 더 뽑고, 천근의 짐은 독기 2장을 섞는다', () => {
    const deck = cards(...Array(12).fill('haun_step'));
    const a = battle({ deck });
    const b = battle({ deck, relics: ['heavy_burden'] });
    for (const s of [a, b]) for (const e of s.enemies) e.intent = null;
    endTurn(a);
    endTurn(b);
    expect(b.hand.length).toBe(a.hand.length + 1);
    expect([...b.draw, ...b.hand, ...b.discard].filter((c) => c.cardId === 'status_miasma')).toHaveLength(2);
  });

  it('retain_one: 턴 끝에 비용이 가장 큰 카드 1장을 남긴다', () => {
    const s = battle({ relics: ['breath_pearl'] });
    for (const e of s.enemies) e.intent = null;
    s.hand = cards('haun_step', 'haun_log_split', 'haun_knot_poke');
    s.draw = [];
    s.discard = [];
    endTurn(s);
    expect(s.hand.map((c) => c.cardId)).toContain('haun_log_split');
  });

  it('no_echo: 균열이 높아도 틈의 잔향이 섞이지 않는다', () => {
    const s = battle({ relics: ['sealed_scroll'] });
    for (const e of s.enemies) e.intent = null;
    s.rift = data.balance.rift.echoThreshold + 1;
    endTurn(s);
    expect([...s.draw, ...s.hand, ...s.discard].some((c) => c.cardId === data.balance.rift.echoCard)).toBe(false);
  });

  it('shop_discount·shopEnter: 상인의 인장은 진열 가격을 깎고, 낡은 지도는 상점에 들어설 때 골드', () => {
    const a = createRunAt(data, 'SHOP1', 's3');
    const b = createRunAt(data, 'SHOP1', 's3');
    gainRelic(data, b, 'merchant_seal');
    gainRelic(data, b, 'old_map');
    const gold = b.gold;
    const sa = openShop(data, a, 'n5-0');
    const sb = openShop(data, b, 'n5-0');
    expect(b.gold).toBe(gold + 25);
    const sum = (s: typeof sa) => s.cards.reduce((t, c) => t + c.price, 0);
    expect(sum(sb)).toBeLessThan(sum(sa));
  });

  it('옥가락지: 물약 칸 +1', () => {
    const run = createRunAt(data, 'JADE', 's3');
    const n = run.potions.length;
    gainRelic(data, run, 'jade_ring');
    expect(run.potions.length).toBe(n + 1);
  });
});

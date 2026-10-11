// 순례(자유 여정 개편, 2026-10-11 사용자 결정 A안): 길에서 얻은 것은 그 길 안에서만
import { describe, expect, it } from 'vitest';
import { acquireCard, upgradeOwned } from '../src/engine/collection';
import { emptyCodex, noteRun, recordsCards } from '../src/engine/codex';
import { battleSetupFor, createRunAt, enterNode, finishReplay, pilgrimScale, startReplay, suspendReplay } from '../src/engine/run';
import { deserializeRun, serializeRun } from '../src/engine/save';
import { data } from './helpers';

const cleared = (seed = 'PIL') => {
  const hub = createRunAt(data, seed, 's9');
  hub.status = 'complete';
  return hub;
};
const unowned = (hub: ReturnType<typeof cleared>) =>
  [...data.cards.values()].find((c) => c.pool === 'reward' && hub.collection[c.id] === undefined && hub.roster.some((r) => r.id === c.owner))!;

describe('순례 — 길에서 얻은 것은 길 안에서만(1-1)', () => {
  it('(a) 보상 카드·강화는 길의 덱에만, 클리어한 런의 보유 목록은 그대로', () => {
    const hub = cleared();
    const before = structuredClone(hub.collection);
    const run = startReplay(data, hub, 's2');
    const card = unowned(hub);
    const pathCollection = structuredClone(run.collection);
    acquireCard(data, run, card.id);
    expect(run.deck.some((c) => c.cardId === card.id)).toBe(true);
    // 덱에만 넣고 보유 목록(강화 단계 포함)은 건드리지 않는다. 가진 카드는 가진 단계로 한 장 더
    expect(run.collection).toEqual(pathCollection);
    const have = Object.keys(hub.collection).find((id) => hub.collection[id] > 0) ?? Object.keys(hub.collection)[0];
    const n = run.deck.filter((c) => c.cardId === have).length;
    acquireCard(data, run, have);
    expect(run.deck.filter((c) => c.cardId === have).length).toBe(n + 1);
    expect(run.deck.filter((c) => c.cardId === have).every((c) => c.level === hub.collection[have])).toBe(true);
    expect(run.collection[have]).toBe(hub.collection[have]);
    const owned = Object.keys(hub.collection).find((id) => data.cards.get(id)?.upgrade && hub.collection[id] < data.balance.upgrade.maxLevel)!;
    upgradeOwned(data, run, owned);
    run.status = 'stage_clear';
    const back = finishReplay(run);
    expect(back.collection).toEqual(before);
  });

  it('(f) 이기든 지든·멈추든 클리어한 런의 보유 카드·편성은 바뀌지 않는다(이긴 횟수만 남는다)', () => {
    const hub = cleared('PIL2');
    const collection = structuredClone(hub.collection);
    const loadout = structuredClone(hub.loadout);
    for (const end of ['stage_clear', 'defeat', 'suspend'] as const) {
      const run = startReplay(data, hub, 's1');
      acquireCard(data, run, unowned(hub).id);
      run.loadout = {};
      let back;
      if (end === 'suspend') back = suspendReplay(run);
      else {
        run.status = end;
        back = finishReplay(run);
      }
      expect(back.collection).toEqual(collection);
      expect(back.loadout).toEqual(loadout);
      Object.assign(hub, back);
    }
    expect(hub.replays.s1).toBe(1);
  });
});

describe('순례 — 길의 전투 집계(1-4)', () => {
  it('길은 빈 기록으로 시작하고(도전 판정용), 클리어한 런의 기록은 그대로', () => {
    const hub = cleared('PIL5');
    hub.stats.kills = 77;
    const run = startReplay(data, hub, 's4');
    expect(run.stats.kills).toBe(0);
    run.stats.kills = 5;
    run.status = 'stage_clear';
    expect(finishReplay(run).stats.kills).toBe(77);
  });
});

describe('순례 — 도감 기록(1-3)', () => {
  it('(c) 다시 하는 런의 덱·보유·상점 카드는 도감에 적지 않고, 클리어한 런의 보유 카드·유물은 적는다', () => {
    const hub = cleared('PIL3');
    const run = startReplay(data, hub, 's3');
    const card = unowned(hub);
    acquireCard(data, run, card.id);
    run.shop = { nodeId: 'x', cards: [{ cardId: card.id, price: 1, sold: false }], relics: [], potions: [], removeUsed: false, swapUsed: false } as unknown as typeof run.shop;
    expect(recordsCards(run)).toBe(false);
    expect(recordsCards(hub)).toBe(true);
    const c = noteRun(emptyCodex(), run);
    expect(c.cards[card.id]).toBeUndefined();
    for (const id of Object.keys(hub.collection)) expect(c.cards[id]).toBeDefined();
  });
});

describe('순례 — 저장 이행(5)', () => {
  it('저장 2의 클리어 런도 읽고, 순례 기록 칸을 빈 것으로 채운다(이미 얻은 카드는 그대로)', () => {
    const hub = cleared('PIL4');
    hub.collection.extra_old = 0;
    delete hub.pilgrimRewarded;
    delete hub.challenges;
    const text = JSON.stringify({ version: 2, savedAt: 1, run: hub });
    const loaded = deserializeRun(data, text)!.run;
    expect(loaded.pilgrimRewarded).toEqual({});
    expect(loaded.challenges).toEqual({});
    expect(deserializeRun(data, serializeRun(loaded))!.run.status).toBe('complete');
  });
});

describe('순례 — 일행 보정(2)', () => {
  const p = data.balance.pilgrimage;
  it('(d) 1 + 하운 레벨이 기준보다 높은 만큼 × 레벨당 + 유물 수 × relicPct, 상한 maxHp·maxDmg, 캠페인은 1', () => {
    const hub = cleared('PIL6');
    expect(pilgrimScale(data, hub)).toEqual({ hp: 1, dmg: 1 });
    const run = startReplay(data, hub, 's3');
    const haun = run.roster.find((r) => r.id === 'haun')!;
    haun.level = 9;
    const over = Math.max(0, 9 - p.baseLevel.s3);
    const want = (per: number, cap: number) => Math.round(Math.min(cap, 1 + over * per + run.relics.length * p.relicPct) * 100) / 100;
    expect(pilgrimScale(data, run)).toEqual({ hp: want(p.hpPerLevel, p.maxHp), dmg: want(p.dmgPerLevel, p.maxDmg) });
    // 기준 레벨 이하면 유물 몫만
    haun.level = 1;
    expect(pilgrimScale(data, run).hp).toBe(Math.round((1 + run.relics.length * p.relicPct) * 100) / 100);
    // 상한
    haun.level = 99;
    run.relics = Array.from({ length: 500 }, () => 'red_thread');
    expect(pilgrimScale(data, run)).toEqual({ hp: p.maxHp, dmg: p.maxDmg });
  });

  it('전투 배율에 곱해진다(어려움 배율과 함께)', () => {
    const hub = cleared('PIL7');
    const run = startReplay(data, hub, 's2');
    run.roster.find((r) => r.id === 'haun')!.level = 10;
    const k = pilgrimScale(data, run);
    expect(k.hp).toBeGreaterThan(1);
    const node = run.map.floors[0][0];
    const enc = enterNode(data, run, node.id);
    const stage = data.stages.find((s) => s.id === 's2')!;
    const setup = battleSetupFor(data, run, enc);
    expect(setup.enemyHpScale).toBeCloseTo(stage.enemyHpScale * k.hp);
  });
});

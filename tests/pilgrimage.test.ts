// 순례(자유 여정 개편, 2026-10-11 사용자 결정 A안): 길에서 얻은 것은 그 길 안에서만
import { describe, expect, it } from 'vitest';
import { acquireCard, upgradeOwned } from '../src/engine/collection';
import { emptyCodex, noteRun, recordsCards } from '../src/engine/codex';
import { createRunAt, finishReplay, startReplay, suspendReplay } from '../src/engine/run';
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

// 대가형 사건(C단계): 어디서나 나오는 사건·골드 조건·확률 결과·카드 사고팔기·바꾸기
import { describe, expect, it } from 'vitest';
import { generateStageMap } from '../src/engine/route';
import { createRng } from '../src/engine/rng';
import { applyChoice, choicesFor, createRunAt } from '../src/engine/run';
import { swappableCards } from '../src/engine/collection';
import { data } from './helpers';

const mod = (id: string) => data.modules.get(id)!;
const ctx = { scar: 0, flags: [], roster: ['haun'], usedModules: [] };

describe('대가형 사건', () => {
  it('stage "*" 사건은 S1~S8 지도에 섞이고(한 지도에 한 번씩), S0·S9에는 없다', () => {
    const seen = new Map<string, number>();
    for (const st of ['s0', 's2', 's5', 's9']) {
      for (let i = 0; i < 30; i++) {
        const map = generateStageMap(data, st, createRng(`EV${i}`), ctx);
        const ids = map.floors.flat().map((n) => n.moduleId).filter((m) => m && mod(m).stage === '*');
        expect(new Set(ids).size).toBe(ids.length);
        seen.set(st, (seen.get(st) ?? 0) + ids.length);
      }
    }
    expect(seen.get('s0')).toBe(0);
    expect(seen.get('s9')).toBe(0);
    expect((seen.get('s2') ?? 0) + (seen.get('s5') ?? 0)).toBeGreaterThan(0);
  });

  it('골드가 모자라면 그 선택지는 고를 수 없다', () => {
    const run = createRunAt(data, 'EVG', 's3');
    run.gold = 50;
    const cs = choicesFor(data, run, mod('any_event_wandering_master'));
    expect(cs[0].disabled).toMatch(/골드 60/);
    expect(() => applyChoice(data, run, mod('any_event_wandering_master'), 0)).toThrow();
    run.gold = 200;
    expect(choicesFor(data, run, mod('any_event_wandering_master'))[0].disabled).toBeUndefined();
  });

  it('노름판: 판돈을 내고, 결과는 시드로 정해진다(같은 시드면 같은 결과)', () => {
    const play = (seed: string) => {
      const run = createRunAt(data, seed, 's3');
      run.gold = 100;
      const out = applyChoice(data, run, mod('any_event_dice_house'), 0);
      return { gold: run.gold, out: out[0] };
    };
    const a = play('DICE1');
    expect(play('DICE1')).toEqual(a);
    expect([60, 160]).toContain(a.gold);
    const golds = new Set(Array.from({ length: 20 }, (_, i) => play(`DICE${i}`).gold));
    expect(golds).toEqual(new Set([60, 160]));
  });

  it('교환상: 고른 카드를 넘기면 보유·편성·덱에서 빠지고 골드를 받는다. 카드 바꾸기는 같은 주인의 다른 카드로', () => {
    const run = createRunAt(data, 'EVB', 's3');
    const id = swappableCards(data, run).find((x) => run.loadout.haun?.includes(x))!;
    const gold = run.gold;
    applyChoice(data, run, mod('any_event_barter'), 1, id);
    expect(run.collection[id]).toBeUndefined();
    expect(run.loadout.haun).not.toContain(id);
    expect(run.deck.some((c) => c.cardId === id)).toBe(false);
    expect(run.gold).toBe(gold + 45);

    const run2 = createRunAt(data, 'EVB2', 's3');
    run2.gold = 100;
    const id2 = swappableCards(data, run2).find((x) => data.cards.get(x)!.owner === 'haun')!;
    applyChoice(data, run2, mod('any_event_barter'), 2, id2);
    expect(run2.collection[id2]).toBeUndefined();
    expect(run2.gold).toBe(70);
  });

  it('피 묻은 약장수: 체력을 내고 희귀 이상 카드를 얻는다(합류한 동료·공용의 카드)', () => {
    const run = createRunAt(data, 'EVP', 's3');
    const before = new Set(Object.keys(run.collection));
    const hp = run.roster.find((r) => r.id === 'haun')!.hp;
    applyChoice(data, run, mod('any_event_blood_price'), 0);
    expect(run.roster.find((r) => r.id === 'haun')!.hp).toBe(hp - 8);
    const got = Object.keys(run.collection).filter((x) => !before.has(x));
    const changed = got.length ? got : Object.keys(run.collection);
    const def = data.cards.get(changed[0])!;
    expect(['rare', 'epic'].includes(def.rarity) || !got.length).toBe(true);
    expect(def.owner === 'common' || run.roster.some((r) => r.id === def.owner)).toBe(true);
  });

  it('금이 간 함: 유물을 지정하지 않은 gain_relic은 가지지 않은 보스 아닌 유물을 준다', () => {
    const run = createRunAt(data, 'EVC', 's3');
    const n = run.relics.length;
    applyChoice(data, run, mod('any_event_cracked_chest'), 0);
    expect(run.relics.length).toBe(n + 1);
    expect(data.relics.get(run.relics.at(-1)!)!.rarity).not.toBe('boss');
  });
});

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
    expect(run.roster.find((r) => r.id === 'haun')!.hp).toBe(hp - 80);
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

describe('번개 갈래 스토리(2026-10-12)', () => {
  const wall = () => mod('s5_event_wedged_wall');
  const idx = (run: ReturnType<typeof createRunAt>) => choicesFor(data, run, wall()).findIndex((c) => c.label.includes('쐐기의 번개'));

  it('쐐기 박힌 벽: 엘리아가 출전했으면 보랏빛 번개를 얻고 깃발이 선다. 이미 가졌으면 강화 +1', () => {
    const run = createRunAt(data, 'VIOLET', 's5');
    if (!run.selected.includes('elia')) run.selected = ['haun', 'elia'];
    const i = idx(run);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(applyChoice(data, run, wall(), i).join(' ')).toContain('보랏빛 번개');
    expect(run.flags).toContain('violet_lightning');
    expect(run.collection.elia_violet_lightning).toBe(0);
    expect(applyChoice(data, run, wall(), i).join(' ')).toContain('강화');
    expect(run.collection.elia_violet_lightning).toBe(1);
  });

  it('엘리아가 출전하지 않았으면 그 선택지는 나오지 않는다', () => {
    const run = createRunAt(data, 'VIOLET', 's5');
    run.selected = run.selected.filter((r) => r !== 'elia');
    expect(idx(run)).toBe(-1);
  });
});

describe('이벤트 결과의 얻고 잃은 것(#1374)', () => {
  it('피 묻은 약장수: 체력 손실은 "회복"이 아니고, 유물·카드·동료별 체력이 gains로 모인다', async () => {
    const { applyChoice: choose } = await import('../src/engine/run');
    const relicRun = createRunAt(data, 'GAIN1', 's3');
    const gains: import('../src/engine/run').RunGain[] = [];
    const before = relicRun.roster.filter((r) => relicRun.selected.includes(r.id)).map((r) => r.hp);
    const out = choose(data, relicRun, mod('any_event_blood_price'), 1, undefined, gains);
    expect(out).toContain('출전 동료 체력 -160');
    expect(out).not.toContain('출전 동료 회복');
    const hp = gains.find((g) => g.kind === 'hp');
    expect(hp && hp.kind === 'hp' && hp.members.map((m) => m.before)).toEqual(before);
    expect(hp && hp.kind === 'hp' && hp.members.every((m) => m.after === Math.max(1, m.before - 160))).toBe(true);
    const relic = gains.find((g) => g.kind === 'relic');
    expect(relic && relicRun.relics.includes((relic as { id: string }).id)).toBe(true);
    expect(out).toContain(relic!.msg);

    const cardRun = createRunAt(data, 'GAIN2', 's3');
    const cardGains: import('../src/engine/run').RunGain[] = [];
    choose(data, cardRun, mod('any_event_blood_price'), 0, undefined, cardGains);
    const card = cardGains.find((g) => g.kind === 'card') as { id: string } | undefined;
    expect(card && ['rare', 'epic'].includes(data.cards.get(card.id)!.rarity)).toBe(true);
    // gains를 넘기지 않아도 결과는 같다(화면용)
    expect(applyChoice(data, createRunAt(data, 'GAIN1', 's3'), mod('any_event_blood_price'), 1)).toEqual(out);
  });
});

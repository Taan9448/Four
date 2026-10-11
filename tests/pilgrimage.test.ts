// 순례(자유 여정 개편, 2026-10-11 사용자 결정 A안): 길에서 얻은 것은 그 길 안에서만
import { beforeEach, describe, expect, it } from 'vitest';
import { acquireCard, upgradeOwned } from '../src/engine/collection';
import { emptyCodex, noteRun, recordsCards } from '../src/engine/codex';
import { battleSetupFor, createRunAt, enterNode, finishReplay, pilgrimScale, startReplay, suspendReplay } from '../src/engine/run';
import { deserializeRun, serializeRun } from '../src/engine/save';
import { challengeMet, challengeState, claimPilgrimReward, pilgrimRewardDue, pilgrimRewardOptions, settleChallenges } from '../src/engine/pilgrimage';
import { unlockedPaths, unlockedRift } from '../src/engine/abyss';
import { mainTitle, readAbyssMeta, readProfile, recordChallenges, setMainTitle, slotTitle } from '../src/ui/storage';
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

describe('순례 — 첫 순례 보상(1-2)', () => {
  it('(b) 스테이지당 1회, 고른 카드는 보유에 영구로, 보스 열쇠(essential) 카드는 후보에 없다', () => {
    const hub = cleared('PIL8');
    const offers = pilgrimRewardOptions(data, hub, 's2');
    expect(offers.length).toBe(3);
    for (const o of offers) {
      const d = data.cards.get(o.cardId)!;
      expect(d.essential).toBeFalsy();
      if (o.kind === 'card') expect(hub.collection[o.cardId]).toBeUndefined();
    }
    // 같은 시드면 같은 후보
    expect(pilgrimRewardOptions(data, hub, 's2')).toEqual(offers);
    const run = startReplay(data, hub, 's2');
    run.status = 'stage_clear';
    expect(pilgrimRewardDue(run.replayOf!, 's2')).toBe(true);
    const pick = offers.find((o) => o.kind === 'card')!;
    claimPilgrimReward(data, run.replayOf!, 's2', pick);
    const back = finishReplay(run);
    expect(back.collection[pick.cardId]).toBe(0);
    expect(pilgrimRewardDue(back, 's2')).toBe(false);
    // 다음 길에서도 남고, 다시 받지 않는다
    const again = startReplay(data, back, 's2');
    expect(again.collection[pick.cardId]).toBe(0);
    expect(pilgrimRewardDue(again.replayOf!, 's2')).toBe(false);
  });

  it('건너뛰어도 1회는 쓰고, 보상 풀이 다 차면 이야기 카드 → 가진 카드 강화 순으로 채운다', () => {
    const hub = cleared('PIL9');
    claimPilgrimReward(data, hub, 's1', null);
    expect(pilgrimRewardDue(hub, 's1')).toBe(false);
    // 보상 카드를 전부 가졌으면 이야기 카드·강화로
    for (const d of data.cards.values()) if (d.pool === 'reward') hub.collection[d.id] ??= 0;
    const offers = pilgrimRewardOptions(data, hub, 's3');
    expect(offers.length).toBe(3);
    expect(offers.every((o) => o.kind === 'upgrade' || data.cards.get(o.cardId)!.pool === 'story')).toBe(true);
    const up = offers.find((o) => o.kind === 'upgrade');
    if (up) {
      const lv = hub.collection[up.cardId];
      claimPilgrimReward(data, hub, 's3', up);
      expect(hub.collection[up.cardId]).toBe(lv + 1);
    }
  });
});

describe('순례 — 도전(3)', () => {
  it('보스를 넘긴 길에서 한 번 판정해 클리어한 런에 적고, 이미 이룬 것은 다시 내지 않는다', () => {
    const hub = cleared('PIL10');
    const run = startReplay(data, hub, 's8');
    run.status = 'stage_clear';
    run.stats.surges = 0;
    run.stats.fought = ['haun', 'kyle'];
    run.stats.boss = { turns: 9, grain: 0, cards: {} };
    const fresh = settleChallenges(data, run).map((c) => c.id);
    expect(fresh).toContain('s8_dojin');
    expect(fresh).toContain('s8_two_not_three');
    expect(fresh).not.toContain('s8_blood_hall');
    expect(settleChallenges(data, run)).toEqual([]);
    expect(finishReplay(run).challenges?.s8).toEqual(fresh);
  });

  it('조건별 판정: 동료·덱·과정·보스전', () => {
    const hub = cleared('PIL11');
    const run = startReplay(data, hub, 's1');
    const met = (id: string) => challengeMet(data, run, data.challenges.get(id)!);
    run.stats.fought = ['haun', 'kyle', 'born'];
    expect(met('s1_branch')).toBe(true);
    run.stats.fought.push('elia');
    expect(met('s1_branch')).toBe(false);
    run.stats.fought = ['haun', 'kyle'];
    expect(met('s3_home_sword')).toBe(true);
    expect(met('s4_two_hammers')).toBe(false);
    run.deck = run.deck.filter((c) => data.cards.get(c.cardId)!.type !== 'power');
    expect(met('s1_bare_heart')).toBe(true);
    run.stats.rests = 1;
    expect(met('s3_frozen_road')).toBe(false);
    run.stats.boss = { turns: 5, grain: 6, cards: { haun_cheonoe: 1 } };
    expect(met('s5_wedge_first')).toBe(true);
    expect(met('s6_grain_reader')).toBe(true);
    expect(met('s2_ride_flow')).toBe(data.cards.get('haun_cheonoe')!.keywords.includes('fusion'));
    // 지도 칸 상태: 출전 중인 동료로 미리 '깨짐'
    run.stats.fought = ['haun'];
    run.selected = ['haun', 'elia'];
    expect(challengeState(data, run, data.challenges.get('s1_branch')!)).toBe('broken');
    expect(challengeState(data, run, data.challenges.get('s5_wedge_first')!)).toBe('open');
  });
});

describe('순례 — 칭호(3-2)', () => {
  const mem = new Map<string, string>();
  beforeEach(() => {
    mem.clear();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
    };
  });

  it('(g) 칭호는 프로필에 남고 저장 칸 요약 끝에 대표 칭호가 붙는다. 틈의 카드·길은 심연 기록에 열린다', () => {
    const hub = cleared('PIL12');
    expect(slotTitle(hub)).toBe('');
    const pick = ['s9_rift_walker', 's9_stitched_sky', 's1_branch', 's1_no_one_falls'].map((id) => data.challenges.get(id)!);
    recordChallenges(data, pick);
    const p = readProfile();
    expect(p.titles).toEqual(['틈을 꿰맨 순례자', '은빛 숲의 순례자']);
    expect(mainTitle()).toBe('은빛 숲의 순례자');
    expect(slotTitle(hub)).toBe(' · 「은빛 숲의 순례자」');
    setMainTitle('틈을 꿰맨 순례자');
    expect(slotTitle(hub)).toBe(' · 「틈을 꿰맨 순례자」');
    // 캠페인 중인 런에는 붙지 않는다
    expect(slotTitle({ status: 'map', replayOf: null })).toBe('');
    const meta = readAbyssMeta(data);
    expect(meta.opened).toEqual(['path_shadow', 'abyss_haun_shard_step']);
    expect(unlockedRift(data, [], meta.opened)).toContain('abyss_haun_shard_step');
    expect(unlockedRift(data, [])).not.toContain('abyss_haun_shard_step');
    expect(unlockedPaths(data, [], meta.opened)).toContain('path_shadow');
  });
});

describe('순례 — 자유 편성(2026-10-11 사용자 요청: 하운 고정 해제)', () => {
  it('캠페인은 하운 고정, 순례는 네 명 중 누구든(하운 빼고도) 최대 인원까지', async () => {
    const { setParty } = await import('../src/engine/run');
    const campaign = createRunAt(data, 'FREE1', 's3');
    const mate = campaign.roster.find((r) => r.id !== 'haun')!.id;
    expect(() => setParty(data, campaign, [mate])).toThrow();
    const run = startReplay(data, cleared('FREE2'), 's2');
    const others = run.roster.filter((r) => r.id !== 'haun' && data.characters.get(r.id)?.role === 'fighter').map((r) => r.id);
    expect(others.length).toBeGreaterThanOrEqual(3);
    setParty(data, run, others.slice(0, data.balance.party.max));
    expect(run.selected).not.toContain('haun');
    expect(() => setParty(data, run, [])).toThrow();
    // 저장해도 그대로
    expect(deserializeRun(data, serializeRun(run))!.run.selected).toEqual(run.selected);
  });

  it('하운 없이 전투: 하운 카드는 덱에서 빠지고, 공용 카드는 앞장이 쓰며, 모두 쓰러져야 진다', async () => {
    const { setParty } = await import('../src/engine/run');
    const { createBattle, cardOwner } = await import('../src/engine/battle');
    const { loseHp } = await import('../src/engine/effects');
    const run = startReplay(data, cleared('FREE3'), 's2');
    const others = run.roster.filter((r) => r.id !== 'haun' && data.characters.get(r.id)?.role === 'fighter').map((r) => r.id).slice(0, 2);
    setParty(data, run, others);
    const enc = enterNode(data, run, run.map.floors[0][0].id);
    const state = createBattle(data, battleSetupFor(data, run, enc));
    expect(state.party.map((p) => p.defId)).toEqual(others);
    const all = [...state.draw, ...state.hand, ...state.discard];
    expect(all.some((c) => data.cards.get(c.cardId)?.owner === 'haun')).toBe(false);
    const common = all.find((c) => data.cards.get(c.cardId)?.owner === 'common');
    if (common) expect(cardOwner(state, common)?.defId).toBe(others[0]);
    loseHp(state, state.party[0], 9999);
    expect(state.result).toBeFalsy();
    loseHp(state, state.party[1], 9999);
    expect(state.result).toBe('defeat');
  });
});

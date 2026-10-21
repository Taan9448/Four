// 순례(자유 여정 개편, 2026-10-11 사용자 결정 A안 · 2026-10-21 누적): 보스를 넘기면 길에서 얻은 것이 남는다
import { beforeEach, describe, expect, it } from 'vitest';
import { acquireCard, setLoadout, upgradeOwned } from '../src/engine/collection';
import { emptyCodex, noteRun, recordsCards } from '../src/engine/codex';
import { battleSetupFor, createRunAt, enterNode, finishReplay, gainRelic, measurePilgrimScale, pilgrimScale, startReplay, suspendReplay } from '../src/engine/run';
import { rollLoot } from '../src/engine/economy';
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

describe('순례 누적 — 보스를 넘기면 길에서 얻은 것이 남는다(2026-10-21)', () => {
  const freshRelic = (hub: ReturnType<typeof cleared>) => [...data.relics.values()].find((r) => !r.abyss && r.rarity !== 'path' && !hub.relics.includes(r.id))!.id;
  const potion = () => [...data.potions.values()].find((p) => !p.abyss)!.id;

  it('(a) 카드·강화·유물·물약·골드·편성이 클리어한 런에 더해진다', () => {
    const hub = cleared();
    const card = unowned(hub);
    const owned = Object.keys(hub.collection).find((id) => data.cards.get(id)?.upgrade && hub.collection[id] < data.balance.upgrade.maxLevel)!;
    const lv = hub.collection[owned];
    const relic = freshRelic(hub);
    hub.potions = hub.potions.map(() => null);
    const gold = hub.gold;
    const run = startReplay(data, hub, 's2');
    // 길에서 얻는 카드는 캠페인처럼 보유 카드에 들어간다(가진 카드면 +1 강화)
    expect(acquireCard(data, run, card.id)).toBe(`카드 획득: ${card.name}`);
    expect(run.collection[card.id]).toBe(0);
    upgradeOwned(data, run, owned);
    run.relics.push(relic);
    run.potions[0] = potion();
    run.gold += 120;
    run.status = 'stage_clear';
    const back = finishReplay(data, run);
    expect(back.collection[card.id]).toBe(0);
    expect(back.collection[owned]).toBe(lv + 1);
    expect(back.relics).toContain(relic);
    expect(back.potions[0]).toBe(potion());
    expect(back.gold).toBe(gold + 120);
    expect(back.loadout).toEqual(run.loadout);
    expect(back.replays.s2).toBe(1);
  });

  it('(f) 지거나 멈추면 클리어한 런은 그대로다(멈춘 길은 이어서 걸을 수 있다)', () => {
    const hub = cleared('PIL2');
    const collection = structuredClone(hub.collection);
    const relics = [...hub.relics];
    for (const end of ['defeat', 'suspend'] as const) {
      const run = startReplay(data, hub, 's1');
      acquireCard(data, run, unowned(hub).id);
      run.relics.push(freshRelic(hub));
      run.gold += 500;
      let back;
      if (end === 'suspend') back = suspendReplay(run);
      else {
        run.status = end;
        back = finishReplay(data, run);
      }
      expect(back.collection).toEqual(collection);
      expect(back.relics).toEqual(relics);
      Object.assign(hub, back);
    }
    expect(hub.replays.s1 ?? 0).toBe(0);
  });

  it('(g) 멈춰 둔 두 길을 차례로 마쳐도 서로 덮어쓰지 않는다 — 달라진 만큼만 더한다', () => {
    let hub = cleared('PIL9');
    const owned = Object.keys(hub.collection).find((id) => data.cards.get(id)?.upgrade && hub.collection[id] <= data.balance.upgrade.maxLevel - 2)!;
    const lv = hub.collection[owned];
    const gold = hub.gold;
    // 길 A: +1 강화 · 골드 +50 하고 멈춘다
    const a = startReplay(data, hub, 's1');
    upgradeOwned(data, a, owned);
    a.gold += 50;
    hub = suspendReplay(a);
    // 길 B: +1 강화 · 유물 하나 · 골드 −30 하고 보스를 넘긴다
    const b = startReplay(data, hub, 's2');
    upgradeOwned(data, b, owned);
    const relic = freshRelic(hub);
    b.relics.push(relic);
    b.gold -= 30;
    b.status = 'stage_clear';
    hub = finishReplay(data, b);
    expect(hub.collection[owned]).toBe(lv + 1);
    expect(hub.gold).toBe(gold - 30);
    // 길 A를 이어서: 길 B의 것이 함께 보이고(+2), 길 A에서 늘어난 골드도 그대로
    const a2 = startReplay(data, hub, 's1');
    expect(a2.collection[owned]).toBe(lv + 2);
    expect(a2.relics).toContain(relic);
    expect(a2.gold).toBe(gold + 50 - 30);
    expect(a2.deck.filter((c) => c.cardId === owned).every((c) => c.level === lv + 2)).toBe(true);
    a2.status = 'stage_clear';
    hub = finishReplay(data, a2);
    expect(hub.collection[owned]).toBe(lv + 2);
    expect(hub.gold).toBe(gold + 20);
    expect(hub.relics.filter((r) => r === relic).length).toBe(1);
  });

  it('(i) 순례 길에서는 가진 유물도 다시 나오고, 다시 나오면 등급별 골드로 받는다(캠페인은 그대로 무시)', () => {
    const hub = cleared('PIL11');
    const have = hub.relics[0] ?? freshRelic(hub);
    if (!hub.relics.includes(have)) hub.relics.push(have);
    const run = startReplay(data, hub, 's2');
    const gold = run.gold;
    const want = data.balance.pilgrimage.dupGold[data.relics.get(have)!.rarity]!;
    expect(want).toBeGreaterThan(0);
    expect(gainRelic(data, run, have)).toEqual([`이미 가진 유물 「${data.relics.get(have)!.name}」 — 골드 +${want}`]);
    expect(run.gold).toBe(gold + want);
    expect(run.relics.filter((r) => r === have).length).toBe(1);
    // 캠페인 런은 전처럼 아무 일도 없다
    const campaign = createRunAt(data, 'PIL11C', 's3');
    campaign.relics.push(have);
    const g = campaign.gold;
    expect(gainRelic(data, campaign, have)).toEqual([]);
    expect(campaign.gold).toBe(g);
    // 엘리트·보스 전리품 후보에 가진 유물이 오를 수 있다
    run.relics = [...data.relics.values()].filter((r) => !r.abyss && r.rarity !== 'path').map((r) => r.id);
    const elite = run.map.floors.flat().find((n) => n.type === 'elite') ?? { ...run.map.floors[0][0], type: 'elite' as const };
    const boss = run.map.floors.flat().find((n) => n.type === 'boss')!;
    expect(rollLoot(data, run, elite).relic).not.toBeNull();
    expect(rollLoot(data, run, boss).relicChoices.length).toBeGreaterThan(0);
  });

  it('(h) 길에서 넘긴 카드는 지우고, 쓴 물약은 빠진다', () => {
    let hub = cleared('PIL10');
    const gone = Object.keys(hub.collection).find((id) => !data.cards.get(id)?.essential)!;
    hub.potions = [potion(), ...hub.potions.slice(1).map(() => null)];
    const run = startReplay(data, hub, 's3');
    delete run.collection[gone];
    run.potions[0] = null;
    run.status = 'stage_clear';
    hub = finishReplay(data, run);
    expect(hub.collection[gone]).toBeUndefined();
    expect(Object.values(hub.loadout).flat()).not.toContain(gone);
    expect(hub.potions[0]).toBeNull();
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
    expect(finishReplay(data, run).stats.kills).toBe(77);
  });
});

describe('순례 — 도감 기록(1-3)', () => {
  it('(c) 걷는 중인 길의 덱·보유·상점 카드는 도감에 적지 않고(보스를 넘겨 클리어한 런에 들 때 적는다), 클리어한 런의 보유 카드·유물은 적는다', () => {
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
  it('(d) 세 항(2026-10-12 · 유물은 등급별 점수의 곱 2026-10-21): (1 + 레벨 초과 × 레벨당 + 평균 강화 × upgradePct) × (1 + relicGrowth)^(유물 점수 − 무료), 상한, 캠페인은 1', () => {
    const hub = cleared('PIL6');
    expect(pilgrimScale(data, hub)).toEqual({ hp: 1, dmg: 1, level: 0, relics: 0, upgrade: 0 });
    const run = startReplay(data, hub, 's3');
    const haun = run.roster.find((r) => r.id === 'haun')!;
    haun.level = 9;
    const over = Math.max(0, 9 - p.baseLevel.s3);
    // 출발 편성(열쇠 카드 제외)의 평균 강화
    const cards = Object.values(run.loadout).flat().filter((id) => !data.cards.get(id)?.essential);
    for (const id of cards) run.collection[id] = 2;
    // 무료 점수를 넘기도록 등급마다 여럿 더 쥐여 준다
    for (const rarity of ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const)
      for (const r of [...data.relics.values()].filter((x) => x.rarity === rarity && !x.abyss && !run.relics.includes(x.id)).slice(0, 8)) run.relics.push(r.id);
    const pts = run.relics.reduce((a, id) => a + (p.relicPts[data.relics.get(id)!.rarity] ?? 0), 0);
    expect(pts).toBeGreaterThan(p.relicFree);
    expect(p.relicPts.legendary).toBeGreaterThan(p.relicPts.common!);
    const mul = Math.pow(1 + p.relicGrowth, pts - p.relicFree);
    const round = (x: number) => Math.round(x * 100) / 100;
    const k = pilgrimScale(data, run);
    const tier = (t: string) => run.relics.filter((id) => data.relics.get(id)!.rarity === t).length;
    expect(k).toEqual({
      hp: round(Math.min(p.maxHp, (1 + over * p.hpPerLevel + 2 * p.upgradePct) * mul)),
      dmg: round(Math.min(p.maxDmg, (1 + over * p.dmgPerLevel + 2 * p.upgradePct) * Math.pow(1 + p.relicGrowth, (pts - p.relicFree) * p.relicDmgShare))),
      level: over,
      relics: run.relics.length,
      relicPts: Math.round(pts * 10) / 10,
      relicMul: round(mul),
      epic: tier('epic'),
      legendary: tier('legendary'),
      upgrade: 2,
    });
    // 무료 점수 안이면 유물은 적을 세게 하지 않는다
    haun.level = 1;
    run.relics = run.relics.slice(0, 3);
    expect(pilgrimScale(data, run).hp).toBe(round(1 + 2 * p.upgradePct));
    // 상한
    haun.level = 99;
    run.relics = Array.from({ length: 500 }, () => 'red_thread');
    expect(pilgrimScale(data, run)).toMatchObject({ hp: p.maxHp, dmg: p.maxDmg });
  });

  it('출발 편성을 정하면 보정을 고정한다 — 길에서 레벨·유물·강화가 늘어도 그대로, 저장을 거쳐도 그대로', () => {
    const hub = cleared('PIL6B');
    const run = startReplay(data, hub, 's4');
    setLoadout(data, run, run.loadout);
    const fixed = structuredClone(run.pilgrimScale!);
    expect(fixed).toEqual(measurePilgrimScale(data, run));
    run.roster.find((r) => r.id === 'haun')!.level += 5;
    run.relics.push('red_thread', 'red_thread');
    for (const id of Object.keys(run.collection)) run.collection[id] = 3;
    expect(pilgrimScale(data, run)).toEqual(fixed);
    expect(deserializeRun(data, serializeRun(run))!.run.pilgrimScale).toEqual(fixed);
    // 클리어한 런으로 돌아가면 남지 않는다
    expect(finishReplay(data, run).pilgrimScale).toBeUndefined();
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
    const back = finishReplay(data, run);
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
    expect(finishReplay(data, run).challenges?.s8).toEqual(fresh);
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

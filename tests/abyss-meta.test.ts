// 심연 3차(메타, GAME_DESIGN 16절): 서약 15단계 · 업적과 해금(틈의 카드 30·길 3) · 일일 심연 · 기록 · 도감 법칙·접사
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/engine/data';
import {
  abyssPool,
  abyssScore,
  achievementMet,
  advanceLoop,
  createAbyssRun,
  dailyPlan,
  dailySeed,
  emptyAbyssMeta,
  injure,
  oathMax,
  oathMods,
  parseAbyssMeta,
  pathOffer,
  pathPicks,
  planLoop,
  riftCards,
  trackLoopClear,
  unlockedPaths,
  unlockedRift,
  updateAbyssMeta,
  type AbyssStart,
} from '../src/engine/abyss';
import { applyChoice, battleSetupFor, choicesFor, enterNode, rewardOptions, type RunState } from '../src/engine/run';
import { emptyCodex, noteAffixes, noteRun, parseCodex } from '../src/engine/codex';
import { deserializeRun, serializeRun } from '../src/engine/save';

const data = gameData();
const pool = abyssPool(data, {}, [...data.cards.values()].filter((c) => c.pool === 'reward').map((c) => c.id));
const start = (seed: string, mates: string[], extra: Partial<AbyssStart> = {}) => {
  const offer = pathOffer(data, seed, extra.unlockedPaths);
  return createAbyssRun(data, seed, { mates, paths: offer.slice(0, pathPicks(data, mates.length).picks), pool, ...extra });
};
const clearLoops = (run: RunState, n: number) => {
  for (let i = 0; i < n; i++) {
    run.status = 'stage_clear';
    advanceLoop(data, run);
  }
};

describe('심연 3차 — 서약', () => {
  it('서약 15단계: 고른 단계까지 모두 걸리고, 열리는 단계는 넘은 굽이 - 2 또는 바로 아래 단계로 5굽이', () => {
    expect(data.oaths.map((o) => o.level)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
    expect(oathMods(data, 0)).toEqual({});
    const m3 = oathMods(data, 3);
    expect(m3.enemyHpMul).toBe(1.1);
    expect(m3.startGold).toBe(0);
    expect(m3.restHealMul).toBe(0.5);
    expect(m3.rewardChoices).toBeUndefined();
    expect(oathMax(data, 0)).toBe(0);
    expect(oathMax(data, 5)).toBe(3);
    expect(oathMax(data, 8)).toBe(6);
    expect(oathMax(data, 2, 6)).toBe(7);
    expect(oathMax(data, 40)).toBe(15);
  });

  it('시작에 걸리는 서약: 골드 0 · 상흔 5 · 물약 칸 2 · 동료 1명 · 하운 최대 체력 50 · 심법 없는 시작 덱', () => {
    const run = start('O15', ['elia'], { oath: 15 });
    expect(run.abyss!.oath).toBe(15);
    expect(run.gold).toBe(pathPicks(data, 1).gold + (run.relics.includes('path_debt') ? 150 : 0));
    expect(run.scar).toBe(5 + (run.relics.includes('path_debt') ? 3 : 0));
    expect(run.potions.length).toBe(2);
    const haun = run.roster.find((r) => r.id === 'haun')!;
    expect(haun.maxHp).toBe(50 + (run.relics.includes('path_mountain') ? 15 : 0));
    expect(run.deck.some((c) => data.cards.get(c.cardId)!.type === 'power')).toBe(false);
    expect(() => start('O15', ['elia', 'kyle'], { oath: 15 })).toThrow();
    // 서약이 없으면 시작 덱에 심법이 있을 수 있다(하운 시작 카드의 심법)
    const plain = start('O0', ['elia']);
    expect(plain.potions.length).toBe(data.balance.economy.potionSlots);
  });

  it('굽이에 걸리는 서약: 적 체력 +10%, 6층 엘리트, 1굽이부터 법칙, 숙적 3굽이마다, 엘리트 접사 2개', () => {
    const base = start('OL', ['elia', 'kyle']);
    const hard = start('OL', ['elia', 'kyle'], { oath: 11 });
    expect(hard.abyss!.laws!.length).toBeGreaterThanOrEqual(1);
    expect(base.abyss!.laws!.length).toBe(0);
    expect(hard.map.floors[5].every((n) => n.type === 'elite')).toBe(true);
    for (let d = 1; d <= 9; d++) expect(planLoop(data, hard.abyss!, d).boss === data.balance.abyss.nemesisModule).toBe(d % 3 === 0);
    const node = base.map.floors[0][0];
    const encBase = enterNode(data, base, node.id);
    const encHard = enterNode(data, hard, hard.map.floors[0][0].id);
    if (encBase.module.id === encHard.module.id && ['battle', 'elite'].includes(node.type)) {
      expect(battleSetupFor(data, hard, encHard).enemyHpScale).toBeCloseTo((battleSetupFor(data, base, encBase).enemyHpScale ?? 1) * 1.1);
    }
    // 엘리트 접사 최소 2개(1굽이에서도)
    const elite = hard.map.floors[5][0];
    hard.position = hard.map.floors[4][0].id;
    hard.map.floors[4][0].next = [elite.id];
    const enc = enterNode(data, hard, elite.id);
    const mods = battleSetupFor(data, hard, enc).enemyMods ?? [];
    const tiers = (enc.module.content.enemies ?? []).map((id) => data.enemies.get(id)!.tier);
    tiers.forEach((t, i) => t === 'elite' && expect(mods[i]?.affixes?.length).toBe(2));
  });

  it('보상에 걸리는 서약: 보상 카드 2장 · 틈의 카드 한 장은 반드시 · 심법 금지', () => {
    const run = start('OR', ['elia', 'kyle'], { oath: 13 });
    for (const n of run.map.floors.flat()) {
      const opts = rewardOptions(data, run, n.id);
      expect(opts.length).toBe(2);
      expect(opts.some((id) => data.cards.get(id)!.pool === 'abyss')).toBe(true);
      expect(opts.some((id) => data.cards.get(id)!.type === 'power')).toBe(false);
    }
  });

  it('서약 9: 굽이를 넘어도 부상이 낫지 않는다. 휴식 회복은 서약 3부터 절반', () => {
    const run = start('OI', ['elia', 'kyle'], { oath: 9 });
    injure(data, run, (ids) => ids[0], 'kyle');
    const max = run.roster.find((r) => r.id === 'kyle')!.maxHp;
    clearLoops(run, 1);
    expect(run.roster.find((r) => r.id === 'kyle')!.maxHp).toBe(max);
    expect(run.abyss!.injuries.kyle).toBeGreaterThan(0);
    const rest = [...data.modules.values()].find((m) => m.type === 'rest' && m.stage === 's1')!;
    const heal = choicesFor(data, run, rest).findIndex((c) => c.effects.some((e) => e.op === 'heal_party'));
    const haun = run.roster.find((r) => r.id === 'haun')!;
    haun.hp = 1;
    applyChoice(data, run, rest, heal);
    const plain = start('OI', ['elia', 'kyle']);
    const ph = plain.roster.find((r) => r.id === 'haun')!;
    ph.hp = 1;
    applyChoice(data, plain, rest, heal);
    expect(haun.hp - 1).toBeLessThan(ph.hp - 1);
  });

  it('점수: 서약 단계마다 ×1.1', () => {
    const a = start('SC', ['elia']);
    const b = start('SC', ['elia'], { oath: 2 });
    clearLoops(a, 2);
    clearLoops(b, 2);
    for (const r of [a, b]) r.roster.find((x) => x.id === 'haun')!.hp = 0;
    a.status = b.status = 'defeat';
    expect(abyssScore(data, b)).toBe(Math.round(abyssScore(data, a) * 1.1 ** 2));
  });
});

describe('심연 3차 — 해금·업적', () => {
  it('틈의 카드 40장(하운 10·엘리아 8·카일 8·보른 8·공용 6): 처음 10장, 업적 30개가 하나씩 연다. 길은 3종이 처음부터', () => {
    const all = riftCards(data);
    expect(all.length).toBe(40);
    const by = (o: string) => all.filter((c) => c.owner === o).length;
    expect([by('haun'), by('elia'), by('kyle'), by('born'), by('common')]).toEqual([10, 8, 8, 8, 6]);
    expect(unlockedRift(data, []).length).toBe(10);
    expect(unlockedPaths(data, []).sort()).toEqual(['path_mountain', 'path_river', 'path_woodcutter']);
    const ach = [...data.achievements.values()];
    expect(ach.length).toBe(33);
    expect(ach.filter((a) => a.unlock.card).length).toBe(30);
    expect(ach.filter((a) => a.unlock.path).length).toBe(3);
    // 하나의 업적은 하나만 열고, 같은 것을 두 업적이 열지 않는다
    const opened = ach.map((a) => a.unlock.card ?? a.unlock.path);
    expect(new Set(opened).size).toBe(33);
    for (const id of opened) expect(data.cards.has(id!) || data.relics.get(id!)?.rarity === 'path').toBe(true);
    expect(unlockedRift(data, ach.map((a) => a.id)).length).toBe(40);
    // 길 후보는 열린 길에서만
    for (const seed of ['P1', 'P2', 'P3']) expect(pathOffer(data, seed, unlockedPaths(data, [])).every((p) => ['path_mountain', 'path_river', 'path_woodcutter'].includes(p))).toBe(true);
    // 열린 틈의 카드만 보상에
    const run = start('UL', ['elia', 'kyle', 'born'], { unlocked: unlockedRift(data, []) });
    const locked = new Set(all.map((c) => c.id).filter((id) => !unlockedRift(data, []).includes(id)));
    for (const n of run.map.floors.flat()) expect(rewardOptions(data, run, n.id).some((id) => locked.has(id))).toBe(false);
  });

  it('업적 셈: 굽이 통과·구원·세계·덱 크기·서약·동료 수가 런 안에서 재어진다', () => {
    const ach = (id: string) => data.achievements.get(id)!;
    const run = start('AC', ['elia'], { oath: 3 });
    expect(achievementMet(data, run, ach('first_loop'))).toBe(false);
    run.status = 'stage_clear';
    trackLoopClear(data, run);
    expect(achievementMet(data, run, ach('first_loop'))).toBe(true);
    expect(achievementMet(data, run, ach('second_loop'))).toBe(false);
    advanceLoop(data, run);
    clearLoops(run, 1);
    // 3굽이: 구원
    const rescue = data.modules.get(data.balance.abyss.rescueModule)!;
    applyChoice(data, run, rescue, choicesFor(data, run, rescue).findIndex((c) => c.label.startsWith('카일')));
    expect(achievementMet(data, run, ach('rescue'))).toBe(true);
    expect(achievementMet(data, run, ach('echo'))).toBe(false);
    // 동료 한 명으로 시작했다(구원으로 늘어도)
    for (let d = run.abyss!.depth; d <= 5; d++) {
      run.status = 'stage_clear';
      trackLoopClear(data, run);
      if (d < 5) advanceLoop(data, run);
    }
    expect(achievementMet(data, run, ach('two_alone'))).toBe(true);
    expect(achievementMet(data, run, ach('full_party'))).toBe(false);
    expect(achievementMet(data, run, ach('oath_3'))).toBe(true);
    expect(achievementMet(data, run, ach('oath_6'))).toBe(false);
    expect(run.abyss!.track!.worlds.length).toBeGreaterThanOrEqual(1);
    expect(achievementMet(data, run, ach('codex_100'), { codexCards: 99 })).toBe(false);
    expect(achievementMet(data, run, ach('codex_100'), { codexCards: 100 })).toBe(true);
    // 골드·틈의 카드는 늘 잰다
    run.gold = 400;
    applyChoice(data, run, rescue, choicesFor(data, run, rescue).length - 1);
    expect(achievementMet(data, run, ach('gold_400'))).toBe(true);
  });

  it('기록: 새 업적은 한 번만, 멈춘 굽이·서약·일일 최고 기록. 깨진 기록도 읽는다', () => {
    const run = start('ME', ['elia'], { oath: 1 });
    const meta = emptyAbyssMeta();
    clearLoops(run, 4);
    run.status = 'stage_clear';
    trackLoopClear(data, run);
    const first = updateAbyssMeta(data, meta, run, { ended: false });
    expect(first.map((a) => a.id)).toContain('first_loop');
    expect(meta.oathCleared).toBe(1);
    expect(updateAbyssMeta(data, meta, run, { ended: false }).map((a) => a.id)).not.toContain('first_loop');
    run.status = 'defeat';
    updateAbyssMeta(data, meta, run, { ended: true });
    expect(meta.deaths['5']).toBe(1);
    const back = parseAbyssMeta(data, JSON.stringify({ ...meta, achievements: [...meta.achievements, 'no_such'] }));
    expect(back.achievements).toEqual(meta.achievements);
    expect(parseAbyssMeta(data, '{broken')).toEqual(emptyAbyssMeta());
  });
});

describe('심연 3차 — 일일 심연·도감', () => {
  it('일일 심연: 날짜 시드, 같은 날이면 같은 동료·길·서약·법칙, 그날의 법칙이 모든 굽이에', () => {
    const seed = dailySeed(new Date(2026, 9, 9));
    expect(seed).toBe('D20261009');
    const plan = dailyPlan(data, seed);
    expect(dailyPlan(data, seed)).toEqual(plan);
    const [lo, hi] = data.balance.abyss.daily.oath;
    expect(plan.oath).toBeGreaterThanOrEqual(lo);
    expect(plan.oath).toBeLessThanOrEqual(hi);
    expect(plan.laws.length).toBe(data.balance.abyss.daily.laws);
    expect(plan.paths.length).toBe(pathPicks(data, plan.mates.length).picks);
    const run = createAbyssRun(data, seed, { mates: plan.mates, paths: plan.paths, oath: plan.oath, pool, daily: { date: seed.slice(1), laws: plan.laws } });
    expect(run.abyss!.daily).toBe('20261009');
    for (let d = 1; d <= 4; d++) {
      expect(run.abyss!.laws).toEqual(expect.arrayContaining(plan.laws));
      expect(new Set(run.abyss!.laws).size).toBe(run.abyss!.laws!.length);
      clearLoops(run, 1);
    }
    // 저장했다 되살려도 같다
    const back = deserializeRun(data, serializeRun(run))!.run;
    expect(back.abyss!.daily).toBe('20261009');
    expect(back.abyss!.track).toEqual(run.abyss!.track);
    // 일일 기록은 그날 최고 점수
    const meta = emptyAbyssMeta();
    run.status = 'defeat';
    updateAbyssMeta(data, meta, run, { ended: true });
    expect(meta.daily['20261009'].cleared).toBe(run.abyss!.depth - 1);
  });

  it('도감: 지나온 굽이의 법칙과 만난 접사를 적고, 데이터에 없는 것은 버린다', () => {
    const run = start('CX', ['elia'], { oath: 7 });
    const codex = noteAffixes(noteRun(emptyCodex(), run), ['hardened', 'nope']);
    expect(codex.laws.length).toBeGreaterThanOrEqual(1);
    const back = parseCodex(data, JSON.stringify(codex));
    expect(back.laws).toEqual(codex.laws);
    expect(back.affixes.every((id) => data.affixes.has(id))).toBe(true);
  });
});

describe('심연 3차 — 전투 셈', () => {
  it('결 노출을 터뜨린 수와 접사 붙은 적 처치가 전투 집계에 남는다', async () => {
    const { battle, give } = await import('./helpers');
    const { playCard } = await import('../src/engine/battle');
    const s = battle({ enemyMods: [{ affixes: ['tough'] }] });
    const enemy = s.enemies[0];
    enemy.statuses.grain = 2;
    enemy.hp = 1;
    playCard(s, give(s, 'haun_chop'), enemy.uid);
    expect(s.tally!.grain).toBe(1);
    expect(s.tally!.affixKills).toBe(1);
  });
});

// 대강화 +6~+10(심연 개편 5단계, GAME_DESIGN 16절 ⑦) — 각인·각성(2026-10-15 개편)
import { describe, expect, it } from 'vitest';
import { createAbyssRun, pathOffer, pathPicks } from '../src/engine/abyss';
import { buyForge, forgeCandidates, forgeChance, forgeLocked, openShop, rerollCandidates, rerollEngraving } from '../src/engine/economy';
import { createRunAt } from '../src/engine/run';
import { forgeMax, resolveCard } from '../src/engine/state';
import { chooseEngraving, engravingAllowed, rerollPool, settleEngraving } from '../src/engine/forge';
import { ownedView } from '../src/engine/collection';
import { cardText } from '../src/engine/text';
import { promptFor } from '../tools/render-prompt.mjs';
import { data } from './helpers';

const f = data.balance.upgrade.forge;
const max = data.balance.upgrade.maxLevel;
const cards = [...data.cards.values()];
// 첫 효과가 피해이고 내공을 쓰는 영웅 카드(수치·비용 변화를 보기 쉽게)
const epic = cards.find((c) => c.rarity === 'epic' && c.upgrade && c.effects[0]?.op === 'damage' && c.effects[0].amount !== undefined && c.cost.neigong > 0)!;
const rare = cards.find((c) => c.rarity === 'rare' && c.upgrade)!;
const at = (id: string, level: number) => resolveCard(data, { uid: 'x', cardId: id, level });

describe('대강화 카드 모습', () => {
  it('영웅·전설만 +10까지, 나머지는 +5에서 멈춘다', () => {
    expect(forgeMax(data, epic)).toBe(max + 5);
    expect(forgeMax(data, rare)).toBe(max);
    expect(at(rare.id, 9).level).toBe(max);
    expect(cards.filter((c) => forgeMax(data, c) > max).every((c) => f.rarities.includes(c.rarity as never))).toBe(true);
  });

  it('단계마다 수치 +levelMul, 각인 없이도 카드는 그대로 쓸 수 있다', () => {
    const amt = (lv: number) => at(epic.id, lv).baseEffects[0].amount!;
    expect(amt(max + 1)).toBe(Math.round(amt(max) * (1 + f.levelMul)));
    expect(amt(max + 4)).toBe(Math.round(amt(max) * (1 + f.levelMul * 4)));
    expect(at(epic.id, max + 4).cost).toEqual(at(epic.id, max).cost);
  });

  it('각인: 정련 수치, 경량 비용, 연격 타수, 속성, 붙는 효과, 키워드', () => {
    const mark = (marks: string[]) => resolveCard(data, { uid: 'x', cardId: epic.id, level: max + marks.length, marks });
    const base = at(epic.id, max + 1);
    expect(mark(['refine']).baseEffects[0].amount).toBe(Math.round(Math.round(at(epic.id, max).baseEffects[0].amount! * (1 + f.levelMul)) * 1.25));
    expect(mark(['light']).cost.neigong).toBe(base.cost.neigong - 1);
    expect(mark(['twin']).baseEffects[0].times).toBe((base.baseEffects[0].times ?? 1) + 1);
    if (!base.baseEffects[0].element) expect(mark(['fire']).baseEffects[0].element).toBe('fire');
    expect(mark(['flow']).effects.at(-1)).toEqual({ op: 'draw', amount: 1 });
    expect(mark(['first']).keywords).toContain('innate');
    // 단계보다 많은 각인은 무시한다(+6이면 하나)
    expect(resolveCard(data, { uid: 'x', cardId: epic.id, level: max + 1, marks: ['refine', 'light'] }).engravings.map((m) => m.id)).toEqual(['refine']);
    const text = cardText(data, { uid: 'x', cardId: epic.id, level: max + 1, marks: ['refine'] });
    expect(text).toContain('◆정련');
  });

  it('+10 각성은 카드 주인마다 다르고, 전설은 수치가 더 크다', () => {
    const owners = new Set(cards.filter((c) => forgeMax(data, c) > max).map((c) => c.owner));
    for (const o of owners) expect(data.forge.awakenings[o], o).toBeDefined();
    const ten = at(epic.id, max + 5);
    expect(ten.awakening?.id).toBe(data.forge.awakenings[epic.owner].id);
    expect(ten.keywords).toContain('innate');
    expect(cardText(data, { uid: 'x', cardId: epic.id, level: max + 5 })).toContain(`각성 · ${data.forge.awakenings[epic.owner].name}`);
    const leg = cards.find((c) => c.rarity === 'legendary' && c.owner === 'common' && c.effects.some((e) => (e.op === 'block' || e.op === 'damage') && e.amount))!;
    if (leg) {
      const i = leg.effects.findIndex((e) => (e.op === 'block' || e.op === 'damage') && e.amount);
      const nine = at(leg.id, max + 4).baseEffects[i].amount!;
      const ten2 = at(leg.id, max + 5).baseEffects[i].amount!;
      expect(ten2).toBeGreaterThan(nine * 1.3 * 1.1);
    }
  });

  it('공명(심법)은 효과 전체가 두 번, 봉합은 대가 절반', () => {
    const power = cards.find((c) => forgeMax(data, c) > max && c.type === 'power')!;
    const p = resolveCard(data, { uid: 'x', cardId: power.id, level: max + 1, marks: ['resonance'] });
    expect(p.effects.length).toBe(at(power.id, max + 1).effects.length * 2);
    const priced = cards.find((c) => forgeMax(data, c) > max && c.effects.some((e) => e.op === 'rift' && (e.amount ?? 0) >= 2))!;
    const i = priced.effects.findIndex((e) => e.op === 'rift' && (e.amount ?? 0) >= 2);
    const soft = resolveCard(data, { uid: 'x', cardId: priced.id, level: max + 1, marks: ['stitch'] });
    expect(soft.baseEffects[i].amount).toBe(Math.ceil(priced.effects[i].amount! / 2));
  });
});

describe('각인 고르기', () => {
  it('카드에 맞는 각인만 후보로, 고르면 새겨지고, 같은 각인은 다시 나오지 않는다', () => {
    const power = cards.find((c) => forgeMax(data, c) > max && c.type === 'power')!;
    const inst = { uid: 'p', cardId: power.id, level: max + 1 };
    expect(engravingAllowed(data, inst, data.forge.engravings.find((m) => m.id === 'resonance')!)).toBe(true);
    expect(engravingAllowed(data, { ...inst, cardId: epic.id }, data.forge.engravings.find((m) => m.id === 'resonance')!)).toBe(false);
    expect(engravingAllowed(data, { ...inst, marks: ['resonance'] }, data.forge.engravings.find((m) => m.id === 'resonance')!)).toBe(false);
  });

  it('영웅·전설 카드는 모두 +6~+9 네 번 고를 만큼 각인 후보가 있다', () => {
    for (const c of cards.filter((x) => forgeMax(data, x) > max)) {
      const n = data.forge.engravings.filter((m) => engravingAllowed(data, { uid: 'x', cardId: c.id, level: max + 1 }, m)).length;
      expect(n, c.id).toBeGreaterThanOrEqual(f.offer + 3);
    }
  });

  it('성공하면 후보 셋이 남고, 고를 때까지 다음 시도는 막힌다. 떠나면 첫 후보로 새긴다', () => {
    const run = createAbyssRun(data, 'ENGRAVE', { mates: ['elia', 'kyle', 'born'], paths: pathOffer(data, 'ENGRAVE').slice(0, pathPicks(data, 3).picks), pool: {} });
    run.deck.push({ uid: 'e1', cardId: epic.id, level: max });
    run.shop = openShop(data, run, 'n1-0');
    run.gold = f.price * 100;
    let r = buyForge(data, run, 'e1');
    while (r.ok && !r.success) r = buyForge(data, run, 'e1');
    expect(r.ok && r.choices).toHaveLength(f.offer);
    expect(run.forgePending?.choices).toHaveLength(f.offer);
    expect(buyForge(data, run, 'e1').ok).toBe(false);
    const pick = run.forgePending!.choices[1];
    expect(chooseEngraving(data, run, pick).ok).toBe(true);
    expect(run.deck.find((c) => c.uid === 'e1')!.marks).toEqual([pick]);
    expect(run.forgePending).toBeNull();
    r = buyForge(data, run, 'e1');
    while (r.ok && !r.success) r = buyForge(data, run, 'e1');
    expect(run.forgePending!.choices).not.toContain(pick);
    const first = run.forgePending!.choices[0];
    settleEngraving(data, run);
    expect(run.deck.find((c) => c.uid === 'e1')!.marks).toEqual([pick, first]);
  });

  it('캠페인: 각인은 보유 카드에 남아 다음 스테이지 덱에도 붙는다', () => {
    const run = createRunAt(data, 'ENGRAVE2', 's3');
    run.collection[epic.id] = max;
    run.deck.push({ uid: 'e2', cardId: epic.id, level: max });
    run.shop = openShop(data, run, 'n1-0');
    run.gold = f.price * 50;
    let r = buyForge(data, run, 'e2');
    while (r.ok && !r.success) r = buyForge(data, run, 'e2');
    const id = run.forgePending!.choices[0];
    chooseEngraving(data, run, id);
    expect(run.engravings?.[epic.id]).toEqual([id]);
    expect(ownedView(run, epic.id, 'v').marks).toEqual([id]);
  });
});

describe('대강화 시도', () => {
  it('천장: 실패할 때마다 기본값의 pity만큼 오른다', () => {
    const run = createRunAt(data, 'FORGE', 's3');
    const c = { uid: 'u1', cardId: epic.id, level: max };
    expect(forgeChance(data, run, c)).toEqual({ chance: f.chance[0], base: f.chance[0], fails: 0 });
    run.forgeFails = { [epic.id]: 4 };
    expect(forgeChance(data, run, c).chance).toBeCloseTo(f.chance[0] * (1 + f.pity * 4));
    run.forgeFails = { [epic.id]: 999 };
    expect(forgeChance(data, run, c).chance).toBe(1);
  });

  it('심연: +5 영웅·전설 카드만 후보, 골드를 내고 성공하면 +1, 실패하면 단계 그대로 천장만 오른다', () => {
    const run = createAbyssRun(data, 'FORGE', { mates: ['elia', 'kyle', 'born'], paths: pathOffer(data, 'FORGE').slice(0, pathPicks(data, 3).picks), pool: {} });
    run.deck.push({ uid: 'forge-a', cardId: epic.id, level: max - 1 });
    run.shop = openShop(data, run, 'n1-0');
    expect(forgeCandidates(data, run).some((c) => c.uid === 'forge-a')).toBe(false);
    const card = run.deck.find((c) => c.uid === 'forge-a')!;
    card.level = max;
    expect(forgeCandidates(data, run).map((c) => c.uid)).toContain('forge-a');
    run.gold = f.price * 400;
    let tries = 0;
    while (card.level < max + 5 && tries < 400) {
      const before = { level: card.level, fails: run.forgeFails?.['forge-a'] ?? 0, gold: run.gold };
      const r = buyForge(data, run, 'forge-a');
      tries++;
      if (r.ok && r.success) settleEngraving(data, run);
      expect(r.ok).toBe(true);
      expect(run.gold).toBe(before.gold - f.price);
      if (r.ok && r.success) {
        expect(card.level).toBe(before.level + 1);
        expect(run.forgeFails?.['forge-a']).toBeUndefined();
      } else {
        expect(card.level).toBe(before.level);
        expect(run.forgeFails!['forge-a']).toBe(before.fails + 1);
      }
    }
    expect(card.level).toBe(max + 5);
    expect(forgeCandidates(data, run).some((c) => c.uid === 'forge-a')).toBe(false);
    expect(buyForge(data, run, 'forge-a').ok).toBe(false);
  });

  it('결과는 시드·카드·단계·실패 수로 정해진다. 골드가 모자라면 못 한다', () => {
    const make = () => {
      const run = createAbyssRun(data, 'FORGE2', { mates: ['elia', 'kyle', 'born'], paths: pathOffer(data, 'FORGE2').slice(0, pathPicks(data, 3).picks), pool: {} });
      run.deck.push({ uid: 'forge-b', cardId: epic.id, level: max + 2 });
      run.shop = openShop(data, run, 'n1-0');
      run.gold = f.price * 30;
      return run;
    };
    const a = make();
    const b = make();
    const seq = (run: ReturnType<typeof make>) =>
      Array.from({ length: 20 }, () => {
        const r = buyForge(data, run, 'forge-b');
        settleEngraving(data, run);
        return r.ok && r.success;
      });
    expect(seq(a)).toEqual(seq(b));
    const poor = make();
    poor.gold = f.price - 1;
    expect(buyForge(data, poor, 'forge-b').ok).toBe(false);
  });

  it('캠페인: 보유 카드에 남고 덱의 같은 카드도 함께 오른다', () => {
    const run = createRunAt(data, 'FORGE3', 's3');
    run.collection[epic.id] = max;
    run.deck.push({ uid: 'forge-c', cardId: epic.id, level: max });
    run.shop = openShop(data, run, 'n1-0');
    run.gold = f.price * 50;
    let guard = 0;
    while (run.collection[epic.id] === max && guard++ < 50) buyForge(data, run, 'forge-c');
    settleEngraving(data, run);
    expect(run.collection[epic.id]).toBe(max + 1);
    expect(run.deck.filter((c) => c.cardId === epic.id).every((c) => c.level === max + 1)).toBe(true);
  });
});

describe('대장간: 상점마다 카드 한 장', () => {
  it('한 카드를 두드리면 그 상점에서는 다른 카드를 못 하고, 다음 상점에서는 다시 고른다', () => {
    const run = createAbyssRun(data, 'ONECARD', { mates: ['elia', 'kyle', 'born'], paths: pathOffer(data, 'ONECARD').slice(0, pathPicks(data, 3).picks), pool: {} });
    const epics = cards.filter((c) => forgeMax(data, c) > max).slice(0, 2);
    run.deck.push({ uid: 'a1', cardId: epics[0].id, level: max }, { uid: 'b1', cardId: epics[1].id, level: max });
    run.shop = openShop(data, run, 'n1-0');
    run.gold = f.price * 20;
    expect(forgeLocked(run)).toBeNull();
    buyForge(data, run, 'a1');
    settleEngraving(data, run);
    expect(forgeLocked(run)).toBe('a1');
    expect(buyForge(data, run, 'b1').ok).toBe(false);
    expect(buyForge(data, run, 'a1').ok).toBe(true);
    settleEngraving(data, run);
    run.shop = openShop(data, run, 'n2-0');
    expect(forgeLocked(run)).toBeNull();
    expect(buyForge(data, run, 'b1').ok).toBe(true);
  });
});

describe('대강화 틀 명세', () => {
  it('겹치는 테두리(overlay) 프롬프트: 띠만 그리고 안은 키 색', () => {
    for (const n of [8, 9, 10]) {
      const text = promptFor(`card_frame_forge_${n}`);
      expect(text).toContain('OVERLAY');
      expect(text).toContain('BORDER BAND');
      expect(text).not.toContain('ART WINDOW');
    }
  });
});

// 각인 다시 새기기(2026-10-25 사용자 요청 — 메이플스토리 큐브처럼 +6~+9 각인을 한 칸씩 무작위로 바꾼다)
describe('각인 다시 새기기', () => {
  const marks4 = ['refine', 'flow', 'calm', 'first'].filter((id) => engravingAllowed(data, { uid: 'x', cardId: epic.id, level: max + 1 }, data.forge.engravings.find((m) => m.id === id)!));
  const campaign = (seed: string, marks: string[]) => {
    const run = createRunAt(data, seed, 's3');
    run.collection[epic.id] = max + marks.length;
    run.engravings = { [epic.id]: [...marks] };
    run.deck.push({ uid: 'c1', cardId: epic.id, level: max + marks.length, marks: [...marks] }, { uid: 'c2', cardId: epic.id, level: max + marks.length, marks: [...marks] });
    run.shop = openShop(data, run, 'n1-0');
    run.gold = f.rerollPrice * 3;
    return run;
  };

  it('각인이 있는 카드만 후보(캠페인은 같은 카드 한 장), 값은 rerollPrice', () => {
    expect(f.rerollPrice).toBe(100);
    const run = campaign('ROLL1', marks4);
    run.deck.push({ uid: 'p', cardId: epic.id === rare.id ? 'x' : rare.id, level: max });
    expect(rerollCandidates(data, run).map((c) => c.uid)).toEqual(['c1']);
  });

  it('한 칸만 다른 각인으로 바뀌고, 다른 칸·같은 카드의 덱 인스턴스·보유 각인이 함께 따라간다. 골드를 낸다', () => {
    const run = campaign('ROLL2', marks4);
    const r = rerollEngraving(data, run, 'c1', 1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.from).toBe(marks4[1]);
    expect(r.to).not.toBe(marks4[1]);
    expect(marks4).not.toContain(r.to);
    const next = [...marks4];
    next[1] = r.to;
    expect(run.engravings![epic.id]).toEqual(next);
    expect(run.deck.filter((c) => c.cardId === epic.id).map((c) => c.marks)).toEqual([next, next]);
    expect(run.gold).toBe(f.rerollPrice * 2);
    expect(r.message).toContain(`+${max + 2}`);
  });

  it('후보는 그 칸을 뺀 모습으로 받을 수 있는 각인(다른 칸 것·지금 것은 빼고)', () => {
    const inst = { uid: 'x', cardId: epic.id, level: max + marks4.length, marks: marks4 };
    for (let slot = 0; slot < marks4.length; slot++) {
      const pool = rerollPool(data, inst, slot);
      expect(pool.length).toBeGreaterThan(0);
      for (const id of pool) expect(marks4).not.toContain(id);
    }
  });

  it('여러 번 굴리면 다른 결과도 나오고, 같은 시드·횟수면 같은 결과다. 골드가 모자라면·고를 각인이 남았으면 못 한다', () => {
    const a = campaign('ROLL3', marks4);
    const b = campaign('ROLL3', marks4);
    const seq = (run: ReturnType<typeof campaign>) => [0, 1, 2].map(() => (rerollEngraving(data, run, 'c1', 0) as { to: string }).to);
    const sa = seq(a);
    expect(seq(b)).toEqual(sa);
    expect(a.gold).toBe(0);
    expect(rerollEngraving(data, a, 'c1', 0).ok).toBe(false);
    const c = campaign('ROLL4', marks4);
    c.forgePending = { uid: 'c1', cardId: epic.id, level: max + 1, choices: ['refine'] };
    expect(rerollEngraving(data, c, 'c1', 0)).toEqual({ ok: false, reason: '먼저 각인을 고른다' });
    expect(rerollEngraving(data, campaign('ROLL5', marks4), 'c1', marks4.length).ok).toBe(false);
  });

  it('심연: 그 카드 한 장의 각인만 바뀐다', () => {
    const run = createAbyssRun(data, 'ROLLA', { mates: ['elia', 'kyle', 'born'], paths: pathOffer(data, 'ROLLA').slice(0, pathPicks(data, 3).picks), pool: {} });
    run.deck.push({ uid: 'a1', cardId: epic.id, level: max + 2, marks: marks4.slice(0, 2) }, { uid: 'a2', cardId: epic.id, level: max + 2, marks: marks4.slice(0, 2) });
    run.shop = openShop(data, run, 'n1-0');
    run.gold = f.rerollPrice;
    const r = rerollEngraving(data, run, 'a1', 0);
    expect(r.ok).toBe(true);
    expect(run.deck.find((c) => c.uid === 'a1')!.marks![0]).not.toBe(marks4[0]);
    expect(run.deck.find((c) => c.uid === 'a2')!.marks).toEqual(marks4.slice(0, 2));
  });
});

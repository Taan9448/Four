// 대강화 +6~+10(심연 개편 5단계, GAME_DESIGN 16절 ⑦)
import { describe, expect, it } from 'vitest';
import { createAbyssRun, pathOffer, pathPicks } from '../src/engine/abyss';
import { buyForge, forgeCandidates, forgeChance, openShop } from '../src/engine/economy';
import { createRunAt } from '../src/engine/run';
import { forgeMax, resolveCard } from '../src/engine/state';
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

  it('+6 수치 ×1.2 · +7 비용 −1 · +8 유지 · +9 효과 두 번 · +10 각성', () => {
    const five = at(epic.id, max);
    const amt = (lv: number) => at(epic.id, lv).baseEffects[0].amount!;
    expect(amt(max + 1)).toBe(Math.round(amt(max) * f.numberMul));
    expect(at(epic.id, max + 1).cost).toEqual(five.cost);
    expect(at(epic.id, max + 2).cost.neigong).toBe(five.cost.neigong - 1);
    expect(at(epic.id, max + 3).keywords).toContain('retain');
    const nine = at(epic.id, max + 4);
    expect(nine.effects).toHaveLength(nine.baseEffects.length * 2 + nine.skills.flatMap((s) => s.effects).length * 2);
    const ten = at(epic.id, max + 5);
    expect(ten.keywords).toContain('innate');
    expect(ten.keywords).not.toContain('exhaust');
    expect(amt(max + 5)).toBe(Math.round(amt(max) * f.numberMul * f.awakenMul));
    expect(cardText(data, { uid: 'x', cardId: epic.id, level: max + 5 })).toContain('★각성');
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
    const seq = (run: ReturnType<typeof make>) => Array.from({ length: 20 }, () => buyForge(data, run, 'forge-b')).map((r) => r.ok && r.success);
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
    expect(run.collection[epic.id]).toBe(max + 1);
    expect(run.deck.filter((c) => c.cardId === epic.id).every((c) => c.level === max + 1)).toBe(true);
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

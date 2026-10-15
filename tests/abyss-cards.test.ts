// 심연 개편 3(2026-10-15, GAME_DESIGN 16절 '심연 개편' ⑤): 체력 비율 피해·방어·회복(엘리트·보스 절반) · 처형 · 고유
import { describe, expect, it } from 'vitest';
import { playCard } from '../src/engine/battle';
import { abyssAddCard, abyssRewardOptions, createAbyssRun, pathOffer, pathPicks, riftCards } from '../src/engine/abyss';
import { cardText } from '../src/engine/text';
import { battle, data, give } from './helpers';

const half = data.balance.hpRatio.eliteBossMul;

describe('체력 비율 효과', () => {
  it('% 피해: 일반 적은 최대 체력의 그대로, 엘리트·보스는 절반(기본 피해는 그대로 더한다)', () => {
    const s = battle({ enemies: ['test_rock', 'test_ember_boss'] });
    const [rock, boss] = s.enemies;
    playCard(s, give(s, 'abyss_common_seam_pierce'), rock.uid);
    expect(rock.maxHp - rock.hp).toBe(30 + Math.floor(0.05 * rock.maxHp));
    s.neigong = 10;
    playCard(s, give(s, 'abyss_common_seam_pierce'), boss.uid);
    expect(boss.maxHp - boss.hp).toBe(30 + Math.floor(0.05 * boss.maxHp * half));
  });

  it('% 방어: 가장 큰 적의 최대 체력 기준(그 적이 보스면 절반)', () => {
    const s = battle({ party: [{ id: 'haun', hp: 600, maxHp: 600 }, { id: 'born', hp: 600, maxHp: 700 }], enemies: ['test_rock', 'test_ember_boss'] });
    const born = s.party.find((p) => p.defId === 'born')!;
    playCard(s, give(s, 'abyss_born_mountain_measure'));
    expect(born.block).toBe(Math.floor(0.05 * 2000 * half));
  });

  it('% 회복: 아군 최대 체력 기준(아군에게는 절반이 없다)', () => {
    const s = battle({ enemies: ['test_rock'] });
    const haun = s.party[0];
    haun.hp = 100;
    playCard(s, give(s, 'abyss_common_deep_breath'), haun.uid);
    expect(haun.hp).toBe(100 + Math.floor(0.15 * haun.maxHp));
  });

  it('처형: 체력이 20% 이하면 처치, 엘리트·보스는 10% 이하. 문턱 위면 남는다', () => {
    const s = battle({ enemies: ['test_rock'] });
    const rock = s.enemies[0];
    rock.hp = 150; // 피해 60 뒤 90 ≤ 600 × 20%
    playCard(s, give(s, 'abyss_haun_last_grain'), rock.uid);
    expect(rock.downed).toBe(true);

    const b = battle({ enemies: ['test_ember_boss'] });
    const boss = b.enemies[0];
    boss.hp = 270; // 피해 60 뒤 210 > 2000 × 10%
    playCard(b, give(b, 'abyss_haun_last_grain'), boss.uid);
    expect(boss.downed).toBe(false);
    expect(boss.hp).toBe(210);
    boss.hp = 260; // 피해 60 뒤 200 ≤ 200
    b.neigong = 10;
    playCard(b, give(b, 'abyss_haun_last_grain'), boss.uid);
    expect(boss.downed).toBe(true);
  });

  it('카드 글: 비율과 엘리트·보스 절반, 처형 문턱을 보인다', () => {
    expect(cardText(data, 'abyss_common_seam_pierce')).toContain('대상 최대 체력의 5%, 엘리트·보스 절반');
    expect(cardText(data, 'abyss_born_mountain_measure')).toContain('가장 큰 적 최대 체력의 5%');
    expect(cardText(data, 'abyss_common_deep_breath')).toContain('최대 체력의 15%');
    expect(cardText(data, 'abyss_haun_last_grain')).toContain('체력이 20% 이하인 적 처형(엘리트·보스 10%)');
    expect(cardText(data, 'abyss_haun_last_grain')).toContain('[고유]');
  });
});

describe('심연 카드 25장 · 고유', () => {
  const start = (seed: string) => createAbyssRun(data, seed, { mates: ['elia', 'kyle', 'born'], paths: pathOffer(data, seed).slice(0, pathPicks(data, 3).picks), pool: {} });

  it('체력 비율 카드 10장(모두 고유) · 처형 1장 · 등급 일반 5·고급 6·희귀 6·영웅 5·전설 3, 업적 없이 열려 있다', () => {
    const fresh = [...data.cards.values()].filter((c) => c.pool === 'abyss' && c.id.match(/seam_pierce|grain_split|red_measure|frost_heart|landslide|_maw$|last_grain|mountain_measure|moon_veil|deep_breath|fog_cleave|unmoved_split|law_reading|clear_air|thornburn|star_path|quick_read|iron_peel|beat_the_clock|red_line|stand_firm|unshaken|iron_wall|_lantern|oathbreak/));
    expect(fresh.length).toBe(25);
    const ratio = fresh.filter((c) => c.effects.some((e) => e.scale?.per === 'targetMaxHp' || e.scale?.per === 'enemyMaxHp' || e.op === 'execute'));
    expect(ratio.length).toBe(10);
    expect(ratio.every((c) => c.keywords.includes('unique'))).toBe(true);
    const count = (r: string) => fresh.filter((c) => c.rarity === r).length;
    expect(['common', 'uncommon', 'rare', 'epic', 'legendary'].map(count)).toEqual([5, 6, 6, 5, 3]);
    const run = start('AC1');
    for (const c of fresh) expect(run.abyss!.unlocked).toContain(c.id);
    expect(riftCards(data).length).toBe(75);
  });

  it('고유: 덱에 든 고유 카드는 보상에 다시 나오지 않고, 두 번째로 넣으려 하면 넣지 않는다', () => {
    const run = start('AC2');
    const id = 'abyss_common_seam_pierce';
    abyssAddCard(data, run, id);
    expect(abyssAddCard(data, run, id)).toContain('고유');
    expect(run.deck.filter((c) => c.cardId === id).length).toBe(1);
    for (let i = 0; i < 200; i++) expect(abyssRewardOptions(data, run, `n${i}`, 'battle')).not.toContain(id);
  });
});

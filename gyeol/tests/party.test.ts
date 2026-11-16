// 고를 수 있는 인물(2026-11-11): 합류·덮어쓰기·기술·인물별 기록 키·그림
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import realRaw from '../data/duel.json';
import storyRaw from '../data/story.json';
import { advance, createDuel, press, type DuelData } from '../src/duel';
import { characterOf, characters, chosen, HAUN, joined, partyOpen, recordKey, techsFor, withCharacter } from '../src/party';
import { emptyStats, normalize } from '../src/save';

const real = realRaw as unknown as DuelData;
const chapterIds = (storyRaw as unknown as { chapters: { id: string }[] }).chapters.map((c) => c.id);

describe('인물 고르기', () => {
  it('진하운과 동료 셋, 동료는 이야기의 한 장을 마치면 합류한다', () => {
    const list = characters(real);
    expect(list.map((c) => c.id)).toEqual(['haun', 'kyle', 'elia', 'born']);
    for (const c of list) if (c.joinAfter) expect(chapterIds).toContain(c.joinAfter);
    expect(partyOpen(real, [])).toBe(false);
    expect(partyOpen(real, ['prologue', 'ch1', 'ch2'])).toBe(true);
    expect(chosen(real, 'kyle', ['prologue'])).toBe(HAUN);
    expect(chosen(real, 'kyle', ['ch2'])).toBe('kyle');
    expect(joined(characterOf(real, 'haun')!, [])).toBe(true);
  });

  it('인물 그림(대기·공격·피격)이 있다', () => {
    for (const c of characters(real)) for (const a of ['idle', 'attack', 'hit']) expect(existsSync(`assets/sprites/${c.sprite}_${a}/meta.json`), `${c.sprite}_${a}`).toBe(true);
  });

  it('진하운은 그대로, 동료는 진하운 기준 값을 덮어쓴다(강베기는 필드별)', () => {
    expect(withCharacter(real, HAUN)).toBe(real);
    const k = withCharacter(real, 'kyle');
    expect(k.player.name).toBe('카일 로웬');
    expect(k.player.hp).toBe(130);
    expect(k.player.heavy!.damageMul).toBe(2.8);
    expect(k.player.heavy!.hitAt).toBe(real.player.heavy!.hitAt);
    expect(k.rules.guardChip).toBe(0.1);
    expect(k.rules.counterMul).toBe(real.rules.counterMul);
    expect(withCharacter(real, 'elia').rules.perfect).toBeGreaterThan(real.rules.perfect);
    expect(withCharacter(real, 'born').rules.parryPostureMul).toBeGreaterThan(real.rules.parryPostureMul);
  });

  it('기술(2026-11-14 셋 → 2026-11-15 다섯): 장 규칙이 연 자리(1~5)를 동료도 같은 자리로 따른다', () => {
    expect(techsFor(real, HAUN, ['nakun'])).toEqual(['nakun']);
    expect(techsFor(real, HAUN, undefined)).toEqual(['nakun', 'byeogun', 'cheongun_chulsu', 'unhae', 'cheonoe_gwiun']);
    expect(techsFor(real, 'kyle', ['nakun'])).toEqual(['shield_rush']);
    expect(techsFor(real, 'elia', ['nakun', 'byeogun'])).toEqual(['mana_rain', 'frost_ward']);
    expect(techsFor(real, 'born', ['nakun', 'byeogun', 'unhae'])).toEqual(['earth_quake', 'mountain_cleave', 'cliff_fall']);
    expect(techsFor(real, 'elia', ['nakun', 'byeogun', 'cheongun_chulsu', 'unhae', 'cheonoe_gwiun'])).toEqual(['mana_rain', 'frost_ward', 'frost_bloom', 'violet_bolt', 'starfall']);
    expect(techsFor(real, 'kyle', [])).toEqual([]);
    // 기술마다 자리·주인이 있고, 인물마다 1~5 자리가 하나씩
    for (const c of ['haun', 'kyle', 'elia', 'born']) {
      const own = real.techs.filter((t) => t.owner === c);
      expect(own.map((t) => t.slot).sort(), c).toEqual([1, 2, 3, 4, 5]);
    }
  });

  it('엘리아 마력 구슬 반격: 받으면 틈 대신 구슬이 쌓이고, 베면 구슬을 쏘아 막히지 않는 반격', () => {
    const foe = real.foes.find((f) => f.id === 'inner_senior')!;
    const d = createDuel(withCharacter(real, 'elia'), foe.id, 'orb');
    // 첫 공격을 타격 직전에 받는다
    let parried = false;
    for (let t = 0; t < 12000 && !parried; t += 5) {
      advance(d, t);
      if (d.foe.state === 'windup' && d.foe.fakeAt === null && d.foe.hitAt - d.t <= 20 && d.foe.hitAt - d.t > 0) {
        press(d, 'parry', d.t);
        advance(d, d.foe.hitAt + 1);
        parried = d.events.some((e) => e.type === 'parry');
      }
    }
    expect(parried).toBe(true);
    expect(d.orbs).toBeGreaterThan(0);
    // 틈은 열리지 않았다
    expect(d.openingUntil).toBeLessThan(d.t);
    const orbs = d.orbs;
    press(d, 'attack', d.t);
    advance(d, d.t + 400);
    const strike = d.events.find((e) => e.type === 'strike') as { counter: boolean; orbs?: number } | undefined;
    expect(strike?.counter).toBe(true);
    expect(strike?.orbs).toBe(orbs);
    expect(d.orbs).toBe(0);
  });

  it('기술 조건이 인물마다 다르다(2026-11-14): 카일 막아 낸 수 · 엘리아 PERFECT · 보른 체간 깎기', () => {
    const foe = real.foes.find((f) => f.id === 'inner_senior')!;
    // 매 공격을 타격 20ms 전에 받는다(PERFECT), 기술이 준비될 때까지
    const parryUntilTech = (id: string, max = 40) => {
      const d = createDuel(withCharacter(real, id), foe.id, 'cond', 'duel', 'main', { techs: techsFor(real, id, undefined) });
      d.player.hp = 9999;
      let parries = 0;
      for (let t = 0; t < 120000 && !d.techReady && parries < max; t += 5) {
        advance(d, t);
        d.player.hp = 9999;
        if (d.foe.state === 'windup' && d.foe.fakeAt === null && d.foe.hitAt - d.t <= 20 && d.foe.hitAt - d.t > 0 && !d.foeDef.moves[d.foe.move!].unblockable) {
          const before = d.events.filter((e) => e.type === 'parry').length;
          press(d, 'parry', d.t);
          advance(d, d.foe.hitAt + 1);
          if (d.events.filter((e) => e.type === 'parry').length > before) parries++;
        }
      }
      return { d, parries };
    };
    const k = parryUntilTech('kyle');
    expect(k.d.techReady).toBe('shield_rush');
    expect(k.d.defends).toBeGreaterThanOrEqual(6);
    const e = parryUntilTech('elia');
    expect(e.d.techReady).toBe('mana_rain');
    expect(e.d.perfects).toBeGreaterThanOrEqual(3);
    const b = parryUntilTech('born');
    expect(b.d.techReady).toBe('earth_quake');
    expect(b.d.postureDealt).toBeGreaterThanOrEqual(0.6);
  });

  it('하운은 받으면 틈이 열린다(구슬 없음)', () => {
    const foe = real.foes.find((f) => f.id === 'inner_senior')!;
    const d = createDuel(real, foe.id, 'orb');
    for (let t = 0; t < 12000 && !d.events.some((e) => e.type === 'parry'); t += 5) {
      advance(d, t);
      if (d.foe.state === 'windup' && d.foe.fakeAt === null && d.foe.hitAt - d.t <= 20 && d.foe.hitAt - d.t > 0) {
        press(d, 'parry', d.t);
        advance(d, d.foe.hitAt + 1);
      }
    }
    expect(d.orbs).toBe(0);
    expect(d.openingUntil).toBeGreaterThan(d.t);
  });

  it('인물 특성이 판정에 든다: 카일은 이르게 막아도 피해가 적다', () => {
    const foe = real.foes.find((f) => !f.practice && !f.storyOnly)!;
    const hurt = (id: string) => {
      const d = createDuel(withCharacter(real, id), foe.id, 'party');
      // 첫 공격이 시작되면 곧바로 막기(이르게) — 막힌 피해를 잰다
      for (let t = 0; t < 8000 && !d.events.some((e) => e.type === 'guard'); t += 10) {
        advance(d, t);
        if (d.foe.state === 'windup' && d.foe.hitAt - d.t < 380 && d.foe.hitAt - d.t > 200) press(d, 'parry');
      }
      return d.player.hp / d.data.player.hp;
    };
    expect(hurt('kyle')).toBeGreaterThanOrEqual(hurt(HAUN));
  });

  it('기록 키: 진하운은 예전 그대로, 동료는 @인물 · 인물별 기록은 저장에 남는다', () => {
    expect(recordKey('ignis:main', HAUN)).toBe('ignis:main');
    expect(recordKey('ignis:main', 'born')).toBe('ignis:main@born');
    const s = normalize({ character: 'elia', charStats: { elia: { ...emptyStats(), wins: 3 } } });
    expect(s.character).toBe('elia');
    expect(s.charStats.elia.wins).toBe(3);
  });
});

describe('카일 붉은 검(2026-11-16)', () => {
  it('3장을 마치고 붉은 검 그림이 모두 있을 때만 kyle_red', async () => {
    const { spriteFor, characterOf } = await import('../src/party');
    const kyle = characterOf(real, 'kyle')!;
    const all = () => true;
    expect(spriteFor(kyle, (ch) => ch === 'ch3', all)).toBe('kyle_red');
    expect(spriteFor(kyle, () => false, all)).toBe('kyle');
    // 한 동작이라도 없으면 섞이지 않게 은빛 그대로
    expect(spriteFor(kyle, () => true, (id) => id !== 'kyle_red_death')).toBe('kyle');
    expect(spriteFor(characterOf(real, 'elia')!, () => true, all)).toBe('elia');
  });
});

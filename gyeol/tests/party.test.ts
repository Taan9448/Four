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

  it('기술: 진하운은 장 규칙 그대로, 동료는 없다', () => {
    expect(techsFor(real, HAUN, ['nakun'])).toEqual(['nakun']);
    expect(techsFor(real, HAUN, undefined)).toBeUndefined();
    expect(techsFor(real, 'kyle', ['nakun'])).toEqual([]);
    expect(techsFor(real, 'kyle', undefined)).toEqual([]);
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

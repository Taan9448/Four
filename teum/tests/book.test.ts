import { describe as group, expect, it } from 'vitest';
import { bookSummary, describe, matches, presets, RANGED } from '../src/book';
import { LOCKABLE, PASSIVES, RULES, WEAPONS } from '../src/sim';

group('「틈」 무공록 도우미(2026-11-21)', () => {
  it('모든 무공·심법에 설명 줄이 있고, 무공은 수치(Lv.1→5)를 보인다', () => {
    for (const id of [...WEAPONS.keys(), ...PASSIVES.keys()]) {
      const d = describe(id);
      expect(d.name, id).toBeTruthy();
      expect(d.lines.length, id).toBeGreaterThan(0);
    }
    const w = [...WEAPONS.values()].find((x) => x.card && x.evolve && x.element)!;
    const d = describe(w.id);
    expect(d.lines.some((l) => l.includes('→'))).toBe(true);
    expect(d.lines.some((l) => l.includes('각성'))).toBe(true);
    expect(d.lines.some((l) => l.includes('세트'))).toBe(true);
  });

  it('짝 추천: 같은 속성 무공 · 맞는 능력치 심법이 나온다', () => {
    const fire = LOCKABLE.filter((id) => WEAPONS.get(id)?.element === 'fire');
    const m = matches(fire[0], LOCKABLE);
    expect(m.length).toBeGreaterThan(0);
    expect(m.some((id) => WEAPONS.get(id)?.element === 'fire' || PASSIVES.has(id))).toBe(true);
  });

  it('추천 묶음: 다 열려 있으면 세트·탄막·근접·극의 묶음이 나오고 무공록 크기를 넘지 않는다', () => {
    const ps = presets('haun', LOCKABLE);
    const ids = ps.map((p) => p.id);
    for (const k of ['ranged', 'close', 'grand']) expect(ids).toContain(k);
    // 속성 세트 묶음은 그 인물이 쓸 수 있는 같은 속성 무공이 셋 이상일 때만
    expect(ids.some((k) => ['fire', 'ice', 'shock', 'vuln'].includes(k))).toBe(true);
    for (const p of ps) {
      expect(p.ids.length).toBeLessThanOrEqual(RULES.build.bookMax);
      for (const id of p.ids) expect(LOCKABLE).toContain(id);
      if (p.id === 'ranged') for (const id of p.ids) if (WEAPONS.has(id)) expect(RANGED).toContain(WEAPONS.get(id)!.kind);
      // 다른 인물 전용 카드는 넣지 않는다
      for (const id of p.ids) expect(['*', 'haun', undefined]).toContain(WEAPONS.get(id)?.owner);
    }
    // 아무것도 안 열렸으면 묶음 없음
    expect(presets('haun', [])).toEqual([]);
  });

  it('미리 보기: 세트 수 · 멀리/둘레', () => {
    const fire = LOCKABLE.filter((id) => WEAPONS.get(id)?.element === 'fire').slice(0, 3);
    const s = bookSummary(fire);
    expect(s.sets.find((x) => x.name === RULES.sets.fire.name)?.n).toBe(3);
    expect(s.ranged + s.close).toBeGreaterThan(0);
  });
});

group('추천 묶음 구성', () => {
  it('무공이 절반을 넘는다(심법만 잔뜩 들지 않게)', () => {
    for (const h of ['haun', 'kyle', 'elia', 'born']) for (const p of presets(h, LOCKABLE)) expect(p.ids.filter((id) => WEAPONS.has(id)).length, `${h} ${p.id}`).toBeGreaterThanOrEqual(p.ids.length / 2);
  });
});

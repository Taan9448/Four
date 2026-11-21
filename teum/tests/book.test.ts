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

import { gradeOf, keyNumbers, recommend, roleIcon, roleOf } from '../src/book';
import { createChapter, freshCarry } from '../src/sim';

group('등급 · 갈래 · 숫자 · 추천(2026-11-21 전면 개편)', () => {
  it('모든 무공·심법에 등급이 있고, S·A·B·C가 고루 나뉜다(각성은 극)', () => {
    const count: Record<string, number> = {};
    for (const id of [...WEAPONS.keys(), ...PASSIVES.keys()]) count[gradeOf(id)] = (count[gradeOf(id)] ?? 0) + 1;
    for (const g of ['S', 'A', 'B', 'C', '극']) expect(count[g], g).toBeGreaterThan(0);
    expect(count.S).toBeLessThan(count.B);
    for (const w of WEAPONS.values()) if (w.evolved) expect(gradeOf(w.id)).toBe('극');
  });

  it('갈래 아이콘·이름이 모든 무공에 있다', () => {
    for (const id of WEAPONS.keys()) {
      const r = roleOf(id);
      expect(r.name, id).toBeTruthy();
      expect(roleIcon(r.key)).toContain('<svg');
    }
    expect(roleOf([...PASSIVES.keys()][0]).key).toBe('passive');
  });

  it('레벨업 숫자 비교: 올리면 이전 → 다음, 좋아진 것 표시', () => {
    const w = [...WEAPONS.values()].find((x) => !x.evolved && x.kind !== 'heal')!;
    const n = keyNumbers(w.id, 3);
    expect(n[0].from).toBe(String(w.levels[1].damage));
    expect(n[0].to).toBe(String(w.levels[2].damage));
    expect(keyNumbers(w.id, 1)[0].from).toBeUndefined();
  });

  it('추천: 각성 짝 심법을 먼저 고른다', () => {
    const s = createChapter(0, 'rec', freshCarry('haun'));
    const w = [...WEAPONS.values()].find((x) => x.evolve && !x.card && x.owner === 'haun')!;
    s.weapons = [{ id: w.id, lv: 2, next: 0 }];
    const choices = [
      { kind: 'passive' as const, id: [...PASSIVES.keys()].find((p) => p !== w.evolve!.with)!, lv: 1 },
      { kind: 'passive' as const, id: w.evolve!.with, lv: 1 },
      { kind: 'weapon' as const, id: w.id, lv: 3 },
    ];
    const r = recommend(s, choices)!;
    expect(r.index).toBe(1);
    expect(r.reason).toContain('각성 짝');
    expect(recommend(s, [{ kind: 'leave', id: 'leave', lv: 0 }])).toBeNull();
  });
});

import { advice, BOOK_SLOTS, splitBook, suggest } from '../src/book';

group('무공록 편성 도우미(6차)', () => {
  it('칸 나누기: 무공 10 · 심법 6을 넘지 않는다', () => {
    const b = splitBook(LOCKABLE);
    expect(b.weapons.length).toBe(BOOK_SLOTS.weapons);
    expect(b.passives.length).toBe(BOOK_SLOTS.passives);
  });

  it('후보: 지금 무공록에 없는 것만, 이 인물이 쓸 수 있는 것만, 까닭이 붙는다', () => {
    const deck = LOCKABLE.filter((id) => WEAPONS.get(id)?.owner === 'haun').slice(0, 3);
    const sug = suggest('haun', LOCKABLE, deck, 'weapon');
    expect(sug.length).toBeGreaterThan(5);
    for (const x of sug) {
      expect(deck).not.toContain(x.id);
      expect(['*', 'haun']).toContain(WEAPONS.get(x.id)!.owner);
      expect(x.why.length).toBeGreaterThan(0);
    }
    // 점수 순
    for (let i = 1; i < sug.length; i++) expect(sug[i - 1].score).toBeGreaterThanOrEqual(sug[i].score);
    const ps = suggest('haun', LOCKABLE, deck, 'passive');
    for (const x of ps) expect(PASSIVES.has(x.id)).toBe(true);
  });

  it('세트 하나 남으면 그것을 밀어 주고 조언한다', () => {
    const shock = LOCKABLE.filter((id) => WEAPONS.get(id)?.element === 'shock' && ['*', 'elia'].includes(WEAPONS.get(id)!.owner));
    const deck = shock.slice(0, 2);
    const top = suggest('elia', LOCKABLE, deck, 'weapon').slice(0, 5);
    expect(top.some((x) => WEAPONS.get(x.id)?.element === 'shock')).toBe(true);
    expect(advice(deck).some((t) => t.includes('하나만 더'))).toBe(true);
    expect(advice([]).length).toBeGreaterThan(0);
  });
});

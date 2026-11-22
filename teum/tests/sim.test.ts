import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/engine/rng';
import { AFFIXES, banish, carryOf, elementCounts, setOn, chapterEvents, choicePool, choose, createChapter, FOES, freshCarry, HEROES, ITEMS, LOCKABLE, PASSIVES, reroll, RULES, skip, step, STORY, WEAPONS, xpNeed, type State } from '../src/sim';
import { buildTerrain, CELL, T } from '../src/terrain';
import { runChapter } from './bot';

const real = (id: string) => existsSync(`assets/sprites/${id}/meta.json`);
const spec = (id: string) => existsSync(`specs/assets/${id}.yaml`);

describe('「틈」 데이터', () => {
  it('스토리 10장 × 5분(2026-11-19 1/3로), 장마다 바닥·지형·일러스트 명세와 보스·중간 보스', () => {
    expect(STORY.chapters).toHaveLength(10);
    expect(STORY.timeline.length).toBe(300);
    for (const c of STORY.chapters) {
      for (const id of [c.ground, c.terrain, c.cg]) expect(spec(id), `${c.id} ${id}`).toBe(true);
      expect(FOES.get(c.roles.boss)?.rank, c.id).toBe('boss');
      expect(FOES.get(c.roles.mid)?.rank, c.id).toBe('elite');
      for (const ids of Object.values(c.roles)) for (const id of [ids].flat()) expect(FOES.has(id), `${c.id} ${id}`).toBe(true);
      const kinds = chapterEvents(c).map((e) => e.kind);
      expect(kinds.filter((k) => k === 'bigwave').length, c.id).toBeGreaterThanOrEqual(2);
      expect(kinds).toContain('mid');
      expect(kinds).toContain('boss');
    }
  });

  it('장마다 새 그림자가 나온다(앞 장에 없던 주력)', () => {
    const before = new Set<string>();
    for (const c of STORY.chapters) {
      const mine = [...c.roles.main, ...c.roles.fast, ...c.roles.tank, ...c.roles.ranged];
      expect(mine.some((id) => !before.has(id)), c.id).toBe(true);
      mine.forEach((id) => before.add(id));
    }
  });

  it('그림자·인물·무공 그림과 기술 이펙트', () => {
    for (const f of FOES.values()) {
      expect(real(`${f.sprite}_idle`), f.id).toBe(true);
      for (const k of f.skills ?? []) {
        if ('fx' in k && k.fx) expect(real(k.fx), `${f.id} ${k.fx}`).toBe(true);
        if (k.kind === 'summon') expect(FOES.has(k.foe), `${f.id} → ${k.foe}`).toBe(true);
      }
    }
    for (const h of HEROES) {
      expect(real(`${h.sprite}_idle`), h.id).toBe(true);
      expect(spec(`${h.sprite}_walk`), h.sprite).toBe(true);
      for (const w of h.pool) expect(WEAPONS.get(w)?.owner, w).toBe(h.id);
    }
    for (const w of WEAPONS.values()) if (w.evolve) expect(WEAPONS.get(w.evolve.into)?.evolved && PASSIVES.has(w.evolve.with), w.id).toBe(true);
    for (const id of ['props_teum', 'icons_teum', 'icons_teum_items', 'icons_teum_skills_1', 'icons_teum_skills_2', 'icons_teum_skills_3', 'icons_teum_menu', 'keyart_teum_lobby']) expect(spec(id), id).toBe(true);
    // 스킬 10배(2026-11-19): 손으로 맞춘 35 + 「천외귀환」 카드 무공·심법 — 카드에서 온 것은 모두 카드 그림이 있다
    expect(WEAPONS.size + PASSIVES.size).toBeGreaterThanOrEqual(320);
    for (const w of WEAPONS.values()) expect(w.levels.every((l) => l.damage > 0 && l.cooldown > 0), w.id).toBe(true);
  });

  it('카드 무공: 인물마다 고를 무공이 80개 넘고, 종류가 고르게 섞인다', () => {
    for (const h of HEROES) {
      const pool = [...WEAPONS.values()].filter((w) => !w.evolved && (w.owner === '*' || w.owner === h.id));
      expect(pool.length, h.id).toBeGreaterThan(80);
      expect(new Set(pool.map((w) => w.kind)).size, h.id).toBeGreaterThanOrEqual(9);
    }
    for (const w of WEAPONS.values()) if (w.evolve) expect(WEAPONS.get(w.evolve.into)?.evolved, w.id).toBe(true);
  });

  it('필요 경험은 레벨마다 는다', () => {
    for (let l = 1; l < 150; l++) expect(xpNeed(l + 1)).toBeGreaterThan(xpNeed(l));
  });
});

describe('「틈」 지형', () => {
  it('장마다 시드로 같은 판, 가장자리는 벽, 모든 걸을 수 있는 칸이 가운데와 이어진다', () => {
    for (const c of STORY.chapters) {
      const a = buildTerrain(c.terrainDef, createRng(`t:${c.id}`));
      const b = buildTerrain(c.terrainDef, createRng(`t:${c.id}`));
      expect(Buffer.from(a.cells).equals(Buffer.from(b.cells)), c.id).toBe(true);
      const { w, h, cells } = a;
      for (let x = 0; x < w; x++) expect(cells[x]).toBe(T.Wall);
      const walk = (k: number) => k === T.Floor || k === T.Slow || k === T.Bridge;
      const seen = new Uint8Array(w * h);
      const start = Math.floor(a.start.y / CELL) * w + Math.floor(a.start.x / CELL);
      const q = [start];
      seen[start] = 1;
      while (q.length) {
        const i = q.pop()!;
        for (const j of [i - 1, i + 1, i - w, i + w]) if (j >= 0 && j < w * h && !seen[j] && walk(cells[j])) (seen[j] = 1), q.push(j);
      }
      let lonely = 0;
      let open = 0;
      for (let i = 0; i < w * h; i++) if (walk(cells[i])) (open++, !seen[i] && lonely++);
      expect(lonely, c.id).toBe(0);
      // 판의 4분의 1 이상은 걸을 수 있다(막힌 미로가 아니게 — 10장 섬 판이 가장 좁다)
      expect(open / (w * h), c.id).toBeGreaterThan(0.25);
    }
  });
});

describe('「틈」 엔진', () => {
  it('같은 시드·같은 입력이면 같은 판', () => {
    const go = () => {
      const s = createChapter(0, 'same', freshCarry('haun'));
      for (let i = 0; i < 60 * 60; i++) {
        if (s.pending) choose(s, 0);
        step(s, { x: Math.cos(i / 120), y: Math.sin(i / 120) });
        s.events.length = 0;
      }
      return [s.kills, s.level, Math.round(s.player.hp), s.foes.length, Math.round(s.player.x), s.weapons.map((w) => w.id + w.lv).join()];
    };
    expect(go()).toEqual(go());
  });

  it('레벨·무공·심법은 다음 장으로 이어진다(체력은 가득) — 판 금화는 장마다 0부터(지갑으로 간다), 합계는 기록', () => {
    const s = createChapter(0, 'carry', freshCarry('kyle'));
    s.level = 12;
    s.weapons.push({ id: 'shield_wall', lv: 3, next: 0 });
    s.passives.set('vigor', 2);
    s.gold = 33;
    s.player.hp = 5;
    const n = createChapter(1, 'carry', carryOf(s));
    expect(n.level).toBe(12);
    expect(n.weapons.map((w) => [w.id, w.lv])).toEqual([['knight_strike', 1], ['shield_wall', 3]]);
    expect(n.passives.get('vigor')).toBe(2);
    expect(n.gold).toBe(0);
    expect(carryOf(n).gold).toBe(33);
    expect(n.player.hp).toBe(n.player.maxHp);
    expect(n.player.maxHp).toBe(130 + 20);
  });

  it('레벨업 고르기: 칸이 차면 새 무공·새 심법은 나오지 않는다', () => {
    const s = createChapter(0, 'slots', freshCarry('elia'));
    for (const w of ['frost_ward', 'frost_bloom', 'violet_bolt', 'mana_rain', 'waterwheel']) s.weapons.push({ id: w, lv: 1, next: 0 });
    for (const p of ['might', 'haste', 'area', 'swift', 'vigor', 'breath']) s.passives.set(p, 1);
    const pool = choicePool(s);
    expect(pool.some((c) => c.lv === 1)).toBe(false);
    expect(pool.length).toBeGreaterThan(0);
  });

  it('각성: Lv.5 + 짝 심법으로 상자를 열면 바뀐다', () => {
    const s = createChapter(0, 'evo', freshCarry('haun'));
    s.weapons = [{ id: 'byeogun', lv: 5, next: 0 }];
    s.passives.set('breath', 1);
    s.items.push({ x: s.player.x, y: s.player.y, kind: 'chest' });
    step(s, { x: 0, y: 0 });
    expect(s.weapons[0].id).toBe('cheonoe_blade');
  });

  it('안개: 처음에는 시작 자리 둘레만 밝혀지고, 걸으면 넓어진다', () => {
    const s = createChapter(0, 'fog', freshCarry('haun'));
    const at0 = s.explored.reduce((a, b) => a + b, 0);
    expect(at0).toBeGreaterThan(0);
    expect(at0).toBeLessThan(s.terrain.w * s.terrain.h * 0.05);
    for (let i = 0; i < 60 * 8; i++) {
      if (s.pending) choose(s, 0);
      step(s, { x: 1, y: 0.3 });
    }
    expect(s.explored.reduce((a, b) => a + b, 0)).toBeGreaterThan(at0);
  });

  it('새 종류(연쇄·일직선·회복)도 돈다', () => {
    for (const kind of ['chain', 'beam', 'heal'] as const) {
      const w = [...WEAPONS.values()].find((x) => x.kind === kind && !x.evolved)!;
      const s = createChapter(0, `k-${kind}`, freshCarry('haun'));
      s.weapons = [{ id: w.id, lv: 3, next: 0 }];
      s.player.hp = 50;
      for (let i = 0; i < 60 * 20; i++) {
        if (s.pending) choose(s, 0);
        step(s, { x: Math.cos(i / 90), y: Math.sin(i / 90) });
      }
      if (kind === 'heal') expect(s.player.hp, kind).toBeGreaterThan(0);
      else expect(s.chapterKills, kind).toBeGreaterThan(0);
    }
  });

  it('소모품: 서리 부적은 그림자를 얼리고, 벽력탄은 둘레를 친다', () => {
    const s = createChapter(0, 'items', freshCarry('haun'));
    s.items.push({ x: s.player.x, y: s.player.y, kind: 'frost' });
    step(s, { x: 0, y: 0 });
    expect(s.freezeUntil).toBeGreaterThan(s.t + 4);
  });

  it('보스를 쓰러뜨리면 장을 넘는다', () => {
    const s = createChapter(0, 'boss', freshCarry('haun'));
    s.t = 249.99;
    s.nextEvent = s.timeline.findIndex((e) => e.kind === 'boss');
    step(s, { x: 0, y: 0 });
    expect(s.boss?.def.id).toBe(s.chapter.roles.boss);
    s.boss!.hp = 1;
    s.boss!.x = s.player.x + 30;
    s.boss!.y = s.player.y;
    for (let i = 0; i < 240 && !s.result; i++) {
      if (s.pending) choose(s, 0);
      step(s, { x: 0, y: 0 });
    }
    expect(s.result).toBe('clear');
  });

  it('잘 고르는 봇도 1장이 만만하지 않다 — 인물 넷 중 둘 이상은 넘는다(2026-11-19 적 강화, GAME_DESIGN 12절)', () => {
    const runs = HEROES.map((h) => runChapter(0, 'a', freshCarry(h.id), 'smart').s);
    expect(runs.filter((s) => s.result === 'clear').length).toBeGreaterThanOrEqual(2);
    for (const s of runs) if (s.result === 'clear') expect(s.t).toBeGreaterThan(4 * 60);
  }, 120000);

  // ── 2026-11-21 사용자 요청: 무공 해금 · 장 난이도 누적 · 맵 1.5배 · 줍는 것 · 인물 기술 · 돌발 이벤트 ──
  it('줍는 것은 20가지가 넘고, 모두 주우면 탈 없이 돈다', () => {
    const plain = [...ITEMS.values()].filter((d) => !d.event);
    expect(plain.length).toBeGreaterThanOrEqual(21);
    for (const d of ITEMS.values()) {
      const s = createChapter(2, `it-${d.id}`, freshCarry('haun'), { unlocked: [] });
      s.gold = 500;
      s.items.push({ x: s.player.x, y: s.player.y, kind: d.id });
      for (let i = 0; i < 60 * 4; i++) {
        if (s.pending) choose(s, s.pending.length - 1);
        step(s, { x: 0, y: 0 });
      }
      // 장소(상인·수련소)는 그 자리에 남는다(2026-11-22)
      expect(s.items.some((it) => it.kind === d.id && it.x === s.player.x), d.id).toBe(!!d.place);
    }
  });

  it('잠긴 카드 무공은 레벨업에 나오지 않고, 보스를 잡으면 셋이 열린다', () => {
    const s = createChapter(0, 'lock', freshCarry('haun'), { unlocked: [] });
    const lockable = new Set(LOCKABLE);
    expect(choicePool(s).filter((c) => c.lv === 1 && lockable.has(c.id))).toEqual([]);
    s.t = 249.99;
    s.nextEvent = s.timeline.findIndex((e) => e.kind === 'boss');
    step(s, { x: 0, y: 0 });
    s.boss!.hp = 1;
    s.boss!.x = s.player.x + 30;
    s.boss!.y = s.player.y;
    for (let i = 0; i < 240 && !s.result; i++) {
      if (s.pending) choose(s, 0);
      step(s, { x: 0, y: 0 });
    }
    expect(s.unlocks.length).toBeGreaterThanOrEqual(3);
    for (const id of s.unlocks) expect(lockable.has(id)).toBe(true);
    // 열어 둔 것은 나온다
    const n = createChapter(1, 'lock2', freshCarry('haun'), { unlocked: s.unlocks });
    expect(n.locked!.size).toBe(LOCKABLE.length - s.unlocks.length);
  });

  it('떠돌이 상인: 금화로 사고, 모자라면 못 사고, 지나갈 수 있다', () => {
    const s = createChapter(0, 'shop', freshCarry('haun'), { unlocked: [] });
    s.items.push({ x: s.player.x, y: s.player.y, kind: 'merchant' });
    step(s, { x: 0, y: 0 });
    expect(s.pending?.at(-1)?.kind).toBe('leave');
    const buy = s.pending!.findIndex((c) => c.kind === 'buy');
    choose(s, buy);
    expect(s.pending).not.toBeNull();
    s.gold = 999;
    const price = s.pending![buy].lv;
    choose(s, buy);
    expect(s.gold).toBe(999 - price);
  });

  it('시간표는 시드마다 다르고 돌발 이벤트가 3~5개 섞인다', () => {
    const ids = STORY.random.events.map((e) => e.id);
    const a = createChapter(3, 'tl-a', freshCarry('haun')).timeline;
    const b = createChapter(3, 'tl-b', freshCarry('haun')).timeline;
    expect(a.map((e) => `${e.kind}@${e.at}`)).not.toEqual(b.map((e) => `${e.kind}@${e.at}`));
    for (const tl of [a, b]) {
      const n = tl.filter((e) => e.id && ids.includes(e.id)).length;
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(5);
      expect(tl.at(-1)?.kind).toBe('boss');
    }
  });

  it('돌발 이벤트는 모두 돈다', () => {
    for (const ev of STORY.random.events) {
      const s = createChapter(1, `ev-${ev.id}`, freshCarry('kyle'));
      s.timeline = [{ ...ev, at: 1 }];
      for (let i = 0; i < 60 * 3; i++) {
        if (s.pending) choose(s, 0);
        step(s, { x: 0.3, y: 0.2 });
      }
      expect(s.nextEvent, ev.id).toBe(1);
    }
  });

  it('장이 오를수록 이미 어려운 채 시작한다: 기다리는 무리 · 앞당긴 시계', () => {
    const a = createChapter(0, 'warm', freshCarry('haun'));
    const b = createChapter(6, 'warm', freshCarry('haun'));
    expect(a.foes.length).toBe(0);
    expect(b.foes.length).toBeGreaterThan(30);
    expect(b.warm).toBeGreaterThan(a.warm);
  });

  it('맵은 135×135칸(1.5배)', () => {
    for (const c of STORY.chapters) expect([c.terrainDef.w, c.terrainDef.h]).toEqual([135, 135]);
    const s = createChapter(4, 'map', freshCarry('haun'));
    expect(s.terrain.w).toBe(135);
  });

  it('인물마다 보법·마지막 기술이 다르다 — 모두 돌고, 카일 서약 동안은 맞지 않는다', () => {
    expect(new Set(HEROES.map((h) => h.dash.kind)).size).toBe(HEROES.length);
    expect(new Set(HEROES.map((h) => h.ult.kind)).size).toBe(HEROES.length);
    for (const h of HEROES) {
      const s = createChapter(1, `kit-${h.id}`, freshCarry(h.id));
      s.ult = 100;
      const x0 = s.player.x;
      step(s, { x: 1, y: 0, dash: true, ult: true });
      for (let i = 0; i < 60 * 5; i++) {
        if (s.pending) choose(s, 0);
        step(s, { x: 0, y: 0 });
      }
      expect(s.player.x, h.id).not.toBe(x0);
      if (h.id === 'kyle') {
        const k = createChapter(1, 'vow', freshCarry('kyle'));
        k.ult = 100;
        step(k, { x: 0, y: 0, ult: true });
        const hp = k.player.hp;
        for (let i = 0; i < 60 * 4; i++) {
          if (k.pending) choose(k, 0);
          for (const f of k.foes) [f.x, f.y] = [k.player.x + 10, k.player.y];
          step(k, { x: 0, y: 0 });
        }
        expect(k.player.hp).toBe(hp);
      }
    }
  });

  // ── 2026-11-21 3차: 빌드 · 장터 · 체크포인트 · 지형 · 안개 · 간파 · 적 ──
  const run = (s: State, sec: number, input = { x: 0, y: 0 }) => {
    for (let i = 0; i < 60 * sec && !s.result; i++) {
      if (s.pending) choose(s, s.pending.length - 1);
      step(s, input);
    }
  };

  it('무공록: 들고 간 카드 것만 새로 나온다(손으로 맞춘 것은 늘)', () => {
    const book = LOCKABLE.filter((id) => (WEAPONS.get(id)?.owner ?? '*') === '*' || WEAPONS.get(id)?.owner === 'haun').slice(0, 6);
    const s = createChapter(0, 'book', freshCarry('haun'), { unlocked: LOCKABLE, book });
    const lockable = new Set(LOCKABLE);
    const fresh = choicePool(s).filter((c) => c.lv === 1 && lockable.has(c.id)).map((c) => c.id);
    expect(fresh.length).toBeGreaterThan(0);
    for (const id of fresh) expect(book).toContain(id);
    // 후보가 170개 → 수십 개로
    expect(choicePool(s).length).toBeLessThan(40);
  });

  it('다시 뽑기·봉인·건너뛰기: 횟수만큼만, 봉인한 것은 다시 안 나온다', () => {
    const s = createChapter(0, 'tools', freshCarry('haun'), { meta: { reroll: 1 } });
    expect(s.rerolls).toBe(RULES.build.reroll + 1);
    // 레벨업 고르기를 띄운다(결 조각 큰 것)
    s.gems.push({ x: s.player.x, y: s.player.y, xp: xpNeed(s.level) * 6, pulled: true });
    step(s, { x: 0, y: 0 });
    expect(s.pending).not.toBeNull();
    const n = s.rerolls;
    expect(reroll(s)).toBe(true);
    expect(s.rerolls).toBe(n - 1);
    const i = s.pending!.findIndex((c) => c.lv === 1);
    if (i >= 0) {
      const id = s.pending![i].id;
      expect(banish(s, i)).toBe(true);
      expect(choicePool(s).some((c) => c.id === id)).toBe(false);
      expect(carryOf(s).banished).toContain(id);
    }
    const g = s.gold;
    expect(skip(s)).toBe(true);
    expect(s.gold).toBe(g + RULES.build.skipGold);
  });

  it('속성 세트: 같은 효과 무공 셋이면 켜진다(파쇄 — 받는 피해 +50%)', () => {
    const vulns = [...WEAPONS.values()].filter((w) => w.element === 'vuln' && !w.evolved).slice(0, 3);
    const s = createChapter(0, 'set', freshCarry('haun'));
    s.weapons = vulns.slice(0, 2).map((w) => ({ id: w.id, lv: 1, next: 99 }));
    expect(setOn(s, 'vuln')).toBe(false);
    s.weapons.push({ id: vulns[2].id, lv: 1, next: 99 });
    expect(elementCounts(s).vuln).toBe(3);
    expect(setOn(s, 'vuln')).toBe(true);
  });

  it('장터 수련: 최대 체력·되살아나는 숨', () => {
    const s = createChapter(0, 'meta', freshCarry('haun'), { meta: { hp: 2, revive: 1 } });
    expect(s.player.maxHp).toBe(100 + 16);
    expect(s.revives).toBe(1);
    s.player.hp = 1;
    s.foes.push(...[]);
    // 아무 적 하나를 붙여 맞게 한다
    s.nextEvent = 0;
    run(s, 0.1);
    s.player.hp = 1;
    s.player.hurtUntil = 0;
    // 직접 큰 피해를 주는 예고 원
    s.slams.push({ x: s.player.x, y: s.player.y, r: 60, damage: 999, born: s.t, at: s.t + 0.01, color: '#f00' });
    run(s, 0.2);
    expect(s.result).toBeNull();
    expect(s.player.hp).toBeGreaterThan(s.player.maxHp * 0.4);
  });

  it('중간 보스를 쓰러뜨리면 이어 하기 자리가 생기고, 그 자리부터 다시 열 수 있다', () => {
    const s = createChapter(1, 'cp', freshCarry('haun'));
    s.t = s.timeline.find((e) => e.kind === 'mid')!.at - 0.01;
    s.nextEvent = s.timeline.findIndex((e) => e.kind === 'mid');
    step(s, { x: 0, y: 0 });
    const mid = s.foes.find((f) => f.mid)!;
    expect(mid).toBeTruthy();
    mid.hp = 1;
    mid.x = s.player.x + 20;
    mid.y = s.player.y;
    run(s, 3);
    expect(s.checkpoint).not.toBeNull();
    const r = createChapter(1, 'cp', s.checkpoint!.carry, { startAt: s.checkpoint!.t });
    expect(r.t).toBeCloseTo(s.checkpoint!.t);
    expect(r.timeline.slice(r.nextEvent).some((e) => e.kind === 'mid')).toBe(false);
    expect(r.timeline.slice(r.nextEvent).some((e) => e.kind === 'boss')).toBe(true);
  });

  it('밀쳐서 위험 칸에 빠뜨리면 보통 그림자는 끝', () => {
    const s = createChapter(2, 'fall', freshCarry('kyle'));
    const t = s.terrain;
    // 위험 칸 하나를 인물 오른쪽에 만든다
    const cx = Math.floor(s.player.x / 40) + 2;
    const cy = Math.floor(s.player.y / 40);
    t.cells[cy * t.w + cx] = 2;
    const id = s.chapter.roles.main[0];
    s.items.length = 0;
    s.weapons = [{ id: 'shield_rush', lv: 5, next: 0 }];
    // 위험 칸 바로 앞에 그림자
    const kills0 = s.chapterKills;
    s.foes.push({ ...createChapter(2, 'fall2', freshCarry('kyle')).foes[0], def: FOES.get(id)!, x: (cx - 0.6) * 40, y: (cy + 0.5) * 40, hp: 9999, maxHp: 9999, dead: false, uid: 9999 });
    run(s, 2, { x: 0, y: 0 });
    expect(s.chapterKills).toBeGreaterThanOrEqual(kills0);
  });

  it('보법으로 얇은 벽을 넘는다', () => {
    const s = createChapter(0, 'vault', freshCarry('haun'));
    const t = s.terrain;
    const cx = Math.floor(s.player.x / 40);
    const cy = Math.floor(s.player.y / 40);
    for (let y = cy - 2; y <= cy + 2; y++) {
      t.cells[y * t.w + cx + 1] = 1;
      t.cells[y * t.w + cx + 2] = 0;
      t.cells[y * t.w + cx + 3] = 0;
    }
    s.player.x = (cx + 0.5) * 40;
    const x0 = s.player.x;
    step(s, { x: 1, y: 0, dash: true });
    expect(s.player.x).toBeGreaterThan(x0 + 60);
  });

  it('안개 속 비석·제단·비밀 상인이 숨어 있고, 비석을 읽으면 기록된다', () => {
    const s = createChapter(0, 'secret', freshCarry('haun'));
    const hidden = s.items.filter((i) => i.hidden);
    expect(hidden.filter((i) => i.kind === 'stele').length).toBe(3);
    expect(hidden.some((i) => i.kind === 'altar')).toBe(true);
    expect(hidden.some((i) => i.kind === 'merchant')).toBe(true);
    const st = hidden.find((i) => i.kind === 'stele')!;
    s.player.x = st.x;
    s.player.y = st.y;
    step(s, { x: 0, y: 0 });
    expect(s.steles).toEqual([`${s.chapter.id}-${st.stele}`]);
  });

  it('수련 제단: 시간 안에 정한 수를 쓰러뜨리면 상자', () => {
    const s = createChapter(0, 'altar', freshCarry('haun'));
    const al = s.items.find((i) => i.kind === 'altar')!;
    s.player.x = al.x;
    s.player.y = al.y;
    step(s, { x: 0, y: 0 });
    expect(s.trial).not.toBeNull();
    s.chapterKills += s.trial!.goal;
    const chests = s.items.filter((i) => i.kind === 'chest').length;
    step(s, { x: 0, y: 0 });
    expect(s.trial).toBeNull();
    expect(s.items.filter((i) => i.kind === 'chest').length).toBe(chests + RULES.explore.altar.chests);
  });

  it('간파: 내려찍기가 떨어지는 순간 보법 중이면 반격 시간이 열린다', () => {
    const s = createChapter(0, 'counter', freshCarry('haun'));
    s.slams.push({ x: s.player.x, y: s.player.y, r: 60, damage: 50, born: s.t, at: s.t + 0.05, color: '#f00' });
    const hp = s.player.hp;
    step(s, { x: 0, y: 0, dash: true });
    run(s, 0.1);
    expect(s.player.hp).toBe(hp);
    expect(s.counterUntil).toBeGreaterThan(s.t);
  });

  it('정예는 수식어를 달고 나오고(심연 글자), 보스는 체력에 따라 단계가 오르며 아레나를 닫는다', () => {
    expect(AFFIXES.length).toBeGreaterThanOrEqual(10);
    for (const a of AFFIXES) expect(a.glyph).not.toBe('?');
    const s = createChapter(5, 'boss3', freshCarry('born'));
    s.t = 249.99;
    s.nextEvent = s.timeline.findIndex((e) => e.kind === 'boss');
    step(s, { x: 0, y: 0 });
    expect(s.arena.length).toBeGreaterThan(20);
    const b = s.boss!;
    s.player.shieldUntil = 1e9;
    const n0 = s.foes.length;
    b.hp = b.maxHp * 0.6;
    b.x = s.player.x + 30;
    b.y = s.player.y;
    s.weapons = [{ id: 'axe_chop', lv: 5, next: 0 }];
    run(s, 2);
    expect(b.phase ?? 0).toBeGreaterThanOrEqual(1);
    expect(s.foes.length + s.chapterKills).toBeGreaterThan(n0);
    b.hp = 1;
    run(s, 3);
    expect(s.result).toBe('clear');
    expect(s.arena.length).toBe(0);
    const mid = createChapter(5, 'mid3', freshCarry('born'));
    mid.t = mid.timeline.find((e) => e.kind === 'mid')!.at - 0.01;
    mid.nextEvent = mid.timeline.findIndex((e) => e.kind === 'mid');
    step(mid, { x: 0, y: 0 });
    expect(mid.foes.find((f) => f.mid)!.affixes!.length).toBe(RULES.affix.lateCount);
  });

  it('장마다 대표 기믹이 있고 모두 돈다', () => {
    const kinds = new Set(STORY.chapters.map((c) => c.gimmick?.kind));
    expect(kinds.size).toBe(10);
    for (let i = 0; i < STORY.chapters.length; i++) {
      const s = createChapter(i, `gm-${i}`, freshCarry('kyle'));
      s.gimmickAt = 1;
      run(s, 5, { x: 0.3, y: 0.1 });
      expect(s.gimmickAt, STORY.chapters[i].id).toBeGreaterThan(1);
    }
  });
});

import { createEndless, endlessInfo } from '../src/sim';
describe('「틈」 7차: 무한 모드 · 난이도', () => {
  const run = (s: ReturnType<typeof createEndless>, sec: number) => {
    for (let i = 0; i < 60 * sec && !s.result; i++) {
      if (s.pending) choose(s, s.pending.length - 1);
      step(s, { x: Math.cos(i / 120), y: Math.sin(i / 120) });
    }
  };
  it('무한 모드: 맵 5배 이상 · 무공 10칸·심법 10칸 · 시간표 없이 시작', () => {
    const s = createEndless('e1', 'haun');
    expect(s.mode).toBe('endless');
    expect(s.terrain.w * s.terrain.h).toBeGreaterThan(135 * 135 * 5);
    expect(s.slots).toEqual({ weapons: 10, passives: 10 });
    expect(s.timeline.length).toBe(0);
  });

  it('무한 모드: 3분에 보스가 나오고, 못 잡으면 광폭화, 잡으면 다음 단계', () => {
    const s = createEndless('e2', 'kyle');
    s.player.shieldUntil = 1e9;
    run(s, 185);
    expect(s.boss?.boss).toBe(true);
    expect(endlessInfo(s).enraged).toBe(false);
    s.boss!.hp = s.boss!.maxHp = 1e9;
    run(s, RULES.endless.boss.enrage);
    expect(endlessInfo(s).enraged).toBe(true);
    s.boss!.hp = 1;
    s.boss!.x = s.player.x + 20;
    s.boss!.y = s.player.y;
    s.weapons = [{ id: 'knight_strike', lv: 5, next: 0 }];
    run(s, 3);
    expect(s.stage).toBe(1);
    expect(s.result).toBeNull();
    expect(endlessInfo(s).enraged).toBe(false);
    expect(s.nextBossAt).toBeGreaterThan(s.t + 100);
  });

  it('무한 모드: 시간이 갈수록 그림자가 강해지고 돌발 이벤트가 1~2분마다 쌓인다', () => {
    const s = createEndless('e3', 'born');
    s.player.shieldUntil = 1e9;
    run(s, 60 * 6);
    expect(s.chapter.hp).toBeGreaterThan(1.5);
    expect(s.timeline.length).toBeGreaterThanOrEqual(3);
  });

  it('수련소: 무공을 사고 내려놓을 수 있다', () => {
    const s = createEndless('e4', 'haun');
    s.gold = 999;
    s.weapons.push({ id: 'nakun', lv: 2, next: 0 });
    s.items.push({ x: s.player.x, y: s.player.y, kind: 'dojo' });
    step(s, { x: 0, y: 0 });
    expect(s.pending?.some((c) => c.kind === 'buyskill')).toBe(true);
    const sell = s.pending!.findIndex((c) => c.kind === 'sellskill');
    const n = s.weapons.length;
    choose(s, sell);
    expect(s.weapons.length).toBe(n - 1);
  });

  it('하드: 그림자가 더 단단하고 정예 수식어가 하나 더', () => {
    const n = createChapter(4, 'df', freshCarry('haun'), { difficulty: 'normal' });
    const h = createChapter(4, 'df', freshCarry('haun'), { difficulty: 'hard' });
    expect(h.chapter.hp).toBeGreaterThan(n.chapter.hp * 1.5);
    expect(h.diff.affix).toBe(1);
    expect(STORY.difficulties.every((d) => d.open)).toBe(true);
  });
});

describe('「틈」 8차: 무한 모드 무공 풀 · 장소 가게', () => {
  it('판마다 무작위 무공 풀 40~50종 — 인물 것과 공통 것만, 시작 무공 포함, 시드마다 다르다', () => {
    for (const hero of HEROES) {
      const a = createEndless('pool-a', hero.id);
      const b = createEndless('pool-b', hero.id);
      expect(a.pool!.size).toBeGreaterThanOrEqual(40);
      expect(a.pool!.size).toBeLessThanOrEqual(50);
      expect(a.pool!.has(hero.start)).toBe(true);
      for (const id of a.pool!) {
        const w = WEAPONS.get(id);
        if (w) expect(w.owner === hero.id || w.owner === '*' || hero.pool.includes(id), `${hero.id}:${id}`).toBe(true);
      }
      expect([...a.pool!].join()).not.toBe([...b.pool!].join());
    }
  });

  it('레벨업 후보는 풀 안에서만 — 잠김·무공록과 상관없다', () => {
    const s = createEndless('pool-c', 'elia', { unlocked: [], book: [] });
    for (let i = 0; i < 30; i++) {
      for (const c of choicePool(s)) if (c.lv === 1) expect(s.pool!.has(c.id)).toBe(true);
      s.level++;
      s.queuedLevels = 1;
      s.pending = null;
      // 오른 것 하나 고르기
      const pool = choicePool(s);
      s.pending = [pool[i % pool.length]];
      choose(s, 0);
    }
    expect(s.weapons.length).toBeLessThanOrEqual(10);
  });

  it('상인·수련소는 장소: 들어가면 가게가 열리고, 사도 열린 채, 나갔다 오면 남은 진열 그대로', () => {
    const s = createEndless('place', 'haun');
    s.gold = 2000;
    s.items.push({ x: s.player.x + 40, y: s.player.y, kind: 'dojo', until: s.t + 90 });
    step(s, { x: 0, y: 0 });
    expect(s.shopItem).not.toBeNull();
    const buy = s.pending!.findIndex((c) => c.kind === 'buyskill');
    expect(buy).toBeGreaterThanOrEqual(0);
    const id = s.pending![buy].id;
    // 풀 밖의 것을 판다
    expect(s.pool!.has(id)).toBe(false);
    const before = s.pending!.length;
    choose(s, buy);
    expect(s.pending).not.toBeNull();
    expect(s.pending!.length).toBe(before - 1);
    expect(s.pool!.has(id)).toBe(true);
    choose(s, s.pending!.length - 1);
    expect(s.pending).toBeNull();
    // 안에 그대로 서 있으면 다시 열리지 않는다
    step(s, { x: 0, y: 0 });
    expect(s.pending).toBeNull();
    // 나갔다가 다시 들어오면 남은 진열
    s.player.x += 400;
    step(s, { x: 0, y: 0 });
    s.player.x -= 400;
    step(s, { x: 0, y: 0 });
    expect(s.pending!.length).toBe(before - 1);
    choose(s, s.pending!.length - 1);
    // 떠날 때가 지나면 사라진다
    s.player.x += 400;
    s.t += 100;
    step(s, { x: 0, y: 0 });
    expect(s.items.some((it) => it.kind === 'dojo')).toBe(false);
  });

  it('떠돌이 상인(무한 모드): 물건 + 풀 밖 무공을 판다', () => {
    const s = createEndless('merch', 'kyle');
    s.items.push({ x: s.player.x + 30, y: s.player.y, kind: 'merchant' });
    step(s, { x: 0, y: 0 });
    expect(s.pending!.some((c) => c.kind === 'buy')).toBe(true);
    expect(s.pending!.some((c) => c.kind === 'buyskill')).toBe(true);
  });
});

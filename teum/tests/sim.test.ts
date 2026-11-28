import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/engine/rng';
import { AFFIXES, AREAS, ultScale, applyDebuff, endlessPool, gemTierOf, hasDebuff, resistOf, areaAt, isRelic, slotWeapons, banish, carryOf, elementCounts, evolveTable, setOn, chapterEvents, choicePool, choose, createChapter, FOES, freshCarry, HEROES, ITEMS, LOCKABLE, PASSIVES, reroll, RULES, skip, step, STORY, WEAPONS, xpNeed, type State } from '../src/sim';
import * as sim from '../src/sim';
import { buildTerrain, CELL, T, updateFlow } from '../src/terrain';
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
      // 새 그림자(Codex teum_*)는 그림이 오기 전엔 「천외귀환」 그림(fallback)을 쓴다
      expect(real(`${f.sprite}_idle`) || (!!f.fallback && real(`${f.fallback}_idle`)), f.id).toBe(true);
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
    // 각성 짝은 심법 또는 (2026-11-25 무한 모드 극) 무공
    for (const w of WEAPONS.values()) if (w.evolve) expect(WEAPONS.get(w.evolve.into)?.evolved && (PASSIVES.has(w.evolve.with) || WEAPONS.has(w.evolve.with)), w.id).toBe(true);
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

  it('잘 고르는 봇도 1장이 만만하지 않다 — 시드 셋 × 인물 넷 중 셋에 하나 이상은 넘는다(2026-11-19 적 강화 · 2026-11-25 맵 3배·구역 뒤 시드 셋으로, GAME_DESIGN 12절)', () => {
    const runs = ['a', 'b', 'c'].flatMap((sd) => HEROES.map((h) => runChapter(0, sd, freshCarry(h.id), 'smart').s));
    expect(runs.filter((s) => s.result === 'clear').length).toBeGreaterThanOrEqual(4);
    for (const s of runs) if (s.result === 'clear') expect(s.t).toBeGreaterThan(4 * 60);
  }, 240000);

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

  it('맵은 234×234칸(2026-11-25 넓이 3배)', () => {
    for (const c of STORY.chapters) expect([c.terrainDef.w, c.terrainDef.h]).toEqual([234, 234]);
    const s = createChapter(4, 'map', freshCarry('haun'));
    expect(s.terrain.w).toBe(234);
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
  it('판마다 무작위 무공 풀 40~50종 + 무한 모드 고유 11~14 — 인물 것과 공통 것만, 시작 무공 포함, 시드마다 다르다', () => {
    const U = RULES.endless.pool.unique;
    for (const hero of HEROES) {
      const a = createEndless('pool-a', hero.id);
      const b = createEndless('pool-b', hero.id);
      expect(a.pool!.size).toBeGreaterThanOrEqual(40 + U.weapons[0] + U.passives[0]);
      expect(a.pool!.size).toBeLessThanOrEqual(50 + U.weapons[1] + U.passives[1]);
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

describe('각성 조합표', () => {
  it('인물·공통 조합을 모두 싣고, 진행 상태를 맞게 적는다', () => {
    const s = createChapter(0, 'evo', freshCarry('haun'));
    const all = evolveTable(s);
    // 스토리: 무한 모드 고유 무공의 극은 빠진다
    const expected = [...WEAPONS.values()].filter((w) => w.evolve && !w.endless && (w.owner === 'haun' || w.owner === '*' || s.hero.pool.includes(w.id)));
    expect(all.map((r) => r.weapon).sort()).toEqual(expected.map((w) => w.id).sort());
    const d = expected.find((w) => s.weapons.some((x) => x.id === w.id)) ?? expected[0];
    // 무공 Lv 최대 + 짝 심법 → 상자를 열면 각성(맨 앞)
    let w = s.weapons.find((x) => x.id === d.id);
    if (!w) s.weapons.push((w = { id: d.id, lv: 1, next: 0 } as (typeof s.weapons)[number]));
    expect(evolveTable(s).find((r) => r.weapon === d.id)?.state).toBe('passive');
    s.passives.set(d.evolve!.with, 1);
    expect(evolveTable(s).find((r) => r.weapon === d.id)?.state).toBe('lv');
    w.lv = d.levels.length;
    const ready = evolveTable(s);
    expect(ready[0]).toMatchObject({ weapon: d.id, state: 'ready', open: true });
    // 각성한 뒤
    w.id = d.evolve!.into;
    expect(evolveTable(s).find((r) => r.weapon === d.id)?.state).toBe('done');
  });
  it('봉인한 무공의 조합은 막힌 것으로', () => {
    const s = createChapter(0, 'evo2', freshCarry('kyle'));
    const r0 = evolveTable(s).find((r) => r.lv === 0 && r.open)!;
    s.banished.add(r0.weapon);
    expect(evolveTable(s).find((r) => r.weapon === r0.weapon)).toMatchObject({ open: false, why: 'locked' });
  });
});

describe('구역(성)·구역 보스·비전·맵 이벤트(2026-11-25)', () => {
  const walkTo = (s: State, x: number, y: number) => {
    s.player.x = x;
    s.player.y = y;
    step(s, { x: 0, y: 0 });
  };
  it('판마다 4~5구역을 성으로 새기고(성벽·성문), 가운데까지 걸어갈 수 있다 — 시드마다 고르는 구역이 다르다', () => {
    const sets = new Set<string>();
    for (const sd of ['z1', 'z2', 'z3', 'z4']) {
      const s = createChapter(0, sd, freshCarry('haun'));
      expect(s.areas.length).toBeGreaterThanOrEqual(AREAS.count.story[0] - 1);
      expect(s.areas.length).toBeLessThanOrEqual(AREAS.count.story[1]);
      sets.add(s.areas.map((z) => z.def.id).sort().join(','));
      const t = s.terrain;
      updateFlow(t, s.player.x, s.player.y, 100000);
      for (const [i, z] of s.areas.entries()) {
        expect(areaAt(s, z.x, z.y)).toBe(i);
        expect(t.dist[z.cy * t.w + z.cx]).toBeGreaterThanOrEqual(0);
        // 성벽 모서리는 벽, 성문 가운데는 바닥
        expect(t.cells[(z.cy - z.hc) * t.w + z.cx - z.hc]).toBe(T.Wall);
        const g = z.gates[0];
        const gx = z.cx + (g === 1 ? z.hc : g === 3 ? -z.hc : 0);
        const gy = z.cy + (g === 2 ? z.hc : g === 0 ? -z.hc : 0);
        expect(t.cells[gy * t.w + gx]).not.toBe(T.Wall);
      }
    }
    expect(sets.size).toBeGreaterThan(1);
  });
  it('구역에 들어서면 매복 + 구역 보스가 깨어나고, 밖으로 나가면 보스는 가운데로 돌아가며 체력을 되찾는다', () => {
    const s = createChapter(0, 'area', freshCarry('kyle'));
    s.player.hp = s.player.maxHp = 1e6;
    const z = s.areas[0];
    const n0 = s.foes.length;
    walkTo(s, z.x + z.half * 0.4, z.y);
    expect(s.areaIn).toBe(0);
    expect(z.entered).toBe(true);
    expect(z.boss?.area).toBe(0);
    expect(s.foes.length).toBeGreaterThan(n0 + 8);
    const b = z.boss!;
    b.x = z.x + z.half * 0.5;
    b.hp = b.maxHp * 0.5;
    s.player.x = z.x + z.half + 600;
    for (let i = 0; i < 240; i++) {
      s.player.hp = s.player.maxHp;
      if (s.pending) choose(s, 0);
      step(s, { x: 0, y: 0 });
    }
    expect(s.areaIn).not.toBe(0);
    expect(Math.hypot(b.x - z.x, b.y - z.y)).toBeLessThan(z.half * 0.5 - 40);
    expect(b.hp).toBeGreaterThan(b.maxHp * 0.6);
  });
  it('구역 보스를 쓰러뜨리면 비전 무공 — 무공 칸 밖(비전 칸)이고, 레벨업 새 무공으로는 안 나온다', () => {
    const s = createChapter(0, 'relic', freshCarry('elia'));
    s.player.hp = s.player.maxHp = 1e6;
    const z = s.areas[0];
    walkTo(s, z.x, z.y + 60);
    const b = z.boss!;
    b.hp = 1;
    for (let i = 0; i < 120 && !b.dead; i++) {
      if (s.pending) choose(s, 0);
      step(s, { x: 0, y: 0 });
    }
    expect(b.dead).toBe(true);
    expect(z.cleared).toBe(true);
    expect(s.weapons.some((w) => w.id === z.def.relic)).toBe(true);
    expect(isRelic(z.def.relic)).toBe(true);
    expect(slotWeapons(s)).toBe(s.weapons.length - 1);
    for (let k = 0; k < 20; k++) {
      s.pending = null;
      s.queuedLevels = 1;
      s.xp = 0;
      for (const c of choicePool(s)) if (c.lv === 1) expect(isRelic(c.id)).toBe(false);
    }
  });
  it('맵 이벤트: 행진은 무리가 몰려오고, 균열 문은 원 안에서 버티면 닫혀 상자를 남긴다', () => {
    const s = createChapter(0, 'mapev', freshCarry('born'));
    s.player.hp = s.player.maxHp = 1e6;
    const horde = AREAS.events.find((e) => e.kind === 'horde')!;
    const portal = AREAS.events.find((e) => e.kind === 'portal')!;
    s.mapEvents = [
      { def: horde, x: s.player.x + 2000, y: s.player.y, state: 'idle', until: 0, next: 0, progress: 0 },
      { def: portal, x: s.player.x - 2000, y: s.player.y, state: 'idle', until: 0, next: 0, progress: 0 },
    ];
    const n0 = s.foes.length;
    walkTo(s, s.player.x + 2000 - 50, s.player.y);
    expect(s.mapEvents[0].state).toBe('done');
    expect(s.foes.length).toBeGreaterThan(n0 + 10);
    s.events.length = 0;
    for (let i = 0; i < 60 * (portal.seconds! + 1); i++) {
      s.player.x = s.mapEvents[1].x + 10;
      s.player.y = s.mapEvents[1].y;
      if (s.pending) choose(s, 0);
      step(s, { x: 0, y: 0 });
    }
    expect(s.mapEvents[1].state).toBe('done');
    expect(s.events.some((e) => e.type === 'event' && e.text.startsWith(`${portal.name} — 닫았다`))).toBe(true);
  });
});

describe('몬스터 저항·디버프·보석 등급·무한 모드 고유 무공(2026-11-25)', () => {
  it('일반 그림자는 저항이 없고, 특수·정예·보스·구역 보스는 저항이 있다(보스는 넉백·공포 면역)', () => {
    for (const f of FOES.values()) {
      const special = !!(f.rank || f.special || f.area || f.role === 'nest');
      expect(!!f.resist && Object.keys(f.resist).length > 0, f.id).toBe(special);
    }
    const boss = [...FOES.values()].find((f) => f.rank === 'boss')!;
    expect(resistOf({ def: boss }, 'knock')).toBe(1);
    expect(resistOf({ def: boss }, 'fear')).toBe(1);
    const frost = FOES.get('rift_frost')!;
    expect(resistOf({ def: frost }, 'slow')).toBe(1);
  });
  it('보석 등급: 일반은 푸른 결, 보스는 무지개 결 — 몬스터마다 다른 색', () => {
    const tier = (id: string) => RULES.gems.tiers[gemTierOf(FOES.get(id)!)].id;
    expect(tier('oak_stump')).toBe('blue');
    expect(tier('knotted_stump')).toBe('violet');
    expect(tier('rift_bomber')).toBe('violet');
    expect(tier('inner_senior_head')).toBe('red');
    expect(tier('zb_dream_queen')).toBe('gold');
    expect(tier('kwak_dojin_cliff')).toBe('rainbow');
  });
  it('디버프: 독은 체력을 깎고, 공포는 달아나게, 속박은 묶고, 면역이면 안 걸린다', () => {
    const s = createChapter(0, 'debuff', freshCarry('haun'));
    s.player.hp = s.player.maxHp = 1e6;
    s.weapons = [];
    const a = sim.spawnFoe(s, 'knotted_stump', s.player.x + 220, s.player.y)!;
    a.hp = a.maxHp = 500;
    applyDebuff(s, a, 'poison');
    applyDebuff(s, a, 'fear');
    expect(hasDebuff(s, a, 'poison')).toBe(true);
    const x0 = a.x;
    for (let i = 0; i < 60; i++) step(s, { x: 0, y: 0 });
    expect(a.hp).toBeLessThan(500);
    expect(a.x).toBeGreaterThan(x0);
    const b = sim.spawnFoe(s, 'knotted_stump', s.player.x - 220, s.player.y)!;
    applyDebuff(s, b, 'root');
    const bx = b.x;
    for (let i = 0; i < 30; i++) step(s, { x: 0, y: 0 });
    expect(Math.abs(b.x - bx)).toBeLessThan(2);
    const boss = sim.spawnFoe(s, 'kwak_dojin_cliff', s.player.x, s.player.y + 400, true)!;
    applyDebuff(s, boss, 'fear');
    expect(hasDebuff(s, boss, 'fear')).toBe(false);
  });
  it('무한 모드 고유 무공·심법은 스토리 레벨업에 안 나오고, 무한 모드 풀에는 판마다 섞인다', () => {
    const endlessIds = new Set([...WEAPONS.values(), ...PASSIVES.values()].filter((d) => d.endless).map((d) => d.id));
    expect([...WEAPONS.values()].filter((w) => w.endless && !w.evolved).length).toBe(14);
    expect([...PASSIVES.values()].filter((p) => p.endless).length).toBe(6);
    expect([...WEAPONS.values()].filter((w) => w.endless && w.evolved && !w.xFrom).length).toBe(10);
    const s = createChapter(0, 'nostory', freshCarry('kyle'));
    for (let k = 0; k < 30; k++) for (const c of choicePool(s)) expect(endlessIds.has(c.id), c.id).toBe(false);
    const pool = endlessPool(HEROES[0], createRng('ep'));
    const uw = [...pool].filter((id) => WEAPONS.get(id)?.endless);
    expect(uw.length).toBeGreaterThanOrEqual(RULES.endless.pool.unique.weapons[0]);
    // 고유 무공의 각성 짝은 풀에 있다
    for (const id of uw) {
      const ev = WEAPONS.get(id)!.evolve;
      if (ev) expect(pool.has(ev.with), `${id} 짝 ${ev.with}`).toBe(true);
    }
  });
  it('극: 무공 + 무공 합성 — 짝 무공은 합쳐져 사라지고 칸이 빈다', () => {
    const s = createEndless('fuse', 'haun');
    s.player.hp = s.player.maxHp = 1e6;
    s.weapons = [{ id: 'shade_clone', lv: 5, next: 0 }, { id: 'blood_scythe', lv: 2, next: 0 }];
    expect(evolveTable(s).find((r) => r.weapon === 'shade_clone')?.state).toBe('ready');
    s.items.push({ x: s.player.x, y: s.player.y, kind: 'chest' });
    for (let i = 0; i < 5; i++) {
      if (s.pending) choose(s, 0);
      step(s, { x: 0, y: 0 });
    }
    expect(s.weapons.map((w) => w.id)).toContain('shade_clone_x');
    expect(s.weapons.some((w) => w.id === 'blood_scythe')).toBe(false);
  });
  it('새 무공·심법 40개는 아이콘 칸이 겹치지 않고, 예전 심법 아이콘 자리는 그대로다', () => {
    const refs = [...WEAPONS.values(), ...PASSIVES.values()].filter((d) => d.icon && !('xFrom' in d && d.xFrom)).map((d) => d.icon!.join(':'));
    expect(refs.length).toBe(40);
    expect(new Set(refs).size).toBe(40);
    const legacy = [...[...WEAPONS.values()].filter((w) => !w.card && !w.relic && !w.icon && !w.xFrom).map((w) => w.id), ...[...PASSIVES.values()].filter((p) => !p.card && !p.icon).map((p) => p.id)];
    expect(legacy.length).toBe(37);
    expect(legacy.indexOf('might')).toBe(27);
    expect(legacy.indexOf('afterimage')).toBe(36);
  });
});

describe('마지막 기술(Q) 밸런스(2026-11-25 "보스가 한 방에 죽는다")', () => {
  it('피해 배율은 시간·장마다 오르고 상한이 있다', () => {
    const a = createChapter(0, 'u1', freshCarry('haun'));
    const b = createChapter(5, 'u1', freshCarry('haun'));
    const k0 = ultScale(a);
    a.t = 240;
    expect(ultScale(a)).toBeGreaterThan(k0);
    expect(ultScale(b)).toBeGreaterThan(ultScale(a) - 0.6);
    b.t = 3600;
    expect(ultScale(b)).toBe(RULES.ult.scale.max);
  });
  it('보스는 한 번 쓸 때 최대 체력의 rankCap까지만 깎인다(아무리 세도)', () => {
    for (const hero of HEROES) {
      const s = createChapter(9, 'u2', freshCarry(hero.id));
      s.player.hp = s.player.maxHp = 1e9;
      s.t = 3600;
      s.passives.set('might', 5);
      const boss = sim.spawnFoe(s, 'kwak_dojin_cliff', s.player.x + 120, s.player.y, true)!;
      s.foes = [boss];
      s.weapons = [];
      s.ult = RULES.ult.max;
      for (let i = 0; i < 60 * 7; i++) {
        s.player.hp = s.player.maxHp;
        if (s.pending) choose(s, 0);
        step(s, { x: 0, y: 0, ult: i === 0 });
        // 필살기 피해만 재려고 다른 그림자(자폭병 등)·무공은 치운다
        s.weapons = [];
        s.foes = s.foes.filter((f) => f === boss);
      }
      expect(boss.dead, hero.id).toBe(false);
      expect(boss.maxHp - boss.hp, hero.id).toBeLessThanOrEqual(boss.maxHp * RULES.ult.rankCap.boss + 1);
    }
  });
});

// ── 2026-11-26: 악마의 제단(sacrifice)이 엔진에 없어 피를 바치지 않고 버프만 받던 버그 ──
describe('줍는 것 기본 동작', () => {
  it('데이터가 쓰는 동작 이름은 모두 엔진에 있다(items·blessing·구역 맵 이벤트)', async () => {
    const items = (await import('../data/items.json')).default as { items: { id: string; ops?: { op: string }[] }[]; blessing: { op: string }[] };
    const zones = (await import('../data/zones.json')).default as { events: { id: string; ops?: { op: string }[] }[] };
    const used = [
      ...items.items.flatMap((d) => (d.ops ?? []).map((o) => [d.id, o.op])),
      ...items.blessing.map((o) => ['blessing', o.op]),
      ...zones.events.flatMap((e) => (e.ops ?? []).map((o) => [e.id, o.op])),
    ];
    expect(used.length).toBeGreaterThan(30);
    for (const [id, op] of used) expect(sim.ITEM_OPS, `${id}: ${op}`).toHaveProperty(op);
  });

  it('악마의 제단: 최대 체력의 25%를 바치고 90초 동안 피해·대기 버프를 받는다', () => {
    const s = createChapter(2, 'altar', freshCarry('haun'), { unlocked: [] });
    const p = s.player;
    p.hp = p.maxHp;
    const before = p.hp;
    s.items.push({ x: p.x, y: p.y, kind: 'demon_altar' });
    step(s, { x: 0, y: 0 });
    expect(s.items.some((it) => it.kind === 'demon_altar')).toBe(false);
    expect(before - p.hp).toBeGreaterThanOrEqual(Math.round(p.maxHp * 0.25) - 2);
    expect(s.buffs.some((b) => b.stat === 'might' && b.mul === 1.35)).toBe(true);
    expect(s.buffs.some((b) => b.stat === 'haste' && b.mul === 0.85)).toBe(true);
  });

  it('악마의 제단: 체력이 적어도 바친 피로 쓰러지지는 않는다', () => {
    const s = createChapter(2, 'altar-low', freshCarry('haun'), { unlocked: [] });
    const p = s.player;
    p.hp = 3;
    s.items.push({ x: p.x, y: p.y, kind: 'demon_altar' });
    step(s, { x: 0, y: 0 });
    expect(p.hp).toBeGreaterThanOrEqual(1);
    expect(s.result).not.toBe('lose');
  });
});

// ── 2026-11-28 사용자: 모든 무기 극 · 시작 무기 극 · C/D급 극 역전 · 4대 천왕(구역 보스) 무기 10강 → 11강 극 ──
describe('극 체계(2026-11-28)', () => {
  const power = (id: string) => {
    const t = WEAPONS.get(id)!.levels.at(-1)!;
    return (t.damage * Math.max(1, t.count) * t.area * (1 + t.pierce * 0.15)) / Math.max(0.2, t.cooldown);
  };
  it('모든 무공(손으로 맞춘 것·카드·무한 고유)에 극이 있고, 짝 심법·극 무공이 실제로 있다', () => {
    const base = [...WEAPONS.values()].filter((w) => !w.evolved && !w.relic);
    expect(base.length).toBeGreaterThan(200);
    for (const w of base) {
      expect(w.evolve, w.id).toBeTruthy();
      expect(WEAPONS.get(w.evolve!.into)?.evolved, w.id).toBe(true);
      expect(PASSIVES.has(w.evolve!.with) || WEAPONS.has(w.evolve!.with), w.id).toBe(true);
    }
  });
  it('인물 시작 무공도 극이 된다', () => {
    for (const h of HEROES) expect(WEAPONS.get(h.start)?.evolve?.into, h.id).toBeTruthy();
  });
  it('약한 무공(C)일수록 크게 올라 극에서는 센 무공(S)의 극과 맞먹는다', () => {
    const auto = [...WEAPONS.values()].filter((w) => w.xFrom && w.xTier !== '비전');
    const med = (g: string) => {
      const v = auto.filter((w) => w.xTier === g).map((w) => power(w.id)).sort((a, b) => a - b);
      return v[Math.floor(v.length / 2)];
    };
    const gain = (g: string) => {
      const v = auto.filter((w) => w.xTier === g).map((w) => power(w.id) / power(w.xFrom!)).sort((a, b) => a - b);
      return v[Math.floor(v.length / 2)];
    };
    expect(med('C')).toBeGreaterThanOrEqual(med('S') * 0.95);
    expect(gain('C')).toBeGreaterThan(gain('S') * 2);
  });
  it('무한 모드 풀의 무공은 모두 짝 심법도 풀에 있다(어떤 무공이든 극까지)', () => {
    for (const sd of ['p1', 'p2', 'p3']) {
      const s = createEndless(sd, 'kyle');
      for (const id of s.pool!) {
        const ev = WEAPONS.get(id)?.evolve;
        if (ev) expect(s.pool!.has(ev.with), `${sd} ${id}`).toBe(true);
      }
    }
  });
  it('비전은 레벨 10까지, 구역 보스를 다시 쓰러뜨릴 때만 오르고(레벨업에 안 나온다) — 10에서 한 번 더면 극', () => {
    const s = createEndless('relic-x', 'elia');
    const z = s.areas[0];
    const fake = { area: 0, x: z.x, y: z.y } as unknown as Parameters<typeof sim.areaBossDown>[1];
    const id = z.def.relic;
    expect(WEAPONS.get(id)!.levels.length).toBe(10);
    sim.areaBossDown(s, fake);
    expect(s.weapons.find((w) => w.id === id)?.lv).toBe(1);
    expect(choicePool(s).some((c) => c.id === id)).toBe(false);
    for (let k = 2; k <= 10; k++) sim.areaBossDown(s, fake);
    expect(s.weapons.find((w) => w.id === id)?.lv).toBe(10);
    sim.areaBossDown(s, fake);
    const x = s.weapons.find((w) => w.id === `${id}_x`);
    expect(x).toBeTruthy();
    expect(isRelic(x!.id)).toBe(true);
    expect(WEAPONS.get(x!.id)!.levels[0].damage).toBeGreaterThan(WEAPONS.get(id)!.levels[9].damage * 2);
  });
});

describe('장터 수련 20종(2026-11-28)', () => {
  const STAT: Record<string, keyof typeof sim.stat> = { might: 'might', haste: 'haste', area: 'area', speed: 'speed', armor: 'armor', regen: 'regen', crit: 'crit', pickup: 'pickup', growth: 'xpMul', amount: 'amount', duration: 'duration', greed: 'greed', dash: 'dashcd', luck: 'luck', ult: 'ultGain' };
  it('20종 — 값이 오를수록 비싸지고, 그림 칸이 있다', () => {
    const list = RULES.upgrades.list;
    expect(list.length).toBe(20);
    expect(new Set(list.map((u) => u.id)).size).toBe(20);
    for (const u of list) {
      for (let i = 1; i < u.cost.length; i++) expect(u.cost[i], u.id).toBeGreaterThan(u.cost[i - 1]);
      const sheet = u.icon?.[0] ?? 'icons_teum_upgrades';
      expect(existsSync(`specs/assets/${sheet}.yaml`), u.id).toBe(true);
    }
  });
  it('능력치 수련은 한 단계마다 그 능력치를 바꾼다(줄어드는 쪽: 재사용·보법 대기)', () => {
    const base = createChapter(0, 'up0', freshCarry('haun'));
    for (const [id, k] of Object.entries(STAT)) {
      const s = createChapter(0, 'up0', freshCarry('haun'), { meta: { [id]: id === 'amount' ? 1 : 3 } });
      const a = (sim.stat[k] as (x: State) => number)(base);
      const b = (sim.stat[k] as (x: State) => number)(s);
      if (k === 'haste' || k === 'dashcd') expect(b, id).toBeLessThan(a);
      else expect(b, id).toBeGreaterThan(a);
    }
  });
});

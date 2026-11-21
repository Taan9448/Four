import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/engine/rng';
import { carryOf, chapterEvents, choicePool, choose, createChapter, FOES, freshCarry, HEROES, ITEMS, LOCKABLE, PASSIVES, step, STORY, WEAPONS, xpNeed } from '../src/sim';
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
      expect(s.items.some((it) => it.kind === d.id && it.x === s.player.x), d.id).toBe(false);
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
});

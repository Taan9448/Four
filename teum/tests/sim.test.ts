import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/engine/rng';
import { carryOf, chapterEvents, choicePool, choose, createChapter, FOES, freshCarry, HEROES, PASSIVES, step, STORY, WEAPONS, xpNeed } from '../src/sim';
import { buildTerrain, CELL, T } from '../src/terrain';
import { runChapter } from './bot';

const real = (id: string) => existsSync(`assets/sprites/${id}/meta.json`);
const spec = (id: string) => existsSync(`specs/assets/${id}.yaml`);

describe('「틈」 데이터', () => {
  it('스토리 10장 × 15분, 장마다 바닥·지형·일러스트 명세와 보스·중간 보스', () => {
    expect(STORY.chapters).toHaveLength(10);
    expect(STORY.timeline.length).toBe(900);
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
    expect(WEAPONS.size + PASSIVES.size).toBeLessThanOrEqual(48);
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

  it('레벨·무공·심법·금화는 다음 장으로 이어진다(체력은 가득)', () => {
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
    expect(n.gold).toBe(33);
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

  it('소모품: 서리 부적은 그림자를 얼리고, 벽력탄은 둘레를 친다', () => {
    const s = createChapter(0, 'items', freshCarry('haun'));
    s.items.push({ x: s.player.x, y: s.player.y, kind: 'frost' });
    step(s, { x: 0, y: 0 });
    expect(s.freezeUntil).toBeGreaterThan(s.t + 4);
  });

  it('보스를 쓰러뜨리면 장을 넘는다', () => {
    const s = createChapter(0, 'boss', freshCarry('haun'));
    s.t = 749.99;
    s.nextEvent = chapterEvents(s.chapter).findIndex((e) => e.kind === 'boss');
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

  it('잘 고르는 봇은 대개 1장을 넘는다(인물 넷 중 셋 이상, GAME_DESIGN 12절)', () => {
    const runs = HEROES.map((h) => runChapter(0, 'b', freshCarry(h.id), 'smart').s);
    expect(runs.filter((s) => s.result === 'clear').length).toBeGreaterThanOrEqual(3);
    for (const s of runs) if (s.result === 'clear') expect(s.t).toBeGreaterThan(12 * 60);
  }, 120000);
});

import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { choicePool, choose, createRun, FOES, HEROES, PASSIVES, RUN, step, WEAPONS, xpNeed } from '../src/sim';
import { runBot } from './bot';

const real = (id: string) => existsSync(`assets/sprites/${id}/meta.json`);
const spec = (id: string) => existsSync(`specs/assets/${id}.yaml`);

describe('「틈」 데이터', () => {
  it('적·무공·인물이 서로를 가리키고, 그림이 있다', () => {
    for (const f of FOES.values()) expect(real(`${f.sprite}_idle`), f.id).toBe(true);
    for (const a of RUN.acts) for (const sp of a.spawns) for (const id of Object.keys(sp.foes)) expect(FOES.has(id), id).toBe(true);
    for (const e of RUN.events) expect(FOES.has(e.foe), e.foe).toBe(true);
    for (const h of HEROES) {
      expect(real(`${h.sprite}_idle`), h.id).toBe(true);
      expect(WEAPONS.get(h.start)?.owner, h.id).toBe(h.id);
      for (const w of h.pool) expect(WEAPONS.get(w)?.owner, w).toBe(h.id);
      expect(spec(`fx_gyeol_tech_${h.ult.id}_a`), h.ult.id).toBe(true);
      // 걷기 그림은 Codex 명세가 있다(오기 전에는 대기 그림으로)
      expect(spec(`${h.sprite}_walk`), h.sprite).toBe(true);
    }
    for (const w of WEAPONS.values()) {
      expect(w.levels.length, w.id).toBe(w.evolved ? 1 : 5);
      if (w.evolve) {
        expect(PASSIVES.has(w.evolve.with), w.id).toBe(true);
        expect(WEAPONS.get(w.evolve.into)?.evolved, w.id).toBe(true);
      }
      if (w.fx) expect(spec(w.fx), w.fx).toBe(true);
    }
    for (const a of RUN.acts) expect(spec(a.ground), a.ground).toBe(true);
    expect(spec('icons_teum')).toBe(true);
  });

  it('30분: 매듭 셋(10·20분 보스, 마지막 보스는 끝 무렵)', () => {
    const bosses = RUN.events.filter((e) => e.kind === 'boss');
    expect(bosses.map((b) => b.at)).toEqual([600, 1200, 1650]);
    expect(bosses.at(-1)!.final).toBe(true);
    expect(RUN.length).toBe(1800);
  });

  it('필요 경험은 레벨마다 는다', () => {
    for (let l = 1; l < 80; l++) expect(xpNeed(l + 1)).toBeGreaterThan(xpNeed(l));
  });
});

describe('「틈」 엔진', () => {
  it('같은 시드·같은 입력이면 같은 판', () => {
    const go = () => {
      const s = createRun('haun', 'same');
      for (let i = 0; i < 60 * 90; i++) {
        if (s.pending) choose(s, 0);
        step(s, { x: Math.cos(i / 120), y: Math.sin(i / 120) });
        s.events.length = 0;
      }
      return [s.kills, s.level, Math.round(s.player.hp), s.foes.length, s.weapons.map((w) => w.id + w.lv).join()];
    };
    expect(go()).toEqual(go());
  });

  it('레벨업 고르기: 칸이 차면 새 무공·새 심법은 나오지 않는다', () => {
    const s = createRun('elia', 'slots');
    for (const w of ['frost_ward', 'frost_bloom', 'violet_bolt', 'mana_rain', 'waterwheel']) s.weapons.push({ id: w, lv: 1, next: 0 });
    for (const p of ['might', 'haste', 'area', 'swift', 'vigor', 'breath']) s.passives.set(p, 1);
    const pool = choicePool(s);
    expect(pool.some((c) => c.kind === 'weapon' && c.lv === 1)).toBe(false);
    expect(pool.some((c) => c.kind === 'passive' && c.lv === 1)).toBe(false);
    expect(pool.length).toBeGreaterThan(0);
  });

  it('각성: Lv.5 + 짝 심법으로 상자를 열면 바뀐다', () => {
    const s = createRun('haun', 'evo');
    s.weapons = [{ id: 'byeogun', lv: 5, next: 0 }];
    s.passives.set('breath', 1);
    s.items.push({ x: s.player.x, y: s.player.y, kind: 'chest' });
    step(s, { x: 0, y: 0 });
    expect(s.weapons[0].id).toBe('cheonoe_blade');
  });

  it('잘 고르는 봇은 30분 안팎에 틈을 꿰맨다(GAME_DESIGN 9절)', () => {
    const r = runBot('haun', 'a', 'smart');
    expect(r.result).toBe('win');
    expect(r.t).toBeGreaterThan(27 * 60);
    expect(r.t).toBeLessThan(34 * 60);
    expect(r.bossKills).toEqual(['ignis', 'vargas', 'mordecai']);
  });
});

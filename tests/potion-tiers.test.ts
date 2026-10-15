// 물약 5등급(2026-10-15 개편): 출처별 등급 · 심연 전용 · 모든 물약이 전투에서 쓰인다
import { describe, expect, it } from 'vitest';
import { usePotion } from '../src/engine/battle';
import { createAbyssRun, pathOffer, pathPicks } from '../src/engine/abyss';
import { openShop, potionPool, rollLoot } from '../src/engine/economy';
import { createRun, createRunAt } from '../src/engine/run';
import type { MapNode } from '../src/engine/route';
import { battle, data } from './helpers';

const node = (type: MapNode['type'], id: string): MapNode => ({ id, floor: 1, index: 0, type, moduleId: 'x', next: [] });
const tier = (id: string | null) => (id ? data.potions.get(id)!.rarity : null);

describe('물약 등급과 출처', () => {
  it('캠페인에는 심연 전용 물약이 나오지 않고, 전설은 보스에서만', () => {
    const seen = { battle: new Set<string>(), elite: new Set<string>(), boss: new Set<string>(), shop: new Set<string>() };
    for (let i = 0; i < 300; i++) {
      const run = createRun(data, `POT${i}`);
      for (const k of ['battle', 'elite', 'boss'] as const) {
        const p = rollLoot(data, run, node(k, `n${i}`)).potion;
        if (p) seen[k].add(p);
      }
      const r2 = createRunAt(data, `POTS${i}`, 's3');
      for (const p of openShop(data, r2, `s${i}`).potions) seen.shop.add(p.potionId);
    }
    for (const set of Object.values(seen)) for (const id of set) expect(data.potions.get(id)!.abyss, id).toBe(false);
    for (const k of ['battle', 'elite', 'shop'] as const) expect([...seen[k]].map(tier)).not.toContain('legendary');
    expect([...seen.boss].map(tier)).toContain('legendary');
    expect([...seen.boss].map(tier)).not.toContain('common');
  });

  it('심연에서는 심연 전용 물약도 나온다', () => {
    const run = createAbyssRun(data, 'POTA', { mates: ['elia', 'kyle', 'born'], paths: pathOffer(data, 'POTA').slice(0, pathPicks(data, 3).picks), pool: {} });
    expect(potionPool(data, run).some((p) => p.abyss)).toBe(true);
    expect(potionPool(data, createRun(data, 'POTC')).some((p) => p.abyss)).toBe(false);
  });
});

describe('모든 물약을 전투에서 쓸 수 있다', () => {
  it('물약마다 쓰면 칸이 비고 오류가 없다', () => {
    for (const p of data.potions.values()) {
      const s = battle({ potions: [p.id, null, null], party: [{ id: 'haun', hp: 400, maxHp: 600 }] });
      const t = p.target === 'enemy' ? s.enemies[0].uid : p.target === 'ally' ? s.party[0].uid : undefined;
      expect(usePotion(s, 0, t).ok, p.id).toBe(true);
      expect(s.potions[0], p.id).toBeNull();
    }
  });

  it('공허의 소금: 소비한 균열만큼 적 모두에게 피해', () => {
    const s = battle({ potions: ['void_salt', null, null] });
    s.rift = 5;
    const hp = s.enemies[0].hp;
    usePotion(s, 0);
    expect(s.rift).toBe(0);
    expect(hp - s.enemies[0].hp).toBe(5 * 30);
  });
});

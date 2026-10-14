import { describe, expect, it } from 'vitest';
import { cardFx, elementHitFx, statusFx } from '../src/engine/fx-rules';
import { data } from './helpers';

const fx = (id: string) => cardFx(data, data.cards.get(id)!);

describe('이펙트 규칙(data/fx.json)', () => {
  it('카드에 적힌 fx·hitFx가 먼저다', () => {
    expect(fx('haun_byeogun').fx).toBe('fx_slash_blue');
    expect(fx('elia_fireball').hitFx).toBe('fx_hit_fire');
  });

  it('속성·갈래·주인·유형으로 고른다', () => {
    const fire = [...data.cards.values()].find((c) => c.type === 'attack' && c.pool !== 'abyss' && c.effects.some((e) => e.op === 'damage' && e.element === 'fire'))!;
    expect(cardFx(data, fire).fx).toBe('fx_fire_burst');
    const ice = [...data.cards.values()].find((c) => !c.hitFx && c.effects.some((e) => e.op === 'damage' && e.element === 'ice'))!;
    expect(cardFx(data, ice).hitFx).toBe('fx_hit_ice');
    // 번개(2026-10-14): 틈의 카드가 아닌 번개 공격은 내리꽂히는 번개 + 전기 불꽃
    const bolts = [...data.cards.values()].filter((c) => c.pool !== 'abyss' && !c.fx && !c.hitFx && c.effects.some((e) => e.op === 'damage' && e.element === 'lightning'));
    expect(bolts.length).toBeGreaterThan(0);
    for (const c of bolts) expect(cardFx(data, c)).toMatchObject({ fx: 'fx_lightning_strike', hitFx: 'fx_hit_shock' });
    const swift = [...data.cards.values()].find((c) => c.type === 'attack' && c.tags.includes('kyle_swift') && c.owner === 'kyle' && c.pool !== 'abyss')!;
    expect(cardFx(data, swift).fx).toBe('fx_rapier_flurry');
    expect(cardFx(data, swift).hitFx).toBe('fx_hit_pierce');
    const power = [...data.cards.values()].find((c) => c.type === 'power' && !c.tags.includes('born_taunt'))!;
    expect(cardFx(data, power).castFx).toBe('fx_power_aura');
  });

  it('번개 피해는 카드와 상관없이 전기 불꽃 피격, 감전·마비가 걸리면 같은 이펙트(2026-10-14)', () => {
    expect(elementHitFx(data, 'lightning')).toBe('fx_hit_shock');
    expect(elementHitFx(data, undefined)).toBeUndefined();
    expect(statusFx(data, 'shock')).toBe('fx_hit_shock');
    expect(statusFx(data, 'paralyze')).toBe('fx_hit_shock');
    for (const id of Object.keys(data.fx.statusFx ?? {})) expect(data.statuses.has(id), id).toBe(true);
  });

  it('공격 카드는 모두 공격 이펙트나 피격 이펙트 중 하나는 따로 받는다(흰 타격 별 하나로 끝나지 않는다)', () => {
    const plain = [...data.cards.values()].filter((c) => c.type === 'attack' && c.owner !== 'common' && c.owner !== 'status').filter((c) => {
      const f = cardFx(data, c);
      return !f.fx && !f.hitFx;
    });
    expect(plain.map((c) => c.id)).toEqual([]);
  });
});

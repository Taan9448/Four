import { describe, expect, it } from 'vitest';
import { cardFx } from '../src/engine/fx-rules';
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
    const swift = [...data.cards.values()].find((c) => c.type === 'attack' && c.tags.includes('kyle_swift') && c.owner === 'kyle' && c.pool !== 'abyss')!;
    expect(cardFx(data, swift).fx).toBe('fx_rapier_flurry');
    expect(cardFx(data, swift).hitFx).toBe('fx_hit_pierce');
    const power = [...data.cards.values()].find((c) => c.type === 'power' && !c.tags.includes('born_taunt'))!;
    expect(cardFx(data, power).castFx).toBe('fx_power_aura');
  });

  it('공격 카드는 모두 공격 이펙트나 피격 이펙트 중 하나는 따로 받는다(흰 타격 별 하나로 끝나지 않는다)', () => {
    const plain = [...data.cards.values()].filter((c) => c.type === 'attack' && c.owner !== 'common' && c.owner !== 'status').filter((c) => {
      const f = cardFx(data, c);
      return !f.fx && !f.hitFx;
    });
    expect(plain.map((c) => c.id)).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { playCard, previewCard } from '../src/engine/battle';
import { battle, give } from './helpers';

describe('피해 미리보기', () => {
  it('카드를 실제로 썼을 때와 같은 피해를 보이고, 원래 전투는 건드리지 않는다', () => {
    const s = battle({ enemies: ['test_wolf', 'test_wolf'] });
    const haun = s.party.find((p) => p.defId === 'haun')!;
    haun.statuses.strength = 2;
    const [a, b] = s.enemies;
    a.statuses.vulnerable = 2;
    b.block = 3;
    const i = give(s, 'haun_chop');
    const onA = previewCard(s, i, a.uid).get(a.uid)!;
    const onB = previewCard(s, i, b.uid).get(b.uid)!;
    // 원본 그대로
    expect(a.hp).toBe(a.maxHp);
    expect(s.hand[i].cardId).toBe('haun_chop');
    expect(onB.blocked).toBe(3);
    expect(onA.hpLoss).toBeGreaterThan(onB.hpLoss);
    const before = a.hp;
    playCard(s, i, a.uid);
    expect(before - a.hp).toBe(onA.hpLoss);
  });

  it('쓰러뜨리면 처치로 표시하고, 쓸 수 없는 카드는 비어 있다', () => {
    const s = battle({ enemies: ['test_wolf'] });
    const e = s.enemies[0];
    e.hp = 1;
    const i = give(s, 'haun_chop');
    expect(previewCard(s, i, e.uid).get(e.uid)?.kills).toBe(true);
    s.neigong = 0;
    expect(previewCard(s, i, e.uid).size).toBe(0);
  });
});

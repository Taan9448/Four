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

describe('미리보기와 실제의 무작위', () => {
  it('치명타를 굴려도(미리보기는 굴리지 않음) 무작위 대상 피해의 대상이 미리보기와 같다', async () => {
    const { previewCard: pv, playCard: pc } = await import('../src/engine/battle');
    const { createRng } = await import('../src/engine/rng');
    let mismatch = 0;
    for (let i = 0; i < 60; i++) {
      const s = battle({ enemies: ['test_wolf', 'test_wolf', 'test_wolf'], rng: createRng(`RT${i}`) });
      s.noCrit = false;
      for (const e of s.enemies) e.hp = e.maxHp = 999;
      s.hand.push({ uid: 'rx', cardId: 'kyle_eyes_closed', level: 5 });
      s.party.push({ ...s.party[0], uid: 'pk', defId: 'kyle', name: '카일' });
      const idx = s.hand.length - 1;
      const target = s.enemies[0].uid;
      const before = s.enemies.map((e) => e.hp);
      const p = pv(s, idx, target);
      if (!pc(s, idx, target).ok) continue;
      // 미리보기에서 피해를 받은 적과 실제로 피해를 받은 적이 같아야 한다(치명타로 양만 달라질 수 있음)
      const hitReal = s.enemies.filter((e, j) => e.hp < before[j]).map((e) => e.uid).sort();
      const hitPrev = [...p.keys()].filter((uid) => s.enemies.some((e) => e.uid === uid)).sort();
      if (JSON.stringify(hitReal) !== JSON.stringify(hitPrev)) mismatch++;
    }
    expect(mismatch).toBe(0);
  });
});

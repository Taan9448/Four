// 적 행동(C단계): 소환·체력 조건 행동·한 번만 행동·독기·버리기·가시
import { describe, expect, it } from 'vitest';
import { endTurn, playCard } from '../src/engine/battle';
import { addStatus } from '../src/engine/effects';
import { EnemyDef } from '../src/engine/schema';
import { battle, cards, data, give } from './helpers';

const def = (o: Record<string, unknown>) => {
  const e = EnemyDef.parse({ maxHp: 100, pattern: 'cycle', ...o });
  data.enemies.set(e.id, e);
  return e;
};

describe('적 행동', () => {
  it('소환: 적 편에 새 적이 서고(최대 balance.maxEnemies), 한 번만 행동은 다시 고르지 않는다', () => {
    def({
      id: 't_caller', name: '부르는 자',
      moves: [
        { id: 'call', name: '부른다', intent: 'special', oncePerBattle: true, effects: [{ op: 'summon', enemy: 'test_wolf', count: 9 }] },
        { id: 'wait', name: '기다린다', intent: 'defend', effects: [{ op: 'block', amount: 1 }] },
      ],
    });
    const s = battle({ enemies: ['t_caller'] });
    expect(s.enemies[0].intent?.moveId).toBe('call');
    endTurn(s);
    expect(s.enemies.filter((e) => !e.downed)).toHaveLength(data.balance.maxEnemies);
    expect(new Set(s.enemies.map((e) => e.uid)).size).toBe(s.enemies.length);
    expect(s.events.some((e) => e.type === 'summon')).toBe(true);
    // 다음 차례부터 소환된 적도 의도를 가진다. 부르는 자는 '부른다'를 다시 고르지 않는다
    for (let i = 0; i < 3; i++) {
      expect(s.enemies[0].intent?.moveId).toBe('wait');
      for (const e of s.enemies.slice(1)) expect(e.intent).not.toBeNull();
      for (const p of s.party) p.hp = p.maxHp;
      endTurn(s);
    }
  });

  it('체력 조건 행동: 체력이 절반 아래일 때만 고른다(순서대로면 조건이 안 맞는 행동은 건너뛴다)', () => {
    def({
      id: 't_rage', name: '분노',
      moves: [
        { id: 'rage', name: '분노', intent: 'attack', condition: { hpRatioLte: 0.5 }, effects: [{ op: 'damage', amount: 1 }] },
        { id: 'calm', name: '침착', intent: 'defend', effects: [{ op: 'block', amount: 1 }] },
      ],
    });
    const s = battle({ enemies: ['t_rage'] });
    expect(s.enemies[0].intent?.moveId).toBe('calm');
    endTurn(s);
    expect(s.enemies[0].intent?.moveId).toBe('calm');
    s.enemies[0].hp = 40;
    endTurn(s);
    expect(s.enemies[0].intent?.moveId).toBe('rage');
  });

  it('독기: 손에 든 채 턴이 끝나면 하운 체력 3, 내공 1로 털어 내면(소멸) 아프지 않다', () => {
    const s = battle({ deck: cards('haun_step', 'haun_step', 'haun_step', 'haun_step', 'haun_step', 'haun_step') });
    for (const e of s.enemies) e.intent = null;
    give(s, 'status_miasma');
    const hp = s.party[0].hp;
    endTurn(s);
    expect(s.party[0].hp).toBe(hp - 3);
    for (const e of s.enemies) e.intent = null;
    const i = give(s, 'status_miasma');
    expect(playCard(s, i).ok).toBe(true);
    expect(s.exhaust.some((c) => c.cardId === 'status_miasma')).toBe(true);
    const hp2 = s.party[0].hp;
    endTurn(s);
    expect(s.party[0].hp).toBe(hp2);
  });

  it('끊긴 숨: 차례 시작에 하운의 카드만 버린다', () => {
    const s = battle({
      party: [{ id: 'haun', hp: 60, maxHp: 60 }, { id: 'kyle', hp: 52, maxHp: 52 }],
      deck: cards('haun_chop', 'kyle_strike', 'kyle_strike', 'kyle_strike', 'kyle_strike', 'kyle_strike', 'kyle_guard', 'kyle_guard', 'kyle_guard', 'kyle_guard'),
    });
    for (const e of s.enemies) e.intent = null;
    // 적이 거는 상태는 적 차례에 붙어 다음 내 차례 시작에 일어난다. 여기서는 내 차례에 걸어서 턴 끝 감소(1)를 미리 더한다
    addStatus(s, s.party[0], 'breath_broken', 2);
    s.hand = [];
    s.discard = [];
    s.draw = cards('kyle_strike', 'kyle_strike', 'kyle_guard', 'kyle_guard', 'haun_chop');
    endTurn(s);
    expect(s.hand.some((c) => c.cardId === 'haun_chop')).toBe(false);
    expect(s.discard.map((c) => c.cardId)).toContain('haun_chop');
    expect(s.hand).toHaveLength(4);
  });

  it('가시: 공격을 맞을 때마다 때린 쪽이 스택만큼 피해를 입는다', () => {
    const s = battle();
    for (const e of s.enemies) e.hp = e.maxHp = 999;
    addStatus(s, s.enemies[0], 'thorns', 2);
    const hp = s.party[0].hp;
    playCard(s, give(s, 'haun_cloud_form'), s.enemies[0].uid);
    expect(s.party[0].hp).toBe(hp - 2 * 2);
  });
});

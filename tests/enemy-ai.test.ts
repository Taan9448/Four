// 적 AI(2026-10-17 사용자 요청 — 적이 같은 기술만 쓴다): 순서형은 한 바퀴씩 모두 쓰되 순서를 섞고, 보스는 정한 순서,
// 무작위형은 바로 전 행동을 덜, 상황 점수(balance.enemyAi)는 막타·체력·강화·방어 기억에 따라 바뀐다
import { describe, expect, it } from 'vitest';
import { aiScore, endTurn } from '../src/engine/battle';
import { EnemyDef } from '../src/engine/schema';
import { createRng } from '../src/engine/rng';
import { battle, data } from './helpers';

const def = (o: Record<string, unknown>) => {
  const e = EnemyDef.parse({ maxHp: 5000, pattern: 'cycle', ...o });
  data.enemies.set(e.id, e);
  return e;
};
const guard = (id: string) => ({ id, name: id, intent: 'defend', effects: [{ op: 'block', amount: 10 }] });
const ai = data.balance.enemyAi;

describe('적 AI', () => {
  it('순서형(보스 아님): 한 바퀴 안에 행동을 모두 한 번씩 쓰고, 첫 행동은 시드마다 달라진다', () => {
    def({ id: 't_round', name: '돌림', moves: [guard('a'), guard('b'), guard('c')] });
    const firsts = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const s = battle({ enemies: ['t_round'], rng: createRng(`round${i}`) });
      const seen: string[] = [];
      for (let t = 0; t < 3; t++) {
        seen.push(s.enemies[0].intent!.moveId);
        endTurn(s);
      }
      expect([...seen].sort()).toEqual(['a', 'b', 'c']);
      firsts.add(seen[0]);
    }
    expect(firsts.size).toBeGreaterThan(1);
  });

  it('보스·ordered는 정한 순서 그대로', () => {
    def({ id: 't_boss', name: '대본', tier: 'boss', moves: [guard('a'), guard('b'), guard('c')] });
    def({ id: 't_ordered', name: '연출', ordered: true, moves: [guard('a'), guard('b'), guard('c')] });
    for (const id of ['t_boss', 't_ordered'])
      for (let i = 0; i < 5; i++) {
        const s = battle({ enemies: [id], rng: createRng(`order${i}`) });
        const seen: string[] = [];
        for (let t = 0; t < 4; t++) {
          seen.push(s.enemies[0].intent!.moveId);
          endTurn(s);
        }
        expect(seen).toEqual(['a', 'b', 'c', 'a']);
      }
  });

  it('등장 행동: 첫 행동이 한 번만이면 1턴에 그대로 쓴다', () => {
    def({ id: 't_open', name: '호각', moves: [{ ...guard('call'), oncePerBattle: true }, guard('b'), guard('c')] });
    for (let i = 0; i < 5; i++) expect(battle({ enemies: ['t_open'], rng: createRng(`open${i}`) }).enemies[0].intent!.moveId).toBe('call');
  });

  it('같은 시드면 같은 행동 순서(재현)', () => {
    const run = () => {
      const s = battle({ enemies: ['test_wolf'], rng: createRng('same') });
      const seen: string[] = [];
      for (let t = 0; t < 5; t++) {
        seen.push(s.enemies[0].intent!.moveId);
        for (const p of s.party) p.hp = p.maxHp;
        endTurn(s);
      }
      return seen.join();
    };
    expect(run()).toBe(run());
  });

  it('상황 점수: 한 방에 쓰러뜨릴 대상이 있으면 공격을 더, 이미 가진 강화는 덜', () => {
    const e = def({
      id: 't_score',
      name: '점수',
      moves: [
        { id: 'hit', name: 'hit', intent: 'attack', effects: [{ op: 'damage', amount: 100 }] },
        { id: 'pump', name: 'pump', intent: 'buff', effects: [{ op: 'apply_status', status: 'strength', stacks: 1, target: 'self' }] },
      ],
    });
    const s = battle({ enemies: ['t_score'] });
    const foe = s.enemies[0];
    const [hit, pump] = e.moves;
    const base = aiScore(s, foe, hit);
    s.party[0].hp = 50;
    expect(aiScore(s, foe, hit)).toBeCloseTo(base * ai.lethal);
    const pumpBase = aiScore(s, foe, pump);
    foe.statuses.strength = 2;
    expect(aiScore(s, foe, pump)).toBeCloseTo(pumpBase * ai.buffOwned);
  });

  it('상황 점수: 체력이 낮으면 방어를 더, 방어 기억이 공격을 다 막으면 공격은 덜 준비는 더', () => {
    const e = def({
      id: 't_guard',
      name: '수비',
      moves: [{ id: 'hit', name: 'hit', intent: 'attack', effects: [{ op: 'damage', amount: 100 }] }, guard('wall')],
    });
    const s = battle({ enemies: ['t_guard'] });
    const foe = s.enemies[0];
    const [hit, wall] = e.moves;
    expect(aiScore(s, foe, wall)).toBe(1);
    foe.hp = Math.floor(foe.maxHp * ai.lowHp);
    expect(aiScore(s, foe, wall)).toBeCloseTo(ai.guardWhenLow);
    foe.hp = foe.maxHp;
    s.aiBlockSeen = [1000];
    expect(aiScore(s, foe, hit)).toBeCloseTo(ai.blockedAttack);
    expect(aiScore(s, foe, wall)).toBeCloseTo(ai.blockedSetup);
  });

  it('방어 기억: 적 차례가 시작될 때 아군 1명당 방어를 최근 blockMemory 차례만 기억한다', () => {
    const s = battle({ enemies: ['test_wolf'] });
    for (let t = 0; t < ai.blockMemory + 2; t++) {
      s.party[0].block = 30 * (t + 1);
      s.party[0].hp = s.party[0].maxHp;
      endTurn(s);
    }
    expect(s.aiBlockSeen).toHaveLength(ai.blockMemory);
    expect(s.aiBlockSeen!.at(-1)).toBe(30 * (ai.blockMemory + 2));
  });
});

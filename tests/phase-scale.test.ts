// 2026-10-13: 모듈 균열 감쇠(content.riftDecay) · 단계 기술(MoveDef.phase) · 모듈 적 배율(content.enemyScale)
import { describe, expect, it } from 'vitest';
import { checkPhaseMoves, createBattle, endTurn, riftDecayOf } from '../src/engine/battle';
import { battleSetupFor, createRunAt, type Encounter } from '../src/engine/run';
import type { BattleState, EnemyState } from '../src/engine/state';
import { battle, data } from './helpers';

const foe = (s: BattleState) => s.enemies[0] as EnemyState;
/** 적 체력을 정한 값으로 낮추고 처리 뒤 검사(카드·물약을 낸 것과 같은 자리)를 한다 */
function hurt(s: BattleState, hp: number): void {
  foe(s).hp = hp;
  checkPhaseMoves(s);
}

describe('모듈 균열 감쇠(content.riftDecay)', () => {
  it('감쇠 0이면 차례가 끝나도 균열이 줄지 않는다', () => {
    const s = battle({ enemies: ['test_rock'], riftDecay: 0, riftDecayNote: '화로' });
    s.rift = 4;
    endTurn(s);
    expect(riftDecayOf(s)).toBe(0);
    expect(s.rift).toBe(4);
    expect(s.riftDecayNote).toBe('화로');
  });

  it('항목이 없으면 세계 기본값(엘하임 −2)', () => {
    const s = battle({ enemies: ['test_rock'] });
    s.rift = 4;
    endTurn(s);
    expect(riftDecayOf(s)).toBe(data.balance.rift.decay.elheim);
    expect(s.rift).toBe(4 - data.balance.rift.decay.elheim);
  });
});

describe('단계 기술(MoveDef.phase)', () => {
  it('순서(cycle) 패턴: 조건이 처음 맞으면 의도가 곧바로 바뀌고 다음 적 차례에 쓴다', () => {
    const s = battle({ enemies: ['test_phase'] });
    expect(foe(s).intent?.moveId).toBe('poke');
    hurt(s, 150);
    expect(foe(s).intent?.moveId).toBe('tears');
    expect(s.events.some((e) => e.type === 'phase')).toBe(true);
    const before = s.rift;
    endTurn(s);
    expect(s.rift).toBeGreaterThanOrEqual(Math.max(0, before + 3 - riftDecayOf(s)));
    expect(foe(s).intent?.moveId).not.toBe('tears');
  });

  it('한 번만: 조건이 계속 맞아도 다시 끼어들지 않는다', () => {
    const s = battle({ enemies: ['test_phase'] });
    hurt(s, 150);
    endTurn(s);
    const seen: string[] = [];
    for (let t = 0; t < 8 && !s.result; t++) {
      hurt(s, 100);
      seen.push(foe(s).intent!.moveId);
      endTurn(s);
    }
    expect(seen).not.toContain('tears');
    expect(foe(s).phaseFired).toEqual(['tears']);
  });

  it('조건이 맞지 않으면 끼어들지 않고, 평소 고르기에도 끼지 않는다', () => {
    const s = battle({ enemies: ['test_phase'] });
    const seen: string[] = [];
    for (let t = 0; t < 8 && !s.result; t++) {
      seen.push(foe(s).intent!.moveId);
      endTurn(s);
    }
    expect(seen).not.toContain('tears');
    expect(new Set(seen)).toEqual(new Set(['poke', 'guard']));
  });

  it('무작위(random) 패턴에도 끼어든다', () => {
    const s = battle({ enemies: ['test_phase_random'] });
    expect(foe(s).intent?.moveId).toBe('poke');
    hurt(s, 199);
    expect(foe(s).intent?.moveId).toBe('tears');
  });

  it('적 차례 사이에 조건이 맞으면 다음 의도를 고를 때 끼어든다', () => {
    const s = battle({ enemies: ['test_phase'] });
    foe(s).hp = 150;
    endTurn(s);
    expect(foe(s).intent?.moveId).toBe('tears');
  });
});

describe('모듈 적 배율(content.enemyScale)', () => {
  const runAt = (difficulty: 'normal' | 'hard') => createRunAt(data, 'SCALE1', 's4', { difficulty });
  const enc = (base: Encounter, scale?: { hp?: number; dmg?: number }): Encounter => ({
    node: base.node,
    module: { ...base.module, content: { ...base.module.content, enemyScale: scale } },
  });
  const battleEnc = (difficulty: 'normal' | 'hard'): [ReturnType<typeof runAt>, Encounter] => {
    const run = runAt(difficulty);
    const module = data.modules.get('s4_battle_ore_spiders')!;
    const node = { ...run.map.floors[1][0], type: 'battle' as const };
    return [run, { node, module }];
  };

  it('배율이 적 체력·피해 배율에 곱해지고, 항목이 없으면 1', () => {
    const [run, base] = battleEnc('normal');
    const plain = battleSetupFor(data, run, enc(base, undefined));
    const scaled = battleSetupFor(data, run, enc(base, { hp: 1.25, dmg: 1.1 }));
    expect(scaled.enemyHpScale).toBeCloseTo((plain.enemyHpScale ?? 1) * 1.25);
    expect(scaled.enemyDmgScale).toBeCloseTo((plain.enemyDmgScale ?? 1) * 1.1);
    const only = battleSetupFor(data, run, enc(base, { hp: 0.85 }));
    expect(only.enemyDmgScale).toBeCloseTo(plain.enemyDmgScale ?? 1);
    // 실제 적 최대 체력에 들어간다
    const a = createBattle(data, plain);
    const b = createBattle(data, scaled);
    expect(Math.abs(b.enemies[0].maxHp - a.enemies[0].maxHp * 1.25)).toBeLessThanOrEqual(1);
  });

  it('어려움 배율과 곱해진다', () => {
    const [normal, nBase] = battleEnc('normal');
    const [hard, hBase] = battleEnc('hard');
    const n0 = battleSetupFor(data, normal, enc(nBase, undefined)).enemyHpScale ?? 1;
    const h0 = battleSetupFor(data, hard, enc(hBase, undefined)).enemyHpScale ?? 1;
    const h1 = battleSetupFor(data, hard, enc(hBase, { hp: 1.2 })).enemyHpScale ?? 1;
    expect(h0).toBeGreaterThan(n0);
    expect(h1).toBeCloseTo(h0 * 1.2);
  });
});

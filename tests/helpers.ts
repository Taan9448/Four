import { createBattle, type BattleSetup } from '../src/engine/battle';
import { gameData } from '../src/engine/data';
import { createRng } from '../src/engine/rng';
import { EnemyDef } from '../src/engine/schema';
import type { BattleState, CardInstance } from '../src/engine/state';
import fixtureEnemies from './fixtures-enemies.json';

export const data = gameData();
/** 등급 배율(balance.enemyTiers)은 밸런스 수치라 규칙 시험에서는 끈다(tests/difficulty.test.ts가 따로 본다) */
export const enemyTiers = data.balance.enemyTiers;
data.balance.enemyTiers = {};

// 엔진 테스트용 적: 게임 데이터의 수치가 바뀌어도 엔진 규칙 테스트가 흔들리지 않게 고정 수치로 따로 둔다
for (const e of fixtureEnemies) if (!data.enemies.has(e.id)) data.enemies.set(e.id, EnemyDef.parse(e));

export function cards(...ids: string[]): CardInstance[] {
  return ids.map((cardId, i) => ({ uid: `t${i}`, cardId, level: 0 }));
}

/** 시험용 전투. 치명타는 기본으로 끈다(수치를 정확히 보려고). 치명타 시험은 state.noCrit = false */
export function battle(overrides: Partial<BattleSetup> = {}): BattleState {
  const s = createBattle(data, {
    world: 'elheim',
    party: [{ id: 'haun', hp: 60, maxHp: 60 }],
    enemies: ['test_wolf'],
    deck: cards('haun_chop', 'haun_chop', 'haun_step', 'haun_step', 'haun_read_grain'),
    mana: 10,
    rng: createRng('test'),
    supportActive: false,
    ...overrides,
  });
  s.noCrit = true;
  return s;
}

/** 손패에 특정 카드를 강제로 넣는다(테스트용) */
export function give(state: BattleState, cardId: string): number {
  state.hand.push({ uid: `g${state.hand.length}-${cardId}`, cardId, level: 0 });
  return state.hand.length - 1;
}

export function clearEvents(state: BattleState): void {
  state.events = [];
}

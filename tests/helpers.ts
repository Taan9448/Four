import { createBattle, type BattleSetup } from '../src/engine/battle';
import { gameData } from '../src/engine/data';
import { createRng } from '../src/engine/rng';
import type { BattleState, CardInstance } from '../src/engine/state';

export const data = gameData();

export function cards(...ids: string[]): CardInstance[] {
  return ids.map((cardId, i) => ({ uid: `t${i}`, cardId, upgraded: false }));
}

export function battle(overrides: Partial<BattleSetup> = {}): BattleState {
  return createBattle(data, {
    world: 'elheim',
    party: [{ id: 'haun', hp: 60, maxHp: 60 }],
    enemies: ['shadow_wolf'],
    deck: cards('haun_chop', 'haun_chop', 'haun_step', 'haun_step', 'haun_read_grain'),
    mana: 10,
    rng: createRng('test'),
    supportActive: false,
    ...overrides,
  });
}

/** 손패에 특정 카드를 강제로 넣는다(테스트용) */
export function give(state: BattleState, cardId: string): number {
  state.hand.push({ uid: `g${state.hand.length}-${cardId}`, cardId, upgraded: false });
  return state.hand.length - 1;
}

export function clearEvents(state: BattleState): void {
  state.events = [];
}

// 전투 상태 타입과 작은 도우미.
import type { CardDef, Cost, Effect, Keyword, SupportRule, World } from './schema';
import type { GameData } from './data';
import type { Rng } from './rng';

export type Side = 'party' | 'enemy';

export interface Combatant {
  uid: string;
  defId: string;
  name: string;
  side: Side;
  hp: number;
  maxHp: number;
  block: number;
  statuses: Record<string, number>;
  /** 아군: 쓰러짐 / 적: 처치됨 */
  downed: boolean;
}

export interface Intent {
  moveId: string;
  name: string;
  kind: 'attack' | 'defend' | 'buff' | 'debuff' | 'special';
  targetUid: string | null;
}

export interface EnemyState extends Combatant {
  side: 'enemy';
  moveCursor: number;
  lastMoves: string[];
  intent: Intent | null;
}

export interface CardInstance {
  uid: string;
  cardId: string;
  upgraded: boolean;
}

export type BattleEvent =
  | { type: 'turn'; turn: number }
  | { type: 'card'; cardId: string; sourceUid: string | null }
  | { type: 'attack'; sourceUid: string; targetUids: string[] }
  | { type: 'damage'; sourceUid: string | null; targetUid: string; amount: number; blocked: number; grain: boolean; absorbed: boolean }
  | { type: 'block'; targetUid: string; amount: number }
  | { type: 'heal'; targetUid: string; amount: number }
  | { type: 'status'; targetUid: string; status: string; stacks: number }
  | { type: 'rift'; value: number; delta: number }
  | { type: 'surge' }
  | { type: 'echo' }
  | { type: 'support'; ruleId: string; name: string }
  | { type: 'downed'; uid: string }
  | { type: 'death'; uid: string }
  | { type: 'skip'; uid: string }
  | { type: 'enemy_action'; uid: string; moveName: string }
  | { type: 'dead_draw'; cardId: string }
  | { type: 'result'; result: 'victory' | 'defeat' }
  | { type: 'survived'; turns: number };

export interface BattleState {
  data: GameData;
  rng: Rng;
  world: World;
  turn: number;
  neigong: number;
  mana: number;
  rift: number;
  party: Combatant[];
  enemies: EnemyState[];
  draw: CardInstance[];
  hand: CardInstance[];
  discard: CardInstance[];
  exhaust: CardInstance[];
  events: BattleEvent[];
  log: string[];
  result: 'victory' | 'defeat' | null;
  /** 이 턴 수를 버티면 승리(이길 수 없는 전투). null이면 일반 전투 */
  surviveTurns: number | null;
  /** 버티기로 끝난 전투 */
  survived: boolean;
  supportRules: SupportRule[];
  supportUsed: string[];
  flags: string[];
  scar: number;
  uidCounter: number;
}

export interface ResolvedCard {
  def: CardDef;
  cost: Cost;
  effects: Effect[];
  keywords: Keyword[];
  upgraded: boolean;
}

export function resolveCard(data: GameData, inst: CardInstance | string): ResolvedCard {
  const cardId = typeof inst === 'string' ? inst : inst.cardId;
  const upgraded = typeof inst === 'string' ? false : inst.upgraded;
  const def = data.cards.get(cardId);
  if (!def) throw new Error(`알 수 없는 카드: ${cardId}`);
  const up = upgraded ? def.upgrade : undefined;
  return {
    def,
    cost: up?.cost ?? def.cost,
    effects: up?.effects ?? def.effects,
    keywords: def.keywords,
    upgraded,
  };
}

export function isFusion(card: ResolvedCard): boolean {
  return card.cost.neigong > 0 && card.cost.mana > 0;
}

export function alive<T extends Combatant>(list: T[]): T[] {
  return list.filter((c) => !c.downed);
}

export function findCombatant(state: BattleState, uid: string): Combatant | undefined {
  return state.party.find((c) => c.uid === uid) ?? state.enemies.find((c) => c.uid === uid);
}

export function statusName(state: BattleState, id: string): string {
  return state.data.statuses.get(id)?.name ?? id;
}

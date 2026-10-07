// 전투 상태 타입과 작은 도우미.
import type { CardDef, Cost, Effect, Keyword, SupportRule, UpgradeSkill, World } from './schema';
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
  /** 강화 단계 0~5 */
  level: number;
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
  | { type: 'transform'; uid: string; from: string; into: string; text: string }
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
  /** 강화 단계 0~5 */
  level: number;
  /** 성장 적용된 기본 효과(특수 스킬 효과 제외) — 카드 문구용 */
  baseEffects: Effect[];
  /** 열린 특수 스킬(+4, +5) */
  skills: UpgradeSkill[];
}

/** 강화 단계를 반영한 카드. +1~+3은 수치 성장, +4·+5는 특수 스킬 */
export function resolveCard(data: GameData, inst: CardInstance | string): ResolvedCard {
  const cardId = typeof inst === 'string' ? inst : inst.cardId;
  const def = data.cards.get(cardId);
  if (!def) throw new Error(`알 수 없는 카드: ${cardId}`);
  const up = def.upgrade;
  const level = up ? Math.min(typeof inst === 'string' ? 0 : inst.level, data.balance.upgrade.maxLevel) : 0;
  const steps = Math.min(level, data.balance.upgrade.statLevels);
  const baseEffects = def.effects.map((e, i) => {
    const g = (up?.growth[i] ?? 0) * steps;
    if (!g) return e;
    return e.amount !== undefined ? { ...e, amount: e.amount + g } : { ...e, stacks: (e.stacks ?? 0) + g };
  });
  const skills = up ? [up.plus4, up.plus5].slice(0, Math.max(0, level - data.balance.upgrade.statLevels)) : [];
  let cost = def.cost;
  let keywords = [...def.keywords];
  for (const sk of skills) {
    if (sk.cost) cost = sk.cost;
    keywords = keywords.filter((k) => !sk.removeKeywords.includes(k));
    for (const k of sk.addKeywords) if (!keywords.includes(k)) keywords.push(k);
  }
  return { def, cost, effects: [...baseEffects, ...skills.flatMap((s) => s.effects)], keywords, level, baseEffects, skills };
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

// 전투 상태 타입과 작은 도우미.
import type { CardDef, CharacterDef, Cost, Effect, Element, Keyword, SupportRule, UpgradeSkill, World, WorldMana } from './schema';
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
  /** 아군 레벨(치명타 확률에 더해진다). 적은 없음 */
  level?: number;
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
  | { type: 'damage'; sourceUid: string | null; targetUid: string; amount: number; blocked: number; grain: boolean; absorbed: boolean; crit?: boolean; element?: Element; weak?: boolean; resisted?: boolean }
  | { type: 'block'; targetUid: string; amount: number }
  | { type: 'heal'; targetUid: string; amount: number }
  | { type: 'status'; targetUid: string; status: string; stacks: number }
  | { type: 'rift'; value: number; delta: number }
  | { type: 'surge' }
  | { type: 'neigong_max'; value: number }
  | { type: 'echo' }
  | { type: 'support'; ruleId: string; name: string }
  | { type: 'relic'; relicId: string; name: string }
  | { type: 'potion'; potionId: string; name: string }
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
  /** 턴마다 다시 차는 내공(balance.neigongPerTurn에서 시작, 내공의 실이 줄인다) */
  neigongMax: number;
  /** 이 전투의 마나 규칙(세계 → 스테이지 → 모듈 순으로 덮어쓴 것) */
  manaRule: WorldMana;
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
  /** 가진 유물 id(전투 안 trigger: battleStart·turnStart·enemyDowned) */
  relics: string[];
  /** 물약 칸(빈 칸은 null). 쓰면 비고, 전투 결과로 런에 돌려준다 */
  potions: (string | null)[];
  flags: string[];
  scar: number;
  uidCounter: number;
  /** 적 최대 체력 배율(스테이지 enemyHpScale, 변신한 모습에도) */
  enemyHpScale?: number;
  /** 적 공격 피해 배율(스테이지 enemyDmgScale). 의도·받을 피해 예고에도 같이 걸린다 */
  enemyDmgScale?: number;
  /** 치명타 전용 수열(전투 RNG에서 떼어 냄). 다른 무작위와 섞이지 않게 */
  critRng?: Rng;
  /** 치명타를 굴리지 않는다: 피해 미리보기 복제(미래의 운을 화면에 흘리지 않게)·수치 시험 */
  noCrit?: boolean;
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

/** 복장: 런 플래그에 맞는 스프라이트 세트(뒤에 적힌 복장이 우선, 빠진 키는 기본 sprites) */
export function spritesFor(def: CharacterDef, flags: readonly string[]): Record<string, string> {
  let sprites = { ...def.sprites };
  for (const o of def.outfits) if (flags.includes(o.flag)) sprites = { ...sprites, ...o.sprites };
  return sprites;
}

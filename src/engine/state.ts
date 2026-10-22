// 전투 상태 타입과 작은 도우미.
import type { CardDef, CharacterDef, Cost, Effect, Element, ForgeMod, Keyword, SupportRule, UpgradeSkill, World, WorldMana } from './schema';
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
  /** 등급 피해 배율(balance.enemyTiers) */
  dmgMul?: number;
  /** 이 전투에서 쓴 한 번만 행동(oncePerBattle) */
  usedOnce?: string[];
  /** 이 전투에서 이미 끼어든 단계 기술(MoveDef.phase) */
  phaseFired?: string[];
  /** 끼어들었지만 아직 쓰지 못한 단계 기술(빙결·마비로 차례를 건너면 다음 의도로 남는다) */
  phasePending?: string;
  /** 심연 접사(data/abyss_affixes.json) */
  affixes?: string[];
  /** 격노가 시작되는 턴(숙적 성장으로 당겨지거나 옅은 잔향으로 늦춰진다. 없으면 정의의 afterTurn) */
  enrageAt?: number;
  /** 흐름 포식이 먹는 양 배율(심연 숙적의 옅은 잔향. 없으면 1) */
  feedMul?: number;
  /** 변신한 모습의 체력 배율(심연 숙적: 굽이 배율 대신. 없으면 전투의 enemyHpScale) */
  transformHpScale?: number;
  /** 보스 2막(모듈 content.bossGate): 아직 열리지 않은 관문 · 1막 동안 잠든 특성 */
  gate?: { ratio: number; text: string; refill: boolean; surge: boolean; partyEffects: Effect[] };
  heldTraits?: Record<string, number>;
  moveCursor: number;
  lastMoves: string[];
  /** 순서형(cycle) 적이 이번 바퀴에 이미 쓴 행동(바퀴를 다 돌면 비운다) */
  roundUsed?: string[];
  intent: Intent | null;
}

export interface CardInstance {
  uid: string;
  cardId: string;
  /** 강화 단계 0~5(대강화 카드는 10까지) */
  level: number;
  /** 대강화 각인 id(+6~+9에서 고른 순서, data/forge.json) */
  marks?: string[];
  /** 이번 전투에서만 생긴 복제(copy_card): 내면 소멸 */
  temp?: boolean;
}

export type BattleEvent =
  | { type: 'turn'; turn: number }
  | { type: 'card'; cardId: string; sourceUid: string | null }
  | { type: 'attack'; sourceUid: string; targetUids: string[] }
  | { type: 'damage'; sourceUid: string | null; targetUid: string; amount: number; blocked: number; grain: boolean; absorbed: boolean; crit?: boolean; element?: Element; weak?: boolean; resisted?: boolean; conducted?: boolean }
  | { type: 'block'; targetUid: string; amount: number }
  | { type: 'heal'; targetUid: string; amount: number }
  | { type: 'status'; targetUid: string; status: string; stacks: number }
  | { type: 'rift'; value: number; delta: number }
  | { type: 'surge'; count?: number }
  | { type: 'neigong_max'; value: number }
  | { type: 'echo' }
  | { type: 'sealed'; amount: number }
  | { type: 'recall'; cardId: string }
  | { type: 'focus'; member: string; arch?: string }
  | { type: 'copy'; cardId: string }
  | { type: 'purge'; cardId: string }
  | { type: 'scar'; delta: number }
  | { type: 'support'; ruleId: string; name: string }
  | { type: 'relic'; relicId: string; name: string }
  | { type: 'potion'; potionId: string; name: string }
  | { type: 'power'; uid: string; status: string }
  | { type: 'enrage'; uid: string; text: string }
  | { type: 'summon'; uid: string; sourceUid: string | null }
  | { type: 'discard'; cardId: string }
  | { type: 'downed'; uid: string }
  | { type: 'death'; uid: string }
  | { type: 'transform'; uid: string; from: string; into: string; text: string }
  /** 보스 2막이 열렸다(모듈 content.bossGate) */
  | { type: 'gate'; uid: string; name: string; text: string }
  /** 이 적이 쓰러져 폭주 하나가 메워졌다(EnemyDef.sealsSurge) */
  | { type: 'sealSurge'; uid: string }
  | { type: 'skip'; uid: string }
  | { type: 'enemy_action'; uid: string; moveName: string }
  /** 단계 기술이 다음 의도로 끼어들었다(MoveDef.phase) */
  | { type: 'phase'; uid: string; moveName: string }
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
  /** 이 전투의 차례 끝 균열 감쇠(모듈 content.riftDecay). 없으면 세계 기본값 */
  riftDecay?: number;
  /** 감쇠를 덮어쓴 까닭(게이지 주석) */
  riftDecayNote?: string;
  /** 적 공격 피해 배율(스테이지 enemyDmgScale). 의도·받을 피해 예고에도 같이 걸린다 */
  enemyDmgScale?: number;
  /** 적의 피해 한 번의 상한(심연의 한 방 상한, 받을 피해 예고에도) */
  enemyHitCap?: number;
  /** 심연 굽이의 법칙: 손패 수 덮어쓰기, 적 의도 감추기(화면만), 모든 적의 격노 */
  handSize?: number;
  hideIntent?: boolean;
  /** 안개 속의 눈(reveal_intent)을 쓴 차례: 이 차례에는 hideIntent여도 의도가 보인다 */
  intentRevealTurn?: number;
  lawEnrage?: { afterTurn: number; text: string; effects: Effect[] }[];
  /** 치명타 전용 수열(전투 RNG에서 떼어 냄). 다른 무작위와 섞이지 않게 */
  critRng?: Rng;
  /** 적 AI의 방어 기억: 적 차례가 시작될 때 아군 1명당 평균 방어(최근 balance.enemyAi.blockMemory 차례) */
  aiBlockSeen?: number[];
  /** 결과 화면용 전투 집계(처치·준 피해·치명타·균열 폭주·쓴 카드·하운을 마지막으로 때린 것) */
  tally?: BattleTally;
  /** cardPlayed 유물의 every 셈(유물 id → 맞는 카드 수) */
  relicCounters?: Record<string, number>;
  /** 이번 턴에 낸 카드 수(scale per cardsPlayed: 이 카드 전까지) */
  cardsPlayed?: number;
  /** 상태 발동이 다른 발동을 부른 깊이(무한 되갚기 방지) */
  triggerDepth?: number;
  /** 치명타를 굴리지 않는다: 피해 미리보기 복제(미래의 운을 화면에 흘리지 않게)·수치 시험 */
  noCrit?: boolean;
  /** 이 전투에서 일어난 폭주 수(n번째 폭주의 체력 손실 ×n) */
  surgeCount?: number;
  /** 폭주 체력 손실 배율(첫 폭주 안내 전투 ½ · 바늘쌈 ½) */
  surgeDamageMul?: number;
  /** 이 카드가 consume_rift로 소비한 균열(카드를 낼 때마다 0으로) */
  consumed?: number;
  /** 규칙 유물 half_echo: 들어오려던 잔향 수 */
  echoSkips?: number;
  /** 한 전투에 한 번만인 효과(카드 id:동작)를 이미 쓴 것 */
  onceUsed?: string[];
}

export interface BattleTally {
  kills: number;
  damage: number;
  crits: number;
  surges: number;
  /** 균열 폭주로 잃은 체력(아군 합) */
  surgeHp?: number;
  /** 폭주로 쌓인 상흔(전투 결과에 더한다) */
  surgeScar?: number;
  cards: Record<string, number>;
  haunHitBy?: string;
  /** 심연 업적: 터뜨린 결 노출 수, 쓰러뜨린 접사 붙은 적 수 */
  grain?: number;
  affixKills?: number;
  /** 밸런스 측정(적 AI 쏠림): '적 id:행동 id' → 쓴 횟수, 1턴에 쓴 횟수 */
  moveUse?: Record<string, number>;
  moveOpen?: Record<string, number>;
  /** 적 id → 이 전투에서 쓴 행동 id(도감에 적는다) */
  moves?: Record<string, string[]>;
}

export interface ResolvedCard {
  def: CardDef;
  cost: Cost;
  effects: Effect[];
  keywords: Keyword[];
  /** 강화 단계 0~5(대강화 카드는 10까지) */
  level: number;
  /** 성장·대강화 변형이 적용된 기본 효과(특수 스킬·붙는 효과 제외) — 카드 문구용. 두 번(공명)은 effects에만 */
  baseEffects: Effect[];
  /** 열린 특수 스킬(+4, +5) */
  skills: UpgradeSkill[];
  /** 대강화 단계 0~5(+6 = 1 … +10 = 5) */
  forge: number;
  /** 새긴 각인(+6~+9에서 고른 순서)과 +10 각성 */
  engravings: ForgeMod[];
  awakening: ForgeMod | null;
}

/** 이 카드의 강화 상한: 대강화 등급(영웅·전설)이면 +10, 아니면 +5 */
export function forgeMax(data: GameData, def: CardDef): number {
  const up = data.balance.upgrade;
  return def.upgrade && up.forge.rarities.includes(def.rarity as never) ? up.maxLevel + up.forge.chance.length : up.maxLevel;
}

const BUFF_TARGETS = new Set(['self', 'ally', 'all_allies']);

/** 수치 배율: 피해·방어·회복의 양(비례 양·상한 포함)과 이로운 쪽에 거는 상태 스택. ops가 있으면 그 동작의 양만. 정수는 반올림 */
function scaleNumbers(data: GameData, e: Effect, mul: number, ops?: string[]): Effect {
  const m = (v: number) => (Number.isInteger(v) ? Math.round(v * mul) : v * mul);
  if (ops ? ops.includes(e.op) : e.op === 'damage' || e.op === 'block' || e.op === 'heal') {
    if (e.op !== 'damage' && e.op !== 'block' && e.op !== 'heal') return e;
    return {
      ...e,
      ...(e.amount !== undefined ? { amount: m(e.amount) } : {}),
      ...(e.scale ? { scale: { ...e.scale, amount: m(e.scale.amount), ...(e.scale.max !== undefined ? { max: m(e.scale.max) } : {}) } } : {}),
    };
  }
  if (!ops && e.op === 'apply_status' && e.stacks !== undefined && e.status) {
    const kind = data.statuses.get(e.status)?.kind;
    const mine = BUFF_TARGETS.has(e.target ?? 'self');
    if ((kind === 'buff' && mine) || (kind === 'debuff' && !mine)) return { ...e, stacks: m(e.stacks) };
  }
  return e;
}

/** 대가: 균열 +, 자기 체력 잃기, 상흔 + */
export function isPrice(e: Effect): boolean {
  return ((e.op === 'rift' || e.op === 'scar') && (e.amount ?? 0) > 0) || (e.op === 'lose_hp' && e.target === 'self');
}

/** 적에게 거는 해로운 상태 */
export function isEnemyDebuff(data: GameData, e: Effect, cardTarget?: string): boolean {
  if (e.op !== 'apply_status' || !e.status || data.statuses.get(e.status)?.kind !== 'debuff') return false;
  return !BUFF_TARGETS.has(e.target ?? (cardTarget === 'enemy' || cardTarget === 'all_enemies' ? 'enemy' : 'self'));
}

/**
 * 각인·각성 하나로 효과 목록을 바꾼다(GAME_DESIGN 16절 ⑦). 수치 → 동작별 배율 → 속성 → 타수 → 상태 스택 → 대가.
 * firstDamage: 타수는 카드 전체에서 첫 피해 효과 하나만
 */
function applyMod(data: GameData, list: Effect[], mod: ForgeMod, extraMul: number, cardTarget: string | undefined, hits: { done: boolean }): Effect[] {
  const mul = (mod.numberMul ?? 1) * extraMul;
  return list.map((e0) => {
    let e = mul !== 1 ? scaleNumbers(data, e0, mul) : e0;
    if (mod.opsMul) e = scaleNumbers(data, e, mod.opsMul.mul, mod.opsMul.ops);
    if (mod.element && e.op === 'damage' && !e.element) e = { ...e, element: mod.element };
    if (mod.extraHits && e.op === 'damage' && !hits.done) {
      hits.done = true;
      e = { ...e, times: (e.times ?? 1) + mod.extraHits };
    }
    if (mod.debuffStacks && e.stacks !== undefined && isEnemyDebuff(data, e, cardTarget)) e = { ...e, stacks: e.stacks + mod.debuffStacks };
    if (mod.softenPrice && isPrice(e)) e = { ...e, amount: Math.ceil((e.amount ?? 0) / 2) };
    return e;
  });
}

/**
 * 강화 단계를 반영한 카드. +1~+3은 수치 성장, +4·+5는 특수 스킬.
 * 대강화(영웅·전설, GAME_DESIGN 16절 ⑦): 단계마다 수치 +levelMul, +6~+9에서 고른 각인(inst.marks), +10 카드 주인의 각성(data/forge.json)
 */
export function resolveCard(data: GameData, inst: CardInstance | string): ResolvedCard {
  const cardId = typeof inst === 'string' ? inst : inst.cardId;
  const def = data.cards.get(cardId);
  if (!def) throw new Error(`알 수 없는 카드: ${cardId}`);
  const up = def.upgrade;
  const bal = data.balance.upgrade;
  const level = up ? Math.min(typeof inst === 'string' ? 0 : inst.level, forgeMax(data, def)) : 0;
  const forge = Math.max(0, level - bal.maxLevel);
  const steps = Math.min(level, bal.statLevels);
  let baseEffects = def.effects.map((e, i) => {
    const g = (up?.growth[i] ?? 0) * steps;
    if (!g) return e;
    return e.amount !== undefined ? { ...e, amount: e.amount + g } : { ...e, stacks: (e.stacks ?? 0) + g };
  });
  let skills = up ? [up.plus4, up.plus5].slice(0, Math.max(0, Math.min(level, bal.maxLevel) - bal.statLevels)) : [];
  let cost = def.cost;
  let keywords = [...def.keywords];
  for (const sk of skills) {
    if (sk.cost) cost = sk.cost;
    keywords = keywords.filter((k) => !sk.removeKeywords.includes(k));
    for (const k of sk.addKeywords) if (!keywords.includes(k)) keywords.push(k);
  }
  const engravings: ForgeMod[] = [];
  let awakening: ForgeMod | null = null;
  let appended: Effect[] = [];
  let repeat = false;
  if (forge > 0) {
    const byId = new Map(data.forge.engravings.map((m) => [m.id, m]));
    const marks = typeof inst === 'string' ? [] : (inst.marks ?? []);
    for (const id of marks.slice(0, Math.min(forge, bal.forge.chance.length - 1))) {
      const m = byId.get(id);
      if (m && !engravings.includes(m)) engravings.push(m);
    }
    if (forge >= bal.forge.chance.length) awakening = data.forge.awakenings[def.owner] ?? data.forge.awakenings.common ?? null;
    // 단계 수치는 첫 변형에 실어 한 번만
    const mods: { mod: ForgeMod; mul: number }[] = [
      { mod: { id: '_level', name: '', glyph: '', text: '', when: {}, addKeywords: [], removeKeywords: [], append: [] }, mul: 1 + bal.forge.levelMul * forge },
      ...engravings.map((mod) => ({ mod, mul: 1 })),
      ...(awakening ? [{ mod: awakening, mul: def.rarity === 'legendary' ? data.forge.legendaryAwakenMul : 1 }] : []),
    ];
    const hits = { done: false };
    for (const { mod, mul } of mods) {
      baseEffects = applyMod(data, baseEffects, mod, mul, def.target, hits);
      skills = skills.map((sk) => ({ ...sk, effects: applyMod(data, sk.effects, mod, mul, def.target, hits) }));
      if (mod.cost) {
        const d = mod.cost;
        cost = cost.neigong > 0 ? { ...cost, neigong: Math.max(0, cost.neigong + d) } : cost.mana > 0 ? { ...cost, mana: Math.max(0, cost.mana + d) } : cost;
      }
      keywords = keywords.filter((k) => !mod.removeKeywords.includes(k));
      for (const k of mod.addKeywords) if (!keywords.includes(k)) keywords.push(k);
      appended = [...appended, ...mod.append];
      if (mod.repeat) repeat = true;
    }
  }
  const once = [...baseEffects, ...skills.flatMap((s) => s.effects), ...appended];
  return { def, cost, effects: repeat ? [...once, ...once] : once, keywords, level, baseEffects, skills, forge, engravings, awakening };
}

export function isFusion(card: ResolvedCard): boolean {
  return card.cost.neigong > 0 && card.cost.mana > 0;
}

export function alive<T extends Combatant>(list: T[]): T[] {
  return list.filter((c) => !c.downed);
}

/**
 * 일행의 앞장: 하운, 하운이 출전하지 않았으면(순례 자유 편성, 2026-10-11) 맨 앞 동료.
 * 공용 카드·물약·전투 시작 효과의 출처. standing이면 쓰러지지 않은 이 중에서
 */
export function leader(state: BattleState, standing = false): Combatant {
  const list = standing ? alive(state.party) : state.party;
  return list.find((p) => p.defId === 'haun') ?? list[0] ?? state.party[0];
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
  for (const o of def.outfits) if (!o.flag || flags.includes(o.flag)) sprites = { ...sprites, ...o.sprites };
  return sprites;
}

/** 굽이의 법칙 '안개'로 적 의도가 가려졌는가(안개 속의 눈을 쓴 차례에는 보인다) */
export function intentHidden(state: BattleState): boolean {
  return !!state.hideIntent && state.intentRevealTurn !== state.turn;
}

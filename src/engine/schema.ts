// 데이터(JSON) 스키마. 타입의 단일 기준이며, `npm run data:check`가 이 스키마로 data/를 검사한다.
import { z } from 'zod';

export const WORLDS = ['murim', 'elheim', 'nocturna', 'rift'] as const;
export const World = z.enum(WORLDS);
export type World = z.infer<typeof World>;

/** 전투 효과 기본 동작. 늘릴 때는 docs/CARD_EFFECTS.md와 테스트를 함께 갱신한다. */
export const BATTLE_OPS = [
  'damage',
  'block',
  'heal',
  'gain_neigong',
  'gain_mana',
  'draw',
  'discard',
  'apply_status',
  'remove_status',
  'rift',
  'reveal_grain',
  'taunt',
  'add_card',
] as const;

/** 런 단위 동작. 이벤트·휴식·지원 규칙에서만 쓴다. */
export const RUN_OPS = [
  'gain_card',
  'remove_card',
  'upgrade_card',
  'heal_party',
  'gain_run_mana',
  'scar',
  'set_flag',
  'join_party',
  'leave_party',
] as const;

export const Target = z.enum([
  'self', // 효과를 일으킨 쪽(카드 주인 / 행동하는 적)
  'ally', // 카드가 지정한 아군
  'enemy', // 카드가 지정한 적 / 적 행동의 대상
  'all_enemies',
  'all_allies',
  'random_enemy',
  'trigger_enemy', // 지원 규칙을 일으킨 적
]);
export type Target = z.infer<typeof Target>;

export const Condition = z
  .object({
    riftGte: z.number(),
    riftLte: z.number(),
    targetHasStatus: z.string(),
    targetStatusGte: z.tuple([z.string(), z.number()]),
    world: z.union([World, z.array(World)]),
    partyHas: z.string(),
    turnMod: z.tuple([z.number().int().positive(), z.number().int().nonnegative()]),
    enemyId: z.string(),
    hpRatioLte: z.number(),
    flag: z.string(),
    scarMin: z.number(),
    floorRange: z.tuple([z.number(), z.number()]),
  })
  .partial()
  .strict();
export type Condition = z.infer<typeof Condition>;

export const Scale = z
  .object({
    per: z.enum(['rift', 'targetStatus', 'hand', 'mana']),
    status: z.string().optional(),
    amount: z.number(),
  })
  .strict();
export type Scale = z.infer<typeof Scale>;

export const Effect = z
  .object({
    op: z.enum([...BATTLE_OPS, ...RUN_OPS]),
    amount: z.number().optional(),
    ratio: z.number().optional(),
    times: z.number().int().positive().optional(),
    target: Target.optional(),
    status: z.string().optional(),
    stacks: z.number().optional(),
    card: z.string().optional(),
    to: z.enum(['hand', 'draw', 'discard']).optional(),
    count: z.number().int().positive().optional(),
    member: z.string().optional(),
    flag: z.string().optional(),
    filter: z
      .object({ pool: z.string(), owner: z.string(), costNeigongGte: z.number() })
      .partial()
      .strict()
      .optional(),
    /** upgrade_card: 사람이 강화할 카드를 고른다(휴식 노드의 수련) */
    choose: z.boolean().optional(),
    condition: Condition.optional(),
    scale: Scale.optional(),
  })
  .strict();
export type Effect = z.infer<typeof Effect>;

export const Cost = z.object({ neigong: z.number().int().min(0), mana: z.number().int().min(0) }).strict();
export type Cost = z.infer<typeof Cost>;

export const Keyword = z.enum(['exhaust', 'retain', 'innate', 'fusion', 'unplayable']);
export type Keyword = z.infer<typeof Keyword>;

export const Rarity = z.enum(['common', 'uncommon', 'rare', 'epic', 'legendary', 'special']);
export type Rarity = z.infer<typeof Rarity>;
/** 반신 그림 표정: 기본·결의·놀람(에셋 <캐릭터>_stand의 프레임 1·2·3) */
export const Face = z.enum(['neutral', 'resolve', 'surprise']);
export type Face = z.infer<typeof Face>;

const UpgradeSkill = z
  .object({
    name: z.string(),
    effects: z.array(Effect).default([]),
    addKeywords: z.array(Keyword).default([]),
    removeKeywords: z.array(Keyword).default([]),
    cost: Cost.optional(),
  })
  .strict();
export type UpgradeSkill = z.infer<typeof UpgradeSkill>;

/** 장면에만 나오는 화자(동료가 아닌 인물). 반신 그림 에셋은 <id>_stand */
export const SpeakerDef = z.object({ id: z.string(), name: z.string(), color: z.string() }).strict();
export type SpeakerDef = z.infer<typeof SpeakerDef>;

/**
 * 비주얼 노벨 장면: 좌우에 반신 그림, 아래 대화창. speaker가 없으면 내레이션.
 * side 생략: 하운은 왼쪽, 나머지는 오른쪽. name: 이 줄에서만 쓸 표시 이름(예: 정체를 숨긴 인물)
 */
export const SceneLine = z
  .object({
    speaker: z.string().optional(),
    name: z.string().optional(),
    side: z.enum(['left', 'right']).optional(),
    face: Face.default('neutral'),
    text: z.string(),
  })
  .strict();
export type SceneLine = z.infer<typeof SceneLine>;
export const SceneDef = z.object({ id: z.string(), world: World.optional(), lines: z.array(SceneLine).min(1) }).strict();
export type SceneDef = z.infer<typeof SceneDef>;

export const CardDef = z
  .object({
    id: z.string().regex(/^[a-z0-9_]+$/),
    name: z.string(),
    owner: z.string(),
    type: z.enum(['attack', 'skill', 'power', 'status']),
    /** 등급: 일반·고급·희귀·영웅·전설(+ 상태·저주용 special). 영웅·전설은 castLine 필수 */
    rarity: Rarity,
    pool: z.enum(['starter', 'reward', 'story', 'status']),
    cost: Cost,
    target: z.enum(['enemy', 'all_enemies', 'self', 'ally', 'all_allies', 'none']),
    keywords: z.array(Keyword).default([]),
    effects: z.array(Effect),
    text: z.string().optional(),
    flavor: z.string().optional(),
    /** 연출: 카드 주인이 재생할 애니메이션(기본 attack/skill)과 대상 위에 겹칠 이펙트 에셋 id */
    anim: z.enum(['attack', 'skill']).optional(),
    fx: z.string().optional(),
    /** 영웅·전설 카드: 쓸 때마다 반신 그림과 함께 나오는 대사(컷인) */
    castLine: z.object({ speaker: z.string(), face: Face.default('resolve'), text: z.string() }).strict().optional(),
    /**
     * 강화(+1~+5). +1~+3: growth[i]만큼 effects[i]의 수치(amount, 없으면 stacks)가 단계마다 오른다.
     * +4·+5: 이름 붙은 특수 스킬이 붙는다(효과 추가·키워드 추가/제거·비용 변경). 상태·저주 카드는 강화하지 않는다
     */
    upgrade: z
      .object({ growth: z.array(z.number()), plus4: UpgradeSkill, plus5: UpgradeSkill })
      .strict()
      .optional(),
  })
  .strict();
export type CardDef = z.infer<typeof CardDef>;

export const StatusDef = z
  .object({
    id: z.string(),
    name: z.string(),
    kind: z.enum(['buff', 'debuff', 'trait']),
    description: z.string(),
    /** 턴마다 줄어드는 스택 수. 0이면 줄지 않는다. */
    decay: z.number().int().min(0),
    /** ownTurnEnd: 그 편의 턴 종료 때 감소 / roundEnd: 적 턴 종료(라운드 종료) 때 감소 */
    decayAt: z.enum(['ownTurnEnd', 'roundEnd']).default('ownTurnEnd'),
    modifiers: z
      .object({
        damageDealtMul: z.number(),
        damageDealtAddPerStack: z.number(),
        damageTakenMul: z.number(),
        skipTurn: z.boolean(),
        turnStartDamagePerStack: z.number(),
      })
      .partial()
      .strict()
      .default({}),
    /** 엔진이 직접 처리하는 메커니즘(카드 개별 코드가 아님) */
    special: z.enum(['grain', 'taunt', 'incorporeal', 'flow_eater', 'knot', 'knot_exposed']).optional(),
  })
  .strict();
export type StatusDef = z.infer<typeof StatusDef>;

export const MoveDef = z
  .object({
    id: z.string(),
    name: z.string(),
    intent: z.enum(['attack', 'defend', 'buff', 'debuff', 'special']),
    targeting: z.enum(['random', 'lowest_hp', 'highest_hp', 'haun']).default('random'),
    weight: z.number().positive().default(1),
    effects: z.array(Effect),
  })
  .strict();
export type MoveDef = z.infer<typeof MoveDef>;

export const EnemyDef = z
  .object({
    id: z.string(),
    name: z.string(),
    maxHp: z.number().int().positive(),
    sprite: z.string().nullable().default(null),
    tint: z.string().optional(),
    scale: z.number().positive().default(1),
    /** 그림이 없을 때 실루엣 모양(생략하면 보스는 boss, 나머지는 humanoid) */
    silhouette: z.enum(['humanoid', 'beast', 'boss', 'object']).optional(),
    /** 그림이 없을 때 실루엣 색 */
    color: z.string().optional(),
    tier: z.enum(['normal', 'elite', 'boss']).default('normal'),
    traits: z.array(z.object({ status: z.string(), stacks: z.number() }).strict()).default([]),
    pattern: z.enum(['cycle', 'random']),
    moves: z.array(MoveDef).min(1),
    flavor: z.string().optional(),
  })
  .strict();
export type EnemyDef = z.infer<typeof EnemyDef>;

export const CharacterDef = z
  .object({
    id: z.string(),
    name: z.string(),
    title: z.string(),
    role: z.enum(['fighter', 'support']),
    maxHp: z.number().int().positive(),
    color: z.string(),
    sprites: z.record(z.string(), z.string()).default({}),
    starterDeck: z.array(z.string()).default([]),
    joinsAt: z.string(),
    description: z.string(),
  })
  .strict();
export type CharacterDef = z.infer<typeof CharacterDef>;

export const SupportRule = z
  .object({
    id: z.string(),
    source: z.string(),
    name: z.string(),
    description: z.string(),
    trigger: z.enum(['battleStart', 'turnStart', 'riftChanged', 'enemyDamaged', 'restOption']),
    condition: Condition.default({}),
    oncePerBattle: z.boolean().default(false),
    effects: z.array(Effect),
  })
  .strict();
export type SupportRule = z.infer<typeof SupportRule>;

const WorldMana = z
  .object({ battleStart: z.enum(['full', 'carry']), perTurn: z.number().int() })
  .strict();

export const Balance = z
  .object({
    neigongPerTurn: z.number().int().positive(),
    handSize: z.number().int().positive(),
    maxHand: z.number().int().positive(),
    mana: z.object({ max: z.number().int().positive(), restGain: z.number().int(), worlds: z.record(World, WorldMana) }).strict(),
    rift: z
      .object({
        max: z.number().int().positive(),
        decay: z.record(World, z.number().int().min(0)),
        echoThreshold: z.number().int(),
        echoCard: z.string(),
        surgeDamage: z.number().int(),
        surgeResetTo: z.number().int(),
        scarRatio: z.number(),
      })
      .strict(),
    grain: z.object({ damageBonus: z.number(), ignoreBlock: z.boolean(), knotThreshold: z.number().int() }).strict(),
    incorporealMultiplier: z.number(),
    party: z.object({ max: z.number().int().positive(), reviveHp: z.number().int().positive() }).strict(),
    /** 카드 강화: 최대 단계와 수치만 오르는 단계 수(그 위는 특수 스킬) */
    upgrade: z.object({ maxLevel: z.number().int().positive(), statLevels: z.number().int().nonnegative() }).strict(),
    rewards: z
      .object({
        cardChoices: z.number().int().positive(),
        /** 보상 카드 등급 가중치(노드 유형별). 일반은 시작 카드, 전설은 스토리로만 얻는다 */
        rarityWeights: z.record(z.enum(['battle', 'elite', 'boss']), z.partialRecord(Rarity, z.number().min(0))),
      })
      .strict(),
    /** 다음 스테이지로 넘어갈 때 출전 가능 동료 회복 비율(최대 체력 기준) */
    stage: z.object({ healOnEnter: z.number().min(0).max(1) }).strict(),
    route: z
      .object({
        nodesPerFloor: z.tuple([z.number().int().positive(), z.number().int().positive()]),
        eliteMinFloor: z.number().int(),
        extraEdgeChance: z.number(),
        scarWeightPerPoint: z.number(),
      })
      .strict(),
  })
  .strict();
export type Balance = z.infer<typeof Balance>;

export const NodeType = z.enum(['battle', 'elite', 'event', 'rest', 'inn', 'story', 'boss']);
export type NodeType = z.infer<typeof NodeType>;

export const StageDef = z
  .object({
    id: z.string(),
    order: z.number().int(),
    name: z.string(),
    chapters: z.string(),
    world: World,
    floors: z.number().int().positive(),
    playable: z.boolean(),
    pinned: z.array(z.object({ floor: z.number().int().positive(), module: z.string() }).strict()).default([]),
    forcedTypes: z.record(z.string(), NodeType).default({}),
    typeWeights: z.partialRecord(NodeType, z.number()).default({}),
    boss: z.string().nullable(),
    summary: z.string(),
  })
  .strict();
export type StageDef = z.infer<typeof StageDef>;

const Choice = z
  .object({ label: z.string(), condition: Condition.optional(), effects: z.array(Effect), result: z.string().optional() })
  .strict();

export const ModuleDef = z
  .object({
    id: z.string(),
    stage: z.string(),
    type: NodeType,
    name: z.string(),
    weight: z.number().min(0).default(1),
    tags: z.array(z.string()).default([]),
    once: z.boolean().default(false),
    conditions: Condition.default({}),
    content: z
      .object({
        text: z.string().optional(),
        enemies: z.array(z.string()).optional(),
        choices: z.array(Choice).optional(),
        /** 전투 시작 시 조건부 보너스(예: 특정 동료 출전) */
        bonus: z.object({ condition: Condition, text: z.string(), effects: z.array(Effect) }).strict().optional(),
        /** 이 턴 수를 버티면 승리하는 전투(이길 수 없는 전투) */
        surviveTurns: z.number().int().positive().optional(),
        /** 보스 모듈: 스테이지를 마친 뒤 보여 줄 장면 글 */
        outro: z.string().optional(),
        /** 노드에 들어가면 먼저 재생할 비주얼 노벨 장면(data/scenes) */
        scene: z.string().optional(),
        /** 보스 모듈: 이긴 뒤(스테이지 끝 화면 전에) 재생할 장면 */
        outroScene: z.string().optional(),
        /** 보스 모듈: 이기면 런에 적용할 동작(gain_card 등 런 단위 op). 스테이지 끝 화면에 결과를 보여 준다 */
        clearEffects: z.array(Effect).optional(),
      })
      .strict(),
  })
  .strict();
export type ModuleDef = z.infer<typeof ModuleDef>;

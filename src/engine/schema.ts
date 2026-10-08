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
  'dispel',
  'neigong_max',
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

/** 속성(2026-10-08): 피해에 실려 상태를 붙이고(화염 → 화상, 냉기 → 냉기), 적의 약점·내성에 따라 피해가 달라진다 */
export const Element = z.enum(['fire', 'ice']);
export type Element = z.infer<typeof Element>;

export const Effect = z
  .object({
    op: z.enum([...BATTLE_OPS, ...RUN_OPS]),
    amount: z.number().optional(),
    /** damage: 이 피해의 속성(balance.elements) */
    element: Element.optional(),
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

/** thread: 실 카드. '꿰맬 자리'(seam) 상태의 적은 이 키워드 카드의 피해만 받는다 */
export const Keyword = z.enum(['exhaust', 'retain', 'innate', 'fusion', 'unplayable', 'thread']);
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
    /** 생략하면 그 인물의 직전 표정을 유지한다(장면 첫 등장은 기본). src/engine/scene.ts */
    face: Face.optional(),
    text: z.string(),
    /** 이 줄부터 화면 전체에 깔 장면 일러스트(story-cg 에셋 id). "none"이면 걷는다. 실제 그림이 들어오기 전에는 무시한다 */
    cg: z.string().optional(),
    /** 이 줄에서 한 번 일어나는 화면 연출: flash 하얗게 번쩍임, shake 흔들림, fade 어둡게 잠겼다 밝아짐 */
    effect: z.enum(['flash', 'shake', 'fade']).optional(),
  })
  .strict();
export type SceneLine = z.infer<typeof SceneLine>;
export const SceneDef = z
  .object({
    id: z.string(),
    world: World.optional(),
    /** 장면 뒤에 깔 배경 에셋 id(없으면 지금 스테이지의 전투 배경). 실제 그림이 있을 때만 쓴다 */
    background: z.string().optional(),
    lines: z.array(SceneLine).min(1),
  })
  .strict();
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
    /** 피해를 줄 때 맞은 자리에 겹칠 피격 이펙트(생략하면 fx가 없을 때 fx_hit_strike) */
    hitFx: z.string().optional(),
    /** 무공 카드 오른쪽 아래 낙관 글자(한 글자). 생략하면 카드 유형으로 정한다 */
    seal: z.string().length(1).optional(),
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
    /** 아이콘 그림이 없을 때 표시할 한 글자(한자) */
    glyph: z.string().length(1),
    /** 상태 아이콘 시트(icons_status)의 프레임 번호(1부터) */
    icon: z.number().int().positive().optional(),
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
    special: z
      .enum(['grain', 'taunt', 'incorporeal', 'flow_eater', 'knot', 'knot_exposed', 'blood_cover', 'hungry', 'unseen', 'seam', 'chill'])
      .optional(),
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
    /** 이 적의 공격이 맞은 자리에 겹칠 피격 이펙트(생략하면 fx_hit_strike) */
    hitFx: z.string().optional(),
    /** 런 상흔 1마다 늘어나는 최대 체력(마지막 한 땀의 '찢긴 경계': 꿰맬 자리가 많아진다) */
    hpPerScar: z.number().int().min(0).optional(),
    /** 이 적이 쓰러질 때 일어나는 일(적을 출처로 하는 전투 동작). 예: 군단장이 쓰러지면 졸개가 무너진다 */
    deathEffects: z.array(Effect).default([]),
    tier: z.enum(['normal', 'elite', 'boss']).default('normal'),
    traits: z.array(z.object({ status: z.string(), stacks: z.number() }).strict()).default([]),
    /** 속성 약점(받는 피해 × elements.weakMultiplier) · 내성(× resistMultiplier, 그 속성 상태가 붙지 않는다) */
    weak: z.array(Element).default([]),
    resist: z.array(Element).default([]),
    pattern: z.enum(['cycle', 'random']),
    moves: z.array(MoveDef).min(1),
    /**
     * 변신(보스 2단계). downed: 쓰러질 자리에서 대신 변신 / lastStanding: 다른 적이 모두 쓰러져 혼자 남으면 변신 /
     * partnerDowned: partner로 지정한 적이 쓰러지면 변신(사무결 ← 곽도진의 피, 셀리아스 ← 왕녀의 얼음).
     * into의 적 정의로 바뀌고 체력은 가득, 상태는 into의 traits로 다시 시작한다. 변신한 차례에는 행동하지 않는다.
     * partyEffects: 변신 순간 하운을 출처로 아군 쪽에 일어나는 일(원작 연출: 동료의 도움 등)
     */
    transform: z
      .object({
        triggers: z.array(z.enum(['downed', 'lastStanding', 'partnerDowned'])).min(1),
        partner: z.string().optional(),
        into: z.string(),
        text: z.string(),
        partyEffects: z.array(Effect).default([]),
      })
      .strict()
      .optional(),
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
    /** 복장: 런 플래그가 서면 sprites 대신 쓸 스프라이트 세트(뒤에 적힌 것이 우선). 예: 하운 '못생긴 검' */
    outfits: z.array(z.object({ flag: z.string(), sprites: z.record(z.string(), z.string()) }).strict()).default([]),
    /** 전투 화면의 스프라이트 배율(그림마다 프레임 안 키가 달라 동료끼리 키를 맞출 때). 기본 1 */
    scale: z.number().positive().default(1),
    /** 치명타 확률(0~1). 없으면 balance.crit.chance */
    crit: z.number().min(0).max(1).optional(),
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

/** 전투 마나 규칙. battleStart: full 가득 / carry 런 마나 이월 / 숫자 그 값으로 시작 */
export const WorldMana = z
  .object({ battleStart: z.union([z.enum(['full', 'carry']), z.number().int().min(0)]), perTurn: z.number().int() })
  .strict();
export type WorldMana = z.infer<typeof WorldMana>;

export const Balance = z
  .object({
    neigongPerTurn: z.number().int().positive(),
    handSize: z.number().int().positive(),
    maxHand: z.number().int().positive(),
    mana: z.object({ max: z.number().int().positive(), worlds: z.record(World, WorldMana) }).strict(),
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
    /** 속성: 실리는 상태와 스택, 약점·내성 배율, 냉기가 몇 스택이면 얼어붙는가(보스는 bossFreezeAt) */
    elements: z
      .object({
        fire: z.object({ status: z.string(), stacks: z.number().int().positive() }).strict(),
        ice: z.object({ status: z.string(), stacks: z.number().int().positive() }).strict(),
        weakMultiplier: z.number(),
        resistMultiplier: z.number(),
        freezeAt: z.number().int().positive(),
        bossFreezeAt: z.number().int().positive(),
        freezeStatus: z.string(),
      })
      .strict(),
    /** 치명타: 아군 카드의 피해 한 번마다 굴린다(캐릭터의 crit이 확률을 덮어쓴다) */
    crit: z.object({ chance: z.number().min(0).max(1), multiplier: z.number() }).strict(),
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
    /** 이 스테이지가 캠페인의 끝이면, 마치기 뒤 엔딩 화면 전에 재생할 장면(에필로그) */
    endingScene: z.string().optional(),
    summary: z.string(),
    /** 전투 배경 에셋 id(모듈의 background가 우선) */
    background: z.string().optional(),
    /** 지도 화면의 지역 지도 그림 에셋 id */
    mapArt: z.string().optional(),
    /** 이 스테이지 전투의 마나 규칙(생략하면 세계 기본값 balance.mana.worlds). 예: 아르덴의 얼어붙은 마나 */
    mana: WorldMana.optional(),
    /** 지도 위쪽 여정 띠에서 이 스테이지의 자리(띠 그림 기준 %)·이름·지역. 지역은 처음 들어설 때 안개가 걷힌다(GAME_DESIGN 14절) */
    journey: z
      .object({
        label: z.string(),
        x: z.number().min(0).max(100),
        y: z.number().min(0).max(100),
        region: z.enum(['murim', 'elheim', 'rift']),
        /** 이 플래그가 서기 전(이름을 아직 모를 때) 쓰는 이름. 예: S1은 엘리아가 '엘하임'이라고 알려 주기 전까지 "낯선 숲" */
        unknownLabel: z.string().optional(),
        knownFlag: z.string().optional(),
      })
      .strict()
      .optional(),
    /** 지도에 보여 줄 도입 글: 도착한 하운이 아는 만큼만(summary는 설계용, 화면에 내지 않는다) */
    teaser: z.string().optional(),
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
        /** 전투 시작 때 언제나 일어나는 일(예: 보스전 시작 손패에 원작의 결정적 카드) */
        startEffects: z.array(Effect).optional(),
        /** 전투 시작 시 조건부 보너스(예: 특정 동료 출전). condition은 partyHas·flag를 본다 */
        bonus: z.object({ condition: Condition, text: z.string(), effects: z.array(Effect) }).strict().optional(),
        /** 이 턴 수를 버티면 승리하는 전투(이길 수 없는 전투) */
        surviveTurns: z.number().int().positive().optional(),
        /** 보스 모듈: 스테이지를 마친 뒤 보여 줄 장면 글 */
        outro: z.string().optional(),
        /** 전투 배경 에셋 id(생략하면 스테이지 배경) */
        background: z.string().optional(),
        /** 이 전투의 마나 규칙(스테이지·세계 규칙보다 우선). 예: 이그니스의 협곡 장악 */
        mana: WorldMana.optional(),
        /** 노드에 들어가면 먼저 재생할 비주얼 노벨 장면(data/scenes) */
        scene: z.string().optional(),
        /** 전투 모듈: 이긴 뒤 재생할 장면(보스는 스테이지 끝 화면 전에, 일반·엘리트는 보상 전에) */
        outroScene: z.string().optional(),
        /** 전투 모듈: 이기면 런에 적용할 동작(gain_card·set_flag 등 런 단위 op). 보스는 스테이지 끝 화면에 결과를 보여 준다 */
        clearEffects: z.array(Effect).optional(),
      })
      .strict(),
  })
  .strict();
export type ModuleDef = z.infer<typeof ModuleDef>;

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
  'lose_hp',
  'summon',
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
  'gain_gold',
  'gain_max_hp',
  'gain_relic',
  'gain_potion',
  'gain_random_card',
  'swap_card',
  'sell_card',
  'gain_potion_slot',
  // 심연(GAME_DESIGN 16절)
  'gain_abyss_card',
  'reveal_unseen_card',
  'injure',
  'cure_injury',
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
    /** 선택지: 이 동료가 일행에 없을 때만(심연 3굽이 '구원') */
    partyLacks: z.string(),
    turnMod: z.tuple([z.number().int().positive(), z.number().int().nonnegative()]),
    enemyId: z.string(),
    hpRatioLte: z.number(),
    flag: z.string(),
    scarMin: z.number(),
    floorRange: z.tuple([z.number(), z.number()]),
    /** 선택지: 골드가 이만큼 있어야 고를 수 있다(모자라면 흐리게 보인다) */
    goldGte: z.number(),
  })
  .partial()
  .strict();
export type Condition = z.infer<typeof Condition>;

/**
 * 비례 수치: 기본값 + amount × per(소수면 내림). max가 있으면 더하는 값이 그 이상 커지지 않는다.
 * per — rift 균열 · hand 손패 수 · mana 마나 · targetStatus 대상의 status 스택 · selfStatus 자신의 status 스택 ·
 * cardsPlayed 이번 턴에 이 카드 전에 낸 카드 수 · block 자신의 방어 · missingHp 자신이 잃은 체력 · enemies 살아 있는 적 수
 */
export const Scale = z
  .object({
    per: z.enum(['rift', 'targetStatus', 'hand', 'mana', 'selfStatus', 'cardsPlayed', 'block', 'missingHp', 'enemies']),
    status: z.string().optional(),
    amount: z.number(),
    max: z.number().optional(),
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
    /** gain_random_card: 이 등급 중에서(합류한 동료·공용의 보상 카드, 없는 카드 우선) */
    rarity: z.array(z.enum(['common', 'uncommon', 'rare', 'epic', 'legendary'])).optional(),
    /** summon: 불러낼 적 id(count마리, balance.maxEnemies까지) */
    enemy: z.string().optional(),
    /** gain_relic·gain_potion: 얻을 유물·물약 id */
    relic: z.string().optional(),
    potion: z.string().optional(),
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
/** lore: 도감의 인물 설명(처음 만난 때 하운이 아는 만큼, GAME_DESIGN 14절) */
export const SpeakerDef = z.object({ id: z.string(), name: z.string(), color: z.string(), lore: z.string().optional() }).strict();
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
    /**
     * 이 줄에서 한 번 일어나는 화면 연출: flash 하얗게 번쩍임, shake 흔들림, fade 어둡게 잠겼다 밝아짐,
     * glow 푸른 빛이 가운데서 번져 나감(천외귀운), rift 검은 틈이 그어지며 붉게 번쩍임,
     * title 대사창 대신 화면 가운데 큰 붓글씨 제목 카드(장면 전환·기술 이름)
     */
    effect: z.enum(['flash', 'shake', 'fade', 'glow', 'rift', 'title']).optional(),
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
    /** abyss: 틈의 카드(심연 전용, 캠페인에는 나오지 않는다) */
    pool: z.enum(['starter', 'reward', 'story', 'status', 'abyss']),
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
    /** 아키타입(GAME_DESIGN 9-2): 주인 캐릭터의 archetypes id. 공용 카드는 어느 캐릭터의 것이든 붙일 수 있다 */
    tags: z.array(z.string()).default([]),
    /** 손에 든 채 턴이 끝나면 일어나는 일(하운을 출처로). 상태 카드 '독기' 등 */
    onTurnEndInHand: z.array(Effect).optional(),
    /** 필수 카드(GAME_DESIGN 9-1): 보스를 깨는 열쇠. 가지고 있으면 편성과 상관없이 늘 덱에 들어간다 */
    essential: z.boolean().optional(),
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

/**
 * 상태의 발동(지속 효과·파워, CARD_EFFECTS 4-1): 가진 쪽에게 일이 생길 때마다 effects가 그 쪽을 출처로 일어난다.
 * on — turnStart 그 편 차례 시작(뽑은 뒤) · turnEnd 그 편 차례 끝 · cardPlayed 아군이 카드를 낸 뒤 ·
 * attacked 공격을 맞았을 때(방어로 다 막아도) · hpLost 체력을 잃었을 때(자해·화상 포함)
 * perStack(기본 true): 수치에 스택 수를 곱한다. cardType·keyword·ownCards: cardPlayed 거르기(ownCards는 가진 동료의 카드만)
 */
export const StatusTrigger = z
  .object({
    on: z.enum(['turnStart', 'turnEnd', 'cardPlayed', 'attacked', 'hpLost']),
    cardType: z.enum(['attack', 'skill', 'power']).optional(),
    keyword: Keyword.optional(),
    ownCards: z.boolean().optional(),
    perStack: z.boolean().default(true),
    condition: Condition.optional(),
    effects: z.array(Effect).min(1),
  })
  .strict();
export type StatusTrigger = z.infer<typeof StatusTrigger>;

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
    triggers: z.array(StatusTrigger).default([]),
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
    /** 이 조건일 때만 고른다(검사 대상은 이 적 자신: hpRatioLte 등). 순서대로(cycle)면 조건이 맞지 않는 행동은 건너뛴다 */
    condition: Condition.optional(),
    /** 한 전투에 한 번만(소환 등) */
    oncePerBattle: z.boolean().optional(),
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
    /** 도감 설명(만나서 아는 만큼 — 이기기 전에도 보인다, GAME_DESIGN 14절) */
    lore: z.string().optional(),
    /** 런 상흔 1마다 늘어나는 최대 체력(마지막 한 땀의 '찢긴 경계': 꿰맬 자리가 많아진다) */
    hpPerScar: z.number().int().min(0).optional(),
    /** 이 적이 쓰러질 때 일어나는 일(적을 출처로 하는 전투 동작). 예: 군단장이 쓰러지면 졸개가 무너진다 */
    deathEffects: z.array(Effect).default([]),
    tier: z.enum(['normal', 'elite', 'boss']).default('normal'),
    /** 격노: afterTurn 턴부터 이 적의 차례마다 effects(적을 출처로). 오래 끄는 전투를 끝내게 한다(모르데카이) */
    enrage: z.object({ afterTurn: z.number().int().positive(), text: z.string(), effects: z.array(Effect).min(1) }).strict().optional(),
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
    /** 복장: 런 플래그가 서면 sprites 대신 쓸 스프라이트 세트(뒤에 적힌 것이 우선). 예: 하운 '못생긴 검' */
    outfits: z.array(z.object({ flag: z.string(), sprites: z.record(z.string(), z.string()) }).strict()).default([]),
    /** 전투 화면의 스프라이트 배율(그림마다 프레임 안 키가 달라 동료끼리 키를 맞출 때). 기본 1 */
    scale: z.number().positive().default(1),
    /** 치명타 확률(0~1). 없으면 balance.crit.chance */
    crit: z.number().min(0).max(1).optional(),
    /** 레벨이 오를 때마다 늘어나는 최대 체력(balance.leveling) */
    hpPerLevel: z.number().int().min(0).default(4),
    joinsAt: z.string(),
    description: z.string(),
    /** 도감의 긴 소개(합류했을 때 아는 만큼) */
    lore: z.string().optional(),
    /** 아키타입 2개(GAME_DESIGN 9-2): 카드의 tags가 이 id를 쓴다 */
    archetypes: z.array(z.object({ id: z.string(), name: z.string(), text: z.string() }).strict()).default([]),
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

/**
 * 유물(2026-10-08): 가지고 있으면 늘 효과가 있다. trigger마다 effects가 일어난다.
 * 전투 안: battleStart(전투 시작) · turnStart(아군 차례 시작) · enemyDowned(적이 쓰러질 때) — 하운을 출처로 하는 전투 동작.
 * 전투 밖: pickup(얻는 순간 한 번) · victory(이긴 전투 뒤) · rest(휴식 노드에서 고른 뒤) — 런 단위 동작.
 * shop: 상점에 나오는가(보스 유물은 보스 보상으로만)
 */
export const RelicDef = z
  .object({
    id: z.string().regex(/^[a-z0-9_]+$/),
    name: z.string(),
    /** path: 심연의 시작 유물(길). 보상·상점에 나오지 않는다 */
    rarity: z.enum(['common', 'uncommon', 'rare', 'boss', 'path']),
    /** 아이콘 그림이 없을 때 표시할 한 글자 */
    glyph: z.string().length(1),
    /** 유물 아이콘 시트(icons_relics)의 프레임 번호(1부터) */
    icon: z.number().int().positive().optional(),
    description: z.string(),
    flavor: z.string().optional(),
    /**
     * 전투: battleStart · turnStart · turnEnd · enemyDowned · allyDowned(동료가 쓰러질 때) · cardPlayed(카드를 낸 뒤, cardType·keyword·every로 거른다) ·
     * riftChanged(균열이 오를 때). 런: pickup(얻는 순간) · victory · rest · shopEnter(상점에 처음 들어설 때). passive: 효과 없이 rule만
     */
    trigger: z.enum(['battleStart', 'turnStart', 'turnEnd', 'enemyDowned', 'allyDowned', 'cardPlayed', 'riftChanged', 'pickup', 'victory', 'rest', 'shopEnter', 'passive']),
    condition: Condition.default({}),
    oncePerBattle: z.boolean().default(false),
    /** cardPlayed 거르기: 카드 유형·키워드, every: 이 전투에서 맞는 카드 n장째마다 */
    cardType: z.enum(['attack', 'skill', 'power']).optional(),
    keyword: Keyword.optional(),
    every: z.number().int().positive().optional(),
    /** 규칙을 바꾸는 유물(엔진이 처리, 수치는 balance.relicRules) */
    /** reveal_map 지도의 ? 노드가 모두 보이고 엘리트 피해 ×balance.abyss.shadowEliteDmg · needle 심연 상점 지우기 무료·보상 카드 2장(심연 길) */
    rule: z.enum(['keep_block', 'retain_one', 'no_echo', 'hand_plus_one', 'crit_heavy', 'fusion_calm', 'shop_discount', 'reveal_map', 'needle']).optional(),
    effects: z.array(Effect).default([]),
    shop: z.boolean().default(true),
  })
  .strict();
export type RelicDef = z.infer<typeof RelicDef>;

/** 물약(2026-10-08): 전투 중 아무 때나 비용 없이 쓰는 소모품. target: 고르는 대상(none이면 바로) */
export const PotionDef = z
  .object({
    id: z.string().regex(/^[a-z0-9_]+$/),
    name: z.string(),
    rarity: z.enum(['common', 'uncommon', 'rare']),
    glyph: z.string().length(1),
    icon: z.number().int().positive().optional(),
    description: z.string(),
    target: z.enum(['none', 'enemy', 'ally']),
    effects: z.array(Effect).min(1),
  })
  .strict();
export type PotionDef = z.infer<typeof PotionDef>;

const Range = z.tuple([z.number().int().min(0), z.number().int().min(0)]);

/** 전투 마나 규칙. battleStart: full 가득 / carry 런 마나 이월 / 숫자 그 값으로 시작 */
export const WorldMana = z
  .object({ battleStart: z.union([z.enum(['full', 'carry']), z.number().int().min(0)]), perTurn: z.number().int() })
  .strict();
export type WorldMana = z.infer<typeof WorldMana>;

const NodeTypeEnum = z.enum(['battle', 'elite', 'event', 'rest', 'inn', 'shop', 'story', 'boss']);

export const Balance = z
  .object({
    neigongPerTurn: z.number().int().positive(),
    handSize: z.number().int().positive(),
    maxHand: z.number().int().positive(),
    /** 규칙 유물의 수치: keepBlockRatio 차례가 바뀌어도 남는 방어 비율 · critHeavyMultiplier 치명타 배율 · shopDiscount 상점 가격 배율 */
    relicRules: z.object({ keepBlockRatio: z.number(), critHeavyMultiplier: z.number(), shopDiscount: z.number() }).strict(),
    /** 한 전투에 함께 설 수 있는 적 수(소환 상한) */
    maxEnemies: z.number().int().positive().default(5),
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
    /**
     * 레벨(2026-10-08): 이긴 전투마다 동료별 경험치(출전 xp, 쉬는 동료는 restShare 비율).
     * 레벨마다 최대 체력 +characters[].hpPerLevel(그만큼 회복)·치명타 +critPerLevel, upgradeEvery 레벨마다 그 동료의 카드 1장 강화(고른다).
     * toNext[i] = 레벨 i+1 → i+2에 필요한 경험치. 동료는 하운 레벨 -1로 합류한다. debugXpPerStage: 중간 스테이지에서 시작할 때 앞 스테이지당 주는 경험치
     */
    leveling: z
      .object({
        maxLevel: z.number().int().positive(),
        xp: z.object({ battle: z.number().int(), elite: z.number().int(), boss: z.number().int() }).strict(),
        restShare: z.number().min(0).max(1),
        toNext: z.array(z.number().int().positive()),
        critPerLevel: z.number().min(0),
        upgradeEvery: z.number().int().positive(),
        debugXpPerStage: z.number().int().min(0),
      })
      .strict(),
    party: z.object({ max: z.number().int().positive(), reviveHp: z.number().int().positive() }).strict(),
    /** 카드 강화: 최대 단계와 수치만 오르는 단계 수(그 위는 특수 스킬) */
    upgrade: z.object({ maxLevel: z.number().int().positive(), statLevels: z.number().int().nonnegative() }).strict(),
    /** 편성(GAME_DESIGN 9-1): 동료마다·공용 칸 수(정확히 채워야 출발), 저장 칸 수, 최대 강화 카드를 또 얻었을 때의 골드 */
    loadout: z
      .object({
        perCharacter: z.number().int().positive(),
        common: z.number().int().positive(),
        presets: z.number().int().min(0),
        maxedGold: z.number().int().min(0),
      })
      .strict(),
    rewards: z
      .object({
        cardChoices: z.number().int().positive(),
        /** 보상 카드 등급 가중치(노드 유형별) */
        rarityWeights: z.record(z.enum(['battle', 'elite', 'boss']), z.partialRecord(Rarity, z.number().min(0))),
      })
      .strict(),
    /**
     * 경제(2026-10-08): 이긴 전투의 골드(노드 유형별 범위), 물약 칸 수와 떨어질 확률, 엘리트·보스 유물 등급 가중치,
     * 상점 진열 수와 가격(등급별, ±jitter 비율로 흔든다), 카드 지우기(한 번 쓸 때마다 removeStep씩 비싸진다)·강화 가격
     */
    economy: z
      .object({
        startGold: z.number().int().min(0),
        /** 중간 스테이지에서 시작할 때(createRunAt) 앞 스테이지당 주는 골드 */
        debugGoldPerStage: z.number().int().min(0),
        gold: z.object({ battle: Range, elite: Range, boss: Range }).strict(),
        potionSlots: z.number().int().positive(),
        potionDrop: z.object({ battle: z.number(), elite: z.number(), boss: z.number() }).strict(),
        potionWeights: z.partialRecord(z.enum(['common', 'uncommon', 'rare']), z.number().min(0)),
        relicWeights: z
          .object({
            elite: z.partialRecord(z.enum(['common', 'uncommon', 'rare']), z.number().min(0)),
            shop: z.partialRecord(z.enum(['common', 'uncommon', 'rare']), z.number().min(0)),
          })
          .strict(),
        bossRelicChoices: z.number().int().positive(),
        shop: z
          .object({
            cards: z.number().int().min(0),
            relics: z.number().int().min(0),
            potions: z.number().int().min(0),
            cardPrice: z.partialRecord(Rarity, z.number().int().positive()),
            relicPrice: z.object({ common: z.number().int(), uncommon: z.number().int(), rare: z.number().int() }).strict(),
            potionPrice: z.object({ common: z.number().int(), uncommon: z.number().int(), rare: z.number().int() }).strict(),
            /** 카드 바꾸기(보유 카드 한 장 → 같은 주인의 다른 카드) 가격. 한 번 쓸 때마다 swapStep씩 비싸진다 */
            swapPrice: z.number().int().positive(),
            swapStep: z.number().int().min(0),
            upgradePrice: z.number().int().positive(),
            jitter: z.number().min(0).max(0.5),
          })
          .strict(),
      })
      .strict(),
    /**
     * 난이도(2026-10-08): 첫 클리어 뒤 새 런에서 고른다. hard는 모든 스테이지의 적 체력·공격력 배율에 곱한다.
     * 하드코어는 난이도와 따로 켜는 규칙(쓰러진 동료는 돌아오지 않는다)이라 수치가 없다
     */
    /** 어려움(GAME_DESIGN 12절): 스테이지마다 적 체력·피해 배율(뒤 스테이지일수록 세게) */
    difficulty: z
      .object({ hard: z.object({ byStage: z.record(z.string(), z.object({ hp: z.number().positive(), dmg: z.number().positive() }).strict()) }).strict() })
      .strict(),
    /** 적 등급별 체력·피해 배율(일반은 단단하고 약하게 → 한 전투 4~6턴, GAME_DESIGN 12절) */
    enemyTiers: z
      .partialRecord(z.enum(['normal', 'elite', 'boss']), z.object({ hp: z.number().positive(), dmg: z.number().positive() }).strict())
      .default({}),
    /** 다음 스테이지로 넘어갈 때 출전 가능 동료 회복 비율(최대 체력 기준) */
    stage: z.object({ healOnEnter: z.number().min(0).max(1) }).strict(),
    /**
     * 심연(GAME_DESIGN 16절): 굽이 n의 적 배율 hpBase·dmgBase × (1 + step × (n-1)), 지도 층수·노드 비율, 굽이를 넘을 때 회복,
     * 숙적 굽이, 동료 수별 길 개수·골드, 시작 카드 장수, 틈의 카드가 보상에 섞일 확률, 상점 지우기 가격, 한 방 상한(하운 최대 체력 비율), 점수
     */
    abyss: z
      .object({
        hpBase: z.number().positive(),
        dmgBase: z.number().positive(),
        hpStep: z.number().min(0),
        dmgStep: z.number().min(0),
        floors: z.number().int().positive(),
        typeWeights: z.partialRecord(NodeTypeEnum, z.number()),
        forcedTypes: z.record(z.string(), NodeTypeEnum),
        healOnLoop: z.number().min(0).max(1),
        nemesisEvery: z.number().int().positive(),
        nemesisModule: z.string(),
        partyMax: z.number().int().positive(),
        starters: z.object({ haun: z.number().int().positive(), common: z.number().int().min(0), mate: z.number().int().positive() }).strict(),
        /** 동료 수(1~3) → 고를 길 개수·덤 골드 */
        pathPicks: z.record(z.string(), z.object({ picks: z.number().int().positive(), gold: z.number().int().min(0) }).strict()),
        pathOffer: z.number().int().positive(),
        riftCardChance: z.number().min(0).max(1),
        removePrice: z.number().int().min(0),
        removeStep: z.number().int().min(0),
        shopRiftPrice: z.partialRecord(Rarity, z.number().int().positive()),
        oneHitCap: z.number().min(0).max(1),
        injuryRatio: z.number().min(0).max(1),
        shadowEliteDmg: z.number().positive(),
        needleRewardChoices: z.number().int().positive(),
        unseenCardPrice: z.number().int().min(0),
        /** 시작 화면: 동료의 심연 풀이 이 장수보다 적으면 '좁음' 경고 */
        narrowPool: z.number().int().min(0).default(15),
        /** 세계 → 그 세계의 지도에 쓸 스테이지(모듈·적·배경·마나 규칙), 보스 모듈 */
        worlds: z.record(World, z.object({ stages: z.array(z.string()).min(1), bosses: z.array(z.string()) }).strict()),
        firstWorlds: z.array(World).min(1),
        riftFrom: z.number().int().positive(),
        score: z.object({ depth: z.number(), boss: z.number(), elite: z.number(), hp: z.number() }).strict(),
        // ── 2차(변동성) ──
        /** 굽이의 법칙: [이 굽이부터, 개수]. 큰 굽이가 이긴다 */
        lawsAt: z.array(z.tuple([z.number().int().positive(), z.number().int().min(0)])),
        /** 접사: 엘리트·일반 적 한 마리에 붙는 개수 [이 굽이부터, 개수] */
        affixesAt: z.object({ elite: z.array(z.tuple([z.number().int().positive(), z.number().int().min(0)])), normal: z.array(z.tuple([z.number().int().positive(), z.number().int().min(0)])) }).strict(),
        /** 심연의 상흔 가중(scar 모듈이 더 자주) */
        scarWeightPerPoint: z.number().min(0),
        /** 상흔 이만큼마다 다음 굽이에 틈의 짐승(추격 엘리트) 한 칸 */
        beastEvery: z.number().int().positive(),
        beastModule: z.string(),
        beastFloor: z.number().int().positive(),
        /** 이 굽이 이 층에 정해진 사건: 동료 자리가 남았으면 구원, 가득하면 틈의 메아리 */
        eventDepth: z.number().int().positive(),
        eventFloor: z.number().int().positive(),
        rescueModule: z.string(),
        echoModule: z.string(),
        /** 숙적 성장(만날 때마다): 격노가 n턴 빨라지고 흐름 포식 스택 +1, knotFrom번째부터 매듭 knotStacks */
        nemesis: z.object({ enrageStep: z.number().int().min(0), knotFrom: z.number().int().positive(), knotStacks: z.number().int().positive() }).strict(),
        // ── 3차(메타) ──
        /** 서약: 점수 배율(단계마다 곱), 열리는 단계 = 넘은 굽이 - depthOffset, 또는 그 단계 바로 아래로 stepDepth굽이를 넘으면 */
        oath: z.object({ scoreMul: z.number().positive(), depthOffset: z.number().int().min(0), stepDepth: z.number().int().positive() }).strict(),
        /** 일일 심연: 날짜 시드, 그날의 법칙 laws개(모든 굽이에), 서약 단계 범위, 동료 수 범위 */
        daily: z
          .object({
            laws: z.number().int().min(0),
            oath: z.tuple([z.number().int().min(0), z.number().int().min(0)]),
            mates: z.tuple([z.number().int().positive(), z.number().int().positive()]),
          })
          .strict(),
      })
      .strict(),
    route: z
      .object({
        nodesPerFloor: z.tuple([z.number().int().positive(), z.number().int().positive()]),
        eliteMinFloor: z.number().int(),
        /** 어느 길로 가도 전투 없는 노드(사건·휴식·여관·이야기)가 이만큼을 넘어 이어지지 않는다(고정 노드끼리 붙은 곳은 예외) */
        maxCalmRun: z.number().int().positive(),
        extraEdgeChance: z.number(),
        scarWeightPerPoint: z.number(),
      })
      .strict(),
  })
  .strict();
export type Balance = z.infer<typeof Balance>;

export const NodeType = NodeTypeEnum;

/**
 * 굽이의 법칙(심연, GAME_DESIGN 16절): 굽이 하나 동안 모든 전투·런에 걸리는 규칙. 전투: 시작 효과(하운을 출처로)·적 특성·
 * 손패/내공/마나 회복 덮어쓰기·의도 감추기·격노. 런: 휴식 회복·골드 배율
 */
export const LawDef = z
  .object({
    id: z.string().regex(/^[a-z0-9_]+$/),
    name: z.string(),
    glyph: z.string().length(1),
    description: z.string(),
    battle: z
      .object({
        startEffects: z.array(Effect).default([]),
        enemyTraits: z.array(z.object({ status: z.string(), stacks: z.number() }).strict()).default([]),
        handSize: z.number().int().positive().optional(),
        neigongPerTurn: z.number().int().positive().optional(),
        manaPerTurn: z.number().int().optional(),
        hideIntent: z.boolean().optional(),
        enrage: z.object({ afterTurn: z.number().int().positive(), text: z.string(), effects: z.array(Effect).min(1) }).strict().optional(),
      })
      .strict()
      .default({ startEffects: [], enemyTraits: [] }),
    run: z.object({ restHealMul: z.number().min(0).optional(), goldMul: z.number().min(0).optional() }).strict().default({}),
  })
  .strict();
export type LawDef = z.infer<typeof LawDef>;

/**
 * 접사(심연): 엘리트·일반 적에 붙어 이름 앞에 붙는다("독기 머금은 그림자늑대"). 체력 배율·특성 상태·
 * 공격한 뒤 효과(공격한 대상에게)·쓰러질 때 효과·첫 턴 추가 행동. boss: 보스에 붙을 수 있는가
 */
export const AffixDef = z
  .object({
    id: z.string().regex(/^[a-z0-9_]+$/),
    name: z.string(),
    glyph: z.string().length(1),
    description: z.string(),
    hpMul: z.number().positive().optional(),
    traits: z.array(z.object({ status: z.string(), stacks: z.number() }).strict()).default([]),
    onHit: z.array(Effect).default([]),
    deathEffects: z.array(Effect).default([]),
    firstTurnExtra: z.number().int().min(0).optional(),
    boss: z.boolean().default(true),
  })
  .strict();
export type AffixDef = z.infer<typeof AffixDef>;

/**
 * 서약(심연 3차, GAME_DESIGN 16절): 1~15단계. 고른 단계까지 전부 걸린다(같은 키는 높은 단계가 이긴다). 점수 × balance.abyss.oath.scoreMul^단계.
 * enemyHpMul 적 체력 배율 · startGold 시작 골드(동료 수 덤은 그대로) · restHealMul 휴식 회복 배율 · rewardChoices 보상 카드 수 상한 ·
 * eliteFloor 이 층을 엘리트로 고정 · startScar 시작 상흔 · lawsMin 굽이마다 법칙 최소 개수 · potionSlots 물약 칸 · injuriesPersist 굽이를 넘어도 부상이 낫지 않는다 ·
 * nemesisEvery 숙적 굽이 간격 · eliteAffixMin 엘리트 접사 최소 개수 · riftInReward 보상 후보에 틈의 카드 한 장은 반드시 · noPowers 심법(파워) 카드가 나오지 않는다 ·
 * maxMates 동료 최대 수 · haunMaxHp 하운 최대 체력
 */
export const OathMods = z
  .object({
    enemyHpMul: z.number().positive(),
    startGold: z.number().int().min(0),
    restHealMul: z.number().min(0),
    rewardChoices: z.number().int().positive(),
    eliteFloor: z.number().int().positive(),
    startScar: z.number().int().min(0),
    lawsMin: z.number().int().min(0),
    potionSlots: z.number().int().min(0),
    injuriesPersist: z.boolean(),
    nemesisEvery: z.number().int().positive(),
    eliteAffixMin: z.number().int().min(0),
    riftInReward: z.boolean(),
    noPowers: z.boolean(),
    maxMates: z.number().int().positive(),
    haunMaxHp: z.number().int().positive(),
  })
  .partial()
  .strict();
export type OathMods = z.infer<typeof OathMods>;
export const OathDef = z
  .object({ level: z.number().int().positive(), name: z.string(), glyph: z.string().length(1), description: z.string(), mods: OathMods })
  .strict();
export type OathDef = z.infer<typeof OathDef>;

/**
 * 심연 업적(3차): 런 하나 안에서 조건을 채우면 영구로 기록되고 틈의 카드 한 장 또는 길 하나가 열린다. 조건과 여는 것은 미리 보인다.
 * kind — cleared 넘은 굽이 ≥ n · nemesisKills·beastKills·affixKills·trades·elites·bosses 런 안의 셈 ≥ n ·
 * bossWithScar 상흔 n 이상으로 보스 처치 · lowHpBoss 하운 체력 비율 n 이하로 보스 처치 · injuredClear 부상 동료 n명 이상인 채 굽이 통과 ·
 * noPowerDepth 심법을 한 장도 내지 않고 n굽이 · grainBattle 한 전투에서 결 노출 n 소모 · mates 동료 mates명으로 시작해 n굽이 ·
 * withMate mate와 함께 n굽이 · codexCards 도감 카드 n장 · score 점수 n · oath 서약 oath단계 이상으로 n굽이 · choice 모듈 module에서 op가 든 선택 ·
 * worlds 서로 다른 세계 n곳의 굽이 통과 · lawsClear 법칙 n개 걸린 굽이 통과 · smallDeck 덱 n장 이하로 depth굽이 통과 · riftInDeck 덱에 틈의 카드 n장 ·
 * gold 골드 n 모으기 · scarZeroDepth 상흔 0인 채 n굽이
 */
export const AchievementDef = z
  .object({
    id: z.string().regex(/^[a-z0-9_]+$/),
    name: z.string(),
    description: z.string(),
    check: z
      .object({
        kind: z.enum([
          'cleared', 'nemesisKills', 'beastKills', 'affixKills', 'trades', 'elites', 'bosses', 'bossWithScar', 'lowHpBoss', 'injuredClear',
          'noPowerDepth', 'grainBattle', 'mates', 'withMate', 'codexCards', 'score', 'oath', 'choice', 'worlds', 'lawsClear', 'smallDeck',
          'riftInDeck', 'gold', 'scarZeroDepth',
        ]),
        n: z.number().min(0),
        mate: z.string().optional(),
        mates: z.number().int().positive().optional(),
        oath: z.number().int().positive().optional(),
        module: z.string().optional(),
        op: z.string().optional(),
        depth: z.number().int().positive().optional(),
      })
      .strict(),
    unlock: z.object({ card: z.string().optional(), path: z.string().optional() }).strict(),
  })
  .strict();
export type AchievementDef = z.infer<typeof AchievementDef>;
export type NodeType = z.infer<typeof NodeType>;

export const StageDef = z
  .object({
    id: z.string(),
    order: z.number().int(),
    name: z.string(),
    chapters: z.string(),
    world: World,
    floors: z.number().int().positive(),
    /** 이 스테이지 적의 최대 체력 배율(레벨 성장에 맞춘다, 기본 1) */
    enemyHpScale: z.number().positive().default(1),
    /** 이 스테이지 적의 공격 피해 배율(기본 1). 의도·받을 피해 예고에도 걸린다 */
    enemyDmgScale: z.number().positive().default(1),
    playable: z.boolean(),
    /** 어디서나 나오는 대가형 사건(stage "*" 모듈)이 이 스테이지 지도에 섞이는가(S0·S9는 아니다) */
    templateEvents: z.boolean().default(true),
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

/** 확률 결과(노름판 등): 선택지를 고르면 weight로 하나가 시드 RNG로 정해진다 */
const Outcome = z.object({ weight: z.number().positive(), effects: z.array(Effect), result: z.string() }).strict();
const Choice = z
  .object({
    label: z.string(),
    condition: Condition.optional(),
    effects: z.array(Effect),
    result: z.string().optional(),
    outcomes: z.array(Outcome).optional(),
  })
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
    /** 심연(GAME_DESIGN 16절)에 나오는가. false면 빠진다(이야기 노드·동료 합류/이탈 사건은 엔진이 따로 뺀다) */
    abyss: z.boolean().optional(),
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

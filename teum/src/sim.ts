// 「틈」 엔진(2026-11-18 2차, 2026-11-19 장 5분): 스토리 한 장(5분)을 지형 판 위에서 돌린다. 순수 함수 + 시드 RNG — 화면(render.ts)·입력(main.ts)과 떨어져 있어
// 테스트·봇이 그대로 돌린다. 무공은 종류(kind)마다 움직임이 정해져 있고 수치는 data — 무공·적별 코드는 없다(GAME_DESIGN 4·8절).
import { createRng, type Rng } from '../../src/engine/rng';
import rulesRaw from '../data/rules.json';
import storyRaw from '../data/story.json';
import foesRaw from '../data/foes.json';
import weaponsRaw from '../data/weapons.json';
import heroesRaw from '../data/heroes.json';
import itemsRaw from '../data/items.json';
import affixesRaw from '../data/affixes.json';
import abyssAffixes from '../../data/abyss_affixes.json';
import { cardSkills } from './cards';
import { blocksShot, buildTerrain, CELL, cellAt, flowDir, moveCircle, T, updateFlow, walkable, type Terrain, type TerrainDef } from './terrain';

export type Kind = 'slash' | 'bolt' | 'wave' | 'orbit' | 'nova' | 'aura' | 'strike' | 'rain' | 'chain' | 'beam' | 'heal';
export interface WeaponLevel {
  damage: number;
  cooldown: number;
  area: number;
  count: number;
  speed: number;
  pierce: number;
  duration: number;
}
export interface WeaponDef {
  id: string;
  name: string;
  owner: string;
  kind: Kind;
  desc: string;
  color: string;
  levels: WeaponLevel[];
  /** 맞은 적에게 남기는 것: ice 느림 · fire 태움 · shock 잠깐 멈춤 · vuln 받는 피해 +25% */
  element?: 'ice' | 'fire' | 'shock' | 'vuln';
  knock?: number;
  fx?: string;
  evolved?: boolean;
  evolve?: { with: string; into: string };
  /** 「천외귀환」 카드에서 온 무공(카드 그림이 아이콘) */
  card?: string;
  /** 카드 등급(잠김 해제 값·보스 비급 무게) */
  rarity?: string;
}
export interface PassiveDef {
  id: string;
  name: string;
  desc: string;
  stat: string;
  per: number;
  max: number;
  card?: string;
  rarity?: string;
}
/** 적 탄 모양(2026-11-22 "원거리 공격이 다 똑같다"): orb 알 · arrow 화살 · flame 불덩이 · shard 얼음 조각 · spark 번개 · bubble 독 거품 · shadow 그림자 · bone 뼈 · needle 독침 · blade 검기 */
export type ShotStyle = 'orb' | 'arrow' | 'flame' | 'shard' | 'spark' | 'bubble' | 'shadow' | 'bone' | 'needle' | 'blade';
/** 탄 꾸밈: style 모양 · homing 초당 꺾는 정도(라디안) · zone 사라질 때 남기는 웅덩이 */
interface ShotMod {
  style?: ShotStyle;
  homing?: number;
  r?: number;
  zone?: { seconds: number; dps: number; radius: number; element?: string };
}
export type FoeSkill =
  | ({ kind: 'aimed'; every: number; damage: number; speed: number; color: string; fx?: string } & ShotMod)
  | ({ kind: 'fan'; every: number; count: number; spread: number; damage: number; speed: number; color: string } & ShotMod)
  | ({ kind: 'radial'; every: number; count: number; damage: number; speed: number; color: string } & ShotMod)
  /** 광역 예고(2026-11-22): line 그림자에서 인물 쪽 곧은 띠 · cone 앞쪽 부채꼴 · ring 제 둘레 고리 충격파 · lob 인물 자리에 던져 웅덩이 */
  | { kind: 'line'; every: number; damage: number; len: number; width: number; delay: number; color: string }
  | { kind: 'cone'; every: number; damage: number; radius: number; spread: number; delay: number; color: string; range?: number }
  | { kind: 'ring'; every: number; damage: number; radius: number; width: number; delay: number; color: string; range?: number }
  | { kind: 'lob'; every: number; damage: number; radius: number; delay: number; color: string; zone?: { seconds: number; dps: number; radius: number; element?: string } }
  /** 돕는 기술: heal 둘레 그림자 체력 회복 · shield 둘레 그림자가 받는 피해 줄임 · burrow 땅속으로 숨었다가 인물 곁에서 솟는다 */
  | { kind: 'heal'; every: number; radius: number; amount: number }
  | { kind: 'shield'; every: number; radius: number; seconds: number; mul: number }
  | { kind: 'burrow'; every: number; delay: number; radius: number; damage: number; color: string }
  | { kind: 'slam'; every: number; damage: number; radius: number; delay: number; color: string; count: number; fx?: string }
  | { kind: 'charge'; every: number; damage: number }
  | { kind: 'summon'; every: number; foe: string; count: number };
export interface FoeDef {
  id: string;
  name: string;
  ref?: string;
  sprite: string;
  role: string;
  hp: number;
  speed: number;
  damage: number;
  xp: number;
  radius: number;
  scale: number;
  rank?: 'elite' | 'boss';
  move?: 'chase' | 'charge' | 'ranged' | 'burst';
  fly?: boolean;
  element?: string;
  skills?: FoeSkill[];
  /** 자폭(2026-11-22): 가까우면 내달려 불이 붙고 delay초 뒤 radius 안을 터뜨린다(다른 그림자도 다친다) */
  fuse?: FuseDef;
  /** 쓰러지면 작은 것 n으로 갈라진다 */
  split?: number;
  /** 특수 그림자(2026-11-22): 장 무리와 따로 from장(0부터)부터 섞여 나온다 */
  special?: { from: number; weight: number };
  /** Codex 그림이 오기 전에 쓸 「천외귀환」 그림 */
  fallback?: string;
  /** 다른 그림자 탄이 아닌 제 몸 빛(변종·속성 색) */
  tint?: string;
}
export interface FuseDef {
  range: number;
  delay: number;
  radius: number;
  damage: number;
  sprint: number;
}
/** 변종(rules.json variants, 2026-11-22 사용자 "강화된 적·특성 적·속성 적·자폭병"): 보통 그림자에 덧붙는 성질 */
export interface VariantDef {
  id: string;
  name: string;
  color: string;
  weight: number;
  from?: number;
  hp?: number;
  damage?: number;
  speed?: number;
  scale?: number;
  xp?: number;
  armor?: number;
  regen?: number;
  split?: number;
  element?: 'fire' | 'ice' | 'shock' | 'poison';
  fuse?: FuseDef;
  firm?: boolean;
  shots?: { every: number; speed: number; damage: number; style: ShotStyle };
}
export interface HeroDef {
  id: string;
  name: string;
  title: string;
  sprite: string;
  stand: string;
  hp: number;
  speed: number;
  armor?: number;
  start: string;
  pool: string[];
  /** 보법(오른쪽 아래 첫 단추) — 인물마다 다르다(2026-11-21) */
  dash: { kind: 'cut' | 'charge' | 'blink' | 'stomp'; name: string; glyph: string; desc: string; cooldown: number; damage?: number; radius?: number; knock?: number; shield?: number; distance?: number; slow?: number; stun?: number };
  /** 마지막 기술(둘째 단추) */
  ult: {
    id: string;
    name: string;
    kind: 'waves' | 'vow' | 'starfall' | 'quake';
    glyph: string;
    desc: string;
    damage: number;
    heal?: number;
    color: string;
    waves?: number;
    waveDamage?: number;
    shield?: number;
    pulse?: number;
    pulseRadius?: number;
    pulseDamage?: number;
    count?: number;
    seconds?: number;
    radius?: number;
    stun?: number;
    armor?: number;
  };
  unlock: null | { kind: 'chapter'; chapter: number; text: string };
}
type Role = 'main' | 'fast' | 'tank' | 'ranged' | 'fly' | 'prev';
interface SpawnDef {
  from: number;
  to: number;
  rate: [number, number];
  mix: Partial<Record<Role, number>>;
}
export interface TimelineEvent {
  at: number;
  kind: 'swarm' | 'ring' | 'bigwave' | 'mid' | 'boss' | 'rain' | 'blizzard' | 'golden' | 'fog' | 'frenzy' | 'xp' | 'surge' | 'ambush' | 'treasure' | 'place' | 'supply';
  /** 돌발 이벤트 id(random) */
  id?: string;
  item?: string;
  mul?: number;
  xp?: number;
  hp?: number;
  role?: Role;
  mix?: Partial<Record<Role, number>>;
  count?: number;
  text: string;
  dur?: number;
  every?: number;
  damage?: number;
  radius?: number;
  color?: string;
  slow?: number;
}
export interface ChapterDef {
  id: string;
  name: string;
  stage: string;
  line: string;
  ground: string;
  terrain: string;
  cg: string;
  /** 바닥 · 바닥 무늬 · 벽 · 위험(용암·물·허공) */
  color: [string, string, string, string];
  terrainDef: TerrainDef;
  roles: Record<Role, string[]> & { mid: string; boss: string };
  hp: number;
  dmg: number;
  rate: number;
  extra: TimelineEvent[];
  /** 장 대표 기믹(2026-11-21) */
  gimmick?: Gimmick;
  /** 안개 속 비석 이야기 조각 */
  steles?: string[];
  /** 그리기 결(2026-11-22): rift = 무한 모드 전용 「갈라진 들」(둥근 균열·바위 조각, 칸 네모 없이) */
  style?: 'rift';
  /** 무늬 시트(Codex tex_teum_rift: 땅 · 오염된 땅 · 바위 · 허공) */
  tex?: string;
}
export interface Gimmick {
  kind: 'gust' | 'howl' | 'lava' | 'whiteout' | 'hands' | 'eclipse' | 'alley' | 'palm' | 'meteor' | 'collapse';
  name: string;
  text: string;
  every: number;
  dur?: number;
  force?: number;
  count?: number;
  cells?: number;
  warn?: number;
  slow?: number;
  radius?: number;
  damage?: number;
  delay?: number;
}
/** 정예 수식어(data/affixes.json + 「천외귀환」 심연 이름·글자) */
export interface AffixDef {
  id: string;
  name: string;
  glyph: string;
  desc: string;
  hp?: number;
  speed?: number;
  damage?: number;
  poison?: number;
  thorns?: number;
  split?: number;
  chill?: number;
  steadfast?: boolean;
  noBoss?: boolean;
  deathSlam?: { radius: number; damage: number; delay: number };
}
const abyssName = new Map((abyssAffixes as { id: string; name: string; glyph: string }[]).map((a) => [a.id, a]));
export const AFFIXES: AffixDef[] = (affixesRaw.affixes as Omit<AffixDef, 'name' | 'glyph'>[]).map((a) => ({ ...a, name: abyssName.get(a.id)?.name ?? a.id, glyph: abyssName.get(a.id)?.glyph ?? '?' }));
const AFFIX = new Map(AFFIXES.map((a) => [a.id, a]));

export const RULES = rulesRaw as unknown as {
  player: { hp: number; speed: number; radius: number; pickup: number; hurtCooldown: number; slots: { weapons: number; passives: number } };
  dash: { duration: number; speed: number; cooldown: number; graze: { radius: number; damage: number } };
  ult: { max: number; kill: number; elite: number; boss: number; radius: number };
  xp: { base: number; perLevel: number; square: number };
  foes: { max: number; spawnRadius: [number, number]; despawn: number; hpPerMinute: number; overtimeDamagePerMinute: number; separation: number };
  props: { hp: number };
  /** 장이 오를수록 이미 어려운 채 시작(2026-11-21) */
  story: { warmSeconds: number; warmMax: number; openWave: { base: number; perChapter: number } };
  /** 무공 해금(2026-11-21): 카드 무공·심법은 잠겨 있다 — 보스·중간 보스·비급·무공서고 */
  unlock: { boss: number; mid: number; rarityWeight: Record<string, number>; ownWeight: number; price: Record<string, number>; shop: { offers: number; reroll: number } };
  build: { bookMax: number; bookAuto: number; reroll: number; banish: number; skip: number; skipGold: number; partnerWeight: number };
  sets: Record<'fire' | 'ice' | 'shock' | 'vuln', { need: number; name: string; desc: string; damage?: number; radius?: number; mul?: number; frac?: number; range?: number }>;
  upgrades: { list: { id: string; name: string; desc: string; per: number; cost: number[] }[] };
  counter: { window: number; might: number; slowmo: number; ult: number; shotRadius: number; cooldown: number; grazeUlt: number };
  explore: { steles: number; altars: number; merchants: number; minDist: number; reward: number; gold: number; altar: { seconds: number; base: number; perChapter: number; chests: number } };
  fall: { rank: number; every: number };
  vault: { cells: number };
  affix: { count: number; lateFrom: number; lateCount: number };
  boss: { phases: number[]; haste: number; speed: number; summon: number; arena: number; spawn: [number, number]; phasesFrom: number };
  endless: {
    slots: { weapons: number; passives: number };
    hp: { perMin: number; sq: number };
    dmg: { perMin: number; sq: number };
    spawn: { base: number; perMin: number; max: number };
    event: [number, number];
    boss: { every: number; first: number; enrage: number; speed: number; damage: number; skillHaste: number; crowdSpeed: number; crowdSpawn: number; rampEvery: number; ramp: number; hpBase: number; hpPerStage: number; escort: [number, number]; dmgBase: number; dmgPerStage: number };
    shop: { every: number; stay: number; skills: number };
    dojo: { every: number; stay: number };
    /** 판마다 무작위 무공 풀(2026-11-22 사용자 "무한 모드 무공은 무작위 — 직업 특성은 지킨다, 40~50종") */
    pool: { weapons: [number, number]; passives: [number, number]; own: number };
    /** 상인·수련소가 파는 다른 문파 무공 값 배율 */
    foreignPrice: number;
    chests: number;
    secrets: { steles: number; altars: number; merchants: number };
    dojoPrices: { buy: number; buyPerMin: number; up: number; upPerLv: number; sell: number };
  };
  /** 안개(2026-11-19 사용자 "맵이 전부 밝혀진 채 시작하면 안 된다"): 인물 둘레 cells칸을 every초마다 밝힌다 */
  sight: { cells: number; every: number };
  /** 변종(2026-11-22): 보통 그림자가 이 확률로 변종이 된다(장·분마다 오른다) */
  variants: { chance: { base: number; perChapter: number; perMin: number; max: number; endlessFrom: number }; list: VariantDef[]; element: Record<string, { trail?: { every: number; radius: number; seconds: number; dps: number }; deathZone?: { radius: number; seconds: number; dps: number }; chill?: number; poison?: number; zap?: { every: number; range: number; delay: number; damage: number; width: number }; deathRing?: { radius: number; delay: number; damage: number } }> };
  /** 특수 그림자(2026-11-22): 장 무리 대신 이 확률로 섞인다 */
  specials: { chance: { base: number; perChapter: number; perMin: number; max: number } };
};
export const STORY = storyRaw as unknown as {
  difficulties: Difficulty[];
  /** 무한 모드 판(2026-11-21) */
  endless: { name: string; line: string; ground: string; terrain: string; cg: string; color: [string, string, string, string]; terrainDef: TerrainDef; style?: 'rift'; tex?: string };
  timeline: { length: number; spawns: SpawnDef[]; events: TimelineEvent[]; chests: { every: number; min: number; max: number }; jitter: { seconds: number; roles: Record<string, Role[]> } };
  chapters: ChapterDef[];
  /** 돌발 이벤트(2026-11-21): 장마다 시드로 몇 개를 고른다 */
  random: { count: [number, number]; window: [number, number]; gap: number; events: (TimelineEvent & { id: string; weight: number })[] };
};
/** 스토리 난이도(2026-11-21 노말/하드): 그림자 체력·공격·무리 배율, 시계 앞당김 더하기, 정예 수식어 더하기, 보스 단계가 시작되는 장 */
export interface Difficulty {
  id: string;
  name: string;
  open: boolean;
  note?: string;
  hp: number;
  dmg: number;
  rate: number;
  warm: number;
  affix: number;
  phasesFrom: number;
}
/** 줍는 것(data/items.json) — ops는 기본 동작(useItem)만 */
export type ItemOp =
  | { op: 'heal'; amount?: number; full?: boolean }
  | { op: 'maxhp'; amount: number }
  | { op: 'magnet' }
  | { op: 'bomb'; damage: number; radius: number }
  | { op: 'freeze'; seconds: number }
  | { op: 'gold'; min: number; max: number }
  | { op: 'shield'; seconds: number }
  | { op: 'buff'; stat: 'might' | 'haste' | 'speed' | 'area'; mul: number; seconds: number }
  | { op: 'reveal'; cells: number }
  | { op: 'xp'; frac: number }
  | { op: 'storm'; count: number; seconds: number; damage: number; radius: number; color: string }
  | { op: 'purge' }
  | { op: 'random'; pool?: 'blessing' }
  | { op: 'field'; seconds: number; radius: number; damage: number; element?: WeaponDef['element']; color: string }
  | { op: 'push'; radius: number; force: number; damage: number }
  | { op: 'slowfoes'; seconds: number; mul: number }
  | { op: 'unlock'; count: number }
  | { op: 'shop'; count: number; skills?: number }
  | { op: 'ambush'; count: number }
  | { op: 'chest' }
  | { op: 'stele' }
  | { op: 'trial' }
  | { op: 'skillshop'; count: number };
export interface ItemDef {
  id: string;
  name: string;
  desc: string;
  glyph: string;
  color: string;
  icon?: [string, number];
  drop?: number;
  prop?: number;
  event?: boolean;
  /** 장소(2026-11-22 "상인·수련소는 줍는 것이 아니라 장소 — 안에 NPC가 판다"): 들어가면(radius) 가게가 열리고 사라지지 않는다. stay초 뒤 떠난다(무한 모드) */
  place?: { radius: number; npc: string; name: string };
  ops: ItemOp[];
}
const ITEM_DATA = itemsRaw as unknown as { items: ItemDef[]; blessing: ItemOp[]; prices: Record<string, number> };
export const ITEMS = new Map(ITEM_DATA.items.map((i) => [i.id, i]));
export const ITEM_PRICES = ITEM_DATA.prices;
export const FOES = new Map((foesRaw.foes as unknown as FoeDef[]).map((f) => [f.id, f]));
// 손으로 맞춘 무공·심법(weapons.json) + 「천외귀환」 카드 286장에서 바꾼 것(cards.ts, 2026-11-19 스킬 10배)
const handWeapons = weaponsRaw.weapons as unknown as WeaponDef[];
const handPassives = weaponsRaw.passives as PassiveDef[];
const fromCards = cardSkills(new Set([...handWeapons.map((w) => w.name), ...handPassives.map((p) => p.name)]));
export const WEAPONS = new Map([...handWeapons, ...fromCards.weapons].map((w) => [w.id, w]));
export const PASSIVES = new Map([...handPassives, ...fromCards.passives].map((p) => [p.id, p]));
export const HEROES = heroesRaw.heroes as unknown as HeroDef[];
export const CHAPTER_LENGTH = STORY.timeline.length;

export const DT = 1 / 60;

export interface Foe {
  uid: number;
  def: FoeDef;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  damage: number;
  vx: number;
  vy: number;
  hitAt: number;
  slowUntil: number;
  burnUntil: number;
  stunUntil: number;
  vulnUntil: number;
  /** 기술마다 다음 쓸 때 */
  skillAt: number[];
  /** 돌진: 끝나는 때 */
  dashUntil: number;
  dashAt: number;
  /** 터지는 놈: 불이 붙은 때 */
  fuseAt: number;
  dead: boolean;
  boss?: boolean;
  /** 중간 보스(잡으면 비급) */
  mid?: boolean;
  /** 정예(매복·저주 상자): 상자를 떨군다 */
  elite?: boolean;
  /** 금빛 그림자: 이때까지 달아나다 사라진다 */
  golden?: number;
  /** 정예 수식어 id */
  affixes?: string[];
  /** 보스 단계(0부터) */
  phase?: number;
  /** 위험 칸에 빠진 때(정예·보스는 every초에 한 번만 큰 피해) */
  fellAt?: number;
  /** 나온 때(무한 모드 보스 광폭화) */
  bornAt?: number;
  /** 광폭화(무한 모드) */
  enraged?: boolean;
  /** 이 그림자의 기술(탄·예고 원) 피해 배율(무한 모드 보스) */
  dmgMul?: number;
  /** 작은 그림자(갈라진 것): 다시 갈라지지 않는다 */
  small?: boolean;
  /** 변종 id · 속성(변종이나 정의) */
  variant?: string;
  element?: string;
  /** 크기 배율(변종) */
  scale?: number;
  /** 방패 그림자가 씌운 보호: 이때까지 받는 피해 ×guardMul */
  guardUntil?: number;
  guardMul?: number;
  /** 땅속(burrow): 이때 솟는다 — 그 전엔 맞지 않고 닿지 않는다 */
  burrowUntil?: number;
  /** 불타는 그림자가 다음에 불 자국을 남길 때 · 번개 품은 그림자가 다음에 번개를 칠 때 */
  trailAt?: number;
  zapAt?: number;
}
export interface Shot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  damage: number;
  life: number;
  color: string;
  weapon?: string;
  pierce: number;
  hit?: Set<number>;
  element?: WeaponDef['element'];
  knock?: number;
  /** 적 탄 모양 · 따라옴 · 끝에 남기는 웅덩이(2026-11-22) */
  style?: ShotStyle;
  homing?: number;
  zone?: { seconds: number; dps: number; radius: number; element?: string };
}
/** 적이 남긴 웅덩이(불·독·서리): 안에 있으면 0.5초마다 피해(방어 무시 작은 피해) */
export interface FoeZone {
  x: number;
  y: number;
  r: number;
  dps: number;
  until: number;
  born: number;
  element: string;
  next: number;
}
export interface Zone {
  x: number;
  y: number;
  r: number;
  damage: number;
  until: number;
  every: number;
  next: number;
  weapon: string;
  color: string;
  element?: WeaponDef['element'];
}
/** 붉게 예고한 원(내려찍기·낙석·화살비) — at에 맞는다 */
export interface Slam {
  x: number;
  y: number;
  r: number;
  damage: number;
  born: number;
  at: number;
  color: string;
  fx?: string;
  /** 모양(2026-11-22): circle(기본) · line(x,y에서 angle로 len, 반폭 w) · cone(반지름 r, 반각 w) · ring(r0~r) */
  shape?: 'circle' | 'line' | 'cone' | 'ring';
  angle?: number;
  len?: number;
  w?: number;
  r0?: number;
  /** 떨어진 뒤 남기는 웅덩이 */
  zone?: { seconds: number; dps: number; radius: number; element?: string };
  /** 그림자도 다친다(자폭) */
  hurtsFoes?: boolean;
  /** 이 그림자가 떨어뜨리는 것(땅굴: 솟는 자리) */
  owner?: number;
}
export interface Gem {
  x: number;
  y: number;
  xp: number;
  pulled: boolean;
  taken?: boolean;
  /** 끌려온 시간(곡선) */
  pt?: number;
}
/** items.json의 id */
export type ItemKind = string;
export interface Item {
  x: number;
  y: number;
  kind: ItemKind;
  taken?: boolean;
  /** 안개 속 숨은 것(비석·제단·비밀 상인): 밝혀진 칸에서만 보인다 */
  hidden?: boolean;
  /** 비석 번호(장 안에서 0부터) */
  stele?: number;
  /** 장소: 떠나는 때 · 진열(처음 들어갈 때 정한다) · 지금 안에 있나 */
  until?: number;
  stock?: Choice[];
  inside?: boolean;
}
export interface Prop {
  x: number;
  y: number;
  alive: boolean;
  kind: number;
}
export interface OwnedWeapon {
  id: string;
  lv: number;
  next: number;
  ringAt?: number;
  ringHit?: Set<number>;
  touched?: Map<number, number>;
}
export type FxEvent =
  | { type: 'slash'; x: number; y: number; angle: number; r: number; arc: number; color: string }
  | { type: 'nova'; x: number; y: number; r: number; color: string; weapon: string }
  | { type: 'strike'; x: number; y: number; r: number; color: string; fx?: string }
  | { type: 'hit'; x: number; y: number; damage: number; crit: boolean }
  | { type: 'kill'; x: number; y: number; foe: string; rank?: string }
  | { type: 'hurt'; damage: number }
  | { type: 'level'; level: number }
  | { type: 'chest'; text: string }
  | { type: 'item'; kind: ItemKind; x: number; y: number }
  | { type: 'graze'; x: number; y: number }
  | { type: 'ult'; x: number; y: number; fx: string; color: string }
  | { type: 'event'; text: string; kind: string }
  | { type: 'skill'; x: number; y: number; fx?: string; color: string; kind?: 'charge' | 'summon' | 'slam' | 'heal' | 'shield' | 'burrow' | 'line' | 'cone' | 'ring' | 'zone'; angle?: number; r?: number; len?: number; w?: number; r0?: number }
  | { type: 'chain'; pts: [number, number][]; color: string }
  | { type: 'beam'; x: number; y: number; angle: number; len: number; w: number; color: string }
  | { type: 'heal'; amount: number }
  | { type: 'burst'; x: number; y: number; r: number }
  | { type: 'prop'; x: number; y: number }
  | { type: 'bomb'; x: number; y: number }
  | { type: 'freeze' }
  | { type: 'clear' }
  | { type: 'unlock'; id: string; name: string }
  | { type: 'counter'; x: number; y: number }
  | { type: 'phase'; phase: number; name: string }
  | { type: 'fall'; x: number; y: number }
  | { type: 'stele'; id: string; text: string }
  | { type: 'warn'; cells: number[]; at: number }
  | { type: 'terrain' }
  | { type: 'dash'; kind: string; x: number; y: number; x2: number; y2: number; color: string }
  | { type: 'buy'; id: string; kind: string }
  /** 소리용(2026-11-22): 결 조각 주움 · 그림자가 쏨/예고함 */
  | { type: 'gem' }
  | { type: 'foeAct'; act: 'shot' | 'warn'; x: number; y: number };
export interface Choice {
  /** buy: 떠돌이 상인 물건(lv = 값) · leave: 그냥 지나간다 · buyskill/upskill/sellskill: 수련소(무한 모드, lv = 값/돌려받는 금화) */
  kind: 'weapon' | 'passive' | 'food' | 'gold' | 'buy' | 'leave' | 'buyskill' | 'upskill' | 'sellskill';
  id: string;
  lv: number;
}
export interface Input {
  x: number;
  y: number;
  dash?: boolean;
  ult?: boolean;
}
/** 장을 넘어 이어 가는 것(자동 저장) */
export interface Carry {
  hero: string;
  level: number;
  xp: number;
  weapons: { id: string; lv: number }[];
  passives: [string, number][];
  bonusHp: number;
  gold: number;
  kills: number;
  playTime: number;
  /** 봉인한 것(장을 넘어도 이어 간다) */
  banished?: string[];
}
export interface State {
  seed: string;
  rng: Rng;
  hero: HeroDef;
  chapter: ChapterDef;
  chapterIndex: number;
  terrain: Terrain;
  t: number;
  player: {
    x: number;
    y: number;
    hp: number;
    maxHp: number;
    facing: number;
    moving: boolean;
    hurtUntil: number;
    dashUntil: number;
    dashReady: number;
    dashX: number;
    dashY: number;
    grazed: Set<number>;
    /** 이때까지 어떤 공격도 받지 않는다(금강부·서약·보법) */
    shieldUntil: number;
    /** 보법이 움직이는 종류인가(점멸은 제자리 무적만) */
    dashMove: boolean;
    /** 내려찍기: 보법이 끝나면 터진다 */
    stompPending: boolean;
    dashFromX: number;
    dashFromY: number;
  };
  level: number;
  xp: number;
  weapons: OwnedWeapon[];
  passives: Map<string, number>;
  bonusHp: number;
  foes: Foe[];
  /** 적이 남긴 웅덩이(불·독·서리, 2026-11-22) */
  foeZones: FoeZone[];
  shots: Shot[];
  zones: Zone[];
  slams: Slam[];
  gems: Gem[];
  items: Item[];
  props: Prop[];
  ult: number;
  kills: number;
  chapterKills: number;
  gold: number;
  playTime: number;
  bossKills: string[];
  boss: Foe | null;
  pending: Choice[] | null;
  queuedLevels: number;
  nextEvent: number;
  events: FxEvent[];
  result: null | 'clear' | 'lose';
  uid: number;
  spawnCarry: number;
  flowAt: number;
  chestAt: number;
  freezeUntil: number;
  slowUntil: number;
  slowMul: number;
  rains: { until: number; every: number; next: number; damage: number; radius: number; color: string }[];
  /** 화면에 보이는 반지름(무작위 낙뢰 등) */
  view: number;
  /** 가 본 칸(지도 안개) — 1이면 밝혀졌다 */
  explored: Uint8Array;
  exploredAt: number;
  /** 이 장의 시간표(공통 틀을 흔들고 돌발 이벤트를 섞은 것) */
  timeline: TimelineEvent[];
  /** 잠긴 무공·심법 id(null이면 다 열림 — 점검·봇) */
  locked: Set<string> | null;
  /** 이 장에서 새로 연 것(장 끝에 계정에 더한다) */
  unlocks: string[];
  /** 앞 장까지 모은 금화 합계(기록) — 판 금화 s.gold는 장마다 0부터 */
  goldStart: number;
  /** 잠깐 오르는 능력(질풍환·혈기단·청심환·축복·굳기) */
  buffs: { stat: string; mul: number; add: number; until: number }[];
  /** 판 전체 효과: foeSpeed 그림자 빠르기 · xp 결 조각 · spawn 무리 · fog 안개 */
  effects: { kind: 'foeSpeed' | 'xp' | 'spawn' | 'fog'; mul: number; until: number }[];
  /** 벼락·별비: 보이는 그림자 위로 every초마다 */
  storms: { until: number; every: number; next: number; damage: number; r: number; color: string }[];
  /** 서약: 둘레를 밀치며 벤다 */
  pulses: { until: number; every: number; next: number; damage: number; r: number; color: string }[];
  /** 늦게 시작한 장의 앞당김(초) */
  warm: number;
  /** 무공록: 들고 들어간 카드 무공·심법(그 밖의 카드 것은 레벨업에 안 나온다). null이면 제한 없음 */
  book: Set<string> | null;
  /** 봉인: 이번 이야기에서 다시 안 나온다 */
  banished: Set<string>;
  rerolls: number;
  banishes: number;
  skips: number;
  /** 장터 수련 레벨 */
  meta: Record<string, number>;
  /** 되살아나는 숨(장터) 남은 횟수 */
  revives: number;
  /** 중간 보스를 쓰러뜨린 순간(이어 하기 자리) */
  checkpoint: { t: number; carry: Carry } | null;
  /** 간파 반격: 이때까지 위력 ↑, slowmoUntil까지 시간 느려짐(화면) */
  counterUntil: number;
  counterReadyAt: number;
  slowmoUntil: number;
  grazeCombo: number;
  /** 수련 제단 도전 */
  trial: { until: number; goal: number; start: number } | null;
  exploredCount: number;
  exploreRewarded: boolean;
  /** 이 장에서 읽은 비석 id */
  steles: string[];
  /** 지형이 바뀐 횟수(기믹·보스 아레나 — 지도 다시 그리기) */
  terrainRev: number;
  gimmickAt: number;
  /** 곧 바뀔 칸(용암·무너짐 예고) */
  warnCells: { cells: number[]; at: number; to: number } | null;
  /** 보스 아레나로 막은 칸 */
  arena: number[];
  poisonUntil: number;
  chillUntil: number;
  thornAt: number;
  /** 산바람: 이때까지 (dx, dy)로 밀린다 */
  gust: { until: number; dx: number; dy: number } | null;
  /** 스토리 · 무한 */
  mode: 'story' | 'endless';
  /** 난이도 */
  diff: Difficulty;
  /** 무공·심법 칸(무한 모드는 5·5) */
  slots: { weapons: number; passives: number };
  /** 무한 모드: 넘긴 보스 수(그림자 무리가 다음 장 것으로 바뀐다) · 다음 보스·이벤트·상인·수련소 때 */
  stage: number;
  nextBossAt: number;
  nextRandomAt: number;
  nextShopAt: number;
  nextDojoAt: number;
  /** 무한 모드 무공 풀(판마다 무작위 40~50종) — 레벨업은 이 안에서만, 상인·수련소는 이 밖의 것을 판다. 스토리는 null */
  pool: Set<string> | null;
  /** 지금 열린 가게(장소) */
  shopItem: Item | null;
}

export function xpNeed(level: number): number {
  const x = RULES.xp;
  return Math.round(x.base + x.perLevel * (level - 1) + x.square * (level - 1) ** 2);
}

/** 심법 능력치: 같은 능력치(stat)를 올리는 심법을 모두 더한다(카드 심법도 같은 능력치를 나눠 쓴다) */
const pv = (s: State, stat: string): number => {
  let v = 0;
  for (const [id, lv] of s.passives) {
    const d = PASSIVES.get(id);
    if (d && (d.stat ?? id) === stat) v += lv * d.per;
  }
  return v;
};
/** 잠깐 오른 능력: 곱(mul)과 더하기(add) */
const buffMul = (s: State, st: string): number => s.buffs.reduce((m, b) => (b.stat === st && s.t < b.until ? m * b.mul : m), 1);
const buffAdd = (s: State, st: string): number => s.buffs.reduce((m, b) => (b.stat === st && s.t < b.until ? m + b.add : m), 0);
/** 판 전체 효과 배율 */
export const effMul = (s: State, kind: State['effects'][number]['kind']): number => s.effects.reduce((m, e) => (e.kind === kind && s.t < e.until ? m * e.mul : m), 1);
export const effOn = (s: State, kind: State['effects'][number]['kind']): boolean => s.effects.some((e) => e.kind === kind && s.t < e.until);
/** 장터 수련 값(레벨 × per) */
const UPG = new Map(RULES.upgrades.list.map((u) => [u.id, u]));
export const metaVal = (s: { meta: Record<string, number> }, id: string): number => (s.meta[id] ?? 0) * (UPG.get(id)?.per ?? 0);
export const stat = {
  might: (s: State) => (1 + pv(s, 'might') + metaVal(s, 'might')) * buffMul(s, 'might') * (s.t < s.counterUntil ? RULES.counter.might : 1),
  haste: (s: State) => Math.max(0.25, Math.max(0.35, 1 - pv(s, 'haste')) * buffMul(s, 'haste')),
  area: (s: State) => (1 + pv(s, 'area')) * buffMul(s, 'area'),
  speed: (s: State) => RULES.player.speed * s.hero.speed * (1 + pv(s, 'swift') + metaVal(s, 'speed')) * buffMul(s, 'speed') * (s.t < s.slowUntil ? s.slowMul : 1) * (s.t < s.chillUntil ? 0.7 : 1),
  armor: (s: State) => (s.hero.armor ?? 0) + pv(s, 'vigor') + buffAdd(s, 'armor') + metaVal(s, 'armor'),
  regen: (s: State) => pv(s, 'breath'),
  crit: (s: State) => pv(s, 'grain'),
  pickup: (s: State) => RULES.player.pickup * (1 + pv(s, 'yoke') + metaVal(s, 'pickup')),
  xpMul: (s: State) => 1 + pv(s, 'yoke') * 0.17,
  amount: (s: State) => Math.floor(pv(s, 'amount')),
  duration: (s: State) => 1 + pv(s, 'duration'),
  critMul: (s: State) => 2 + pv(s, 'critdmg'),
  greed: (s: State) => 1 + pv(s, 'greed') + metaVal(s, 'greed'),
  /** 보법 쿨타임 배율(잔영보) */
  dashcd: (s: State) => Math.max(0.4, 1 - pv(s, 'dashcd')),
  /** 간파 피해·반격 시간(간파의 눈) */
  graze: (s: State) => 1 + pv(s, 'graze'),
  thorns: (s: State) => pv(s, 'thorns'),
  luck: (s: State) => pv(s, 'luck'),
};

/** 굳은살 같은(능력치 vigor) 심법 레벨의 합 — 레벨마다 최대 체력 +10 */
export const vigorLevels = (passives: Map<string, number>): number => [...passives].reduce((a, [id, lv]) => a + ((PASSIVES.get(id)?.stat ?? id) === 'vigor' ? lv : 0), 0);

export const freshCarry = (hero: string): Carry => {
  const h = HEROES.find((x) => x.id === hero) ?? HEROES[0];
  return { hero: h.id, level: 1, xp: 0, weapons: [{ id: h.start, lv: 1 }], passives: [], bonusHp: 0, gold: 0, kills: 0, playTime: 0 };
};

/** 카드에서 온(처음엔 잠긴) 무공·심법 id — 각성(★)은 각성으로만 얻으니 빼고 */
export const LOCKABLE: string[] = [...[...WEAPONS.values()].filter((w) => w.card && !w.evolved).map((w) => w.id), ...[...PASSIVES.values()].filter((p) => p.card).map((p) => p.id)];
export const rarityOf = (id: string): string => WEAPONS.get(id)?.rarity ?? PASSIVES.get(id)?.rarity ?? 'common';
export const nameOf = (id: string): string => WEAPONS.get(id)?.name ?? PASSIVES.get(id)?.name ?? id;

/** 장의 시간표: 공통 틀의 때를 조금 흔들고(무리 종류도) 돌발 이벤트를 몇 개 섞는다 — 장마다·시드마다 다르다 */
function buildTimeline(c: ChapterDef, rng: Rng): TimelineEvent[] {
  const J = STORY.timeline.jitter;
  const out = chapterEvents(c).map((ev) => {
    const e = { ...ev };
    if (e.kind !== 'boss') e.at = Math.max(6, Math.round(e.at + (rng.next() * 2 - 1) * J.seconds));
    const roles = J.roles[e.kind];
    if (roles && !e.role) e.role = roles[rng.int(0, roles.length - 1)];
    else if (roles && rng.next() < 0.5) e.role = roles[rng.int(0, roles.length - 1)];
    return e;
  });
  const R = STORY.random;
  const pool = [...R.events];
  const n = rng.int(R.count[0], R.count[1]);
  for (let i = 0; i < n && pool.length; i++) {
    const pick = rng.weighted(pool, (e) => e.weight)!;
    pool.splice(pool.indexOf(pick), 1);
    for (let k = 0; k < 24; k++) {
      const at = Math.round(R.window[0] + rng.next() * (R.window[1] - R.window[0]));
      if (out.every((e) => Math.abs(e.at - at) >= R.gap)) {
        out.push({ ...pick, at });
        break;
      }
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

/** 한 장을 연다. carry가 있으면 레벨·무공·심법을 이어받는다(체력은 가득). unlocked: 계정에서 연 카드 무공(주지 않으면 다 열림) */
export interface ChapterOpts {
  /** 계정에서 연 카드 무공(주지 않으면 다 열림) */
  unlocked?: Iterable<string>;
  /** 무공록(주지 않으면 제한 없음) */
  book?: Iterable<string>;
  /** 장터 수련 레벨 */
  meta?: Record<string, number>;
  /** 중간 보스 뒤에서 다시: 이 시각부터(시간표는 그 뒤 것만) */
  startAt?: number;
  /** 재편성: 장을 열자마자 고를 것 수 */
  rebuild?: number;
  /** 스토리 난이도 id(normal · hard) */
  difficulty?: string;
  /** 무한 모드(2026-11-21) */
  endless?: boolean;
}

/** 무한 모드 판: 장 틀을 빌려 쓰고 지형·바닥·이름만 바꾼다(그림자 무리는 stage마다 장을 따라 바뀐다) */
function endlessChapter(): ChapterDef {
  const E = STORY.endless;
  const base = STORY.chapters[0];
  return { ...base, id: 'endless', name: E.name, line: E.line, ground: E.ground, terrain: E.terrain, cg: E.cg, color: E.color, terrainDef: E.terrainDef, style: E.style, tex: E.tex, hp: 1, dmg: 1, rate: 1, extra: [], gimmick: undefined, steles: [], roles: { ...base.roles } };
}
/** 무한 모드 무공 풀: 인물 것(own 비율)과 공통 것을 섞은 무공 + 심법 — 시작 무공·각성 짝은 꼭 넣는다 */
export function endlessPool(hero: HeroDef, rng: Rng): Set<string> {
  const P = RULES.endless.pool;
  const nW = rng.int(P.weapons[0], P.weapons[1]);
  const nP = rng.int(P.passives[0], P.passives[1]);
  const shuffle = <T>(a: T[]): T[] => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = rng.int(0, i);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const base = [...WEAPONS.values()].filter((d) => !d.evolved && d.id !== hero.start);
  const own = shuffle(base.filter((d) => d.owner === hero.id || hero.pool.includes(d.id)).map((d) => d.id));
  const common = shuffle(base.filter((d) => d.owner === '*' && !hero.pool.includes(d.id)).map((d) => d.id));
  const nOwn = Math.min(own.length, Math.round((nW - 1) * P.own));
  const weapons = [hero.start, ...own.slice(0, nOwn), ...common.slice(0, nW - 1 - nOwn)];
  const out = new Set(weapons);
  // 각성 짝 심법은 먼저(각성을 노릴 수 있게), 나머지는 무작위
  for (const id of weapons) {
    const ev = WEAPONS.get(id)?.evolve;
    if (ev && out.size < nW + nP) out.add(ev.with);
  }
  for (const id of shuffle([...PASSIVES.keys()])) {
    if (out.size >= nW + nP) break;
    out.add(id);
  }
  return out;
}
/** 무한 모드를 연다 */
export function createEndless(seed: string, hero: string, opts: Omit<ChapterOpts, 'endless' | 'startAt' | 'rebuild'> = {}): State {
  return createChapter(0, seed, freshCarry(hero), { ...opts, endless: true });
}
export function createChapter(chapterIndex: number, seed: string, carry: Carry, opts: ChapterOpts = {}): State {
  const hero = HEROES.find((h) => h.id === carry.hero) ?? HEROES[0];
  const endless = !!opts.endless;
  const diff = STORY.difficulties.find((d) => d.id === opts.difficulty) ?? STORY.difficulties[0];
  const story = STORY.chapters[Math.max(0, Math.min(STORY.chapters.length - 1, chapterIndex))];
  // 난이도는 장 배율에 곱한다
  const chapter: ChapterDef = endless ? endlessChapter() : { ...story, hp: story.hp * diff.hp, dmg: story.dmg * diff.dmg, rate: story.rate * diff.rate };
  const rng = createRng(`teum:${seed}:${chapter.id}`);
  const terrain = buildTerrain(chapter.terrainDef, rng.fork('terrain'));
  const passives = new Map(carry.passives);
  const meta = opts.meta ?? {};
  const maxHp = hero.hp + carry.bonusHp + vigorLevels(passives) * 10 + metaVal({ meta }, 'hp');
  const s: State = {
    seed,
    rng: rng.fork('run'),
    hero,
    chapter,
    chapterIndex,
    terrain,
    t: 0,
    player: { x: terrain.start.x, y: terrain.start.y, hp: maxHp, maxHp, facing: 0, moving: false, hurtUntil: 0, dashUntil: 0, dashReady: 0, dashX: 1, dashY: 0, grazed: new Set(), shieldUntil: 0, dashMove: true, stompPending: false, dashFromX: 0, dashFromY: 0 },
    level: carry.level,
    xp: carry.xp,
    weapons: carry.weapons.map((w) => ({ id: w.id, lv: w.lv, next: 0.5 })),
    passives,
    bonusHp: carry.bonusHp,
    foes: [],
    foeZones: [],
    shots: [],
    zones: [],
    slams: [],
    gems: [],
    items: [],
    props: terrain.props.map((p, i) => ({ ...p, alive: true, kind: i % 2 })),
    ult: 0,
    kills: carry.kills,
    chapterKills: 0,
    // 판 금화는 장마다 0부터 — 장 끝에 지갑으로 간다(carry.gold는 모은 합계 기록)
    gold: 0,
    playTime: carry.playTime,
    bossKills: [],
    boss: null,
    pending: null,
    queuedLevels: 0,
    nextEvent: 0,
    events: [],
    result: null,
    uid: 1,
    spawnCarry: 0,
    flowAt: -1,
    chestAt: STORY.timeline.chests.every,
    freezeUntil: 0,
    slowUntil: 0,
    slowMul: 1,
    rains: [],
    view: 560,
    explored: new Uint8Array(terrain.w * terrain.h),
    exploredAt: 0,
    timeline: endless ? [] : buildTimeline(chapter, rng.fork('timeline')),
    locked: null,
    unlocks: [],
    goldStart: carry.gold,
    buffs: [],
    effects: [],
    storms: [],
    pulses: [],
    warm: endless ? 0 : Math.min(RULES.story.warmMax + diff.warm, Math.max(0, chapterIndex) * RULES.story.warmSeconds + diff.warm),
    book: opts.book ? new Set(opts.book) : null,
    banished: new Set(carry.banished ?? []),
    rerolls: RULES.build.reroll + Math.round(metaVal({ meta }, 'reroll')),
    banishes: RULES.build.banish + Math.round(metaVal({ meta }, 'banish')),
    skips: RULES.build.skip + Math.round(metaVal({ meta }, 'skip')),
    meta,
    revives: Math.round(metaVal({ meta }, 'revive')),
    checkpoint: null,
    counterUntil: 0,
    counterReadyAt: 0,
    slowmoUntil: 0,
    grazeCombo: 0,
    trial: null,
    exploredCount: 0,
    exploreRewarded: false,
    steles: [],
    terrainRev: 0,
    gimmickAt: chapter.gimmick?.every ?? 1e9,
    warnCells: null,
    arena: [],
    poisonUntil: 0,
    chillUntil: 0,
    thornAt: 0,
    gust: null,
    mode: endless ? 'endless' : 'story',
    diff,
    slots: endless ? { ...RULES.endless.slots } : { ...RULES.player.slots },
    stage: 0,
    nextBossAt: RULES.endless.boss.first,
    nextRandomAt: RULES.endless.event[0],
    nextShopAt: RULES.endless.shop.every,
    nextDojoAt: RULES.endless.dojo.every,
    pool: null,
    shopItem: null,
  };
  if (endless) {
    s.chestAt = RULES.endless.chests;
    s.pool = endlessPool(hero, rng.fork('pool'));
  }
  if (opts.unlocked) {
    const open = new Set(opts.unlocked);
    s.locked = new Set(LOCKABLE.filter((id) => !open.has(id)));
  }
  updateFlow(terrain, s.player.x, s.player.y);
  placeSecrets(s, rng.fork('secrets'), endless ? RULES.endless.secrets : undefined);
  // 중간 보스 뒤에서 다시: 시계·시간표를 그 자리로
  if (opts.startAt) {
    s.t = opts.startAt;
    s.nextEvent = s.timeline.findIndex((e) => e.at > opts.startAt!);
    if (s.nextEvent < 0) s.nextEvent = s.timeline.length;
    s.chestAt = s.t + STORY.timeline.chests.every;
    s.gimmickAt = s.t + (chapter.gimmick?.every ?? 1e9);
  }
  reveal(s);
  // 둘째 장부터는 그림자가 기다리고 있다(이미 쌓인 무공만큼 처음부터 어렵게)
  const ow = !endless && (chapterIndex > 0 || opts.startAt) ? RULES.story.openWave.base + RULES.story.openWave.perChapter * chapterIndex : 0;
  for (let i = 0; i < ow; i++) spawnAround(s, pickRole(s, { main: 3, fast: 1, ranged: 1 }), 400, 600, (i / ow) * Math.PI * 2);
  // 재편성: 버린 만큼 바로 고른다
  if (opts.rebuild) {
    s.queuedLevels += opts.rebuild;
    offerChoices(s);
  }
  return s;
}

/** 안개 속 숨은 것: 비석(이야기 조각) · 수련 제단 · 비밀 상인 — 시작 자리에서 멀리 */
function placeSecrets(s: State, rng: Rng, counts?: { steles: number; altars: number; merchants: number }): void {
  const E = { ...RULES.explore, ...(counts ?? {}) };
  const t = s.terrain;
  const spot = (): [number, number] | null => {
    for (let i = 0; i < 200; i++) {
      const x = (rng.int(2, t.w - 3) + 0.5) * CELL;
      const y = (rng.int(2, t.h - 3) + 0.5) * CELL;
      if (walkable(t, x, y) && Math.hypot(x - s.player.x, y - s.player.y) > E.minDist && t.dist[Math.floor(y / CELL) * t.w + Math.floor(x / CELL)] >= 0) return [x, y];
    }
    return null;
  };
  const n = Math.min(E.steles, s.chapter.steles?.length ?? 0);
  for (let i = 0; i < n; i++) {
    const p = spot();
    if (p) s.items.push({ x: p[0], y: p[1], kind: 'stele', hidden: true, stele: i });
  }
  for (let i = 0; i < E.altars; i++) {
    const p = spot();
    if (p) s.items.push({ x: p[0], y: p[1], kind: 'altar', hidden: true });
  }
  for (let i = 0; i < E.merchants; i++) {
    const p = spot();
    if (p) s.items.push({ x: p[0], y: p[1], kind: 'merchant', hidden: true });
  }
}

/** 인물 둘레를 밝힌다(가 본 곳만 지도에 보인다) */
export function reveal(s: State, cells?: number, at?: { x: number; y: number }): void {
  const t = s.terrain;
  // 짙은 안개(돌발 이벤트) 동안은 둘레 3칸만
  const r = cells ?? (effOn(s, 'fog') ? 3 : RULES.sight.cells);
  const o = at ?? s.player;
  const cx = Math.floor(o.x / CELL);
  const cy = Math.floor(o.y / CELL);
  for (let y = Math.max(0, cy - r); y <= Math.min(t.h - 1, cy + r); y++)
    for (let x = Math.max(0, cx - r); x <= Math.min(t.w - 1, cx + r); x++)
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r && !s.explored[y * t.w + x]) {
        s.explored[y * t.w + x] = 1;
        s.exploredCount++;
      }
}
export const isExplored = (s: State, x: number, y: number): boolean => {
  const cx = Math.floor(x / CELL);
  const cy = Math.floor(y / CELL);
  return cx >= 0 && cy >= 0 && cx < s.terrain.w && cy < s.terrain.h && s.explored[cy * s.terrain.w + cx] === 1;
};

/** 장 끝(또는 저장)에 이어 갈 것 */
export function carryOf(s: State): Carry {
  return {
    hero: s.hero.id,
    level: s.level,
    xp: s.xp,
    weapons: s.weapons.map((w) => ({ id: w.id, lv: w.lv })),
    passives: [...s.passives.entries()],
    bonusHp: s.bonusHp,
    gold: s.goldStart + s.gold,
    kills: s.kills,
    playTime: s.playTime,
    banished: [...s.banished],
  };
}

/** 장의 시간표: 공통 틀 + 그 장만의 이벤트(시간 순) */
export const chapterEvents = (c: ChapterDef): TimelineEvent[] => [...STORY.timeline.events, ...c.extra].sort((a, b) => a.at - b.at);

const lvOf = (w: OwnedWeapon): WeaponLevel => {
  const d = WEAPONS.get(w.id)!;
  return d.levels[Math.min(w.lv, d.levels.length) - 1];
};

function nearest(s: State, x: number, y: number, skip?: Set<number>): Foe | null {
  let best: Foe | null = null;
  let bd = Infinity;
  for (const f of s.foes) {
    if (f.dead || skip?.has(f.uid)) continue;
    const d = (f.x - x) ** 2 + (f.y - y) ** 2;
    if (d < bd) {
      bd = d;
      best = f;
    }
  }
  return best;
}

/** 속성 세트: 같은 효과를 남기는 무공 수 */
export function elementCounts(s: State): Record<string, number> {
  const c: Record<string, number> = {};
  for (const w of s.weapons) {
    const el = WEAPONS.get(w.id)?.element;
    if (el) c[el] = (c[el] ?? 0) + 1;
  }
  return c;
}
export const setOn = (s: State, el: keyof typeof RULES.sets): boolean => (elementCounts(s)[el] ?? 0) >= RULES.sets[el].need;
const hasAffix = (f: Foe, id: string): boolean => !!f.affixes?.includes(id);

function damageFoe(s: State, f: Foe, base: number, knock = 0, element?: WeaponDef['element'], chained = false): void {
  if (f.dead) return;
  // 땅속에 있는 동안은 맞지 않는다
  if (f.burrowUntil && s.t < f.burrowUntil) return;
  // 갑옷 두른(변종) · 방패 그림자의 보호
  const va = variantOf(f);
  base *= (1 - (va?.armor ?? 0)) * (f.guardUntil && s.t < f.guardUntil ? (f.guardMul ?? 0.5) : 1);
  const crit = s.rng.next() < stat.crit(s);
  const S = RULES.sets;
  const vulnMul = s.t < f.vulnUntil ? (setOn(s, 'vuln') ? S.vuln.mul! : 1.25) : 1;
  const iceMul = s.t < f.slowUntil && setOn(s, 'ice') ? S.ice.mul! : 1;
  const dmg = Math.round(base * stat.might(s) * (crit ? stat.critMul(s) : 1) * vulnMul * iceMul);
  f.hp -= dmg;
  f.hitAt = s.t;
  const firm = hasAffix(f, 'steadfast') || !!va?.firm;
  // 같은 속성의 그림자는 그 속성이 듣지 않는다(불타는 놈은 안 탄다)
  if (element === 'ice' && !firm && f.element !== 'ice') f.slowUntil = s.t + 1.2;
  if (element === 'fire' && f.element !== 'fire') f.burnUntil = s.t + 2;
  if (element === 'shock' && !f.def.rank && !firm) f.stunUntil = s.t + 0.35;
  if (element === 'vuln') f.vulnUntil = s.t + (setOn(s, 'vuln') ? 5 : 3);
  // 가시 돋친(되돌리는) 정예: 때린 쪽이 조금 받는다
  if (hasAffix(f, 'spiteful') && s.t >= s.thornAt) {
    s.thornAt = s.t + 0.5;
    hurtPlayer(s, AFFIX.get('spiteful')!.thorns ?? 3, true);
  }
  if (knock && !f.def.rank && !firm) {
    const dx = f.x - s.player.x;
    const dy = f.y - s.player.y;
    const d = Math.hypot(dx, dy) || 1;
    // 위험 칸(용암·물·허공)으로 밀려나면 빠진다
    const tx = f.x + (dx / d) * knock;
    const ty = f.y + (dy / d) * knock;
    if (!f.def.fly && cellAt(s.terrain, tx, ty) === T.Hazard) {
      f.x = tx;
      f.y = ty;
      fallFoe(s, f);
    } else {
      const [nx, ny] = f.def.fly ? [tx, ty] : moveCircle(s.terrain, f.x, f.y, (dx / d) * knock, (dy / d) * knock, f.def.radius * 0.6);
      f.x = nx;
      f.y = ny;
    }
  }
  if (s.events.length < 400) s.events.push({ type: 'hit', x: f.x, y: f.y, damage: dmg, crit });
  // 뇌전 세트: 가까운 하나로 튄다
  if (element === 'shock' && !chained && setOn(s, 'shock')) {
    let best: Foe | null = null;
    let bd = S.shock.range! ** 2;
    for (const o of s.foes) {
      if (o === f || o.dead) continue;
      const dd = (o.x - f.x) ** 2 + (o.y - f.y) ** 2;
      if (dd < bd) {
        bd = dd;
        best = o;
      }
    }
    if (best) {
      s.events.push({ type: 'chain', pts: [[f.x, f.y - 20], [best.x, best.y - 20]], color: '#cdb8ff' });
      damageFoe(s, best, base * S.shock.frac!, 0, undefined, true);
    }
  }
  if (f.boss && !f.dead) bossPhase(s, f);
  if (f.hp <= 0 && !f.dead) killFoe(s, f);
}

/** 위험 칸에 빠짐: 보통 그림자는 끝, 정예·보스는 큰 피해(every초에 한 번) */
function fallFoe(s: State, f: Foe): void {
  if (f.dead) return;
  s.events.push({ type: 'fall', x: f.x, y: f.y });
  if (!f.def.rank && !f.elite && !f.golden) return killFoe(s, f);
  if (s.t - (f.fellAt ?? -99) < RULES.fall.every) return;
  f.fellAt = s.t;
  f.hp -= f.maxHp * RULES.fall.rank;
  if (f.hp <= 0) killFoe(s, f);
}

/** 보스 단계: 체력이 줄 때마다 빨라지고 무리를 부른다 */
function bossPhase(s: State, f: Foe): void {
  const B = RULES.boss;
  const ph = f.phase ?? 0;
  if (s.mode === 'story' ? s.chapterIndex + 1 < s.diff.phasesFrom : s.stage < 1) return;
  if (ph >= B.phases.length || f.hp > f.maxHp * B.phases[ph]) return;
  f.phase = ph + 1;
  s.events.push({ type: 'phase', phase: f.phase + 1, name: f.def.name });
  s.events.push({ type: 'event', text: `${f.def.name}이(가) 분노한다 — ${f.phase + 1}단계`, kind: 'boss' });
  for (let i = 0; i < B.summon; i++) {
    const a = (i / B.summon) * Math.PI * 2;
    const x = f.x + Math.cos(a) * 90;
    const y = f.y + Math.sin(a) * 90;
    if (walkable(s.terrain, x, y)) spawnFoe(s, pickRole(s, { main: 2, fast: 1 }), x, y);
  }
}

/** 깨지는 것(항아리·등불): 무공이 닿으면 깨져 물건을 떨군다 */
function hitProps(s: State, x: number, y: number, r: number): void {
  for (const p of s.props) {
    if (!p.alive || (p.x - x) ** 2 + (p.y - y) ** 2 > (r + 16) ** 2) continue;
    p.alive = false;
    s.events.push({ type: 'prop', x: p.x, y: p.y });
    const kind = s.rng.weighted(PROP_ITEMS, (d) => d.prop ?? 0)!.id;
    s.items.push({ x: p.x, y: p.y, kind });
  }
}

const PROP_ITEMS = [...ITEMS.values()].filter((d) => (d.prop ?? 0) > 0);
const DROP_ITEMS = [...ITEMS.values()].filter((d) => (d.drop ?? 0) > 0);

/** 잠긴 무공·심법 n개를 연다(보스·중간 보스·비급): 이 인물의 것은 무겁게, 귀한 것은 가볍게 */
export function unlockRandom(s: State, n: number): string[] {
  const got: string[] = [];
  if (!s.locked) return got;
  const U = RULES.unlock;
  for (let i = 0; i < n && s.locked.size; i++) {
    const ids = [...s.locked];
    const id = s.rng.weighted(ids, (x) => (U.rarityWeight[rarityOf(x)] ?? 0.5) * ((WEAPONS.get(x)?.owner ?? '*') === s.hero.id ? U.ownWeight : 1))!;
    s.locked.delete(id);
    s.unlocks.push(id);
    got.push(id);
    s.events.push({ type: 'unlock', id, name: nameOf(id) });
  }
  return got;
}

function killFoe(s: State, f: Foe): void {
  f.dead = true;
  s.kills++;
  s.chapterKills++;
  // 갈라지는(정의·변종): 작은 것 n
  const nSplit = f.small ? 0 : (f.def.split ?? variantOf(f)?.split ?? 0);
  for (let i = 0; i < nSplit; i++) {
    const a = (i / nSplit) * Math.PI * 2;
    const k = spawnFoe(s, f.def.id, f.x + Math.cos(a) * 20, f.y + Math.sin(a) * 20);
    if (k) {
      k.small = true;
      k.variant = undefined;
      k.scale = 0.7;
      k.hp = k.maxHp = Math.max(1, Math.round(f.maxHp * 0.3));
      k.damage = f.damage * 0.6;
      k.element = f.element;
    }
  }
  // 속성 그림자가 쓰러지며 남기는 것: 불 웅덩이 · 독 구름 · 서리 고리
  const EL = f.element ? RULES.variants.element[f.element] : undefined;
  if (EL?.deathZone) addFoeZone(s, f.x, f.y, EL.deathZone.radius, EL.deathZone.dps * s.chapter.dmg, EL.deathZone.seconds, f.element!);
  if (EL?.deathRing) s.slams.push({ x: f.x, y: f.y, r: EL.deathRing.radius, damage: EL.deathRing.damage * s.chapter.dmg, born: s.t, at: s.t + EL.deathRing.delay, color: '#8fd3ff', shape: 'ring', r0: EL.deathRing.radius * 0.55 });
  // 자폭병을 먼저 쓰러뜨리면: 그 자리에서 터져 둘레 그림자만 다친다(인물은 안 다친다)
  const fz = fuseOf(f);
  if (fz) {
    s.events.push({ type: 'burst', x: f.x, y: f.y, r: fz.radius });
    for (const o of s.foes) if (!o.dead && o !== f && (o.x - f.x) ** 2 + (o.y - f.y) ** 2 < fz.radius ** 2) damageFoe(s, o, f.maxHp * 1.5 + 20, 30, undefined, true);
  }
  // 화염 세트: 불붙은 채 쓰러지면 둘레로 번진다
  if (s.t < f.burnUntil && setOn(s, 'fire')) {
    const F = RULES.sets.fire;
    s.events.push({ type: 'burst', x: f.x, y: f.y, r: F.radius! });
    for (const o of s.foes) if (!o.dead && (o.x - f.x) ** 2 + (o.y - f.y) ** 2 < F.radius! ** 2) {
      o.burnUntil = s.t + 2;
      damageFoe(s, o, F.damage! * (1 + s.chapterIndex * 0.3), 0, undefined, true);
    }
  }
  // 수식어: 갈라짐 · 죽으며 터짐
  for (const id of f.affixes ?? []) {
    const a = AFFIX.get(id);
    if (a?.split && !f.small)
      for (let i = 0; i < a.split; i++) {
        const k = spawnFoe(s, rolePool(s.chapter, 'main')[0], f.x + (i ? 18 : -18), f.y);
        if (k) {
          k.small = true;
          k.hp = k.maxHp = Math.round(k.maxHp * 0.6);
        }
      }
    if (a?.deathSlam) s.slams.push({ x: f.x, y: f.y, r: a.deathSlam.radius, damage: a.deathSlam.damage * s.chapter.dmg, born: s.t, at: s.t + a.deathSlam.delay, color: '#ff4a6a' });
  }
  const rank = f.def.rank;
  s.ult = Math.min(RULES.ult.max, s.ult + (rank === 'boss' ? RULES.ult.boss : rank === 'elite' ? RULES.ult.elite : RULES.ult.kill));
  s.events.push({ type: 'kill', x: f.x, y: f.y, foe: f.def.id, rank });
  if (f.def.xp > 0) s.gems.push({ x: f.x, y: f.y, xp: f.def.xp * (1 + 0.15 * s.chapterIndex), pulled: false });
  if (f.golden) {
    // 금빛 그림자: 금괴 셋 + 상자
    for (let i = 0; i < 3; i++) s.items.push({ x: f.x + (i - 1) * 26, y: f.y + 14, kind: 'gold_bar' });
    s.items.push({ x: f.x, y: f.y - 18, kind: 'chest' });
  } else if (rank || f.elite) s.items.push({ x: f.x, y: f.y, kind: 'chest' });
  else {
    const r = s.rng.next();
    let acc = 0;
    for (const d of DROP_ITEMS) {
      acc += d.drop!;
      if (r < acc) {
        s.items.push({ x: f.x, y: f.y, kind: d.id });
        break;
      }
    }
  }
  if (f.mid) {
    unlockRandom(s, RULES.unlock.mid);
    // 이어 하기 자리: 여기서 지면 중간 보스 뒤에서 다시
    s.checkpoint = { t: s.t, carry: carryOf(s) };
    s.events.push({ type: 'event', text: '중간 보스를 넘었다 — 여기서부터 다시 할 수 있다', kind: 'checkpoint' });
  }
  if (f.boss && s.arena.length) openArena(s);
  if (f.boss) unlockRandom(s, RULES.unlock.boss);
  if (f.boss) {
    s.bossKills.push(f.def.id);
    if (s.mode === 'endless') endlessBossDown(s, f);
    else {
      s.result = 'clear';
      s.events.push({ type: 'clear' });
    }
  }
}

export function spawnFoe(s: State, id: string, x: number, y: number, boss = false): Foe | null {
  const def = FOES.get(id);
  if (!def) return null;
  if (!boss && !def.rank && s.foes.length >= RULES.foes.max) return null;
  // 늦은 장은 체력 시계도 앞당겨 시작한다
  const minute = (s.t + s.warm) / 60;
  const ch = s.chapter;
  const hp = Math.round(def.hp * ch.hp * (1 + RULES.foes.hpPerMinute * minute * (def.rank === 'boss' ? 0.3 : 1)));
  const f: Foe = {
    uid: s.uid++,
    def,
    x,
    y,
    hp,
    maxHp: hp,
    damage: def.damage * ch.dmg,
    vx: 0,
    vy: 0,
    hitAt: -9,
    slowUntil: 0,
    burnUntil: 0,
    stunUntil: 0,
    vulnUntil: 0,
    skillAt: (def.skills ?? []).map((k) => s.t + k.every * (0.4 + s.rng.next() * 0.6)),
    dashUntil: 0,
    dashAt: s.t + 1 + s.rng.next() * 2,
    fuseAt: 0,
    dead: false,
    boss,
  };
  s.foes.push(f);
  if (boss) s.boss = f;
  if (def.rank === 'elite') giveAffixes(s, f);
  f.element = def.element;
  if (!def.rank && !boss) giveVariant(s, f);
  return f;
}

/** 변종: 보통 그림자에 강화·특성·속성·자폭 중 하나(장·분마다 확률이 오른다) */
const VARIANTS = new Map(RULES.variants.list.map((v) => [v.id, v]));
function giveVariant(s: State, f: Foe): void {
  const V = RULES.variants;
  if (s.mode === 'endless' && s.t / 60 < V.chance.endlessFrom) return;
  const level = s.mode === 'endless' ? s.stage + s.t / 180 : s.chapterIndex;
  const chance = Math.min(V.chance.max, V.chance.base + V.chance.perChapter * level + (V.chance.perMin * s.t) / 60) * (level < 1 ? 0.35 : 1);
  if (s.rng.next() >= chance) return;
  const pool = V.list.filter((v) => (v.from ?? 0) <= level && !(v.element && f.def.element) && !(v.fuse && f.def.fuse));
  const v = s.rng.weighted(pool, (x) => x.weight);
  if (v) applyVariant(f, v);
}
export function applyVariant(f: Foe, v: VariantDef): void {
  f.variant = v.id;
  if (v.hp) f.hp = f.maxHp = Math.round(f.maxHp * v.hp);
  if (v.damage) f.damage *= v.damage;
  if (v.scale) f.scale = v.scale;
  if (v.element) f.element = v.element;
}
const variantOf = (f: Foe): VariantDef | undefined => (f.variant ? VARIANTS.get(f.variant) : undefined);
const fuseOf = (f: Foe): FuseDef | undefined => f.def.fuse ?? variantOf(f)?.fuse;

/** 정예 수식어를 붙인다(뒤 장은 둘) */
function giveAffixes(s: State, f: Foe): void {
  const A = RULES.affix;
  const n = (s.mode === 'endless' ? Math.min(3, 1 + Math.floor(s.stage / 2)) : s.chapterIndex + 1 >= A.lateFrom ? A.lateCount : A.count) + s.diff.affix;
  const pool = AFFIXES.filter((a) => !(a.noBoss && f.boss));
  f.affixes = [];
  for (let i = 0; i < n && pool.length; i++) {
    const a = pool.splice(s.rng.int(0, pool.length - 1), 1)[0];
    f.affixes.push(a.id);
    if (a.hp) f.hp = f.maxHp = Math.round(f.maxHp * a.hp);
    if (a.damage) f.damage *= a.damage;
  }
}
/** 수식어 걸음 배율 */
const affixSpeed = (f: Foe): number => (f.affixes ?? []).reduce((m, id) => m * (AFFIX.get(id)?.speed ?? 1), 1);

/** 인물 둘레(min~max) 걸을 수 있는 자리. 나는 놈은 벽만 아니면 */
function spawnPoint(s: State, fly: boolean, min = RULES.foes.spawnRadius[0], max = RULES.foes.spawnRadius[1], angle?: number): [number, number] | null {
  const W = s.terrain.w * CELL;
  const H = s.terrain.h * CELL;
  for (let i = 0; i < 14; i++) {
    const a = angle !== undefined ? angle + (s.rng.next() - 0.5) * 0.5 : s.rng.next() * Math.PI * 2;
    const r = min + s.rng.next() * (max - min);
    const x = s.player.x + Math.cos(a) * r;
    const y = s.player.y + Math.sin(a) * r;
    if (x < CELL || y < CELL || x > W - CELL || y > H - CELL) continue;
    if (fly ? cellAt(s.terrain, x, y) !== T.Wall : walkable(s.terrain, x, y)) return [x, y];
  }
  return null;
}

const rolePool = (c: ChapterDef, role: Role): string[] => (c.roles[role]?.length ? c.roles[role] : c.roles.main);
/** 특수 그림자(자폭병·저격수·무녀…): 장마다·분마다 오르는 확률로 장 무리 대신 */
const SPECIALS = [...FOES.values()].filter((f) => f.special);
function pickRole(s: State, mix: Partial<Record<Role, number>>): string {
  const SC = RULES.specials.chance;
  const level = s.mode === 'endless' ? s.stage + s.t / 180 : s.chapterIndex;
  // 1장은 덜(처음 만나는 장이 너무 거칠지 않게)
  const chance = Math.min(SC.max, SC.base + SC.perChapter * level + (SC.perMin * s.t) / 60) * (level < 1 ? 0.35 : 1);
  if (SPECIALS.length && s.rng.next() < chance) {
    const open = SPECIALS.filter((f) => f.special!.from <= level);
    const pick = open.length ? s.rng.weighted(open, (f) => f.special!.weight) : null;
    if (pick) return pick.id;
  }
  const roles = Object.keys(mix) as Role[];
  const role = s.rng.weighted(roles, (r) => mix[r] ?? 0) ?? 'main';
  const pool = rolePool(s.chapter, role);
  return pool[s.rng.int(0, pool.length - 1)];
}
function spawnAround(s: State, id: string, min?: number, max?: number, angle?: number): Foe | null {
  const def = FOES.get(id);
  if (!def) return null;
  const pt = spawnPoint(s, !!def.fly, min, max, angle);
  return pt ? spawnFoe(s, id, pt[0], pt[1]) : null;
}

/** 물건 하나를 인물 둘레 min~max 걸을 수 있는 곳에 놓는다 */
function placeItem(s: State, kind: string, min: number, max: number, stay?: number): boolean {
  const pt = spawnPoint(s, false, min, max);
  if (pt) {
    s.items.push({ x: pt[0], y: pt[1], kind, until: stay ? s.t + stay : undefined });
    // 장소는 지도에 보이게 둘레를 밝힌다
    if (ITEMS.get(kind)?.place) reveal(s, 3, { x: pt[0], y: pt[1] });
  }
  return !!pt;
}
/** 정예: 단단한 놈을 네 배 체력으로(상자를 떨군다) */
function spawnElite(s: State, min: number, max: number): void {
  const f = spawnAround(s, pickRole(s, { tank: 2, main: 1 }), min, max);
  if (!f) return;
  f.hp *= 4;
  f.maxHp = f.hp;
  f.damage *= 1.4;
  f.elite = true;
  giveAffixes(s, f);
}

/** 보스 아레나: 인물 둘레 arena칸 반지름 고리의 바닥을 벽으로 닫는다(보스가 쓰러지면 연다) */
function closeArena(s: State): void {
  const t = s.terrain;
  const R = RULES.boss.arena;
  const cx = Math.floor(s.player.x / CELL);
  const cy = Math.floor(s.player.y / CELL);
  for (let y = cy - R - 1; y <= cy + R + 1; y++)
    for (let x = cx - R - 1; x <= cx + R + 1; x++) {
      if (x < 0 || y < 0 || x >= t.w || y >= t.h) continue;
      const d = Math.hypot(x - cx, y - cy);
      const i = y * t.w + x;
      if (d >= R - 0.5 && d < R + 0.7 && t.cells[i] !== T.Wall) {
        s.arena.push(i * 8 + t.cells[i]);
        t.cells[i] = T.Wall;
      }
    }
  // 고리 밖 그림자는 틈 너머로 사라진다(보스와 호위만 남는다)
  for (const f of s.foes) if (!f.dead && Math.hypot(f.x / CELL - cx, f.y / CELL - cy) > R - 1) f.dead = true;
  s.terrainRev++;
  s.events.push({ type: 'terrain' });
  s.events.push({ type: 'event', text: '틈이 닫혔다 — 보스와 둘만 남았다', kind: 'boss' });
}
function openArena(s: State): void {
  for (const v of s.arena) s.terrain.cells[v >> 3] = v & 7;
  s.arena = [];
  s.terrainRev++;
  s.events.push({ type: 'terrain' });
}

/** 장 대표 기믹(story.json chapters[].gimmick) — every초마다 */
function runGimmick(s: State): void {
  const g = s.chapter.gimmick;
  const p = s.player;
  // 예고한 칸이 바뀐다(용암 범람·무너짐)
  if (s.warnCells && s.t >= s.warnCells.at) {
    for (const i of s.warnCells.cells) s.terrain.cells[i] = s.warnCells.to;
    s.warnCells = null;
    s.terrainRev++;
    s.events.push({ type: 'terrain' });
    // 그 칸에 있던 그림자는 빠진다
    for (const f of s.foes) if (!f.dead && !f.def.fly && cellAt(s.terrain, f.x, f.y) === T.Hazard) fallFoe(s, f);
  }
  if (s.gust && s.t < s.gust.until) [p.x, p.y] = moveCircle(s.terrain, p.x, p.y, s.gust.dx * DT, s.gust.dy * DT, RULES.player.radius * 0.8);
  if (!g || s.t < s.gimmickAt || s.result) return;
  s.gimmickAt = s.t + g.every;
  s.events.push({ type: 'event', text: g.text, kind: 'gimmick' });
  const dmg = (g.damage ?? 15) * s.chapter.dmg;
  switch (g.kind) {
    case 'gust': {
      const a = s.rng.next() * Math.PI * 2;
      s.gust = { until: s.t + (g.dur ?? 5), dx: Math.cos(a) * (g.force ?? 70), dy: Math.sin(a) * (g.force ?? 70) };
      break;
    }
    case 'howl':
      for (let i = 0; i < (g.count ?? 10); i++) spawnAround(s, pickRole(s, { fast: 2, main: 1 }), 360, 430, (i / (g.count ?? 10)) * Math.PI * 2);
      break;
    case 'alley':
      for (let i = 0; i < (g.count ?? 7); i++) spawnAround(s, pickRole(s, { fast: 2, main: 1 }), 150, 260);
      break;
    case 'whiteout':
      s.effects.push({ kind: 'fog', mul: 1, until: s.t + (g.dur ?? 12) });
      s.slowUntil = s.t + (g.dur ?? 12);
      s.slowMul = g.slow ?? 0.85;
      break;
    case 'eclipse':
      s.effects.push({ kind: 'fog', mul: 1, until: s.t + (g.dur ?? 10) }, { kind: 'foeSpeed', mul: 1.2, until: s.t + (g.dur ?? 10) });
      break;
    case 'meteor':
      s.rains.push({ until: s.t + (g.dur ?? 8), every: 0.45, next: s.t, damage: dmg, radius: g.radius ?? 80, color: '#ff6a3a' });
      break;
    case 'palm':
      s.slams.push({ x: p.x, y: p.y, r: g.radius ?? 150, damage: dmg, born: s.t, at: s.t + (g.delay ?? 1.5), color: '#c0283a' });
      break;
    case 'hands': {
      // 인물 둘레 벽 옆 칸에서 손이 솟는다
      const t = s.terrain;
      const cx = Math.floor(p.x / CELL);
      const cy = Math.floor(p.y / CELL);
      const near: number[] = [];
      for (let y = cy - 7; y <= cy + 7; y++)
        for (let x = cx - 7; x <= cx + 7; x++) {
          if (x < 1 || y < 1 || x >= t.w - 1 || y >= t.h - 1 || !walkable(t, (x + 0.5) * CELL, (y + 0.5) * CELL)) continue;
          if ([t.cells[y * t.w + x - 1], t.cells[y * t.w + x + 1], t.cells[(y - 1) * t.w + x], t.cells[(y + 1) * t.w + x]].includes(T.Wall)) near.push(y * t.w + x);
        }
      for (let i = 0; i < (g.count ?? 3) && near.length; i++) {
        const c = near.splice(s.rng.int(0, near.length - 1), 1)[0];
        s.slams.push({ x: ((c % t.w) + 0.5) * CELL, y: (Math.floor(c / t.w) + 0.5) * CELL, r: g.radius ?? 70, damage: dmg, born: s.t, at: s.t + 1.1, color: '#8a6a4a' });
      }
      break;
    }
    case 'lava':
    case 'collapse': {
      // 위험 칸 옆 바닥을 몇 칸 골라 예고(인물 자리는 빼고) → warn초 뒤 위험 칸
      const t = s.terrain;
      const cand: number[] = [];
      const cx = Math.floor(p.x / CELL);
      const cy = Math.floor(p.y / CELL);
      for (let y = cy - 14; y <= cy + 14; y++)
        for (let x = cx - 14; x <= cx + 14; x++) {
          if (x < 1 || y < 1 || x >= t.w - 1 || y >= t.h - 1) continue;
          const i = y * t.w + x;
          if (t.cells[i] !== T.Floor && t.cells[i] !== T.Slow) continue;
          if (Math.abs(x - cx) <= 1 && Math.abs(y - cy) <= 1) continue;
          if ([t.cells[i - 1], t.cells[i + 1], t.cells[i - t.w], t.cells[i + t.w]].includes(T.Hazard)) cand.push(i);
        }
      const cells: number[] = [];
      for (let k = 0; k < (g.cells ?? 14) && cand.length; k++) cells.push(cand.splice(s.rng.int(0, cand.length - 1), 1)[0]);
      if (cells.length) {
        s.warnCells = { cells, at: s.t + (g.warn ?? 3), to: T.Hazard };
        s.events.push({ type: 'warn', cells, at: s.warnCells.at });
      }
      break;
    }
  }
}

/** 무한 모드 한 칸: 시계에 따라 강해지고, 1~2분마다 돌발 이벤트, 3분마다 보스(못 잡으면 광폭화), 상인·수련소 */
function runEndless(s: State): void {
  const E = RULES.endless;
  const m = s.t / 60;
  // 그림자 체력·공격은 분마다 오른다(장 틀 위에)
  s.chapter.hp = 1 + E.hp.perMin * m + E.hp.sq * m * m;
  s.chapter.dmg = 1 + E.dmg.perMin * m + E.dmg.sq * m * m;
  // 그림자 무리는 보스를 넘길 때마다 다음 장 것으로
  const src = STORY.chapters[s.stage % STORY.chapters.length];
  if (s.chapter.roles !== src.roles) s.chapter.roles = src.roles;
  if (s.t >= s.nextRandomAt) {
    s.nextRandomAt = s.t + E.event[0] + s.rng.next() * (E.event[1] - E.event[0]);
    // 처음 4분은 거센 이벤트(매복·쏟아짐·광폭·저주 상자)를 빼고 몸을 풀게 한다
    const harsh = (e: TimelineEvent) => ['ambush', 'surge', 'frenzy'].includes(e.kind) || e.item === 'cursed' || e.kind === 'bigwave';
    const pool = [...STORY.random.events, ...STORY.timeline.events.filter((e) => ['swarm', 'ring', 'bigwave'].includes(e.kind))].filter((e) => m >= 4 || !harsh(e));
    const ev = s.rng.weighted(pool, (e) => ('weight' in e ? (e as { weight: number }).weight : 2))!;
    s.timeline.push({ ...ev, at: s.t });
  }
  if (s.t >= s.nextBossAt && !s.boss) {
    s.nextBossAt = Infinity;
    s.timeline.push({ kind: 'boss', at: s.t, count: E.boss.escort[0] + s.stage * E.boss.escort[1], text: '보스' });
  }
  if (s.t >= s.nextShopAt) {
    s.nextShopAt = s.t + E.shop.every;
    if (placeItem(s, 'merchant', 300, 650, E.shop.stay)) s.events.push({ type: 'event', text: `떠돌이 상인이 수레를 세웠다 — 지도의 수레 표식, ${E.shop.stay}초 뒤 떠난다`, kind: 'chest' });
  }
  if (s.t >= s.nextDojoAt) {
    s.nextDojoAt = s.t + E.dojo.every;
    if (placeItem(s, 'dojo', 300, 650, E.dojo.stay)) s.events.push({ type: 'event', text: `수련소가 열렸다 — 풀에 없는 무공을 사고·올리고·내려놓는다(${E.dojo.stay}초)`, kind: 'chest' });
  }
  // 보스 광폭화: 나온 뒤 enrage초 안에 못 잡으면 보스와 무리가 거세진다(점점 더)
  const b = s.boss;
  if (b && !b.dead && b.bornAt !== undefined) {
    const over = s.t - b.bornAt - E.boss.enrage;
    if (over >= 0 && !b.enraged) {
      b.enraged = true;
      b.damage *= E.boss.damage;
      b.dmgMul = (b.dmgMul ?? 1) * E.boss.damage;
      s.effects.push({ kind: 'foeSpeed', mul: E.boss.crowdSpeed, until: Infinity }, { kind: 'spawn', mul: E.boss.crowdSpawn, until: Infinity });
      s.events.push({ type: 'event', text: `${b.def.name} 광폭화 — 빨라지고 거세진다! 어서 쓰러뜨려라`, kind: 'boss' });
      s.events.push({ type: 'phase', phase: 9, name: b.def.name });
    }
    if (b.enraged && Math.floor(over / E.boss.rampEvery) !== Math.floor((over - DT) / E.boss.rampEvery)) {
      b.damage *= 1 + E.boss.ramp;
      b.dmgMul = (b.dmgMul ?? 1) * (1 + E.boss.ramp);
    }
  }
}
/** 무한 모드 보스를 넘겼다: 광폭화를 풀고, 다음 장 무리로, 상자·비급 */
function endlessBossDown(s: State, f: Foe): void {
  s.stage++;
  s.boss = null;
  s.nextBossAt = s.t + RULES.endless.boss.every;
  s.effects = s.effects.filter((e) => e.until !== Infinity);
  s.items.push({ x: f.x + 30, y: f.y, kind: 'chest' }, { x: f.x - 30, y: f.y, kind: 'gold_bar' });
  s.events.push({ type: 'event', text: `보스 ${s.stage}을 넘었다 — 그림자가 ${STORY.chapters[s.stage % STORY.chapters.length].name.replace(/^\d+장 /, '')}의 것으로 바뀐다`, kind: 'boss' });
}
/** 무한 모드 · 판 위 경과·다음 보스까지 */
export const endlessInfo = (s: State): { stage: number; bossIn: number; enraged: boolean } => ({ stage: s.stage, bossIn: Math.max(0, s.nextBossAt - s.t), enraged: !!s.boss?.enraged });

/** 판의 무공 풀 밖의 것(무한 모드 상인·수련소가 판다): 인물 것·공통 것 먼저, 가끔 다른 문파 무공(값 foreignPrice배) */
function offPool(s: State, count: number, price: number): Choice[] {
  const owned = new Set([...s.weapons.map((w) => w.id), ...s.passives.keys()]);
  const free = (id: string) => !owned.has(id) && !s.pool?.has(id) && !s.banished.has(id);
  const mine = [...WEAPONS.values()].filter((d) => !d.evolved && free(d.id) && (d.owner === s.hero.id || d.owner === '*')).map((d) => d.id);
  const foreign = [...WEAPONS.values()].filter((d) => !d.evolved && free(d.id) && d.owner !== s.hero.id && d.owner !== '*').map((d) => d.id);
  const passives = [...PASSIVES.keys()].filter(free);
  const out: Choice[] = [];
  const take = (arr: string[], mul: number) => {
    if (!arr.length) return;
    const id = arr.splice(s.rng.int(0, arr.length - 1), 1)[0];
    const r = rarityOf(id);
    const rk = r === 'legendary' ? 1.8 : r === 'epic' ? 1.45 : r === 'rare' ? 1.2 : 1;
    out.push({ kind: 'buyskill', id, lv: Math.round(price * mul * rk) });
  };
  for (let i = 0; i < count; i++) {
    const roll = s.rng.next();
    if (roll < 0.22 && foreign.length) take(foreign, RULES.endless.foreignPrice);
    else if (roll < 0.45 && passives.length) take(passives, 0.8);
    else if (mine.length) take(mine, 1);
    else take(passives, 0.8);
  }
  return out;
}
/** 수련소(무한 모드): 풀 밖의 새 무공·심법 사기 · 가진 것 올리기 · 가진 것 내려놓기(금화를 돌려받고 칸을 비운다) + 지나가기 */
function offerSkillShop(s: State, count: number): void {
  const P = RULES.endless.dojoPrices;
  const m = s.t / 60;
  const out: Choice[] = s.pool ? offPool(s, count, P.buy + P.buyPerMin * m) : [];
  if (!s.pool) {
    const fresh = choicePool(s).filter((c) => c.lv === 1);
    for (let i = 0; i < count && fresh.length; i++) {
      const c = fresh.splice(s.rng.int(0, fresh.length - 1), 1)[0];
      out.push({ kind: 'buyskill', id: c.id, lv: Math.round(P.buy + P.buyPerMin * m) });
    }
  }
  const ups = s.weapons.filter((w) => w.lv < WEAPONS.get(w.id)!.levels.length);
  for (let i = 0; i < 2 && ups.length; i++) {
    const w = ups.splice(s.rng.int(0, ups.length - 1), 1)[0];
    out.push({ kind: 'upskill', id: w.id, lv: P.up + P.upPerLv * (w.lv + 1) });
  }
  if (s.weapons.length > 1) {
    const w = s.weapons[s.rng.int(1, s.weapons.length - 1)];
    out.push({ kind: 'sellskill', id: w.id, lv: P.sell + 10 * w.lv });
  }
  s.pending = [...out, { kind: 'leave', id: 'leave', lv: 0 }];
}

function runTimeline(s: State): void {
  const evs = s.timeline;
  while (s.nextEvent < evs.length && s.t >= evs[s.nextEvent].at) {
    const ev = evs[s.nextEvent++];
    const c = s.chapter;
    const label = ev.kind === 'mid' ? `중간 보스 — ${FOES.get(c.roles.mid)?.name}` : ev.kind === 'boss' ? `보스 — ${FOES.get(c.roles.boss)?.name}` : ev.text;
    s.events.push({ type: 'event', text: label, kind: ev.kind });
    // 무리 수도 장의 빠르기 배율을 따른다(1장은 적게)
    const n = Math.round((ev.count ?? 20) * c.rate);
    switch (ev.kind) {
      case 'swarm': {
        const a = s.rng.next() * Math.PI * 2;
        for (let i = 0; i < n; i++) spawnAround(s, pickRole(s, { [ev.role ?? 'main']: 1 }), 600, 760, a);
        break;
      }
      case 'ring':
        for (let i = 0; i < n; i++) spawnAround(s, pickRole(s, { [ev.role ?? 'main']: 1 }), 360, 420, (i / n) * Math.PI * 2);
        break;
      case 'bigwave':
        for (let i = 0; i < n; i++) spawnAround(s, pickRole(s, ev.mix ?? { main: 1 }), 560, 900, (i / n) * Math.PI * 2);
        break;
      case 'mid':
      case 'boss': {
        const id = ev.kind === 'mid' ? c.roles.mid : c.roles.boss;
        const boss = ev.kind === 'boss';
        const pt = (boss ? spawnPoint(s, false, RULES.boss.spawn[0], RULES.boss.spawn[1]) : spawnPoint(s, false, 460, 560)) ?? [s.player.x + 300, s.player.y];
        if (boss && s.mode === 'story') closeArena(s);
        const big = spawnFoe(s, id, pt[0], pt[1], boss);
        if (big) big.bornAt = s.t;
        // 무한 모드 보스: 넘긴 보스 수만큼 단단해진다
        if (big && boss && s.mode === 'endless') {
          big.hp = big.maxHp = Math.round(big.maxHp * (RULES.endless.boss.hpBase + RULES.endless.boss.hpPerStage * s.stage));
          big.dmgMul = RULES.endless.boss.dmgBase + RULES.endless.boss.dmgPerStage * s.stage;
          big.damage *= big.dmgMul;
        }
        if (big && ev.kind === 'mid') big.mid = true;
        for (let i = 0; i < n; i++) spawnAround(s, pickRole(s, { main: 2, fast: 1, ranged: 1 }), 520, 860, (i / n) * Math.PI * 2);
        break;
      }
      case 'rain':
        s.rains.push({ until: s.t + (ev.dur ?? 20), every: ev.every ?? 0.6, next: s.t, damage: (ev.damage ?? 10) * c.dmg, radius: ev.radius ?? 60, color: ev.color ?? '#ff4a4a' });
        break;
      case 'blizzard':
        s.slowUntil = s.t + (ev.dur ?? 30);
        s.slowMul = ev.slow ?? 0.75;
        break;
      // ── 돌발 이벤트(2026-11-21) ──
      case 'golden': {
        const pool = rolePool(c, 'fast');
        const f = spawnAround(s, pool[s.rng.int(0, pool.length - 1)], 300, 420);
        if (f) {
          f.hp = f.maxHp = Math.round(f.maxHp * (ev.hp ?? 30));
          f.golden = s.t + (ev.dur ?? 25);
          f.damage = 0;
        }
        break;
      }
      case 'fog':
        s.effects.push({ kind: 'fog', mul: 1, until: s.t + (ev.dur ?? 25) });
        break;
      case 'frenzy':
        s.effects.push({ kind: 'foeSpeed', mul: ev.mul ?? 1.35, until: s.t + (ev.dur ?? 20) }, { kind: 'xp', mul: ev.xp ?? 1.5, until: s.t + (ev.dur ?? 20) });
        break;
      case 'xp':
        s.effects.push({ kind: 'xp', mul: ev.xp ?? 2, until: s.t + (ev.dur ?? 25) });
        break;
      case 'surge':
        s.effects.push({ kind: 'spawn', mul: ev.mul ?? 2.5, until: s.t + (ev.dur ?? 18) });
        break;
      case 'ambush':
        for (let i = 0; i < (ev.count ?? 2); i++) spawnElite(s, 300, 420);
        break;
      case 'treasure':
        for (let i = 0; i < (ev.count ?? 3); i++) placeItem(s, 'chest', 350, 900);
        break;
      case 'place':
        placeItem(s, ev.item ?? 'chest', 320, 700);
        break;
      case 'supply':
        for (let i = 0; i < (ev.count ?? 6); i++) placeItem(s, s.rng.weighted(DROP_ITEMS.filter((d) => d.id !== 'gold'), (d) => d.drop!)!.id, 120, 420);
        break;
    }
  }
  // 늘 나오는 무리
  if (s.mode === 'endless') runEndless(s);
  // 늦은 장은 무리 시계를 앞당겨 시작한다(장 끝 전까지만 — 넘어가면 진짜 시간)
  const ts = s.mode === 'endless' ? Math.min(CHAPTER_LENGTH - 1, s.t) : s.t >= CHAPTER_LENGTH ? s.t : Math.min(CHAPTER_LENGTH - 1, s.t + s.warm);
  const sp = STORY.timeline.spawns.find((x) => ts >= x.from && ts < x.to);
  if (sp && s.foes.length < RULES.foes.max) {
    const k = Math.min(1, (ts - sp.from) / Math.max(1, Math.min(sp.to, CHAPTER_LENGTH) - sp.from));
    const E = RULES.endless.spawn;
    const rate = s.mode === 'endless' ? Math.min(E.max, E.base + (E.perMin * s.t) / 60) : sp.rate[0] + (sp.rate[1] - sp.rate[0]) * k;
    s.spawnCarry += rate * s.chapter.rate * effMul(s, 'spawn') * DT;
    while (s.spawnCarry >= 1) {
      s.spawnCarry -= 1;
      spawnAround(s, pickRole(s, sp.mix));
    }
  }
  // 판 곳곳의 보물상자
  if (s.t >= s.chestAt) {
    s.chestAt = s.t + STORY.timeline.chests.every;
    const pt = spawnPoint(s, false, STORY.timeline.chests.min, STORY.timeline.chests.max);
    if (pt) {
      s.items.push({ x: pt[0], y: pt[1], kind: 'chest' });
      s.events.push({ type: 'event', text: '어딘가에 상자가 나타났다 — 지도를 보라', kind: 'chest' });
    }
  }
  // 하늘에서 떨어지는 것(장 이벤트): 인물 둘레에 붉은 원
  for (const r of s.rains) {
    if (s.t >= r.until || s.t < r.next) continue;
    r.next = s.t + r.every;
    const a = s.rng.next() * Math.PI * 2;
    const d = s.rng.next() * 260;
    s.slams.push({ x: s.player.x + Math.cos(a) * d, y: s.player.y + Math.sin(a) * d, r: r.radius, damage: r.damage, born: s.t, at: s.t + 0.9, color: r.color });
  }
  s.rains = s.rains.filter((r) => s.t < r.until);
  // 벼락(뇌전부)·별비(엘리아): 보이는 그림자 하나 위로
  for (const st of s.storms) {
    if (s.t >= st.until || s.t < st.next) continue;
    st.next = s.t + st.every;
    const seen = s.foes.filter((f) => !f.dead && (f.x - s.player.x) ** 2 + (f.y - s.player.y) ** 2 < s.view * s.view);
    if (!seen.length) continue;
    const t = seen[s.rng.int(0, seen.length - 1)];
    s.events.push({ type: 'strike', x: t.x, y: t.y, r: st.r, color: st.color });
    for (const f of s.foes) if (!f.dead && (f.x - t.x) ** 2 + (f.y - t.y) ** 2 < (st.r + f.def.radius) ** 2) damageFoe(s, f, st.damage, 0, 'shock');
  }
  s.storms = s.storms.filter((x) => s.t < x.until);
  // 서약: 둘레를 밀치며 벤다
  for (const pu of s.pulses) {
    if (s.t >= pu.until || s.t < pu.next) continue;
    pu.next = s.t + pu.every;
    s.events.push({ type: 'nova', x: s.player.x, y: s.player.y, r: pu.r, color: pu.color, weapon: '' });
    for (const f of s.foes) if (!f.dead && (f.x - s.player.x) ** 2 + (f.y - s.player.y) ** 2 < (pu.r + f.def.radius) ** 2) damageFoe(s, f, pu.damage, 40);
  }
  s.pulses = s.pulses.filter((x) => s.t < x.until);
  s.buffs = s.buffs.filter((b) => s.t < b.until);
  s.effects = s.effects.filter((e) => s.t < e.until);
}

/** minor: 가시·독처럼 작은 피해(무적 시간을 주지 않고, 무적 시간도 무시하지 않는다) */
function hurtPlayer(s: State, raw: number, minor = false): void {
  const p = s.player;
  if ((!minor && s.t < p.hurtUntil) || s.t < p.dashUntil || s.t < p.shieldUntil || s.result) return;
  const over = s.mode === 'endless' ? 0 : Math.max(0, (s.t - CHAPTER_LENGTH) / 60);
  const dmg = Math.max(1, Math.round(raw * (1 + RULES.foes.overtimeDamagePerMinute * over) - (minor ? 0 : stat.armor(s))));
  p.hp -= dmg;
  if (!minor) p.hurtUntil = s.t + RULES.player.hurtCooldown;
  s.events.push({ type: 'hurt', damage: dmg });
  if (p.hp <= 0) {
    // 되살아나는 숨(장터)
    if (s.revives > 0) {
      s.revives--;
      p.hp = p.maxHp / 2;
      p.shieldUntil = s.t + 2.5;
      s.events.push({ type: 'event', text: '되살아나는 숨 — 다시 일어섰다', kind: 'revive' });
      for (const f of s.foes) if (!f.dead && (f.x - p.x) ** 2 + (f.y - p.y) ** 2 < 300 ** 2) damageFoe(s, f, 60, 60);
      return;
    }
    p.hp = 0;
    s.result = 'lose';
  }
}

/** 간파: 보법 무적 동안 아슬하게 피했다 — 시간이 느려지고 위력이 오른다 */
function counter(s: State, x: number, y: number): void {
  const C = RULES.counter;
  if (s.t < s.counterReadyAt) return;
  s.counterReadyAt = s.t + C.cooldown;
  s.counterUntil = s.t + C.window + (stat.graze(s) - 1) * 1.25;
  s.slowmoUntil = s.t + C.slowmo;
  s.ult = Math.min(RULES.ult.max, s.ult + C.ult);
  s.events.push({ type: 'counter', x, y });
}

const ELEMENT_STYLE: Record<string, ShotStyle> = { fire: 'flame', ice: 'shard', shock: 'spark', poison: 'bubble' };
function shoot(s: State, f: Foe, a: number, speed: number, damage: number, color: string, mod: ShotMod = {}): void {
  const style = mod.style ?? (f.element ? ELEMENT_STYLE[f.element] : undefined) ?? 'orb';
  s.shots.push({ x: f.x, y: f.y - 20, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: mod.r ?? (style === 'needle' || style === 'arrow' ? 5 : style === 'flame' ? 9 : 7), damage: damage * s.chapter.dmg * (f.dmgMul ?? 1), life: 4, color, pierce: 0, style, homing: mod.homing, zone: mod.zone });
}
/** 웅덩이(불·독·서리)를 놓는다 — 너무 많으면 오래된 것부터 */
function addFoeZone(s: State, x: number, y: number, r: number, dps: number, seconds: number, element: string): void {
  if (s.foeZones.length > 60) s.foeZones.shift();
  s.foeZones.push({ x, y, r, dps, until: s.t + seconds, born: s.t, element, next: s.t + 0.3 });
}
/** 속성 그림자의 걸음: 불 자국 · 번개 치기 */
function elementTick(s: State, f: Foe, d: number): void {
  const el = f.element ? RULES.variants.element[f.element] : undefined;
  if (!el) return;
  if (el.trail && s.t >= (f.trailAt ?? 0)) {
    f.trailAt = s.t + el.trail.every;
    if (d < 700) addFoeZone(s, f.x, f.y, el.trail.radius, el.trail.dps * s.chapter.dmg, el.trail.seconds, f.element!);
  }
  if (el.zap && d < el.zap.range && s.t >= (f.zapAt ?? s.t + 1)) {
    f.zapAt = s.t + el.zap.every * (0.8 + s.rng.next() * 0.4);
    const p = s.player;
    const a = Math.atan2(p.y - f.y, p.x - f.x);
    s.slams.push({ x: f.x, y: f.y, r: 0, damage: el.zap.damage * s.chapter.dmg, born: s.t, at: s.t + el.zap.delay, color: '#ffe45a', shape: 'line', angle: a, len: d + 60, w: el.zap.width });
  }
  if (f.zapAt === undefined) f.zapAt = s.t + 1 + s.rng.next() * 2;
}

function useSkills(s: State, f: Foe, d: number): void {
  const skills = f.def.skills;
  // 일반 그림자는 가까이(화면 안쪽) 와서야 쏜다 — 화면 밖에서 날아오는 탄은 피할 수 없다
  if (!skills?.length || d > (f.def.rank ? 680 : 460)) return;
  const p = s.player;
  const aim = Math.atan2(p.y - 20 - (f.y - 20), p.x - f.x);
  skills.forEach((k, i) => {
    if (s.t < f.skillAt[i]) return;
    f.skillAt[i] = s.t + k.every * (f.def.rank ? 1 : 1 + s.rng.next() * 0.4) * (f.boss ? RULES.boss.haste ** (f.phase ?? 0) : 1);
    if (s.events.length < 400) s.events.push({ type: 'foeAct', act: k.kind === 'aimed' || k.kind === 'fan' || k.kind === 'radial' ? 'shot' : 'warn', x: f.x, y: f.y });
    switch (k.kind) {
      case 'aimed':
        shoot(s, f, aim, k.speed, k.damage, k.color, k);
        break;
      case 'fan':
        for (let j = 0; j < k.count; j++) shoot(s, f, aim + (k.count > 1 ? (j / (k.count - 1) - 0.5) * k.spread * 2 : 0), k.speed, k.damage, k.color, k);
        break;
      case 'radial':
        for (let j = 0; j < k.count; j++) shoot(s, f, aim + (j / k.count) * Math.PI * 2, k.speed, k.damage, k.color, k);
        break;
      case 'line':
        s.slams.push({ x: f.x, y: f.y - 10, r: 0, damage: k.damage * s.chapter.dmg * (f.dmgMul ?? 1), born: s.t, at: s.t + k.delay, color: k.color, shape: 'line', angle: Math.atan2(p.y - f.y, p.x - f.x), len: k.len, w: k.width });
        break;
      case 'cone':
        if (k.range && d > k.range) {
          f.skillAt[i] = s.t + 0.5;
          break;
        }
        s.slams.push({ x: f.x, y: f.y, r: k.radius, damage: k.damage * s.chapter.dmg * (f.dmgMul ?? 1), born: s.t, at: s.t + k.delay, color: k.color, shape: 'cone', angle: Math.atan2(p.y - f.y, p.x - f.x), w: k.spread });
        break;
      case 'ring':
        if (k.range && d > k.range) {
          f.skillAt[i] = s.t + 0.5;
          break;
        }
        s.slams.push({ x: f.x, y: f.y, r: k.radius, damage: k.damage * s.chapter.dmg * (f.dmgMul ?? 1), born: s.t, at: s.t + k.delay, color: k.color, shape: 'ring', r0: k.radius - k.width });
        break;
      case 'lob':
        s.slams.push({ x: p.x + (s.rng.next() - 0.5) * 60, y: p.y + (s.rng.next() - 0.5) * 60, r: k.radius, damage: k.damage * s.chapter.dmg * (f.dmgMul ?? 1), born: s.t, at: s.t + k.delay, color: k.color, zone: k.zone });
        break;
      case 'heal': {
        let healed = 0;
        for (const o of s.foes)
          if (!o.dead && o !== f && o.hp < o.maxHp && (o.x - f.x) ** 2 + (o.y - f.y) ** 2 < k.radius ** 2) {
            o.hp = Math.min(o.maxHp, o.hp + o.maxHp * k.amount);
            healed++;
          }
        if (healed) s.events.push({ type: 'skill', x: f.x, y: f.y, color: '#7dff9a', kind: 'heal', r: k.radius });
        break;
      }
      case 'shield': {
        for (const o of s.foes)
          if (!o.dead && (o.x - f.x) ** 2 + (o.y - f.y) ** 2 < k.radius ** 2) {
            o.guardUntil = s.t + k.seconds;
            o.guardMul = k.mul;
          }
        s.events.push({ type: 'skill', x: f.x, y: f.y, color: '#9fd8ff', kind: 'shield', r: k.radius });
        break;
      }
      case 'burrow': {
        if (d > 520) {
          f.skillAt[i] = s.t + 1;
          break;
        }
        const tx = p.x + (s.rng.next() - 0.5) * 80;
        const ty = p.y + (s.rng.next() - 0.5) * 80;
        if (!f.def.fly && !walkable(s.terrain, tx, ty)) break;
        f.burrowUntil = s.t + k.delay;
        s.events.push({ type: 'skill', x: f.x, y: f.y, color: k.color, kind: 'burrow' });
        s.slams.push({ x: tx, y: ty, r: k.radius, damage: k.damage * s.chapter.dmg * (f.dmgMul ?? 1), born: s.t, at: s.t + k.delay, color: k.color, owner: f.uid });
        break;
      }
      case 'slam':
        for (let j = 0; j < (k.count ?? 1); j++) {
          const ox = j ? (s.rng.next() - 0.5) * 240 : 0;
          const oy = j ? (s.rng.next() - 0.5) * 180 : 0;
          s.slams.push({ x: p.x + ox, y: p.y + oy, r: k.radius, damage: k.damage * s.chapter.dmg * (f.dmgMul ?? 1), born: s.t, at: s.t + k.delay, color: k.color, fx: k.fx });
        }
        break;
      case 'charge':
        f.dashUntil = s.t + 0.7;
        f.vx = Math.cos(aim);
        f.vy = Math.sin(aim);
        s.events.push({ type: 'skill', x: f.x, y: f.y, color: '#ffffff', kind: 'charge', angle: aim });
        break;
      case 'summon':
        for (let j = 0; j < k.count; j++) {
          const a = (j / k.count) * Math.PI * 2;
          const x = f.x + Math.cos(a) * 70;
          const y = f.y + Math.sin(a) * 70;
          if (FOES.get(k.foe)?.fly || walkable(s.terrain, x, y)) spawnFoe(s, k.foe, x, y);
        }
        s.events.push({ type: 'skill', x: f.x, y: f.y, color: '#c0283a', kind: 'summon' });
        break;
    }
  });
}

function moveFoes(s: State): void {
  const p = s.player;
  const frozen = s.t < s.freezeUntil;
  if (s.t >= s.flowAt) {
    s.flowAt = s.t + 0.25;
    updateFlow(s.terrain, p.x, p.y);
  }
  const cell = 48;
  const grid = new Map<number, Foe[]>();
  const key = (gx: number, gy: number) => ((gx + 4096) << 13) ^ (gy + 4096);
  for (const f of s.foes) {
    if (f.dead) continue;
    const k = key(Math.floor(f.x / cell), Math.floor(f.y / cell));
    const arr = grid.get(k);
    if (arr) arr.push(f);
    else grid.set(k, [f]);
  }
  for (const f of s.foes) {
    if (f.dead) continue;
    const dx = p.x - f.x;
    const dy = p.y - f.y;
    const d = Math.hypot(dx, dy) || 1;
    // 금빛 그림자: 달아나다 때가 되면 사라진다
    if (f.golden) {
      if (s.t >= f.golden) {
        f.dead = true;
        s.events.push({ type: 'event', text: '금빛 그림자가 틈으로 달아났다', kind: 'golden' });
        continue;
      }
      if (frozen || s.t < f.stunUntil) continue;
      const v = stat.speed(s) * 0.82 * (s.t < f.slowUntil ? 0.55 : 1) * DT;
      [f.x, f.y] = moveCircle(s.terrain, f.x, f.y, (-dx / d) * v + Math.sin(s.t * 2 + f.uid) * v * 0.6, (-dy / d) * v + Math.cos(s.t * 2 + f.uid) * v * 0.6, Math.min(16, f.def.radius * 0.6));
      continue;
    }
    if (d > RULES.foes.despawn && !f.def.rank && !f.boss && !f.elite) {
      const pt = spawnPoint(s, !!f.def.fly);
      if (pt) [f.x, f.y] = pt;
      continue;
    }
    if (frozen || s.t < f.stunUntil) continue;
    // 땅속(땅굴 그림자): 솟을 때까지 숨어 있다
    if (f.burrowUntil) {
      if (s.t < f.burrowUntil) continue;
      f.burrowUntil = 0;
    }
    const va = variantOf(f);
    if (va?.regen && f.hp < f.maxHp) f.hp = Math.min(f.maxHp, f.hp + f.maxHp * va.regen * DT);
    // 자폭(터지는 놈·자폭병·자폭 변종): 가까우면 내달리고, 붙으면 멈춰 불이 붙었다가 터진다(둘레 그림자도 다친다)
    const fz = f.def.move === 'burst' ? (f.def.fuse ?? { range: 60, delay: 0.6, radius: 80, damage: 1, sprint: 1 }) : fuseOf(f);
    if (fz) {
      if (!f.fuseAt && d < fz.range) f.fuseAt = s.t + fz.delay;
      if (f.fuseAt) {
        if (s.t >= f.fuseAt) {
          if (d < fz.radius + RULES.player.radius && s.t >= p.dashUntil) hurtPlayer(s, f.damage * fz.damage);
          else if (d < fz.radius + RULES.player.radius) counter(s, p.x, p.y);
          killFoe(s, f);
        }
        continue;
      }
    }
    elementTick(s, f, d);
    let speed = f.def.speed * (va?.speed ?? 1) * (fz && d < 280 ? fz.sprint : 1) * (s.t < f.slowUntil ? 0.55 : 1) * effMul(s, 'foeSpeed') * affixSpeed(f) * (f.boss ? RULES.boss.speed ** (f.phase ?? 0) : 1);
    let ux = dx / d;
    let uy = dy / d;
    if (!f.def.fly) {
      const fd = flowDir(s.terrain, f.x, f.y);
      if (fd) [ux, uy] = fd;
    }
    if (f.def.move === 'ranged' && d < 240) {
      ux = -dx / d;
      uy = -dy / d;
      speed *= 0.6;
    }
    if (f.def.move === 'charge' && s.t >= f.dashAt && d < 420) {
      f.dashUntil = s.t + 0.45;
      f.dashAt = s.t + 3 + s.rng.next() * 2;
      f.vx = dx / d;
      f.vy = dy / d;
    }
    if (s.t < f.dashUntil) {
      ux = f.vx;
      uy = f.vy;
      speed *= 2.4;
    }
    let mx = ux * speed * DT;
    let my = uy * speed * DT;
    const cx = Math.floor(f.x / cell);
    const cy = Math.floor(f.y / cell);
    for (let gx = cx - 1; gx <= cx + 1; gx++)
      for (let gy = cy - 1; gy <= cy + 1; gy++) {
        const arr = grid.get(key(gx, gy));
        if (!arr) continue;
        for (const o of arr) {
          if (o === f) continue;
          const ox = f.x - o.x;
          const oy = f.y - o.y;
          const rr = f.def.radius + o.def.radius;
          const od = ox * ox + oy * oy;
          if (od > 0.01 && od < rr * rr) {
            const odd = Math.sqrt(od);
            const push = ((rr - odd) / rr) * RULES.foes.separation * speed * DT * 3;
            mx += (ox / odd) * push;
            my += (oy / odd) * push;
          }
        }
      }
    if (f.def.fly) {
      f.x += mx;
      f.y += my;
    } else [f.x, f.y] = moveCircle(s.terrain, f.x, f.y, mx, my, Math.min(16, f.def.radius * 0.6));
    if (s.t < f.burnUntil && Math.floor(s.t * 2) !== Math.floor((s.t - DT) * 2)) damageFoe(s, f, 4);
    if (f.dead) continue;
    const rr = f.def.radius + RULES.player.radius;
    if ((p.x - f.x) ** 2 + (p.y - f.y) ** 2 < rr * rr) {
      if (s.t < p.dashUntil) {
        if (!p.grazed.has(f.uid)) {
          p.grazed.add(f.uid);
          s.events.push({ type: 'graze', x: f.x, y: f.y });
          // 간파: 스칠 때마다 마지막 기술이 차고, 돌진하던 정예·보스를 피하면 반격
          s.grazeCombo++;
          s.ult = Math.min(RULES.ult.max, s.ult + RULES.counter.grazeUlt);
          if ((f.def.rank || f.elite) && s.t < f.dashUntil) counter(s, f.x, f.y);
          const gd = RULES.dash.graze.damage * (1 + 0.06 * s.level) * stat.graze(s);
          for (const o of s.foes) if (!o.dead && (o.x - f.x) ** 2 + (o.y - f.y) ** 2 < RULES.dash.graze.radius ** 2) damageFoe(s, o, gd);
        }
      } else if (s.t < p.shieldUntil) {
        // 막고 있는 동안 닿은 놈은 살짝 밀려난다
      } else {
        const before = p.hurtUntil;
        hurtPlayer(s, f.damage);
        if (p.hurtUntil !== before) {
          if (hasAffix(f, 'venom')) s.poisonUntil = s.t + 3;
          if (hasAffix(f, 'frosty')) s.chillUntil = s.t + (AFFIX.get('frosty')!.chill ?? 2);
          const el = f.element ? RULES.variants.element[f.element] : undefined;
          if (el?.chill) s.chillUntil = Math.max(s.chillUntil, s.t + el.chill);
          if (el?.poison) s.poisonUntil = Math.max(s.poisonUntil, s.t + el.poison);
        }
        // 되갚기(카드 심법): 몸으로 친 적에게 그대로 돌려준다
        if (p.hurtUntil !== before && stat.thorns(s) > 0) damageFoe(s, f, stat.thorns(s));
      }
    }
    useSkills(s, f, d);
  }
}

function fireWeapons(s: State): void {
  const p = s.player;
  const area = stat.area(s);
  const near = nearest(s, p.x, p.y);
  const aim = near && (near.x - p.x) ** 2 + (near.y - p.y) ** 2 < 420 * 420 ? Math.atan2(near.y - p.y, near.x - p.x) : p.facing;
  for (const w of s.weapons) {
    const d = WEAPONS.get(w.id)!;
    const L0 = lvOf(w);
    // 개수(카드 심법)는 여러 개를 내는 종류에만, 지속 시간은 둘레 칼·장판에
    const multi = d.kind === 'bolt' || d.kind === 'orbit' || d.kind === 'strike' || d.kind === 'rain' || d.kind === 'chain' || d.kind === 'wave';
    const L = { ...L0, count: L0.count + (multi ? stat.amount(s) : 0), duration: L0.duration * (d.kind === 'orbit' || d.kind === 'rain' ? stat.duration(s) : 1) };
    const color = d.color;
    if (d.kind === 'orbit') {
      const period = L.cooldown * stat.haste(s);
      const on = L.duration >= period || s.t % period < L.duration;
      if (on) {
        const R = 72 * L.area * area;
        w.touched ??= new Map();
        for (let i = 0; i < L.count; i++) {
          const a = s.t * L.speed + (i / L.count) * Math.PI * 2;
          const bx = p.x + Math.cos(a) * R;
          const by = p.y + Math.sin(a) * R;
          hitProps(s, bx, by, 16 * area);
          for (const f of s.foes) {
            if (f.dead) continue;
            const rr = f.def.radius + 16 * area;
            if ((f.x - bx) ** 2 + (f.y - by) ** 2 > rr * rr) continue;
            if (s.t - (w.touched.get(f.uid) ?? -9) < 0.45) continue;
            w.touched.set(f.uid, s.t);
            damageFoe(s, f, L.damage, d.knock ?? 6, d.element);
          }
        }
      }
      continue;
    }
    if (d.kind === 'aura') {
      if (s.t >= w.next) {
        w.next = s.t + L.cooldown;
        const R = 90 * L.area * area;
        hitProps(s, p.x, p.y, R);
        for (const f of s.foes) if (!f.dead && (f.x - p.x) ** 2 + (f.y - p.y) ** 2 < (R + f.def.radius) ** 2) damageFoe(s, f, L.damage, 0, d.element);
      }
      continue;
    }
    if (d.kind === 'nova' && w.ringAt !== undefined) {
      const k = (s.t - w.ringAt) / 0.45;
      const R = 150 * L.area * area * Math.min(1, k);
      for (const f of s.foes) {
        if (f.dead || w.ringHit!.has(f.uid)) continue;
        if ((f.x - p.x) ** 2 + (f.y - p.y) ** 2 < (R + f.def.radius) ** 2) {
          w.ringHit!.add(f.uid);
          damageFoe(s, f, L.damage, d.knock ?? 8, d.element);
        }
      }
      if (k >= 1) {
        hitProps(s, p.x, p.y, R);
        w.ringAt = undefined;
      }
    }
    if (s.t < w.next) continue;
    w.next = s.t + L.cooldown * stat.haste(s);
    switch (d.kind) {
      case 'slash': {
        const R = 92 * L.area * area;
        const arc = (130 * Math.PI) / 180;
        const dirs = L.count >= 4 ? [0, Math.PI / 2, Math.PI, -Math.PI / 2] : L.count >= 2 ? [0, Math.PI] : [0];
        hitProps(s, p.x, p.y, R * 0.8);
        for (const off of dirs) {
          const a = aim + off;
          s.events.push({ type: 'slash', x: p.x, y: p.y, angle: a, r: R, arc, color });
          for (const f of s.foes) {
            if (f.dead) continue;
            const dx = f.x - p.x;
            const dy = f.y - p.y;
            const dist = Math.hypot(dx, dy);
            if (dist > R + f.def.radius) continue;
            let da = Math.atan2(dy, dx) - a;
            da = Math.atan2(Math.sin(da), Math.cos(da));
            if (Math.abs(da) <= arc / 2 || dist < f.def.radius + 10) damageFoe(s, f, L.damage, d.knock ?? 8, d.element);
          }
        }
        break;
      }
      case 'bolt': {
        const skip = new Set<number>();
        for (let i = 0; i < L.count; i++) {
          const t = nearest(s, p.x, p.y, skip);
          const a = t ? Math.atan2(t.y - p.y, t.x - p.x) : p.facing + (i - (L.count - 1) / 2) * 0.25;
          if (t) skip.add(t.uid);
          s.shots.push({ x: p.x, y: p.y - 20, vx: Math.cos(a) * L.speed, vy: Math.sin(a) * L.speed, r: 9 * L.area * area, damage: L.damage, life: L.duration, color, weapon: d.id, pierce: L.pierce, hit: new Set(), element: d.element, knock: d.knock ?? 4 });
        }
        break;
      }
      case 'wave': {
        for (let i = 0; i < L.count; i++) {
          const a = L.count >= 4 ? aim + (i * Math.PI) / 2 : aim + (i - (L.count - 1) / 2) * 0.22;
          s.shots.push({ x: p.x, y: p.y - 20, vx: Math.cos(a) * L.speed, vy: Math.sin(a) * L.speed, r: 22 * L.area * area, damage: L.damage, life: L.duration, color, weapon: d.id, pierce: L.pierce, hit: new Set(), element: d.element, knock: d.knock ?? 6 });
        }
        break;
      }
      case 'nova': {
        w.ringAt = s.t;
        w.ringHit = new Set();
        s.events.push({ type: 'nova', x: p.x, y: p.y, r: 150 * L.area * area, color, weapon: d.id });
        if (L.count >= 2) w.next = s.t + (L.cooldown * stat.haste(s)) / 2;
        break;
      }
      case 'strike': {
        const near2 = s.foes.filter((f) => !f.dead && (f.x - p.x) ** 2 + (f.y - p.y) ** 2 < s.view * s.view);
        const R = 46 * L.area * area;
        for (let i = 0; i < L.count && near2.length; i++) {
          const t = near2.splice(s.rng.int(0, near2.length - 1), 1)[0];
          s.events.push({ type: 'strike', x: t.x, y: t.y, r: R, color, fx: d.fx });
          hitProps(s, t.x, t.y, R);
          for (const f of s.foes) if (!f.dead && (f.x - t.x) ** 2 + (f.y - t.y) ** 2 < (R + f.def.radius) ** 2) damageFoe(s, f, L.damage, d.knock ?? 0, d.element);
        }
        break;
      }
      case 'chain': {
        // 가장 가까운 적에서 시작해 가까운 적으로 count번 튄다
        let from: [number, number] = [p.x, p.y - 20];
        const hit = new Set<number>();
        const pts: [number, number][] = [from];
        let t = nearest(s, p.x, p.y);
        if (!t || (t.x - p.x) ** 2 + (t.y - p.y) ** 2 > 380 * 380) break;
        for (let i = 0; i <= L.count && t; i++) {
          hit.add(t.uid);
          pts.push([t.x, t.y - 20]);
          damageFoe(s, t, L.damage * (1 - i * 0.08), 0, d.element ?? 'shock');
          from = [t.x, t.y];
          let next: Foe | null = null;
          let bd = (190 * L.area * area) ** 2;
          for (const f of s.foes) {
            if (f.dead || hit.has(f.uid)) continue;
            const dd = (f.x - from[0]) ** 2 + (f.y - from[1]) ** 2;
            if (dd < bd) {
              bd = dd;
              next = f;
            }
          }
          t = next;
        }
        s.events.push({ type: 'chain', pts, color });
        break;
      }
      case 'beam': {
        // 겨눈 쪽으로 한 줄 — 길이·너비 안의 적을 모두 친다
        const len = 520 * L.area * area;
        const wdt = 18 * L.area * area;
        const ux = Math.cos(aim);
        const uy = Math.sin(aim);
        s.events.push({ type: 'beam', x: p.x, y: p.y - 20, angle: aim, len, w: wdt, color });
        for (const f of s.foes) {
          if (f.dead) continue;
          const rx = f.x - p.x;
          const ry = f.y - 20 - (p.y - 20);
          const along = rx * ux + ry * uy;
          if (along < 0 || along > len) continue;
          if (Math.abs(rx * uy - ry * ux) < wdt + f.def.radius) damageFoe(s, f, L.damage, d.knock ?? 4, d.element);
        }
        break;
      }
      case 'heal': {
        const before = p.hp;
        p.hp = Math.min(p.maxHp, p.hp + L.damage);
        if (p.hp > before) s.events.push({ type: 'heal', amount: Math.round(p.hp - before) });
        break;
      }
      case 'rain': {
        for (let i = 0; i < L.count; i++) {
          const t = s.foes.length ? s.foes[s.rng.int(0, s.foes.length - 1)] : null;
          const close = t && !t.dead && (t.x - p.x) ** 2 + (t.y - p.y) ** 2 < 300 * 300;
          const x = close ? t.x : p.x + (s.rng.next() - 0.5) * 400;
          const y = close ? t.y : p.y + (s.rng.next() - 0.5) * 300;
          s.zones.push({ x, y, r: 70 * L.area * area, damage: L.damage, until: s.t + L.duration, every: 0.35, next: s.t, weapon: d.id, color, element: d.element });
        }
        break;
      }
    }
  }
}

function moveShots(s: State): void {
  const p = s.player;
  for (const sh of s.shots) {
    // 따라오는 탄(그림자 탄): 인물 쪽으로 조금씩 꺾는다
    if (sh.homing && !sh.weapon && sh.life > 1) {
      const want = Math.atan2(p.y - 20 - sh.y, p.x - sh.x);
      const cur = Math.atan2(sh.vy, sh.vx);
      let da = want - cur;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      const turn = Math.max(-sh.homing * DT, Math.min(sh.homing * DT, da));
      const sp = Math.hypot(sh.vx, sh.vy);
      sh.vx = Math.cos(cur + turn) * sp;
      sh.vy = Math.sin(cur + turn) * sp;
    }
    sh.x += sh.vx * DT;
    sh.y += sh.vy * DT;
    sh.life -= DT;
    if (sh.life <= 0) {
      if (sh.zone) addFoeZone(s, sh.x, sh.y + 20, sh.zone.radius, sh.zone.dps * s.chapter.dmg, sh.zone.seconds, sh.zone.element ?? 'fire');
      continue;
    }
    // 벽은 적 탄과 불덩이·검광(관통이 적은 탄)을 막는다 — 검기(wave)는 넘는다
    const wallStop = !sh.weapon || WEAPONS.get(sh.weapon)?.kind === 'bolt';
    if (wallStop && blocksShot(s.terrain, sh.x, sh.y + 20)) {
      sh.life = 0;
      if (sh.zone) addFoeZone(s, sh.x, sh.y + 20, sh.zone.radius, sh.zone.dps * s.chapter.dmg, sh.zone.seconds, sh.zone.element ?? 'fire');
      continue;
    }
    if (!sh.weapon) {
      const rr = sh.r + RULES.player.radius;
      const d2 = (sh.x - p.x) ** 2 + (sh.y - p.y + 20) ** 2;
      if (d2 < rr * rr && s.t >= p.dashUntil) {
        hurtPlayer(s, sh.damage);
        sh.life = 0;
        if (sh.zone) addFoeZone(s, sh.x, sh.y + 20, sh.zone.radius, sh.zone.dps * s.chapter.dmg, sh.zone.seconds, sh.zone.element ?? 'fire');
      } else if (s.t < p.dashUntil && p.dashMove && d2 < RULES.counter.shotRadius ** 2) {
        // 보법으로 탄을 아슬하게 비켰다
        sh.life = 0;
        counter(s, sh.x, sh.y);
      }
      continue;
    }
    hitProps(s, sh.x, sh.y + 20, sh.r * 0.5);
    for (const f of s.foes) {
      if (f.dead || sh.hit!.has(f.uid)) continue;
      const rr = sh.r + f.def.radius;
      if ((f.x - sh.x) ** 2 + (f.y - 20 - sh.y) ** 2 > rr * rr) continue;
      sh.hit!.add(f.uid);
      damageFoe(s, f, sh.damage, sh.knock ?? 0, sh.element);
      if (sh.pierce-- <= 0) {
        sh.life = 0;
        break;
      }
    }
  }
  s.shots = s.shots.filter((x) => x.life > 0);
  for (const z of s.zones) {
    if (s.t < z.next) continue;
    z.next = s.t + z.every;
    hitProps(s, z.x, z.y, z.r);
    for (const f of s.foes) if (!f.dead && (f.x - z.x) ** 2 + (f.y - z.y) ** 2 < (z.r + f.def.radius) ** 2) damageFoe(s, f, z.damage, 0, z.element);
  }
  s.zones = s.zones.filter((z) => s.t < z.until);
  // 예고한 자리(원·띠·부채꼴·고리)가 떨어진다
  for (const m of s.slams) {
    if (s.t < m.at) continue;
    if (inSlam(m, p.x, p.y, RULES.player.radius)) {
      // 내려찍기가 떨어지는 순간 보법 중이면 간파
      if (s.t < p.dashUntil) counter(s, p.x, p.y);
      else hurtPlayer(s, m.damage);
    }
    if (m.hurtsFoes) for (const f of s.foes) if (!f.dead && inSlam(m, f.x, f.y, f.def.radius)) damageFoe(s, f, m.damage * 2, 20, undefined, true);
    if (m.zone) addFoeZone(s, m.x, m.y, m.zone.radius, m.zone.dps * s.chapter.dmg, m.zone.seconds, m.zone.element ?? 'poison');
    // 땅굴 그림자: 이 자리에서 솟는다
    if (m.owner !== undefined) {
      const f = s.foes.find((x) => x.uid === m.owner);
      if (f && !f.dead) {
        f.x = m.x;
        f.y = m.y;
        f.burrowUntil = 0;
      }
    }
    s.events.push({ type: 'skill', x: m.x, y: m.y, fx: m.fx, color: m.color, kind: m.shape && m.shape !== 'circle' ? m.shape : m.zone ? 'zone' : undefined, angle: m.angle, r: m.r, len: m.len, w: m.w, r0: m.r0 });
  }
  s.slams = s.slams.filter((m) => s.t < m.at);
  // 웅덩이: 안에 있으면 0.5초마다(보법 중엔 안 다친다)
  for (const z of s.foeZones) {
    if (s.t < z.next) continue;
    z.next = s.t + 0.5;
    if ((p.x - z.x) ** 2 + (p.y - z.y) ** 2 < (z.r + RULES.player.radius * 0.5) ** 2 && s.t >= p.dashUntil) {
      hurtPlayer(s, z.dps * 0.5, true);
      if (z.element === 'ice') s.chillUntil = Math.max(s.chillUntil, s.t + 1);
    }
  }
  s.foeZones = s.foeZones.filter((z) => s.t < z.until);
}

/** 예고 모양 안인가(pad: 맞는 쪽 반지름) */
export function inSlam(m: Slam, x: number, y: number, pad: number): boolean {
  const dx = x - m.x;
  const dy = y - m.y;
  switch (m.shape ?? 'circle') {
    case 'line': {
      const c = Math.cos(m.angle ?? 0);
      const sn = Math.sin(m.angle ?? 0);
      const along = dx * c + dy * sn;
      const perp = Math.abs(-dx * sn + dy * c);
      return along > -pad && along < (m.len ?? 0) + pad && perp < (m.w ?? 20) + pad;
    }
    case 'cone': {
      const d = Math.hypot(dx, dy);
      if (d > m.r + pad) return false;
      if (d < pad) return true;
      let da = Math.atan2(dy, dx) - (m.angle ?? 0);
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      return Math.abs(da) < (m.w ?? 0.6) + pad / d;
    }
    case 'ring': {
      const d = Math.hypot(dx, dy);
      return d < m.r + pad && d > (m.r0 ?? 0) - pad;
    }
    default:
      return dx * dx + dy * dy < (m.r + pad) ** 2;
  }
}

function pickups(s: State): void {
  const p = s.player;
  const reach = stat.pickup(s);
  for (const g of s.gems) {
    const d = Math.hypot(p.x - g.x, p.y - g.y);
    if (d < reach) g.pulled = true;
    if (!g.pulled) continue;
    // 빨려 드는 곡선: 처음엔 살짝 밀려났다가 점점 빨라지며 휘어 들어온다
    g.pt = (g.pt ?? 0) + DT;
    const v = Math.max(280, stat.speed(s) * 1.7) * Math.min(2.6, g.pt < 0.12 ? -0.6 : 0.4 + g.pt * 3) * DT;
    const ux = (p.x - g.x) / (d || 1);
    const uy = (p.y - g.y) / (d || 1);
    const swirl = Math.max(0, 0.5 - g.pt) * 0.9;
    g.x += (ux - uy * swirl) * Math.min(v, d);
    g.y += (uy + ux * swirl) * Math.min(v, d);
    if (d < 18) {
      g.taken = true;
      if (s.events.length < 400) s.events.push({ type: 'gem' });
      gainXp(s, g.xp * effMul(s, 'xp'));
    }
  }
  s.gems = s.gems.filter((g) => !g.taken);
  if (s.gems.length > 500) {
    const far = s.gems.filter((g) => !g.pulled).sort((a, b) => Math.hypot(b.x - p.x, b.y - p.y) - Math.hypot(a.x - p.x, a.y - p.y));
    const merge = far.slice(0, s.gems.length - 400);
    const keep = far[merge.length];
    if (keep) for (const g of merge) keep.xp += g.xp;
    const drop = new Set(merge);
    s.gems = s.gems.filter((g) => !drop.has(g));
  }
  for (const it of s.items) {
    const def0 = ITEMS.get(it.kind);
    // 장소(상인·수련소): 떠날 때가 되면 사라지고, 들어가면 가게가 열린다(나갔다 다시 들어오면 또)
    if (def0?.place) {
      const inR = Math.hypot(p.x - it.x, p.y - it.y) < def0.place.radius;
      if (it.until !== undefined && s.t >= it.until && !inR) {
        it.taken = true;
        s.events.push({ type: 'event', text: `${def0.place.name}이 떠났다`, kind: 'item' });
        continue;
      }
      if (inR && !it.inside && !s.pending && (!it.hidden || isExplored(s, it.x, it.y))) {
        it.inside = true;
        it.hidden = false;
        openPlace(s, it, def0);
      } else if (!inR) it.inside = false;
      continue;
    }
    if (Math.hypot(p.x - it.x, p.y - it.y) > RULES.player.radius + 22) continue;
    it.taken = true;
    s.events.push({ type: 'item', kind: it.kind, x: it.x, y: it.y });
    const def = ITEMS.get(it.kind);
    if (def) for (const op of def.ops) applyOp(s, op, def, it);
  }
  s.items = s.items.filter((it) => !it.taken);
}

/** 장소에 들어갔다: 처음이면 진열을 정하고(ops), 남은 진열 + 지나가기를 띄운다 */
function openPlace(s: State, it: Item, def: ItemDef): void {
  if (!it.stock) {
    s.pending = null;
    for (const op of def.ops) applyOp(s, op, def, it);
    const got = (s as { pending: Choice[] | null }).pending ?? [];
    it.stock = got.filter((c) => c.kind !== 'leave');
  }
  s.shopItem = it;
  s.pending = [...it.stock.map((c) => ({ ...c })), { kind: 'leave', id: 'leave', lv: 0 }];
  s.events.push({ type: 'item', kind: it.kind, x: it.x, y: it.y });
}
/** 가게에서 하나 샀다: 진열에서 빼고 가게는 그대로(지나가기를 누를 때까지) */
function afterBuy(s: State, c: Choice): void {
  const it = s.shopItem;
  if (it?.stock) {
    const k = it.stock.findIndex((x) => x.kind === c.kind && x.id === c.id);
    if (k >= 0) it.stock.splice(k, 1);
    // 올리기는 다음 레벨 값으로 다시 건다
    if (c.kind === 'upskill') {
      const w = s.weapons.find((x) => x.id === c.id);
      if (w && w.lv < WEAPONS.get(w.id)!.levels.length) it.stock.splice(Math.max(0, k), 0, { kind: 'upskill', id: w.id, lv: RULES.endless.dojoPrices.up + RULES.endless.dojoPrices.upPerLv * (w.lv + 1) });
    }
    if (c.kind === 'sellskill') it.stock = it.stock.filter((x) => x.id !== c.id);
    s.pending = [...it.stock.map((x) => ({ ...x })), { kind: 'leave', id: 'leave', lv: 0 }];
  } else s.pending = null;
}
/** 가게를 닫는다 */
function closeShop(s: State): void {
  s.pending = null;
  s.shopItem = null;
  if (s.queuedLevels > 0) offerChoices(s);
}

/** 줍는 것의 기본 동작 하나(items.json ops) */
function applyOp(s: State, op: ItemOp, def: ItemDef, it?: Item): void {
  const p = s.player;
  switch (op.op) {
    case 'heal':
      p.hp = op.full ? p.maxHp : Math.min(p.maxHp, p.hp + (op.amount ?? 0));
      break;
    case 'maxhp':
      s.bonusHp += op.amount;
      p.maxHp += op.amount;
      break;
    case 'magnet':
      s.gems.forEach((g) => (g.pulled = true));
      break;
    case 'bomb':
      s.events.push({ type: 'bomb', x: p.x, y: p.y });
      for (const f of s.foes) if (!f.dead && (f.x - p.x) ** 2 + (f.y - p.y) ** 2 < op.radius ** 2) damageFoe(s, f, op.damage * (1 + s.chapterIndex * 0.6));
      break;
    case 'freeze':
      s.freezeUntil = s.t + op.seconds;
      s.events.push({ type: 'freeze' });
      break;
    case 'gold':
      s.gold += Math.round(s.rng.int(op.min, op.max) * stat.greed(s));
      break;
    case 'shield':
      p.shieldUntil = Math.max(p.shieldUntil, s.t + op.seconds);
      break;
    case 'buff':
      s.buffs.push({ stat: op.stat, mul: op.mul, add: 0, until: s.t + op.seconds });
      break;
    case 'reveal':
      reveal(s, op.cells);
      // 판 위 상자가 지도에 보이게
      for (const it of s.items) if (it.kind === 'chest') reveal(s, 2, it);
      break;
    case 'xp':
      gainXp(s, (xpNeed(s.level) * op.frac) / stat.xpMul(s));
      break;
    case 'storm':
      s.storms.push({ until: s.t + op.seconds, every: op.seconds / op.count, next: s.t, damage: op.damage * (1 + s.chapterIndex * 0.5), r: op.radius, color: op.color });
      break;
    case 'purge':
      s.shots = s.shots.filter((x) => x.weapon);
      s.slams = [];
      s.events.push({ type: 'nova', x: p.x, y: p.y, r: 500, color: '#dff4ff', weapon: '' });
      break;
    case 'random': {
      if (op.pool === 'blessing') {
        applyOp(s, ITEM_DATA.blessing[s.rng.int(0, ITEM_DATA.blessing.length - 1)], def);
        break;
      }
      const inner = s.rng.weighted(
        DROP_ITEMS.filter((d) => d.id !== 'pouch' && d.id !== 'secret_book'),
        (d) => d.drop!,
      )!;
      s.events.push({ type: 'event', text: `${def.name} — 「${inner.name}」`, kind: 'item' });
      for (const o of inner.ops) applyOp(s, o, inner);
      break;
    }
    case 'field':
      s.zones.push({ x: p.x, y: p.y, r: op.radius, damage: op.damage * (1 + s.chapterIndex * 0.5), until: s.t + op.seconds, every: 0.4, next: s.t, weapon: '', color: op.color, element: op.element });
      break;
    case 'push':
      s.events.push({ type: 'nova', x: p.x, y: p.y, r: op.radius, color: def.color, weapon: '' });
      for (const f of s.foes) if (!f.dead && (f.x - p.x) ** 2 + (f.y - p.y) ** 2 < op.radius ** 2) damageFoe(s, f, op.damage * (1 + s.chapterIndex * 0.5), op.force);
      break;
    case 'slowfoes':
      s.effects.push({ kind: 'foeSpeed', mul: op.mul, until: s.t + op.seconds });
      break;
    case 'unlock':
      if (!unlockRandom(s, op.count).length) s.gold += 30;
      break;
    case 'shop':
      offerShop(s, op.count, op.skills ?? 0);
      break;
    case 'skillshop':
      offerSkillShop(s, op.count);
      break;
    case 'ambush':
      for (let i = 0; i < op.count; i++) spawnElite(s, 220, 340);
      break;
    case 'chest':
      openChest(s);
      break;
    case 'stele': {
      const n = it?.stele ?? 0;
      const id = `${s.chapter.id}-${n}`;
      if (!s.steles.includes(id)) s.steles.push(id);
      s.events.push({ type: 'stele', id, text: s.chapter.steles?.[n] ?? '' });
      s.gold += 10;
      break;
    }
    case 'trial': {
      const A = RULES.explore.altar;
      s.trial = { until: s.t + A.seconds, goal: A.base + A.perChapter * s.chapterIndex, start: s.chapterKills };
      s.events.push({ type: 'event', text: `수련 제단 — ${A.seconds}초 안에 그림자 ${s.trial.goal}을 쓰러뜨려라`, kind: 'trial' });
      // 도전 동안 무리가 몰려든다
      for (let i = 0; i < s.trial.goal; i++) spawnAround(s, pickRole(s, { main: 2, fast: 1 }), 320, 520, (i / s.trial.goal) * Math.PI * 2);
      break;
    }
  }
}

/** 떠돌이 상인: 물건 count개(+ 무한 모드는 풀 밖 무공 skills개) + 지나가기 */
function offerShop(s: State, count: number, skills = 0): void {
  const ids = Object.keys(ITEM_DATA.prices).filter((id) => ITEMS.has(id));
  const picks: Choice[] = [];
  while (picks.length < count && ids.length) {
    const id = ids.splice(s.rng.int(0, ids.length - 1), 1)[0];
    picks.push({ kind: 'buy', id, lv: Math.round(ITEM_DATA.prices[id] * (1 + s.chapterIndex * 0.15 + (s.mode === 'endless' ? s.t / 600 : 0))) });
  }
  if (s.pool && skills) {
    const P = RULES.endless.dojoPrices;
    picks.push(...offPool(s, skills, (P.buy + P.buyPerMin * (s.t / 60)) * 1.1));
  }
  picks.push({ kind: 'leave', id: 'leave', lv: 0 });
  s.pending = picks;
}

function gainXp(s: State, xp: number): void {
  s.xp += xp * stat.xpMul(s);
  while (s.xp >= xpNeed(s.level)) {
    s.xp -= xpNeed(s.level);
    s.level++;
    s.queuedLevels++;
    s.events.push({ type: 'level', level: s.level });
  }
  if (!s.pending && s.queuedLevels > 0) offerChoices(s);
}

function openChest(s: State): void {
  for (const w of s.weapons) {
    const d = WEAPONS.get(w.id)!;
    if (d.evolve && w.lv >= d.levels.length && s.passives.has(d.evolve.with)) {
      w.id = d.evolve.into;
      w.lv = 1;
      w.next = s.t;
      s.events.push({ type: 'chest', text: `각성 — ${WEAPONS.get(w.id)!.name}` });
      return;
    }
  }
  const up = s.weapons.filter((w) => w.lv < WEAPONS.get(w.id)!.levels.length);
  if (up.length) {
    const w = up[s.rng.int(0, up.length - 1)];
    w.lv++;
    s.events.push({ type: 'chest', text: `${WEAPONS.get(w.id)!.name} Lv.${w.lv}` });
  } else {
    const g = 10 + s.rng.int(0, 10);
    s.gold += g;
    s.player.hp = s.player.maxHp;
    s.events.push({ type: 'chest', text: `체력을 되찾고 금화 ${g}` });
  }
}

const LOCKABLE_SET = new Set(LOCKABLE);
/** 새로 나올 수 있나: 잠기지 않았고, 봉인하지 않았고, 카드 것이면 무공록에 있어야 */
function offerable(s: State, id: string): boolean {
  if (s.banished.has(id)) return false;
  // 무한 모드: 판의 무공 풀 안에서만(잠김·무공록과 상관없이)
  if (s.pool) return s.pool.has(id);
  if (s.locked?.has(id)) return false;
  if (s.book && LOCKABLE_SET.has(id) && !s.book.has(id)) return false;
  return true;
}
/** 가진 무공의 각성 짝 심법 id */
export function partnersOf(s: State): Map<string, string> {
  const m = new Map<string, string>();
  for (const w of s.weapons) {
    const ev = WEAPONS.get(w.id)?.evolve;
    if (ev) m.set(ev.with, w.id);
  }
  return m;
}

export function choicePool(s: State): Choice[] {
  const out: Choice[] = [];
  for (const w of s.weapons) {
    const d = WEAPONS.get(w.id)!;
    if (w.lv < d.levels.length) out.push({ kind: 'weapon', id: w.id, lv: w.lv + 1 });
  }
  if (s.weapons.length < s.slots.weapons) {
    const owned = new Set(s.weapons.map((w) => w.id));
    for (const w of s.weapons) for (const d of WEAPONS.values()) if (d.evolve?.into === w.id) owned.add(d.id);
    for (const d of WEAPONS.values()) if (!d.evolved && !owned.has(d.id) && offerable(s, d.id) && (s.pool || d.owner === '*' || d.owner === s.hero.id || s.hero.pool.includes(d.id))) out.push({ kind: 'weapon', id: d.id, lv: 1 });
  }
  for (const pd of PASSIVES.values()) {
    const lv = s.passives.get(pd.id) ?? 0;
    if (lv >= pd.max) continue;
    if (lv === 0 && (s.passives.size >= s.slots.passives || !offerable(s, pd.id))) continue;
    out.push({ kind: 'passive', id: pd.id, lv: lv + 1 });
  }
  return out;
}

function offerChoices(s: State): void {
  const pool = choicePool(s);
  if (!pool.length) {
    // 다 찼으면: 최대 체력 +10(이어 간다) · 금화
    s.pending = [
      { kind: 'food', id: 'vigor_up', lv: 0 },
      { kind: 'gold', id: 'gold', lv: 0 },
    ];
    return;
  }
  const picks: Choice[] = [];
  const rest = [...pool];
  // 고를 것이 많아(카드 무공) 가진 것 올리기가 묻히지 않게: 올리기는 무겁게, 새 것은 하나하나 가볍게
  const fresh = rest.filter((x) => x.lv === 1).length;
  const ups = rest.length - fresh;
  const many = s.rng.next() < stat.luck(s) ? 4 : 3;
  // 각성 짝 심법은 잘 나오게(2026-11-21 "각성을 노리고 키우는 게 사실상 불가능")
  const partners = partnersOf(s);
  while (picks.length < many && rest.length) {
    const c = s.rng.weighted(rest, (x) => (x.lv > 1 ? Math.max(1.6, fresh / Math.max(1, ups) / 2) : 1) * (x.kind === 'passive' && partners.has(x.id) ? RULES.build.partnerWeight : 1))!;
    picks.push(c);
    rest.splice(rest.indexOf(c), 1);
  }
  s.pending = picks;
}

/** 레벨업 후보 손보기(장마다 횟수 제한): 다시 뽑기 · 봉인(이 후보를 이번 이야기에서 빼고 다시 뽑기) · 건너뛰기(금화) */
export function reroll(s: State): boolean {
  if (!s.pending || s.rerolls <= 0 || s.pending.some((c) => c.kind === 'buy' || c.kind === 'leave')) return false;
  s.rerolls--;
  s.pending = null;
  offerChoices(s);
  return true;
}
export function banish(s: State, i: number): boolean {
  const c = s.pending?.[i];
  if (!c || s.banishes <= 0 || (c.kind !== 'weapon' && c.kind !== 'passive') || c.lv !== 1) return false;
  s.banishes--;
  s.banished.add(c.id);
  s.pending = null;
  offerChoices(s);
  return true;
}
export function skip(s: State): boolean {
  if (!s.pending || s.skips <= 0 || s.pending.some((c) => c.kind === 'buy' || c.kind === 'leave')) return false;
  s.skips--;
  s.gold += RULES.build.skipGold;
  s.pending = null;
  s.queuedLevels = Math.max(0, s.queuedLevels - 1);
  if (s.queuedLevels > 0) offerChoices(s);
  return true;
}

export function choose(s: State, i: number): void {
  const c = s.pending?.[i];
  if (!c) return;
  // 가게(상인·수련소): 사도 가게는 열린 채, 지나가기로 닫는다
  if (c.kind === 'leave') return closeShop(s);
  if (c.kind === 'buyskill' || c.kind === 'upskill' || c.kind === 'sellskill' || c.kind === 'buy') {
    if (c.kind !== 'sellskill' && s.gold < c.lv) return;
    if (c.kind === 'buy') {
      s.gold -= c.lv;
      const def = ITEMS.get(c.id);
      const keep = s.pending;
      s.pending = null;
      if (def) for (const op of def.ops) applyOp(s, op, def);
      // 물건이 다른 창(상자·가게)을 띄우지 않았으면 가게로 돌아간다
      if (s.pending && s.pending !== keep) return;
    } else if (c.kind === 'buyskill') {
      if (WEAPONS.has(c.id)) {
        if (s.weapons.length >= s.slots.weapons) return;
        s.weapons.push({ id: c.id, lv: 1, next: s.t });
      } else {
        if (s.passives.size >= s.slots.passives) return;
        s.passives.set(c.id, 1);
        if ((PASSIVES.get(c.id)?.stat ?? c.id) === 'vigor') {
          s.player.maxHp += 10;
          s.player.hp += 10;
        }
      }
      // 산 것은 이 판의 풀에 든다(레벨업에서 올릴 수 있게)
      s.pool?.add(c.id);
      s.gold -= c.lv;
    } else if (c.kind === 'upskill') {
      const w = s.weapons.find((x) => x.id === c.id);
      if (!w || w.lv >= WEAPONS.get(w.id)!.levels.length) return;
      w.lv++;
      s.gold -= c.lv;
    } else {
      s.weapons = s.weapons.filter((x) => x.id !== c.id);
      s.gold += c.lv;
    }
    s.events.push({ type: 'buy', id: c.id, kind: c.kind });
    if (s.shopItem) return afterBuy(s, c);
    s.pending = null;
    if (s.queuedLevels > 0) offerChoices(s);
    return;
  }
  if (c.kind === 'weapon') {
    const w = s.weapons.find((x) => x.id === c.id);
    if (w) w.lv = c.lv;
    else s.weapons.push({ id: c.id, lv: 1, next: s.t });
  } else if (c.kind === 'passive') {
    s.passives.set(c.id, c.lv);
    if ((PASSIVES.get(c.id)?.stat ?? c.id) === 'vigor') {
      s.player.maxHp += 10;
      s.player.hp += 10;
    }
  } else if (c.kind === 'gold') s.gold += 15;
  else {
    s.bonusHp += 10;
    s.player.maxHp += 10;
    s.player.hp = Math.min(s.player.maxHp, s.player.hp + 30);
  }
  s.pending = null;
  s.queuedLevels = Math.max(0, s.queuedLevels - 1);
  if (s.queuedLevels > 0) offerChoices(s);
}

/** 마지막 기술 — 인물마다 다르다(heroes.json ult.kind, 2026-11-21) */
function useUlt(s: State): void {
  if (s.ult < RULES.ult.max) return;
  s.ult = 0;
  const p = s.player;
  const u = s.hero.ult;
  s.events.push({ type: 'ult', x: p.x, y: p.y, fx: `fx_gyeol_tech_${u.id}_a`, color: u.color });
  const k = 1 + 0.05 * s.level;
  const inRange = (f: Foe) => !f.dead && (f.x - p.x) ** 2 + (f.y - p.y) ** 2 < RULES.ult.radius ** 2;
  switch (u.kind) {
    case 'waves': {
      for (const f of s.foes) if (inRange(f)) damageFoe(s, f, u.damage * k);
      const n = u.waves ?? 8;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        s.shots.push({ x: p.x, y: p.y - 20, vx: Math.cos(a) * 560, vy: Math.sin(a) * 560, r: 34, damage: (u.waveDamage ?? 120) * k, life: 1.4, color: u.color, weapon: 'ult', pierce: 999, hit: new Set(), knock: 16 });
      }
      p.shieldUntil = Math.max(p.shieldUntil, s.t + (u.shield ?? 1.5));
      break;
    }
    case 'vow':
      p.shieldUntil = Math.max(p.shieldUntil, s.t + (u.shield ?? 6));
      s.pulses.push({ until: s.t + (u.shield ?? 6), every: u.pulse ?? 0.5, next: s.t, damage: (u.pulseDamage ?? 40) * k, r: u.pulseRadius ?? 220, color: u.color });
      break;
    case 'starfall': {
      const n = u.count ?? 30;
      s.storms.push({ until: s.t + (u.seconds ?? 4), every: (u.seconds ?? 4) / n, next: s.t, damage: u.damage * k, r: u.radius ?? 90, color: u.color });
      break;
    }
    case 'quake':
      for (const f of s.foes)
        if (inRange(f)) {
          f.stunUntil = s.t + (u.stun ?? 2.5) * (f.def.rank ? 0.4 : 1);
          damageFoe(s, f, u.damage * k);
        }
      s.buffs.push({ stat: 'armor', mul: 1, add: u.armor ?? 6, until: s.t + (u.seconds ?? 10) });
      break;
  }
  if (u.heal) p.hp = Math.min(p.maxHp, p.hp + u.heal);
}

/** 보법을 쓴다 — 인물마다 다르다(heroes.json dash.kind) */
function useDash(s: State): void {
  const p = s.player;
  const D = s.hero.dash;
  p.dashReady = s.t + D.cooldown * stat.dashcd(s);
  p.grazed.clear();
  s.grazeCombo = 0;
  p.dashFromX = p.x;
  p.dashFromY = p.y;
  p.dashMove = true;
  p.dashUntil = s.t + RULES.dash.duration;
  if (D.kind === 'charge') {
    p.dashUntil = s.t + 0.3;
    p.shieldUntil = Math.max(p.shieldUntil, s.t + 0.3 + (D.shield ?? 1));
  } else if (D.kind === 'stomp') {
    p.dashUntil = s.t + 0.3;
    p.stompPending = true;
  } else if (D.kind === 'blink') {
    // 벽 너머라도 걸을 수 있는 가장 먼 곳으로 — 떠난 자리에 서리
    p.dashMove = false;
    p.dashUntil = s.t + 0.25;
    for (let d = D.distance ?? 240; d >= 30; d -= 10) {
      const x = p.x + p.dashX * d;
      const y = p.y + p.dashY * d;
      if (walkable(s.terrain, x, y)) {
        p.x = x;
        p.y = y;
        break;
      }
    }
    const r = D.radius ?? 130;
    s.events.push({ type: 'nova', x: p.dashFromX, y: p.dashFromY, r, color: '#9fe6ff', weapon: '' });
    for (const f of s.foes) if (!f.dead && (f.x - p.dashFromX) ** 2 + (f.y - p.dashFromY) ** 2 < r * r) f.slowUntil = s.t + (D.slow ?? 2.5);
  }
  // 얇은 벽·강 넘기: 바로 앞이 막혔으면 vault칸 안의 걸을 수 있는 곳으로 건너뛴다
  if (p.dashMove) {
    const ahead = (k: number) => [p.x + p.dashX * CELL * k, p.y + p.dashY * CELL * k] as const;
    const [ax, ay] = ahead(1);
    if (!walkable(s.terrain, ax, ay)) {
      for (let k = 2; k <= RULES.vault.cells; k++) {
        const [bx, by] = ahead(k);
        if (walkable(s.terrain, bx, by)) {
          p.x = bx;
          p.y = by;
          p.dashMove = false;
          break;
        }
      }
    }
  }
  s.events.push({ type: 'dash', kind: D.kind, x: p.dashFromX, y: p.dashFromY, x2: p.x, y2: p.y, color: s.hero.ult.color });
}

/** 보법 중 한 칸: 베며 지나가기·밀치기, 끝나면 내려찍기 */
function dashTick(s: State): void {
  const p = s.player;
  const D = s.hero.dash;
  if (s.t < p.dashUntil && (D.kind === 'cut' || D.kind === 'charge')) {
    const r = D.radius ?? 60;
    for (const f of s.foes) {
      if (f.dead || p.grazed.has(-f.uid) || (f.x - p.x) ** 2 + (f.y - p.y) ** 2 > (r + f.def.radius) ** 2) continue;
      p.grazed.add(-f.uid);
      damageFoe(s, f, (D.damage ?? 30) * (1 + 0.04 * s.level), D.knock ?? 0);
      if (D.kind === 'cut' && s.events.length < 400) s.events.push({ type: 'graze', x: f.x, y: f.y });
    }
  }
  if (p.stompPending && s.t >= p.dashUntil) {
    p.stompPending = false;
    const r = D.radius ?? 150;
    s.events.push({ type: 'nova', x: p.x, y: p.y, r, color: s.hero.ult.color, weapon: '' });
    hitProps(s, p.x, p.y, r);
    for (const f of s.foes)
      if (!f.dead && (f.x - p.x) ** 2 + (f.y - p.y) ** 2 < (r + f.def.radius) ** 2) {
        if (!f.def.rank) f.stunUntil = s.t + (D.stun ?? 1);
        damageFoe(s, f, (D.damage ?? 50) * (1 + 0.04 * s.level), 20);
      }
  }
}

/** 처음 안내용 연습 원(2026-11-21 튜토리얼): 인물 자리에 아주 약한 붉은 원 — 떨어지는 순간 보법으로 피하면 간파 */
export function practiceSlam(s: State, delay = 1.4): void {
  s.slams.push({ x: s.player.x, y: s.player.y, r: 70, damage: 1, born: s.t, at: s.t + delay, color: '#ff4a4a' });
}

/** 보법 쿨타임(인물마다) */
export const dashCooldown = (s: State): number => s.hero.dash.cooldown * stat.dashcd(s);

/** 판에서 벽이 아닌 칸 비율(다 밝히기 기준) — 장마다 한 번 */
const walkShareCache = new WeakMap<Terrain, number>();
function walkShare(s: State): number {
  let v = walkShareCache.get(s.terrain);
  if (v === undefined) {
    let n = 0;
    for (const c of s.terrain.cells) if (c !== T.Wall) n++;
    v = n / s.terrain.cells.length;
    walkShareCache.set(s.terrain, v);
  }
  return v;
}
export const exploredShare = (s: State): number => s.exploredCount / (s.terrain.w * s.terrain.h * walkShare(s));

/** 한 칸(1/60초). 레벨업 고르기·끝난 장은 멈춰 있다 */
export function step(s: State, input: Input): void {
  if (s.result || s.pending) return;
  s.t += DT;
  s.playTime += DT;
  const p = s.player;
  const len = Math.hypot(input.x, input.y);
  p.moving = len > 0.05;
  // 느린 땅(덤불·눈·핏물)
  const slowGround = cellAt(s.terrain, p.x, p.y) === T.Slow ? 0.62 : 1;
  if (p.moving) {
    const ux = input.x / Math.max(1, len);
    const uy = input.y / Math.max(1, len);
    p.facing = Math.atan2(uy, ux);
    const ul = Math.hypot(ux, uy) || 1;
    p.dashX = ux / ul;
    p.dashY = uy / ul;
    if (s.t >= p.dashUntil) [p.x, p.y] = moveCircle(s.terrain, p.x, p.y, ux * stat.speed(s) * slowGround * DT, uy * stat.speed(s) * slowGround * DT, RULES.player.radius * 0.8);
  }
  if (input.dash && s.t >= p.dashReady) useDash(s);
  if (s.t < p.dashUntil && p.dashMove) {
    const v = s.hero.dash.kind === 'charge' ? RULES.dash.speed * 0.8 : s.hero.dash.kind === 'stomp' ? RULES.dash.speed * 0.7 : RULES.dash.speed;
    [p.x, p.y] = moveCircle(s.terrain, p.x, p.y, p.dashX * v * DT, p.dashY * v * DT, RULES.player.radius * 0.8);
  }
  dashTick(s);
  if (input.ult) useUlt(s);
  if (s.t >= s.exploredAt) {
    s.exploredAt = s.t + RULES.sight.every;
    reveal(s);
  }
  p.hp = Math.min(p.maxHp, p.hp + stat.regen(s) * DT);
  // 독(수식어): 초당 3
  if (s.t < s.poisonUntil && Math.floor(s.t * 2) !== Math.floor((s.t - DT) * 2)) hurtPlayer(s, 1.5, true);
  // 수련 제단
  if (s.trial) {
    if (s.chapterKills - s.trial.start >= s.trial.goal) {
      s.trial = null;
      for (let i = 0; i < RULES.explore.altar.chests; i++) s.items.push({ x: p.x + (i - 0.5) * 50, y: p.y + 40, kind: 'chest' });
      s.events.push({ type: 'event', text: '수련 제단을 넘었다 — 상자 둘', kind: 'trial' });
    } else if (s.t >= s.trial.until) {
      s.trial = null;
      s.events.push({ type: 'event', text: '수련 제단 — 시간이 다 됐다', kind: 'trial' });
    }
  }
  // 판을 거의 다 밝히면 보상
  if (!s.exploreRewarded && s.exploredCount >= s.terrain.w * s.terrain.h * RULES.explore.reward * walkShare(s)) {
    s.exploreRewarded = true;
    s.gold += RULES.explore.gold;
    s.events.push({ type: 'event', text: `지도를 다 밝혔다 — 금화 ${RULES.explore.gold}`, kind: 'explore' });
  }
  runGimmick(s);
  runTimeline(s);
  moveFoes(s);
  fireWeapons(s);
  moveShots(s);
  s.foes = s.foes.filter((f) => !f.dead);
  if (s.boss?.dead) s.boss = null;
  pickups(s);
}

/** 장을 마치면 「천외귀환」 수련 경험치 */
export function trainingXp(s: State): number {
  return Math.floor(s.t / 60) * 4 + (s.result === 'clear' ? 40 : 0);
}

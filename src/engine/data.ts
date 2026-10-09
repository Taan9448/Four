// data/ 폴더의 JSON을 읽어 스키마로 검증하고 조회용 맵을 만든다.
import { z } from 'zod';
import {
  Balance,
  AchievementDef,
  AffixDef,
  CardDef,
  CharacterDef,
  EnemyDef,
  LawDef,
  ModuleDef,
  OathDef,
  PotionDef,
  RelicDef,
  SceneDef,
  SpeakerDef,
  StageDef,
  StatusDef,
  SupportRule,
} from './schema';
import balanceJson from '../../data/balance.json';
import statusesJson from '../../data/statuses.json';
import charactersJson from '../../data/characters.json';
import stagesJson from '../../data/stages.json';
import supportJson from '../../data/support.json';
import speakersJson from '../../data/speakers.json';
import relicsJson from '../../data/relics.json';
import potionsJson from '../../data/potions.json';
import lawsJson from '../../data/abyss_laws.json';
import affixesJson from '../../data/abyss_affixes.json';
import oathsJson from '../../data/abyss_oaths.json';
import achievementsJson from '../../data/abyss_achievements.json';

const cardFiles = import.meta.glob('../../data/cards/*.json', { eager: true, import: 'default' });
const moduleFiles = import.meta.glob('../../data/modules/*.json', { eager: true, import: 'default' });
const sceneFiles = import.meta.glob('../../data/scenes/*.json', { eager: true, import: 'default' });
const enemyFiles = import.meta.glob('../../data/enemies/*.json', { eager: true, import: 'default' });

export interface GameData {
  balance: Balance;
  cards: Map<string, CardDef>;
  statuses: Map<string, StatusDef>;
  characters: Map<string, CharacterDef>;
  enemies: Map<string, EnemyDef>;
  stages: StageDef[];
  modules: Map<string, ModuleDef>;
  support: SupportRule[];
  speakers: Map<string, SpeakerDef>;
  scenes: Map<string, SceneDef>;
  relics: Map<string, RelicDef>;
  potions: Map<string, PotionDef>;
  /** 심연: 굽이의 법칙·접사 */
  laws: Map<string, LawDef>;
  affixes: Map<string, AffixDef>;
  /** 심연 3차: 서약(단계 순)·업적 */
  oaths: OathDef[];
  achievements: Map<string, AchievementDef>;
}

function byId<T extends { id: string }>(items: T[], label: string): Map<string, T> {
  const map = new Map<string, T>();
  for (const it of items) {
    if (map.has(it.id)) throw new Error(`${label}: 중복 id "${it.id}"`);
    map.set(it.id, it);
  }
  return map;
}

function parse<S extends z.ZodType>(schema: S, value: unknown, label: string): z.infer<S> {
  const r = schema.safeParse(value);
  if (!r.success) {
    throw new Error(`${label} 스키마 오류:\n${z.prettifyError(r.error)}`);
  }
  return r.data;
}

export function loadGameData(): GameData {
  const cards = Object.entries(cardFiles).flatMap(([path, json]) =>
    parse(z.array(CardDef), json, path),
  );
  const modules = Object.entries(moduleFiles).flatMap(([path, json]) =>
    parse(z.array(ModuleDef), json, path),
  );
  const scenes = Object.entries(sceneFiles).flatMap(([path, json]) => parse(z.array(SceneDef), json, path));
  const enemies = Object.entries(enemyFiles).flatMap(([path, json]) => parse(z.array(EnemyDef), json, path));
  return {
    balance: parse(Balance, balanceJson, 'data/balance.json'),
    cards: byId(cards, 'cards'),
    statuses: byId(parse(z.array(StatusDef), statusesJson, 'data/statuses.json'), 'statuses'),
    characters: byId(parse(z.array(CharacterDef), charactersJson, 'data/characters.json'), 'characters'),
    enemies: byId(enemies, 'enemies'),
    stages: parse(z.array(StageDef), stagesJson, 'data/stages.json').sort((a, b) => a.order - b.order),
    modules: byId(modules, 'modules'),
    support: parse(z.array(SupportRule), supportJson, 'data/support.json'),
    speakers: byId(parse(z.array(SpeakerDef), speakersJson, 'data/speakers.json'), 'speakers'),
    scenes: byId(scenes, 'scenes'),
    relics: byId(parse(z.array(RelicDef), relicsJson, 'data/relics.json'), 'relics'),
    potions: byId(parse(z.array(PotionDef), potionsJson, 'data/potions.json'), 'potions'),
    laws: byId(parse(z.array(LawDef), lawsJson, 'data/abyss_laws.json'), 'laws'),
    affixes: byId(parse(z.array(AffixDef), affixesJson, 'data/abyss_affixes.json'), 'affixes'),
    oaths: parse(z.array(OathDef), oathsJson, 'data/abyss_oaths.json').sort((a, b) => a.level - b.level),
    achievements: byId(parse(z.array(AchievementDef), achievementsJson, 'data/abyss_achievements.json'), 'achievements'),
  };
}

let cached: GameData | null = null;
export function gameData(): GameData {
  return (cached ??= loadGameData());
}

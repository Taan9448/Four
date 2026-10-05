// data/ 폴더의 JSON을 읽어 스키마로 검증하고 조회용 맵을 만든다.
import { z } from 'zod';
import {
  Balance,
  CardDef,
  CharacterDef,
  EnemyDef,
  ModuleDef,
  StageDef,
  StatusDef,
  SupportRule,
} from './schema';
import balanceJson from '../../data/balance.json';
import statusesJson from '../../data/statuses.json';
import charactersJson from '../../data/characters.json';
import enemiesJson from '../../data/enemies.json';
import stagesJson from '../../data/stages.json';
import supportJson from '../../data/support.json';

const cardFiles = import.meta.glob('../../data/cards/*.json', { eager: true, import: 'default' });
const moduleFiles = import.meta.glob('../../data/modules/*.json', { eager: true, import: 'default' });

export interface GameData {
  balance: Balance;
  cards: Map<string, CardDef>;
  statuses: Map<string, StatusDef>;
  characters: Map<string, CharacterDef>;
  enemies: Map<string, EnemyDef>;
  stages: StageDef[];
  modules: Map<string, ModuleDef>;
  support: SupportRule[];
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
  return {
    balance: parse(Balance, balanceJson, 'data/balance.json'),
    cards: byId(cards, 'cards'),
    statuses: byId(parse(z.array(StatusDef), statusesJson, 'data/statuses.json'), 'statuses'),
    characters: byId(parse(z.array(CharacterDef), charactersJson, 'data/characters.json'), 'characters'),
    enemies: byId(parse(z.array(EnemyDef), enemiesJson, 'data/enemies.json'), 'enemies'),
    stages: parse(z.array(StageDef), stagesJson, 'data/stages.json').sort((a, b) => a.order - b.order),
    modules: byId(modules, 'modules'),
    support: parse(z.array(SupportRule), supportJson, 'data/support.json'),
  };
}

let cached: GameData | null = null;
export function gameData(): GameData {
  return (cached ??= loadGameData());
}

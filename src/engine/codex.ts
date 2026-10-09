// 도감(GAME_DESIGN 2절): 저장 칸과 상관없이 브라우저에 하나. 한 번이라도 본 카드·적·유물·물약·인물·장면과 누적 기록.
// 순수 함수만 둔다(저장은 src/ui/storage.ts). 데이터에서 사라진 id는 읽을 때 버린다.
import type { GameData } from './data';
import type { RunState } from './run';

export interface CodexStats {
  /** 새로 시작한 런 수(다시 하기 제외) */
  runs: number;
  victories: number;
  defeats: number;
  /** 쓰러뜨린 적 수(전투에서 이긴 그 적들) */
  kills: number;
}

export interface Codex {
  /** 카드 id → 본 적 있는 가장 높은 강화 단계 */
  cards: Record<string, number>;
  /** 적 id → 만난 횟수·이긴 횟수 */
  enemies: Record<string, { seen: number; defeated: number }>;
  relics: string[];
  potions: string[];
  /** 동료(characters)·장면 화자(speakers) id */
  people: string[];
  scenes: string[];
  /** 적 id → 본 행동 id(GAME_DESIGN 14절: 본 기술만 도감에 적힌다) */
  moves: Record<string, string[]>;
  /** 심연에서 만난 굽이의 법칙·접사(data/abyss_laws.json·abyss_affixes.json) */
  laws: string[];
  affixes: string[];
  stats: CodexStats;
}

export function emptyCodex(): Codex {
  return { cards: {}, enemies: {}, relics: [], potions: [], people: [], scenes: [], moves: {}, laws: [], affixes: [], stats: { runs: 0, victories: 0, defeats: 0, kills: 0 } };
}

const addTo = (list: string[], id: string) => {
  if (!list.includes(id)) list.push(id);
};

/** 깨졌거나 옛 저장도 받아 준다. 데이터에 없는 id는 버린다 */
export function parseCodex(data: GameData, text: string | null): Codex {
  const c = emptyCodex();
  if (!text) return c;
  let raw: Partial<Codex>;
  try {
    raw = JSON.parse(text) as Partial<Codex>;
  } catch {
    return c;
  }
  if (!raw || typeof raw !== 'object') return c;
  for (const [id, lv] of Object.entries(raw.cards ?? {})) if (data.cards.has(id)) c.cards[id] = Math.max(0, Number(lv) || 0);
  for (const [id, e] of Object.entries(raw.enemies ?? {}))
    if (data.enemies.has(id)) c.enemies[id] = { seen: Math.max(1, Number(e?.seen) || 0), defeated: Math.max(0, Number(e?.defeated) || 0) };
  const keep = (list: unknown, has: (id: string) => boolean) => (Array.isArray(list) ? [...new Set(list.filter((x): x is string => typeof x === 'string' && has(x)))] : []);
  c.relics = keep(raw.relics, (id) => data.relics.has(id));
  c.potions = keep(raw.potions, (id) => data.potions.has(id));
  c.people = keep(raw.people, (id) => data.characters.has(id) || data.speakers.has(id));
  c.scenes = keep(raw.scenes, (id) => data.scenes.has(id));
  c.laws = keep(raw.laws, (id) => data.laws.has(id));
  c.affixes = keep(raw.affixes, (id) => data.affixes.has(id));
  for (const [id, ms] of Object.entries(raw.moves ?? {})) {
    const def = data.enemies.get(id);
    if (def) c.moves[id] = keep(ms, (m) => def.moves.some((x) => x.id === m));
  }
  for (const k of Object.keys(c.stats) as (keyof CodexStats)[]) c.stats[k] = Math.max(0, Number(raw.stats?.[k]) || 0);
  return c;
}

/** 런이 지금 가진 것(덱·유물·물약·동료)과 상점에 놓인 것을 적는다. 다시 하는 런은 원래 런도 */
export function noteRun(codex: Codex, run: RunState): Codex {
  for (const c of run.deck) codex.cards[c.cardId] = Math.max(codex.cards[c.cardId] ?? 0, c.level);
  for (const [id, lv] of Object.entries(run.collection ?? {})) codex.cards[id] = Math.max(codex.cards[id] ?? 0, lv);
  for (const id of run.relics) addTo(codex.relics, id);
  for (const id of run.potions) if (id) addTo(codex.potions, id);
  for (const r of run.roster) addTo(codex.people, r.id);
  // 상점에 놓인 물건도 본 것
  for (const x of run.shop?.cards ?? []) codex.cards[x.cardId] ??= 0;
  for (const x of run.shop?.relics ?? []) addTo(codex.relics, x.relicId);
  for (const x of run.shop?.potions ?? []) addTo(codex.potions, x.potionId);
  // 심연 틈의 거래에서 들여다본 카드
  for (const id of run.abyss?.revealed ?? []) codex.cards[id] ??= 0;
  // 심연에서 지나온 굽이의 법칙
  for (const l of run.abyss?.loops ?? []) for (const id of l.laws ?? []) addTo((codex.laws ??= []), id);
  if (run.replayOf) noteRun(codex, run.replayOf);
  return codex;
}

/** 카드 하나(보상·상점에서 본 것 포함) */
export function noteCard(codex: Codex, cardId: string, level = 0): Codex {
  codex.cards[cardId] = Math.max(codex.cards[cardId] ?? 0, level);
  return codex;
}

export function noteItem(codex: Codex, kind: 'relics' | 'potions', id: string | null | undefined): Codex {
  if (id) addTo(codex[kind], id);
  return codex;
}

/** 심연 전투에서 만난 접사 */
export function noteAffixes(codex: Codex, affixIds: readonly string[]): Codex {
  for (const id of affixIds) addTo((codex.affixes ??= []), id);
  return codex;
}

/** 전투를 시작할 때 만난 적 */
export function noteEnemiesSeen(codex: Codex, enemyIds: readonly string[]): Codex {
  for (const id of new Set(enemyIds)) {
    const e = (codex.enemies[id] ??= { seen: 0, defeated: 0 });
    e.seen += 1;
  }
  return codex;
}

/**
 * 전투가 끝났을 때. victory면 그 전투의 적(변신한 모습·불려 나온 적 포함)을 이긴 것으로 센다.
 * 끝에서 처음 보는 적(변신·소환)도 만난 것으로 적는다
 */
export function noteBattleEnd(codex: Codex, enemyIds: readonly string[], victory: boolean, moves: Record<string, string[]> = {}): Codex {
  for (const [id, ms] of Object.entries(moves)) for (const m of ms) addTo((codex.moves[id] ??= []), m);
  for (const id of new Set(enemyIds)) {
    const e = (codex.enemies[id] ??= { seen: 1, defeated: 0 });
    if (victory) e.defeated += 1;
  }
  if (victory) {
    codex.stats.victories += 1;
    codex.stats.kills += enemyIds.length;
  } else codex.stats.defeats += 1;
  return codex;
}

/** 본 장면과 그 장면에 나온 인물 */
export function noteScene(data: GameData, codex: Codex, sceneId: string): Codex {
  const scene = data.scenes.get(sceneId);
  if (!scene) return codex;
  addTo(codex.scenes, sceneId);
  for (const l of scene.lines) if (l.speaker && (data.speakers.has(l.speaker) || data.characters.has(l.speaker))) addTo(codex.people, l.speaker);
  return codex;
}

/** 도감에 싣는 카드: 상태·저주와 틈의 카드(심연 전용)는 빼고 */
export const codexCards = (data: GameData) => [...data.cards.values()].filter((c) => c.pool !== 'status' && c.owner !== 'status' && c.pool !== 'abyss');

/** 도감에 싣는 인물: 동료(지원 포함) 다음 장면 화자 */
export const codexPeople = (data: GameData) => [...new Set([...data.characters.keys(), ...data.speakers.keys()])];

export interface CodexProgress {
  label: string;
  seen: number;
  total: number;
}

/** 분류별 채운 칸 수 */
export function codexProgress(data: GameData, codex: Codex): CodexProgress[] {
  const cards = codexCards(data);
  const people = codexPeople(data);
  return [
    { label: '카드', seen: cards.filter((c) => c.id in codex.cards).length, total: cards.length },
    { label: '적', seen: [...data.enemies.keys()].filter((id) => codex.enemies[id]).length, total: data.enemies.size },
    { label: '유물', seen: codex.relics.length, total: data.relics.size },
    { label: '물약', seen: codex.potions.length, total: data.potions.size },
    { label: '인물', seen: people.filter((id) => codex.people.includes(id)).length, total: people.length },
    { label: '장면', seen: codex.scenes.length, total: data.scenes.size },
  ];
}

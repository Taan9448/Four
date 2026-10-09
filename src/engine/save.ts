// 런 저장·불러오기: RunState를 JSON 문자열로 바꾸고, 읽을 때 데이터와 맞는지 확인한다.
// 브라우저 저장소(localStorage)는 UI가 맡는다. 여기는 순수 함수만.
import type { GameData } from './data';
import { emptyStats, type RunState } from './run';
import { collectionFromDeck, grantStarters, loadoutOwners, recommendLoadout } from './collection';

// 2: 10스테이지 개편(2026-10-08) — 스테이지 id의 뜻이 바뀌어 옛 저장은 버린다
export const SAVE_VERSION = 2;

interface SaveFile {
  version: number;
  savedAt: number;
  run: RunState;
}

export function serializeRun(run: RunState, now = Date.now()): string {
  const file: SaveFile = { version: SAVE_VERSION, savedAt: now, run };
  return JSON.stringify(file);
}

export interface LoadedRun {
  run: RunState;
  savedAt: number;
}

/**
 * 저장 문자열을 런으로 되살린다. 버전이 다르거나, 지금 데이터에 없는 스테이지·모듈·카드·인물을 가리키면
 * (데이터가 바뀐 뒤의 옛 저장) null — 깨진 런을 이어 가지 않는다.
 */
export function deserializeRun(data: GameData, text: string | null | undefined): LoadedRun | null {
  if (!text) return null;
  let file: SaveFile;
  try {
    file = JSON.parse(text) as SaveFile;
  } catch {
    return null;
  }
  if (!file || file.version !== SAVE_VERSION || !file.run) return null;
  const run = file.run;
  migrate(data, run);
  if (run.replayOf) migrate(data, run.replayOf);
  return isValidRun(data, run) ? { run, savedAt: Number(file.savedAt) || 0 } : null;
}

/** 옛 저장을 지금 형식으로 채운다(없는 칸만) */
function migrate(data: GameData, run: RunState): void {
  // 레벨 도입(2026-10-08) 전 저장: 레벨 1, 남은 강화·소식 없음으로 채운다
  for (const r of run.roster ?? []) {
    r.level ??= 1;
    r.xp ??= 0;
  }
  run.pendingUpgrades ??= [];
  run.levelLog ??= [];
  // 경제 도입(2026-10-08) 전 저장: 시작 골드, 유물·물약 없음
  run.gold ??= data.balance.economy.startGold;
  run.relics ??= [];
  run.potions ??= Array.from({ length: data.balance.economy.potionSlots }, () => null);
  run.shop ??= null;
  run.shopSwaps ??= 0;
  if (run.shop) run.shop.swapUsed ??= false;
  // 난이도·다시 하기 도입(2026-10-08) 전 저장: 보통, 하드코어 아님
  run.difficulty ??= 'normal';
  run.hardcore ??= false;
  run.fallen ??= [];
  run.replays ??= {};
  run.stats ??= emptyStats();
  run.replayOf ??= null;
  // 보유 카드·편성 도입(2026-10-08, GAME_DESIGN 9-1) 전 저장: 지금 덱을 보유 목록으로, 시작 카드를 받고, 추천 편성.
  // 이번 스테이지는 지금 덱 그대로 이어 가고 다음 스테이지부터 편성한다
  if (!run.collection) {
    run.collection = collectionFromDeck((run.deck ?? []).filter((c) => data.cards.has(c.cardId)));
    for (const owner of loadoutOwners(data, run)) grantStarters(data, run, owner);
    run.loadout = recommendLoadout(data, run);
    run.needsLoadout = false;
  }
  run.loadout ??= {};
  run.presets ??= Array.from({ length: data.balance.loadout.presets }, () => null);
  run.needsLoadout ??= false;
  run.stageGains ??= [];
  for (const id of Object.keys(run.collection)) if (!data.cards.has(id)) delete run.collection[id];
}

function isValidRun(data: GameData, run: RunState): boolean {
  if (typeof run.seed !== 'string' || typeof run.counter !== 'number') return false;
  if (!['map', 'stage_clear', 'complete', 'defeat'].includes(run.status)) return false;
  // 진 런은 이어 갈 것이 없다. 캠페인을 마친 런(complete)은 남겨 두고 스테이지 다시 하기에 쓴다(2026-10-08)
  if (run.status === 'defeat') return false;
  if (run.replayOf && (run.replayOf.status !== 'complete' || !isValidRun(data, run.replayOf))) return false;
  const stage = data.stages.find((s) => s.id === run.stageId);
  if (!stage?.playable || run.map?.stageId !== run.stageId || !Array.isArray(run.map.floors)) return false;
  const nodes = run.map.floors.flat();
  const nodeIds = new Set(nodes.map((n) => n.id));
  if (!nodes.every((n) => data.modules.has(n.moduleId) && n.next.every((id) => nodeIds.has(id)))) return false;
  if (run.position !== null && !nodeIds.has(run.position)) return false;
  if (!run.visited.every((id) => nodeIds.has(id))) return false;
  if (!run.roster.length || !run.roster.every((r) => data.characters.has(r.id))) return false;
  const rosterIds = new Set(run.roster.map((r) => r.id));
  if (!run.selected.includes('haun') || !run.selected.every((id) => rosterIds.has(id))) return false;
  if (!run.deck.every((c) => data.cards.has(c.cardId) && typeof c.uid === 'string')) return false;
  if (!run.usedModules.every((id) => data.modules.has(id))) return false;
  if (!run.relics.every((id) => data.relics.has(id))) return false;
  if (!run.potions.every((id) => id === null || data.potions.has(id))) return false;
  return Array.isArray(run.flags);
}

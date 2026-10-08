// 런 저장·불러오기: RunState를 JSON 문자열로 바꾸고, 읽을 때 데이터와 맞는지 확인한다.
// 브라우저 저장소(localStorage)는 UI가 맡는다. 여기는 순수 함수만.
import type { GameData } from './data';
import type { RunState } from './run';

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
  return isValidRun(data, run) ? { run, savedAt: Number(file.savedAt) || 0 } : null;
}

function isValidRun(data: GameData, run: RunState): boolean {
  if (typeof run.seed !== 'string' || typeof run.counter !== 'number') return false;
  if (!['map', 'stage_clear', 'complete', 'defeat'].includes(run.status)) return false;
  // 끝난 런은 이어 갈 것이 없다
  if (run.status === 'complete' || run.status === 'defeat') return false;
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
  return Array.isArray(run.flags);
}

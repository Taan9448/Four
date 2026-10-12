// 런 저장·불러오기: RunState를 JSON 문자열로 바꾸고, 읽을 때 데이터와 맞는지 확인한다.
// 브라우저 저장소(localStorage)는 UI가 맡는다. 여기는 순수 함수만.
import type { GameData } from './data';
import { emptyStats, type RunState } from './run';
import { collectionFromDeck, grantStarters, loadoutFocus, loadoutOwners, loadoutProblems, recommendLoadout } from './collection';

// 2: 10스테이지 개편(2026-10-08) — 스테이지 id의 뜻이 바뀌어 옛 저장은 버린다
// 3: 순례(2026-10-11 A안) — 첫 순례 보상·도전 기록을 더한다. 2는 이행해서 읽는다(다시 하기로 이미 얻은 카드는 그대로 둔다)
// 4: 편성 점수 상한·갈래 보너스(2026-10-11 카드 250장 확장) — 상한을 넘는 옛 편성은 추천으로 다시 채운다
// 5: 데미지·체력 10배(2026-10-12) — 옛 저장의 체력·최대 체력·부상·전투 기록 체력을 10배로 읽는다
export const SAVE_VERSION = 5;
const READABLE = [2, 3, 4, 5];
/** 저장 5(데미지·체력 10배)부터의 체력 단위 */
export const HP_SCALE_SINCE = 5;
const HP_SCALE = 10;

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
  if (!file || !READABLE.includes(file.version) || !file.run) return null;
  const run = file.run;
  // 옛 단위(저장 4 이하)의 체력은 10배로(이어 붙은 클리어 런·멈춘 진행까지)
  if (file.version < HP_SCALE_SINCE) scaleHp(run);
  migrate(data, run);
  if (run.replayOf) migrate(data, run.replayOf);
  for (const hub of [run, run.replayOf]) if (hub) keepValidSuspended(data, hub);
  return isValidRun(data, run) ? { run, savedAt: Number(file.savedAt) || 0 } : null;
}

/** 저장 4 이하 → 5: 런 안의 체력 수치를 10배로(동료·떠난 동료·심연 부상·전투 기록·이어 붙은 런) */
function scaleHp(run: RunState, seen = new Set<RunState>()): void {
  if (!run || seen.has(run)) return;
  seen.add(run);
  const k = HP_SCALE;
  for (const r of [...(run.roster ?? []), ...(run.departed ?? [])]) {
    r.hp = Math.round(r.hp * k);
    r.maxHp = Math.round(r.maxHp * k);
  }
  if (run.abyss?.injuries) for (const id of Object.keys(run.abyss.injuries)) run.abyss.injuries[id] *= k;
  const st = run.stats;
  if (st) {
    st.damage = (st.damage ?? 0) * k;
    if (st.surgeHp !== undefined) st.surgeHp *= k;
    for (const b of st.log ?? []) for (const key of ['hpBefore', 'hpAfter', 'hpMax', 'haunBefore', 'haunAfter'] as const) if (typeof b[key] === 'number') b[key] = b[key] * k;
  }
  if (run.replayOf) scaleHp(run.replayOf, seen);
  for (const paused of Object.values(run.suspended ?? {})) scaleHp(paused, seen);
}

/** 자유 여정에서 멈춘 진행: 데이터가 바뀌어 맞지 않는 것만 버린다(클리어한 런 전체를 버리지 않는다) */
function keepValidSuspended(data: GameData, hub: RunState): void {
  if (!hub.suspended) return;
  for (const [stageId, paused] of Object.entries(hub.suspended)) {
    migrate(data, paused);
    if (paused.stageId !== stageId || paused.status !== 'map' || paused.replayOf || !isValidRun(data, paused)) delete hub.suspended[stageId];
  }
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
  // 순례(저장 3): 첫 순례 보상·도전 기록
  run.pilgrimRewarded ??= {};
  run.challenges ??= {};
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
  // 편성 점수 상한(저장 4): 넘는 주인이 있으면 지킬 수 있는 카드는 남기고 추천으로 다시 채운다. 갈래 보너스도 다시 센다
  if (loadoutProblems(data, run, run.loadout).some((p) => p.includes('상한'))) run.loadout = recommendLoadout(data, run, run.loadout);
  if (!run.loadoutFocus) {
    run.loadoutFocus = {};
    for (const owner of loadoutOwners(data, run)) {
      const f = owner === 'common' ? null : loadoutFocus(data, owner, run.loadout[owner] ?? []);
      if (f) run.loadoutFocus[owner] = f;
    }
  }
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
  if ((!run.selected.includes('haun') && !run.replayOf) || !run.selected.length || !run.selected.every((id) => rosterIds.has(id))) return false;
  if (!run.deck.every((c) => data.cards.has(c.cardId) && typeof c.uid === 'string')) return false;
  if (!run.usedModules.every((id) => data.modules.has(id))) return false;
  if (!run.relics.every((id) => data.relics.has(id))) return false;
  if (!run.potions.every((id) => id === null || data.potions.has(id))) return false;
  return Array.isArray(run.flags);
}

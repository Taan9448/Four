// 브라우저 저장소(localStorage). 사생활 보호 창·차단된 저장소에서는 예외가 나거나 비어 있을 수 있으므로
// 모든 읽기·쓰기를 감싸고, 실패하면 저장 없이 그대로 플레이한다.
import type { GameData } from '../engine/data';
import type { RunState } from '../engine/run';
import { deserializeRun, serializeRun, type LoadedRun } from '../engine/save';
import { noteRun, parseCodex, type Codex } from '../engine/codex';
import { parseAbyssMeta, type AbyssMeta } from '../engine/abyss';

/** 저장 칸 수(2026-10-08: 1칸 → 3칸). 칸마다 키가 따로이고, 옛 단일 저장(cheonoe.run)은 1번 칸으로 옮긴다 */
export const SLOT_COUNT = 3;
const LEGACY_RUN_KEY = 'cheonoe.run';
const slotKey = (slot: number) => `cheonoe.run.${slot}`;
const LAST_SLOT_KEY = 'cheonoe.lastSlot';
const SETTINGS_KEY = 'cheonoe.settings';

export function readStore(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStore(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* 저장할 수 없는 환경: 무시 */
  }
}

function migrateLegacy(): void {
  const legacy = readStore(LEGACY_RUN_KEY);
  if (legacy === null) return;
  if (readStore(slotKey(1)) === null) writeStore(slotKey(1), legacy);
  writeStore(LEGACY_RUN_KEY, null);
}

export function saveRun(slot: number, run: RunState): void {
  writeStore(slotKey(slot), serializeRun(run));
  writeStore(LAST_SLOT_KEY, String(slot));
}

export function loadRun(data: GameData, slot: number): LoadedRun | null {
  migrateLegacy();
  return deserializeRun(data, readStore(slotKey(slot)));
}

export const clearRun = (slot: number) => writeStore(slotKey(slot), null);

/** 칸 1~SLOT_COUNT의 저장(없으면 null) */
export function listSlots(data: GameData): { slot: number; saved: LoadedRun | null }[] {
  return Array.from({ length: SLOT_COUNT }, (_, i) => ({ slot: i + 1, saved: loadRun(data, i + 1) }));
}

/** 마지막으로 저장한 칸(이어하기 기본값). 그 칸이 비었으면 가장 최근에 저장된 칸 */
export function lastSlot(data: GameData): { slot: number; saved: LoadedRun } | null {
  const slots = listSlots(data).filter((x) => x.saved) as { slot: number; saved: LoadedRun }[];
  if (!slots.length) return null;
  const last = Number(readStore(LAST_SLOT_KEY));
  return slots.find((x) => x.slot === last) ?? slots.sort((a, b) => b.saved.savedAt - a.saved.savedAt)[0];
}

export const readSettings = () => readStore(SETTINGS_KEY);
export const writeSettings = (json: string) => writeStore(SETTINGS_KEY, json);

// ───────── 기록(저장 칸과 상관없이 브라우저에 하나): 캠페인을 마친 횟수 등 ─────────
const PROFILE_KEY = 'cheonoe.profile';

export interface Profile {
  /** 캠페인을 끝까지 마친 횟수(1 이상이면 난이도 고르기·심연이 열린다) */
  clears: number;
  /** 어려움·하드코어로 마친 횟수 */
  hardClears: number;
  hardcoreClears: number;
  /** 심연(GAME_DESIGN 16절): 시작한 횟수, 가장 깊이 넘은 굽이·가장 높은 점수 */
  abyssRuns: number;
  abyssBestDepth: number;
  abyssBestScore: number;
}

export function readProfile(): Profile {
  const num = (v: unknown) => Number(v) || 0;
  try {
    const raw = JSON.parse(readStore(PROFILE_KEY) ?? '{}') as Partial<Profile>;
    return {
      clears: num(raw.clears),
      hardClears: num(raw.hardClears),
      hardcoreClears: num(raw.hardcoreClears),
      abyssRuns: num(raw.abyssRuns),
      abyssBestDepth: num(raw.abyssBestDepth),
      abyssBestScore: num(raw.abyssBestScore),
    };
  } catch {
    return { clears: 0, hardClears: 0, hardcoreClears: 0, abyssRuns: 0, abyssBestDepth: 0, abyssBestScore: 0 };
  }
}

/** 심연 기록: 시작(started) 또는 끝(넘은 굽이·점수). 최고 기록이면 갈아 쓴다 */
export function recordAbyss(result: { started?: boolean; cleared?: number; score?: number }): Profile {
  const p = readProfile();
  if (result.started) p.abyssRuns += 1;
  if (result.cleared !== undefined) p.abyssBestDepth = Math.max(p.abyssBestDepth, result.cleared);
  if (result.score !== undefined) p.abyssBestScore = Math.max(p.abyssBestScore, result.score);
  writeStore(PROFILE_KEY, JSON.stringify(p));
  return p;
}

// ───────── 심연 기록(업적·서약·멈춘 굽이·일일, 3차): src/engine/abyss.ts의 AbyssMeta ─────────
const ABYSS_META_KEY = 'cheonoe.abyssMeta';
export const readAbyssMeta = (data: GameData): AbyssMeta => parseAbyssMeta(data, readStore(ABYSS_META_KEY));
export const writeAbyssMeta = (meta: AbyssMeta) => writeStore(ABYSS_META_KEY, JSON.stringify(meta));

// ───────── 심연 저장(캠페인 저장 칸과 따로 1칸) ─────────
const ABYSS_KEY = 'cheonoe.abyss';
export const saveAbyss = (run: RunState) => writeStore(ABYSS_KEY, serializeRun(run));
export const clearAbyss = () => writeStore(ABYSS_KEY, null);
export function loadAbyss(data: GameData): LoadedRun | null {
  const saved = deserializeRun(data, readStore(ABYSS_KEY));
  return saved?.run.mode === 'abyss' ? saved : null;
}

/** 심연 풀의 보유 몫: 캠페인 저장 칸들의 보유 카드(같은 카드는 가장 높은 강화) */
export function campaignCollection(data: GameData): Record<string, number> {
  const out: Record<string, number> = {};
  for (const { saved } of listSlots(data)) {
    const runs = saved ? [saved.run, saved.run.replayOf].filter((r): r is RunState => !!r) : [];
    for (const r of runs) for (const [id, lv] of Object.entries(r.collection ?? {})) out[id] = Math.max(out[id] ?? -1, lv);
  }
  return out;
}

/** 캠페인을 마쳤을 때 한 번 */
export function recordClear(run: Pick<RunState, 'difficulty' | 'hardcore'>): Profile {
  // (심연 기록은 recordAbyss)
  const p = readProfile();
  p.clears += 1;
  if (run.difficulty === 'hard') p.hardClears += 1;
  if (run.hardcore) p.hardcoreClears += 1;
  writeStore(PROFILE_KEY, JSON.stringify(p));
  return p;
}

// ───────── 도감(저장 칸과 상관없이 하나): src/engine/codex.ts ─────────
const CODEX_KEY = 'cheonoe.codex';

/** 도감을 읽는다. 아직 없으면(도감이 생기기 전 플레이) 저장 칸의 런으로 처음 채운다 */
export function readCodex(data: GameData): Codex {
  const text = readStore(CODEX_KEY);
  const codex = parseCodex(data, text);
  if (text === null) {
    for (const { saved } of listSlots(data)) if (saved) noteRun(codex, saved.run);
    writeStore(CODEX_KEY, JSON.stringify(codex));
  }
  return codex;
}

/** 읽고 → 고치고 → 쓴다 */
export function updateCodex(data: GameData, fn: (codex: Codex) => void): void {
  const codex = readCodex(data);
  fn(codex);
  writeStore(CODEX_KEY, JSON.stringify(codex));
}

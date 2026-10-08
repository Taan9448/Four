// 브라우저 저장소(localStorage). 사생활 보호 창·차단된 저장소에서는 예외가 나거나 비어 있을 수 있으므로
// 모든 읽기·쓰기를 감싸고, 실패하면 저장 없이 그대로 플레이한다.
import type { GameData } from '../engine/data';
import type { RunState } from '../engine/run';
import { deserializeRun, serializeRun, type LoadedRun } from '../engine/save';
import { noteRun, parseCodex, type Codex } from '../engine/codex';

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
  /** 캠페인을 끝까지 마친 횟수(1 이상이면 난이도 고르기가 열린다) */
  clears: number;
  /** 어려움·하드코어로 마친 횟수 */
  hardClears: number;
  hardcoreClears: number;
}

export function readProfile(): Profile {
  try {
    const raw = JSON.parse(readStore(PROFILE_KEY) ?? '{}') as Partial<Profile>;
    return { clears: Number(raw.clears) || 0, hardClears: Number(raw.hardClears) || 0, hardcoreClears: Number(raw.hardcoreClears) || 0 };
  } catch {
    return { clears: 0, hardClears: 0, hardcoreClears: 0 };
  }
}

/** 캠페인을 마쳤을 때 한 번 */
export function recordClear(run: Pick<RunState, 'difficulty' | 'hardcore'>): Profile {
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

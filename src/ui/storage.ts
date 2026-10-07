// 브라우저 저장소(localStorage). 사생활 보호 창·차단된 저장소에서는 예외가 나거나 비어 있을 수 있으므로
// 모든 읽기·쓰기를 감싸고, 실패하면 저장 없이 그대로 플레이한다.
import type { GameData } from '../engine/data';
import type { RunState } from '../engine/run';
import { deserializeRun, serializeRun, type LoadedRun } from '../engine/save';

const RUN_KEY = 'cheonoe.run';
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

export const saveRun = (run: RunState) => writeStore(RUN_KEY, serializeRun(run));
export const loadRun = (data: GameData): LoadedRun | null => deserializeRun(data, readStore(RUN_KEY));
export const clearRun = () => writeStore(RUN_KEY, null);

export const readSettings = () => readStore(SETTINGS_KEY);
export const writeSettings = (json: string) => writeStore(SETTINGS_KEY, json);

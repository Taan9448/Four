// 저장 백업·복원(2026-10-12 사용자 요청 B1): 이 브라우저의 cheonoe.* 키 전부를 JSON 한 파일로 내보내고 되돌린다.
// 가져오기 전에 지금 상태를 cheonoe.backup 한 벌로 남기고, 설정의 '직전 가져오기 되돌리기'가 그것을 되살린다.
// 저장소는 KV(읽기·쓰기·키 목록)로 받는다 — 테스트는 Map으로, 게임은 localStorage로.
import type { GameData } from '../engine/data';
import { deserializeRun, SAVE_VERSION } from '../engine/save';
import { codexProgress, parseCodex } from '../engine/codex';

export const BACKUP_KEY = 'cheonoe.backup';
const PREFIX = 'cheonoe.';

export interface KV {
  get(key: string): string | null;
  set(key: string, value: string | null): void;
  keys(): string[];
}

export interface BackupFile {
  /** 저장 형식 버전(engine/save.ts SAVE_VERSION). 이보다 높은 파일은 받지 않는다 */
  version: number;
  exportedAt: string;
  keys: Record<string, string>;
}

/** localStorage를 KV로(막힌 저장소면 빈 것처럼) */
export function browserKV(): KV {
  return {
    get: (k) => {
      try {
        return localStorage.getItem(k);
      } catch {
        return null;
      }
    },
    set: (k, v) => {
      try {
        if (v === null) localStorage.removeItem(k);
        else localStorage.setItem(k, v);
      } catch {
        /* 저장할 수 없는 환경 */
      }
    },
    keys: () => {
      try {
        return Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).filter((k): k is string => k !== null);
      } catch {
        return [];
      }
    },
  };
}

/** 지금 저장(cheonoe.* 키, 백업 한 벌은 빼고) */
function snapshot(kv: KV): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of kv.keys().filter((k) => k.startsWith(PREFIX) && k !== BACKUP_KEY).sort()) {
    const v = kv.get(k);
    if (v !== null) out[k] = v;
  }
  return out;
}

export function exportBackup(kv: KV, now = new Date()): BackupFile {
  return { version: SAVE_VERSION, exportedAt: now.toISOString(), keys: snapshot(kv) };
}

/** 내려받을 파일 이름: cheonoe-save-YYYYMMDD-HHMM.json(이 기기 시각) */
export function backupFileName(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `cheonoe-save-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}.json`;
}

export type ParsedBackup = { ok: true; file: BackupFile } | { ok: false; reason: string };

/** 파일 글을 읽는다. 손상·형식 틀림·더 새 버전은 이유와 함께 거부한다 */
export function parseBackup(text: string, allowEmpty = false): ParsedBackup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: '파일이 손상됐다(JSON으로 읽을 수 없다).' };
  }
  const f = raw as Partial<BackupFile> | null;
  if (!f || typeof f !== 'object' || typeof f.version !== 'number' || !f.keys || typeof f.keys !== 'object' || Array.isArray(f.keys))
    return { ok: false, reason: '천외귀환 저장 파일이 아니다(version·keys가 없다).' };
  if (f.version > SAVE_VERSION) return { ok: false, reason: `더 새 버전의 게임에서 만든 저장이다(파일 ${f.version} · 이 게임 ${SAVE_VERSION}). 게임을 새로 고친 뒤 다시 가져온다.` };
  const keys: Record<string, string> = {};
  for (const [k, v] of Object.entries(f.keys)) {
    if (!k.startsWith(PREFIX) || k === BACKUP_KEY) continue;
    if (typeof v !== 'string') return { ok: false, reason: `파일이 손상됐다(${k} 값이 글이 아니다).` };
    keys[k] = v;
  }
  if (!allowEmpty && !Object.keys(keys).length) return { ok: false, reason: '파일에 저장이 하나도 없다.' };
  return { ok: true, file: { version: f.version, exportedAt: String(f.exportedAt ?? ''), keys } };
}

export interface BackupPreview {
  slots: { slot: number; stage: string | null; scar: number; savedAt: number }[];
  codex: { seen: number; total: number };
  keys: number;
}

/** 가져오기 미리보기: 저장 칸 3개(스테이지·상흔·마지막 저장 시각)와 도감 채움. 옛 버전 런은 save.ts 이행을 거쳐 읽는다 */
export function previewBackup(data: GameData, file: BackupFile, slots = 3): BackupPreview {
  const out: BackupPreview['slots'] = [];
  for (let i = 1; i <= slots; i++) {
    const saved = deserializeRun(data, file.keys[`${PREFIX}run.${i}`]);
    const stage = saved ? (data.stages.find((s) => s.id === saved.run.stageId)?.name ?? saved.run.stageId) : null;
    out.push({ slot: i, stage, scar: saved?.run.scar ?? 0, savedAt: saved?.savedAt ?? 0 });
  }
  const progress = codexProgress(data, parseCodex(data, file.keys[`${PREFIX}codex`] ?? null));
  return {
    slots: out,
    codex: { seen: progress.reduce((a, p) => a + p.seen, 0), total: progress.reduce((a, p) => a + p.total, 0) },
    keys: Object.keys(file.keys).length,
  };
}

/** 가져오기: 지금 상태를 cheonoe.backup 한 벌로 남기고(한 벌만), cheonoe.* 키를 파일 것으로 모두 바꾼다 */
export function applyBackup(kv: KV, file: BackupFile, now = new Date()): void {
  kv.set(BACKUP_KEY, JSON.stringify(exportBackup(kv, now)));
  for (const k of Object.keys(snapshot(kv))) kv.set(k, null);
  for (const [k, v] of Object.entries(file.keys)) kv.set(k, v);
}

/** 되돌릴 한 벌이 있는가(설정의 '직전 가져오기 되돌리기') */
export const hasUndo = (kv: KV) => kv.get(BACKUP_KEY) !== null;

/** 직전 가져오기 되돌리기: 남겨 둔 한 벌로 cheonoe.* 키를 되살리고 그 한 벌은 지운다 */
export function undoImport(kv: KV): boolean {
  const text = kv.get(BACKUP_KEY);
  const parsed = text ? parseBackup(text, true) : null;
  if (!parsed?.ok) return false;
  for (const k of Object.keys(snapshot(kv))) kv.set(k, null);
  for (const [k, v] of Object.entries(parsed.file.keys)) kv.set(k, v);
  kv.set(BACKUP_KEY, null);
  return true;
}

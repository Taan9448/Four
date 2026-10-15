// 계정·클라우드 저장의 판단(2026-10-15, GAME_DESIGN '계정·클라우드 저장'): 무엇을 올리고 받을지, 묻을지.
// 서버는 CloudStore로 받는다 — 테스트는 메모리, 게임은 Supabase(cloud.ts). 저장소는 KV(backup.ts와 같다).
// 올리는 묶음 = 백업 파일과 같은 cheonoe.* 키에서 설정(기기마다)·되돌리기 한 벌을 뺀 것.
import { BACKUP_KEY, exportBackup, type BackupFile, type KV } from './backup';
import { SAVE_VERSION } from '../engine/save';

const PREFIX = 'cheonoe.';
/** 마지막으로 맞춘 계정 기록(이 기기). cheonoe. 접두어가 아니어서 백업·동기화 묶음에 들어가지 않는다 */
export const CLOUD_META_KEY = 'cheonoe-cloud';
/** 기기마다 다른 것: 올리지도 덮지도 않는다 */
export const LOCAL_ONLY: ReadonlySet<string> = new Set([`${PREFIX}settings`, BACKUP_KEY]);
/** 이것만 있으면 '기록이 없다'로 본다(안내를 본 기록·마지막 칸 번호) */
const TRIVIAL: ReadonlySet<string> = new Set([`${PREFIX}tours`, `${PREFIX}lastSlot`]);

export interface CloudMeta {
  /** 이 기기 기록을 마지막으로 맞춘 계정 */
  user: string;
  /** 그때 계정 행의 판(rev) */
  rev: number;
  /** 그때 이 기기 묶음의 지문 */
  hash: string;
  /** 그때 계정 행의 시각 */
  at: string;
}

export interface Remote {
  data: BackupFile;
  rev: number;
  updatedAt: string;
}

export type Written = { ok: true; rev: number; updatedAt: string } | { ok: false };

/** 계정 행 하나(로그인한 사람의 것만). 네트워크 오류는 던진다 */
export interface CloudStore {
  fetch(): Promise<Remote | null>;
  /** 행이 없을 때만 만든다(이미 있으면 ok: false) */
  insert(data: BackupFile, device: string): Promise<Written>;
  /** 행의 rev가 expect일 때만 바꾼다(다른 기기가 먼저 바꿨으면 ok: false) */
  update(data: BackupFile, expect: number, device: string): Promise<Written>;
}

/** 올릴 키(cheonoe.*에서 기기마다 다른 것을 뺀 것) */
export function cloudKeys(source: KV | Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  const entries: [string, string | null][] = isKV(source) ? source.keys().map((k) => [k, source.get(k)]) : Object.entries(source);
  for (const [k, v] of entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (v !== null && k.startsWith(PREFIX) && !LOCAL_ONLY.has(k)) out[k] = v;
  }
  return out;
}

function isKV(x: KV | Record<string, string>): x is KV {
  return typeof (x as KV).keys === 'function' && typeof (x as KV).get === 'function';
}

export function cloudSnapshot(kv: KV, now = new Date()): BackupFile {
  return { version: SAVE_VERSION, exportedAt: now.toISOString(), keys: cloudKeys(kv) };
}

/** 진행 기록이 있는가(런·도감·프로필·옷장·심연 등) */
export function hasProgress(keys: Record<string, string>): boolean {
  return Object.keys(keys).some((k) => !TRIVIAL.has(k));
}

/** 묶음의 지문(FNV-1a 32비트 두 벌 — 같은지 다른지만 본다) */
export function hashKeys(keys: Record<string, string>): string {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (const k of Object.keys(keys).sort()) {
    const s = `${k}\u0000${keys[k]}\u0001`;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      a = Math.imul(a ^ c, 0x01000193) >>> 0;
      b = Math.imul(b ^ c, 0x5bd1e995) >>> 0;
    }
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

export function readMeta(kv: KV): CloudMeta | null {
  try {
    const m = JSON.parse(kv.get(CLOUD_META_KEY) ?? 'null') as CloudMeta | null;
    return m && typeof m.user === 'string' && typeof m.rev === 'number' && typeof m.hash === 'string' ? m : null;
  } catch {
    return null;
  }
}

export function writeMeta(kv: KV, meta: CloudMeta | null): void {
  kv.set(CLOUD_META_KEY, meta ? JSON.stringify(meta) : null);
}

/**
 * 무엇을 할까. none: 할 일 없음 · adopt: 이미 같다(맞춘 기록만 적는다) · upload: 이 기기 것을 올린다 ·
 * download: 계정 것을 받는다 · ask: 둘 다 있고 다르다 — 사람에게 묻는다
 */
export type Plan = 'none' | 'adopt' | 'upload' | 'download' | 'ask';

export function plan(kv: KV, user: string, remote: Remote | null): Plan {
  const keys = cloudKeys(kv);
  const local = hashKeys(keys);
  const meta = readMeta(kv);
  if (!remote) {
    if (!hasProgress(keys)) return 'none';
    // 이 기록이 다른 계정의 것이었으면(그 계정에서 로그아웃한 뒤) 새 계정에 올릴지 묻는다
    return meta && meta.user !== user ? 'ask' : 'upload';
  }
  const remoteKeys = cloudKeys(remote.data.keys);
  if (hashKeys(remoteKeys) === local) return meta?.user === user && meta.rev === remote.rev ? 'none' : 'adopt';
  if (!hasProgress(keys)) return 'download';
  if (meta?.user === user) {
    const localChanged = meta.hash !== local;
    const remoteChanged = meta.rev !== remote.rev;
    if (!remoteChanged) return localChanged ? 'upload' : 'none';
    return localChanged ? 'ask' : 'download';
  }
  // 게스트 기록(또는 다른 계정의 기록)과 계정 기록이 다르다
  return hasProgress(remoteKeys) ? 'ask' : 'upload';
}

/**
 * 계정 기록을 이 기기에 받는다: 지금 기록은 되돌리기 한 벌(cheonoe.backup)로 남기고, 설정은 그대로 둔다
 */
export function applyRemote(kv: KV, user: string, remote: Remote, now = new Date()): void {
  kv.set(BACKUP_KEY, JSON.stringify(exportBackup(kv, now)));
  for (const k of Object.keys(cloudKeys(kv))) kv.set(k, null);
  for (const [k, v] of Object.entries(cloudKeys(remote.data.keys))) kv.set(k, v);
  writeMeta(kv, { user, rev: remote.rev, hash: hashKeys(cloudKeys(kv)), at: remote.updatedAt });
}

/** 이 기기 것으로 계정을 덮기 전에, 덮이는 계정 기록을 되돌리기 한 벌로 남긴다(설정은 지금 것) */
function keepRemoteAsUndo(kv: KV, remote: Remote): void {
  const keys = { ...cloudKeys(remote.data.keys) };
  const settings = kv.get(`${PREFIX}settings`);
  if (settings !== null) keys[`${PREFIX}settings`] = settings;
  kv.set(BACKUP_KEY, JSON.stringify({ version: remote.data.version, exportedAt: remote.updatedAt, keys } satisfies BackupFile));
}

export type SyncStatus = { state: 'idle' | 'syncing' | 'offline' | 'held' } | { state: 'synced'; at: string } | { state: 'error'; message: string };

export interface SyncHooks {
  /** 둘 다 있고 다를 때: 'local'(이 기기 것을 계정에) · 'remote'(계정 것을 이 기기에) · null(고르지 않고 닫음 — 「지금 동기화」 전까지 멈춘다) */
  ask(local: BackupFile, remote: Remote | null): Promise<'local' | 'remote' | null>;
  /** 계정 기록을 받은 뒤 게임을 다시 연다 */
  reload(): void;
  status?(s: SyncStatus): void;
}

/** 한 계정과 이 기기 기록을 맞춘다. 동시에 두 번 돌지 않는다 */
export class CloudSync {
  private chain: Promise<void> = Promise.resolve();
  /** 묻는 창을 고르지 않고 닫았다: 저절로 올리지 않는다(「지금 동기화」가 다시 묻는다) */
  private held = false;

  constructor(
    private kv: KV,
    private store: CloudStore,
    readonly user: string,
    private hooks: SyncHooks,
    private device = '',
  ) {}

  /** 계정을 읽고 맞춘다(시작할 때·「지금 동기화」) */
  sync(): Promise<void> {
    this.held = false;
    return this.queue(() => this.syncNow());
  }

  /** 이 기기에서 바뀐 것이 있으면 올린다(저장할 때 모아서·창을 숨길 때) */
  push(): Promise<void> {
    return this.queue(async () => {
      if (this.held) return;
      const meta = readMeta(this.kv);
      const keys = cloudKeys(this.kv);
      if (meta?.user !== this.user) return this.syncNow();
      if (meta.hash === hashKeys(keys)) return;
      this.hooks.status?.({ state: 'syncing' });
      const r = await this.store.update(this.snapshot(), meta.rev, this.device);
      if (r.ok) return this.done(r, keys);
      // 다른 기기가 먼저 올렸다 — 다시 읽고 판단한다(둘 다 바뀌었으면 묻는다)
      return this.syncNow();
    });
  }

  private queue(fn: () => Promise<void>): Promise<void> {
    const run = this.chain.then(fn).catch((e: unknown) => {
      this.hooks.status?.(isOffline(e) ? { state: 'offline' } : { state: 'error', message: e instanceof Error ? e.message : String(e) });
    });
    this.chain = run;
    return run;
  }

  private snapshot(): BackupFile {
    return cloudSnapshot(this.kv);
  }

  private done(r: { rev: number; updatedAt: string }, keys = cloudKeys(this.kv)): void {
    writeMeta(this.kv, { user: this.user, rev: r.rev, hash: hashKeys(keys), at: r.updatedAt });
    this.hooks.status?.({ state: 'synced', at: r.updatedAt });
  }

  private async syncNow(retry = 1): Promise<void> {
    this.hooks.status?.({ state: 'syncing' });
    const remote = await this.store.fetch();
    let p = plan(this.kv, this.user, remote);
    if (p === 'ask') {
      const choice = await this.hooks.ask(this.snapshot(), remote);
      if (!choice) {
        this.held = true;
        this.hooks.status?.({ state: 'held' });
        return;
      }
      p = choice === 'local' ? 'upload' : remote ? 'download' : 'none';
      if (choice === 'local' && remote) keepRemoteAsUndo(this.kv, remote);
      if (choice === 'remote' && !remote) {
        // 빈 계정으로 시작: 이 기기 기록은 되돌리기 한 벌로 남기고 비운다
        this.kv.set(BACKUP_KEY, JSON.stringify(exportBackup(this.kv)));
        for (const k of Object.keys(cloudKeys(this.kv))) this.kv.set(k, null);
        writeMeta(this.kv, null);
        this.hooks.status?.({ state: 'idle' });
        return this.hooks.reload();
      }
    }
    switch (p) {
      case 'none':
      case 'adopt':
        if (remote) this.done(remote);
        else this.hooks.status?.({ state: 'idle' });
        return;
      case 'download':
        applyRemote(this.kv, this.user, remote!);
        this.hooks.status?.({ state: 'synced', at: remote!.updatedAt });
        return this.hooks.reload();
      case 'upload': {
        const keys = cloudKeys(this.kv);
        const r = remote ? await this.store.update(this.snapshot(), remote.rev, this.device) : await this.store.insert(this.snapshot(), this.device);
        if (r.ok) return this.done(r, keys);
        // 그사이 다른 기기가 올렸다 — 한 번 더 읽고 판단
        if (retry > 0) return this.syncNow(retry - 1);
        throw new Error('계정 기록이 계속 바뀌어 올리지 못했다');
      }
    }
  }
}

/** 네트워크가 끊겼거나 서버에 닿지 못했다(브라우저 fetch는 TypeError) */
function isOffline(e: unknown): boolean {
  return e instanceof TypeError || (typeof navigator !== 'undefined' && navigator.onLine === false);
}

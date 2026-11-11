// 「결」 계정 저장의 판단(2026-11-11, gyeol/docs/GAME_DESIGN.md 7-6절): 무엇을 올리고 받을지, 묻을지.
// 「천외귀환」 src/ui/cloud-sync.ts와 같은 판단을 「결」 저장(gyeol.save 하나)에 맞춘 것이다 — 그쪽은 cheonoe.* 키 묶음을 다뤄서 그대로 쓸 수 없다.
// 서버는 GyeolStore로 받는다 — 테스트는 메모리, 게임은 Supabase(cloud.ts의 gyeol_saves 표). 설정(소리·판정 보정·품질)은 기기마다라 올리지 않는다.
import { emptySave, KEY as SAVE_KEY, normalize, type SaveData } from './save';

/** 마지막으로 맞춘 계정 기록(이 기기) */
export const META_KEY = 'gyeol-cloud';
/** 계정 기록을 받거나 덮기 전의 기록 한 벌(되돌리기용) */
export const BACKUP_KEY = 'gyeol.backup';

/** 올리는 묶음: 저장에서 설정을 뺀 것 */
export type CloudData = Omit<SaveData, 'settings'>;

export interface KV {
  get(k: string): string | null;
  set(k: string, v: string | null): void;
}

export interface CloudMeta {
  user: string;
  rev: number;
  hash: string;
  at: string;
}

export interface Remote {
  data: CloudData;
  rev: number;
  updatedAt: string;
  device?: string | null;
}

export type Written = { ok: true; rev: number; updatedAt: string } | { ok: false };

/** 계정 행 하나(로그인한 사람의 것만). 네트워크 오류는 던진다 */
export interface GyeolStore {
  fetch(): Promise<Remote | null>;
  insert(data: CloudData, device: string): Promise<Written>;
  update(data: CloudData, expect: number, device: string): Promise<Written>;
}

export function readLocal(kv: KV): SaveData {
  try {
    const raw = kv.get(SAVE_KEY);
    return raw ? normalize(JSON.parse(raw)) : emptySave();
  } catch {
    return emptySave();
  }
}

export function cloudData(save: SaveData): CloudData {
  const { settings: _settings, ...rest } = normalize(save);
  return rest;
}

/** 진행 기록이 있는가(대결·장·박자 도전·업적). 본 안내만 있으면 '없음' */
export function hasProgress(d: CloudData): boolean {
  return d.stats.duels > 0 || d.story.cleared.length > 0 || Object.keys(d.rhythmBest).length > 0 || d.achievements.length > 0;
}

/** 키 순서와 상관없이 같은 글 */
function stable(x: unknown): string {
  if (Array.isArray(x)) return `[${x.map(stable).join(',')}]`;
  if (x && typeof x === 'object')
    return `{${Object.keys(x)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable((x as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  return JSON.stringify(x);
}

/** 묶음의 지문(FNV-1a 32비트 두 벌 — 같은지 다른지만 본다) */
export function hashData(d: CloudData): string {
  const s = stable(cloudData({ ...emptySave(), ...d } as SaveData));
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x5bd1e995) >>> 0;
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

export function readMeta(kv: KV): CloudMeta | null {
  try {
    const m = JSON.parse(kv.get(META_KEY) ?? 'null') as CloudMeta | null;
    return m && typeof m.user === 'string' && typeof m.rev === 'number' && typeof m.hash === 'string' ? m : null;
  } catch {
    return null;
  }
}

export function writeMeta(kv: KV, meta: CloudMeta | null): void {
  kv.set(META_KEY, meta ? JSON.stringify(meta) : null);
}

/** none: 할 일 없음 · adopt: 이미 같다 · upload: 이 기기 것을 올린다 · download: 계정 것을 받는다 · ask: 둘 다 있고 다르다 */
export type Plan = 'none' | 'adopt' | 'upload' | 'download' | 'ask';

export function plan(kv: KV, user: string, remote: Remote | null): Plan {
  const local = cloudData(readLocal(kv));
  const hash = hashData(local);
  const meta = readMeta(kv);
  if (!remote) {
    if (!hasProgress(local)) return 'none';
    return meta && meta.user !== user ? 'ask' : 'upload';
  }
  const remoteData = cloudData({ ...emptySave(), ...remote.data } as SaveData);
  if (hashData(remoteData) === hash) return meta?.user === user && meta.rev === remote.rev ? 'none' : 'adopt';
  if (!hasProgress(local)) return 'download';
  if (meta?.user === user) {
    const localChanged = meta.hash !== hash;
    const remoteChanged = meta.rev !== remote.rev;
    if (!remoteChanged) return localChanged ? 'upload' : 'none';
    return localChanged ? 'ask' : 'download';
  }
  return hasProgress(remoteData) ? 'ask' : 'upload';
}

/** 지금 기록을 되돌리기 한 벌로 남긴다 */
function keepBackup(kv: KV, save: SaveData): void {
  kv.set(BACKUP_KEY, JSON.stringify(save));
}

/** 계정 기록을 이 기기에: 지금 기록은 되돌리기 한 벌로, 설정은 이 기기 것 그대로 */
export function applyRemote(kv: KV, user: string, remote: Remote): void {
  const local = readLocal(kv);
  keepBackup(kv, local);
  const next = normalize({ ...remote.data, settings: local.settings });
  kv.set(SAVE_KEY, JSON.stringify(next));
  writeMeta(kv, { user, rev: remote.rev, hash: hashData(cloudData(next)), at: remote.updatedAt });
}

export type SyncStatus = { state: 'idle' | 'syncing' | 'offline' | 'held' } | { state: 'synced'; at: string } | { state: 'error'; message: string };

export interface SyncHooks {
  /** 둘 다 있고 다를 때: 'local'(이 기기 것을 계정에) · 'remote'(계정 것을 이 기기에) · null(고르지 않고 닫음 — 「지금 동기화」 전까지 멈춘다) */
  ask(local: CloudData, remote: Remote | null): Promise<'local' | 'remote' | null>;
  /** 계정 기록을 받은 뒤 게임을 다시 연다 */
  reload(): void;
  status?(s: SyncStatus): void;
}

/** 한 계정과 이 기기 기록을 맞춘다. 동시에 두 번 돌지 않는다 */
export class GyeolSync {
  private chain: Promise<void> = Promise.resolve();
  private held = false;

  constructor(
    private kv: KV,
    private store: GyeolStore,
    readonly user: string,
    private hooks: SyncHooks,
    private device = '',
  ) {}

  sync(): Promise<void> {
    this.held = false;
    return this.queue(() => this.syncNow());
  }

  /** 이 기기에서 바뀐 것이 있으면 올린다 */
  push(): Promise<void> {
    return this.queue(async () => {
      if (this.held) return;
      const meta = readMeta(this.kv);
      const data = this.local();
      if (meta?.user !== this.user) return this.syncNow();
      if (meta.hash === hashData(data)) return;
      this.hooks.status?.({ state: 'syncing' });
      const r = await this.store.update(data, meta.rev, this.device);
      if (r.ok) return this.done(r, data);
      return this.syncNow();
    });
  }

  private local(): CloudData {
    return cloudData(readLocal(this.kv));
  }

  private queue(fn: () => Promise<void>): Promise<void> {
    const run = this.chain.then(fn).catch((e: unknown) => {
      this.hooks.status?.(isOffline(e) ? { state: 'offline' } : { state: 'error', message: e instanceof Error ? e.message : String(e) });
    });
    this.chain = run;
    return run;
  }

  private done(r: { rev: number; updatedAt: string }, data = this.local()): void {
    writeMeta(this.kv, { user: this.user, rev: r.rev, hash: hashData(data), at: r.updatedAt });
    this.hooks.status?.({ state: 'synced', at: r.updatedAt });
  }

  private async syncNow(retry = 1): Promise<void> {
    this.hooks.status?.({ state: 'syncing' });
    const remote = await this.store.fetch();
    let p = plan(this.kv, this.user, remote);
    if (p === 'ask') {
      const choice = await this.hooks.ask(this.local(), remote);
      if (!choice) {
        this.held = true;
        this.hooks.status?.({ state: 'held' });
        return;
      }
      if (choice === 'local') {
        p = 'upload';
        // 덮이는 계정 기록을 되돌리기 한 벌로
        if (remote) keepBackup(this.kv, normalize({ ...remote.data, settings: readLocal(this.kv).settings }));
      } else if (remote) p = 'download';
      else {
        // 빈 계정으로 처음부터: 이 기기 기록은 되돌리기 한 벌로 남기고 진행만 비운다(설정은 그대로)
        const local = readLocal(this.kv);
        keepBackup(this.kv, local);
        this.kv.set(SAVE_KEY, JSON.stringify({ ...emptySave(), settings: local.settings }));
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
        const data = this.local();
        const r = remote ? await this.store.update(data, remote.rev, this.device) : await this.store.insert(data, this.device);
        if (r.ok) return this.done(r, data);
        if (retry > 0) return this.syncNow(retry - 1);
        throw new Error('계정 기록이 계속 바뀌어 올리지 못했다');
      }
    }
  }
}

function isOffline(e: unknown): boolean {
  return e instanceof TypeError || (typeof navigator !== 'undefined' && navigator.onLine === false);
}

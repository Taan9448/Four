// 「틈」 계정 저장(2026-11-22 사용자 "로그인 기능 추가 — 천외귀환·결 연동"): 「천외귀환」·「결」과 같은 Supabase 프로젝트·같은 계정(아이디 그대로).
// 로그인 상태는 「천외귀환」과 같은 키(cheonoe-auth) — 같은 주소에서 한쪽에 로그인하면 「틈」도 로그인돼 있다(로그아웃도 함께).
// 「틈」 기록(teum.save에서 옵션을 뺀 것)은 새 표 teum_saves에 올린다. 표 만들기 SQL은 docs/CLOUD_SAVE.md 6절. 수련 경험치는 「천외귀환」 saves 행에 더한다(gyeol/src/training).
// 맞추기: 계정이 비었으면 올리고, 이 기기가 비었으면 받고, 둘 다 있고 다르면 고른다(이 기기 · 계정). 저장이 바뀌면 4초 모아 올린다.
// supabase-js는 쓸 때만 받는다(로그인해 둔 적이 없고 로그인 단추도 누르지 않은 사람은 받지 않는다).
import type { SupabaseClient } from '@supabase/supabase-js';
import { CLOUD } from '../../src/ui/cloud-config';
import { checkId, checkPassword, displayName, idToEmail, loginError, normalizeId } from '../../src/ui/cloud-id';
import { forgetAccountTraining, loadAccountTraining, type CheonoeRow } from '../../gyeol/src/training';
import type { BackupFile } from '../../src/ui/backup';

const AUTH_KEY = 'cheonoe-auth';
const TABLE = 'teum_saves';
const SAVE_KEY = 'teum.save';
const META_KEY = 'teum-cloud';
const BACKUP_KEY = 'teum.backup';
const PUSH_DELAY = 4000;

export interface CloudUser {
  id: string;
  name: string;
}
export type SyncStatus = { state: 'idle' | 'syncing' | 'offline' | 'held' } | { state: 'synced'; at: string } | { state: 'error'; message: string };
/** 올리는 묶음: teum.save에서 옵션(기기마다 — 소리·키·흔들림)을 뺀 것 */
export type CloudData = Record<string, unknown>;
export interface Remote {
  data: CloudData;
  rev: number;
  updatedAt: string;
  device?: string | null;
}
interface Meta {
  user: string;
  rev: number;
  hash: string;
  at: string;
}

let clientP: Promise<SupabaseClient> | null = null;
let user: CloudUser | null = null;
let row: CheonoeRow | null = null;
let status: SyncStatus = { state: 'idle' };
let held = false;
let ask: (local: CloudData, remote: Remote) => Promise<'local' | 'remote' | null> = async () => null;
const listeners = new Set<() => void>();

export const cloudEnabled = (): boolean => Boolean(CLOUD.url && CLOUD.key);
const kvGet = (k: string): string | null => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const kvSet = (k: string, v: string | null): void => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* 저장할 수 없는 창 */
  }
};
export const hasStoredSession = (): boolean => kvGet(AUTH_KEY) !== null;

function client(): Promise<SupabaseClient> {
  clientP ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(CLOUD.url, CLOUD.key, { auth: { flowType: 'pkce', detectSessionInUrl: false, persistSession: true, autoRefreshToken: true, storageKey: AUTH_KEY } }),
  );
  return clientP;
}
function notify(): void {
  for (const fn of listeners) fn();
}
function setStatus(s: SyncStatus): void {
  status = s;
  notify();
}
export function onCloudChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export const cloudState = (): { user: CloudUser | null; status: SyncStatus } => ({ user, status });

// ── 기록 묶음 ──
function readLocal(): Record<string, unknown> {
  try {
    return JSON.parse(kvGet(SAVE_KEY) ?? 'null') ?? {};
  } catch {
    return {};
  }
}
export function cloudData(save: Record<string, unknown>): CloudData {
  const { options: _o, ...rest } = save;
  return rest;
}
/** 진행 기록이 있는가(칸 · 넘은 장 · 연 비급 · 금화 · 무한 기록) */
export function hasProgress(d: CloudData): boolean {
  const slots = (d.slots as unknown[] | undefined) ?? [];
  return slots.some(Boolean) || Number(d.maxCleared ?? 0) > 0 || ((d.unlocked as unknown[] | undefined)?.length ?? 0) > 0 || Number(d.wallet ?? 0) > 0 || Object.keys((d.endlessBest as object | undefined) ?? {}).length > 0;
}
function stable(x: unknown): string {
  if (Array.isArray(x)) return `[${x.map(stable).join(',')}]`;
  if (x && typeof x === 'object')
    return `{${Object.keys(x)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable((x as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  return JSON.stringify(x);
}
export function hashData(d: CloudData): string {
  const s = stable(d);
  let a = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) a = Math.imul(a ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return `${a.toString(16)}-${s.length}`;
}
const readMeta = (): Meta | null => {
  try {
    return JSON.parse(kvGet(META_KEY) ?? 'null');
  } catch {
    return null;
  }
};
const writeMeta = (m: Meta | null) => kvSet(META_KEY, m ? JSON.stringify(m) : null);

export type Plan = 'none' | 'upload' | 'download' | 'ask';
/** 무엇을 할지(순수 — 테스트) */
export function plan(local: CloudData, meta: Meta | null, uid: string, remote: Remote | null): Plan {
  const hash = hashData(local);
  if (!remote) return hasProgress(local) ? (meta && meta.user !== uid ? 'ask' : 'upload') : 'none';
  if (hashData(remote.data) === hash) return 'none';
  if (!hasProgress(local)) return 'download';
  if (meta?.user === uid) {
    const localChanged = meta.hash !== hash;
    const remoteChanged = meta.rev !== remote.rev;
    if (!remoteChanged) return localChanged ? 'upload' : 'none';
    return localChanged ? 'ask' : 'download';
  }
  return hasProgress(remote.data) ? 'ask' : 'upload';
}

// ── 서버 ──
function tableError(message: string, code?: string): Error {
  if (code === '42P01' || code === 'PGRST205' || /teum_saves/.test(message)) return new Error('계정 표(teum_saves)가 아직 없다 — 운영자가 Supabase에서 SQL을 한 번 실행한다');
  return new Error(message);
}
const deviceName = (): string => `${/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? '휴대폰' : 'PC'} · 틈`;

async function fetchRemote(c: SupabaseClient, uid: string): Promise<Remote | null> {
  const { data, error } = await c.from(TABLE).select('data, rev, updated_at, device').eq('user_id', uid).maybeSingle();
  if (error) throw tableError(error.message, error.code);
  return data ? { data: data.data as CloudData, rev: data.rev as number, updatedAt: data.updated_at as string, device: data.device as string | null } : null;
}
async function upload(c: SupabaseClient, uid: string, d: CloudData, remote: Remote | null): Promise<boolean> {
  const at = new Date().toISOString();
  const q = remote
    ? c.from(TABLE).update({ data: d, rev: remote.rev + 1, updated_at: at, device: deviceName() }).eq('user_id', uid).eq('rev', remote.rev).select('rev, updated_at')
    : c.from(TABLE).insert({ user_id: uid, data: d, rev: 1, updated_at: at, device: deviceName() }).select('rev, updated_at');
  const { data, error } = await q;
  if (error?.code === '23505') return false;
  if (error) throw tableError(error.message, error.code);
  if (!data?.length) return false;
  writeMeta({ user: uid, rev: data[0].rev as number, hash: hashData(d), at: data[0].updated_at as string });
  setStatus({ state: 'synced', at: data[0].updated_at as string });
  return true;
}
function applyRemote(uid: string, remote: Remote): void {
  const local = readLocal();
  kvSet(BACKUP_KEY, JSON.stringify(local));
  kvSet(SAVE_KEY, JSON.stringify({ ...remote.data, options: local.options ?? (remote.data as Record<string, unknown>).options }));
  writeMeta({ user: uid, rev: remote.rev, hash: hashData(remote.data), at: remote.updatedAt });
}

let chain: Promise<void> = Promise.resolve();
function queue(fn: () => Promise<void>): Promise<void> {
  const run = chain.then(fn).catch((e: unknown) => {
    const offline = e instanceof TypeError || navigator.onLine === false;
    setStatus(offline ? { state: 'offline' } : { state: 'error', message: e instanceof Error ? e.message : String(e) });
  });
  chain = run;
  return run;
}

/** 계정과 이 기기를 맞춘다 */
export function syncNow(): Promise<void> {
  held = false;
  return queue(async () => {
    if (!user) return;
    const c = await client();
    setStatus({ state: 'syncing' });
    const remote = await fetchRemote(c, user.id);
    const local = cloudData(readLocal());
    let p = plan(local, readMeta(), user.id, remote);
    if (p === 'ask' && remote) {
      const pick = await ask(local, remote);
      if (!pick) {
        held = true;
        return setStatus({ state: 'held' });
      }
      p = pick === 'local' ? 'upload' : 'download';
      if (p === 'upload') kvSet(BACKUP_KEY, JSON.stringify(remote.data));
    } else if (p === 'ask') p = 'upload';
    if (p === 'none') {
      if (remote) {
        writeMeta({ user: user.id, rev: remote.rev, hash: hashData(remote.data), at: remote.updatedAt });
        setStatus({ state: 'synced', at: remote.updatedAt });
      } else setStatus({ state: 'idle' });
      return;
    }
    if (p === 'download' && remote) {
      applyRemote(user.id, remote);
      setStatus({ state: 'synced', at: remote.updatedAt });
      location.reload();
      return;
    }
    if (!(await upload(c, user.id, local, remote))) throw new Error('계정 기록이 그새 바뀌었다 — 「지금 맞추기」를 다시');
  });
}
/** 이 기기에서 바뀐 것을 올린다(모아서) */
let pushTimer: ReturnType<typeof setTimeout> | null = null;
export function schedulePush(): void {
  if (!user || held) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    void queue(async () => {
      if (!user || held) return;
      const local = cloudData(readLocal());
      const meta = readMeta();
      if (meta?.user === user.id && meta.hash === hashData(local)) return;
      const c = await client();
      const remote = await fetchRemote(c, user.id);
      if (remote && meta?.user === user.id && meta.rev !== remote.rev) {
        // 다른 기기가 먼저 올렸다 — 맞추기로
        chain = Promise.resolve();
        return void syncNow();
      }
      setStatus({ state: 'syncing' });
      await upload(c, user.id, local, remote);
    });
  }, PUSH_DELAY);
}

// ── 「천외귀환」 계정 행(수련 경험치) ──
function cheonoeRow(c: SupabaseClient, uid: string): CheonoeRow {
  return {
    async fetch() {
      const { data, error } = await c.from('saves').select('data, rev').eq('user_id', uid).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? { data: data.data as BackupFile, rev: data.rev as number } : null;
    },
    async update(file, expect) {
      const { data, error } = await c.from('saves').update({ data: file, rev: expect + 1, updated_at: new Date().toISOString(), device: deviceName() }).eq('user_id', uid).eq('rev', expect).select('rev, updated_at');
      if (error) throw new Error(error.message);
      return data?.length ? { rev: data[0].rev as number, updatedAt: data[0].updated_at as string } : null;
    },
  };
}
/** 수련 경험치를 더할 곳 */
export const trainingTarget = (): { row: CheonoeRow | null; user: string | null } => ({ row: user ? row : null, user: user?.id ?? null });

async function attach(c: SupabaseClient): Promise<void> {
  const { data } = await c.auth.getSession();
  const u = data.session?.user;
  if (!u) {
    user = null;
    row = null;
    return notify();
  }
  user = { id: u.id, name: displayName(u.email, u.user_metadata) };
  row = cheonoeRow(c, u.id);
  void loadAccountTraining(row).catch(() => undefined);
  notify();
  await syncNow();
}
let listening = false;
function listenAuth(c: SupabaseClient): void {
  if (listening) return;
  listening = true;
  c.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      user = null;
      row = null;
      forgetAccountTraining();
      notify();
    }
  });
  document.addEventListener('visibilitychange', () => document.hidden && schedulePush());
}

/** 시작할 때: 로그인해 둔 적이 있으면 계정과 맞춘다 */
export async function bootCloud(askWhich: typeof ask): Promise<void> {
  ask = askWhich;
  if (!cloudEnabled() || !hasStoredSession()) return;
  try {
    const c = await client();
    listenAuth(c);
    await attach(c);
  } catch {
    setStatus({ state: 'offline' });
  }
}

export type IdResult = { ok: true } | { ok: false; message: string };
/** 아이디·비밀번호 로그인(signup이면 가입하고 바로 로그인) — 「천외귀환」·「결」과 같은 계정 */
export async function signInWithId(id: string, password: string, mode: 'login' | 'signup', again?: string): Promise<IdResult> {
  if (!cloudEnabled()) return { ok: false, message: '이 배포에는 계정 저장이 꺼져 있다 — 게스트로' };
  const bad = checkId(id) ?? checkPassword(password, mode === 'signup' ? again : undefined);
  if (bad) return { ok: false, message: bad };
  try {
    const c = await client();
    listenAuth(c);
    const email = idToEmail(id);
    const { data, error } = mode === 'signup' ? await c.auth.signUp({ email, password, options: { data: { username: normalizeId(id) } } }) : await c.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, message: loginError(error.message, mode) };
    if (!data.session) return { ok: false, message: loginError('email not confirmed', mode) };
    await attach(c);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: loginError(e instanceof Error ? e.message : String(e), mode) };
  }
}
/** 로그아웃: 바뀐 것을 먼저 올리고 이 기기 기록은 그대로(게스트로 계속). 「천외귀환」·「결」도 함께 로그아웃된다 */
export async function signOut(): Promise<void> {
  if (pushTimer) clearTimeout(pushTimer);
  const c = await client();
  await c.auth.signOut();
  user = null;
  row = null;
  forgetAccountTraining();
  setStatus({ state: 'idle' });
}

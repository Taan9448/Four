// 「결」 계정 저장(2026-11-11, gyeol/docs/GAME_DESIGN.md 7-6절): 「천외귀환」과 같은 Supabase 프로젝트·같은 계정.
// 로그인 상태는 「천외귀환」과 같은 키(cheonoe-auth)에 두어 한쪽에서 로그인하면 다른 쪽도 로그인돼 있다(같은 주소 아래 두 게임).
// 「결」 기록은 새 표 gyeol_saves에 올린다 — 「천외귀환」 saves 행은 건드리지 않는다. 표 만들기 SQL은 docs/CLOUD_SAVE.md 5절.
// supabase-js는 쓸 때만 받는다(로그인해 둔 적이 없고 로그인 단추도 누르지 않은 사람은 받지 않는다).
import type { SupabaseClient } from '@supabase/supabase-js';
import { CLOUD } from '../../src/ui/cloud-config';
import { checkId, checkPassword, displayName, idToEmail, loginError, normalizeId } from '../../src/ui/cloud-id';
import { GyeolSync, readMeta, type CloudData, type GyeolStore, type KV, type Remote, type SyncStatus, type Written } from './cloud-sync';
import { onSaveWrite } from './save';
import { forgetAccountTraining, loadAccountTraining, type CheonoeRow } from './training';
import type { BackupFile } from '../../src/ui/backup';

/** 「천외귀환」 src/ui/cloud.ts와 같은 키 — 로그인을 함께 쓴다 */
const AUTH_KEY = 'cheonoe-auth';
const TABLE = 'gyeol_saves';
const PUSH_DELAY = 4000;

export interface CloudUser {
  id: string;
  name: string;
}

let clientP: Promise<SupabaseClient> | null = null;
let user: CloudUser | null = null;
let sync: GyeolSync | null = null;
let status: SyncStatus = { state: 'idle' };
let ask: (local: CloudData, remote: Remote | null) => Promise<'local' | 'remote' | null> = async () => null;
const listeners = new Set<() => void>();

export const cloudEnabled = (): boolean => Boolean(CLOUD.url && CLOUD.key);

function client(): Promise<SupabaseClient> {
  clientP ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(CLOUD.url, CLOUD.key, { auth: { flowType: 'pkce', detectSessionInUrl: false, persistSession: true, autoRefreshToken: true, storageKey: AUTH_KEY } }),
  );
  return clientP;
}

/** 브라우저 저장소(막힌 창이면 아무것도 남지 않는다) */
export function browserKV(): KV {
  return {
    get(k) {
      try {
        return localStorage.getItem(k);
      } catch {
        return null;
      }
    },
    set(k, v) {
      try {
        if (v === null) localStorage.removeItem(k);
        else localStorage.setItem(k, v);
      } catch {
        /* 저장할 수 없는 창 */
      }
    },
  };
}

/** 로그인해 둔 적이 있는가(시작 화면이 로그인 판을 건너뛴다 — 확인은 bootCloud가 이어서 한다) */
export function hasStoredSession(): boolean {
  return browserKV().get(AUTH_KEY) !== null;
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

export function cloudState(): { user: CloudUser | null; status: SyncStatus; lastSync: string | null } {
  const meta = readMeta(browserKV());
  return { user, status, lastSync: meta && user && meta.user === user.id ? meta.at : null };
}

/** 표가 아직 없다(운영자가 SQL을 실행하지 않았다) */
function tableError(message: string, code?: string): Error {
  if (code === '42P01' || code === 'PGRST205' || /gyeol_saves/.test(message)) return new Error('계정 표(gyeol_saves)가 아직 없다 — 운영자가 Supabase에서 SQL을 한 번 실행한다');
  return new Error(message);
}

/** 계정 행 하나(gyeol_saves: user_id · data · rev · updated_at · device). 행 보안으로 자기 행만 보인다 */
function supaStore(c: SupabaseClient, userId: string): GyeolStore {
  const written = (rows: { rev: number; updated_at: string }[] | null): Written => (rows?.length ? { ok: true, rev: rows[0].rev, updatedAt: rows[0].updated_at } : { ok: false });
  return {
    async fetch() {
      const { data, error } = await c.from(TABLE).select('data, rev, updated_at, device').eq('user_id', userId).maybeSingle();
      if (error) throw tableError(error.message, error.code);
      return data ? { data: data.data as CloudData, rev: data.rev as number, updatedAt: data.updated_at as string, device: data.device as string | null } : null;
    },
    async insert(file, device) {
      const { data, error } = await c.from(TABLE).insert({ user_id: userId, data: file, rev: 1, updated_at: new Date().toISOString(), device }).select('rev, updated_at');
      if (error?.code === '23505') return { ok: false };
      if (error) throw tableError(error.message, error.code);
      return written(data);
    },
    async update(file, expect, device) {
      const { data, error } = await c.from(TABLE).update({ data: file, rev: expect + 1, updated_at: new Date().toISOString(), device }).eq('user_id', userId).eq('rev', expect).select('rev, updated_at');
      if (error) throw tableError(error.message, error.code);
      return written(data);
    },
  };
}

/** 「천외귀환」 계정 행(saves) — 수련 경험치를 함께 쓰려고 읽고 고친다(rev가 같을 때만, training.ts) */
function cheonoeRow(c: SupabaseClient, userId: string): CheonoeRow {
  return {
    async fetch() {
      const { data, error } = await c.from('saves').select('data, rev').eq('user_id', userId).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? { data: data.data as BackupFile, rev: data.rev as number } : null;
    },
    async update(file, expect) {
      const { data, error } = await c.from('saves').update({ data: file, rev: expect + 1, updated_at: new Date().toISOString(), device: `${deviceName()} · 결` }).eq('user_id', userId).eq('rev', expect).select('rev, updated_at');
      if (error) throw new Error(error.message);
      return data?.length ? { rev: data[0].rev as number, updatedAt: data[0].updated_at as string } : null;
    },
  };
}

let row: CheonoeRow | null = null;

/** 수련 경험치를 더할 곳(로그인했으면 계정 행과 계정 id) */
export function trainingTarget(): { row: CheonoeRow | null; user: string | null } {
  return { row: user ? row : null, user: user?.id ?? null };
}

const deviceName = (): string => (/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? '휴대폰' : 'PC');

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let hooked = false;
/** 저장이 바뀌면 모아서 올리고, 창을 숨길 때 한 번 더 */
function hookWrites(): void {
  if (hooked) return;
  hooked = true;
  onSaveWrite(() => {
    if (!sync) return;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => void sync?.push(), PUSH_DELAY);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && sync) void sync.push();
  });
  addEventListener('online', () => void sync?.push());
}

let listening = false;
function listenAuth(c: SupabaseClient): void {
  if (listening) return;
  listening = true;
  c.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      user = null;
      sync = null;
      row = null;
      forgetAccountTraining();
      notify();
    }
  });
}

async function attach(c: SupabaseClient): Promise<void> {
  const { data } = await c.auth.getSession();
  const u = data.session?.user;
  if (!u) {
    user = null;
    sync = null;
    return notify();
  }
  user = { id: u.id, name: displayName(u.email, u.user_metadata) };
  row = cheonoeRow(c, u.id);
  void loadAccountTraining(row).catch(() => undefined);
  sync = new GyeolSync(browserKV(), supaStore(c, u.id), u.id, { ask: (l, r) => ask(l, r), reload: () => location.reload(), status: setStatus }, deviceName());
  hookWrites();
  notify();
  await sync.sync();
}

/** 시작할 때 한 번: 로그인해 둔 적이 있으면 계정과 맞춘다. askWhich: 둘 다 기록이 있고 다를 때 고르는 창 */
export async function bootCloud(askWhich: typeof ask): Promise<void> {
  if (!cloudEnabled()) return;
  ask = askWhich;
  if (!hasStoredSession()) return;
  try {
    const c = await client();
    listenAuth(c);
    await attach(c);
  } catch {
    setStatus({ state: 'offline' });
  }
}

export type IdResult = { ok: true } | { ok: false; message: string };

/** 아이디·비밀번호 로그인(signup이면 가입하고 바로 로그인). 「천외귀환」과 같은 규칙·같은 계정 */
export async function signInWithId(id: string, password: string, mode: 'login' | 'signup', again?: string): Promise<IdResult> {
  const bad = checkId(id) ?? checkPassword(password, mode === 'signup' ? again : undefined);
  if (bad) return { ok: false, message: bad };
  try {
    const c = await client();
    listenAuth(c);
    const email = idToEmail(id);
    const { data, error } =
      mode === 'signup' ? await c.auth.signUp({ email, password, options: { data: { username: normalizeId(id) } } }) : await c.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, message: loginError(error.message, mode) };
    if (!data.session) return { ok: false, message: loginError('email not confirmed', mode) };
    await attach(c);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: loginError(e instanceof Error ? e.message : String(e), mode) };
  }
}

/** 로그아웃: 바뀐 것을 먼저 올리고, 이 브라우저의 기록은 그대로 둔다(게스트로 계속). 「천외귀환」도 함께 로그아웃된다 */
export async function signOut(): Promise<void> {
  if (pushTimer) clearTimeout(pushTimer);
  await sync?.push();
  const c = await client();
  await c.auth.signOut();
  user = null;
  sync = null;
  row = null;
  forgetAccountTraining();
  setStatus({ state: 'idle' });
}

/** 「지금 동기화」: 계정을 다시 읽고 맞춘다(고르지 않고 닫았던 창도 다시 묻는다) */
export async function syncNow(): Promise<void> {
  await sync?.sync();
}

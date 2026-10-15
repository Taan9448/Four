// 계정·클라우드 저장(2026-10-15, GAME_DESIGN '계정·클라우드 저장'): Supabase 로그인과 계정 저장 행.
// supabase-js는 쓸 때만 받는다 — 로그인해 둔 적이 없고 로그인 단추도 누르지 않은 사람은 받지 않는다.
// 맞추는 판단은 cloud-sync.ts, 고르는 창은 cloud-view.ts.
import type { SupabaseClient } from '@supabase/supabase-js';
import { browserKV, type BackupFile } from './backup';
import { CLOUD } from './cloud-config';
import { CloudSync, readMeta, type CloudStore, type Remote, type SyncStatus, type Written } from './cloud-sync';
import { onStoreWrite } from './storage';

/** 로그인 상태를 브라우저가 기억하는 키(cheonoe. 접두어가 아니어서 저장 묶음에 들어가지 않는다) */
const AUTH_KEY = 'cheonoe-auth';
const TABLE = 'saves';
/** 저장이 바뀐 뒤 모아서 올리기까지 */
const PUSH_DELAY = 4000;

export interface CloudUser {
  id: string;
  email: string;
  provider: string;
}

export type Provider = (typeof CLOUD.providers)[number]['id'];

let clientP: Promise<SupabaseClient> | null = null;
let user: CloudUser | null = null;
let sync: CloudSync | null = null;
let status: SyncStatus = { state: 'idle' };
let ask: (local: BackupFile, remote: Remote | null) => Promise<'local' | 'remote' | null> = async () => null;
const listeners = new Set<() => void>();

export const cloudEnabled = (): boolean => Boolean(CLOUD.url && CLOUD.key);

function client(): Promise<SupabaseClient> {
  clientP ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(CLOUD.url, CLOUD.key, {
      // PKCE: 로그인에서 돌아오면 주소의 ?code=를 우리가 바꾼다(앱이 주소를 지우기 전에)
      auth: { flowType: 'pkce', detectSessionInUrl: false, persistSession: true, autoRefreshToken: true, storageKey: AUTH_KEY },
    }),
  );
  return clientP;
}

function hasStoredSession(): boolean {
  try {
    return localStorage.getItem(AUTH_KEY) !== null;
  } catch {
    return false;
  }
}

function notify(): void {
  for (const fn of listeners) fn();
}

function setStatus(s: SyncStatus): void {
  status = s;
  notify();
}

/** 설정의 계정 칸이 듣는다. 돌려준 함수로 그만 듣는다 */
export function onCloudChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function cloudState(): { user: CloudUser | null; status: SyncStatus; lastSync: string | null } {
  const meta = readMeta(browserKV());
  return { user, status, lastSync: meta && user && meta.user === user.id ? meta.at : null };
}

/** 계정 행 하나(saves: user_id · data · rev · updated_at · device). 행 보안으로 자기 행만 보인다 */
function supaStore(c: SupabaseClient, userId: string): CloudStore {
  const written = (rows: { rev: number; updated_at: string }[] | null): Written => (rows?.length ? { ok: true, rev: rows[0].rev, updatedAt: rows[0].updated_at } : { ok: false });
  return {
    async fetch() {
      const { data, error } = await c.from(TABLE).select('data, rev, updated_at').eq('user_id', userId).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? { data: data.data as BackupFile, rev: data.rev as number, updatedAt: data.updated_at as string } : null;
    },
    async insert(file, device) {
      const { data, error } = await c.from(TABLE).insert({ user_id: userId, data: file, rev: 1, updated_at: new Date().toISOString(), device }).select('rev, updated_at');
      // 이미 행이 있다(다른 기기가 먼저 만들었다)
      if (error?.code === '23505') return { ok: false };
      if (error) throw new Error(error.message);
      return written(data);
    },
    async update(file, expect, device) {
      const { data, error } = await c
        .from(TABLE)
        .update({ data: file, rev: expect + 1, updated_at: new Date().toISOString(), device })
        .eq('user_id', userId)
        .eq('rev', expect)
        .select('rev, updated_at');
      if (error) throw new Error(error.message);
      return written(data);
    },
  };
}

const deviceName = (): string => (/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? '휴대폰' : 'PC');
/** 로그인에서 돌아올 곳: 지금 주소(GitHub Pages의 /Four/ 아래에서도) */
const returnTo = (): string => location.origin + location.pathname;

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let hooked = false;
/** 저장이 바뀌면 모아서 올리고, 창을 숨길 때 한 번 더(한 번만 건다) */
function hookWrites(): void {
  if (hooked) return;
  hooked = true;
  onStoreWrite(() => {
    if (!sync) return;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => void sync?.push(), PUSH_DELAY);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && sync) void sync.push();
  });
  addEventListener('online', () => void sync?.push());
}

async function attach(c: SupabaseClient): Promise<void> {
  const { data } = await c.auth.getSession();
  const u = data.session?.user;
  if (!u) {
    user = null;
    sync = null;
    return notify();
  }
  user = { id: u.id, email: u.email ?? '', provider: String(u.app_metadata?.provider ?? '') };
  sync = new CloudSync(browserKV(), supaStore(c, u.id), u.id, { ask: (l, r) => ask(l, r), reload: () => location.reload(), status: setStatus }, deviceName());
  hookWrites();
  notify();
  await sync.sync();
}

/**
 * 시작할 때 한 번: 로그인에서 돌아왔으면(?code=) 로그인을 마치고, 로그인해 둔 적이 있으면 계정과 맞춘다.
 * askWhich: 둘 다 기록이 있고 다를 때 고르는 창(cloud-view.ts). note: 짧은 알림
 */
export async function bootCloud(params: URLSearchParams, askWhich: typeof ask, note: (text: string) => void): Promise<void> {
  if (!cloudEnabled()) return;
  ask = askWhich;
  const code = params.get('code');
  const failed = params.get('error_description');
  if (code || failed) history.replaceState(null, '', location.pathname);
  if (failed) note(`로그인하지 못했다 — ${failed}`);
  if (!code && !hasStoredSession()) return;
  try {
    const c = await client();
    if (code) {
      const { error } = await c.auth.exchangeCodeForSession(code);
      if (error) note(`로그인하지 못했다 — ${error.message}`);
    }
    c.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        user = null;
        sync = null;
        notify();
      }
    });
    await attach(c);
    if (code && user) note(`${user.email || '계정'}으로 로그인했다`);
  } catch {
    // 서버에 닿지 못했다(오프라인 등): 게스트처럼 계속
    setStatus({ state: 'offline' });
  }
}

/** 구글·카카오: 그 회사 로그인 화면으로 갔다가 이 주소로 돌아온다 */
export async function signIn(provider: Provider): Promise<void> {
  const c = await client();
  const { error } = await c.auth.signInWithOAuth({ provider, options: { redirectTo: returnTo() } });
  if (error) throw new Error(error.message);
}

/** 이메일로 로그인 링크를 보낸다(링크를 누르면 이 주소로 돌아와 로그인된다 — 같은 브라우저에서 연다) */
export async function signInEmail(email: string): Promise<void> {
  const c = await client();
  const { error } = await c.auth.signInWithOtp({ email, options: { emailRedirectTo: returnTo() } });
  if (error) throw new Error(error.message);
}

/** 로그아웃: 바뀐 것을 먼저 올리고, 이 브라우저의 기록은 그대로 둔다(게스트로 계속) */
export async function signOut(): Promise<void> {
  if (pushTimer) clearTimeout(pushTimer);
  await sync?.push();
  const c = await client();
  await c.auth.signOut();
  user = null;
  sync = null;
  setStatus({ state: 'idle' });
}

/** 「지금 동기화」: 계정을 다시 읽고 맞춘다(고르지 않고 닫았던 창도 다시 묻는다) */
export async function syncNow(): Promise<void> {
  await sync?.sync();
}

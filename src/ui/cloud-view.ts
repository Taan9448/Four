// 계정·클라우드 저장의 화면(2026-10-15): 둘 다 기록이 있고 다를 때 고르는 창, 설정 › 저장 맨 위 「계정」 칸
import { gameData } from '../engine/data';
import { previewBackup, type BackupFile } from './backup';
import { cloudEnabled, cloudState, onCloudChange, signIn, signInWithId, signOut, syncNow } from './cloud';
import { ID_RULE, PASSWORD_MIN } from './cloud-id';
import { CLOUD } from './cloud-config';
import type { Remote, SyncStatus } from './cloud-sync';
import { h } from './dom';
import { openOverlay, popPanel } from './overlay';
import { SLOT_COUNT } from './storage';

const when = (t: number | string) => {
  const d = typeof t === 'number' ? new Date(t) : new Date(t);
  return Number.isNaN(d.getTime()) || !+d ? '—' : d.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

/** 한 기록의 요약(저장 칸 3개·도감) */
function summary(title: string, file: BackupFile | null, foot: string): HTMLElement {
  if (!file) return h('div', { class: 'cloud-side' }, h('h3', {}, title), h('p', { class: 'cloud-empty' }, '기록 없음 — 처음부터'), h('small', {}, foot));
  const p = previewBackup(gameData(), file, SLOT_COUNT);
  return h(
    'div',
    { class: 'cloud-side' },
    h('h3', {}, title),
    h(
      'ul',
      { class: 'backup-slots' },
      p.slots.map((x) => h('li', {}, `${x.slot}번 칸 — ${x.stage ? `${x.stage} · 상흔 ${x.scar} · ${when(x.savedAt)}` : '비어 있음'}`)),
    ),
    h('p', {}, `도감 ${p.codex.seen} / ${p.codex.total}칸`),
    h('small', {}, foot),
  );
}

/** 이 기기 기록과 계정 기록이 다를 때 어느 쪽을 쓸지. 닫으면 null(「지금 동기화」 전까지 멈춤) */
export function askWhich(local: BackupFile, remote: Remote | null): Promise<'local' | 'remote' | null> {
  return new Promise((resolve) => {
    let picked: 'local' | 'remote' | null = null;
    const pick = (c: 'local' | 'remote') => {
      picked = c;
      ov.close();
    };
    const body = h(
      'div',
      { class: 'cloud-ask' },
      h(
        'p',
        { class: 'cloud-lead' },
        remote
          ? '이 기기의 기록과 계정의 기록이 다르다. 어느 쪽으로 이어 할까? 고르지 않은 쪽은 설정 › 저장의 「직전 가져오기 되돌리기」로 한 번 되살릴 수 있다.'
          : '이 기기의 기록은 다른 계정에서 쓰던 것이다. 이 계정에 올릴까, 이 계정은 처음부터 시작할까? (처음부터를 고르면 이 기록은 「되돌리기」 한 벌로 남는다)',
      ),
      h(
        'div',
        { class: 'cloud-sides' },
        summary('이 기기', local, '지금 이 브라우저'),
        summary(remote ? '계정' : '이 계정', remote?.data ?? null, remote ? `마지막으로 올린 때 ${when(remote.updatedAt)}` : '아직 올린 기록이 없다'),
      ),
      h(
        'div',
        { class: 'backup-actions' },
        h('button', { class: 'btn', type: 'button', onclick: () => pick('local') }, remote ? '이 기기 기록으로(계정을 덮는다)' : '이 기록을 이 계정에 올린다'),
        h('button', { class: 'btn btn-primary', type: 'button', onclick: () => pick('remote') }, remote ? '계정 기록으로(이 기기를 덮는다)' : '처음부터 시작'),
      ),
    );
    const ov = openOverlay('어느 기록으로 이어 할까', body, { wide: true, onClose: () => resolve(picked) });
  });
}

function statusText(s: SyncStatus, last: string | null): string {
  switch (s.state) {
    case 'syncing':
      return '맞추는 중…';
    case 'offline':
      return '서버에 닿지 않는다 — 이 기기에 저장하고, 연결되면 올린다';
    case 'held':
      return '기록을 고르지 않아 멈췄다 — 「지금 동기화」로 다시 고른다';
    case 'error':
      return `올리지 못했다 — ${s.message}`;
    case 'synced':
      return `계정과 맞춤 · ${when(s.at)}`;
    default:
      return last ? `계정과 맞춤 · ${when(last)}` : '';
  }
}

const PROVIDER_NAME: Record<string, string> = { google: '구글', kakao: '카카오' };

/** 이번 탭에서 게스트를 골랐는가(시작 화면이 로그인 판을 다시 띄우지 않는다 — 다음 접속에는 다시 묻는다) */
const GUEST_KEY = 'cheonoe-guest';
export function guestChosen(): boolean {
  try {
    return sessionStorage.getItem(GUEST_KEY) === '1';
  } catch {
    return false;
  }
}
export function chooseGuest(on = true): void {
  try {
    if (on) sessionStorage.setItem(GUEST_KEY, '1');
    else sessionStorage.removeItem(GUEST_KEY);
  } catch {
    /* 저장할 수 없는 환경: 이번 화면에서만 */
  }
}

/**
 * 게스트로 시작할 때 한 번 묻는 창: 기록이 계정에 저장되지 않는다. true = 게스트로 계속, false = 로그인으로 돌아간다(Esc·바깥 누르기도)
 */
export function guestNotice(): Promise<boolean> {
  return new Promise((resolve) => {
    let guest = false;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    const close = () => {
      document.removeEventListener('keydown', onKey, true);
      el.remove();
      resolve(guest);
    };
    const login = h('button', { class: 'btn btn-primary', type: 'button', onclick: () => close() }, '로그인하러 가기');
    const lead = h(
      'div',
      { class: 'guest-notice' },
      h('p', {}, '게스트 기록은 ', h('b', {}, '계정에 저장되지 않는다.'), ' 이 브라우저에만 남아서'),
      h('ul', {}, h('li', {}, '다른 기기·브라우저에서는 이어 할 수 없고'), h('li', {}, '브라우저 기록을 지우면 함께 사라진다.')),
      h('p', {}, '로그인하면 어디서든 이어 한다. 나중에 로그인해도 지금까지의 게스트 기록은 계정으로 옮길 수 있다.'),
    );
    const el = h(
      'div',
      { class: 'overlay pop-overlay', onclick: (e: Event) => e.target === el && close() },
      popPanel({
        seal: '客',
        sealKind: 'muted',
        eyebrow: '게스트',
        title: '저장 안 됨',
        tone: 'plain',
        lead,
        actions: [h('button', { class: 'btn', type: 'button', onclick: () => ((guest = true), close()) }, '게스트로 계속'), login],
      }),
    );
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(el);
    requestAnimationFrame(() => login.focus());
  });
}

/**
 * 로그인 판(2026-10-15 사용자 결정 — 보통 게임처럼): 로그인 · 회원가입 두 탭 + (시작 화면이면) 게스트로 시작.
 * onDone: 로그인·가입이 끝났다 · onGuest: 게스트로 시작(없으면 단추를 두지 않는다 — 설정의 계정 칸)
 */
export function loginPanel(opts: { onDone: () => void; onGuest?: () => void; compact?: boolean }): HTMLElement {
  let mode: 'login' | 'signup' = 'login';
  const id = h('input', { type: 'text', class: 'login-input', name: 'username', placeholder: '아이디', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', maxlength: '20', 'aria-label': '아이디' }) as HTMLInputElement;
  const pw = h('input', { type: 'password', class: 'login-input', name: 'password', placeholder: '비밀번호', autocomplete: 'current-password', 'aria-label': '비밀번호' }) as HTMLInputElement;
  const pw2 = h('input', { type: 'password', class: 'login-input', name: 'password2', placeholder: '비밀번호 확인', autocomplete: 'new-password', 'aria-label': '비밀번호 확인' }) as HTMLInputElement;
  const msg = h('p', { class: 'login-msg', role: 'alert' });
  const submit = h('button', { class: 'btn btn-primary login-submit', type: 'submit' }, '로그인') as HTMLButtonElement;
  const hint = h('small', { class: 'login-hint' });
  const tabBtn = (m: 'login' | 'signup', label: string) =>
    h('button', { class: 'login-tab', type: 'button', role: 'tab', onclick: () => setMode(m) }, label) as HTMLButtonElement;
  const tabs = { login: tabBtn('login', '로그인'), signup: tabBtn('signup', '회원가입') };
  const setMode = (m: 'login' | 'signup') => {
    mode = m;
    tabs.login.setAttribute('aria-selected', String(m === 'login'));
    tabs.signup.setAttribute('aria-selected', String(m === 'signup'));
    pw2.hidden = m === 'login';
    pw.autocomplete = m === 'login' ? 'current-password' : 'new-password';
    submit.textContent = m === 'login' ? '로그인' : '가입하고 시작';
    hint.textContent = m === 'login' ? '' : `아이디: ${ID_RULE} · 비밀번호 ${PASSWORD_MIN}자 이상`;
    msg.textContent = '';
  };
  const form = h(
    'form',
    {
      class: 'login-form',
      onsubmit: async (e: Event) => {
        e.preventDefault();
        submit.disabled = true;
        msg.textContent = mode === 'login' ? '로그인하는 중…' : '가입하는 중…';
        const r = await signInWithId(id.value, pw.value, mode, pw2.value);
        submit.disabled = false;
        if (!r.ok) {
          msg.textContent = r.message;
          return;
        }
        msg.textContent = '';
        pw.value = pw2.value = '';
        chooseGuest(false);
        opts.onDone();
      },
    },
    id,
    pw,
    pw2,
    hint,
    msg,
    submit,
  );
  setMode('login');
  return h(
    'div',
    { class: `login-panel${opts.compact ? ' compact' : ''}` },
    h('div', { class: 'login-tabs', role: 'tablist' }, tabs.login, tabs.signup),
    form,
    // 구글·카카오(켠 공급자만, cloud-config.ts)
    CLOUD.providers.length
      ? h(
          'div',
          { class: 'cloud-providers' },
          CLOUD.providers.map((p) => h('button', { class: `btn btn-small cloud-${p.id}`, type: 'button', onclick: () => signIn(p.id).catch((e: unknown) => (msg.textContent = String(e instanceof Error ? e.message : e))) }, p.label)),
        )
      : null,
    // 게스트는 단추가 아닌 글자 한 줄로(2026-10-15 사용자 요청 — 로그인을 권한다). 누르면 저장 안내 창을 거친다
    opts.onGuest
      ? h(
          'button',
          {
            class: 'login-guest-link',
            type: 'button',
            onclick: async () => {
              if (!(await guestNotice())) return id.focus();
              chooseGuest(true);
              opts.onGuest!();
            },
          },
          '게스트로 시작 →',
        )
      : null,
  );
}

/** 설정 › 저장 맨 위 「계정」 칸(로그인 상태가 바뀌면 다시 그린다) */
export function accountRows(): HTMLElement[] {
  if (!cloudEnabled()) return [];
  const box = h('div', { class: 'cloud-account', 'aria-live': 'polite' });
  const draw = () => {
    if (!box.isConnected && box.childElementCount) return off();
    const { user, status, lastSync } = cloudState();
    if (user) {
      box.replaceChildren(
        h(
          'div',
          { class: 'set-row' },
          h(
            'span',
            { class: 'set-label' },
            h('span', { class: 'set-name' }, '계정'),
            h('small', {}, `${user.name}${PROVIDER_NAME[user.provider] ? ` · ${PROVIDER_NAME[user.provider]}` : ''}`),
          ),
          h(
            'span',
            { class: 'set-actions' },
            h('button', { class: 'btn btn-small', type: 'button', disabled: status.state === 'syncing', onclick: () => void syncNow() }, '지금 동기화'),
            h('button', { class: 'btn btn-small', type: 'button', onclick: () => void signOut() }, '로그아웃'),
          ),
        ),
        h('p', { class: 'cloud-status' }, statusText(status, lastSync)),
      );
      return;
    }
    box.replaceChildren(
      h(
        'div',
        { class: 'set-row' },
        h(
          'span',
          { class: 'set-label' },
          h('span', { class: 'set-name' }, '계정 로그인'),
          h('small', {}, '로그인하면 저장이 계정에 올라가 다른 기기에서 이어 한다. 하지 않으면 이 브라우저에만 저장된다(게스트)'),
        ),
      ),
      loginPanel({ onDone: () => undefined, compact: true }),
      h('p', { class: 'cloud-note' }, '지금 이 브라우저의 기록(게스트)은 지워지지 않는다 — 계정이 비어 있으면 그대로 올라가고, 계정에도 기록이 있으면 어느 쪽을 쓸지 묻는다.'),
    );
  };
  const off = onCloudChange(draw);
  draw();
  return [box];
}

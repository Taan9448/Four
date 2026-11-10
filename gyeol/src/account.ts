// 「결」 계정·수련(2026-11-10 목업): 「천외귀환」 시작 화면과 같은 방식 — 로그인 · 회원가입 두 탭 + 「게스트로 시작」 글자 한 줄,
// 들어간 뒤에는 시작 화면 왼쪽 아래 명패(인장 + 아이디·저장 상태·로그아웃 + 修 수련 Lv.). 설정 맨 위에도 「계정」 칸.
// 지금은 서버(Supabase)에 닿지 않는 목업이다: 규칙 검사(아이디·비밀번호)는 「천외귀환」 것을 그대로 쓰고, 로그인 상태는 이 탭에만 둔다.
// 실제로 잇는 계획은 gyeol/docs/GAME_DESIGN.md 7-6절.
import lobbyRaw from '../data/lobby.json';
import { checkId, checkPassword, ID_RULE, normalizeId, PASSWORD_MIN } from '../../src/ui/cloud-id';
import { el } from './dom';
import { loadSave } from './save';

interface AccountData {
  mock: boolean;
  training: { xp: { win: number; perfect: number; chapter: number }; need: { base: number; step: number } };
}
const ACCOUNT = (lobbyRaw as unknown as { account: AccountData }).account;

export type AccountKind = 'signed-in' | 'guest' | 'none';
export interface AccountState {
  kind: AccountKind;
  name: string;
}

const KEY = 'gyeol.mockAccount';
const GUEST_KEY = 'gyeol.guest';

function session(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}
/** 저장이 막힌 창이면 이번 화면 동안만 */
let memory: { name: string | null; guest: boolean } = { name: null, guest: false };

export function accountState(): AccountState {
  const s = session();
  let name = memory.name;
  let guest = memory.guest;
  try {
    if (s) {
      name = s.getItem(KEY);
      guest = s.getItem(GUEST_KEY) === '1';
    }
  } catch {
    /* 메모리 값 */
  }
  if (name) return { kind: 'signed-in', name };
  return guest ? { kind: 'guest', name: '게스트' } : { kind: 'none', name: '' };
}

function put(name: string | null, guest: boolean): void {
  memory = { name, guest };
  const s = session();
  try {
    if (name) s?.setItem(KEY, name);
    else s?.removeItem(KEY);
    if (guest) s?.setItem(GUEST_KEY, '1');
    else s?.removeItem(GUEST_KEY);
  } catch {
    /* 메모리만 */
  }
}

export const signOut = (): void => put(null, false);
export const chooseGuest = (): void => put(null, true);

/** 목업 로그인: 「천외귀환」과 같은 규칙으로 검사만 하고 이 탭에 이름을 둔다 */
export function mockSignIn(id: string, pw: string, mode: 'login' | 'signup', pw2?: string): { ok: true } | { ok: false; message: string } {
  const bad = checkId(id) ?? checkPassword(pw, mode === 'signup' ? (pw2 ?? '') : undefined);
  if (bad) return { ok: false, message: bad };
  put(normalizeId(id), false);
  return { ok: true };
}

/* ───────── 수련 Lv. ───────── */

export interface Training {
  level: number;
  into: number;
  need: number;
  xp: number;
}

/** 수련 경험치: 이 기기 기록(이김·PERFECT·마친 장)으로 셈한다 */
export function trainingXp(): number {
  const s = loadSave();
  const x = ACCOUNT.training.xp;
  return s.stats.wins * x.win + s.stats.perfect * x.perfect + s.story.cleared.length * x.chapter;
}

export function trainingLevel(xp: number): Training {
  const { base, step } = ACCOUNT.training.need;
  let level = 1;
  let left = Math.max(0, Math.floor(xp));
  for (let need = base; left >= need; need = base + step * level) {
    left -= need;
    level++;
  }
  return { level, into: left, need: base + step * (level - 1), xp };
}

function trainingLine(): HTMLElement {
  const t = trainingLevel(trainingXp());
  const x = ACCOUNT.training.xp;
  const bar = el('span', { class: 'training-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(t.need), 'aria-valuenow': String(t.into), 'aria-label': `다음 레벨까지 ${t.into}/${t.need}` }, el('i', { style: `width:${Math.round((t.into / t.need) * 100)}%` }));
  return el(
    'div',
    { class: 'plate-training', title: `이긴 대결 +${x.win} · PERFECT +${x.perfect} · 마친 장 +${x.chapter}. 다음 레벨까지 ${t.need - t.into}` },
    el('b', { 'aria-hidden': 'true' }, '修'),
    el('span', {}, `수련 Lv.${t.level}`),
    bar,
  );
}

/* ───────── 로그인 판 ───────── */

/** 게스트로 시작할 때 한 번 묻는 창: true = 게스트로 계속 */
function guestNotice(): Promise<boolean> {
  return new Promise((resolve) => {
    let guest = false;
    const login = el('button', { class: 'btn primary', type: 'button' }, '로그인하러 가기');
    const keep = el('button', { class: 'btn', type: 'button' }, '게스트로 계속');
    const box = el(
      'div',
      { class: 'acct-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': '게스트' },
      el(
        'div',
        { class: 'acct-modal-box' },
        el('span', { class: 'acct-seal muted', 'aria-hidden': 'true' }, '客'),
        el('h2', {}, '저장 안 됨'),
        el('p', {}, '게스트 기록은 ', el('b', {}, '계정에 저장되지 않는다.'), ' 이 브라우저에만 남아서'),
        el('ul', {}, el('li', {}, '다른 기기·브라우저에서는 이어 할 수 없고'), el('li', {}, '브라우저 기록을 지우면 함께 사라진다.')),
        el('p', {}, '로그인하면 「천외귀환」과 같은 계정으로 어디서든 이어 한다. 나중에 로그인해도 지금까지의 기록은 계정으로 옮길 수 있다.'),
        el('div', { class: 'acct-actions' }, keep, login),
      ),
    );
    const close = () => {
      window.removeEventListener('keydown', onKey, true);
      box.remove();
      resolve(guest);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    login.addEventListener('click', close);
    keep.addEventListener('click', () => ((guest = true), close()));
    box.addEventListener('click', (e) => e.target === box && close());
    window.addEventListener('keydown', onKey, true);
    document.body.append(box);
    requestAnimationFrame(() => login.focus());
  });
}

/** 로그인 · 회원가입 두 탭 + (시작 화면이면) 게스트로 시작 */
export function loginPanel(opts: { onDone: () => void; onGuest?: () => void; compact?: boolean }): HTMLElement {
  let mode: 'login' | 'signup' = 'login';
  const id = el('input', { type: 'text', class: 'login-input', name: 'username', placeholder: '아이디', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', maxlength: '20', 'aria-label': '아이디' });
  const pw = el('input', { type: 'password', class: 'login-input', name: 'password', placeholder: '비밀번호', autocomplete: 'current-password', 'aria-label': '비밀번호' });
  const pw2 = el('input', { type: 'password', class: 'login-input', name: 'password2', placeholder: '비밀번호 확인', autocomplete: 'new-password', 'aria-label': '비밀번호 확인' });
  const msg = el('p', { class: 'login-msg', role: 'alert' });
  const hint = el('small', { class: 'login-hint' });
  const submit = el('button', { class: 'btn primary login-submit', type: 'submit' }, '로그인');
  const tab = (m: 'login' | 'signup', label: string) => {
    const b = el('button', { class: 'login-tab', type: 'button', role: 'tab' }, label);
    b.addEventListener('click', () => setMode(m));
    return b;
  };
  const tabs = { login: tab('login', '로그인'), signup: tab('signup', '회원가입') };
  const setMode = (m: 'login' | 'signup') => {
    mode = m;
    tabs.login.setAttribute('aria-selected', String(m === 'login'));
    tabs.signup.setAttribute('aria-selected', String(m === 'signup'));
    pw2.hidden = m === 'login';
    pw.autocomplete = m === 'login' ? 'current-password' : 'new-password';
    submit.textContent = m === 'login' ? '로그인' : '가입하고 시작';
    hint.textContent = m === 'login' ? '「천외귀환」 계정 그대로' : `아이디: ${ID_RULE} · 비밀번호 ${PASSWORD_MIN}자 이상`;
    msg.textContent = '';
  };
  const form = el('form', { class: 'login-form' }, id, pw, pw2, hint, msg, submit);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const r = mockSignIn(id.value, pw.value, mode, pw2.value);
    if (!r.ok) {
      msg.textContent = r.message;
      return;
    }
    pw.value = pw2.value = '';
    opts.onDone();
  });
  // 키 입력이 화면 단축키(Enter = 들어가기 등)로 새지 않게
  form.addEventListener('keydown', (e) => e.stopPropagation());
  setMode('login');
  const guest = opts.onGuest
    ? el('button', { class: 'login-guest-link', type: 'button' }, '게스트로 시작 →')
    : '';
  if (guest)
    guest.addEventListener('click', async () => {
      if (!(await guestNotice())) return id.focus();
      chooseGuest();
      opts.onGuest!();
    });
  return el(
    'div',
    { class: `login-panel${opts.compact ? ' compact' : ''}` },
    el('div', { class: 'login-tabs', role: 'tablist' }, tabs.login, tabs.signup),
    form,
    guest,
    ACCOUNT.mock ? el('p', { class: 'mock-tag' }, '목업 — 아직 서버에 올리지 않는다. 기록은 이 브라우저에 그대로 저장된다.') : '',
  );
}

/* ───────── 명패(시작 화면 왼쪽 아래) ───────── */

/** 인장 + 아이디·저장 상태·로그아웃 + 修 수련 Lv. onChange: 로그아웃·로그인하기를 누르면 화면을 다시 그린다 */
export function playerPlate(onChange: () => void): HTMLElement {
  const a = accountState();
  const signed = a.kind === 'signed-in';
  const action = el('button', { class: 'link-btn', type: 'button' }, signed ? '로그아웃' : '로그인 · 회원가입');
  action.addEventListener('click', () => {
    signOut();
    onChange();
  });
  return el(
    'div',
    { class: `title-plate ${signed ? 'signed-in' : 'guest'}` },
    el('span', { class: 'plate-seal', 'aria-hidden': 'true' }, signed ? '名' : '客'),
    el(
      'div',
      { class: 'plate-body' },
      el('div', { class: 'plate-name' }, el('b', {}, a.name || '게스트'), el('small', { class: `plate-sync ${signed ? 'sync-synced' : 'sync-guest'}` }, signed ? (ACCOUNT.mock ? '☁ 저장됨(목업)' : '☁ 저장됨') : '이 기기에만 저장')),
      trainingLine(),
      el('div', { class: 'plate-actions' }, action),
    ),
  );
}

/** 설정 맨 위 「계정」 칸 */
export function accountRows(redraw: () => void): HTMLElement {
  const a = accountState();
  if (a.kind === 'signed-in') {
    const sync = el('button', { class: 'btn small', type: 'button' }, '지금 동기화');
    const out = el('button', { class: 'btn small', type: 'button' }, '로그아웃');
    const status = el('p', { class: 'note' }, ACCOUNT.mock ? '계정과 맞춤(목업) — 실제 올리기는 다음 단계' : '계정과 맞춤');
    sync.addEventListener('click', () => (status.textContent = `계정과 맞춤(목업) · ${new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`));
    out.addEventListener('click', () => {
      signOut();
      redraw();
    });
    return el('div', { class: 'acct-row' }, el('div', { class: 'row acct' }, el('span', {}, '계정'), el('b', {}, a.name), el('span', { class: 'acct-btns' }, sync, out)), status, trainingLine());
  }
  return el(
    'div',
    { class: 'acct-row' },
    el('div', { class: 'row acct' }, el('span', {}, '계정 로그인'), el('small', {}, '로그인하면 기록이 계정에 올라가 다른 기기에서 이어 한다. 하지 않으면 이 브라우저에만 저장된다(게스트)')),
    loginPanel({ onDone: redraw, compact: true }),
    trainingLine(),
  );
}

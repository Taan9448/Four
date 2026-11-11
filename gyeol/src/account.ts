// 「결」 계정·수련(2026-11-10 목업 → 2026-11-11 실제 연결): 「천외귀환」 시작 화면과 같은 방식 — 로그인 · 회원가입 두 탭 + 「게스트로 시작」 글자 한 줄,
// 들어간 뒤에는 시작 화면 왼쪽 아래 명패(인장 + 아이디·저장 상태·로그아웃 + 修 수련 Lv.). 설정 맨 위에도 「계정」 칸.
// 로그인·올리기는 cloud.ts(같은 Supabase 계정, 「결」 기록은 gyeol_saves 표). 설계는 gyeol/docs/GAME_DESIGN.md 7-6절.
import storyRaw from '../data/story.json';
import { ID_RULE, PASSWORD_MIN } from '../../src/ui/cloud-id';
import { cloudEnabled, cloudState, hasStoredSession, onCloudChange, signInWithId, signOut as cloudSignOut, syncNow } from './cloud';
import type { CloudData, Remote, SyncStatus } from './cloud-sync';
import { el } from './dom';
import { currentTraining, onTrainingChange, TRAINING_XP } from './training';

const CHAPTERS = (storyRaw as unknown as { chapters: unknown[] }).chapters.length;

/** signed-in: 로그인함 · pending: 로그인해 둔 세션을 확인하는 중(또는 오프라인) · guest: 이번 탭에서 게스트를 골랐다 · none: 아직 고르지 않았다 */
export type AccountKind = 'signed-in' | 'pending' | 'guest' | 'none';
export interface AccountState {
  kind: AccountKind;
  name: string;
}

/** 이번 탭에서 게스트를 골랐는가(다음 접속에는 다시 묻는다 — 「천외귀환」과 같다) */
const GUEST_KEY = 'gyeol.guest';
let guestMemory = false;
function guestChosen(): boolean {
  try {
    return sessionStorage.getItem(GUEST_KEY) === '1';
  } catch {
    return guestMemory;
  }
}
function setGuest(on: boolean): void {
  guestMemory = on;
  try {
    if (on) sessionStorage.setItem(GUEST_KEY, '1');
    else sessionStorage.removeItem(GUEST_KEY);
  } catch {
    /* 메모리만 */
  }
}

export function accountState(): AccountState {
  const { user } = cloudState();
  if (user) return { kind: 'signed-in', name: user.name };
  if (cloudEnabled() && hasStoredSession()) return { kind: 'pending', name: '' };
  if (!cloudEnabled() || guestChosen()) return { kind: 'guest', name: '게스트' };
  return { kind: 'none', name: '' };
}

export const chooseGuest = (): void => setGuest(true);

/** 로그아웃(바뀐 것을 먼저 올린다). 게스트도 고르지 않은 상태로 돌아가 로그인 판이 다시 뜬다 */
export async function signOut(): Promise<void> {
  if (cloudState().user) await cloudSignOut().catch(() => undefined);
  setGuest(false);
}

/** el이 화면에서 빠지면 그만 듣는다 */
function whileShown(node: HTMLElement, fn: () => void): void {
  const off = onCloudChange(() => {
    if (!node.isConnected) return off();
    fn();
  });
}

const when = (t: string | null | undefined): string => {
  const d = t ? new Date(t) : null;
  return !d || Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

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

const PLATE_SYNC: Partial<Record<SyncStatus['state'], string>> = { syncing: '☁ 맞추는 중', offline: '오프라인', held: '동기화 멈춤', error: '올리지 못함' };

/* ───────── 어느 기록으로 이어 할까 ───────── */

function side(title: string, d: CloudData | null, foot: string): HTMLElement {
  if (!d) return el('div', { class: 'cloud-side' }, el('h3', {}, title), el('p', { class: 'cloud-empty' }, '기록 없음 — 처음부터'), el('small', {}, foot));
  return el(
    'div',
    { class: 'cloud-side' },
    el('h3', {}, title),
    el(
      'ul',
      {},
      el('li', {}, `이야기 ${d.story.cleared.length} / ${CHAPTERS}장`),
      el('li', {}, `이긴 대결 ${d.stats.wins} / ${d.stats.duels}`),
      el('li', {}, `업적 ${d.achievements.length}`),
    ),
    el('small', {}, foot),
  );
}

/** 이 기기 기록과 계정 기록이 다를 때 어느 쪽을 쓸지. 닫으면 null(「지금 동기화」 전까지 멈춤) */
export function askWhich(local: CloudData, remote: Remote | null): Promise<'local' | 'remote' | null> {
  return new Promise((resolve) => {
    let picked: 'local' | 'remote' | null = null;
    const mine = el('button', { class: 'btn', type: 'button' }, remote ? '이 기기 기록으로(계정을 덮는다)' : '이 기록을 이 계정에 올린다');
    const theirs = el('button', { class: 'btn primary', type: 'button' }, remote ? '계정 기록으로(이 기기를 덮는다)' : '처음부터 시작');
    const box = el(
      'div',
      { class: 'acct-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': '어느 기록으로 이어 할까' },
      el(
        'div',
        { class: 'acct-modal-box wide' },
        el('span', { class: 'acct-seal', 'aria-hidden': 'true' }, '名'),
        el('h2', {}, '어느 기록으로 이어 할까'),
        el(
          'p',
          {},
          remote
            ? '이 기기의 기록과 계정의 기록이 다르다. 고르지 않은 쪽은 이 브라우저에 한 벌(gyeol.backup) 남는다.'
            : '이 기기의 기록은 다른 계정에서 쓰던 것이다. 이 계정에 올릴까, 이 계정은 처음부터 시작할까? (처음부터를 고르면 이 기록은 한 벌 남는다)',
        ),
        el(
          'div',
          { class: 'cloud-sides' },
          side('이 기기', local, '지금 이 브라우저'),
          side(remote ? '계정' : '이 계정', remote?.data ?? null, remote ? `마지막으로 올린 때 ${when(remote.updatedAt)}${remote.device ? ` · ${remote.device}` : ''}` : '아직 올린 기록이 없다'),
        ),
        el('div', { class: 'acct-actions' }, mine, theirs),
      ),
    );
    const close = () => {
      window.removeEventListener('keydown', onKey, true);
      box.remove();
      resolve(picked);
    };
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Escape') close();
    };
    mine.addEventListener('click', () => ((picked = 'local'), close()));
    theirs.addEventListener('click', () => ((picked = 'remote'), close()));
    window.addEventListener('keydown', onKey, true);
    document.body.append(box);
    requestAnimationFrame(() => theirs.focus());
  });
}

/* ───────── 수련 Lv.(「천외귀환」과 같은 계정 수련 — training.ts) ───────── */

const XP = TRAINING_XP;

/** 修 수련 Lv.과 막대. 경험치가 오르거나 계정에서 읽어 오면 저절로 바뀐다 */
export function trainingLine(): HTMLElement {
  const line = el('div', { class: 'plate-training' });
  const paint = () => {
    const t = currentTraining();
    const max = t.need === 0;
    line.title = `「천외귀환」과 같은 계정 수련 — 이긴 전투·대결마다 오른다(일반 ${XP.battle} · 정예 ${XP.elite} · 보스 ${XP.boss}).${max ? '' : ` 다음 레벨까지 ${t.need - t.into}`}`;
    line.replaceChildren(
      el('b', { 'aria-hidden': 'true' }, '修'),
      el('span', {}, `수련 Lv.${t.level}`),
      max
        ? ''
        : el('span', { class: 'training-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(t.need), 'aria-valuenow': String(t.into), 'aria-label': `다음 레벨까지 ${t.into}/${t.need}` }, el('i', { style: `width:${Math.round((t.into / t.need) * 100)}%` })),
    );
  };
  paint();
  const off = onTrainingChange(() => (line.isConnected ? paint() : off()));
  return line;
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
  let busy = false;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy) return;
    busy = true;
    submit.disabled = true;
    const label = submit.textContent;
    submit.textContent = mode === 'login' ? '들어가는 중…' : '가입하는 중…';
    msg.textContent = '';
    const r = await signInWithId(id.value, pw.value, mode, pw2.value);
    busy = false;
    submit.disabled = false;
    submit.textContent = label;
    if (!r.ok) {
      msg.textContent = r.message;
      return;
    }
    pw.value = pw2.value = '';
    setGuest(false);
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
  );
}

/* ───────── 명패(시작 화면 왼쪽 아래) ───────── */

/** 인장 + 아이디·저장 상태·로그아웃 + 修 수련 Lv. onChange: 로그아웃·로그인하기를 누르면 화면을 다시 그린다. 저장 상태는 저절로 바뀐다 */
export function playerPlate(onChange: () => void): HTMLElement {
  const plate = el('div', { class: 'title-plate' });
  const paint = () => {
    const a = accountState();
    const { status } = cloudState();
    let seal = '客';
    let name = '게스트';
    let sync = '이 기기에만 저장';
    let syncClass = 'sync-guest';
    let action: HTMLElement | string = '';
    if (a.kind === 'signed-in') {
      [seal, name, sync, syncClass] = ['名', a.name, PLATE_SYNC[status.state] ?? '☁ 저장됨', `sync-${status.state}`];
      action = el('button', { class: 'link-btn', type: 'button' }, '로그아웃');
      action.addEventListener('click', () => void signOut().then(onChange));
    } else if (a.kind === 'pending') {
      const off = status.state === 'offline';
      [seal, name, sync, syncClass] = ['名', off ? '오프라인' : '로그인 확인 중…', off ? '이 기기에 저장, 연결되면 올린다' : '', off ? 'sync-offline' : 'sync-syncing'];
    } else if (cloudEnabled()) {
      action = el('button', { class: 'link-btn', type: 'button' }, '로그인 · 회원가입');
      action.addEventListener('click', () => (setGuest(false), onChange()));
    }
    plate.className = `title-plate ${a.kind === 'none' ? 'guest' : a.kind}`;
    plate.replaceChildren(
      el('span', { class: 'plate-seal', 'aria-hidden': 'true' }, seal),
      el(
        'div',
        { class: 'plate-body' },
        el('div', { class: 'plate-name' }, el('b', {}, name), el('small', { class: `plate-sync ${syncClass}` }, sync)),
        trainingLine(),
        action ? el('div', { class: 'plate-actions' }, action) : '',
      ),
    );
  };
  paint();
  whileShown(plate, paint);
  return plate;
}

/** 설정 맨 위 「계정」 칸 */
export function accountRows(redraw: () => void): HTMLElement {
  const a = accountState();
  if (a.kind === 'signed-in' || a.kind === 'pending') {
    const sync = el('button', { class: 'btn small', type: 'button' }, '지금 동기화');
    const out = el('button', { class: 'btn small', type: 'button' }, '로그아웃');
    const status = el('p', { class: 'note acct-status' });
    const paint = () => {
      const st = cloudState();
      status.textContent = st.user ? statusText(st.status, st.lastSync) || '계정과 맞춤' : st.status.state === 'offline' ? statusText(st.status, null) : '로그인 확인 중…';
      sync.disabled = !st.user || st.status.state === 'syncing';
    };
    sync.addEventListener('click', () => void syncNow());
    out.addEventListener('click', () => void signOut().then(redraw));
    const row = el(
      'div',
      { class: 'acct-row' },
      el('div', { class: 'row acct' }, el('span', {}, '계정'), el('b', {}, a.name || '…'), el('span', { class: 'acct-btns' }, sync, out)),
      status,
      trainingLine(),
    );
    paint();
    whileShown(row, () => (accountState().kind === a.kind ? paint() : redraw()));
    return row;
  }
  if (!cloudEnabled()) return el('div', { class: 'acct-row' }, el('div', { class: 'row acct' }, el('span', {}, '계정'), el('small', {}, '이 판에는 계정 기능이 없다 — 이 브라우저에만 저장된다')), trainingLine());
  return el(
    'div',
    { class: 'acct-row' },
    el('div', { class: 'row acct' }, el('span', {}, '계정 로그인'), el('small', {}, '로그인하면 기록이 계정에 올라가 다른 기기에서 이어 한다. 하지 않으면 이 브라우저에만 저장된다(게스트)')),
    loginPanel({ onDone: redraw, compact: true }),
    trainingLine(),
  );
}

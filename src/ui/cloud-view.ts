// 계정·클라우드 저장의 화면(2026-10-15): 둘 다 기록이 있고 다를 때 고르는 창, 설정 › 저장 맨 위 「계정」 칸
import { gameData } from '../engine/data';
import { previewBackup, type BackupFile } from './backup';
import { cloudEnabled, cloudState, onCloudChange, signIn, signInEmail, signOut, syncNow } from './cloud';
import { CLOUD } from './cloud-config';
import type { Remote, SyncStatus } from './cloud-sync';
import { h } from './dom';
import { openOverlay } from './overlay';
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

const PROVIDER_NAME: Record<string, string> = { google: '구글', kakao: '카카오', email: '이메일' };

/** 설정 › 저장 맨 위 「계정」 칸(로그인 상태가 바뀌면 다시 그린다) */
export function accountRows(): HTMLElement[] {
  if (!cloudEnabled()) return [];
  const box = h('div', { class: 'cloud-account', 'aria-live': 'polite' });
  const msg = h('p', { class: 'cloud-msg' });
  const fail = (e: unknown) => (msg.textContent = `로그인하지 못했다 — ${e instanceof Error ? e.message : String(e)}`);
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
            h('small', {}, `${user.email || '로그인됨'}${PROVIDER_NAME[user.provider] ? ` · ${PROVIDER_NAME[user.provider]}` : ''}`),
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
    const email = h('input', { type: 'email', class: 'cloud-email', placeholder: 'you@example.com', autocomplete: 'email', 'aria-label': '이메일' }) as HTMLInputElement;
    box.replaceChildren(
      h(
        'div',
        { class: 'set-row' },
        h(
          'span',
          { class: 'set-label' },
          h('span', { class: 'set-name' }, '계정 로그인'),
          h('small', {}, '로그인하면 저장이 계정에 올라가 다른 기기에서 이어 한다. 하지 않으면 이 브라우저에만 저장된다'),
        ),
      ),
      // 구글·카카오(켠 공급자만, cloud-config.ts)
      ...(CLOUD.providers.length
        ? [
            h(
              'div',
              { class: 'cloud-providers' },
              CLOUD.providers.map((p) => h('button', { class: `btn btn-small cloud-${p.id}`, type: 'button', onclick: () => signIn(p.id).catch(fail) }, p.label)),
            ),
          ]
        : []),
      h(
        'form',
        {
          class: 'cloud-email-row',
          onsubmit: (e: Event) => {
            e.preventDefault();
            const v = email.value.trim();
            if (!v) return;
            msg.textContent = '보내는 중…';
            signInEmail(v)
              .then(() => (msg.textContent = `${v}로 로그인 링크를 보냈다 — 이 브라우저에서 메일의 링크를 누른다`))
              .catch(fail);
          },
        },
        email,
        h('button', { class: 'btn btn-small', type: 'submit' }, '로그인 링크 받기'),
      ),
      h('p', { class: 'cloud-note' }, '지금 이 브라우저의 기록(게스트)은 지워지지 않는다 — 계정이 비어 있으면 그대로 올라가고, 계정에도 기록이 있으면 어느 쪽을 쓸지 묻는다.'),
      msg,
    );
  };
  const off = onCloudChange(draw);
  draw();
  return [box];
}

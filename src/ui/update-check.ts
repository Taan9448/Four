// 새 배포 알림(2026-10-09): GitHub Pages는 배포 때마다 예전 그림 파일을 지운다. 열어 둔 탭은 아직 받지 않은 그림을
// 옛 주소로 찾다 404가 나서 지도·여정 띠 그림이 사라진다. 지도에 설 때와 탭으로 돌아올 때 version.json을 보고,
// 빌드가 바뀌었으면 새로고침 단추를 띄운다(진행은 지도에서 자동 저장되므로 새로고침해도 이어진다).
import { h } from './dom';

declare const __BUILD_ID__: string;

let shown = false;
let last = 0;

export async function checkForUpdate(): Promise<void> {
  if (import.meta.env.DEV || shown || typeof fetch !== 'function') return;
  // 너무 자주 묻지 않는다(지도를 오갈 때마다가 아니라 1분에 한 번)
  if (Date.now() - last < 60_000) return;
  last = Date.now();
  try {
    const res = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const { id } = (await res.json()) as { id?: string };
    if (id && id !== __BUILD_ID__) showBanner();
  } catch {
    // 오프라인 등: 조용히 넘어간다
  }
}

function showBanner(): void {
  shown = true;
  document.body.append(
    h(
      'div',
      { class: 'update-banner', role: 'status' },
      h('span', {}, '게임이 새로 올라왔다. 새로고침하면 바뀐 그림을 받는다 — 진행은 지도에서 저장돼 있다.'),
      h('button', { class: 'btn btn-small btn-primary', onclick: () => location.reload() }, '새로고침'),
    ),
  );
}

export function watchForUpdate(): void {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void checkForUpdate();
  });
}

// 쉬는 중(2026-10-14 사용자 요청 — 게임을 켜 둔 채 다른 프로그램을 쓰면 렉): 창이 포커스를 잃거나 탭이 가려지면
// 장식 움직임(CSS 반복 애니메이션 · 캐릭터 대기 동작 · 시작 화면 입자)을 쉰다. 문서에 idle 클래스를 걸고 isIdle()로 알린다.
// 설정 '창을 떠나면 쉬기'(pauseUnfocused)를 끄면 쉬지 않는다.
let idle = false;
let enabled = true;

export function isIdle(): boolean {
  return idle;
}

function update(): void {
  idle = enabled && (document.hidden || !document.hasFocus());
  document.documentElement.classList.toggle('idle', idle);
}

export function initIdle(): void {
  addEventListener('blur', update);
  addEventListener('focus', update);
  document.addEventListener('visibilitychange', update);
  update();
}

export function setIdleEnabled(on: boolean): void {
  enabled = on;
  update();
}

// 디버그 옵션(왕일검 지원 토글 등)은 주소에 ?debug를 붙였을 때만 보인다(GAME_DESIGN 14절: 화면은 하운이 아는 것만).
// 시작하면 주소의 매개변수를 지우므로 이번 탭 동안 기억한다.
const KEY = 'cheonoe.debug';
/** ?pxcards: Codex 카드 틀이 오기 전에 임시 틀로 픽셀 카드를 미리 본다 */
const PX_KEY = 'cheonoe.pxcards';

export function initDebug(params: URLSearchParams): void {
  try {
    if (params.has('debug')) sessionStorage.setItem(KEY, '1');
    if (params.has('pxcards')) sessionStorage.setItem(PX_KEY, '1');
  } catch {
    /* 저장소를 못 쓰면 이번 화면에서만 */
  }
}

export function isDebug(): boolean {
  try {
    return sessionStorage.getItem(KEY) === '1' || new URLSearchParams(location.search).has('debug');
  } catch {
    return new URLSearchParams(location.search).has('debug');
  }
}

export function isPxCardsPreview(): boolean {
  try {
    return sessionStorage.getItem(PX_KEY) === '1' || new URLSearchParams(location.search).has('pxcards');
  } catch {
    return new URLSearchParams(location.search).has('pxcards');
  }
}

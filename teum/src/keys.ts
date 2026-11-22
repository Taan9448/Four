// 「틈」 키 설정(2026-11-22 사용자 "옵션에서 키 설정 기능 추가"): 동작마다 키 둘(주 · 보조). 옵션 「조작」에서 바꾸고 저장(teum.save options.keys).
// 판 위 동작(이동·보법·마지막 기술·멈춤)과 레벨업 창 동작(다시 뽑기·봉인·건너뛰기)은 따로 겹쳐도 된다(창이 떠 있을 때만 창 동작).

export type Action = 'up' | 'down' | 'left' | 'right' | 'dash' | 'ult' | 'pause' | 'reroll' | 'banish' | 'skip';
export type KeyMap = Record<Action, [string, string?]>;

export const ACTIONS: { id: Action; name: string; group: 'move' | 'skill' | 'menu' }[] = [
  { id: 'up', name: '위로', group: 'move' },
  { id: 'down', name: '아래로', group: 'move' },
  { id: 'left', name: '왼쪽으로', group: 'move' },
  { id: 'right', name: '오른쪽으로', group: 'move' },
  { id: 'dash', name: '보법(피하기)', group: 'skill' },
  { id: 'ult', name: '마지막 기술', group: 'skill' },
  { id: 'pause', name: '멈춤', group: 'skill' },
  { id: 'reroll', name: '레벨업 · 다시 뽑기', group: 'menu' },
  { id: 'banish', name: '레벨업 · 봉인', group: 'menu' },
  { id: 'skip', name: '레벨업 · 건너뛰기', group: 'menu' },
];

export const DEFAULT_KEYS: KeyMap = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  dash: ['Space', 'ShiftLeft'],
  ult: ['KeyQ', 'KeyE'],
  pause: ['Escape', 'KeyP'],
  reroll: ['KeyR'],
  banish: ['KeyB'],
  skip: ['KeyX'],
};

/** 저장된 키(빠진 동작은 기본) */
export function keyMap(saved?: Partial<KeyMap>): KeyMap {
  const out = { ...DEFAULT_KEYS };
  for (const a of ACTIONS) {
    const k = saved?.[a.id];
    if (k && k[0]) out[a.id] = [k[0], k[1]];
  }
  return out;
}

export const isKey = (map: KeyMap, action: Action, code: string): boolean => map[action][0] === code || map[action][1] === code;

const NAMES: Record<string, string> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Space: 'Space',
  ShiftLeft: '왼쪽 Shift',
  ShiftRight: '오른쪽 Shift',
  ControlLeft: '왼쪽 Ctrl',
  ControlRight: '오른쪽 Ctrl',
  AltLeft: '왼쪽 Alt',
  AltRight: '오른쪽 Alt',
  Escape: 'Esc',
  Enter: 'Enter',
  Tab: 'Tab',
  Backspace: '←지움',
  CapsLock: 'Caps',
};
/** 키 이름(화면에 보일 글자) */
export function keyLabel(code: string | undefined): string {
  if (!code) return '—';
  if (NAMES[code]) return NAMES[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `숫자판 ${code.slice(6)}`;
  return code;
}

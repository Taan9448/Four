// 키 바꾸기(2026-11-13 사용자 요청 "설정에서 키 바꾸는 기능"): 대결 입력마다 키 둘(주·보조)을 둔다.
// 물리 키(KeyboardEvent.code)로 맞춘다 — 한글 입력기가 켜져 있어도 J는 J다(e.key는 'ㅓ'가 된다).
// 글(안내·튜토리얼·팁)에 쓰인 {attack}·{parry} 같은 자리표는 지금 고른 키 이름으로 바꿔 보인다(keyText).

export type KeyAction = 'attack' | 'heavy' | 'parry' | 'dodge' | 'tech' | 'focus' | 'pause';
export type KeyMap = Record<KeyAction, [string, string]>;

/** 설정 창에 보이는 순서와 이름 */
export const KEY_ACTIONS: { id: KeyAction; name: string }[] = [
  { id: 'attack', name: '베기' },
  { id: 'heavy', name: '강베기' },
  { id: 'parry', name: '받기' },
  { id: 'dodge', name: '피하기' },
  { id: 'tech', name: '기술' },
  { id: 'focus', name: '집중' },
  { id: 'pause', name: '멈춤' },
];

export const defaultKeys = (): KeyMap => ({
  attack: ['KeyJ', ''],
  heavy: ['KeyH', ''],
  parry: ['KeyK', 'Space'],
  dodge: ['KeyL', 'ShiftLeft'],
  tech: ['KeyI', ''],
  focus: ['KeyU', ''],
  pause: ['KeyP', ''],
});

/** 바꿀 수 없는 키: Esc는 언제나 멈춤·닫기, Tab·Enter는 화면 이동에 쓴다 */
export const RESERVED = new Set(['Escape', 'Tab', 'Enter', 'NumpadEnter', 'MetaLeft', 'MetaRight', 'ContextMenu']);

/** 저장된 값을 지금 모양으로(모르는 칸·잘못된 값은 기본값) */
export function normalizeKeys(raw: unknown): KeyMap {
  const d = defaultKeys();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Partial<Record<KeyAction, unknown>>;
  const out = {} as KeyMap;
  const used = new Set<string>();
  for (const { id } of KEY_ACTIONS) {
    const v = r[id];
    const pair: [string, string] = Array.isArray(v) ? [String(v[0] ?? ''), String(v[1] ?? '')] : [...d[id]];
    // 같은 키가 두 입력에 겹치면 뒤의 것을 비운다, 바꿀 수 없는 키도 비운다
    const take = (k: string) => (!k || RESERVED.has(k) || used.has(sameSide(k)) ? '' : (used.add(sameSide(k)), k));
    out[id] = pair.map(take) as [string, string];
    if (!out[id][0] && !out[id][1]) out[id] = d[id].map(take) as [string, string];
  }
  return out;
}

/** 키 하나를 입력 칸(slot)에 둔다. 다른 입력이 쓰던 키면 그쪽에서 뺀다 */
export function bindKey(map: KeyMap, action: KeyAction, slot: 0 | 1, code: string): KeyMap {
  const next = Object.fromEntries(KEY_ACTIONS.map(({ id }) => [id, [...map[id]]])) as KeyMap;
  if (RESERVED.has(code)) return next;
  for (const { id } of KEY_ACTIONS) next[id] = next[id].map((k) => (k && sameSide(k) === sameSide(code) ? '' : k)) as [string, string];
  next[action][slot] = code;
  return next;
}

/** 누른 물리 키 → 대결 입력(없으면 null). 왼·오른 Shift·Ctrl·Alt는 같은 키로 본다 */
export function actionFor(map: KeyMap, code: string): KeyAction | null {
  const c = sameSide(code);
  for (const { id } of KEY_ACTIONS) if (map[id].some((k) => k && sameSide(k) === c)) return id;
  return null;
}

const sameSide = (code: string): string => code.replace(/(Left|Right)$/, '');

const NAMES: Record<string, string> = {
  Space: 'Space',
  ShiftLeft: 'Shift',
  ShiftRight: 'Shift',
  ControlLeft: 'Ctrl',
  ControlRight: 'Ctrl',
  AltLeft: 'Alt',
  AltRight: 'Alt',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Backspace: '⌫',
  CapsLock: 'Caps',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backslash: '\\',
  BracketLeft: '[',
  BracketRight: ']',
  Minus: '-',
  Equal: '=',
  Backquote: '`',
};

/** 물리 키 이름(KeyJ → J, Digit1 → 1, Numpad4 → 숫자판 4) */
export function keyLabel(code: string): string {
  if (!code) return '';
  if (NAMES[code]) return NAMES[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad\d$/.test(code)) return `숫자판 ${code.slice(6)}`;
  return code;
}

/** 입력의 키 이름들(주·보조, 빈 칸은 뺀다) */
export const keyNames = (map: KeyMap, action: KeyAction): string[] => map[action].filter(Boolean).map(keyLabel);

/** 안내 글의 {attack}·{parry}… 자리표를 지금 키 이름(주 키)으로 */
export function keyText(map: KeyMap, s: string): string {
  return s.replace(/\{(attack|heavy|parry|dodge|tech|focus|pause)\}/g, (_, a: KeyAction) => keyNames(map, a)[0] ?? '?');
}

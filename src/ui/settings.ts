// 설정: 전투 속도, 컷인, 화면 흔들림. 브라우저에 저장하고 화면 전체에 바로 적용한다.
import { h } from './dom';
import { readSettings, writeSettings } from './storage';

export interface Settings {
  /** 전투 연출 대기 시간 배율(1 보통, 작을수록 빠름) */
  speed: number;
  /** 영웅·전설 카드 컷인 */
  cutIn: boolean;
  /** 피격·폭주 때 화면 흔들림 */
  shake: boolean;
}

export const SPEEDS: { value: number; label: string }[] = [
  { value: 1, label: '보통' },
  { value: 0.6, label: '빠름' },
  { value: 0.35, label: '아주 빠름' },
];

const DEFAULTS: Settings = { speed: 1, cutIn: true, shake: true };

function load(): Settings {
  try {
    const raw = JSON.parse(readSettings() ?? '{}') as Partial<Settings>;
    return {
      speed: SPEEDS.some((s) => s.value === raw.speed) ? raw.speed! : DEFAULTS.speed,
      cutIn: typeof raw.cutIn === 'boolean' ? raw.cutIn : DEFAULTS.cutIn,
      shake: typeof raw.shake === 'boolean' ? raw.shake : DEFAULTS.shake,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export const settings: Settings = load();

/** 문서 전체에 걸리는 설정(흔들림 끄기 → CSS 클래스) */
export function applySettings(): void {
  document.documentElement.classList.toggle('no-shake', !settings.shake);
}

function update(patch: Partial<Settings>): void {
  Object.assign(settings, patch);
  writeSettings(JSON.stringify(settings));
  applySettings();
}

/** 설정 항목(오버레이 안에 넣는다) */
export function settingsForm(): HTMLElement {
  const speedGroup = h(
    'div',
    { class: 'setting-options', role: 'radiogroup', 'aria-label': '전투 속도' },
    SPEEDS.map((s) =>
      h(
        'label',
        { class: 'setting-option' },
        h('input', { type: 'radio', name: 'speed', checked: settings.speed === s.value, onchange: () => update({ speed: s.value }) }),
        ` ${s.label}`,
      ),
    ),
  );
  const toggle = (key: 'cutIn' | 'shake', label: string, hint: string) =>
    h(
      'label',
      { class: 'setting-row setting-toggle' },
      h('input', { type: 'checkbox', checked: settings[key], onchange: (e: Event) => update({ [key]: (e.target as HTMLInputElement).checked }) }),
      h('span', {}, label, h('small', {}, hint)),
    );
  return h(
    'div',
    { class: 'settings-form' },
    h('div', { class: 'setting-row' }, h('span', {}, '전투 속도', h('small', {}, '연출 사이의 기다림')), speedGroup),
    toggle('cutIn', '컷인 연출', '영웅·전설 카드를 쓸 때 반신 그림과 대사'),
    toggle('shake', '화면 흔들림', '끄면 피격·폭주 때 흔들리지 않는다'),
  );
}

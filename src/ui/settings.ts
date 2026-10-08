// 설정: 전투 속도, 컷인, 화면 흔들림. 브라우저에 저장하고 화면 전체에 바로 적용한다.
import { h } from './dom';
import { readSettings, writeSettings } from './storage';
import { resetTours } from './tour';
import { setShakeScale } from '../render/fx';

export interface Settings {
  /** 전투 연출 대기 시간 배율(1 보통, 작을수록 빠름) */
  speed: number;
  /** 영웅·전설 카드 컷인 */
  cutIn: boolean;
  /** 피격·폭주 때 화면 흔들림 세기(0 끄기 · 0.5 약하게 · 1 보통) */
  shake: number;
}

export const SPEEDS: { value: number; label: string }[] = [
  { value: 1, label: '보통' },
  { value: 0.6, label: '빠름' },
  { value: 0.35, label: '아주 빠름' },
];

export const SHAKES: { value: number; label: string }[] = [
  { value: 0, label: '끄기' },
  { value: 0.5, label: '약하게' },
  { value: 1, label: '보통' },
];

const DEFAULTS: Settings = { speed: 1, cutIn: true, shake: 1 };

/** 예전 설정(켜기/끄기)도 읽는다 */
function readShake(v: unknown): number {
  if (typeof v === 'boolean') return v ? 1 : 0;
  return SHAKES.some((s) => s.value === v) ? (v as number) : DEFAULTS.shake;
}

function load(): Settings {
  try {
    const raw = JSON.parse(readSettings() ?? '{}') as Partial<Settings>;
    return {
      speed: SPEEDS.some((s) => s.value === raw.speed) ? raw.speed! : DEFAULTS.speed,
      cutIn: typeof raw.cutIn === 'boolean' ? raw.cutIn : DEFAULTS.cutIn,
      shake: readShake(raw.shake),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export const settings: Settings = load();

/** 화면 전체에 걸리는 설정(흔들림 세기 → 연출 모듈) */
export function applySettings(): void {
  setShakeScale(settings.shake);
}

function update(patch: Partial<Settings>): void {
  Object.assign(settings, patch);
  writeSettings(JSON.stringify(settings));
  applySettings();
}

/** 설정 항목(오버레이 안에 넣는다) */
export function settingsForm(): HTMLElement {
  const radios = (key: 'speed' | 'shake', label: string, options: { value: number; label: string }[]) =>
    h(
      'div',
      { class: 'setting-options', role: 'radiogroup', 'aria-label': label },
      options.map((o) =>
        h(
          'label',
          { class: 'setting-option' },
          h('input', { type: 'radio', name: key, checked: settings[key] === o.value, onchange: () => update({ [key]: o.value }) }),
          ` ${o.label}`,
        ),
      ),
    );
  const toggle = (key: 'cutIn', label: string, hint: string) =>
    h(
      'label',
      { class: 'setting-row setting-toggle' },
      h('input', { type: 'checkbox', checked: settings[key], onchange: (e: Event) => update({ [key]: (e.target as HTMLInputElement).checked }) }),
      h('span', {}, label, h('small', {}, hint)),
    );
  return h(
    'div',
    { class: 'settings-form' },
    h('div', { class: 'setting-row' }, h('span', {}, '전투 속도', h('small', {}, '연출 사이의 기다림')), radios('speed', '전투 속도', SPEEDS)),
    toggle('cutIn', '컷인 연출', '영웅·전설 카드를 쓸 때 반신 그림과 대사'),
    h('div', { class: 'setting-row' }, h('span', {}, '화면 흔들림', h('small', {}, '피격·폭주 때 흔들리는 세기')), radios('shake', '화면 흔들림', SHAKES)),
    h(
      'div',
      { class: 'setting-row' },
      h('span', {}, '안내 다시 보기', h('small', {}, '전투 기본·속성 안내를 다음 전투에서 다시 띄운다')),
      h(
        'button',
        {
          class: 'btn btn-small',
          onclick: (e: Event) => {
            resetTours();
            (e.target as HTMLButtonElement).textContent = '다시 띄웁니다';
          },
        },
        '초기화',
      ),
    ),
  );
}

// 설정: 전투 속도, 컷인, 화면 흔들림, 소리 크기. 브라우저에 저장하고 화면 전체에 바로 적용한다.
import { h } from './dom';
import { readSettings, writeSettings } from './storage';
import { resetTours } from './tour';
import { setShakeScale } from '../render/fx';
import { setVolumes } from '../render/audio';

export interface Settings {
  /** 전투 연출 대기 시간 배율(1 보통, 작을수록 빠름) */
  speed: number;
  /** 영웅·전설 카드 컷인 */
  cutIn: boolean;
  /** 쓸 수 있는 카드가 남았는데 턴을 끝내려 하면 한 번 묻는다 */
  confirmEndTurn: boolean;
  /** 피격·폭주 때 화면 흔들림 세기(0 끄기 · 0.5 약하게 · 1 보통) */
  shake: number;
  /** 소리 크기 0~1: 전체 · 배경음악 · 효과음 */
  master: number;
  bgm: number;
  sfx: number;
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

const DEFAULTS: Settings = { speed: 1, cutIn: true, confirmEndTurn: true, shake: 1, master: 0.8, bgm: 0.6, sfx: 0.8 };

const volume = (v: unknown, d: number) => (typeof v === 'number' && v >= 0 && v <= 1 ? v : d);

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
      confirmEndTurn: typeof raw.confirmEndTurn === 'boolean' ? raw.confirmEndTurn : DEFAULTS.confirmEndTurn,
      shake: readShake(raw.shake),
      master: volume(raw.master, DEFAULTS.master),
      bgm: volume(raw.bgm, DEFAULTS.bgm),
      sfx: volume(raw.sfx, DEFAULTS.sfx),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export const settings: Settings = load();

/** 화면 전체에 걸리는 설정(흔들림 세기 → 연출 모듈, 소리 크기 → 소리 모듈) */
export function applySettings(): void {
  setShakeScale(settings.shake);
  setVolumes(settings);
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
  const toggle = (key: 'cutIn' | 'confirmEndTurn', label: string, hint: string) =>
    h(
      'label',
      { class: 'setting-row setting-toggle' },
      h('input', { type: 'checkbox', checked: settings[key], onchange: (e: Event) => update({ [key]: (e.target as HTMLInputElement).checked }) }),
      h('span', {}, label, h('small', {}, hint)),
    );
  const slider = (key: 'master' | 'bgm' | 'sfx', label: string, hint: string) => {
    const out = h('output', {}, `${Math.round(settings[key] * 100)}`);
    return h(
      'label',
      { class: 'setting-row setting-volume' },
      h('span', {}, label, h('small', {}, hint)),
      h('input', {
        type: 'range',
        min: 0,
        max: 100,
        step: 5,
        value: Math.round(settings[key] * 100),
        oninput: (e: Event) => {
          const v = Number((e.target as HTMLInputElement).value) / 100;
          out.textContent = String(Math.round(v * 100));
          update({ [key]: v });
        },
      }),
      out,
    );
  };
  return h(
    'div',
    { class: 'settings-form' },
    slider('master', '소리', '전체 크기(0이면 끔)'),
    slider('bgm', '배경음악', '장소·전투마다 바뀌는 곡'),
    slider('sfx', '효과음', '타격·카드·버튼 소리'),
    h('div', { class: 'setting-row' }, h('span', {}, '전투 속도', h('small', {}, '연출 사이의 기다림')), radios('speed', '전투 속도', SPEEDS)),
    toggle('cutIn', '컷인 연출', '영웅·전설 카드를 쓸 때 반신 그림과 대사'),
    toggle('confirmEndTurn', '턴 종료 확인', '쓸 수 있는 카드가 남았는데 턴을 끝내려 하면 한 번 묻는다'),
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

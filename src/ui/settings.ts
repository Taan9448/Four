// 설정: 전투 속도, 컷인, 화면 흔들림, 소리 크기. 브라우저에 저장하고 화면 전체에 바로 적용한다.
import { h } from './dom';
import { readSettings, writeSettings } from './storage';
import { resetTour, resetTours, TOUR_LIST, tourSeen } from './tour';
import { applyBackup, backupFileName, browserKV, exportBackup, hasUndo, parseBackup, previewBackup, undoImport } from './backup';
import { gameData } from '../engine/data';
import { SLOT_COUNT } from './storage';

declare const __BUILD_ID__: string;
/** 빌드 표시(앞 7자) — 설정 맨 아래·시작 화면 구석 */
export const BUILD_SHORT = (typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev').slice(0, 7);
import { openOverlay } from './overlay';
import { setShakeScale } from '../render/fx';
import { setVolumes } from '../render/audio';

export interface Settings {
  /** 전투 연출 대기 시간 배율(1 보통, 작을수록 빠름) */
  speed: number;
  /** 영웅·전설 카드 컷인 */
  cutIn: boolean;
  /** 화면 연출: 시작 화면 움직임 · 영웅·전설 카드의 빛(2026-10-11). 끄면 문서에 no-motion */
  motion: boolean;
  /** 쓸 수 있는 카드가 남았는데 턴을 끝내려 하면 한 번 묻는다 */
  confirmEndTurn: boolean;
  /** 피격·폭주 때 화면 흔들림 세기(0 끄기 · 0.5 약하게 · 1 보통) */
  shake: number;
  /** 소리 크기 0~1: 전체 · 배경음악 · 효과음 */
  master: number;
  bgm: number;
  sfx: number;
  /** 글자 크기(2026-10-11 UI/UX 4-2): 1 보통(100%) · 1.12 크게(112%, html font-size). 기본 보통 */
  fontScale: number;
  /** 둥근 표식(抽·棄·滅·冊·記·設) 아래에 작은 글자(뽑을·버림…)를 함께 */
  glyphLabels: boolean;
  /** 색각 보정: 등급 보석에 모양(◇ △ ○ ☆ ✦), 상태 이름표에 ▲ 이로움 · ▼ 해로움 · ◆ 특성 */
  colorAssist: boolean;
  /** 장면 글자 속도(2026-10-12 B3): 1 지금 · 2 두 배 · 3 즉시 */
  textSpeed: 1 | 2 | 3;
  /** 장면 자동 진행: 한 줄이 다 나온 뒤 (글자 수 × 40ms + 600ms, 최소 1.2초) 뒤 다음 줄. 선택지에서 멈춘다 */
  autoAdvance: boolean;
  /** 이미 본 장면은 자동으로 건너뛴다(이 브라우저에서 처음 보는 장면은 절대 건너뛰지 않는다) */
  skipSeenScenes: boolean;
  /** 대상 없는 물약은 두 번 눌러야 쓴다(2026-10-12 B4) */
  confirmPotion: boolean;
}

export const TEXT_SPEEDS: { value: number; label: string }[] = [
  { value: 1, label: '보통' },
  { value: 2, label: '2배' },
  { value: 3, label: '즉시' },
];

export const SPEEDS: { value: number; label: string }[] = [
  { value: 1, label: '보통' },
  { value: 0.6, label: '빠름' },
  { value: 0.35, label: '아주 빠름' },
];

export const FONT_SCALES: { value: number; label: string }[] = [
  { value: 1, label: '보통' },
  { value: 1.12, label: '크게' },
];

export const SHAKES: { value: number; label: string }[] = [
  { value: 0, label: '끄기' },
  { value: 0.5, label: '약하게' },
  { value: 1, label: '보통' },
];

const DEFAULTS: Settings = { speed: 1, cutIn: true, motion: true, confirmEndTurn: true, shake: 1, master: 0.8, bgm: 0.6, sfx: 0.8, fontScale: 1, glyphLabels: false, colorAssist: false, textSpeed: 1, autoAdvance: false, skipSeenScenes: false, confirmPotion: true };

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
      motion: typeof raw.motion === 'boolean' ? raw.motion : DEFAULTS.motion,
      confirmEndTurn: typeof raw.confirmEndTurn === 'boolean' ? raw.confirmEndTurn : DEFAULTS.confirmEndTurn,
      shake: readShake(raw.shake),
      master: volume(raw.master, DEFAULTS.master),
      bgm: volume(raw.bgm, DEFAULTS.bgm),
      sfx: volume(raw.sfx, DEFAULTS.sfx),
      fontScale: FONT_SCALES.some((f) => f.value === raw.fontScale) ? raw.fontScale! : DEFAULTS.fontScale,
      glyphLabels: typeof raw.glyphLabels === 'boolean' ? raw.glyphLabels : DEFAULTS.glyphLabels,
      colorAssist: typeof raw.colorAssist === 'boolean' ? raw.colorAssist : DEFAULTS.colorAssist,
      textSpeed: raw.textSpeed === 2 || raw.textSpeed === 3 ? raw.textSpeed : DEFAULTS.textSpeed,
      autoAdvance: typeof raw.autoAdvance === 'boolean' ? raw.autoAdvance : DEFAULTS.autoAdvance,
      skipSeenScenes: typeof raw.skipSeenScenes === 'boolean' ? raw.skipSeenScenes : DEFAULTS.skipSeenScenes,
      confirmPotion: typeof raw.confirmPotion === 'boolean' ? raw.confirmPotion : DEFAULTS.confirmPotion,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export const settings: Settings = load();

/** 단축키 안내 창(2026-10-11 UI/UX 4-2) */
export function openShortcuts(): void {
  const rows: [string, string][] = [
    ['1 ~ 0', '손패의 n번째 카드 고르기(0 = 10번째)'],
    ['Tab · ← →', '적·아군 대상 바꾸기 / 손패 카드·버튼 옮겨 다니기'],
    ['Enter · Space', '고른 카드 내기 · 대상 정하기 · 단추 누르기'],
    ['E', '턴 종료'],
    ['Esc', '고르기 취소 · 창 닫기'],
    ['D', '이번 전투의 카드 창 열기 · 닫기'],
    ['드래그', '카드를 끌어 적이나 아군에 놓기'],
  ];
  openOverlay('단축키', h('dl', { class: 'shortcut-list' }, rows.flatMap(([k, v]) => [h('dt', {}, h('kbd', {}, k)), h('dd', {}, v)])));
}

/** 화면 전체에 걸리는 설정(흔들림 세기 → 연출 모듈, 소리 크기 → 소리 모듈, 화면 연출 → 문서 no-motion) */
export function applySettings(): void {
  setShakeScale(settings.shake);
  const root = document.documentElement;
  root.classList.toggle('no-motion', !settings.motion);
  root.classList.toggle('glyph-labels', settings.glyphLabels);
  root.classList.toggle('color-assist', settings.colorAssist);
  root.style.fontSize = settings.fontScale === 1 ? '' : `${settings.fontScale * 100}%`;
  setVolumes(settings);
}

export function update(patch: Partial<Settings>): void {
  Object.assign(settings, patch);
  writeSettings(JSON.stringify(settings));
  applySettings();
}

/** 설정 항목(오버레이 안에 넣는다) */
export function settingsForm(opts: { onGlossary?: () => void } = {}): HTMLElement {
  const radios = (key: 'speed' | 'shake' | 'fontScale' | 'textSpeed', label: string, options: { value: number; label: string }[]) =>
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
  const toggle = (key: 'cutIn' | 'motion' | 'confirmEndTurn' | 'glyphLabels' | 'colorAssist' | 'autoAdvance' | 'skipSeenScenes' | 'confirmPotion', label: string, hint: string) =>
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
    toggle('motion', '화면 연출', '시작 화면의 빛·안개·꽃잎, 영웅·전설 카드의 빛'),
    h(
      'div',
      { class: 'setting-pair' },
      toggle('confirmEndTurn', '턴 종료 확인', '쓸 수 있는 카드가 남았는데 턴을 끝내려 하면 한 번 묻는다'),
      toggle('confirmPotion', '물약 확인', '물약을 한 번 더 눌러야 쓴다(대상을 고르는 물약은 그대로)'),
    ),
    h('div', { class: 'setting-row' }, h('span', {}, '화면 흔들림', h('small', {}, '피격·폭주 때 흔들리는 세기')), radios('shake', '화면 흔들림', SHAKES)),
    h('div', { class: 'setting-row' }, h('span', {}, '글자 크기', h('small', {}, '화면 전체 글자(크게 = 112%)')), radios('fontScale', '글자 크기', FONT_SCALES)),
    h('div', { class: 'setting-row' }, h('span', {}, '장면 글자 속도', h('small', {}, '대사가 찍히는 빠르기(즉시 = 한 번에)')), radios('textSpeed', '장면 글자 속도', TEXT_SPEEDS)),
    toggle('autoAdvance', '장면 자동 진행', '한 줄이 다 나오면 잠시 뒤 다음 줄로. 화면을 누르면 멈춘다. 선택지에서는 기다린다'),
    toggle('skipSeenScenes', '본 장면 건너뛰기', '이 브라우저에서 이미 본 장면만 자동으로 넘긴다(처음 보는 장면은 늘 보여 준다)'),
    toggle('glyphLabels', '표식에 글자 함께', '전투의 한자 표식(抽·棄·滅·冊·記·設) 아래에 뽑을·버림·소멸·덱·기록·설정'),
    toggle('colorAssist', '색각 보정', '등급 보석에 모양(일반 ◇ 고급 △ 희귀 ○ 영웅 ☆ 전설 ✦), 상태에 ▲ 이로움 · ▼ 해로움 · ◆ 특성'),
    h(
      'div',
      { class: 'setting-row' },
      h('span', {}, '단축키', h('small', {}, '전투의 키보드 조작')),
      h('button', { class: 'btn btn-small', onclick: () => openShortcuts() }, '단축키 안내'),
    ),
    tourRows(),
    opts.onGlossary
      ? h(
          'div',
          { class: 'setting-row' },
          h('span', {}, '용어', h('small', {}, '내공·마나·균열·상흔·편성 점수… 도감의 용어 표')),
          h('button', { class: 'btn btn-small', onclick: () => opts.onGlossary!() }, '용어 보기'),
        )
      : null,
    saveRows(),
    h(
      'p',
      { class: 'setting-foot' },
      h('span', {}, `빌드 ${BUILD_SHORT}`),
      ' · 저장: 지도에 설 때마다 자동. 전투·이벤트 도중 새로고침하면 그 직전 지도에서 이어진다.',
    ),
  );
}

/** 안내 다시 보기(2026-10-12 B5): 모두 비우기 + 하나씩 되돌리기 */
function tourRows(): HTMLElement {
  const list = h('ul', { class: 'tour-reset-list' });
  const draw = () =>
    list.replaceChildren(
      ...TOUR_LIST.map((t) => {
        const seen = tourSeen(t.id);
        return h(
          'li',
          {},
          h('span', {}, t.label),
          h(
            'button',
            { class: 'btn btn-small', disabled: !seen, onclick: () => (resetTour(t.id), draw()) },
            seen ? '다시 보기' : '다음에 나온다',
          ),
        );
      }),
    );
  draw();
  const note = h('small', { class: 'setting-note', role: 'status' });
  return h(
    'div',
    { class: 'setting-block' },
    h(
      'div',
      { class: 'setting-row' },
      h('span', {}, '안내 다시 보기', h('small', {}, '본 안내를 지우면 다음에 그 화면에 들어갈 때 다시 나온다')),
      h(
        'button',
        {
          class: 'btn btn-small',
          onclick: () => {
            resetTours();
            draw();
            note.textContent = '다음에 해당 화면에 들어가면 안내가 다시 나온다.';
          },
        },
        '모두 다시',
      ),
    ),
    note,
    list,
  );
}

const when = (t: number) => (t ? new Date(t).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

/** 저장 내보내기·가져오기·되돌리기(2026-10-12 B1) */
function saveRows(): HTMLElement {
  const kv = browserKV();
  const box = h('div', { class: 'backup-box', 'aria-live': 'polite' });
  const exportBtn = h(
    'button',
    {
      class: 'btn btn-small',
      onclick: () => {
        const now = new Date();
        const blob = new Blob([JSON.stringify(exportBackup(kv, now), null, 1)], { type: 'application/json' });
        const a = h('a', { href: URL.createObjectURL(blob), download: backupFileName(now) }) as HTMLAnchorElement;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => (URL.revokeObjectURL(a.href), a.remove()), 1000);
      },
    },
    '저장 내보내기',
  );
  const input = h('input', { type: 'file', accept: '.json,application/json', class: 'visually-hidden', 'aria-label': '저장 파일 고르기' }) as HTMLInputElement;
  input.addEventListener('change', async () => {
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    const parsed = parseBackup(await f.text());
    if (!parsed.ok) return box.replaceChildren(h('p', { class: 'backup-error' }, `가져올 수 없다 — ${parsed.reason}`));
    const p = previewBackup(gameData(), parsed.file, SLOT_COUNT);
    box.replaceChildren(
      h('p', {}, h('b', {}, f.name), ` · 저장 버전 ${parsed.file.version} · 키 ${p.keys}개`),
      h(
        'ul',
        { class: 'backup-slots' },
        p.slots.map((x) => h('li', {}, `${x.slot}번 칸 — ${x.stage ? `${x.stage} · 상흔 ${x.scar} · ${when(x.savedAt)}` : '비어 있음'}`)),
      ),
      h('p', {}, `도감 ${p.codex.seen} / ${p.codex.total}칸`),
      h(
        'div',
        { class: 'backup-actions' },
        h('button', { class: 'btn btn-small', onclick: () => box.replaceChildren() }, '그만두기'),
        h(
          'button',
          {
            class: 'btn btn-small btn-danger',
            onclick: () => {
              applyBackup(kv, parsed.file);
              location.reload();
            },
          },
          '지금 저장을 모두 덮어쓴다',
        ),
      ),
    );
  });
  const undoBtn = hasUndo(kv)
    ? h(
        'button',
        {
          class: 'btn btn-small',
          onclick: () => {
            if (undoImport(kv)) location.reload();
          },
        },
        '직전 가져오기 되돌리기',
      )
    : null;
  return h(
    'div',
    { class: 'setting-block' },
    h(
      'div',
      { class: 'setting-row' },
      h('span', {}, '저장 백업', h('small', {}, '저장 칸·설정·도감·기록을 파일 하나로. 가져오기 전 지금 상태를 한 벌 남긴다')),
      h('span', { class: 'setting-buttons' }, exportBtn, h('button', { class: 'btn btn-small', onclick: () => input.click() }, '저장 가져오기'), undoBtn, input),
    ),
    box,
  );
}

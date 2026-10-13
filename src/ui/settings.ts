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
  /** 균열 폭주 때 화면 전체 그림(2026-10-13). 끄면 짧은 띠만 */
  surgeArt: boolean;
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

const DEFAULTS: Settings = { speed: 1, cutIn: true, surgeArt: true, motion: true, confirmEndTurn: true, shake: 1, master: 0.8, bgm: 0.6, sfx: 0.8, fontScale: 1, glyphLabels: false, colorAssist: false, textSpeed: 1, autoAdvance: false, skipSeenScenes: false, confirmPotion: true };

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
      surgeArt: typeof raw.surgeArt === 'boolean' ? raw.surgeArt : DEFAULTS.surgeArt,
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

/** 설정 탭(2026-10-13 사용자 확정 목업): 항목 20줄을 한 목록에 늘어놓던 것을 여섯 묶음으로 나눈다 */
export type SettingsTab = 'sound' | 'battle' | 'view' | 'scene' | 'help' | 'save';

export const SETTINGS_TABS: { id: SettingsTab; seal: string; label: string; desc: string; lead: string; keys: (keyof Settings)[] }[] = [
  { id: 'sound', seal: '聲', label: '소리', desc: '크기 세 가지', lead: '배경음악과 효과음을 따로 조절한다.', keys: ['master', 'bgm', 'sfx'] },
  { id: 'battle', seal: '戰', label: '전투', desc: '속도·연출·확인', lead: '전투 화면에서만 쓰이는 설정.', keys: ['speed', 'shake', 'cutIn', 'surgeArt', 'confirmEndTurn', 'confirmPotion'] },
  { id: 'view', seal: '畵', label: '화면', desc: '글자·움직임·보조', lead: '글자 크기와 화면 움직임, 읽기를 돕는 표시.', keys: ['fontScale', 'motion', 'glyphLabels', 'colorAssist'] },
  { id: 'scene', seal: '幕', label: '장면', desc: '대사 속도·진행', lead: '이야기 장면의 대사가 넘어가는 방식.', keys: ['textSpeed', 'autoAdvance', 'skipSeenScenes'] },
  { id: 'help', seal: '助', label: '도움말', desc: '안내·단축키·용어', lead: '처음 안내를 다시 보거나, 조작·용어를 찾아본다.', keys: [] },
  { id: 'save', seal: '存', label: '저장', desc: '백업·가져오기', lead: '저장은 지도에 설 때마다 자동으로 된다. 전투·이벤트 도중 새로고침하면 그 직전 지도에서 이어진다.', keys: [] },
];

/** 마지막으로 본 탭(이번 접속 동안 기억). 전투 메뉴는 늘 「전투」로 연다 */
let lastTab: SettingsTab = 'sound';

/** 한 탭의 설정을 기본값으로 */
export function resetTab(tab: SettingsTab): void {
  const keys = SETTINGS_TABS.find((t) => t.id === tab)?.keys ?? [];
  update(Object.fromEntries(keys.map((k) => [k, DEFAULTS[k]])) as Partial<Settings>);
}

let uid = 0;

/** 설정 창 내용(오버레이 안에 넣는다): 왼쪽(휴대폰은 위) 탭 + 오른쪽 항목 + 바닥줄 */
export function settingsForm(opts: { onGlossary?: () => void; tab?: SettingsTab } = {}): HTMLElement {
  const id = `settings-${++uid}`;
  let cur: SettingsTab = opts.tab ?? lastTab;
  const panel = h('div', { class: 'settings-panel', role: 'tabpanel', id: `${id}-panel`, tabindex: '-1' });
  const resetBtn = h('button', { class: 'btn btn-small', type: 'button', onclick: () => (resetTab(cur), show(cur)) }, '이 탭 기본값으로');
  const tabs = SETTINGS_TABS.map((t, i) =>
    h(
      'button',
      {
        class: 'settings-tab',
        type: 'button',
        role: 'tab',
        id: `${id}-tab-${t.id}`,
        'aria-controls': `${id}-panel`,
        onclick: () => show(t.id),
        onkeydown: (ev: Event) => {
          const e = ev as KeyboardEvent;
          const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
          if (!step) return;
          e.preventDefault();
          const next = SETTINGS_TABS[(i + step + SETTINGS_TABS.length) % SETTINGS_TABS.length].id;
          show(next);
          tabs[SETTINGS_TABS.findIndex((x) => x.id === next)].focus();
        },
      },
      h('span', { class: 'settings-seal', 'aria-hidden': 'true' }, t.seal),
      h('span', { class: 'settings-tab-text' }, h('b', {}, t.label), h('small', {}, t.desc)),
    ),
  );
  const show = (tab: SettingsTab) => {
    cur = tab;
    if (!opts.tab) lastTab = tab;
    const info = SETTINGS_TABS.find((t) => t.id === tab)!;
    tabs.forEach((b, i) => {
      const on = SETTINGS_TABS[i].id === tab;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
    });
    panel.setAttribute('aria-labelledby', `${id}-tab-${tab}`);
    resetBtn.hidden = info.keys.length === 0;
    panel.replaceChildren(h('p', { class: 'settings-lead' }, info.lead), ...tabRows(tab, opts).filter((x): x is HTMLElement => !!x));
  };
  show(cur);
  return h(
    'div',
    { class: 'settings' },
    h('div', { class: 'settings-tabs', role: 'tablist', 'aria-label': '설정 분류', 'aria-orientation': 'vertical' }, tabs),
    panel,
    h('div', { class: 'settings-foot' }, h('span', {}, `빌드 ${BUILD_SHORT}`, h('span', { class: 'settings-foot-note' }, ' · 바꾼 값은 바로 적용·저장된다')), resetBtn),
  );
}

/** 이름(+ 한 줄 설명) | 조작 한 줄 */
function row(name: string, hint: string, control: HTMLElement | HTMLElement[], tag: 'div' | 'label' = 'div'): HTMLElement {
  return h(tag, { class: 'set-row' }, h('span', { class: 'set-label' }, h('span', { class: 'set-name' }, name), hint ? h('small', {}, hint) : null), control);
}

const head = (text: string) => h('h3', { class: 'set-head' }, text);

/** 여러 개 중 하나: 한 칸에 붙은 선택 버튼(속은 진짜 라디오라 화살표 키가 그대로 된다) */
function seg(key: 'speed' | 'shake' | 'fontScale' | 'textSpeed', name: string, hint: string, options: { value: number; label: string }[]): HTMLElement {
  const group = `set-${key}-${++uid}`;
  return row(
    name,
    hint,
    h(
      'span',
      { class: 'set-seg', role: 'radiogroup', 'aria-label': name },
      options.map((o) =>
        h(
          'label',
          { class: 'set-seg-opt' },
          h('input', { type: 'radio', name: group, class: 'visually-hidden', checked: settings[key] === o.value, onchange: () => update({ [key]: o.value }) }),
          h('span', {}, o.label),
        ),
      ),
    ),
  );
}

/** 켜고 끄기: 줄 전체가 스위치(속은 role=switch 체크박스) */
function toggle(key: 'cutIn' | 'surgeArt' | 'motion' | 'confirmEndTurn' | 'glyphLabels' | 'colorAssist' | 'autoAdvance' | 'skipSeenScenes' | 'confirmPotion', name: string, hint: string): HTMLElement {
  return row(
    name,
    hint,
    [
      h('input', { type: 'checkbox', role: 'switch', class: 'visually-hidden', checked: settings[key], onchange: (e: Event) => update({ [key]: (e.target as HTMLInputElement).checked }) }),
      h('span', { class: 'set-switch', 'aria-hidden': 'true' }),
    ],
    'label',
  );
}

function slider(key: 'master' | 'bgm' | 'sfx', name: string, hint: string): HTMLElement {
  const inputId = `set-${key}-${++uid}`;
  const out = h('output', { for: inputId }, `${Math.round(settings[key] * 100)}`);
  const r = row(
    name,
    hint,
    h(
      'span',
      { class: 'set-volume' },
      h('input', {
        id: inputId,
        type: 'range',
        min: 0,
        max: 100,
        step: 5,
        'aria-label': name,
        value: Math.round(settings[key] * 100),
        oninput: (e: Event) => {
          const v = Number((e.target as HTMLInputElement).value) / 100;
          out.textContent = String(Math.round(v * 100));
          update({ [key]: v });
        },
      }),
      out,
    ),
  );
  r.classList.add('set-row-volume');
  return r;
}

function action(name: string, hint: string, ...buttons: (HTMLElement | null)[]): HTMLElement {
  return row(name, hint, h('span', { class: 'set-actions' }, buttons));
}

function tabRows(tab: SettingsTab, opts: { onGlossary?: () => void }): (HTMLElement | null)[] {
  switch (tab) {
    case 'sound':
      return [slider('master', '전체 소리', '0이면 모든 소리가 꺼진다'), slider('bgm', '배경음악', ''), slider('sfx', '효과음', '')];
    case 'battle':
      return [
        seg('speed', '전투 속도', '연출 사이 기다림', SPEEDS),
        seg('shake', '화면 흔들림', '피격·폭주 때', SHAKES),
        toggle('cutIn', '컷인 연출', '영웅·전설 카드의 반신 그림과 대사'),
        toggle('surgeArt', '폭주 그림', '균열 폭주 때 그림 · 누르면 바로 넘어간다'),
        head('실수 막기'),
        toggle('confirmEndTurn', '턴 종료 전에 묻기', '쓸 수 있는 카드가 남았을 때만'),
        toggle('confirmPotion', '물약은 두 번 눌러 쓰기', '대상을 고르는 물약은 그대로'),
      ];
    case 'view':
      return [
        seg('fontScale', '글자 크기', '크게 = 112%', FONT_SCALES),
        toggle('motion', '배경 움직임', '시작 화면의 빛·안개, 영웅·전설 카드의 빛'),
        head('읽기 보조'),
        toggle('glyphLabels', '표식에 한글 함께', '抽 뽑을 · 棄 버림 · 滅 소멸 · 冊 덱 · 記 기록 · 設 설정'),
        toggle('colorAssist', '색각 보정', '등급 보석에 ◇△○☆✦, 상태에 ▲이로움 ▼해로움 ◆특성'),
      ];
    case 'scene':
      return [
        seg('textSpeed', '대사 속도', '', TEXT_SPEEDS),
        toggle('autoAdvance', '자동 진행', '한 줄이 끝나면 다음 줄로 · 누르면 멈춤 · 선택지에선 기다림'),
        toggle('skipSeenScenes', '본 장면 건너뛰기', '처음 보는 장면은 늘 보여 준다'),
      ];
    case 'help':
      return [
        ...tourRows(),
        head('찾아보기'),
        action('단축키', '전투의 키보드 조작', h('button', { class: 'btn btn-small', type: 'button', onclick: () => openShortcuts() }, '단축키 보기')),
        opts.onGlossary
          ? action('용어 사전', '내공·마나·균열·상흔·편성 점수…', h('button', { class: 'btn btn-small', type: 'button', onclick: () => opts.onGlossary!() }, '도감에서 열기'))
          : null,
      ];
    case 'save':
      return saveRows();
  }
}

/** 안내 다시 보기(2026-10-12 B5): 모두 비우기 + 하나씩 되돌리기(목록은 접어 둔다) */
function tourRows(): HTMLElement[] {
  const note = h('small', { class: 'setting-note', role: 'status' });
  const list = h('ul', { class: 'tour-reset-list' });
  const count = h('small', {});
  const allBtn = h(
    'button',
    {
      class: 'btn btn-small',
      type: 'button',
      onclick: () => {
        resetTours();
        draw();
        note.textContent = '다음에 해당 화면에 들어가면 안내가 다시 나온다.';
      },
    },
    '모두 다시 보기',
  ) as HTMLButtonElement;
  const draw = () => {
    const seen = TOUR_LIST.filter((t) => tourSeen(t.id)).length;
    count.textContent = `본 안내 ${seen} / ${TOUR_LIST.length} · 지우면 다음에 그 화면에서 다시 나온다`;
    allBtn.disabled = seen === 0;
    list.replaceChildren(
      ...TOUR_LIST.map((t) => {
        const on = tourSeen(t.id);
        return h(
          'li',
          {},
          h('span', {}, t.label),
          h('button', { class: 'btn btn-small', type: 'button', disabled: !on, onclick: () => (resetTour(t.id), draw()) }, on ? '다시 보기' : '아직 안 봄'),
        );
      }),
    );
  };
  draw();
  return [
    h('div', { class: 'set-row' }, h('span', { class: 'set-label' }, h('span', { class: 'set-name' }, '안내 다시 보기'), count), h('span', { class: 'set-actions' }, allBtn)),
    note,
    h('details', { class: 'set-details' }, h('summary', {}, '하나씩 고르기'), list),
  ];
}

const when = (t: number) => (t ? new Date(t).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

/** 저장 내보내기·가져오기·되돌리기(2026-10-12 B1) */
function saveRows(): HTMLElement[] {
  const kv = browserKV();
  const box = h('div', { class: 'backup-box', 'aria-live': 'polite' });
  const exportBtn = h(
    'button',
    {
      class: 'btn btn-small',
      type: 'button',
      onclick: () => {
        const now = new Date();
        const blob = new Blob([JSON.stringify(exportBackup(kv, now), null, 1)], { type: 'application/json' });
        const a = h('a', { href: URL.createObjectURL(blob), download: backupFileName(now) }) as HTMLAnchorElement;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => (URL.revokeObjectURL(a.href), a.remove()), 1000);
      },
    },
    '내보내기',
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
        h('button', { class: 'btn btn-small', type: 'button', onclick: () => box.replaceChildren() }, '그만두기'),
        h(
          'button',
          {
            class: 'btn btn-small btn-danger',
            type: 'button',
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
  const undo = hasUndo(kv);
  return [
    action('저장 내보내기', '저장 칸·설정·도감·기록을 파일 하나로', exportBtn),
    action('저장 가져오기', '덮어쓰기 전에 지금 상태를 한 벌 남긴다', h('button', { class: 'btn btn-small', type: 'button', onclick: () => input.click() }, '파일 고르기…'), input),
    box,
    action(
      '직전 가져오기 되돌리기',
      undo ? '가져오기 바로 전 상태로' : '가져온 적이 없어 되돌릴 것이 없다',
      h('button', { class: 'btn btn-small', type: 'button', disabled: !undo, onclick: () => undoImport(kv) && location.reload() }, '되돌리기'),
    ),
  ];
}

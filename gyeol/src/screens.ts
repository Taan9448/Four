// 「결」 대결 밖의 화면(2026-11-10 2단계, 설계 7-3절): 시작 · 로비(운곡루 뒤뜰) · 결투장 · 박자 도전 · 수련장 · 박자 맞추기 · 기록.
// PC 위주(2026-11-10 사용자 요청). 휴대폰에서는 한 줄로 쌓여 보인다.
import { frameUrl } from '../../src/render/assets';
import { sfx } from '../../src/render/audio';
import lobbyRaw from '../data/lobby.json';
import { accountState, loginPanel, playerPlate } from './account';
import { onCloudChange } from './cloud';
import { lobbyStage } from './lobby-fx';
import { condMet, condText, newAchievements, progress, starTotal } from './progress';
import { button, el, ELEMENT_NAME, elementsOf, rankBadge, realArt, toast } from './dom';
import type { Duel, DuelData, DuelOptions, FoeDef, Mode, TechDef } from './duel';
import type { TutorialStep } from './story';
import { calibrationOffset } from './calibrate';
import { characterOf, characters, chosen, faceId, faceStyle, joined, partyOpen, recordKey } from './party';
import { emptyStats, loadSave, withKeys, writeSave } from './save';
import { actionFor, keyNames } from './keys';

export type Screen = 'title' | 'lobby' | 'story' | 'arena' | 'rhythm' | 'practice' | 'records' | 'wardrobe' | 'calibrate';

export interface PlayOpts {
  difficulty?: string;
  drill?: string;
  /** 대결이 끝나거나 나가면 돌아갈 화면 */
  back: Screen;
  /** 이야기: 대결 덧붙임(버티기·쓸 수 있는 기술 등), 결과 머리글, 이기면 누를 다음 버튼, 처음 나오는 순간 안내 */
  duel?: DuelOptions;
  title?: string;
  next?: { label: string; go: (d: Duel) => void };
  tips?: string[];
  /** 서장 튜토리얼 단계와 끝났을 때(건너뛰었으면 skipped) */
  tutorial?: TutorialStep[];
  onTutorialDone?: (skipped: boolean) => void;
  /** 고른 인물(duel.json characters, 없으면 진하운) */
  character?: string;
}

export interface Nav {
  go(s: Screen): void;
  play(foe: FoeDef, mode: Mode, opts: PlayOpts): void;
  settings(): void;
  /** 대결 고리·키를 멈춘다(화면을 바꾸지 않고) */
  stop(): void;
}

interface LobbyData {
  menu: { id: string; name: string; note: string; locked?: string }[];
  /** 오른쪽 아래 둥근 표식(옷장·도감·설정·「천외귀환」 바로가기) */
  corner: { id: string; name: string; note: string }[];
}
const lobby = lobbyRaw as LobbyData;

/** 키보드: 화면마다 하나만 붙이고, 화면을 떠나면 뗀다 */
let keyHandler: ((e: KeyboardEvent) => void) | null = null;
export function setKeys(fn: ((e: KeyboardEvent) => void) | null): void {
  if (keyHandler) window.removeEventListener('keydown', keyHandler);
  keyHandler = fn;
  if (fn) window.addEventListener('keydown', fn);
}

const duelFoes = (data: DuelData) => data.foes.filter((f) => !f.practice);
/** 결투장 상대: 처음부터 있던 다섯(악보가 있는 상대) + 이야기에서 겨뤄 본 상대(이야기 전용 빼고) */
const arenaFoes = (data: DuelData, seen: string[]) => duelFoes(data).filter((f) => !f.storyOnly && (f.starter || seen.includes(f.id)));

/**
 * 인물 고르기(2026-11-11 사용자 요청 — 동료와 합류하면 인물을 골라 들어간다): 얼굴 · 이름 · 특성. 합류 전 동료는 잠김.
 * 고르면 저장(save.character)하고 onPick으로 화면을 다시 그린다. 합류한 동료가 없으면 아무것도 그리지 않는다
 */
export function charPicker(data: DuelData, onPick: () => void, compact = false): HTMLElement | '' {
  const save = loadSave();
  const cleared = save.story.cleared;
  if (!partyOpen(data, cleared)) return '';
  const now = chosen(data, save.character, cleared);
  const cards = characters(data).map((c) => {
    const open = joined(c, cleared);
    const face = realArt(c.stand) ?? (c.fallbackStand ? frameUrl(c.fallbackStand, 1) : null);
    const b = button(
      [
        el('span', { class: 'cp-face', style: faceStyle(c, face, realArt(faceId(c.id))) }),
        el('span', { class: 'cp-text' }, el('b', {}, c.name), el('small', { class: 'cp-trait' }, open ? c.trait : '합류 전')),
      ],
      `cp-card${c.id === now ? ' on' : ''}${open ? '' : ' locked'}`,
      () => {
        const s = loadSave();
        s.character = c.id;
        writeSave(s);
        onPick();
      },
      { ...(open ? {} : { disabled: '' }), title: open ? `${c.name} — ${c.title}\n· ${c.traits.join('\n· ')}` : `${c.joinAfter ?? ''} 이후 합류`, 'aria-pressed': String(c.id === now) },
    );
    return b;
  });
  const cur = characterOf(data, now);
  return el(
    'div',
    { class: `char-pick${compact ? ' compact' : ''}` },
    el('div', { class: 'cp-row', role: 'group', 'aria-label': '들어갈 인물' }, ...cards),
    !compact && cur ? el('ul', { class: 'cp-traits' }, ...cur.traits.map((t) => el('li', {}, t))) : '',
  );
}

function header(title: string, nav: Nav, sub?: string): HTMLElement {
  return el(
    'header',
    { class: 'screen-head' },
    button(['‹ 로비'], 'btn back-lobby', () => nav.go('lobby')),
    el('div', {}, el('h1', {}, title), sub ? el('p', { class: 'sub' }, sub) : ''),
  );
}

/* ───────── 시작: 로그인 판 ───────── */

/**
 * 시작 화면은 로그인 판뿐이다(2026-11-11 사용자 요청: 들어가기·설정만 있던 화면을 없앤다).
 * 로그인해 둔 적이 있거나 이 탭에서 게스트를 골랐으면 곧장 메인(로비)으로
 */
export function renderTitle(app: HTMLElement, nav: Nav): void {
  if (accountState().kind !== 'none') return nav.go('lobby');
  document.documentElement.classList.add('on-title');
  const logo = el('h1', { class: 'logo', 'aria-label': '결' }, el('span', { class: 'ink-han', 'aria-hidden': 'true' }, '決'));
  app.replaceChildren(
    el(
      'section',
      { class: 'title gated' },
      logo,
      el('p', { class: 'logo-read', 'aria-hidden': 'true' }, '결'),
      el('p', { class: 'sub' }, '적의 공격에는 결이 있다. 결을 읽고, 받아치고, 되돌아오는 틈을 벤다.'),
      loginPanel({ onDone: () => nav.go('lobby'), onGuest: () => nav.go('lobby') }),
    ),
  );
  setKeys(null);
  (app.querySelector('.login-input') as HTMLInputElement | null)?.focus();
}

/* ───────── 메인: 운곡루 뒤뜰 ───────── */

const MENU_PLATE: Record<string, string> = { story: 'parry', arena: 'attack', rhythm: 'tech', practice: 'focus' };
/** 메뉴 아이콘 칸(Codex icons_gyeol_menu는 처음 메뉴 순서: 이야기·결투장·박자 도전·수련장·기록·설정) */
const MENU_ICON: Record<string, number> = { story: 1, arena: 2, rhythm: 3, practice: 4 };

/** 「천외귀환」 주소(같은 배포의 한 단계 위 — 개발 서버에서는 /) */
export const CHEONOE_URL = new URL('../', location.href).href;

/**
 * 메인(2026-11-11 사용자 요청 — 「천외귀환」 시작 화면과 같은 구성): 가운데 제목과 메뉴, 왼쪽 아래 명패(계정·수련),
 * 오른쪽 아래 둥근 표식(옷장 · 도감 · 설정 · 「천외귀환」 바로가기). 양옆 인물·장소 글·메뉴 설명·아래 기록 줄은 없앴다(2026-11-11 사용자 요청 — 깔끔하게).
 * 메뉴 설명은 단추에 마우스를 올리면 뜬다(title). 뒤뜰 그림 위에는 잔잔한 움직임 층
 */
export function renderLobby(app: HTMLElement, nav: Nav): void {
  if (accountState().kind === 'none') return nav.go('title');
  document.documentElement.classList.remove('on-title');
  const save = loadSave();
  // 에필로그를 마치면 운곡루 뒤뜰에 새벽이 온다(7-2)
  const dawn = save.story.cleared.includes('epilogue');
  const go = (id: string) => {
    sfx('click');
    if (id === 'settings') nav.settings();
    else if (id === 'cheonoe') location.href = CHEONOE_URL;
    else nav.go(id as Screen);
  };
  const items = lobby.menu.map((m, i) => {
    const locked = !!m.locked;
    // 메뉴 아이콘(Codex icons_gyeol_menu — 칸 = 처음 lobby.json menu 순서: 이야기·결투장·박자 도전·수련장·기록·설정)이 오면 이름 왼쪽에
    const icon = realArt('icons_gyeol_menu', MENU_ICON[m.id] ?? i + 1);
    const b = button([el('span', { class: 'key' }, String(i + 1)), icon ? el('img', { class: 'pad-icon', src: icon, alt: '' }) : '', el('b', {}, m.name)], `menu-btn plate-${MENU_PLATE[m.id] ?? 'back'}`, () => go(m.id), locked ? { disabled: '', title: `🔒 ${m.locked}` } : { title: m.note });
    return el('li', { class: locked ? 'locked' : '' }, b);
  });
  const corner = lobby.corner.map((c) =>
    button([el('b', {}, c.name)], `medal lobby-medal${c.id === 'cheonoe' ? ' to-cheonoe' : ''}`, () => go(c.id), { 'aria-label': c.name, title: `${c.name} — ${c.note}` }),
  );
  // 뒤뜰 그림 위 잔잔한 움직임(달무리·등불·안개·별·반딧불·댓잎 — lobby-fx.ts). 그림이 아직 없으면 CSS 바탕 그대로
  const bg = realArt('bg_gyeol_lobby', 1);
  const section = el(
    'section',
    { class: `lobby main${dawn ? ' dawn' : ''}${bg ? ' has-stage' : ''}` },
    bg ? lobbyStage(bg, dawn) : '',
    el('div', { class: 'lobby-shade', 'aria-hidden': 'true' }),
    el(
      'div',
      { class: 'lobby-center' },
      el('h1', { class: 'lobby-logo', 'aria-label': '결' }, el('span', { class: 'ink-han', 'aria-hidden': 'true' }, '決')),
      el('ol', { class: 'lobby-menu' }, ...items),
    ),
    // 계정·수련은 왼쪽 아래 명패로(「천외귀환」과 같다). 로그인하기를 누르면 로그인 판으로
    playerPlate(() => nav.go(accountState().kind === 'none' ? 'title' : 'lobby')),
    el('nav', { class: 'lobby-corner', 'aria-label': '옷장 · 도감 · 설정 · 천외귀환' }, ...corner),
  );
  app.replaceChildren(section);
  setKeys((e) => {
    const n = Number(e.key);
    if (n >= 1 && n <= lobby.menu.length && !lobby.menu[n - 1].locked) go(lobby.menu[n - 1].id);
  });
  (app.querySelector('.menu-btn:not([disabled])') as HTMLButtonElement | null)?.focus();
  // 로그인해 둔 세션이 풀렸으면(만료·다른 탭에서 로그아웃) 로그인 판으로
  const off = onCloudChange(() => {
    if (!section.isConnected) return off();
    if (accountState().kind === 'none') {
      off();
      nav.go('title');
    }
  });
}

/* ───────── 결투장 ───────── */

let arenaDifficulty = 'main';

export function renderArena(app: HTMLElement, nav: Nav, data: DuelData): void {
  const save = loadSave();
  const who = chosen(data, save.character, save.story.cleared);
  const diffs = data.difficulties ?? [];
  const seg = el('div', { class: 'seg', role: 'radiogroup', 'aria-label': '난이도' });
  const draw = () => {
    seg.replaceChildren(
      ...diffs.map((d) => {
        const b = button([el('b', {}, d.name), el('small', {}, d.note)], `seg-btn${d.id === arenaDifficulty ? ' on' : ''}`, () => {
          arenaDifficulty = d.id;
          draw();
        }, { role: 'radio', 'aria-checked': String(d.id === arenaDifficulty) });
        return b;
      }),
    );
    grid.replaceChildren(
      ...arenaFoes(data, save.seen).map((f) => {
        const img = frameUrl(`${f.sprite}_idle`, 1);
        const tags = elementsOf(f).map((e) => el('span', { class: `tag el-${e}` }, ELEMENT_NAME[e]));
        const best = el('div', { class: 'best-row' }, ...diffs.map((d) => el('span', { class: 'best-cell', title: `${d.name} 최고 등급` }, el('small', {}, d.name), rankBadge(save.duelBest[recordKey(`${f.id}:${d.id}`, who)]))));
        return el(
          'article',
          { class: 'foe-card' },
          img ? el('img', { src: img, alt: '' }) : '',
          el('div', { class: 'foe-text' }, el('b', {}, f.title), el('div', { class: 'tags' }, ...tags), el('small', {}, withKeys(f.note))),
          best,
          el('div', { class: 'foe-actions' }, button('대결', 'btn primary', () => nav.play(f, 'duel', { difficulty: arenaDifficulty, back: 'arena', character: who }))),
        );
      }),
    );
  };
  const grid = el('div', { class: 'foes' });
  app.replaceChildren(el('section', { class: 'screen arena' }, header('결투장', nav, '이긴 상대와 다시 겨룬다. 맞지 않고 PERFECT가 많을수록 높은 등급. 등급은 인물마다 따로.'), charPicker(data, () => renderArena(app, nav, data)), seg, grid, helpBox()));
  draw();
  setKeys((e) => e.key === 'Escape' && nav.go('lobby'));
}

/** 입력의 키(설정에서 고른 것) — kbd 둘이면 가운뎃점으로 */
function kbds(a: Parameters<typeof keyNames>[1]): (HTMLElement | string)[] {
  return keyNames(loadSave().settings.keys, a).flatMap((k, i) => (i ? ['·', el('kbd', {}, k)] : [el('kbd', {}, k)]));
}

function helpBox(): HTMLElement {
  return el(
    'details',
    { class: 'help' },
    el('summary', {}, '조작과 규칙'),
    el('p', {}, ...kbds('parry'), ' 받기 — 좁혀 드는 고리가 과녁 고리와 겹칠 때(금빛) 누르면 패링. 이르면 막기.'),
    el('p', {}, ...kbds('dodge'), ' 피하기 — ', el('b', { class: 'danger' }, '붉은 결(위험)'), '은 받을 수 없다. 제때 피하면 간파로 틈이 열린다.'),
    el('p', {}, ...kbds('attack'), '·화면 클릭 베기 — 패링·간파 뒤 적에게 금이 보이는 동안 베면 반격(3배). 적 체간이 가득 차면 결정타.'),
    el('p', {}, el('b', {}, '연베기'), ' — 칼이 맞은 뒤 박자에 맞춰 다시 ', el('kbd', {}, 'J'), ': 둘째·셋째 칼로 이어지고 셋째(마무리)는 피해 1.7배·체간 2.4배. 맞기 전에 누르면 이어지지 않는다.'),
    el('p', {}, ...kbds('heavy'), ' 강베기 — 늦게 떨어지지만 피해 2.4배. 막혀도 막는 칼을 짓눌러 체간을 크게 깎는다. 떨어지기 전에 맞으면 그대로 맞는다.'),
    el('p', {}, ...kbds('tech'), ' 기술 — 결 연환(끊기지 않고 받은 수)이 차면 열린다. ', ...kbds('focus'), ' 집중 — 게이지가 차면 시간이 느려지고 결이 처음부터 보인다.'),
    el('p', {}, '속임수: 고리가 과녁에 닿아도 치지 않고 멈춘다. "…지금!"이 뜨면 다시 좁혀 드는 진짜 결을 받는다.'),
    el('p', {}, '원소: ', el('span', { class: 'tag el-fire' }, '화염'), ' 받아도 화상 · ', el('span', { class: 'tag el-ice' }, '냉기'), ' 느리다 마지막에 빨라진다 · ', el('span', { class: 'tag el-lightning' }, '번개'), ' 박자가 튄다.'),
    el('p', {}, '판정: PERFECT(타격 바로 앞) · EXCELLENT(받기) · GOOD(막기·피함) · MISS. 기술은 이어 받은 판정 단계로 열린다.'),
    el('p', {}, '겨루기: 결 연환을 3 이상 이은 채, 적의 무거운 공격이 닿는 순간에 맞춰 한 번 베면 칼끼리 맞부딪힌다 — J·K 연타로 밀어낸다. 체력 20% 아래면 배수의 진(PERFECT 폭이 넓어진다).'),
  );
}

/* ───────── 박자 도전 ───────── */

/** 박자 도전은 수련장 안의 한 칸이다(2026-11-11 사용자 요청) — 옛 주소(?screen=rhythm)는 그 칸으로 */
export function renderRhythm(app: HTMLElement, nav: Nav, data: DuelData): void {
  practiceTab = 'rhythm';
  renderPractice(app, nav, data);
}

/* ───────── 수련장: 수련 · 박자 도전 ───────── */

let practiceTab: 'drill' | 'rhythm' = 'drill';

export function renderPractice(app: HTMLElement, nav: Nav, data: DuelData): void {
  const dummy = data.foes.find((f) => f.practice);
  const save = loadSave();
  const who = chosen(data, save.character, save.story.cleared);
  const redraw = () => renderPractice(app, nav, data);
  const tab = (id: 'drill' | 'rhythm', label: string) => {
    const b = button([el('span', {}, label)], `prac-tab${practiceTab === id ? ' on' : ''}`, () => {
      practiceTab = id;
      redraw();
    }, { role: 'tab', 'aria-selected': String(practiceTab === id) });
    return b;
  };
  const drills = (dummy?.drills ?? []).map((dr, i) =>
    el(
      'li',
      {},
      button([el('span', { class: 'key' }, String(i + 1)), el('b', {}, dr.name)], 'menu-btn plate-focus', () => dummy && nav.play(dummy, 'practice', { drill: dr.id, back: 'practice', character: who })),
      el('small', {}, withKeys(dr.note)),
    ),
  );
  const charts = duelFoes(data)
    .filter((f) => f.chart && !f.storyOnly && (f.starter || save.seen.includes(f.id)))
    .map((f) => {
      const img = frameUrl(`${f.sprite}_idle`, 1);
      const b = save.rhythmBest[recordKey(f.id, who)];
      return el(
        'article',
        { class: 'foe-card' },
        img ? el('img', { src: img, alt: '' }) : '',
        el('div', { class: 'foe-text' }, el('b', {}, f.chart!.title), el('small', {}, `${f.title} · ${f.chart!.steps.length}박`)),
        el('div', { class: 'best-row' }, el('span', { class: 'best-cell' }, el('small', {}, '최고'), rankBadge(b?.rank)), el('small', { class: 'best' }, b ? `정확도 ${Math.round(b.accuracy * 100)}%` : '아직 없음')),
        el('div', { class: 'foe-actions' }, button('도전', 'btn primary', () => nav.play(f, 'rhythm', { back: 'practice', character: who }))),
      );
    });
  const off = save.settings.inputOffset;
  const body =
    practiceTab === 'drill'
      ? el(
          'div',
          { class: 'practice-grid' },
          el('ol', { class: 'lobby-menu drills' }, ...drills),
          el('aside', { class: 'calib-card' }, el('h2', {}, '박자 맞추기'), el('p', {}, '박자에 맞춰 열두 번 눌러, 손과 화면·소리의 지연을 잰다. 잰 값을 판정 보정으로 쓸 수 있다.'), el('p', { class: 'now' }, `지금 판정 보정 ${off > 0 ? '+' : ''}${off}ms`), button('재기', 'btn primary', () => nav.go('calibrate'))),
        )
      : el('div', {}, el('p', { class: 'prac-lead' }, '정해진 악보대로 오는 결을 받아 낸다. 베기는 없다 — 받기와 피하기로 정확도를 겨룬다.'), el('div', { class: 'foes' }, ...charts));
  app.replaceChildren(
    el(
      'section',
      { class: 'screen practice' },
      header('수련장', nav, '왕일검이 나무토막으로 철목인을 움직인다. 다치지 않고, 철목인은 쓰러져도 다시 선다.'),
      charPicker(data, redraw),
      el('div', { class: 'prac-tabs', role: 'tablist' }, tab('drill', '수련'), tab('rhythm', '박자 도전')),
      body,
    ),
  );
  setKeys((e) => {
    const n = Number(e.key);
    const dr = dummy?.drills?.[n - 1];
    if (practiceTab === 'drill' && dr && dummy) nav.play(dummy, 'practice', { drill: dr.id, back: 'practice', character: who });
    else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      practiceTab = practiceTab === 'drill' ? 'rhythm' : 'drill';
      redraw();
    } else if (e.key === 'Escape') nav.go('lobby');
  });
}

/* ───────── 박자 맞추기(입력 지연 재기) ───────── */

const CAL_BEAT = 750;
const CAL_LEAD = 4;
const CAL_COUNT = 12;

export function renderCalibrate(app: HTMLElement, nav: Nav): void {
  const ring = el('div', { class: 'cal-ring' });
  const count = el('p', { class: 'cal-count' }, 'Space·K·클릭으로 박자에 맞춰 누른다');
  const result = el('div', { class: 'cal-result' });
  const start = button('시작', 'btn primary', () => run());
  const stage = el('div', { class: 'cal-stage' }, ring, count);
  app.replaceChildren(el('section', { class: 'screen calibrate' }, header('박자 맞추기', nav, `첫 ${CAL_LEAD}박은 듣기만 하고, 다음 ${CAL_COUNT}박에 맞춰 누른다.`), stage, el('div', { class: 'row' }, start, button('수련장으로', 'btn', () => nav.go('practice'))), result));
  let timers: number[] = [];
  let beats: number[] = [];
  let presses: number[] = [];
  let running = false;
  const tap = (stamp: number) => {
    if (!running) return;
    presses.push(stamp);
    ring.classList.remove('tap');
    void ring.offsetWidth;
    ring.classList.add('tap');
  };
  stage.addEventListener('pointerdown', (e) => tap(e.timeStamp));
  const run = () => {
    timers.forEach((t) => clearTimeout(t));
    timers = [];
    beats = [];
    presses = [];
    running = true;
    result.replaceChildren();
    start.disabled = true;
    const t0 = performance.now() + 600;
    for (let i = 0; i < CAL_LEAD + CAL_COUNT; i++) {
      const at = t0 + i * CAL_BEAT;
      if (i >= CAL_LEAD) beats.push(at);
      timers.push(
        window.setTimeout(() => {
          sfx(i < CAL_LEAD ? 'click' : 'snap', { volume: 0.9 });
          ring.classList.remove('beat');
          void ring.offsetWidth;
          ring.classList.add('beat');
          count.textContent = i < CAL_LEAD ? `듣기 ${i + 1} / ${CAL_LEAD}` : `누르기 ${i - CAL_LEAD + 1} / ${CAL_COUNT}`;
        }, Math.max(0, at - performance.now())),
      );
    }
    timers.push(window.setTimeout(finish, t0 + (CAL_LEAD + CAL_COUNT) * CAL_BEAT - performance.now()));
  };
  const finish = () => {
    running = false;
    start.disabled = false;
    start.textContent = '다시 재기';
    const r = calibrationOffset(beats, presses.filter((p) => p >= beats[0] - 300));
    if (!r) {
      count.textContent = '누른 수가 모자라다. 다시 재 보자.';
      return;
    }
    const v = Math.max(-120, Math.min(120, r.mean));
    count.textContent = r.mean >= 0 ? `평균 ${r.mean}ms 늦게 눌렀다` : `평균 ${-r.mean}ms 일찍 눌렀다`;
    const apply = button(`판정 보정 ${v > 0 ? '+' : ''}${v}ms로 쓰기`, 'btn primary', () => {
      const save = loadSave();
      save.settings.inputOffset = v;
      writeSave(save);
      apply.disabled = true;
      apply.textContent = '저장했다';
    });
    result.replaceChildren(el('p', {}, `쓴 박 ${r.used} · 흔들림 ±${r.spread}ms${r.spread > 60 ? ' — 고르지 않다. 한 번 더 재면 좋다' : ''}`), apply);
  };
  setKeys((e) => {
    if (e.repeat) return;
    if (e.key === ' ' || actionFor(loadSave().settings.keys, e.code) === 'parry') {
      e.preventDefault();
      tap(e.timeStamp);
    } else if (e.key === 'Escape') {
      timers.forEach((t) => clearTimeout(t));
      nav.go('practice');
    }
  });
}

/* ───────── 기록 ───────── */

function techCondition(t: TechDef): string {
  return t.min === 'perfect' ? `PERFECT만 ${t.chain}연속` : t.min === 'excellent' ? `EXCELLENT 이상 ${t.chain}연속` : `GOOD 이상 ${t.chain}연속`;
}

export function renderRecords(app: HTMLElement, nav: Nav, data: DuelData): void {
  const save = loadSave();
  const diffs = data.difficulties ?? [];
  const foes = duelFoes(data).map((f) => {
    const seen = save.seen.includes(f.id);
    const img = frameUrl(`${f.sprite}_idle`, 1);
    return el(
      'article',
      { class: `codex-card${seen ? '' : ' unseen'}` },
      img ? el('img', { src: img, alt: '' }) : '',
      el('b', {}, seen ? f.title : '???'),
      el('small', {}, seen ? withKeys(f.note) : '아직 겨뤄 보지 않았다.'),
      seen && f.finisher ? el('small', { class: 'fin' }, `결정타 「${f.finisher.name}」`) : '',
      el('div', { class: 'best-row' }, ...diffs.map((d) => el('span', { class: 'best-cell' }, el('small', {}, d.name), rankBadge(save.duelBest[`${f.id}:${d.id}`])))),
    );
  });
  const techs = data.techs.map((t) => {
    const cg = realArt(`cg_gyeol_tech_${t.id}`);
    return el('article', { class: `tech-card tech-${t.id}` }, cg ? el('img', { src: cg, alt: '' }) : '', el('div', {}, el('b', {}, t.name), el('small', {}, techCondition(t)), el('small', { class: 'line' }, `"${t.line}"`)));
  });
  const st = save.stats;
  const min = Math.round(st.playMs / 60000);
  const rows: [string, string][] = [
    ['대결', `${st.duels}번 · 이김 ${st.wins}`],
    ['패링', `${st.parries}번 · PERFECT ${st.perfect}`],
    ['결정타', `${st.deathblows}번`],
    ['기술', `${st.techs}번`],
    ['겨루기 승리', `${st.clashWins}번`],
    ['최대 연속 박자', `${st.maxStreak}`],
    ['대결 시간', `${min}분`],
  ];
  app.replaceChildren(
    el(
      'section',
      { class: 'screen records' },
      header('도감', nav),
      ...achievementSection(data),
      ...characterSection(data),
      el('h2', {}, '상대 도감'),
      el('div', { class: 'codex-grid' }, ...foes),
      el('h2', {}, '진하운의 기술'),
      el('div', { class: 'tech-grid' }, ...techs),
      el('h2', {}, '쌓인 기록'),
      el('dl', { class: 'stats' }, ...rows.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)])),
    ),
  );
  setKeys((e) => e.key === 'Escape' && nav.go('lobby'));
}

/** 박자 도전 악보가 있는 결투장 상대 */
export const chartIds = (data: DuelData): string[] => duelFoes(data).filter((f) => f.chart && !f.storyOnly).map((f) => f.id);

/** 새로 이룬 업적을 저장하고 알린다(대결·장을 마칠 때) */
export function announceAchievements(data: DuelData): void {
  const save = loadSave();
  const got = newAchievements(save, chartIds(data));
  if (!got.length) return;
  writeSave(save);
  got.forEach((a, i) => setTimeout(() => toast(`업적 — ${a.name}`, a.text), 600 + i * 900));
}

/** 도감: 인물별 기록(2026-11-11 — 인물마다 따로 잰다) */
function characterSection(data: DuelData): HTMLElement[] {
  const save = loadSave();
  const list = characters(data);
  if (list.length < 2) return [];
  const cards = list.map((c) => {
    const open = joined(c, save.story.cleared);
    const st = save.charStats[c.id] ?? emptyStats();
    const face = realArt(c.stand) ?? (c.fallbackStand ? frameUrl(c.fallbackStand, 1) : null);
    const grades = Object.entries(save.duelBest).filter(([k]) => (c.id === 'haun' ? !k.includes('@') : k.endsWith(`@${c.id}`))).length;
    return el(
      'article',
      { class: `char-card${open ? '' : ' locked'}` },
      el('span', { class: 'cp-face big', style: faceStyle(c, face, realArt(faceId(c.id))) }),
      el(
        'div',
        { class: 'cc-text' },
        el('b', {}, c.name),
        el('small', { class: 'cc-title' }, `${c.title} · ${c.trait}`),
        open
          ? el('p', { class: 'cc-stats' }, `대결 ${st.duels} · 이김 ${st.wins} · 패링 ${st.parries}(PERFECT ${st.perfect}) · 결정타 ${st.deathblows} · 최대 연속 ${st.maxStreak} · 등급 ${grades}`)
          : el('p', { class: 'cc-stats' }, '아직 합류하지 않았다'),
        el('ul', { class: 'cp-traits' }, ...c.traits.map((t) => el('li', {}, t))),
      ),
    );
  });
  return [el('h2', {}, '인물'), el('div', { class: 'char-grid' }, ...cards)];
}

/** 도감: 업적 */
function achievementSection(data: DuelData): HTMLElement[] {
  const save = loadSave();
  const ids = chartIds(data);
  const ach = progress.achievements.map((a) => {
    const met = save.achievements.includes(a.id) || condMet(a.cond, save, ids);
    return el('li', { class: `ach${met ? ' met' : ''}` }, el('b', {}, met ? '✦ ' + a.name : '◇ ' + a.name), el('small', {}, a.text));
  });
  const got = progress.achievements.filter((a) => save.achievements.includes(a.id) || condMet(a.cond, save, ids)).length;
  return [el('h2', {}, `업적 ${got} / ${progress.achievements.length}`), el('ul', { class: 'ach-grid' }, ...ach)];
}

/* ───────── 옷장: 하운 옷 ───────── */

export function renderWardrobe(app: HTMLElement, nav: Nav): void {
  const save = loadSave();
  const outfits = progress.outfits.map((o) => {
    const open = condMet(o.unlock, save);
    const on = (save.outfit || 'base') === o.id;
    const img = frameUrl(o.id === 'base' ? 'haun_sword_idle' : `skin_${o.id}_haun_idle`, 1);
    const pick = button(on ? '입는 중' : open ? '입기' : '🔒', `btn small${on ? ' primary' : ''}`, () => {
      const s = loadSave();
      s.outfit = o.id;
      writeSave(s);
      renderWardrobe(app, nav);
    }, open && !on ? {} : { disabled: '' });
    return el('article', { class: `outfit-card${open ? '' : ' locked'}${on ? ' on' : ''}` }, img ? el('img', { src: img, alt: '' }) : '', el('b', {}, o.name), el('small', {}, open ? o.text : condText(o.unlock)), pick);
  });
  app.replaceChildren(el('section', { class: 'screen wardrobe' }, header('옷장', nav, `하운이 입는 옷 — 이야기 별 ${starTotal(save)}개로 연다`), el('div', { class: 'outfit-grid' }, ...outfits)));
  setKeys((e) => e.key === 'Escape' && nav.go('lobby'));
}

// 「결」 대결 밖의 화면(2026-11-10 2단계, 설계 7-3절): 시작 · 로비(운곡루 뒤뜰) · 결투장 · 박자 도전 · 수련장 · 박자 맞추기 · 기록.
// PC 위주(2026-11-10 사용자 요청). 휴대폰에서는 한 줄로 쌓여 보인다.
import { frameUrl } from '../../src/render/assets';
import { sfx } from '../../src/render/audio';
import lobbyRaw from '../data/lobby.json';
import { accountState, loginPanel, playerPlate } from './account';
import { button, el, ELEMENT_NAME, elementsOf, rankBadge, realArt } from './dom';
import type { Duel, DuelData, DuelOptions, FoeDef, Mode, TechDef } from './duel';
import type { TutorialStep } from './story';
import { calibrationOffset } from './calibrate';
import { loadSave, writeSave } from './save';

export type Screen = 'title' | 'lobby' | 'story' | 'arena' | 'rhythm' | 'practice' | 'records' | 'calibrate';

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
}

export interface Nav {
  go(s: Screen): void;
  play(foe: FoeDef, mode: Mode, opts: PlayOpts): void;
  settings(): void;
  /** 대결 고리·키를 멈춘다(화면을 바꾸지 않고) */
  stop(): void;
}

interface LobbyData {
  wang: string[];
  menu: { id: string; name: string; note: string; locked?: string }[];
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
const arenaFoes = (data: DuelData, seen: string[]) => duelFoes(data).filter((f) => !f.storyOnly && (f.chart || seen.includes(f.id)));
const portrait = (id: string, n = 1) => frameUrl(id, n);

function header(title: string, nav: Nav, sub?: string): HTMLElement {
  return el(
    'header',
    { class: 'screen-head' },
    button(['‹ 로비'], 'btn back-lobby', () => nav.go('lobby')),
    el('div', {}, el('h1', {}, title), sub ? el('p', { class: 'sub' }, sub) : ''),
  );
}

/* ───────── 시작 ───────── */

export function renderTitle(app: HTMLElement, nav: Nav): void {
  document.documentElement.classList.add('on-title');
  const redraw = () => renderTitle(app, nav);
  // 「천외귀환」과 같은 흐름(2026-11-10 목업): 이 탭에서 로그인도 게스트도 고르지 않았으면 메뉴 대신 로그인 판
  const gate = accountState().kind === 'none';
  const enter = button('들어가기', 'btn primary big', () => nav.go('lobby'));
  const logo = el('h1', { class: 'logo', 'aria-label': '결' }, el('span', { class: 'ink-han', 'aria-hidden': 'true' }, '決'));
  app.replaceChildren(
    el(
      'section',
      { class: `title${gate ? ' gated' : ''}` },
      logo,
      el('p', { class: 'logo-read', 'aria-hidden': 'true' }, '결'),
      el('p', { class: 'sub' }, '적의 공격에는 결이 있다. 결을 읽고, 받아치고, 되돌아오는 틈을 벤다.'),
      gate
        ? loginPanel({ onDone: redraw, onGuest: redraw })
        : el('div', { class: 'title-actions' }, enter, button('설정', 'btn', () => nav.settings())),
      gate ? '' : el('p', { class: 'proto' }, 'Enter로 들어간다'),
    ),
    gate ? '' : playerPlate(redraw),
  );
  setKeys((e) => {
    if (gate) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      nav.go('lobby');
    }
  });
  if (gate) (app.querySelector('.login-input') as HTMLInputElement | null)?.focus();
  else enter.focus();
}

/* ───────── 로비: 운곡루 뒤뜰 ───────── */

const MENU_PLATE: Record<string, string> = { story: 'parry', arena: 'attack', rhythm: 'tech', practice: 'focus', records: 'dodge', settings: 'back' };

export function renderLobby(app: HTMLElement, nav: Nav): void {
  document.documentElement.classList.remove('on-title');
  const save = loadSave();
  let line = Math.floor(Date.now() / 1000) % lobby.wang.length;
  const say = el('p', { class: 'lobby-say' }, lobby.wang[line]);
  // 로비 그림(2026-11-10): Codex 결 전용 그림(haun_gyeol_stand·wang_gyeol_stand)이 오면 그것으로, 그 전에는 「천외귀환」 반신 그림
  const stand = (id: string, old: string) => (n: number) => realArt(id, n) ?? (n === 1 ? (portrait(old) ?? '') : null);
  const haunArt = stand('haun_gyeol_stand', 'haun_sword_stand');
  const wangArt = stand('wang_gyeol_stand', 'wang_stand');
  const gyeolArt = !!realArt('haun_gyeol_stand');
  const haunImg = el('img', { class: 'lobby-haun', src: haunArt(1) ?? '', alt: '진하운' });
  const wangImg = el('img', { src: wangArt(1) ?? '', alt: '' });
  /** 칸 n으로 잠깐 바꿨다가 돌아온다(그림이 없는 칸이면 그대로) */
  let back = 0;
  const pose = (img: HTMLImageElement, art: (n: number) => string | null, n: number, ms = 0) => {
    const u = art(n);
    if (!u) return;
    img.src = u;
    if (ms) {
      clearTimeout(back);
      back = window.setTimeout(() => {
        haunImg.src = haunArt(1) ?? haunImg.src;
        wangImg.src = wangArt(1) ?? wangImg.src;
      }, ms);
    }
  };
  const wang = el('button', { class: 'lobby-wang', type: 'button', 'aria-label': '왕일검에게 말 걸기' }, wangImg, say);
  wang.addEventListener('click', () => {
    line = (line + 1) % lobby.wang.length;
    say.textContent = lobby.wang[line];
    say.classList.remove('pop');
    void say.offsetWidth;
    say.classList.add('pop');
    // 왕일검은 가르치고, 하운은 듣는다
    pose(wangImg, wangArt, 2, 2600);
    pose(haunImg, haunArt, 3, 2600);
  });
  const go = (id: string) => {
    sfx('click');
    if (id === 'settings') nav.settings();
    else nav.go(id as Screen);
  };
  let armed = false;
  const items = lobby.menu.map((m, i) => {
    const locked = !!m.locked;
    // 메뉴 아이콘(Codex icons_gyeol_menu — 칸 = lobby.json menu 순서)이 오면 이름 왼쪽에
    const icon = realArt('icons_gyeol_menu', i + 1);
    const b = button([el('span', { class: 'key' }, String(i + 1)), icon ? el('img', { class: 'pad-icon', src: icon, alt: '' }) : '', el('b', {}, m.name)], `menu-btn plate-${MENU_PLATE[m.id] ?? 'back'}`, () => go(m.id), locked ? { disabled: '', 'aria-describedby': `note-${m.id}` } : { 'aria-describedby': `note-${m.id}` });
    // 싸우러 가는 메뉴에 손이 가면 하운이 칼자루에 손을 얹는다
    if (m.id === 'story' || m.id === 'arena') {
      // 로비에 들어올 때 첫 메뉴에 저절로 가는 초점은 빼고, 마우스를 올리거나 키보드로 옮겼을 때만
      const ready = () => pose(haunImg, haunArt, 2);
      const calm = () => pose(haunImg, haunArt, 1);
      b.addEventListener('pointerenter', ready);
      b.addEventListener('focus', () => armed && ready());
      b.addEventListener('pointerleave', calm);
      b.addEventListener('blur', calm);
    }
    return el('li', { class: locked ? 'locked' : '' }, b, el('small', { id: `note-${m.id}` }, locked ? `🔒 ${m.locked}` : m.note));
  });
  const st = save.stats;
  app.replaceChildren(
    el(
      'section',
      { class: 'lobby' },
      el('div', { class: `lobby-scene${gyeolArt ? ' gyeol-art' : ''}` }, haunImg, wang),
      el('header', { class: 'lobby-head' }, el('h1', { 'aria-label': '결' }, el('span', { class: 'ink-han', 'aria-hidden': 'true' }, '決')), el('p', {}, '운곡루 뒤뜰 · 밤')),
      el('ol', { class: 'lobby-menu' }, ...items),
      el('footer', { class: 'lobby-foot' }, !save.story.cleared.includes('prologue') ? '처음 왔구나. 이야기 › 서장에서 손부터 풀어 보아라.' : `대결 ${st.duels} · 이김 ${st.wins} · 패링 ${st.parries} · 최대 연속 박자 ${st.maxStreak}`),
    ),
  );
  setKeys((e) => {
    const n = Number(e.key);
    if (n >= 1 && n <= lobby.menu.length && !lobby.menu[n - 1].locked) go(lobby.menu[n - 1].id);
    else if (e.key === 'Escape') nav.go('title');
  });
  (app.querySelector('.menu-btn:not([disabled])') as HTMLButtonElement | null)?.focus();
  armed = true;
}

/* ───────── 결투장 ───────── */

let arenaDifficulty = 'main';

export function renderArena(app: HTMLElement, nav: Nav, data: DuelData): void {
  const save = loadSave();
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
        const best = el('div', { class: 'best-row' }, ...diffs.map((d) => el('span', { class: 'best-cell', title: `${d.name} 최고 등급` }, el('small', {}, d.name), rankBadge(save.duelBest[`${f.id}:${d.id}`]))));
        return el(
          'article',
          { class: 'foe-card' },
          img ? el('img', { src: img, alt: '' }) : '',
          el('div', { class: 'foe-text' }, el('b', {}, f.title), el('div', { class: 'tags' }, ...tags), el('small', {}, f.note)),
          best,
          el('div', { class: 'foe-actions' }, button('대결', 'btn primary', () => nav.play(f, 'duel', { difficulty: arenaDifficulty, back: 'arena' }))),
        );
      }),
    );
  };
  const grid = el('div', { class: 'foes' });
  app.replaceChildren(el('section', { class: 'screen arena' }, header('결투장', nav, '이긴 상대와 다시 겨룬다. 맞지 않고 PERFECT가 많을수록 높은 등급.'), seg, grid, helpBox()));
  draw();
  setKeys((e) => e.key === 'Escape' && nav.go('lobby'));
}

function helpBox(): HTMLElement {
  return el(
    'details',
    { class: 'help' },
    el('summary', {}, '조작과 규칙'),
    el('p', {}, el('kbd', {}, 'K'), '·', el('kbd', {}, 'Space'), ' 받기 — 좁혀 드는 고리가 과녁 고리와 겹칠 때(금빛) 누르면 패링. 이르면 막기.'),
    el('p', {}, el('kbd', {}, 'L'), '·', el('kbd', {}, 'Shift'), ' 피하기 — ', el('b', { class: 'danger' }, '붉은 결(危)'), '은 받을 수 없다. 제때 피하면 간파로 틈이 열린다.'),
    el('p', {}, el('kbd', {}, 'J'), '·화면 클릭 베기 — 패링·간파 뒤 적에게 금이 보이는 동안 베면 반격(3배). 적 체간이 가득 차면 결정타.'),
    el('p', {}, el('kbd', {}, 'I'), ' 기술 — 결 연환(끊기지 않고 받은 수)이 차면 열린다. ', el('kbd', {}, 'U'), ' 집중 — 게이지가 차면 시간이 느려지고 결이 처음부터 보인다.'),
    el('p', {}, '속임수: 고리가 과녁에 닿아도 치지 않고 멈춘다. "…지금!"이 뜨면 다시 좁혀 드는 진짜 결을 받는다.'),
    el('p', {}, '원소: ', el('span', { class: 'tag el-fire' }, '화염'), ' 받아도 화상 · ', el('span', { class: 'tag el-ice' }, '냉기'), ' 느리다 마지막에 빨라진다 · ', el('span', { class: 'tag el-lightning' }, '번개'), ' 박자가 튄다.'),
    el('p', {}, '판정: PERFECT(타격 바로 앞) · EXCELLENT(받기) · GOOD(막기·피함) · MISS. 기술은 이어 받은 판정 단계로 열린다.'),
    el('p', {}, '겨루기: 결 연환을 3 이상 이은 채, 적의 무거운 공격이 닿는 순간에 맞춰 한 번 베면 칼끼리 맞부딪힌다 — J·K 연타로 밀어낸다. 체력 20% 아래면 배수의 진(PERFECT 폭이 넓어진다).'),
  );
}

/* ───────── 박자 도전 ───────── */

export function renderRhythm(app: HTMLElement, nav: Nav, data: DuelData): void {
  const save = loadSave();
  const cards = duelFoes(data)
    .filter((f) => f.chart)
    .map((f) => {
      const img = frameUrl(`${f.sprite}_idle`, 1);
      const b = save.rhythmBest[f.id];
      return el(
        'article',
        { class: 'foe-card' },
        img ? el('img', { src: img, alt: '' }) : '',
        el('div', { class: 'foe-text' }, el('b', {}, f.chart!.title), el('small', {}, `${f.title} · ${f.chart!.steps.length}박`)),
        el('div', { class: 'best-row' }, el('span', { class: 'best-cell' }, el('small', {}, '최고'), rankBadge(b?.rank)), el('small', { class: 'best' }, b ? `정확도 ${Math.round(b.accuracy * 100)}%` : '아직 없음')),
        el('div', { class: 'foe-actions' }, button('도전', 'btn primary', () => nav.play(f, 'rhythm', { back: 'rhythm' }))),
      );
    });
  app.replaceChildren(el('section', { class: 'screen' }, header('박자 도전', nav, '정해진 악보대로 오는 결을 받아 낸다. 베기는 없다 — 받기와 피하기로 정확도를 겨룬다.'), el('div', { class: 'foes' }, ...cards)));
  setKeys((e) => e.key === 'Escape' && nav.go('lobby'));
}

/* ───────── 수련장 ───────── */

export function renderPractice(app: HTMLElement, nav: Nav, data: DuelData): void {
  const dummy = data.foes.find((f) => f.practice);
  const save = loadSave();
  const drills = (dummy?.drills ?? []).map((dr, i) =>
    el(
      'li',
      {},
      button([el('span', { class: 'key' }, String(i + 1)), el('b', {}, dr.name)], 'menu-btn plate-focus', () => dummy && nav.play(dummy, 'practice', { drill: dr.id, back: 'practice' })),
      el('small', {}, dr.note),
    ),
  );
  const off = save.settings.inputOffset;
  app.replaceChildren(
    el(
      'section',
      { class: 'screen practice' },
      header('수련장', nav, '왕일검이 나무토막으로 철목인을 움직인다. 다치지 않고, 철목인은 쓰러져도 다시 선다. 화면 아래 막대에 누른 시점이 찍힌다.'),
      el('div', { class: 'practice-grid' }, el('ol', { class: 'lobby-menu drills' }, ...drills), el('aside', { class: 'calib-card' }, el('h2', {}, '박자 맞추기'), el('p', {}, '박자에 맞춰 열두 번 눌러, 손과 화면·소리의 지연을 잰다. 잰 값을 판정 보정으로 쓸 수 있다.'), el('p', { class: 'now' }, `지금 판정 보정 ${off > 0 ? '+' : ''}${off}ms`), button('재기', 'btn primary', () => nav.go('calibrate')))),
    ),
  );
  setKeys((e) => {
    const n = Number(e.key);
    const dr = dummy?.drills?.[n - 1];
    if (dr && dummy) nav.play(dummy, 'practice', { drill: dr.id, back: 'practice' });
    else if (e.key === 'Escape') nav.go('lobby');
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
    if (e.key === ' ' || e.key.toLowerCase() === 'k') {
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
      el('small', {}, seen ? f.note : '아직 겨뤄 보지 않았다.'),
      seen && f.finisher ? el('small', { class: 'fin' }, `결정타 「${f.finisher.hanja}」 ${f.finisher.name}`) : '',
      el('div', { class: 'best-row' }, ...diffs.map((d) => el('span', { class: 'best-cell' }, el('small', {}, d.name), rankBadge(save.duelBest[`${f.id}:${d.id}`])))),
    );
  });
  const techs = data.techs.map((t) => {
    const cg = realArt(`cg_gyeol_tech_${t.id}`);
    return el('article', { class: `tech-card tech-${t.id}` }, cg ? el('img', { src: cg, alt: '' }) : '', el('div', {}, el('b', { class: 'hanja' }, t.hanja), el('b', {}, t.name), el('small', {}, techCondition(t)), el('small', { class: 'line' }, `"${t.line}"`)));
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
      header('기록', nav),
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

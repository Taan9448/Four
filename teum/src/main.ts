// 「틈」 화면 흐름(2026-11-18 2차, GAME_DESIGN 1절): 들어가기(게스트) → 메인(불러오기·저장·스토리·무한) → 장 카드 → 판 → 장 끝(자동 저장).
// 입력: WASD·방향키 / 휴대폰은 왼쪽을 끌어 가상 막대, 오른쪽 아래 보법·천외귀운 단추. ESC 멈춤.
import './style.css';
import { frameUrl } from '../../src/render/assets';
import { currentTraining, gainXp } from '../../gyeol/src/training';
import progressRaw from '../../gyeol/data/progress.json';
import { applyVariant, banish, spawnFoe, CHAPTER_LENGTH, createEndless, practiceSlam, carryOf, choose, createChapter, dashCooldown, DT, elementCounts, FOES, freshCarry, HEROES, ITEMS, LOCKABLE, partnersOf, PASSIVES, rarityOf, reroll, RULES, skip as skipChoice, STORY, step, trainingXp, WEAPONS, type Carry, type Choice, type Input, type State } from './sim';
import { absorb, draw, emptyView, loadArt, SKILL_ICON, type Art, type View } from './render';
import { cardArtUrl } from '../../src/render/assets';
import { advice, BOOK_SLOTS, bookSummary, describe, gradeOf, keyNumbers, presets, recommend, roleIcon, roleOf, splitBook, suggest } from './book';
import { autosave, bank, cheonoeCards, heroOpen, loadSave, slotLabel, writeSave, type SaveData, type Slot } from './save';
import { createRng } from '../../src/engine/rng';
import { lobbyStage } from './lobby-fx';
import { ACTIONS, DEFAULT_KEYS, isKey, keyLabel, keyMap, type Action, type KeyMap } from './keys';
import { DEFAULT_SOUND, initSound, music, play as sfx, setSound } from './sound';
import { initIdle } from '../../src/render/idle';

const app = document.getElementById('app')!;
const params = new URLSearchParams(location.search);
const ALL = params.has('all');
const enemyLore = new Map<string, string>();
for (const mod of Object.values(import.meta.glob('../../data/enemies/*.json', { eager: true, import: 'default' })) as { id: string; lore?: string; flavor?: string }[][])
  for (const e of mod) enemyLore.set(e.id, e.lore ?? e.flavor ?? '');

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  e.append(...kids);
  return e;
}
function btn(label: (Node | string)[] | string, cls: string, fn: () => void, attrs: Record<string, string> = {}): HTMLButtonElement {
  const b = el('button', { class: cls, type: 'button', ...attrs }, ...(typeof label === 'string' ? [label] : label));
  b.addEventListener('click', fn);
  return b;
}
const realArt = (id: string, n = 1) => frameUrl(id, n, { realOnly: true });
const fmt = (t: number) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

let stopRun: (() => void) | null = null;
/** 화면마다 다는 키(숫자·Esc)를 바꿔 끼운다 */
let screenKeys: ((e: KeyboardEvent) => void) | null = null;
window.addEventListener('keydown', (e) => screenKeys?.(e));

/** 창(팝업) — 「결」 불러오기 창처럼 가운데 판 */
function modal(title: string, ...kids: (Node | string)[]): { root: HTMLElement; close: () => void } {
  const prevKeys = screenKeys;
  const root = el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
  const close = () => {
    root.remove();
    screenKeys = prevKeys;
  };
  root.append(el('div', { class: 'modal-box' }, el('h3', {}, title), ...kids, btn('닫기', 'btn ghost small modal-close', close)));
  root.addEventListener('click', (e) => e.target === root && close());
  screenKeys = (e) => e.key === 'Escape' && close();
  document.body.append(root);
  return { root, close };
}

// ── 1. 들어가기(게스트) ──
const GUEST_KEY = 'teum.guest';
function guestChosen(): boolean {
  try {
    return sessionStorage.getItem(GUEST_KEY) === '1';
  } catch {
    return false;
  }
}
function gate(): void {
  stopRun?.();
  screenKeys = null;
  music('title');
  const id = el('input', { type: 'text', placeholder: '아이디', disabled: '', 'aria-label': '아이디' });
  const pw = el('input', { type: 'password', placeholder: '비밀번호', disabled: '', 'aria-label': '비밀번호' });
  const go = () => {
    try {
      sessionStorage.setItem(GUEST_KEY, '1');
    } catch {
      /* 저장 못 해도 이번 화면은 들어간다 */
    }
    lobby();
  };
  app.replaceChildren(
    el(
      'section',
      { class: 'screen gate' },
      backdrop(),
      el('div', { class: 'seal' }, el('span', {}, '隙'), el('i', { class: 'stamp' })),
      el('p', { class: 'ko-title' }, '틈'),
      el('p', { class: 'tagline' }, '하늘이 갈라진 밤, 틈에서 쏟아지는 그림자를 열 장 동안 버틴다.'),
      el(
        'div',
        { class: 'login' },
        el('div', { class: 'tabs' }, el('button', { class: 'tab on', type: 'button', disabled: '' }, '로그인'), el('button', { class: 'tab', type: 'button', disabled: '' }, '회원가입')),
        id,
        pw,
        el('p', { class: 'note' }, '「천외귀환」·「결」 계정 로그인은 준비 중이다 — 지금은 게스트로.'),
        el('button', { class: 'btn primary wide', type: 'button', disabled: '' }, '로그인'),
        btn('게스트로 시작 →', 'link', go),
      ),
    ),
  );
}

function backdrop(): HTMLElement {
  // 2026-11-22 "메인 화면에 결이나 천외귀환처럼 잔잔한 애니메이션": 키 아트 위에 균열 빛·그림자 조각·불티·등불·안개
  const bg = realArt('keyart_teum_lobby');
  return el('div', { class: `backdrop${bg ? ' art' : ''}` }, lobbyStage(bg), bg ? '' : el('div', { class: 'crack', 'aria-hidden': 'true' }), el('div', { class: 'backdrop-shade' }));
}

// ── 2. 메인 ──
// 2026-11-21 사용자 "메뉴 밑 설명은 다 지우고 간단 명료하게"
const MENU = [
  { id: 'load', name: '불러오기', icon: 1 },
  { id: 'save', name: '저장', icon: 2 },
  { id: 'story', name: '스토리', icon: 3 },
  { id: 'shop', name: '장터', icon: 0 },
  { id: 'endless', name: '무한 모드', icon: 4 },
] as const;
const CORNER = [
  { id: 'codex', name: '도감', icon: 5 },
  { id: 'wardrobe', name: '옷장', icon: 6 },
  { id: 'options', name: '옵션', icon: 7 },
] as const;

function lobby(): void {
  stopRun?.();
  music('title');
  const sv = loadSave();
  const any = sv.slots.some(Boolean);
  const items = MENU.map((m, i) => {
    const locked = 'locked' in m || (m.id === 'load' && !any);
    const icon = m.icon ? realArt('icons_teum_menu', m.icon) : realArt('icons_teum_menu_2', 1);
    // 2026-11-21 사용자 "메뉴 앞 숫자 삭제 — 글자만"
    void i;
    return btn([icon ? el('img', { class: 'mi-icon', src: icon, alt: '' }) : el('span', { class: 'mi-icon glyph' }, '市'), el('span', { class: 'mi-label' }, el('b', {}, m.name))], `menu-btn${locked ? ' locked' : ''}${m.id === 'story' && !any ? ' primary' : ''}${m.id === 'load' && any ? ' primary' : ''}`, () => !locked && openMenu(m.id), locked ? { disabled: '' } : {});
  });
  const corner = el(
    'nav',
    { class: 'corner', 'aria-label': '도감·옷장·옵션·다른 게임' },
    ...CORNER.map((c) => {
      const icon = realArt('icons_teum_menu', c.icon);
      return btn([icon ? el('img', { src: icon, alt: '' }) : el('span', { class: 'glyph' }, c.name[0]), el('small', {}, c.name)], 'round', () => openMenu(c.id), { 'aria-label': c.name });
    }),
    el('span', { class: 'sep' }),
    btn([el('small', {}, '천외귀환')], 'round other', () => (location.href = '../'), { 'aria-label': '「천외귀환」으로' }),
    btn([el('small', {}, '결')], 'round other gyeol', () => (location.href = '../gyeol/'), { 'aria-label': '「결」로' }),
  );
  const lv = currentTraining().level;
  app.replaceChildren(
    el(
      'section',
      { class: 'screen lobby' },
      backdrop(),
      el('div', { class: 'lobby-center' }, el('div', { class: 'seal small' }, el('span', {}, '隙'), el('i', { class: 'stamp' })), el('div', { class: 'menu' }, ...items)),
      el('div', { class: 'account' }, el('span', { class: 'face' }, '손님'), el('div', {}, el('b', {}, '게스트 '), el('small', {}, '이 기기에만 저장'), el('div', { class: 'train' }, `수련 Lv.${lv}`), el('small', { class: 'soon' }, '로그인 · 회원가입 — 준비 중'))),
      corner,
    ),
  );
  screenKeys = (e) => {
    const n = Number(e.key);
    if (n >= 1 && n <= MENU.length) items[n - 1].click();
    if (e.key === 'Escape' && !document.querySelector('.modal')) gate();
  };
  (app.querySelector('.menu-btn:not([disabled])') as HTMLButtonElement | null)?.focus();
}

function openMenu(id: string): void {
  if (id === 'load') return loadPopup();
  if (id === 'save') return savePopup();
  if (id === 'story') return storyPopup();
  if (id === 'shop' || id === 'market') return shopPopup();
  if (id === 'endless') return endlessPopup();
  if (id === 'codex') return codexPopup();
  if (id === 'wardrobe') return wardrobePopup();
  if (id === 'options') return optionsPopup();
}

function slotCard(sv: SaveData, i: number, onPick: (() => void) | null, extra?: HTMLElement): HTMLElement {
  const s = sv.slots[i];
  const hero = s ? HEROES.find((h) => h.id === s.hero) : null;
  const face = hero ? (realArt(hero.stand) ?? frameUrl(`${hero.sprite}_idle`, 1)) : null;
  const card = el(
    'div',
    { class: `slot${s ? '' : ' empty'}${sv.active === i ? ' active' : ''}` },
    el('span', { class: 'no' }, `${i + 1}`),
    face ? el('img', { src: face, alt: '' }) : el('span', { class: 'ph' }, '빈 칸'),
    el('div', { class: 'info' }, el('b', {}, s ? `${i + 1}번 칸` : `${i + 1}번 칸 — 비어 있음`), el('small', {}, slotLabel(s)), s ? el('small', { class: 'date' }, new Date(s.updatedAt).toLocaleString('ko-KR')) : ''),
  );
  if (onPick) card.append(btn(s ? '고른다' : '여기에', 'btn small', onPick));
  if (extra) card.append(extra);
  return card;
}

function loadPopup(): void {
  const sv = loadSave();
  const { root, close } = modal('불러오기 — 이어 할 칸');
  root
    .querySelector('.modal-box')!
    .insertBefore(
      el(
        'div',
        { class: 'slots' },
        ...sv.slots.map((s, i) =>
          slotCard(sv, i, s && s.chapter < STORY.chapters.length
            ? () => {
                sv.active = i;
                writeSave(sv);
                close();
                chapterCard(s);
              }
            : null),
        ),
      ),
      root.querySelector('.modal-close'),
    );
}

function savePopup(): void {
  const sv = loadSave();
  const box = el('div', { class: 'slots' });
  const render = () =>
    box.replaceChildren(
      ...sv.slots.map((_, i) =>
        slotCard(
          sv,
          i,
          sv.active === i
            ? null
            : () => {
                sv.active = i;
                writeSave(sv);
                render();
              },
          sv.slots[i]
            ? btn('지우기', 'btn small danger', () => {
                if (!confirm(`${i + 1}번 칸을 지울까?`)) return;
                sv.slots[i] = null;
                writeSave(sv);
                render();
              })
            : undefined,
        ),
      ),
    );
  render();
  const { root } = modal('저장 — 자동 저장 칸');
  root.querySelector('.modal-box')!.insertBefore(el('div', {}, el('p', { class: 'note' }, '장을 넘을 때마다 「지금 칸」(테두리)에 자동으로 저장된다. 손으로 저장하는 단추는 없다 — 장 도중에 나가면 그 장은 처음부터.'), box), root.querySelector('.modal-close'));
}

/** 새 이야기: 칸 → 난이도 → 인물 */
function storyPopup(): void {
  const sv = loadSave();
  let slotIdx = sv.slots.findIndex((s) => !s);
  if (slotIdx < 0) slotIdx = sv.active;
  let diff = 'normal';
  const body = el('div', { class: 'story-pick' });
  const render = () => {
    const slots = el('div', { class: 'row-pick' }, ...sv.slots.map((s, i) => btn(`${i + 1}번 칸${s ? ' (덮어씀)' : ''}`, `chip${slotIdx === i ? ' on' : ''}`, () => ((slotIdx = i), render()))));
    // 난이도(2026-11-21 노말/하드): 카드 둘
    const diffs = el('div', { class: 'diff-pick' }, ...STORY.difficulties.map((d) => btn([el('b', {}, d.name), el('small', {}, d.note ?? '')], `diff-card d-${d.id}${diff === d.id ? ' on' : ''}`, () => d.open && ((diff = d.id), render()), d.open ? {} : { disabled: '' })));
    const heroes = el(
      'div',
      { class: 'heroes' },
      ...HEROES.map((h) => {
        const open = heroOpen(sv, h.id, ALL);
        const art = realArt(h.stand) ?? frameUrl(`${h.sprite}_idle`, 1);
        return btn(
          [
            el('div', { class: 'portrait' }, art ? el('img', { src: art, alt: '' }) : ''),
            el('b', {}, h.name),
            el('small', {}, h.title),
            el('small', {}, `체력 ${h.hp} · 걸음 ${Math.round(h.speed * 100)}%${h.armor ? ` · 단단함 ${h.armor}` : ''}`),
            el('small', {}, `「${WEAPONS.get(h.start)?.name}」으로 시작`),
            el('small', { class: 'kit' }, el('b', {}, `${h.dash.glyph} ${h.dash.name}`), ` — ${h.dash.desc}`),
            el('small', { class: 'kit' }, el('b', {}, `${h.ult.glyph} ${h.ult.name}`), ` — ${h.ult.desc}`),
            open ? '' : el('small', { class: 'lock' }, `🔒 ${h.unlock?.text}`),
          ],
          `hero${open ? '' : ' locked'}`,
          () => {
            if (!open) return;
            if (sv.slots[slotIdx] && !confirm(`${slotIdx + 1}번 칸의 기록을 지우고 새로 시작할까?`)) return;
            const slot: Slot = { hero: h.id, difficulty: diff, chapter: 0, carry: freshCarry(h.id), updatedAt: Date.now() };
            sv.slots[slotIdx] = slot;
            sv.active = slotIdx;
            writeSave(sv);
            close();
            // 새 이야기: 짧은 프롤로그부터
            prologue(() => chapterCard(slot));
          },
          open ? {} : { disabled: '' },
        );
      }),
    );
    body.replaceChildren(el('h4', {}, '저장 칸'), slots, el('h4', {}, '난이도'), diffs, el('h4', {}, '누가 틈 앞에 서는가'), heroes);
  };
  render();
  const { root, close } = modal('스토리 — 새로 시작');
  root.querySelector('.modal-box')!.classList.add('wide');
  root.querySelector('.modal-box')!.insertBefore(body, root.querySelector('.modal-close'));
}


/** 무공 그림: 카드 무공은 카드 그림, 손으로 맞춘 무공·심법은 무공 아이콘 시트(icons_teum_skills_1~4) */
function skillArt(id: string): string | null {
  const card = WEAPONS.get(id)?.card ?? PASSIVES.get(id)?.card;
  if (card) return cardArtUrl(card);
  const i = SKILL_ICON.get(id);
  if (i === undefined) return null;
  return i < 35 ? realArt(`icons_teum_skills_${Math.floor(i / 16) + 1}`, (i % 16) + 1) : realArt('icons_teum_skills_4', i - 35 + 1);
}
/** 효과 배지(2026-11-21 7차 "효과 표시를 명확하게"): 속성마다 색·글자가 다르다 */
const ELEM = { fire: ['炎', '화염'], ice: ['霜', '서리'], shock: ['雷', '뇌전'], vuln: ['破', '파쇄'] } as const;
function elemBadge(e: keyof typeof ELEM | undefined, withName = true): HTMLElement | string {
  if (!e) return '';
  return el('span', { class: `elem e-${e}`, title: RULES.sets[e].desc }, el('i', {}, ELEM[e][0]), withName ? ELEM[e][1] : '');
}
/** 무공·심법 카드(그림 · 등급 · 갈래 · 이름 · 효과 · 한 줄 설명 · 숫자) — 재편성·무공록·장터가 같이 쓴다 */
function skillCard(id: string, opts: { lv?: number; extra?: (HTMLElement | string)[]; cls?: string; compact?: boolean } = {}): HTMLElement {
  const w = WEAPONS.get(id);
  const pd = PASSIVES.get(id);
  const g = gradeOf(id);
  const r = roleOf(id);
  const ic = el('span', { class: `role role-${r.key}` });
  ic.innerHTML = roleIcon(r.key);
  const art = skillArt(id);
  const info = describe(id);
  const lv = opts.lv;
  const nums = lv ? keyNumbers(id, lv).map((n) => `${n.label} ${n.to}`).join(' · ') : w ? `피해 ${w.levels[0].damage}→${w.levels[w.levels.length - 1].damage} · 대기 ${w.levels[w.levels.length - 1].cooldown}초` : keyNumbers(id, pd!.max).map((n) => `${n.label} ${n.to}(최대)`).join('');
  return el(
    'div',
    { class: `skc${opts.compact ? ' compact' : ''} ${opts.cls ?? ''}`, style: w ? `--c:${w.color}` : '' },
    el('div', { class: 'skc-art' }, art ? el('img', { src: art, alt: '', loading: 'lazy' }) : el('span', { class: 'skc-glyph' }, (w?.name ?? pd?.name ?? '?')[0]), el('span', { class: `grade g-${g === '극' ? 'X' : g}` }, g)),
    el(
      'div',
      { class: 'skc-body' },
      el('div', { class: 'skc-head' }, ic, el('b', {}, w?.name ?? pd?.name ?? id), lv ? el('span', { class: 'lv' }, `Lv.${lv}`) : ''),
      el('div', { class: 'skc-tags' }, el('span', { class: 'kind' }, r.name), elemBadge(w?.element), w?.evolve ? el('span', { class: 'evo-t' }, '각성 가능') : ''),
      opts.compact ? '' : el('p', {}, info.lines[0] ?? ''),
      el('small', { class: 'nums' }, nums),
      ...(opts.extra ?? []),
    ),
  );
}

/** 프롤로그(2026-11-21 7차): 스토리를 새로 시작할 때 그림 넷 + 두 줄 이야기 — 누르면 다음, 건너뛰기 */
function prologue(onDone: () => void): void {
  stopRun?.();
  const pages = (STORY as unknown as { prologue: { cg: string; fallback: string; text: string }[] }).prologue ?? [];
  let i = 0;
  const show = () => {
    if (i >= pages.length) return onDone();
    const pg = pages[i];
    const img = realArt(pg.cg) ?? realArt(pg.fallback);
    const next = btn(i === pages.length - 1 ? '시작한다' : '다음', 'btn primary', () => (i++, show()));
    app.replaceChildren(
      el(
        'section',
        { class: 'screen prologue', style: img ? `--cg:url("${img}")` : '' },
        el('div', { class: 'pro-text' }, el('small', {}, `${i + 1} / ${pages.length}`), el('p', {}, pg.text), el('div', { class: 'menu-row' }, next, btn('건너뛰기', 'btn ghost', onDone))),
      ),
    );
    screenKeys = (e) => {
      if (e.key === 'Enter' || e.key === ' ') next.click();
      if (e.key === 'Escape') onDone();
    };
    next.focus();
  };
  show();
}

/** 무한 모드(2026-11-21 7차): 인물 고르기 · 무공록 · 기록 · 규칙 요약 */
function endlessPopup(): void {
  const sv = loadSave();
  let hero = sv.endless?.hero ?? HEROES[0].id;
  const body = el('div', { class: 'endless' });
  const slotOf = (): Slot => ({ hero, difficulty: 'normal', chapter: 0, carry: freshCarry(hero), updatedAt: Date.now() });
  const E = RULES.endless;
  const render = () => {
    const best = sv.endlessBest ?? {};
    const heroes = el(
      'div',
      { class: 'heroes compact' },
      ...HEROES.map((h) => {
        const open = heroOpen(sv, h.id, ALL);
        const art = realArt(h.stand) ?? frameUrl(`${h.sprite}_idle`, 1);
        return btn([el('div', { class: 'portrait' }, art ? el('img', { src: art, alt: '' }) : ''), el('b', {}, h.name), el('small', {}, best[h.id] ? `최고 ${fmt(best[h.id])}` : '기록 없음'), open ? '' : el('small', { class: 'lock' }, `🔒 ${h.unlock?.text}`)], `hero${open ? '' : ' locked'}${hero === h.id ? ' on' : ''}`, () => open && ((hero = h.id), render()), open ? {} : { disabled: '' });
      }),
    );
    const P = E.pool;
    body.replaceChildren(
      el('p', { class: 'b2-lead' }, STORY.endless.line),
      el(
        'ul',
        { class: 'rules' },
        el('li', {}, `${E.event[0] / 60}~${E.event[1] / 60}분마다 돌발 이벤트, ${E.boss.every / 60}분마다 보스 — ${Math.floor(E.boss.enrage / 60)}분 ${E.boss.enrage % 60}초 안에 못 잡으면 광폭화`),
        el('li', {}, `무공 ${E.slots.weapons}칸 · 심법 ${E.slots.passives}칸(스토리의 두 배 가까이)`),
        el('li', {}, `무공은 판마다 무작위로 ${P.weapons[0] + P.passives[0]}~${P.weapons[1] + P.passives[1]}종이 정해진다 — 인물의 무공 갈래는 지킨다(무공록·잠김과 상관없이)`),
        el('li', {}, `떠돌이 상인의 수레(${E.shop.stay}초)·수련소(${E.dojo.stay}초)가 판 위에 선다 — 들어가면 그 판에 없는 무공·다른 문파 무공을 판다`),
        el('li', {}, '전용 맵 「갈라진 들」 — 허공 균열·바위 조각·오염된 땅(느려짐)'),
      ),
      el('h4', {}, '누가 버티는가'),
      heroes,
      el(
        'div',
        { class: 'menu-row' },
        btn('들어간다', 'btn primary big', () => {
          close();
          void play(slotOf(), false, true);
        }),
      ),
    );
  };
  render();
  const { root, close } = modal('무한 모드');
  root.querySelector('.modal-box')!.classList.add('wide');
  root.querySelector('.modal-box')!.insertBefore(body, root.querySelector('.modal-close'));
}

const LOCK_SET = new Set(LOCKABLE);
/** 연 카드 무공·심법: 「틈」에서 연 것 + 「천외귀환」에서 모은 카드(2026-11-21) */
function openCards(sv: SaveData): Set<string> {
  return new Set([...sv.unlocked, ...cheonoeCards().map((id) => `c_${id}`).filter((id) => LOCK_SET.has(id))]);
}
/** 무공록 자동(2026-11-21 6차): 빈 무공록에서 추천 1순위를 하나씩 — 무공 칸을 다 채우고 심법 칸을 채운다(세트·균형·능력치가 저절로 맞는다) */
function autoBook(heroId: string, open: Set<string>): string[] {
  const deck: string[] = [];
  for (let i = 0; i < BOOK_SLOTS.weapons; i++) {
    const top = suggest(heroId, open, deck, 'weapon')[0];
    if (!top) break;
    deck.push(top.id);
  }
  for (let i = 0; i < BOOK_SLOTS.passives; i++) {
    const top = suggest(heroId, open, deck, 'passive')[0];
    if (!top) break;
    deck.push(top.id);
  }
  return deck;
}
const bookOf = (slot: Slot, sv: SaveData): string[] => (slot.book ?? autoBook(slot.hero, openCards(sv))).slice(0, RULES.build.bookMax);

/** 무공서고(2026-11-21 사용자 "스킬을 처음부터 다 열지 말고 돈으로 사거나 보스를 잡으면 열리게"):
 *  금화 지갑으로 잠긴 「천외귀환」 카드 무공·심법을 연다. 진열은 지갑 시드로 정해지고, 다시 펼치면 바뀐다 */
function shopPopup(initial: 'up' | 'book' = 'up'): void {
  // 2026-11-21 7차 전면 개편: 장터 = 가게 둘(수련 도장 · 비급 서고), 물건은 값표 붙은 판, 지갑은 엽전 주머니
  const sv = loadSave();
  sv.upgrades ??= {};
  const U = RULES.unlock;
  let tab = initial;
  const body = el('div', { class: 'market' });
  const render = () => {
    const purse = el('div', { class: 'purse' }, el('span', { class: 'coin' }, '錢'), el('b', {}, String(sv.wallet)), el('small', {}, '금화'));
    const signs = el(
      'div',
      { class: 'signs' },
      btn([el('i', {}, '道'), el('b', {}, '수련 도장'), el('small', {}, '영구 능력')], `sign${tab === 'up' ? ' on' : ''}`, () => ((tab = 'up'), render())),
      btn([el('i', {}, '書'), el('b', {}, '비급 서고'), el('small', {}, '카드 무공 열기')], `sign${tab === 'book' ? ' on' : ''}`, () => ((tab = 'book'), render())),
    );
    const head = el('div', { class: 'market-head' }, signs, purse);
    if (tab === 'up') {
      const goods = el(
        'div',
        { class: 'goods' },
        ...RULES.upgrades.list.map((u) => {
          const lv = sv.upgrades[u.id] ?? 0;
          const max = u.cost.length;
          const price = u.cost[lv];
          const poor = price === undefined || sv.wallet < price;
          return el(
            'div',
            { class: `good up${price === undefined ? ' done' : ''}` },
            el('b', {}, u.name),
            el('p', {}, u.desc),
            el('div', { class: 'pips' }, ...Array.from({ length: max }, (_, i) => el('span', { class: i < lv ? 'on' : '' }))),
            price === undefined
              ? el('span', { class: 'tag done' }, '다 배웠다')
              : btn([el('span', { class: 'coin' }, '錢'), String(price)], `tag${poor ? ' poor' : ''}`, () => {
                  if (sv.wallet < price) return;
                  sv.wallet -= price;
                  sv.upgrades[u.id] = lv + 1;
                  writeSave(sv);
                  render();
                }, poor ? { disabled: '' } : {}),
          );
        }),
      );
      body.replaceChildren(head, el('p', { class: 'market-note' }, '장에서 모은 금화가 지갑으로 온다. 배운 수련은 모든 인물 · 모든 장 · 무한 모드에 듣는다.'), goods);
      return;
    }
    const open = openCards(sv);
    const locked = LOCKABLE.filter((id) => !open.has(id));
    const rng = createRng(`teum-shop:${sv.shopSeed}`);
    const pool = [...locked];
    const offers: string[] = [];
    while (offers.length < U.shop.offers && pool.length) offers.push(pool.splice(rng.int(0, pool.length - 1), 1)[0]);
    const goods = el(
      'div',
      { class: 'goods books' },
      ...offers.map((id) => {
        const w = WEAPONS.get(id);
        const r = rarityOf(id);
        const price = U.price[r] ?? 60;
        const poor = sv.wallet < price;
        const owner = w && w.owner !== '*' ? `${HEROES.find((h) => h.id === w.owner)?.name ?? ''} 전용` : '';
        return skillCard(id, {
          cls: 'good',
          extra: [
            owner ? el('small', { class: 'owner' }, owner) : '',
            btn([el('span', { class: 'coin' }, '錢'), String(price)], `tag${poor ? ' poor' : ''}`, () => {
              if (sv.wallet < price) return;
              sv.wallet -= price;
              sv.unlocked = [...sv.unlocked, id];
              writeSave(sv);
              render();
            }, poor ? { disabled: '' } : {}),
          ],
        });
      }),
    );
    body.replaceChildren(
      head,
      el(
        'div',
        { class: 'market-note row' },
        el('span', {}, `연 비급 ${LOCKABLE.length - locked.length} / ${LOCKABLE.length} — 보스는 ${U.boss}개, 중간 보스는 ${U.mid}개를 떨군다. 「천외귀환」에서 모은 카드도 열린 것으로 친다.`),
        btn('새 물건 펼치기 · 錢 ' + U.shop.reroll, 'btn small ghost', () => {
          if (sv.wallet < U.shop.reroll) return;
          sv.wallet -= U.shop.reroll;
          sv.shopSeed++;
          writeSave(sv);
          render();
        }, sv.wallet < U.shop.reroll ? { disabled: '' } : {}),
      ),
      locked.length ? goods : el('p', {}, '모든 비급을 열었다.'),
    );
  };
  render();
  const { root } = modal('장터');
  root.querySelector('.modal-box')!.classList.add('wide', 'market-box');
  root.querySelector('.modal-box')!.insertBefore(body, root.querySelector('.modal-close'));
}

/** 무공록(2026-11-21 6차 전면 개편 — "무공록 고르기가 여전히 불편"):
 *  긴 목록에서 찾는 대신 ① 싸우는 방식 고르기 → ② 무공 10칸·심법 6칸 보기 → ③ 칸을 누르면 그 칸에 잘 맞는 후보 8개(까닭 칩)에서 바꾸기.
 *  전체 목록은 「모두 보기」에서만. 조언 줄이 모자란 것을 알려 준다. */
function bookPopup(slot: Slot, onDone: () => void, saveTo?: (book: string[]) => void): void {
  const sv = loadSave();
  const open = openCards(sv);
  let pick = new Set(bookOf(slot, sv));
  const recs = presets(slot.hero, open);
  let style = '';
  let active: { kind: 'weapon' | 'passive'; id?: string } | null = null;
  let showAll = false;
  let query = '';
  const body = el('div', { class: 'book2' });
  const search = el('input', { type: 'search', placeholder: '이름으로 찾기', class: 'book-search' }) as HTMLInputElement;
  search.addEventListener('input', () => {
    query = search.value.trim();
    render();
    search.focus();
    search.setSelectionRange(search.value.length, search.value.length);
  });
  const iconOf = (id: string) => {
    const r = roleOf(id);
    const i = el('span', { class: `role role-${r.key}` });
    i.innerHTML = roleIcon(r.key);
    return i;
  };
  const gradeEl = (id: string) => el('span', { class: `grade g-${gradeOf(id) === '극' ? 'X' : gradeOf(id)}` }, gradeOf(id));
  // 카드 그림 + 등급(2026-11-21 7차 "스킬 사진이 다 없어졌다")
  const thumb = (id: string) => {
    const a = skillArt(id);
    return el('span', { class: 'thumb2' }, a ? el('img', { src: a, alt: '' }) : el('i', {}, (WEAPONS.get(id)?.name ?? PASSIVES.get(id)?.name ?? '?')[0]), gradeEl(id));
  };
  const shortNums = (id: string) => {
    const w = WEAPONS.get(id);
    if (w) {
      const z = w.levels[w.levels.length - 1];
      return `${w.kind === 'heal' ? '회복' : '피해'} ${w.levels[0].damage}→${z.damage} · ${z.cooldown}초${z.count > 1 ? ` · ${z.count}개` : ''}`;
    }
    const pd = PASSIVES.get(id)!;
    return keyNumbers(id, pd.max).map((n) => `${n.label} ${n.to}`).join('');
  };
  const put = (id: string) => {
    const { weapons, passives } = splitBook(pick);
    const isW = WEAPONS.has(id);
    if (active?.id) pick.delete(active.id);
    else if (isW ? weapons.length >= BOOK_SLOTS.weapons : passives.length >= BOOK_SLOTS.passives) return;
    pick.add(id);
    active = null;
    style = '';
    render();
  };
  const render = () => {
    const { weapons, passives } = splitBook(pick);
    pick = new Set([...weapons, ...passives]);
    // ① 싸우는 방식
    const auto = autoBook(slot.hero, open);
    const styles = el(
      'div',
      { class: 'b2-styles' },
      ...[{ id: 'auto', name: '알아서', desc: '등급·세트·균형을 맞춰 자동으로', ids: auto }, ...recs].map((r) => {
        const sC = r.ids.filter((id) => ['S', '극'].includes(gradeOf(id))).length;
        const ic = el('span', { class: 'role' });
        ic.innerHTML = roleIcon(r.id === 'ranged' ? 'shot' : r.id === 'close' ? 'close' : r.id === 'grand' ? 'passive' : r.id === 'auto' ? 'spin' : 'line');
        return btn([ic, el('b', {}, r.name), el('small', {}, r.desc), el('small', { class: 'cnt' }, `무공 ${r.ids.filter((x) => WEAPONS.has(x)).length} · 심법 ${r.ids.filter((x) => PASSIVES.has(x)).length}${sC ? ` · S급 ${sC}` : ''}`)], `b2-style${style === r.id ? ' on' : ''}`, () => {
          pick = new Set(r.ids);
          style = r.id;
          active = null;
          render();
        });
      }),
    );
    // ② 칸
    const slotEl = (kind: 'weapon' | 'passive', id: string | undefined, i: number) => {
      const on = active && active.kind === kind && active.id === id && (id || i === -1);
      if (!id)
        return btn([el('span', { class: 'plus' }, '+'), el('small', {}, kind === 'weapon' ? '무공 넣기' : '심법 넣기')], `b2-slot empty${active && !active.id && active.kind === kind ? ' on' : ''}`, () => ((active = { kind }), render()));
      const w = WEAPONS.get(id);
      const pd = PASSIVES.get(id);
      return btn(
        [thumb(id), iconOf(id), el('span', { class: 'sn' }, el('b', {}, w?.name ?? pd?.name ?? id), el('small', {}, roleOf(id).name, ' ', elemBadge(w?.element, false)))],
        `b2-slot${on ? ' on' : ''}`,
        () => ((active = on ? null : { kind, id }), render()),
        { style: w ? `--c:${w.color}` : '', title: describe(id).lines.join('\n') },
      );
    };
    const deck = el(
      'div',
      { class: 'b2-deck' },
      el('h5', {}, `무공 ${weapons.length}/${BOOK_SLOTS.weapons}`),
      el('div', { class: 'b2-slots' }, ...Array.from({ length: BOOK_SLOTS.weapons }, (_, i) => slotEl('weapon', weapons[i], i))),
      el('h5', {}, `심법 ${passives.length}/${BOOK_SLOTS.passives}`),
      el('div', { class: 'b2-slots' }, ...Array.from({ length: BOOK_SLOTS.passives }, (_, i) => slotEl('passive', passives[i], i))),
    );
    // ③ 후보(칸을 눌렀을 때)
    let picker: HTMLElement | string = '';
    if (active) {
      const cur = active.id;
      const sug = suggest(slot.hero, open, pick, active.kind, cur);
      const list = showAll ? sug.filter((x) => !query || (WEAPONS.get(x.id)?.name ?? PASSIVES.get(x.id)?.name ?? '').includes(query)) : sug.slice(0, 8);
      const curInfo = cur ? describe(cur) : null;
      picker = el(
        'div',
        { class: 'b2-picker' },
        el(
          'div',
          { class: 'b2-ph' },
          el('b', {}, cur ? `「${curInfo!.name}」 대신 넣을 것` : `빈 칸에 넣을 ${active.kind === 'weapon' ? '무공' : '심법'}`),
          cur ? btn('이 칸 비우기', 'btn small ghost', () => (pick.delete(cur), (active = null), (style = ''), render())) : '',
          btn(showAll ? '추천만 보기' : `모두 보기(${sug.length})`, 'btn small ghost', () => ((showAll = !showAll), render())),
          showAll ? search : '',
          btn('닫기', 'btn small ghost', () => ((active = null), render())),
        ),
        cur ? el('p', { class: 'b2-cur' }, `지금: ${curInfo!.lines[0]} — ${shortNums(cur)}`) : '',
        el(
          'div',
          { class: 'b2-cands' },
          ...list.map((x) => {
            const w = WEAPONS.get(x.id);
            const info = describe(x.id);
            return btn(
              [
                thumb(x.id),
                iconOf(x.id),
                el('span', { class: 'sn' }, el('b', {}, info.name, ' ', elemBadge(w?.element)), el('small', {}, info.lines[0] ?? ''), el('small', { class: 'nums' }, shortNums(x.id))),
                el('span', { class: 'why' }, ...x.why.slice(0, 3).map((t) => el('i', {}, t))),
              ],
              'b2-cand',
              () => put(x.id),
              { style: w ? `--c:${w.color}` : '' },
            );
          }),
          list.length ? '' : el('p', { class: 'note' }, '넣을 수 있는 것이 없다 — 보스를 잡거나 장터에서 비급을 사라'),
        ),
      );
    }
    const tips = advice(pick);
    const sum = bookSummary(pick);
    body.replaceChildren(
      el('p', { class: 'b2-lead' }, '이번 장에 들고 갈 「천외귀환」 카드 무공·심법. 레벨업에는 여기 든 것과 이 인물의 기본 무공·기본 심법만 나온다.'),
      el('h4', {}, '① 싸우는 방식'),
      styles,
      el('h4', {}, '② 들고 갈 것 — 칸을 누르면 바꿀 것을 추천한다'),
      el('div', { class: 'b2-sum' }, ...sum.sets.map((x) => el('span', { class: `chip-s${x.n >= x.need ? ' on' : ''}` }, `${x.name} ${x.n}/${x.need}`)), el('span', { class: 'chip-s' }, `멀리 ${sum.ranged} · 둘레 ${sum.close}`)),
      deck,
      picker,
      tips.length ? el('ul', { class: 'b2-tips' }, ...tips.map((t) => el('li', {}, t))) : el('p', { class: 'b2-ok' }, '좋은 편성이다'),
    );
    picker && (body.querySelector('.b2-picker') as HTMLElement | null)?.scrollIntoView({ block: 'nearest' });
  };
  render();
  const { root, close } = modal('무공록 — 편성');
  root.querySelector('.modal-box')!.classList.add('wide', 'book-box');
  root.querySelector('.modal-box')!.insertBefore(body, root.querySelector('.modal-close'));
  const done = () => {
    slot.book = [...pick];
    if (saveTo) saveTo(slot.book);
    else {
      const s2 = loadSave();
      s2.slots[s2.active] = { ...slot };
      writeSave(s2);
    }
    onDone();
  };
  const closeBtn = root.querySelector('.modal-close') as HTMLButtonElement;
  closeBtn.textContent = '이대로 들고 간다';
  closeBtn.addEventListener('click', done);
  root.addEventListener('click', (e) => e.target === root && done());
  void close;
}

/** 재편성(2026-11-21 7차 전면 개편 — "효과 설명 없이 레벨만"): 가진 무공·심법을 카드로(그림·등급·효과·지금 수치),
 *  둘까지 골라 내려놓으면 장을 열자마자 그만큼 새로 고른다. 무엇을 잃고 무엇을 받는지 아래에 적는다 */
function rebuildPopup(slot: Slot, onDone: () => void): void {
  const drop = new Set<string>();
  const body = el('div', { class: 'rebuild2' });
  const render = () => {
    const card = (id: string, lv: number) => {
      const on = drop.has(id);
      const c = skillCard(id, { lv, cls: `pickable${on ? ' dropped' : ''}`, extra: [el('span', { class: 'drop-mark' }, on ? '내려놓는다' : '')] });
      c.tabIndex = 0;
      c.addEventListener('click', () => {
        if (on) drop.delete(id);
        else if (drop.size < 2) drop.add(id);
        render();
      });
      return c;
    };
    const lost = [...drop].map((id) => WEAPONS.get(id)?.name ?? PASSIVES.get(id)?.name ?? id);
    body.replaceChildren(
      el('p', { class: 'b2-lead' }, '쓸모없어진 무공·심법을 둘까지 내려놓는다. 장을 열자마자 내려놓은 수만큼 레벨업 고르기가 나온다(무공록에서).'),
      el('h4', {}, `무공 ${slot.carry.weapons.length}`),
      el('div', { class: 'skc-grid' }, ...slot.carry.weapons.map((w) => card(w.id, w.lv))),
      slot.carry.passives.length ? el('h4', {}, `심법 ${slot.carry.passives.length}`) : '',
      el('div', { class: 'skc-grid' }, ...slot.carry.passives.map(([id, lv]) => card(id, lv))),
      el(
        'div',
        { class: 'rb-foot' },
        el('p', {}, drop.size ? `잃는 것: ${lost.join(' · ')} → 받는 것: 장을 열자마자 레벨업 고르기 ${drop.size}번` : '내려놓을 것을 누른다(둘까지)'),
        el(
          'div',
          { class: 'menu-row' },
          btn(drop.size ? `${drop.size}개 내려놓고 재편성` : '재편성 안 함', 'btn primary', () => {
            if (!drop.size) return void close();
            slot.carry = { ...slot.carry, weapons: slot.carry.weapons.filter((w) => !drop.has(w.id)), passives: slot.carry.passives.filter(([id]) => !drop.has(id)) };
            slot.rebuild = (slot.rebuild ?? 0) + drop.size;
            const sv = loadSave();
            sv.slots[sv.active] = { ...slot };
            writeSave(sv);
            close();
            onDone();
          }),
        ),
      ),
    );
  };
  render();
  const { root, close } = modal('재편성 — 내려놓고 새로 받기');
  root.querySelector('.modal-box')!.classList.add('wide');
  root.querySelector('.modal-box')!.insertBefore(body, root.querySelector('.modal-close'));
}

function codexPopup(): void {
  const sv = loadSave();
  let tab: 'foes' | 'weapons' | 'passives' | 'items' | 'steles' = 'foes';
  const openSet = new Set(sv.unlocked);
  const lockable = new Set(LOCKABLE);
  const isLocked = (id: string) => !ALL && lockable.has(id) && !openSet.has(id);
  const body = el('div', { class: 'codex' });
  const render = () => {
    const tabs = el('div', { class: 'row-pick' }, ...([['foes', '그림자'], ['weapons', '무공'], ['passives', '심법'], ['items', '줍는 것'], ['steles', '비석']] as const).map(([k, n]) => btn(n, `chip${tab === k ? ' on' : ''}`, () => ((tab = k), render()))));
    let list: HTMLElement[];
    if (tab === 'foes') {
      list = STORY.chapters.flatMap((c) => {
        const ids = [...new Set([...Object.values(c.roles).flat(), c.roles.mid, c.roles.boss])].filter((id) => FOES.has(id));
        return [
          el('h4', {}, c.name),
          el(
            'div',
            { class: 'grid' },
            ...ids.map((id) => {
              const f = FOES.get(id)!;
              const seen = sv.seen.includes(id);
              const img = frameUrl(`${f.sprite}_idle`, 1);
              return el('div', { class: `entry${seen ? '' : ' unseen'}`, title: seen ? (enemyLore.get(f.ref ?? '') ?? '') : '아직 만나지 못했다' }, img ? el('img', { src: img, alt: '' }) : '', el('b', {}, seen ? f.name : '???'), el('small', {}, f.rank === 'boss' ? '보스' : f.rank === 'elite' ? '중간 보스' : ''));
            }),
          ),
        ];
      });
    } else if (tab === 'weapons') {
      const ws = [...WEAPONS.values()];
      list = [el('p', { class: 'note' }, `무공 ${ws.length}개 — 손으로 맞춘 ${ws.filter((w) => !w.card).length} · 「천외귀환」 카드 ${ws.filter((w) => w.card).length}`), el('div', { class: 'grid text' }, ...ws.map((w) => { const a = cardArtUrl(w.card ?? ''); const lk = isLocked(w.id); return el('div', { class: `entry${lk ? ' locked' : ''}`, style: `--c:${w.color}` }, a ? el('img', { class: 'thumb', src: a, alt: '', loading: 'lazy' }) : '', el('b', {}, `${lk ? '🔒 ' : ''}${w.name}${w.evolved ? ' ★' : ''}`), el('small', {}, `${w.owner === '*' ? '모두' : (HEROES.find((h) => h.id === w.owner)?.name ?? '')} · ${KIND_NAME[w.kind]}`), el('small', {}, w.desc)); }))];
    } else if (tab === 'steles') {
      // 안개 속 비석(2026-11-21): 원작 이야기 조각
      const got = new Set(sv.steles ?? []);
      list = [
        el('p', { class: 'note' }, `비석 ${got.size} / ${STORY.chapters.reduce((a, c) => a + (c.steles?.length ?? 0), 0)} — 안개 속에 숨어 있다`),
        ...STORY.chapters.flatMap((c) => [el('h4', {}, c.name), el('div', { class: 'grid text' }, ...(c.steles ?? []).map((t, i) => el('div', { class: `entry${got.has(`${c.id}-${i}`) ? '' : ' locked'}` }, el('small', {}, got.has(`${c.id}-${i}`) ? t : '??? — 아직 읽지 못한 비석'))))]),
      ];
    } else if (tab === 'items') {
      const its = [...ITEMS.values()];
      list = [el('p', { class: 'note' }, `줍는 것 ${its.length}가지 — 그림자·항아리에서 나오거나, 돌발 이벤트로 놓인다`), el('div', { class: 'grid text' }, ...its.map((it) => el('div', { class: 'entry', style: `--c:${it.color}` }, el('span', { class: 'glyph-big' }, it.glyph), el('b', {}, it.name), el('small', {}, it.desc), it.event ? el('small', {}, '돌발 이벤트') : '')))];
    } else {
      const ps = [...PASSIVES.values()];
      list = [el('p', { class: 'note' }, `심법 ${ps.length}개`), el('div', { class: 'grid text' }, ...ps.map((p) => { const a = cardArtUrl(p.card ?? ''); const lk = isLocked(p.id); return el('div', { class: `entry${lk ? ' locked' : ''}` }, a ? el('img', { class: 'thumb', src: a, alt: '', loading: 'lazy' }) : '', el('b', {}, `${lk ? '🔒 ' : ''}${p.name}`), el('small', {}, `${p.desc} · 최대 Lv.${p.max}`)); }))];
    }
    body.replaceChildren(tabs, el('div', { class: 'codex-list' }, ...list));
  };
  render();
  const { root } = modal('도감');
  root.querySelector('.modal-box')!.classList.add('wide');
  root.querySelector('.modal-box')!.insertBefore(body, root.querySelector('.modal-close'));
}

/** 옷장: 인물마다 「천외귀환」·「결」 옷 중 그림이 있는 것을 고른다 */
const OUTFITS = (progressRaw as unknown as { outfits: { id: string; name: string; chars?: string[]; sprite?: string }[] }).outfits;
export function outfitPrefix(sv: SaveData, heroId: string): string | null {
  const id = sv.outfits[heroId];
  const o = id ? OUTFITS.find((x) => x.id === id) : null;
  if (!o) return null;
  const prefix = o.sprite ?? `skin_${o.id}_${heroId}`;
  return realArt(`${prefix}_idle`) ? prefix : null;
}
function wardrobePopup(): void {
  const sv = loadSave();
  let cur = HEROES[0].id;
  const body = el('div', { class: 'wardrobe' });
  const render = () => {
    const tabs = el('div', { class: 'row-pick' }, ...HEROES.map((h) => btn(h.name, `chip${cur === h.id ? ' on' : ''}`, () => ((cur = h.id), render()))));
    const hero = HEROES.find((h) => h.id === cur)!;
    const options = [{ id: '', name: '기본', prefix: hero.sprite }, ...OUTFITS.filter((o) => o.id !== 'base' && (!o.chars || o.chars.includes(cur))).map((o) => ({ id: o.id, name: o.name, prefix: o.sprite ?? `skin_${o.id}_${cur}` }))].filter((o) => realArt(`${o.prefix}_idle`) || !o.id);
    const grid = el(
      'div',
      { class: 'grid' },
      ...options.map((o) => {
        const img = frameUrl(`${o.prefix}_idle`, 1);
        return btn([img ? el('img', { src: img, alt: '' }) : '', el('b', {}, o.name)], `entry pick${(sv.outfits[cur] ?? '') === o.id ? ' on' : ''}`, () => {
          if (o.id) sv.outfits[cur] = o.id;
          else delete sv.outfits[cur];
          writeSave(sv);
          render();
        });
      }),
    );
    body.replaceChildren(tabs, el('p', { class: 'note' }, '「천외귀환」·「결」에서 쓰는 옷 그림을 그대로 입는다. 걷기 그림이 없는 옷은 대기 그림으로 걷는다.'), grid);
  };
  render();
  const { root } = modal('옷장');
  root.querySelector('.modal-box')!.classList.add('wide');
  root.querySelector('.modal-box')!.insertBefore(body, root.querySelector('.modal-close'));
}

function optionsPopup(onClose?: () => void): void {
  // 2026-11-22 전면 개편: 탭 넷(화면 · 소리 · 조작 · 기록), 소리 크기 막대, 키 설정
  const sv = loadSave();
  const row = (label: string, input: HTMLElement, note?: string) => el('label', { class: 'opt' }, el('span', {}, label, note ? el('small', {}, note) : ''), input);
  const toggle = (key: 'shake' | 'numbers') => {
    const c = el('input', { type: 'checkbox', class: 'switch' });
    c.checked = sv.options[key];
    c.addEventListener('change', () => {
      sv.options[key] = c.checked;
      writeSave(sv);
    });
    return c;
  };
  const range = (value: number, onInput: (v: number) => void, min = 0, max = 100, step = 5) => {
    const r = el('input', { type: 'range', min: String(min), max: String(max), step: String(step) }) as HTMLInputElement;
    const v = el('small', { class: 'val' }, `${Math.round(value)}%`);
    r.value = String(Math.round(value));
    r.addEventListener('input', () => {
      v.textContent = `${r.value}%`;
      onInput(Number(r.value));
    });
    return el('span', { class: 'range' }, r, v);
  };
  const seg = <T extends string>(value: T, opts: [T, string][], onPick: (v: T) => void) => {
    const box = el('span', { class: 'seg' });
    const draw = (cur: T) =>
      box.replaceChildren(
        ...opts.map(([id, name]) =>
          btn(name, `seg-b${cur === id ? ' on' : ''}`, () => {
            onPick(id);
            draw(id);
          }),
        ),
      );
    draw(value);
    return box;
  };
  // 화면
  const screenTab = el(
    'div',
    { class: 'opts' },
    row('화면 흔들림', toggle('shake'), '치명타·폭발·보스에서 화면이 울린다'),
    row('피해 숫자', toggle('numbers')),
    row('지도 크기', seg(sv.options.map, [['small', '작게'], ['large', '크게']], (v) => ((sv.options.map = v), writeSave(sv)))),
    row('내 무공 이펙트 불투명도', range((sv.options.fxAlpha ?? { strong: 1, normal: 0.7, soft: 0.42 }[sv.options.fx ?? 'normal']) * 100, (v) => ((sv.options.fxAlpha = v / 100), writeSave(sv)), 15, 100)),
    row('몸 둘레 범위 기술', seg(sv.options.areaFx ?? 'clean', [['clean', '깔끔하게'], ['simple', '선만'], ['fancy', '화려하게']], (v) => ((sv.options.areaFx = v), writeSave(sv)))),
  );
  // 소리
  const snd = { ...DEFAULT_SOUND, ...sv.options.sound };
  const setSnd = (k: keyof typeof snd, v: number) => {
    snd[k] = v / 100;
    sv.options.sound = { ...snd };
    writeSave(sv);
    setSound(snd);
  };
  const soundTab = el(
    'div',
    { class: 'opts' },
    row('전체 소리', range(snd.master * 100, (v) => setSnd('master', v))),
    row('배경 음악', range(snd.bgm * 100, (v) => setSnd('bgm', v))),
    row('효과음', range(snd.sfx * 100, (v) => (setSnd('sfx', v), sfx('gem')))),
    el('p', { class: 'note' }, '소리는 처음 누르거나 키를 칠 때 켜진다(브라우저 규칙).'),
  );
  // 조작(키 설정)
  const keysBox = el('div', { class: 'keys' });
  let waiting: { action: Action; slot: 0 | 1; b: HTMLButtonElement } | null = null;
  const map = keyMap(sv.options.keys as Partial<KeyMap>);
  const drawKeys = () => {
    keysBox.replaceChildren(
      ...(['move', 'skill', 'menu'] as const).map((g) =>
        el(
          'div',
          { class: 'key-group' },
          el('h4', {}, g === 'move' ? '움직임' : g === 'skill' ? '기술' : '레벨업 창'),
          ...ACTIONS.filter((a) => a.group === g).map((a) =>
            el(
              'div',
              { class: 'key-row' },
              el('span', {}, a.name),
              ...([0, 1] as const).map((slot) => {
                const b = btn(keyLabel(map[a.id][slot]), `keycap${map[a.id][slot] ? '' : ' empty'}`, () => {
                  waiting?.b.classList.remove('wait');
                  waiting = { action: a.id, slot, b };
                  b.classList.add('wait');
                  b.textContent = '키를 누르세요';
                });
                return b;
              }),
            ),
          ),
        ),
      ),
      el(
        'div',
        { class: 'menu-row' },
        btn('기본으로 되돌리기', 'btn small ghost', () => {
          Object.assign(map, DEFAULT_KEYS);
          sv.options.keys = { ...map };
          writeSave(sv);
          drawKeys();
        }),
      ),
      el('p', { class: 'note' }, '키를 누른 칸을 고른 뒤 새 키를 누른다. 다른 동작에 이미 있는 키는 그 동작에서 빠진다. Delete는 보조 키 지우기.'),
    );
  };
  drawKeys();
  const keyListen = (e: KeyboardEvent) => {
    if (!waiting) return;
    e.preventDefault();
    e.stopPropagation();
    const { action, slot } = waiting;
    if (e.code === 'Delete' && slot === 1) map[action] = [map[action][0]];
    else {
      // 같은 무리(판 위·레벨업 창) 안에서 겹치면 다른 동작에서 뺀다
      const grp = ACTIONS.find((a) => a.id === action)!.group === 'menu' ? 'menu' : 'play';
      for (const a of ACTIONS) {
        if ((a.group === 'menu' ? 'menu' : 'play') !== grp || a.id === action) continue;
        const [k0, k1] = map[a.id];
        if (k1 === e.code) map[a.id] = [k0];
        else if (k0 === e.code) map[a.id] = k1 ? [k1] : [DEFAULT_KEYS[a.id][0]];
      }
      const cur = [...map[action]] as [string, string?];
      cur[slot] = e.code;
      map[action] = [cur[0] ?? e.code, cur[1]];
    }
    sv.options.keys = { ...map };
    writeSave(sv);
    waiting = null;
    drawKeys();
  };
  window.addEventListener('keydown', keyListen, { capture: true });
  // 기록
  const tut = btn('처음 안내 다시 보기', 'btn small ghost', () => {
    sv.tutorial = false;
    writeSave(sv);
    tut.textContent = '1장을 열면 다시 나온다';
  });
  const reset = btn('이 기기의 「틈」 기록 모두 지우기', 'btn small danger', () => {
    if (!confirm('저장 칸·도감·옷장·옵션을 모두 지울까?')) return;
    localStorage.removeItem('teum.save');
    location.reload();
  });
  const recordTab = el('div', { class: 'opts' }, row('처음 안내', tut), row('기록 지우기', reset, '되돌릴 수 없다'));
  const tabs: [string, HTMLElement][] = [
    ['화면', screenTab],
    ['소리', soundTab],
    ['조작', keysBox],
    ['기록', recordTab],
  ];
  const body = el('div', { class: 'opt-body' });
  const bar = el('div', { class: 'opt-tabs', role: 'tablist' });
  const show = (i: number) => {
    bar.replaceChildren(...tabs.map(([n], j) => btn(n, `opt-tab${i === j ? ' on' : ''}`, () => show(j), { role: 'tab' })));
    body.replaceChildren(tabs[i][1]);
  };
  show(0);
  const { root, close } = modal('옵션', bar, body);
  root.querySelector('.modal-box')!.classList.add('options-box');
  const done = () => window.removeEventListener('keydown', keyListen, { capture: true });
  const btnClose = root.querySelector('.modal-close') as HTMLButtonElement;
  btnClose.addEventListener('click', () => (done(), onClose?.()));
  root.addEventListener('click', (e) => e.target === root && (done(), onClose?.()));
  void close;
}

// ── 3. 장 카드 ──
function chapterCard(slot: Slot): void {
  stopRun?.();
  const ch = STORY.chapters[slot.chapter];
  const cg = realArt(ch.cg);
  const sv = loadSave();
  const book = bookOf(slot, sv);
  const hero = HEROES.find((h) => h.id === slot.hero)!;
  const diff = STORY.difficulties.find((d) => d.id === slot.difficulty) ?? STORY.difficulties[0];
  const start = btn('들어간다', 'btn primary big', () => void play(slot));
  // 2026-11-21 7차: 왼쪽은 이야기와 입장, 오른쪽은 무공(가진 것 · 무공록 · 편성 · 재편성)
  const left = el(
    'div',
    { class: 'cc-left' },
    el('div', { class: 'cc-chip' }, el('span', {}, `${slot.chapter + 1} / ${STORY.chapters.length}`), el('span', { class: `dz d-${diff.id}` }, diff.name)),
    el('h2', {}, ch.name),
    el('p', { class: 'cc-intro' }, (ch as unknown as { intro?: string }).intro ?? ch.line),
    el('ul', { class: 'cc-facts' }, el('li', {}, `${Math.round(CHAPTER_LENGTH / 60)}분 · 빅웨이브 둘`), el('li', {}, `중간 보스 「${FOES.get(ch.roles.mid)?.name}」 · 보스 「${FOES.get(ch.roles.boss)?.name}」`), ch.gimmick ? el('li', { class: 'gimmick' }, `기믹 — ${ch.gimmick.name}: ${ch.gimmick.text}`) : ''),
    el('div', { class: 'cc-actions' }, start, slot.checkpoint ? btn('중간 보스 뒤에서', 'btn ghost', () => void play(slot, true)) : '', btn('메인으로', 'btn ghost', lobby)),
  );
  const { weapons, passives } = splitBook(book);
  const mini = (id: string) => {
    const w = WEAPONS.get(id);
    const pd = PASSIVES.get(id);
    const a = skillArt(id);
    return el('span', { class: 'mini', title: `${describe(id).name} — ${describe(id).lines[0] ?? ''}` }, a ? el('img', { src: a, alt: '' }) : el('i', {}, (w?.name ?? pd?.name ?? '?')[0]), el('span', { class: `grade g-${gradeOf(id) === '극' ? 'X' : gradeOf(id)}` }, gradeOf(id)));
  };
  const owned = slot.carry.weapons.map((w) => el('span', { class: 'own' }, el('b', {}, WEAPONS.get(w.id)?.name ?? w.id), ` Lv.${w.lv}`));
  const right = el(
    'aside',
    { class: 'cc-right' },
    el('div', { class: 'cc-hero' }, el('img', { src: realArt(hero.stand) ?? frameUrl(`${hero.sprite}_idle`, 1) ?? '', alt: '' }), el('div', {}, el('b', {}, hero.name), el('small', {}, `Lv.${slot.carry.level} · ${hero.dash.glyph} ${hero.dash.name} · ${hero.ult.glyph} ${hero.ult.name}`))),
    el('h4', {}, '가진 무공'),
    el('div', { class: 'cc-owned' }, ...(owned.length ? owned : [el('small', {}, '시작 무공 하나')])),
    el('h4', {}, `무공록 — 무공 ${weapons.length} · 심법 ${passives.length}`),
    el('div', { class: 'cc-book2' }, ...weapons.map(mini), ...passives.map(mini)),
    el(
      'div',
      { class: 'cc-tools' },
      btn('무공록 편성', 'btn', () => bookPopup(slot, () => chapterCard(slot))),
      slot.chapter > 0 && slot.carry.weapons.length + slot.carry.passives.length > 1 ? btn(slot.rebuild ? `재편성 (${slot.rebuild})` : '재편성', 'btn', () => rebuildPopup(slot, () => chapterCard(slot))) : '',
    ),
  );
  app.replaceChildren(el('section', { class: 'screen chapter-card', style: cg ? `--cg:url("${cg}")` : `--cg:linear-gradient(160deg, ${ch.color[2]}, ${ch.color[0]} 60%, ${ch.color[3]})` }, el('div', { class: 'cc-layout' }, left, right)));
  screenKeys = (e) => {
    if (e.key === 'Enter' || e.key === ' ') start.click();
    if (e.key === 'Escape') lobby();
  };
  start.focus();
}

// ── 4. 판 ──
async function play(slot: Slot, fromCheckpoint = false, endless = false): Promise<void> {
  stopRun?.();
  screenKeys = null;
  const sv = loadSave();
  const cp = fromCheckpoint ? slot.checkpoint : undefined;
  const seed = cp?.seed ?? params.get('seed') ?? `${endless ? 'endless' : slot.hero}-${slot.chapter}-${Date.now().toString(36)}`;
  const opts = ALL ? { meta: sv.upgrades, difficulty: slot.difficulty } : { unlocked: openCards(sv), book: bookOf(slot, sv), meta: sv.upgrades, rebuild: cp ? 0 : slot.rebuild, startAt: cp?.t, difficulty: slot.difficulty };
  const s = endless ? createEndless(seed, slot.hero, { unlocked: opts.unlocked, book: opts.book, meta: opts.meta }) : createChapter(slot.chapter, seed, cp?.carry ?? slot.carry, opts);
  // 재편성은 한 번만
  if (slot.rebuild && !cp && !endless) {
    slot.rebuild = 0;
    const s2 = loadSave();
    s2.slots[s2.active] = { ...slot };
    writeSave(s2);
  }
  let cpSaved = !!cp;
  const skip = Number(params.get('t') ?? 0);
  if (skip > 0) await fastForward(s, skip);
  const canvas = el('canvas', { class: 'field', 'aria-label': `틈 — ${s.chapter.name}` });
  const ctx = canvas.getContext('2d')!;
  const overlay = el('div', { class: 'overlay', hidden: '' });
  const stick = el('div', { class: 'stick', hidden: '' }, el('div', { class: 'knob' }));
  // 인물마다 다른 보법·마지막 기술(2026-11-21): 단추 글자도 인물 것
  const dashBtn = el('button', { class: 'pad dash', type: 'button', 'aria-label': `${s.hero.dash.name}(Shift·Space)`, title: `${s.hero.dash.name} — ${s.hero.dash.desc}` }, s.hero.dash.glyph);
  const ultBtn = el('button', { class: 'pad ult', type: 'button', 'aria-label': `${s.hero.ult.name}(E)`, title: `${s.hero.ult.name} — ${s.hero.ult.desc}`, style: `--uc:${s.hero.ult.color}` }, s.hero.ult.glyph);
  const pauseBtn = btn('Ⅱ', 'pad pause', () => pause(), { 'aria-label': '멈춤(ESC)' });
  app.replaceChildren(el('section', { class: 'screen run' }, canvas, stick, dashBtn, ultBtn, pauseBtn, overlay));
  const loading = el('div', { class: 'loading' }, `${s.chapter.name} — 그림을 불러오는 중…`);
  app.append(loading);
  const art: Art = await loadArt(s, outfitPrefix(sv, s.hero.id) ?? s.hero.sprite);
  loading.remove();
  const view: View = emptyView();
  const seen = new Set(sv.seen);
  // 점검용(?debug): 화면 점검 도구가 판 상태를 읽고 바꿀 수 있게
  if (params.has('debug')) {
    (window as unknown as { __teum?: State }).__teum = s;
    // 점검용: 그림자 하나 놓기(변종 id를 주면 변종으로)
    (window as unknown as { __spawn?: (id: string, x: number, y: number, v?: string) => void }).__spawn = (id, x, y, v) => {
      const f = spawnFoe(s, id, x, y);
      const vd = v ? RULES.variants.list.find((d) => d.id === v) : undefined;
      if (f && vd) applyVariant(f, vd);
    };
  }

  const keys = new Set<string>();
  let wantDash = false;
  let wantUlt = false;
  let touch: { id: number; x0: number; y0: number; x: number; y: number } | null = null;
  // 키 설정(2026-11-22): 옵션 「조작」에서 바꾼 키
  let km = keyMap(sv.options.keys as Partial<KeyMap>);
  const onKey = (e: KeyboardEvent) => {
    if (e.type === 'keydown') {
      if (document.querySelector('.modal')) return;
      if (!overlay.hidden && /^[1-9]$/.test(e.key) && s.pending) return pick(Number(e.key) - 1);
      if (!overlay.hidden && s.pending && isKey(km, 'reroll', e.code)) return void (reroll(s) && showChoices());
      if (!overlay.hidden && s.pending && isKey(km, 'skip', e.code)) return void (skipChoice(s) ? (s.pending ? showChoices() : (overlay.hidden = true)) : 0);
      if (!overlay.hidden && s.pending && isKey(km, 'banish', e.code)) return void ((banMode = !banMode), showChoices());
      if (isKey(km, 'pause', e.code)) return void (paused ? resume() : pause());
      if (isKey(km, 'dash', e.code)) wantDash = true;
      if (isKey(km, 'ult', e.code)) wantUlt = true;
      keys.add(e.code);
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    } else keys.delete(e.code);
  };
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);
  const onDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' || touch) return;
    touch = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY };
    stick.hidden = false;
    stick.style.left = `${e.clientX}px`;
    stick.style.top = `${e.clientY}px`;
  };
  const onMove = (e: PointerEvent) => {
    if (!touch || e.pointerId !== touch.id) return;
    touch.x = e.clientX;
    touch.y = e.clientY;
    const dx = Math.max(-50, Math.min(50, touch.x - touch.x0));
    const dy = Math.max(-50, Math.min(50, touch.y - touch.y0));
    (stick.firstChild as HTMLElement).style.transform = `translate(${dx}px, ${dy}px)`;
  };
  const onUp = (e: PointerEvent) => {
    if (!touch || e.pointerId !== touch.id) return;
    touch = null;
    stick.hidden = true;
  };
  canvas.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  dashBtn.addEventListener('pointerdown', (e) => (e.preventDefault(), (wantDash = true)));
  ultBtn.addEventListener('pointerdown', (e) => (e.preventDefault(), (wantUlt = true)));
  const input = (): Input => {
    let x = 0;
    let y = 0;
    const held = (a: Action) => keys.has(km[a][0]) || (!!km[a][1] && keys.has(km[a][1]!));
    if (held('left')) x -= 1;
    if (held('right')) x += 1;
    if (held('up')) y -= 1;
    if (held('down')) y += 1;
    if (touch) {
      const dx = touch.x - touch.x0;
      const dy = touch.y - touch.y0;
      const d = Math.hypot(dx, dy);
      if (d > 8) {
        x = dx / Math.max(d, 50);
        y = dy / Math.max(d, 50);
      }
    }
    const out = { x, y, dash: wantDash, ult: wantUlt };
    wantDash = false;
    wantUlt = false;
    return out;
  };

  const choiceCard = (c: Choice, i: number): HTMLElement => {
    // 떠돌이 상인: 물건(값) · 지나간다
    if (c.kind === 'buy' || c.kind === 'leave') {
      const it = ITEMS.get(c.id);
      const poor = c.kind === 'buy' && s.gold < c.lv;
      const b = el(
        'button',
        { class: `choice buy${poor ? ' poor' : ''}`, type: 'button', style: `--c:${it?.color ?? '#c2c6d1'}` },
        el('span', { class: 'key' }, String(i + 1)),
        c.kind === 'buy' ? el('span', { class: 'glyph-big' }, it?.glyph ?? '?') : '',
        el('span', { class: 'tag' }, c.kind === 'buy' ? `금화 ${c.lv}${poor ? ' — 모자란다' : ''}` : '그냥 간다'),
        el('b', {}, c.kind === 'buy' ? (it?.name ?? c.id) : '지나간다'),
        el('span', { class: 'desc' }, c.kind === 'buy' ? (it?.desc ?? '') : '아무것도 사지 않는다'),
      );
      if (poor) b.setAttribute('disabled', '');
      b.addEventListener('click', () => pick(i));
      return b;
    }
    const w = c.kind === 'weapon' ? WEAPONS.get(c.id) : undefined;
    const pd = c.kind === 'passive' ? PASSIVES.get(c.id) : undefined;
    // 보상(빈 칸이 없을 때)
    if (!w && !pd) {
      const b0 = el('button', { class: `choice ${c.kind}`, type: 'button' }, el('span', { class: 'key' }, String(i + 1)), el('b', {}, c.kind === 'gold' ? '금화 15' : '굳센 몸'), el('span', { class: 'desc' }, c.kind === 'gold' ? '금화를 15 얻는다' : '최대 체력 +10(다음 장에도) · 체력 30 회복'));
      b0.addEventListener('click', () => pick(i));
      return b0;
    }
    // 2026-11-21 전면 개편: 등급 · 갈래 아이콘 · 큰 숫자 비교 · 한 줄 설명 · 세트/각성 · 추천
    const g = gradeOf(c.id);
    const role = roleOf(c.id);
    const nums = keyNumbers(c.id, c.lv);
    const info = describe(c.id);
    const partner = pd ? partnersOf(s).get(pd.id) : undefined;
    const ec = elementCounts(s);
    const art = skillArt(c.id);
    const icon = el('span', { class: `role role-${role.key}` });
    icon.innerHTML = roleIcon(role.key);
    const chips: (HTMLElement | string)[] = [];
    if (w?.element) {
      const n = (ec[w.element] ?? 0) + (c.lv === 1 ? 1 : 0);
      chips.push(el('span', { class: `chip-s${n >= RULES.sets[w.element].need ? ' on' : ''}` }, `${RULES.sets[w.element].name} ${n}/${RULES.sets[w.element].need}`));
    }
    if (w?.evolve) chips.push(el('span', { class: `chip-s${s.passives.has(w.evolve.with) ? ' on' : ''}` }, `각성 짝: ${PASSIVES.get(w.evolve.with)?.name}${s.passives.has(w.evolve.with) ? ' ✓' : ''}`));
    if (partner) chips.push(el('span', { class: 'chip-s on' }, `★ 「${WEAPONS.get(partner)?.name}」 각성 짝`));
    const b = el(
      'button',
      { class: `choice ${c.kind} g-${g === '극' ? 'X' : g}`, type: 'button', style: w ? `--c:${w.color}` : '' },
      el('span', { class: 'key' }, String(i + 1)),
      el(
        'div',
        { class: 'c-head' },
        el('span', { class: `grade g-${g === '극' ? 'X' : g}` }, g),
        icon,
        el('span', { class: 'c-kind' }, `${role.name}${w ? '' : ''} · ${c.lv === 1 ? (w ? '새 무공' : '새 심법') : `Lv.${c.lv - 1} → ${c.lv}`}`),
      ),
      el('div', { class: 'c-title' }, art ? el('img', { class: 'c-art', src: art, alt: '' }) : '', el('b', {}, w?.name ?? pd?.name ?? '')),
      el('div', { class: 'c-nums' }, ...nums.map((n) => el('span', { class: `num${n.better ? ' up' : ''}` }, el('small', {}, n.label), n.from ? el('em', {}, `${n.from} → `) : '', el('strong', {}, n.to)))),
      el('span', { class: 'desc' }, info.lines[0] ?? ''),
      chips.length ? el('div', { class: 'c-chips' }, ...chips) : '',
    );
    if (rec && rec.index === i) {
      b.classList.add('rec');
      b.append(el('span', { class: 'rec-tag' }, `추천 · ${rec.reason}`));
    }
    if (banMode && c.lv === 1) b.classList.add('ban');
    b.addEventListener('click', () => pick(i));
    return b;
  };
  let banMode = false;
  let rec: { index: number; reason: string } | null = null;
  // 가게(2026-11-22 "상인·수련소는 장소 — 안의 NPC가 판다"): 왼쪽 NPC · 오른쪽 진열(값표) · 아래 지나간다
  const NPC_LINE: Record<string, string[]> = {
    merchant: ['어서 오시오, 틈 너머에서 건진 물건이오.', '금화만 있으면 무엇이든. 오래 머물진 않소.', '이 무공서는 다른 문파 것이라 값이 좀 나가오.'],
    dojo: ['수련은 배신하지 않는다. 무엇을 익히겠나.', '이미 가진 것을 깊게 할 텐가, 새로 배울 텐가.', '맞지 않는 무공은 내려놓는 것도 수련이다.'],
  };
  const wareCard = (c: Choice, i: number): HTMLElement => {
    const poor = c.kind !== 'sellskill' && c.kind !== 'leave' && s.gold < c.lv;
    const full = c.kind === 'buyskill' && (WEAPONS.has(c.id) ? s.weapons.length >= s.slots.weapons : s.passives.size >= s.slots.passives);
    let body: HTMLElement;
    if (c.kind === 'buy') {
      const it = ITEMS.get(c.id);
      const ic = it?.icon ? realArt(({ items2: 'icons_teum_items_2', world: 'icons_teum_world', icons: 'icons_teum', items: 'icons_teum_items' } as Record<string, string>)[it.icon[0]] ?? 'icons_teum_items', it.icon[1]) : null;
      body = el('div', { class: 'ware-item', style: `--c:${it?.color ?? '#c2c6d1'}` }, ic ? el('img', { src: ic, alt: '' }) : el('span', { class: 'glyph-big' }, it?.name[0] ?? '?'), el('div', {}, el('b', {}, it?.name ?? c.id), el('small', {}, it?.desc ?? '')));
    } else {
      const lv = c.kind === 'upskill' ? (s.weapons.find((w) => w.id === c.id)?.lv ?? 0) + 1 : c.kind === 'sellskill' ? s.weapons.find((w) => w.id === c.id)?.lv : undefined;
      const w = WEAPONS.get(c.id);
      const foreign = c.kind === 'buyskill' && w && w.owner !== '*' && w.owner !== s.hero.id;
      body = skillCard(c.id, { lv, compact: true, extra: [foreign ? el('span', { class: 'chip-s foreign' }, `다른 문파 — ${HEROES.find((h) => h.id === w!.owner)?.name ?? ''}의 무공`) : ''] });
    }
    const verb = c.kind === 'buy' ? '산다' : c.kind === 'buyskill' ? '배운다' : c.kind === 'upskill' ? '수련한다' : '내려놓는다';
    const tag = c.kind === 'sellskill' ? `금화 +${c.lv}` : `금화 ${c.lv}`;
    const b = el('button', { class: `ware ${c.kind}${poor || full ? ' poor' : ''}`, type: 'button' }, el('span', { class: 'key' }, String(i + 1)), el('span', { class: 'ware-kind' }, c.kind === 'upskill' ? '수련' : c.kind === 'sellskill' ? '내려놓기' : c.kind === 'buyskill' ? (WEAPONS.has(c.id) ? '무공서' : '심법서') : '물건'), body, el('span', { class: 'price' }, el('i', { class: 'coin' }), tag, el('em', {}, poor ? '금화가 모자란다' : full ? '칸이 다 찼다' : verb)));
    if (poor || full) b.setAttribute('disabled', '');
    b.addEventListener('click', () => pick(i));
    return b;
  };
  const showShop = () => {
    overlay.hidden = false;
    const kind = s.shopItem?.kind ?? 'merchant';
    const def = ITEMS.get(kind);
    const lines = NPC_LINE[kind] ?? NPC_LINE.merchant;
    const face = realArt(`${def?.place?.npc ?? 'npc_teum_merchant'}_portrait`);
    const wares = s.pending!.filter((c) => c.kind !== 'leave');
    const leaveIdx = s.pending!.findIndex((c) => c.kind === 'leave');
    overlay.replaceChildren(
      el(
        'div',
        { class: `panel shop-place ${kind}` },
        el(
          'aside',
          { class: 'npc' },
          face ? el('img', { class: 'npc-face', src: face, alt: '' }) : el('div', { class: 'npc-face ph' }, el('span', {}, kind === 'dojo' ? '사범' : '상인')),
          el('b', {}, def?.place?.name ?? def?.name ?? ''),
          el('p', { class: 'npc-line' }, `“${lines[Math.floor(s.t) % lines.length]}”`),
          el('div', { class: 'purse' }, el('i', { class: 'coin' }), el('b', {}, String(s.gold)), el('small', {}, '가진 금화')),
          el('small', { class: 'muted' }, `무공 ${s.weapons.length}/${s.slots.weapons} · 심법 ${s.passives.size}/${s.slots.passives}`),
        ),
        el('div', { class: 'wares' }, ...(wares.length ? wares.map((c) => wareCard(c, s.pending!.indexOf(c))) : [el('p', { class: 'muted sold' }, '다 팔렸다 — 다음에 또 보자.')])),
        btn('지나간다', 'btn ghost leave', () => pick(leaveIdx)),
      ),
    );
  };
  const showChoices = () => {
    overlay.hidden = false;
    if (s.shopItem || s.pending!.some((c) => c.kind === 'leave')) return showShop();
    rec = recommend(s, s.pending!);
    const shop = s.pending!.some((c) => c.kind === 'leave');
    // 후보 손보기(2026-11-21): 다시 뽑기 · 봉인 · 건너뛰기 — 장마다 횟수(장터 수련으로 늘린다)
    const tools = shop
      ? ''
      : el(
          'div',
          { class: 'menu-row tools' },
          btn(`다시 뽑기 ${s.rerolls}`, 'btn small ghost', () => reroll(s) && showChoices(), s.rerolls ? {} : { disabled: '' }),
          btn(banMode ? `봉인할 카드를 누른다 (${s.banishes})` : `봉인 ${s.banishes}`, `btn small ${banMode ? 'primary' : 'ghost'}`, () => ((banMode = !banMode), showChoices()), s.banishes ? {} : { disabled: '' }),
          btn(`건너뛰기 ${s.skips} (금화 +${RULES.build.skipGold})`, 'btn small ghost', () => {
            if (!skipChoice(s)) return;
            if (s.pending) showChoices();
            else overlay.hidden = true;
          }, s.skips ? {} : { disabled: '' }),
        );
    overlay.replaceChildren(el('div', { class: `panel levelup${shop ? ' shop' : ''}` }, el('h3', {}, shop ? `떠돌이 상인 — 가진 금화 ${s.gold}` : `Lv.${s.level - s.queuedLevels + 1} — 하나를 고른다`), el('div', { class: 'choices' }, ...s.pending!.map(choiceCard)), tools));
  };
  const pick = (i: number) => {
    if (!s.pending) return;
    if (banMode) {
      banMode = false;
      if (banish(s, i)) return void showChoices();
      return void showChoices();
    }
    choose(s, i);
    if (s.pending) showChoices();
    else overlay.hidden = true;
  };

  let paused = false;
  const pause = () => {
    if (s.result || s.pending) return;
    paused = true;
    overlay.hidden = false;
    overlay.replaceChildren(
      el(
        'div',
        { class: 'panel' },
        el('h3', {}, '멈춤'),
        el('p', { class: 'muted' }, `${s.chapter.name} · ${fmt(s.t)} · Lv.${s.level} · 쓰러뜨림 ${s.chapterKills}`),
        el(
          'div',
          { class: 'menu-col' },
          btn('계속', 'btn primary', resume),
          btn('옵션', 'btn ghost', () =>
            optionsPopup(() => {
              Object.assign(opt, loadSave().options);
              km = keyMap(loadSave().options.keys as Partial<KeyMap>);
            }),
          ),
          btn(endless ? '그만두기' : '메인으로(이 장은 처음부터)', 'btn ghost', () => {
            if (confirm(endless ? '그만둘까? 번 금화·비급은 남는다(기록은 남지 않는다).' : '메인으로 나갈까? 이 장의 진행은 저장되지 않는다(장을 넘을 때만 자동 저장). 번 금화·비급은 남는다.')) {
              bankOnQuit();
              lobby();
            }
          }),
        ),
      ),
    );
  };
  const resume = () => {
    paused = false;
    overlay.hidden = true;
    last = performance.now();
  };
  const opt = { ...sv.options };

  let ended = false;
  let banked = false;
  /** 장 도중 메인으로 나가도 번 금화·비급은 챙긴다 */
  const bankOnQuit = () => {
    if (banked) return;
    banked = true;
    const save = loadSave();
    bank(save, s.gold, s.unlocks, s.steles);
    writeSave(save);
  };
  const finish = () => {
    if (ended) return;
    ended = true;
    const save = loadSave();
    save.seen = [...new Set([...save.seen, ...seen])];
    // 번 금화·연 비급은 장을 넘든 지든 계정에 남는다
    bank(save, s.gold, s.unlocks, s.steles);
    banked = true;
    const xp = trainingXp(s);
    void gainXp(xp, null, null).catch(() => undefined);
    sfx(s.result === 'clear' ? 'win' : 'lose');
    // 무한 모드: 버틴 시간 기록
    if (endless) {
      const best = (save.endlessBest ??= {});
      const prev = best[s.hero.id] ?? 0;
      if (s.t > prev) best[s.hero.id] = Math.floor(s.t);
      writeSave(save);
      overlay.hidden = false;
      overlay.replaceChildren(
        el(
          'div',
          { class: 'panel result lose' },
          el('div', { class: 'seal-r' }, '終'),
          el('h3', {}, `${fmt(s.t)} 버텼다`),
          el('p', {}, `보스 ${s.stage}회 넘김 · Lv.${s.level} · 쓰러뜨림 ${s.chapterKills} · 금화 ${s.gold}`),
          el('p', { class: s.t > prev ? 'unlock' : 'muted' }, s.t > prev ? `새 최고 기록! (이전 ${fmt(prev)})` : `최고 기록 ${fmt(prev)}`),
          el('p', { class: 'muted' }, `「천외귀환」 수련 경험치 +${xp} · 금화 지갑 +${s.gold}(${save.wallet})`),
          s.unlocks.length ? el('p', { class: 'unlock' }, `새로 연 무공: ${s.unlocks.map((id) => `「${WEAPONS.get(id)?.name ?? PASSIVES.get(id)?.name}」`).join(' ')}`) : '',
          el('div', { class: 'menu-row' }, btn('다시 도전', 'btn primary', () => void play(slot, false, true)), btn('메인으로', 'btn ghost', lobby)),
        ),
      );
      return;
    }
    const clear = s.result === 'clear';
    let next: Slot = slot;
    if (clear) {
      const carry: Carry = carryOf(s);
      next = { ...slot, chapter: slot.chapter + 1, carry, checkpoint: undefined, rebuild: 0 };
      autosave(save, next);
    } else writeSave(save);
    const done = next.chapter >= STORY.chapters.length;
    const newly = HEROES.filter((h) => h.unlock && heroOpen(save, h.id) && !heroOpen({ ...save, maxCleared: save.maxCleared - (clear ? 1 : 0) }, h.id)).map((h) => h.name);
    overlay.hidden = false;
    overlay.replaceChildren(
      el(
        'div',
        { class: `panel result ${clear ? 'win' : 'lose'}` },
        el('div', { class: 'seal-r' }, clear ? (done ? "縫" : "越") : '敗'),
        el('h3', {}, clear ? (done ? "틈을 꿰맸다 — 이야기 끝" : `${s.chapter.name}을 넘었다`) : '그림자에 묻혔다'),
        el('p', {}, `${fmt(s.t)} · Lv.${s.level} · 쓰러뜨림 ${s.chapterKills} · 금화 ${s.gold}`),
        el('p', { class: 'muted' }, clear ? `자동 저장 — ${save.active + 1}번 칸 · ${done ? "모든 장을 넘었다" : `다음: ${STORY.chapters[next.chapter].name}`}` : '이 장은 처음부터 다시 — 레벨·무공은 장을 시작할 때 그대로'),
        el('p', { class: 'muted' }, `「천외귀환」 수련 경험치 +${xp} · 금화 지갑 +${s.gold}(${save.wallet})`),
        s.unlocks.length ? el('p', { class: 'unlock' }, `새로 연 무공: ${s.unlocks.map((id) => `「${WEAPONS.get(id)?.name ?? PASSIVES.get(id)?.name}」`).join(' ')}`) : '',
        newly.length ? el('p', { class: 'unlock' }, `새 인물: ${newly.join(', ')}`) : '',
        el(
          'div',
          { class: 'menu-col' },
          clear && !done ? btn('다음 장으로', 'btn primary', () => chapterCard(next)) : '',
          !clear && s.checkpoint ? btn('중간 보스 뒤에서 다시', 'btn primary', () => void play({ ...slot, checkpoint: { seed, t: s.checkpoint!.t, carry: s.checkpoint!.carry } }, true)) : '',
          !clear ? btn('이 장 처음부터', s.checkpoint ? 'btn ghost' : 'btn primary', () => chapterCard({ ...slot, checkpoint: undefined })) : '',
          btn('메인으로', 'btn ghost', lobby),
        ),
      ),
    );
    (overlay.querySelector('.btn') as HTMLButtonElement | null)?.focus();
  };

  const resize = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
  };
  resize();
  window.addEventListener('resize', resize);
  let last = performance.now();
  let acc = 0;
  let raf = 0;
  // 상자 열기 연출(VS처럼 돌아가는 띠) · 각성 컷인
  let rollUntil = 0;
  const showRoll = (r: { text: string; evolve: boolean }, now: number) => {
    view.chestRoll = null;
    rollUntil = now + (r.evolve ? 1900 : 1300);
    const icons = s.weapons.map((w) => cardArtUrl(WEAPONS.get(w.id)?.card ?? '')).filter(Boolean) as string[];
    const pool = icons.length ? icons : [''];
    const stand = realArt(s.hero.stand);
    // 슬롯머신: 띠 셋이 차례로 멈춘다(VS 상자 연출처럼)
    const reels = el(
      'div',
      { class: 'reels' },
      ...[0, 1, 2].map((k) =>
        el(
          'div',
          { class: 'reel-col' },
          el('div', { class: 'strip', style: `animation-duration:${0.55 + k * 0.22}s` }, ...Array.from({ length: 9 }, (_, j) => (pool[(j + k) % pool.length] ? el('img', { src: pool[(j + k) % pool.length], alt: '' }) : el('span', {}, '?')))),
        ),
      ),
    );
    const box = el(
      'div',
      { class: `chest-roll${r.evolve ? ' evolve' : ''}` },
      r.evolve && stand ? el('img', { class: 'cut', src: stand, alt: '' }) : '',
      r.evolve ? el('div', { class: 'awaken' }, '覺醒') : '',
      reels,
      el('b', {}, r.text),
    );
    box.addEventListener('click', () => {
      rollUntil = 0;
      box.remove();
    });
    app.querySelector('.screen.run')?.append(box);
    setTimeout(() => box.remove(), r.evolve ? 1900 : 1300);
  };
  // 처음 안내(2026-11-21): 1장을 처음 열면 30초 — 이동 · 보법 · 간파 · 마지막 기술 · 레벨업 고르기
  const tut = !endless && slot.chapter === 0 && !sv.tutorial && !cp && !params.has('t') ? { step: -1, moved: 0, tries: 0, next: 0, counter: view.counterAt, until: 0 } : null;
  const tutBox = el('div', { class: 'tutorial', hidden: '' });
  const TUT = [
    '이동 — WASD·방향키(휴대폰은 화면 왼쪽을 끌어서)',
    `보법 — Space·Shift(오른쪽 아래 「${s.hero.dash.glyph}」) 한 번 써 보라. 보법 동안은 맞지 않는다`,
    '간파 — 발밑 붉은 원이 떨어지는 순간 보법으로 빠져나가라. 아슬하게 피하면 시간이 느려지고 위력이 두 배',
    `마지막 기술 — 게이지를 채워 두었다. Q(「${s.hero.ult.glyph}」 ${s.hero.ult.name})로 써 보라`,
    '무공은 저절로 나간다. 레벨업에서는 등급(S·A·B·C)과 「추천」 표시를 보고 고르면 된다',
  ];
  const tutGo = (n: number) => {
    if (!tut) return;
    tut.step = n;
    if (n >= TUT.length) {
      tutBox.remove();
      const s2 = loadSave();
      s2.tutorial = true;
      writeSave(s2);
      return;
    }
    tutBox.hidden = false;
    tutBox.replaceChildren(el('small', {}, `처음 안내 ${n + 1}/${TUT.length}`), el('b', {}, TUT[n]), btn('건너뛰기', 'btn small ghost', () => tutGo(TUT.length)));
    if (n === 2) {
      practiceSlam(s);
      tut.next = s.t + 3;
    }
    if (n === 3) s.ult = RULES.ult.max;
    if (n === 4) tut.until = s.t + 5;
  };
  const tutTick = () => {
    if (!tut || tut.step >= TUT.length) return;
    if (tut.step < 0) {
      app.querySelector('.screen.run')?.append(tutBox);
      tutGo(0);
    }
    const st = tut.step;
    if (st === 0 && s.player.moving && ++tut.moved > 60) tutGo(1);
    else if (st === 1 && s.player.dashReady > s.t) tutGo(2);
    else if (st === 2) {
      if (view.counterAt !== tut.counter) tutGo(3);
      else if (s.t >= tut.next) {
        if (++tut.tries >= 4) tutGo(3);
        else {
          practiceSlam(s);
          tut.next = s.t + 3;
        }
      }
    } else if (st === 3 && s.ult < RULES.ult.max) tutGo(4);
    else if (st === 4 && s.t >= tut.until) tutGo(5);
  };
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    const W = canvas.width;
    const H = canvas.height;
    const dpr = W / window.innerWidth;
    const zoom = dpr * Math.max(0.6, Math.min(1.6, Math.min(window.innerWidth, window.innerHeight) / 600));
    s.view = W / 2 / zoom;
    // 히트스톱·상자 연출 동안은 멈춤, 간파 반격 처음엔 느리게
    if (!paused && !s.pending && !s.result && now >= view.stopUntil && now >= rollUntil) {
      acc += Math.min(0.1, (now - last) / 1000) * (s.t < s.slowmoUntil ? 0.35 : 1);
      while (acc >= DT) {
        acc -= DT;
        step(s, input());
        for (const e of s.events) if (e.type === 'kill') seen.add(e.foe);
        if (s.pending || s.result) break;
      }
    }
    last = now;
    soundOf(s);
    absorb(view, s, now, opt);
    // 중간 보스를 넘은 자리를 칸에 적어 둔다(나가도 이어 할 수 있게)
    if (s.checkpoint && !cpSaved && !endless) {
      cpSaved = true;
      slot.checkpoint = { seed, t: s.checkpoint.t, carry: s.checkpoint.carry };
      const s2 = loadSave();
      s2.slots[s2.active] = { ...slot };
      writeSave(s2);
    }
    if (view.chestRoll) showRoll(view.chestRoll, now);
    tutTick();
    if (view.stele) {
      const st = view.stele;
      view.stele = null;
      const card = el('div', { class: 'stele-toast' }, el('b', {}, '碑 비석'), el('p', {}, st.text));
      app.querySelector('.screen.run')?.append(card);
      setTimeout(() => card.remove(), 6500);
    }
    draw(ctx, s, art, view, now, W, H, zoom, dpr, opt);
    dashBtn.style.setProperty('--k', String(1 - Math.max(0, s.player.dashReady - s.t) / dashCooldown(s)));
    ultBtn.style.setProperty('--k', String(s.ult / RULES.ult.max));
    ultBtn.classList.toggle('ready', s.ult >= RULES.ult.max);
    if (s.pending && overlay.hidden) showChoices();
    if (s.result && !ended) setTimeout(finish, s.result === 'lose' ? 900 : 1800);
  };
  // 소리(2026-11-22): 판 위 사건 → 효과음(인물에서 먼 것은 작고 옆으로)
  const soundOf = (st: State) => {
    const P = st.player;
    const pan = (x: number) => (x - P.x) / 640;
    const far = (x: number, y: number) => Math.max(0, 1 - Math.hypot(x - P.x, y - P.y) / 900);
    let hits = 0;
    for (const e of st.events) {
      switch (e.type) {
        case 'hit':
          if (e.crit) sfx('crit', { pan: pan(e.x), vol: 0.7 });
          else if (++hits <= 3) sfx('hit', { pan: pan(e.x), vol: 0.45 });
          break;
        case 'kill':
          sfx(e.rank ? 'boom' : 'kill', { pan: pan(e.x), vol: e.rank ? 0.9 : 0.5 });
          break;
        case 'gem':
          sfx('gem', { vol: 0.5 });
          break;
        case 'level':
          sfx('level');
          break;
        case 'dash':
          sfx('dash', { vol: 0.7 });
          break;
        case 'ult':
          sfx('ult');
          break;
        case 'hurt':
          sfx('hurt', { vol: 0.8 });
          break;
        case 'foeAct':
          if (far(e.x, e.y) > 0) sfx(e.act, { pan: pan(e.x), vol: 0.35 * far(e.x, e.y) + 0.1 });
          break;
        case 'burst':
        case 'bomb':
          sfx('boom', { pan: pan(e.x), vol: 0.8 });
          break;
        case 'chest':
          sfx(e.text.startsWith('각성') ? 'evolve' : 'chest');
          break;
        case 'item':
          sfx(ITEMS.get(e.kind)?.place ? 'shop' : e.kind === 'gold' || e.kind === 'gold_bar' ? 'coin' : 'pick', { vol: 0.7 });
          break;
        case 'buy':
          sfx('buy');
          break;
        case 'counter':
          sfx('counter');
          break;
        case 'heal':
          sfx('heal', { vol: 0.5 });
          break;
        case 'unlock':
          sfx('chest');
          break;
        case 'phase':
          sfx('boss', { vol: 0.8 });
          break;
        case 'event':
          if (e.kind === 'boss' || e.kind === 'mid' || e.kind === 'bigwave') sfx('boss', { vol: e.kind === 'bigwave' ? 0.5 : 0.9 });
          break;
        case 'skill':
          if (e.kind === 'line' || e.kind === 'zone') sfx(e.kind === 'line' ? 'zap' : 'boom', { pan: pan(e.x), vol: 0.4 * far(e.x, e.y) + 0.1 });
          break;
      }
    }
    // 배경음악: 보스가 있으면 보스 곡
    const mood = st.boss && !st.boss.dead ? 'boss' : endless || st.chapterIndex >= 9 ? 'rift' : 'battle';
    music(mood);
  };
  raf = requestAnimationFrame(loop);
  stopRun = () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('keyup', onKey);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    window.removeEventListener('resize', resize);
    stopRun = null;
  };
}

/** 점검용 ?t=초: 그 시간까지 빨리 감기(죽지 않게, 레벨업은 첫 카드) */
async function fastForward(s: State, until: number): Promise<void> {
  const keep = s.player.maxHp;
  s.player.hp = s.player.maxHp = 1e6;
  const note = el('div', { class: 'loading' }, '빨리 감는 중…');
  app.replaceChildren(note);
  while (s.t < until && !s.result) {
    for (let i = 0; i < 900 && s.t < until && !s.result; i++) {
      if (s.pending) choose(s, 0);
      step(s, { x: Math.cos(s.t / 3), y: Math.sin(s.t / 3) });
      s.events.length = 0;
    }
    note.textContent = `빨리 감는 중… ${fmt(s.t)}`;
    await new Promise((r) => setTimeout(r, 0));
  }
  s.player.maxHp = keep + s.bonusHp + (s.passives.get('vigor') ?? 0) * 10;
  s.player.hp = s.player.maxHp;
}

const KIND_NAME: Record<string, string> = { slash: '베기', bolt: '날리기', wave: '검기', orbit: '둘레 돌기', nova: '고리', aura: '결계', strike: '내리꽂기', rain: '장판', chain: '연쇄', beam: '일직선', heal: '회복' };


// 점검용 바로 가기: ?play=<장 1~10>&hero=<id> · ?endless&hero=<id>[&t=초] · ?screen=lobby|story|codex|wardrobe|options|load|save
const direct = Number(params.get('play') ?? 0);
const screen = params.get('screen');
// 소리·쉬기(창을 떠나면 장식 움직임을 쉰다)
initIdle();
initSound(loadSave().options.sound);
if (params.has('endless')) {
  // ?endless[&hero=]: 무한 모드 바로
  const hero = params.get('hero') ?? 'haun';
  void play({ hero, difficulty: 'normal', chapter: 0, carry: freshCarry(hero), updatedAt: Date.now() }, false, true);
} else if (direct > 0) {
  const hero = params.get('hero') ?? 'haun';
  const carry = freshCarry(hero);
  // 뒤 장을 바로 볼 때는 그 장에 맞게 레벨을 올려 둔다
  carry.level = 1 + (direct - 1) * 10;
  void play({ hero, difficulty: 'normal', chapter: direct - 1, carry, updatedAt: Date.now() });
} else if (screen && screen !== 'gate') {
  lobby();
  if (screen !== 'lobby') openMenu(screen);
} else if (guestChosen()) lobby();
else gate();

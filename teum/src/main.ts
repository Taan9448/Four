// 「틈」 화면 흐름(2026-11-18 2차, GAME_DESIGN 1절): 들어가기(게스트) → 메인(불러오기·저장·스토리·무한) → 장 카드 → 판 → 장 끝(자동 저장).
// 입력: WASD·방향키 / 휴대폰은 왼쪽을 끌어 가상 막대, 오른쪽 아래 보법·천외귀운 단추. ESC 멈춤.
import './style.css';
import { frameUrl } from '../../src/render/assets';
import { currentTraining, gainXp } from '../../gyeol/src/training';
import progressRaw from '../../gyeol/data/progress.json';
import { CHAPTER_LENGTH, carryOf, choose, createChapter, DT, FOES, freshCarry, HEROES, PASSIVES, RULES, STORY, step, trainingXp, WEAPONS, type Carry, type Choice, type Input, type State } from './sim';
import { absorb, draw, emptyView, loadArt, type Art, type View } from './render';
import { cardArtUrl } from '../../src/render/assets';
import { autosave, heroOpen, loadSave, slotLabel, writeSave, type SaveData, type Slot } from './save';

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
  const bg = realArt('keyart_teum_lobby');
  return el('div', { class: `backdrop${bg ? ' art' : ''}`, style: bg ? `--bg:url("${bg}")` : '' }, el('div', { class: 'crack', 'aria-hidden': 'true' }));
}

// ── 2. 메인 ──
const MENU = [
  { id: 'load', name: '불러오기', note: '저장 3칸 중 하나를 골라 다음 장부터 잇는다', icon: 1 },
  { id: 'save', name: '저장', note: '자동 저장할 칸 고르기 · 지우기(장을 넘을 때마다 자동)', icon: 2 },
  { id: 'story', name: '스토리', note: '1장부터 새로 — 노말 · 하드(준비 중)', icon: 3 },
  { id: 'endless', name: '무한 모드', note: '준비 중 — 스토리를 다 만든 뒤', icon: 4, locked: true },
] as const;
const CORNER = [
  { id: 'codex', name: '도감', icon: 5 },
  { id: 'wardrobe', name: '옷장', icon: 6 },
  { id: 'options', name: '옵션', icon: 7 },
] as const;

function lobby(): void {
  stopRun?.();
  const sv = loadSave();
  const any = sv.slots.some(Boolean);
  const items = MENU.map((m, i) => {
    const locked = 'locked' in m || (m.id === 'load' && !any);
    const icon = realArt('icons_teum_menu', m.icon);
    const sub = m.id === 'load' && any ? slotLabel(sv.slots[sv.active] ?? sv.slots.find(Boolean)!) : locked && m.id === 'load' ? '저장된 칸이 없다' : m.note;
    return btn([el('span', { class: 'key' }, String(i + 1)), icon ? el('img', { class: 'mi-icon', src: icon, alt: '' }) : '', el('span', { class: 'mi-label' }, el('b', {}, m.name), el('small', {}, sub))], `menu-btn${locked ? ' locked' : ''}${m.id === 'story' && !any ? ' primary' : ''}${m.id === 'load' && any ? ' primary' : ''}`, () => !locked && openMenu(m.id), locked ? { disabled: '' } : {});
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
    const diffs = el('div', { class: 'row-pick' }, ...STORY.difficulties.map((d) => btn(d.open ? d.name : `${d.name} — ${d.note ?? '준비 중'}`, `chip${diff === d.id ? ' on' : ''}${d.open ? '' : ' locked'}`, () => d.open && ((diff = d.id), render()), d.open ? {} : { disabled: '' })));
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
            el('small', {}, `「${WEAPONS.get(h.start)?.name}」 · 마지막 기술 「${h.ult.name}」`),
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
            chapterCard(slot);
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

function codexPopup(): void {
  const sv = loadSave();
  let tab: 'foes' | 'weapons' | 'passives' = 'foes';
  const body = el('div', { class: 'codex' });
  const render = () => {
    const tabs = el('div', { class: 'row-pick' }, ...([['foes', '그림자'], ['weapons', '무공'], ['passives', '심법']] as const).map(([k, n]) => btn(n, `chip${tab === k ? ' on' : ''}`, () => ((tab = k), render()))));
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
      list = [el('p', { class: 'note' }, `무공 ${ws.length}개 — 손으로 맞춘 ${ws.filter((w) => !w.card).length} · 「천외귀환」 카드 ${ws.filter((w) => w.card).length}`), el('div', { class: 'grid text' }, ...ws.map((w) => { const a = cardArtUrl(w.card ?? ''); return el('div', { class: 'entry', style: `--c:${w.color}` }, a ? el('img', { class: 'thumb', src: a, alt: '', loading: 'lazy' }) : '', el('b', {}, `${w.name}${w.evolved ? ' ★' : ''}`), el('small', {}, `${w.owner === '*' ? '모두' : (HEROES.find((h) => h.id === w.owner)?.name ?? '')} · ${KIND_NAME[w.kind]}`), el('small', {}, w.desc)); }))];
    } else {
      const ps = [...PASSIVES.values()];
      list = [el('p', { class: 'note' }, `심법 ${ps.length}개`), el('div', { class: 'grid text' }, ...ps.map((p) => { const a = cardArtUrl(p.card ?? ''); return el('div', { class: 'entry' }, a ? el('img', { class: 'thumb', src: a, alt: '', loading: 'lazy' }) : '', el('b', {}, p.name), el('small', {}, `${p.desc} · 최대 Lv.${p.max}`)); }))];
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
  const sv = loadSave();
  const row = (label: string, input: HTMLElement) => el('label', { class: 'opt' }, el('span', {}, label), input);
  const check = (key: 'shake' | 'numbers') => {
    const c = el('input', { type: 'checkbox' });
    c.checked = sv.options[key];
    c.addEventListener('change', () => {
      sv.options[key] = c.checked;
      writeSave(sv);
    });
    return c;
  };
  const map = el('select', {}, el('option', { value: 'small' }, '작게'), el('option', { value: 'large' }, '크게'));
  map.value = sv.options.map;
  map.addEventListener('change', () => {
    sv.options.map = map.value as 'small' | 'large';
    writeSave(sv);
  });
  const reset = btn('이 기기의 「틈」 기록 모두 지우기', 'btn small danger', () => {
    if (!confirm('저장 칸·도감·옷장·옵션을 모두 지울까?')) return;
    localStorage.removeItem('teum.save');
    location.reload();
  });
  const { root, close } = modal('옵션', el('div', { class: 'opts' }, row('화면 흔들림', check('shake')), row('피해 숫자', check('numbers')), row('지도 크기', map), el('p', { class: 'note' }, '조작: WASD·방향키 이동 · Space/Shift 보법 · Q 천외귀운 · ESC 멈춤 · 레벨업 1·2·3'), reset));
  if (onClose) {
    const btnClose = root.querySelector('.modal-close') as HTMLButtonElement;
    btnClose.addEventListener('click', onClose);
    root.addEventListener('click', (e) => e.target === root && onClose());
  }
  void close;
}

// ── 3. 장 카드 ──
function chapterCard(slot: Slot): void {
  stopRun?.();
  const ch = STORY.chapters[slot.chapter];
  const cg = realArt(ch.cg);
  const start = btn('들어간다', 'btn primary', () => void play(slot));
  app.replaceChildren(
    el(
      'section',
      { class: 'screen chapter-card', style: cg ? `--cg:url("${cg}")` : `--cg:linear-gradient(160deg, ${ch.color[2]}, ${ch.color[0]} 60%, ${ch.color[3]})` },
      el('div', { class: 'cc-text' }, el('small', {}, `${slot.chapter + 1} / ${STORY.chapters.length}`), el('h2', {}, ch.name), el('p', {}, ch.line), el('p', { class: 'note' }, `${Math.round(CHAPTER_LENGTH / 60)}분 · 빅웨이브 둘 · 중간 보스 「${FOES.get(ch.roles.mid)?.name}」 · 보스 「${FOES.get(ch.roles.boss)?.name}」`), el('div', { class: 'menu-row' }, start, btn('메인으로', 'btn ghost', lobby))),
    ),
  );
  screenKeys = (e) => {
    if (e.key === 'Enter' || e.key === ' ') start.click();
    if (e.key === 'Escape') lobby();
  };
  start.focus();
}

// ── 4. 판 ──
async function play(slot: Slot): Promise<void> {
  stopRun?.();
  screenKeys = null;
  const sv = loadSave();
  const seed = params.get('seed') ?? `${slot.hero}-${slot.chapter}-${Date.now().toString(36)}`;
  const s = createChapter(slot.chapter, seed, slot.carry);
  const skip = Number(params.get('t') ?? 0);
  if (skip > 0) await fastForward(s, skip);
  const canvas = el('canvas', { class: 'field', 'aria-label': `틈 — ${s.chapter.name}` });
  const ctx = canvas.getContext('2d')!;
  const overlay = el('div', { class: 'overlay', hidden: '' });
  const stick = el('div', { class: 'stick', hidden: '' }, el('div', { class: 'knob' }));
  const dashBtn = el('button', { class: 'pad dash', type: 'button', 'aria-label': '보법' }, '步');
  const ultBtn = el('button', { class: 'pad ult', type: 'button', 'aria-label': s.hero.ult.name }, '天');
  const pauseBtn = btn('Ⅱ', 'pad pause', () => pause(), { 'aria-label': '멈춤(ESC)' });
  app.replaceChildren(el('section', { class: 'screen run' }, canvas, stick, dashBtn, ultBtn, pauseBtn, overlay));
  const loading = el('div', { class: 'loading' }, `${s.chapter.name} — 그림을 불러오는 중…`);
  app.append(loading);
  const art: Art = await loadArt(s, outfitPrefix(sv, s.hero.id) ?? s.hero.sprite);
  loading.remove();
  const view: View = emptyView();
  const seen = new Set(sv.seen);
  // 점검용(?debug): 화면 점검 도구가 판 상태를 읽고 바꿀 수 있게
  if (params.has('debug')) (window as unknown as { __teum?: State }).__teum = s;

  const keys = new Set<string>();
  let wantDash = false;
  let wantUlt = false;
  let touch: { id: number; x0: number; y0: number; x: number; y: number } | null = null;
  const onKey = (e: KeyboardEvent) => {
    if (e.type === 'keydown') {
      if (!overlay.hidden && /^[123]$/.test(e.key) && s.pending) return pick(Number(e.key) - 1);
      if (e.code === 'Escape') {
        if (document.querySelector('.modal')) return;
        return void (paused ? resume() : pause());
      }
      if (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') wantDash = true;
      if (e.code === 'KeyQ') wantUlt = true;
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
    if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
    if (keys.has('KeyW') || keys.has('ArrowUp')) y -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) y += 1;
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
    const w = c.kind === 'weapon' ? WEAPONS.get(c.id) : undefined;
    const pd = c.kind === 'passive' ? PASSIVES.get(c.id) : undefined;
    const name = w?.name ?? pd?.name ?? (c.kind === 'gold' ? '금화 15' : '굳센 몸');
    const desc = w ? (c.lv === 1 ? w.desc : levelDiff(c.id, c.lv)) : pd ? pd.desc : c.kind === 'gold' ? '금화를 15 얻는다' : `최대 체력 +10(다음 장에도) · 체력 ${RULES.drops.foodHeal} 회복`;
    const tag = w ? (c.lv === 1 ? '새 무공' : `무공 Lv.${c.lv}`) : pd ? (c.lv === 1 ? '새 심법' : `심법 Lv.${c.lv}`) : '보상';
    const evo = w?.evolve ? `각성: ${PASSIVES.get(w.evolve.with)?.name}와 함께 Lv.5 → 「${WEAPONS.get(w.evolve.into)?.name}」` : '';
    const art = cardArtUrl(w?.card ?? pd?.card ?? '');
    const kind = w ? `${KIND_NAME[w.kind] ?? ''}${w.card ? ' · 천외귀환 카드' : ''}` : pd?.card ? '천외귀환 카드' : '';
    const b = el('button', { class: `choice ${c.kind}`, type: 'button', style: w ? `--c:${w.color}` : '' }, el('span', { class: 'key' }, String(i + 1)), art ? el('img', { class: 'card-art', src: art, alt: '' }) : '', el('span', { class: 'tag' }, `${tag}${kind ? ` · ${kind}` : ''}`), el('b', {}, name), el('span', { class: 'desc' }, desc), evo ? el('span', { class: 'evo' }, evo) : '');
    b.addEventListener('click', () => pick(i));
    return b;
  };
  const showChoices = () => {
    overlay.hidden = false;
    overlay.replaceChildren(el('div', { class: 'panel levelup' }, el('h3', {}, `Lv.${s.level - s.queuedLevels + 1} — 하나를 고른다`), el('div', { class: 'choices' }, ...s.pending!.map(choiceCard))));
  };
  const pick = (i: number) => {
    if (!s.pending) return;
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
          btn('옵션', 'btn ghost', () => optionsPopup(() => Object.assign(opt, loadSave().options))),
          btn('메인으로(이 장은 처음부터)', 'btn ghost', () => {
            if (confirm('메인으로 나갈까? 이 장의 진행은 저장되지 않는다(장을 넘을 때만 자동 저장).')) lobby();
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
  const finish = () => {
    if (ended) return;
    ended = true;
    const save = loadSave();
    save.seen = [...new Set([...save.seen, ...seen])];
    const xp = trainingXp(s);
    void gainXp(xp, null, null).catch(() => undefined);
    const clear = s.result === 'clear';
    let next: Slot = slot;
    if (clear) {
      const carry: Carry = carryOf(s);
      next = { ...slot, chapter: slot.chapter + 1, carry };
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
        el('p', { class: 'muted' }, `「천외귀환」 수련 경험치 +${xp}`),
        newly.length ? el('p', { class: 'unlock' }, `새 인물: ${newly.join(', ')}`) : '',
        el(
          'div',
          { class: 'menu-col' },
          clear && !done ? btn('다음 장으로', 'btn primary', () => chapterCard(next)) : '',
          !clear ? btn('이 장 다시', 'btn primary', () => chapterCard(slot)) : '',
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
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    const W = canvas.width;
    const H = canvas.height;
    const dpr = W / window.innerWidth;
    const zoom = dpr * Math.max(0.6, Math.min(1.6, Math.min(window.innerWidth, window.innerHeight) / 600));
    s.view = W / 2 / zoom;
    if (!paused && !s.pending && !s.result) {
      acc += Math.min(0.1, (now - last) / 1000);
      while (acc >= DT) {
        acc -= DT;
        step(s, input());
        for (const e of s.events) if (e.type === 'kill') seen.add(e.foe);
        if (s.pending || s.result) break;
      }
    }
    last = now;
    absorb(view, s, now, opt);
    draw(ctx, s, art, view, now, W, H, zoom, dpr, opt);
    dashBtn.style.setProperty('--k', String(1 - Math.max(0, s.player.dashReady - s.t) / RULES.dash.cooldown));
    ultBtn.style.setProperty('--k', String(s.ult / RULES.ult.max));
    ultBtn.classList.toggle('ready', s.ult >= RULES.ult.max);
    if (s.pending && overlay.hidden) showChoices();
    if (s.result && !ended) setTimeout(finish, s.result === 'lose' ? 900 : 1800);
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

function levelDiff(id: string, lv: number): string {
  const w = WEAPONS.get(id)!;
  const a = w.levels[lv - 2];
  const b = w.levels[lv - 1];
  const out: string[] = [];
  if (b.damage !== a.damage) out.push(`피해 ${a.damage}→${b.damage}`);
  if (b.cooldown !== a.cooldown) out.push(`대기 ${a.cooldown}→${b.cooldown}초`);
  if (b.count !== a.count) out.push(`${w.kind === 'slash' ? '방향' : '개수'} ${a.count}→${b.count}`);
  if (b.area !== a.area) out.push(`범위 +${Math.round((b.area / a.area - 1) * 100)}%`);
  if (b.pierce !== a.pierce && b.pierce) out.push(b.pierce >= 99 ? '모두 관통' : `관통 ${b.pierce}`);
  if (b.duration !== a.duration && (w.kind === 'orbit' || w.kind === 'rain')) out.push(`지속 ${b.duration}초`);
  return out.join(' · ') || w.desc;
}

// 점검용 바로 가기: ?play=<장 1~10>&hero=<id> · ?screen=lobby|story|codex|wardrobe|options|load|save
const direct = Number(params.get('play') ?? 0);
const screen = params.get('screen');
if (direct > 0) {
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

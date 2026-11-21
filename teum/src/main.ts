// 「틈」 화면 흐름(2026-11-18 2차, GAME_DESIGN 1절): 들어가기(게스트) → 메인(불러오기·저장·스토리·무한) → 장 카드 → 판 → 장 끝(자동 저장).
// 입력: WASD·방향키 / 휴대폰은 왼쪽을 끌어 가상 막대, 오른쪽 아래 보법·천외귀운 단추. ESC 멈춤.
import './style.css';
import { frameUrl } from '../../src/render/assets';
import { currentTraining, gainXp } from '../../gyeol/src/training';
import progressRaw from '../../gyeol/data/progress.json';
import { banish, CHAPTER_LENGTH, carryOf, choose, createChapter, dashCooldown, DT, elementCounts, FOES, freshCarry, HEROES, ITEMS, LOCKABLE, partnersOf, PASSIVES, rarityOf, reroll, RULES, skip as skipChoice, STORY, step, trainingXp, WEAPONS, type Carry, type Choice, type Input, type State } from './sim';
import { absorb, draw, emptyView, loadArt, type Art, type View } from './render';
import { cardArtUrl } from '../../src/render/assets';
import { bookSummary, describe, matches, presets, RANGED } from './book';
import { autosave, bank, cheonoeCards, heroOpen, loadSave, slotLabel, writeSave, type SaveData, type Slot } from './save';
import { createRng } from '../../src/engine/rng';

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
// 2026-11-21 사용자 "메뉴 밑 설명은 다 지우고 간단 명료하게"
const MENU = [
  { id: 'load', name: '불러오기', icon: 1 },
  { id: 'save', name: '저장', icon: 2 },
  { id: 'story', name: '스토리', icon: 3 },
  { id: 'shop', name: '장터', icon: 0 },
  { id: 'endless', name: '무한 모드', icon: 4, locked: true },
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

const RARITY_NAME: Record<string, string> = { common: '흔함', uncommon: '드묾', rare: '귀함', epic: '영웅', legendary: '전설' };

const LOCK_SET = new Set(LOCKABLE);
/** 연 카드 무공·심법: 「틈」에서 연 것 + 「천외귀환」에서 모은 카드(2026-11-21) */
function openCards(sv: SaveData): Set<string> {
  return new Set([...sv.unlocked, ...cheonoeCards().map((id) => `c_${id}`).filter((id) => LOCK_SET.has(id))]);
}
/** 이 인물이 들고 갈 수 있는 것 */
const usable = (heroId: string, id: string): boolean => {
  const w = WEAPONS.get(id);
  return w ? w.owner === '*' || w.owner === heroId : PASSIVES.has(id);
};
const RANK: Record<string, number> = { legendary: 5, epic: 4, rare: 3, uncommon: 2, common: 1 };
/** 무공록 자동: 이 인물 것·귀한 것부터 무공 2/3 · 심법 1/3 */
function autoBook(heroId: string, open: Set<string>): string[] {
  const ids = [...open].filter((id) => usable(heroId, id));
  const score = (id: string) => (WEAPONS.get(id)?.owner === heroId ? 10 : 0) + (RANK[rarityOf(id)] ?? 1);
  const ws = ids.filter((id) => WEAPONS.has(id)).sort((a, b) => score(b) - score(a));
  const ps = ids.filter((id) => PASSIVES.has(id)).sort((a, b) => score(b) - score(a));
  const n = RULES.build.bookAuto;
  const wn = Math.min(ws.length, Math.ceil((n * 2) / 3));
  return [...ws.slice(0, wn), ...ps.slice(0, n - wn)];
}
const bookOf = (slot: Slot, sv: SaveData): string[] => (slot.book ?? autoBook(slot.hero, openCards(sv))).slice(0, RULES.build.bookMax);

/** 무공서고(2026-11-21 사용자 "스킬을 처음부터 다 열지 말고 돈으로 사거나 보스를 잡으면 열리게"):
 *  금화 지갑으로 잠긴 「천외귀환」 카드 무공·심법을 연다. 진열은 지갑 시드로 정해지고, 다시 펼치면 바뀐다 */
function shopPopup(initial: 'up' | 'book' = 'up'): void {
  const sv = loadSave();
  sv.upgrades ??= {};
  const U = RULES.unlock;
  let tab = initial;
  const body = el('div', { class: 'shop' });
  const render = () => {
    const tabs = el('div', { class: 'row-pick' }, btn('수련(영구 능력)', `chip${tab === 'up' ? ' on' : ''}`, () => ((tab = 'up'), render())), btn('비급(무공 열기)', `chip${tab === 'book' ? ' on' : ''}`, () => ((tab = 'book'), render())));
    const wallet = el('b', { class: 'wallet' }, `금화 ${sv.wallet}`);
    if (tab === 'up') {
      // 장터 수련(2026-11-21 "금화를 쓸 곳이 없다"): 영구 능력 — 판에서 져도 조금씩 강해진다
      const grid = el(
        'div',
        { class: 'grid text shop-grid' },
        ...RULES.upgrades.list.map((u) => {
          const lv = sv.upgrades[u.id] ?? 0;
          const max = u.cost.length;
          const price = u.cost[lv];
          const poor = price === undefined || sv.wallet < price;
          return el(
            'div',
            { class: 'entry upg' },
            el('b', {}, `${u.name} ${'●'.repeat(lv)}${'○'.repeat(max - lv)}`),
            el('small', {}, u.desc),
            price === undefined
              ? el('small', { class: 'done' }, '다 배웠다')
              : btn(`금화 ${price}`, `btn small${poor ? '' : ' primary'}`, () => {
                  if (sv.wallet < price) return;
                  sv.wallet -= price;
                  sv.upgrades[u.id] = lv + 1;
                  writeSave(sv);
                  render();
                }, poor ? { disabled: '' } : {}),
          );
        }),
      );
      body.replaceChildren(tabs, el('div', { class: 'shop-head' }, wallet, el('small', {}, '장에서 모은 금화가 여기로 온다. 배운 수련은 모든 인물·모든 장에 듣는다')), grid);
      return;
    }
    const open = openCards(sv);
    const locked = LOCKABLE.filter((id) => !open.has(id));
    const rng = createRng(`teum-shop:${sv.shopSeed}`);
    const pool = [...locked];
    const offers: string[] = [];
    while (offers.length < U.shop.offers && pool.length) offers.push(pool.splice(rng.int(0, pool.length - 1), 1)[0]);
    const rerollBtn = btn(`다시 펼치기 · 금화 ${U.shop.reroll}`, 'btn small ghost', () => {
      if (sv.wallet < U.shop.reroll) return;
      sv.wallet -= U.shop.reroll;
      sv.shopSeed++;
      writeSave(sv);
      render();
    }, sv.wallet < U.shop.reroll ? { disabled: '' } : {});
    const linked = cheonoeCards().length;
    const head = el(
      'div',
      { class: 'shop-head' },
      wallet,
      el('small', {}, `연 비급 ${LOCKABLE.length - locked.length} / ${LOCKABLE.length}${linked ? ` — 「천외귀환」에서 모은 카드도 열린 것으로 친다` : ''}. 보스는 비급 ${U.boss}개, 중간 보스는 ${U.mid}개를 떨군다`),
      rerollBtn,
    );
    const grid = el(
      'div',
      { class: 'grid text shop-grid' },
      ...offers.map((id) => {
        const w = WEAPONS.get(id);
        const pd = PASSIVES.get(id);
        const r = rarityOf(id);
        const price = U.price[r] ?? 60;
        const a = cardArtUrl(w?.card ?? pd?.card ?? '');
        const owner = w && w.owner !== '*' ? (HEROES.find((h) => h.id === w.owner)?.name ?? '') : '모두';
        const poor = sv.wallet < price;
        return el(
          'div',
          { class: `entry rare-${r}`, style: w ? `--c:${w.color}` : '' },
          a ? el('img', { class: 'thumb', src: a, alt: '', loading: 'lazy' }) : '',
          el('b', {}, w?.name ?? pd?.name ?? id),
          el('small', {}, `${w ? `무공 · ${KIND_NAME[w.kind]}` : '심법'} · ${owner} · ${RARITY_NAME[r] ?? r}`),
          el('small', {}, w?.desc ?? pd?.desc ?? ''),
          btn(`금화 ${price}에 연다`, `btn small${poor ? '' : ' primary'}`, () => {
            if (sv.wallet < price) return;
            sv.wallet -= price;
            sv.unlocked = [...sv.unlocked, id];
            writeSave(sv);
            render();
          }, poor ? { disabled: '' } : {}),
        );
      }),
    );
    body.replaceChildren(tabs, head, locked.length ? grid : el('p', {}, '모든 비급을 열었다.'));
  };
  render();
  const { root } = modal('장터');
  root.querySelector('.modal-box')!.classList.add('wide');
  root.querySelector('.modal-box')!.insertBefore(body, root.querySelector('.modal-close'));
}

/** 무공록(2026-11-21 "스킬이 너무 많아 빌드가 무너진다"): 연 카드 무공·심법 중 bookMax장을 골라 들고 들어간다 — 그 밖의 카드 것은 레벨업에 안 나온다.
 *  2026-11-21 사용자 "무공록만 봐서는 이해가 안 간다": 추천 묶음 · 거르기·찾기 · 고른 것의 자세한 설명 · 함께 쓰면 좋은 짝 · 세트 미리 보기 */
function bookPopup(slot: Slot, onDone: () => void): void {
  const sv = loadSave();
  const open = openCards(sv);
  const max = RULES.build.bookMax;
  let pick = new Set(bookOf(slot, sv));
  const ids = [...open].filter((id) => usable(slot.hero, id)).sort((a, b) => (RANK[rarityOf(b)] ?? 1) - (RANK[rarityOf(a)] ?? 1));
  const recs = presets(slot.hero, open);
  let filter = 'all';
  let query = '';
  let focus: string | null = ids[0] ?? null;
  const FILTERS: [string, string][] = [['all', '전체'], ['weapon', '무공'], ['passive', '심법'], ['ranged', '멀리'], ['close', '둘레'], ['fire', '화염'], ['ice', '서리'], ['shock', '뇌전'], ['vuln', '파쇄'], ['picked', '고른 것']];
  const pass = (id: string): boolean => {
    const w = WEAPONS.get(id);
    const name = w?.name ?? PASSIVES.get(id)?.name ?? '';
    if (query && !name.includes(query) && !describe(id).tag.includes(query)) return false;
    switch (filter) {
      case 'weapon': return !!w;
      case 'passive': return !w;
      case 'ranged': return !!w && RANGED.includes(w.kind);
      case 'close': return !!w && !RANGED.includes(w.kind);
      case 'picked': return pick.has(id);
      case 'all': return true;
      default: return w?.element === filter;
    }
  };
  const toggle = (id: string) => {
    if (pick.has(id)) pick.delete(id);
    else if (pick.size < max) pick.add(id);
  };
  const body = el('div', { class: 'book' });
  const search = el('input', { type: 'search', placeholder: '이름·종류로 찾기', class: 'book-search' }) as HTMLInputElement;
  search.addEventListener('input', () => {
    query = search.value.trim();
    render();
    // 다시 그려도 찾기 칸에서 계속 칠 수 있게
    search.focus();
    search.setSelectionRange(search.value.length, search.value.length);
  });
  const render = () => {
    const sum = bookSummary(pick);
    const head = el(
      'div',
      { class: 'shop-head' },
      el('b', { class: 'wallet' }, `${pick.size} / ${max}`),
      el('small', {}, [`멀리 ${sum.ranged} · 둘레 ${sum.close} · 심법 ${sum.passives}`, ...sum.sets.map((x) => `${x.name} ${x.n}/${x.need}${x.n >= x.need ? ' ✓' : ''}`)].join(' · ') + ' — 이 인물의 기본 무공·기본 심법은 무공록과 상관없이 늘 나온다'),
      btn('자동으로', 'btn small ghost', () => ((pick = new Set(autoBook(slot.hero, open))), render())),
      btn('비우기', 'btn small ghost', () => ((pick = new Set()), render())),
    );
    const recRow = recs.length
      ? el('div', { class: 'book-recs' }, el('small', {}, '추천 묶음'), ...recs.map((r) => btn([el('b', {}, r.name), el('small', {}, `${r.desc} (${r.ids.length}장)`)], 'rec', () => ((pick = new Set(r.ids.slice(0, max))), render()), { title: r.desc })))
      : '';
    const chips = el('div', { class: 'row-pick' }, ...FILTERS.map(([k, n]) => btn(n, `chip${filter === k ? ' on' : ''}`, () => ((filter = k), render()))), search);
    const shown = ids.filter(pass);
    const grid = el(
      'div',
      { class: 'grid text shop-grid book-grid' },
      ...shown.map((id) => {
        const w = WEAPONS.get(id);
        const pd = PASSIVES.get(id);
        const a = cardArtUrl(w?.card ?? pd?.card ?? '');
        const on = pick.has(id);
        const info = describe(id);
        const card = el(
          'div',
          { class: `entry pick${on ? ' on' : ''}${focus === id ? ' focus' : ''} rare-${rarityOf(id)}`, style: w ? `--c:${w.color}` : '', tabindex: '0' },
          a ? el('img', { class: 'thumb', src: a, alt: '', loading: 'lazy' }) : '',
          el('b', {}, w?.name ?? pd?.name ?? id),
          el('small', {}, info.tag),
          el('small', {}, info.lines[0] ?? ''),
        );
        const add = btn(on ? '빼기' : '넣기', `btn small ${on ? 'ghost' : 'primary'} add`, () => (toggle(id), render()), !on && pick.size >= max ? { disabled: '' } : {});
        add.addEventListener('click', (e) => e.stopPropagation());
        card.append(add);
        card.addEventListener('click', () => ((focus = id), render()));
        card.addEventListener('keydown', (e) => (e as KeyboardEvent).key === 'Enter' && (toggle(id), render()));
        return card;
      }),
    );
    // 고른 것 자세히 + 함께 쓰면 좋은 짝
    let detail: HTMLElement | string = '';
    if (focus) {
      const info = describe(focus);
      const w = WEAPONS.get(focus);
      const pd = PASSIVES.get(focus);
      const a = cardArtUrl(w?.card ?? pd?.card ?? '');
      const mates = matches(focus, ids);
      detail = el(
        'aside',
        { class: 'book-detail', style: w ? `--c:${w.color}` : '' },
        a ? el('img', { class: 'art', src: a, alt: '' }) : '',
        el('h4', {}, info.name),
        el('small', { class: 'tag' }, info.tag),
        ...info.lines.map((l) => el('p', {}, l)),
        btn(pick.has(focus) ? '무공록에서 빼기' : '무공록에 넣기', `btn small ${pick.has(focus) ? 'ghost' : 'primary'}`, () => (toggle(focus!), render())),
        mates.length ? el('h5', {}, '함께 쓰면 좋은 것') : '',
        ...mates.map((m) => {
          const mi = describe(m);
          const row = el('div', { class: `mate${pick.has(m) ? ' on' : ''}` }, el('span', {}, el('b', {}, mi.name), el('small', {}, mi.tag)), btn(pick.has(m) ? '✓' : '+', 'btn small ghost', () => (toggle(m), render()), !pick.has(m) && pick.size >= max ? { disabled: '' } : {}));
          row.addEventListener('click', (e) => (e.target as HTMLElement).tagName !== 'BUTTON' && ((focus = m), render()));
          return row;
        }),
      );
    }
    body.replaceChildren(
      head,
      recRow,
      chips,
      ids.length ? el('div', { class: 'book-main' }, el('div', { class: 'book-list' }, shown.length ? grid : el('p', { class: 'note' }, '맞는 것이 없다')), detail) : el('p', {}, '아직 연 카드 무공이 없다 — 보스를 잡거나 장터에서 비급을 사라.'),
    );
  };
  render();
  const { root, close } = modal('무공록 — 들고 갈 카드');
  root.querySelector('.modal-box')!.classList.add('wide', 'book-box');
  root.querySelector('.modal-box')!.insertBefore(body, root.querySelector('.modal-close'));
  const done = () => {
    slot.book = [...pick];
    const s2 = loadSave();
    s2.slots[s2.active] = { ...slot };
    writeSave(s2);
    onDone();
  };
  root.querySelector('.modal-close')!.addEventListener('click', done);
  root.addEventListener('click', (e) => e.target === root && done());
  void close;
}

/** 재편성(2026-11-21): 장을 열기 전에 무공·심법을 둘까지 버리면, 장을 열자마자 그만큼 새로 고른다 */
function rebuildPopup(slot: Slot, onDone: () => void): void {
  const drop = new Set<string>();
  const body = el('div', { class: 'rebuild' });
  const render = () => {
    const items = [...slot.carry.weapons.map((w) => ({ id: w.id, name: WEAPONS.get(w.id)?.name ?? w.id, lv: w.lv, kind: '무공' })), ...slot.carry.passives.map(([id, lv]) => ({ id, name: PASSIVES.get(id)?.name ?? id, lv, kind: '심법' }))];
    body.replaceChildren(
      el('p', { class: 'note' }, `버릴 것을 둘까지 고른다(${drop.size}/2). 장을 열자마자 버린 수만큼 레벨업 고르기가 나온다.`),
      el('div', { class: 'grid text' }, ...items.map((it) => {
        const b = el('button', { class: `entry pick${drop.has(it.id) ? ' on' : ''}`, type: 'button' }, el('b', {}, `${drop.has(it.id) ? '✕ ' : ''}${it.name}`), el('small', {}, `${it.kind} Lv.${it.lv}`));
        b.addEventListener('click', () => {
          if (drop.has(it.id)) drop.delete(it.id);
          else if (drop.size < 2) drop.add(it.id);
          render();
        });
        return b;
      })),
      btn('이대로 재편성', 'btn primary', () => {
        if (!drop.size) return void close();
        slot.carry = { ...slot.carry, weapons: slot.carry.weapons.filter((w) => !drop.has(w.id)), passives: slot.carry.passives.filter(([id]) => !drop.has(id)) };
        slot.rebuild = (slot.rebuild ?? 0) + drop.size;
        const sv = loadSave();
        sv.slots[sv.active] = { ...slot };
        writeSave(sv);
        close();
        onDone();
      }),
    );
  };
  render();
  const { root, close } = modal('재편성');
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
  const fx = el('select', {}, el('option', { value: 'strong' }, '진하게'), el('option', { value: 'normal' }, '보통'), el('option', { value: 'soft' }, '옅게'));
  fx.value = sv.options.fx ?? 'normal';
  fx.addEventListener('change', () => {
    sv.options.fx = fx.value as 'strong' | 'normal' | 'soft';
    writeSave(sv);
  });
  const area = el('select', {}, el('option', { value: 'simple' }, '단순하게(눈이 편함)'), el('option', { value: 'fancy' }, '화려하게'));
  area.value = sv.options.areaFx ?? 'simple';
  area.addEventListener('change', () => {
    sv.options.areaFx = area.value as 'simple' | 'fancy';
    writeSave(sv);
  });
  const reset = btn('이 기기의 「틈」 기록 모두 지우기', 'btn small danger', () => {
    if (!confirm('저장 칸·도감·옷장·옵션을 모두 지울까?')) return;
    localStorage.removeItem('teum.save');
    location.reload();
  });
  const { root, close } = modal('옵션', el('div', { class: 'opts' }, row('화면 흔들림', check('shake')), row('피해 숫자', check('numbers')), row('지도 크기', map), row('내 무공 이펙트', fx), row('몸 둘레 범위 기술', area), el('p', { class: 'note' }, '조작: WASD·방향키 이동 · Space/Shift 보법 · Q 마지막 기술 · ESC 멈춤 · 레벨업 1~4 · R 다시 뽑기 · B 봉인 · S 건너뛰기'), reset));
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
  const sv = loadSave();
  const book = bookOf(slot, sv);
  const extra = el(
    'div',
    { class: 'menu-row' },
    btn(`무공록 ${book.length}/${RULES.build.bookMax}`, 'btn ghost', () => bookPopup(slot, () => chapterCard(slot))),
    slot.chapter > 0 && slot.carry.weapons.length + slot.carry.passives.length > 1 ? btn(slot.rebuild ? `재편성 (${slot.rebuild})` : '재편성', 'btn ghost', () => rebuildPopup(slot, () => chapterCard(slot))) : '',
    slot.checkpoint ? btn('중간 보스 뒤에서 이어 하기', 'btn ghost', () => void play(slot, true)) : '',
  );
  app.replaceChildren(
    el(
      'section',
      { class: 'screen chapter-card', style: cg ? `--cg:url("${cg}")` : `--cg:linear-gradient(160deg, ${ch.color[2]}, ${ch.color[0]} 60%, ${ch.color[3]})` },
      el(
        'div',
        { class: 'cc-text' },
        el('small', {}, `${slot.chapter + 1} / ${STORY.chapters.length}`),
        el('h2', {}, ch.name),
        el('p', {}, ch.line),
        el('p', { class: 'note' }, `${Math.round(CHAPTER_LENGTH / 60)}분 · 빅웨이브 둘 · 중간 보스 「${FOES.get(ch.roles.mid)?.name}」 · 보스 「${FOES.get(ch.roles.boss)?.name}」`),
        ch.gimmick ? el('p', { class: 'note gimmick' }, `이 장의 기믹 — ${ch.gimmick.name}: ${ch.gimmick.text}`) : '',
        el('div', { class: 'menu-row' }, start, btn('메인으로', 'btn ghost', lobby)),
        extra,
      ),
    ),
  );
  screenKeys = (e) => {
    if (e.key === 'Enter' || e.key === ' ') start.click();
    if (e.key === 'Escape') lobby();
  };
  start.focus();
}

// ── 4. 판 ──
async function play(slot: Slot, fromCheckpoint = false): Promise<void> {
  stopRun?.();
  screenKeys = null;
  const sv = loadSave();
  const cp = fromCheckpoint ? slot.checkpoint : undefined;
  const seed = cp?.seed ?? params.get('seed') ?? `${slot.hero}-${slot.chapter}-${Date.now().toString(36)}`;
  const opts = ALL ? { meta: sv.upgrades } : { unlocked: openCards(sv), book: bookOf(slot, sv), meta: sv.upgrades, rebuild: cp ? 0 : slot.rebuild, startAt: cp?.t };
  const s = createChapter(slot.chapter, seed, cp?.carry ?? slot.carry, opts);
  // 재편성은 한 번만
  if (slot.rebuild && !cp) {
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
  if (params.has('debug')) (window as unknown as { __teum?: State }).__teum = s;

  const keys = new Set<string>();
  let wantDash = false;
  let wantUlt = false;
  let touch: { id: number; x0: number; y0: number; x: number; y: number } | null = null;
  const onKey = (e: KeyboardEvent) => {
    if (e.type === 'keydown') {
      if (!overlay.hidden && /^[1-4]$/.test(e.key) && s.pending) return pick(Number(e.key) - 1);
      if (!overlay.hidden && s.pending && e.code === 'KeyR') return void (reroll(s) && showChoices());
      if (!overlay.hidden && s.pending && e.code === 'KeyS') return void (skipChoice(s) ? (s.pending ? showChoices() : (overlay.hidden = true)) : 0);
      if (!overlay.hidden && s.pending && e.code === 'KeyB') return void ((banMode = !banMode), showChoices());
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
    const name = w?.name ?? pd?.name ?? (c.kind === 'gold' ? '금화 15' : '굳센 몸');
    // 2026-11-21: 새 무공·심법은 무공록과 같은 자세한 설명(무엇을 하는지 · 수치)
    const desc = w ? (c.lv === 1 ? describe(c.id).lines.slice(0, 2).join(' — ') : levelDiff(c.id, c.lv)) : pd ? describe(c.id).lines[0] : c.kind === 'gold' ? '금화를 15 얻는다' : '최대 체력 +10(다음 장에도) · 체력 30 회복';
    const tag = w ? (c.lv === 1 ? '새 무공' : `무공 Lv.${c.lv}`) : pd ? (c.lv === 1 ? '새 심법' : `심법 Lv.${c.lv}`) : '보상';
    const partner = pd ? partnersOf(s).get(pd.id) : undefined;
    const ec = elementCounts(s);
    const setHint = w?.element ? ` · ${RULES.sets[w.element].name} 세트 ${(ec[w.element] ?? 0) + (c.lv === 1 ? 1 : 0)}/${RULES.sets[w.element].need}` : '';
    const evo = w?.evolve ? `각성: ${PASSIVES.get(w.evolve.with)?.name}와 함께 Lv.5 → 「${WEAPONS.get(w.evolve.into)?.name}」${s.passives.has(w.evolve.with) ? ' ✓짝 있음' : ''}` : partner ? `★ 「${WEAPONS.get(partner)?.name}」의 각성 짝 — 고르면 각성 길이 열린다` : '';
    const art = cardArtUrl(w?.card ?? pd?.card ?? '');
    const kind = w ? `${KIND_NAME[w.kind] ?? ''}${w.card ? ' · 천외귀환 카드' : ''}${setHint}` : pd?.card ? '천외귀환 카드' : '';
    const b = el('button', { class: `choice ${c.kind}`, type: 'button', style: w ? `--c:${w.color}` : '' }, el('span', { class: 'key' }, String(i + 1)), art ? el('img', { class: 'card-art', src: art, alt: '' }) : '', el('span', { class: 'tag' }, `${tag}${kind ? ` · ${kind}` : ''}`), el('b', {}, name), el('span', { class: 'desc' }, desc), evo ? el('span', { class: 'evo' }, evo) : '');
    if (partner) b.classList.add('partner');
    if (banMode && c.lv === 1) b.classList.add('ban');
    b.addEventListener('click', () => pick(i));
    return b;
  };
  let banMode = false;
  const showChoices = () => {
    overlay.hidden = false;
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
          btn('옵션', 'btn ghost', () => optionsPopup(() => Object.assign(opt, loadSave().options))),
          btn('메인으로(이 장은 처음부터)', 'btn ghost', () => {
            if (confirm('메인으로 나갈까? 이 장의 진행은 저장되지 않는다(장을 넘을 때만 자동 저장). 번 금화·비급은 남는다.')) {
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
    rollUntil = now + (r.evolve ? 1700 : 1100);
    const icons = s.weapons.map((w) => cardArtUrl(WEAPONS.get(w.id)?.card ?? '')).filter(Boolean) as string[];
    const stand = realArt(s.hero.stand);
    const box = el(
      'div',
      { class: `chest-roll${r.evolve ? ' evolve' : ''}` },
      r.evolve && stand ? el('img', { class: 'cut', src: stand, alt: '' }) : '',
      el('div', { class: 'reel' }, ...[...icons, ...icons, ...icons].slice(0, 12).map((src) => el('img', { src, alt: '' }))),
      el('b', {}, r.text),
    );
    box.addEventListener('click', () => {
      rollUntil = 0;
      box.remove();
    });
    app.querySelector('.screen.run')?.append(box);
    setTimeout(() => box.remove(), r.evolve ? 1700 : 1100);
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
    absorb(view, s, now, opt);
    // 중간 보스를 넘은 자리를 칸에 적어 둔다(나가도 이어 할 수 있게)
    if (s.checkpoint && !cpSaved) {
      cpSaved = true;
      slot.checkpoint = { seed, t: s.checkpoint.t, carry: s.checkpoint.carry };
      const s2 = loadSave();
      s2.slots[s2.active] = { ...slot };
      writeSave(s2);
    }
    if (view.chestRoll) showRoll(view.chestRoll, now);
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

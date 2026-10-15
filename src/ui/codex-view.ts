// 도감 화면(GAME_DESIGN 2절): 시작 화면에서 연다. 한 번이라도 본 것만 보이고, 못 본 칸은 ? 실루엣.
// 탭: 카드 · 적 · 유물·물약 · 인물 · 장면(다시 보기 + 장면 그림) · 심연(3차) · 기록
// 카드 칸은 3단계: ? (모름) → 윤곽(본 적 있음: 심연 풀에 들어간다) → 실물(보유: 강화 단계)
import { clearRunLog, exportRunLog, readRunLog, RUN_LOG_MAX } from './run-log';
import { codexCards, codexPeople, codexProgress, type Codex, type CodexProgress } from '../engine/codex';
import type { GameData } from '../engine/data';
import { riftCards, unlockedRift, unlockName, unlockSource, oathMax, type AbyssMeta } from '../engine/abyss';
import { intentBadges } from '../engine/battle';
import type { CardDef, EnemyDef } from '../engine/schema';
import { frameUrl } from '../render/assets';
import { loadPortrait } from '../render/portrait';
import { cardView } from './card-view';
import { h } from './dom';
import { startRiftMaxText } from './map-view';
import { glossaryTab } from './glossary-view';
import { affixIconEl, lawIconEl } from './icons';
import { potionChip, relicChip } from './items';
import { mainTitle, setMainTitle, type Profile } from './storage';
import { installTooltips } from './tooltip';
import { confirmDialog, openOverlay } from './overlay';

export interface CodexHandlers {
  onBack: () => void;
  /** 본 장면 다시 보기(끝나면 도감으로 돌아온다) */
  onPlayScene: (sceneId: string, tab: CodexTab) => void;
}

export type CodexTab = 'cards' | 'enemies' | 'items' | 'people' | 'scenes' | 'abyss' | 'stats' | 'glossary';
const TABS: { id: CodexTab; label: string }[] = [
  { id: 'cards', label: '카드' },
  { id: 'enemies', label: '적' },
  { id: 'items', label: '유물·물약' },
  { id: 'people', label: '인물' },
  { id: 'scenes', label: '장면' },
  { id: 'abyss', label: '심연' },
  { id: 'stats', label: '기록' },
];

// ───────── 눌러서 크게 보기(2026-10-08) ─────────
const TYPE_LABEL: Record<string, string> = { attack: '공격', skill: '기술', power: '심법', status: '상태' };
const RARITY_LABEL: Record<string, string> = { common: '일반', uncommon: '고급', rare: '희귀', epic: '영웅', legendary: '전설', special: '특수', path: '길' };
const INTENT_LABEL: Record<string, string> = { attack: '공격', defend: '방어', buff: '강화', debuff: '약화', special: '특수' };

const facts = (rows: [string, string][]) => h('dl', { class: 'zoom-facts' }, rows.filter(([, v]) => v).flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]));

/** 카드: 크게 + 본 적 있는 강화 단계(0~최고)를 골라 볼 수 있다 */
function openCard(data: GameData, def: CardDef, best: number): void {
  const big = h('div', { class: 'zoom-card' });
  const levels = h('div', { class: 'zoom-levels' });
  const owner = data.characters.get(def.owner)?.name ?? (def.owner === 'common' ? '공용' : def.owner);
  const show = (lv: number) => {
    big.replaceChildren(cardView(data, { uid: `zoom_${def.id}`, cardId: def.id, level: lv }, { flavor: 'full' }));
    for (const b of levels.children) b.classList.toggle('on', Number((b as HTMLElement).dataset.lv) === lv);
  };
  if (best > 0) for (let lv = 0; lv <= best; lv++) levels.append(h('button', { class: 'btn btn-small', 'data-lv': lv, onclick: () => show(lv) }, lv ? `+${lv}` : '기본'));
  openOverlay(
    def.name,
    h(
      'div',
      { class: 'zoom' },
      h('div', { class: 'zoom-left' }, big, levels),
      h(
        'div',
        { class: 'zoom-right' },
        facts([
          ['주인', owner],
          ['등급', RARITY_LABEL[def.rarity] ?? def.rarity],
          ['종류', TYPE_LABEL[def.type] ?? def.type],
          ['갈래', def.tags.map((t) => [...data.characters.values()].flatMap((c) => c.archetypes).find((a) => a.id === t)?.name ?? t).join(' · ')],
          ['본 최고 강화', best ? `+${best}` : '기본'],
        ]),
        def.flavor ? h('p', { class: 'zoom-flavor' }, def.flavor) : null,
        def.castLine ? h('p', { class: 'zoom-line' }, `${data.speakers.get(def.castLine.speaker)?.name ?? data.characters.get(def.castLine.speaker)?.name ?? ''} — “${def.castLine.text}”`) : null,
      ),
    ),
    { wide: true },
  );
  show(best);
}

/** 적: 만나기만 했으면 그림과 이름, 이겼으면 체력·약점·특성·기술까지 */
function openEnemy(data: GameData, e: EnemyDef, rec: { seen: number; defeated: number }, seenMoves: string[]): void {
  const url = e.sprite ? frameUrl(`${e.sprite}_idle`, 1, { realOnly: true }) : null;
  const known = rec.defeated > 0;
  const list = (xs: string[]) => xs.map((x) => ELEMENT_LABEL[x] ?? x).join(' · ');
  openOverlay(
    e.name,
    h(
      'div',
      { class: 'zoom' },
      h(
        'div',
        { class: 'zoom-left' },
        h('div', { class: `zoom-pic${known ? '' : ' dim'}`, style: e.color ? `--sil:${e.color}` : '' }, url ? h('img', { src: url, alt: e.name }) : h('span', {}, e.name.slice(0, 1))),
      ),
      h(
        'div',
        { class: 'zoom-right' },
        e.lore ? h('p', { class: 'zoom-text zoom-lore' }, e.lore) : null,
        facts([
          ['등급', TIER_LABEL[e.tier]],
          ['만남 · 이김', `${rec.seen} · ${rec.defeated}`],
          ['체력', known ? String(e.maxHp) : '?'],
          ['약점', known ? list(e.weak) : ''],
          ['내성', known ? list(e.resist) : ''],
          ['특성', known ? e.traits.map((t) => `${data.statuses.get(t.status)?.name ?? t.status} ${t.stacks}`).join(' · ') : ''],
        ]),
        // 쓰는 기술: 전투에서 본 기술만 이름과 하는 일이 적힌다(GAME_DESIGN 14절)
        h(
          'div',
          { class: 'zoom-moves' },
          h('h4', {}, `쓰는 기술 ${e.moves.filter((m) => seenMoves.includes(m.id)).length} / ${e.moves.length}`),
          h(
            'ul',
            {},
            e.moves.map((m) =>
              seenMoves.includes(m.id)
                ? h('li', {}, h('b', {}, m.name), h('small', {}, [INTENT_LABEL[m.intent] ?? m.intent, ...moveSummary(data, m)].join(' · ')))
                : h('li', { class: 'unseen' }, h('b', {}, '???'), h('small', {}, '아직 보지 못한 기술')),
            ),
          ),
        ),
        known ? null : h('p', { class: 'hint' }, '한 번 이기면 체력·약점·특성을 알게 된다.'),
      ),
    ),
    { wide: true },
  );
}

function openItem(chip: HTMLElement, name: string, kind: string, text: string, flavor?: string): void {
  openOverlay(
    name,
    h('div', { class: 'zoom' }, h('div', { class: 'zoom-left zoom-item' }, chip), h('div', { class: 'zoom-right' }, h('div', { class: 'zoom-kind' }, kind), h('p', { class: 'zoom-text' }, text), flavor ? h('p', { class: 'zoom-flavor' }, flavor) : null)),
  );
}

/** 인물: 반신 그림 세 표정(기본·결의·놀람)과 소개 */
function openPerson(data: GameData, id: string): void {
  const ch = data.characters.get(id);
  const sp = data.speakers.get(id);
  const name = ch?.name ?? sp?.name ?? id;
  const faces = h('div', { class: 'zoom-faces' });
  (['neutral', 'resolve', 'surprise'] as const).forEach((face) => {
    const box = h('div', { class: 'zoom-face', style: `--who:${ch?.color ?? sp?.color ?? '#888'}` }, h('span', {}, name.slice(0, 1)));
    faces.append(box);
    void loadPortrait(id, face).then((img) => img && box.replaceChildren(h('img', { src: img.src, alt: '' })));
  });
  openOverlay(name, h('div', { class: 'zoom zoom-person' }, faces, h(
        'div',
        { class: 'zoom-right' },
        personTitle(data, id) ? h('div', { class: 'zoom-kind' }, personTitle(data, id)) : null,
        facts([
          ['구분', ch ? '동료' : '이야기 인물'],
          ['처음 만나는 곳', data.stages.find((s) => s.id === personStages(data).get(id))?.name ?? ''],
        ]),
        ch?.lore || sp?.lore || ch?.description ? h('p', { class: 'zoom-text zoom-lore' }, ch?.lore ?? sp?.lore ?? ch?.description ?? '') : null,
      )), { wide: true });
}

const TIER_LABEL: Record<string, string> = { normal: '일반', elite: '정예', boss: '보스' };
const ELEMENT_LABEL: Record<string, string> = { fire: '화염', ice: '냉기' };

/** 적 id → 처음 나오는 스테이지. 전투 모듈에서 찾고, 못 찾으면(변신·불려 나오는 적) 그 id를 품은 적의 스테이지 */
function enemyStages(data: GameData): Map<string, string> {
  const stageOf = new Map<string, string>();
  for (const m of data.modules.values()) for (const id of m.content.enemies ?? []) if (!stageOf.has(id)) stageOf.set(id, m.stage);
  const json = new Map([...data.enemies.values()].map((e) => [e.id, JSON.stringify(e)]));
  for (let changed = true; changed; ) {
    changed = false;
    for (const id of data.enemies.keys()) {
      if (stageOf.has(id)) continue;
      const parent = [...json].find(([pid, text]) => pid !== id && stageOf.has(pid) && text.includes(`"${id}"`));
      if (parent) {
        stageOf.set(id, stageOf.get(parent[0])!);
        changed = true;
      }
    }
  }
  return stageOf;
}

const stageOfScene = (data: GameData, sceneId: string) => data.stages.find((s) => sceneId.startsWith(`${s.id}_`))?.id;

function section(title: string, note: string | null, ...body: (HTMLElement | HTMLElement[] | null)[]): HTMLElement {
  return h('section', { class: 'codex-section' }, h('h3', {}, title, note ? h('small', {}, note) : null), ...body);
}

/** 묶음 하나(주인 · 스테이지 · 유물/물약 …): 왼쪽 목록에 이름 · 채운 수 · 막대, 고르면 가운데에 그 묶음만 */
interface CodexGroup {
  id: string;
  name: string;
  seen: number;
  total: number;
  /** 목록 칸의 둘째 줄(없으면 "seen / total") */
  note?: string;
  render: () => HTMLElement | (HTMLElement | null)[];
}
/** 탭마다 고른 묶음(탭을 다시 열어도 유지) */
const groupSel: Partial<Record<string, string>> = {};

/**
 * 편성·상점과 같은 짜임(2026-10-12): 왼쪽 묶음 목록(휴대폰은 옆으로 넘기는 줄) · 가운데 고른 묶음.
 * 상세는 지금처럼 칸을 누르면 창으로 뜬다. side: 목록 아래에 붙일 패널(거르기 등)
 */
function splitTab(key: string, listTitle: string, groups: CodexGroup[], side: HTMLElement[] = [], foot?: HTMLElement): HTMLElement {
  const root = h('div', { class: 'codex-split' });
  const shown = groups.filter((g) => g.total > 0);
  const draw = () => {
    const sel = shown.find((g) => g.id === groupSel[key]) ?? shown[0];
    if (sel) groupSel[key] = sel.id;
    const pctOf = (g: CodexGroup) => (g.total ? Math.round((100 * g.seen) / g.total) : 0);
    root.replaceChildren(
      h(
        'aside',
        { class: 'codex-side' },
        h(
          'section',
          { class: 'codex-groups panel' },
          h('h3', { class: 'codex-side-h' }, listTitle),
          h(
            'nav',
            { class: 'codex-group-list', 'aria-label': listTitle },
            shown.map((g) =>
              h(
                'button',
                { class: `codex-group${g === sel ? ' on' : ''}${g.seen >= g.total ? ' done' : ''}`, 'aria-pressed': String(g === sel), onclick: () => ((groupSel[key] = g.id), draw()) },
                h('span', { class: 'codex-group-top' }, h('b', {}, g.name), h('small', {}, g.note ?? `${g.seen} / ${g.total}`)),
                h('span', { class: 'lo-meter' }, h('i', { style: `width:${pctOf(g)}%` })),
              ),
            ),
          ),
        ),
        ...side,
      ),
      h(
        'div',
        { class: 'codex-main panel' },
        sel ? h('div', { class: 'codex-main-head' }, h('b', {}, sel.name), h('small', {}, sel.note ?? `${sel.seen} / ${sel.total}`)) : null,
        ...(sel ? [sel.render()].flat() : []),
        foot ?? null,
      ),
    );
  };
  draw();
  return root;
}

/** 카드 탭 거르기(2026-10-11 UI/UX 4-1) — 탭을 다시 열어도 유지 */
type CardFilter = 'all' | 'owned' | 'seen' | 'unseen';
const CARD_FILTERS: { id: CardFilter; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'owned', label: '보유만' },
  { id: 'seen', label: '본 것만' },
  { id: 'unseen', label: '못 본 것' },
];
let cardFilter: CardFilter = 'all';

function cardsTab(data: GameData, codex: Codex, owned?: Record<string, number>): HTMLElement {
  const cards = codexCards(data);
  const order = [...data.characters.keys(), 'common'];
  const rank = (owner: string) => (order.includes(owner) ? order.indexOf(owner) : order.length);
  const owners = [...new Set(cards.map((c) => c.owner))].sort((a, b) => rank(a) - rank(b));
  const rarityOrder = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'special'];
  // 보유는 지도에서 연 도감(지금 런)에만 있다
  if (!owned && cardFilter === 'owned') cardFilter = 'all';
  const isSeen = (def: CardDef) => def.id in codex.cards || owned?.[def.id] !== undefined;
  const keep = (def: CardDef) =>
    cardFilter === 'all' ? true : cardFilter === 'owned' ? owned?.[def.id] !== undefined : cardFilter === 'seen' ? isSeen(def) : !isSeen(def);
  const tile = (def: CardDef) => {
    const have = owned?.[def.id];
    if (!isSeen(def)) return h('div', { class: `codex-card unknown rarity-${def.rarity}`, 'aria-label': '아직 못 본 카드' }, h('span', {}, '?'));
    // 실물(보유: 보유 강화 단계) · 윤곽(본 적만 있음)
    const real = !owned || have !== undefined;
    const level = have ?? codex.cards[def.id] ?? 0;
    return h(
      'div',
      { class: `deck-card codex-card zoomable${real ? '' : ' outline'}`, title: real ? '눌러서 크게 보기' : '본 적 있는 카드(윤곽) — 심연의 보상에 +0으로 나온다', onclick: () => openCard(data, def, Math.max(level, codex.cards[def.id] ?? 0)) },
      cardView(data, { uid: `codex_${def.id}`, cardId: def.id, level: real ? level : 0 }),
      owned ? h('span', { class: `codex-own${real ? ' on' : ''}` }, real ? `보유${have ? ` +${have}` : ''}` : '윤곽 · 본 적 있음') : null,
    );
  };
  const root = h('div', { class: 'codex-tabroot' });
  const draw = () => {
    const bar = h(
      'section',
      { class: 'codex-filter panel', role: 'radiogroup', 'aria-label': '카드 거르기' },
      h('h3', { class: 'codex-side-h' }, '거르기'),
      h(
        'div',
        { class: 'codex-filter-btns' },
        CARD_FILTERS.filter((f) => f.id !== 'owned' || owned).map((f) =>
          h('button', { class: `btn btn-small${cardFilter === f.id ? ' on' : ''}`, role: 'radio', 'aria-checked': String(cardFilter === f.id), onclick: () => ((cardFilter = f.id), draw()) }, f.label),
        ),
      ),
    );
    const groups: CodexGroup[] = owners.map((owner) => {
      const list = cards.filter((c) => c.owner === owner).sort((a, b) => rarityOrder.indexOf(a.rarity) - rarityOrder.indexOf(b.rarity) || a.name.localeCompare(b.name, 'ko'));
      const seen = list.filter(isSeen).length;
      const have = owned ? list.filter((c) => owned[c.id] !== undefined).length : null;
      const shown = list.filter(keep);
      return {
        id: owner,
        name: data.characters.get(owner)?.name ?? '공용',
        seen,
        total: list.length,
        note: `${seen} / ${list.length}${have !== null ? ` · 보유 ${have}` : ''}`,
        render: () => (shown.length ? h('div', { class: 'deck-cards codex-cardgrid' }, shown.map(tile)) : h('p', { class: 'hint' }, '이 거르기에 맞는 카드가 없다.')),
      };
    });
    const hint = h(
      'p',
      { class: 'hint codex-foot' },
      owned
        ? '칸은 세 단계: ? 모름 → 윤곽(보상·상점·사건에서 본 카드. 심연의 보상에 +0으로 나온다) → 실물(보유. 보유한 강화 단계로 심연에 나온다). 칸을 누르면 크게 본다.'
        : '가지거나 보상·상점에서 본 카드가 채워진다. 카드는 본 적 있는 가장 높은 강화 단계로 보인다. 칸을 누르면 크게 본다.',
    );
    root.replaceChildren(splitTab('cards', '주인', groups, [bar], hint));
  };
  draw();
  return root;
}

function enemiesTab(data: GameData, codex: Codex): HTMLElement {
  const stageOf = enemyStages(data);
  const stages = [...data.stages.map((s) => ({ id: s.id, name: s.name })), { id: '', name: '그 밖' }];
  const groups: CodexGroup[] = stages.map((g) => {
      const list = [...data.enemies.values()].filter((e) => (stageOf.get(e.id) ?? '') === g.id);
      const seen = list.filter((e) => codex.enemies[e.id]).length;
      return {
        id: g.id || 'etc',
        name: g.name,
        seen,
        total: list.length,
        render: () => h(
          'div',
          { class: 'codex-grid' },
          list.map((e) => {
            const rec = codex.enemies[e.id];
            if (!rec) return h('div', { class: `codex-enemy unknown tier-${e.tier}` }, h('div', { class: 'codex-pic' }, '?'), h('b', {}, '???'));
            const url = e.sprite ? frameUrl(`${e.sprite}_idle`, 1, { realOnly: true }) : null;
            const facts = [
              `${TIER_LABEL[e.tier]} · 체력 ${e.maxHp}`,
              e.weak.length ? `약점 ${e.weak.map((x) => ELEMENT_LABEL[x] ?? x).join('·')}` : '',
              e.resist.length ? `내성 ${e.resist.map((x) => ELEMENT_LABEL[x] ?? x).join('·')}` : '',
            ].filter(Boolean);
            return h(
              'div',
              { class: `codex-enemy zoomable tier-${e.tier}${rec.defeated ? ' defeated' : ''}`, title: '눌러서 자세히', onclick: () => openEnemy(data, e, rec, codex.moves[e.id] ?? []) },
              h(
                'div',
                { class: 'codex-pic', style: e.color ? `--sil:${e.color}` : '' },
                url ? h('img', { src: url, alt: e.name, loading: 'lazy' }) : h('span', {}, e.name.slice(0, 1)),
              ),
              h('b', {}, e.name),
              rec.defeated
                ? [h('small', {}, facts.join(' · ')), h('small', { class: 'codex-count' }, `이김 ${rec.defeated} · 만남 ${rec.seen}`)]
                : h('small', { class: 'codex-count' }, `만남 ${rec.seen} · 아직 이기지 못함`),
            );
          }),
        ),
      };
    });
  return splitTab('enemies', '스테이지', groups, [], h('p', { class: 'hint codex-foot' }, '만난 적이 채워진다. 칸을 누르면 기술과 이야기를 본다.'));
}

function itemsTab(data: GameData, codex: Codex): HTMLElement {
  const row = (chip: HTMLElement, name: string, text: string, open: () => void) =>
    h('div', { class: 'codex-item zoomable', title: '눌러서 크게 보기', onclick: open }, chip, h('div', {}, h('b', {}, name), h('small', {}, text)));
  // 못 본 칸도 본 칸과 같은 두 줄(이름 · 설명) — 크기가 같아야 칸이 고르게 선다
  const unknown = (what: string) => h('div', { class: 'codex-item unknown' }, h('span', { class: 'relic-chip' }, '?'), h('div', {}, h('b', {}, '???'), h('small', {}, `아직 보지 못한 ${what}`)));
  // 등급 순(일반 → 전설 → 길), 같은 등급은 데이터 순(2026-10-15 유물 5등급)
  const RELIC_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'path'];
  const relics = [...data.relics.values()].sort((a, b) => RELIC_ORDER.indexOf(a.rarity) - RELIC_ORDER.indexOf(b.rarity));
  const potions = [...data.potions.values()];
  return splitTab('items', '분류', [
    {
      id: 'relics',
      name: '유물',
      seen: codex.relics.length,
      total: relics.length,
      render: () =>
      h('div', { class: 'codex-items' }, relics.map((r) =>
          codex.relics.includes(r.id)
            ? row(relicChip(data, r.id), r.name, r.description, () => openItem(relicChip(data, r.id, 'huge'), r.name, `${RARITY_LABEL[r.rarity]} 유물${r.abyss ? ' · 심연 전용' : ''}`, r.description, r.flavor))
            : unknown('유물'),
        )),
    },
    {
      id: 'potions',
      name: '물약',
      seen: codex.potions.length,
      total: potions.length,
      render: () =>
      h('div', { class: 'codex-items' }, potions.map((p) =>
          codex.potions.includes(p.id) ? row(potionChip(data, p.id), p.name, p.description, () => openItem(potionChip(data, p.id, { extra: 'huge' }), p.name, `${RARITY_LABEL[p.rarity]} 물약`, p.description)) : unknown('물약'),
        )),
    },
  ]);
}

/** 인물 id → 처음 나오는 스테이지(장면 대사 순서대로) */
function personStages(data: GameData): Map<string, string> {
  const out = new Map<string, string>();
  for (const st of data.stages)
    for (const [id, sc] of data.scenes) if (stageOfScene(data, id) === st.id) for (const l of sc.lines) if (l.speaker && !out.has(l.speaker)) out.set(l.speaker, st.id);
  return out;
}

const personName = (data: GameData, id: string) => data.characters.get(id)?.name ?? data.speakers.get(id)?.name ?? id;
const personTitle = (data: GameData, id: string) => data.characters.get(id)?.title ?? data.speakers.get(id)?.title ?? '';

/** 인물 탭(2026-10-11 사용자 요청 — 설명 보강): 동료 · 이야기 인물로 나누고, 칸마다 역할과 처음 만나는 곳 */
function peopleTab(data: GameData, codex: Codex): HTMLElement {
  const people = codexPeople(data);
  const where = personStages(data);
  const stageName = (id: string) => data.stages.find((s) => s.id === where.get(id))?.name;
  const cell = (id: string) => {
    const meet = stageName(id);
    if (!codex.people.includes(id))
      return h('div', { class: 'codex-person unknown' }, h('div', { class: 'codex-portrait' }, '?'), h('b', {}, '???'), h('small', {}, meet ? `${meet}에서 만난다` : '이야기에서 만난다'));
    const ch = data.characters.get(id);
    const sp = data.speakers.get(id);
    const pic = h('div', { class: 'codex-portrait', style: `--who:${ch?.color ?? sp?.color ?? '#888'}` }, h('span', {}, personName(data, id).slice(0, 1)));
    void loadPortrait(id).then((img) => img && pic.replaceChildren(h('img', { src: img.src, alt: '' })));
    return h(
      'div',
      { class: 'codex-person zoomable', title: '눌러서 크게 보기 — 세 표정과 소개', onclick: () => openPerson(data, id) },
      pic,
      h('b', {}, personName(data, id)),
      h('small', {}, personTitle(data, id) || (meet ? `${meet}에서 만남` : '')),
    );
  };
  const party = people.filter((id) => data.characters.has(id));
  const others = people.filter((id) => !data.characters.has(id));
  const seen = (ids: string[]) => ids.filter((id) => codex.people.includes(id)).length;
  return splitTab(
    'people',
    '분류',
    [
      { id: 'party', name: '동료', seen: seen(party), total: party.length, note: `${seen(party)} / ${party.length} — 함께 싸우거나 돕는 일행`, render: () => h('div', { class: 'codex-grid people' }, party.map(cell)) },
      { id: 'others', name: '이야기 인물', seen: seen(others), total: others.length, note: `${seen(others)} / ${others.length} — 길에서 만난 사람들과 적`, render: () => h('div', { class: 'codex-grid people' }, others.map(cell)) },
    ],
    [],
    h('p', { class: 'hint codex-foot' }, '이야기 장면에 나온 인물이 채워진다. 칸을 누르면 반신 그림의 세 표정(기본 · 결의 · 놀람)과 소개를 본다. 못 만난 칸에는 처음 만나는 곳이 적혀 있다.'),
  );
}

function scenesTab(data: GameData, codex: Codex, onPlay: (id: string) => void): HTMLElement {
  const cgs = new Set<string>();
  for (const id of codex.scenes) for (const l of data.scenes.get(id)?.lines ?? []) if (l.cg && l.cg !== 'none') cgs.add(l.cg);
  const gallery = [...cgs].map((id) => ({ id, url: frameUrl(id, 1, { realOnly: true }) })).filter((x) => x.url);
  const groups: CodexGroup[] = data.stages.map((st) => {
      const list = [...data.scenes.keys()].filter((id) => stageOfScene(data, id) === st.id);
      const seen = list.filter((id) => codex.scenes.includes(id));
      return {
        id: st.id,
        name: st.name,
        seen: seen.length,
        total: list.length,
        render: () => h(
          'div',
          { class: 'codex-scenes' },
          list.map((id, i) => {
            if (!codex.scenes.includes(id)) return h('span', { class: 'btn btn-small codex-scene unknown' }, `${i + 1}. ???`);
            const first = data.scenes.get(id)!.lines.find((l) => l.effect !== 'title') ?? data.scenes.get(id)!.lines[0];
            return h('button', { class: 'btn btn-small codex-scene', title: first.text, onclick: () => onPlay(id) }, `${i + 1}. ${first.text.slice(0, 18)}${first.text.length > 18 ? '…' : ''}`);
          }),
        ),
      };
    });
  groups.push({
    id: 'gallery',
    name: '장면 그림',
    seen: gallery.length,
    total: Math.max(1, cgs.size),
    note: `${gallery.length}장`,
    render: () =>
      gallery.length
        ? h(
            'div',
            { class: 'codex-gallery' },
            gallery.map((g) =>
              h(
                'button',
                { class: 'codex-cg zoomable', title: '눌러서 크게 보기', onclick: () => openOverlay('장면 그림', h('img', { class: 'zoom-cg', src: g.url!, alt: g.id }), { wide: true }) },
                h('img', { src: g.url!, alt: g.id, loading: 'lazy' }),
              ),
            ),
          )
        : h('p', { class: 'hint' }, '본 장면의 그림이 여기에 모인다.'),
  });
  return splitTab('scenes', '스테이지', groups, [], h('p', { class: 'hint codex-foot' }, '본 장면을 다시 볼 수 있다. 장면을 누르면 처음부터 다시 본다.'));
}

/** 심연 탭(3차): 기록 · 굽이별 멈춘 횟수 · 일일 · 업적 · 틈의 카드 75칸 · 법칙·접사(만난 것만) */
function abyssTab(data: GameData, codex: Codex, profile: Profile, meta: AbyssMeta): HTMLElement {
  const src = unlockSource(data);
  const open = unlockedRift(data, meta.achievements, meta.opened);
  const rift = riftCards(data);
  const order = [...data.characters.keys(), 'common'];
  rift.sort((a, b) => order.indexOf(a.owner) - order.indexOf(b.owner) || ['rare', 'epic', 'legendary'].indexOf(a.rarity) - ['rare', 'epic', 'legendary'].indexOf(b.rarity));
  const deaths = Object.entries(meta.deaths).sort((a, b) => Number(a[0]) - Number(b[0]));
  const most = Math.max(1, ...deaths.map(([, n]) => n));
  const daily = Object.entries(meta.daily).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 7);
  const rows: [string, string | number][] = [
    ['시작한 심연', profile.abyssRuns],
    ['가장 깊이 넘은 굽이', profile.abyssBestDepth],
    ['가장 높은 점수', profile.abyssBestScore],
    ['열린 서약', `${oathMax(data, profile.abyssBestDepth, meta.oathCleared)} / ${data.oaths.length}단계`],
    ['이룬 업적', `${meta.achievements.length} / ${data.achievements.size}`],
  ];
  const named = (glyph: string | HTMLElement, name: string, text: string) => h('div', { class: 'codex-item' }, h('span', { class: 'relic-chip abyss-glyph' }, glyph), h('div', {}, h('b', {}, name), h('small', {}, text)));
  const unknown = () => h('div', { class: 'codex-item unknown' }, h('span', { class: 'relic-chip' }, '?'), h('div', {}, h('b', {}, '???'), h('small', {}, '심연에서 만나면 적힌다')));
  return h(
    'div',
    {},
    section('기록', null, h('dl', { class: 'codex-stats' }, rows.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, String(v))]))),
    section(
      '굽이별 멈춘 횟수',
      null,
      deaths.length
        ? h('div', { class: 'codex-progress' }, deaths.map(([d, n]) => h('div', {}, h('span', {}, `${d}굽이`), h('div', { class: 'bar' }, h('i', { style: `width:${(100 * n) / most}%` })), h('small', {}, `${n}번`))))
        : h('p', { class: 'hint' }, '아직 멈춘 굽이가 없다.'),
    ),
    daily.length
      ? section('오늘의 심연', `최근 ${daily.length}일`, h('dl', { class: 'codex-stats' }, daily.flatMap(([d, r]) => [h('dt', {}, `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6)}`), h('dd', {}, `${r.score}점 · ${r.cleared}굽이`)])))
      : null,
    section(
      '틈의 카드',
      `열림 ${open.length} / ${rift.length}`,
      h(
        'div',
        { class: 'deck-cards' },
        rift.map((def) => {
          if (open.includes(def.id))
            return h('div', { class: 'deck-card codex-card zoomable', title: '눌러서 크게 보기', onclick: () => openCard(data, def, 0) }, cardView(data, { uid: `codex_${def.id}`, cardId: def.id, level: 0 }));
          const a = src.get(def.id);
          return h(
            'div',
            { class: `codex-card unknown locked rarity-${def.rarity}` },
            h('span', {}, '?'),
            h('small', { class: 'codex-lock' }, h('b', {}, def.name), a ? ` — ${a.name}: ${a.description}` : ''),
          );
        }),
      ),
    ),
    section(
      '업적',
      `${meta.achievements.length} / ${data.achievements.size}`,
      h(
        'ul',
        { class: 'codex-achievements' },
        [...data.achievements.values()].map((a) =>
          h('li', { class: meta.achievements.includes(a.id) ? 'done' : '' }, h('b', {}, `${meta.achievements.includes(a.id) ? '✓ ' : ''}${a.name}`), h('small', {}, `${a.description} → ${unlockName(data, a)}`)),
        ),
      ),
    ),
    section(
      '굽이의 법칙',
      `${(codex.laws ?? []).length} / ${data.laws.size}`,
      h('div', { class: 'codex-items' }, [...data.laws.values()].map((l) => ((codex.laws ?? []).includes(l.id) ? named(lawIconEl(l), l.name, l.description) : unknown()))),
    ),
    section(
      '접사',
      `${(codex.affixes ?? []).length} / ${data.affixes.size}`,
      h('div', { class: 'codex-items' }, [...data.affixes.values()].map((a) => ((codex.affixes ?? []).includes(a.id) ? named(affixIconEl(a), a.name, a.description) : unknown()))),
    ),
  );
}

/** 플레이 기록 내보내기(사람 플레이 통계 — 밸런스 비교용) */
function runLogSection(): HTMLElement {
  const body = h('div', { class: 'runlog' });
  const render = () => {
    const log = readRunLog();
    const camp = log.filter((e) => e.mode === 'campaign');
    const done = camp.filter((e) => e.result === 'complete').length;
    body.replaceChildren(
      h(
        'p',
        { class: 'hint' },
        log.length
          ? `끝난 런 ${log.length}판(최근 ${RUN_LOG_MAX}판까지) — 캠페인 ${camp.length}판 중 완주 ${done} · 심연 ${log.length - camp.length}판. 내보낸 파일로 봇과 같은 표를 만들어 난이도를 맞춘다.`
          : '끝난 런이 아직 없다. 캠페인이나 심연을 끝내면(완주·패배) 한 줄씩 쌓인다.',
      ),
      h(
        'div',
        { class: 'runlog-actions' },
        h('button', { class: 'btn btn-small btn-primary', disabled: !log.length, onclick: () => exportRunLog() }, '통계 내보내기(JSON)'),
        h(
          'button',
          {
            class: 'btn btn-small',
            disabled: !log.length,
            onclick: async () => {
              if (!(await confirmDialog('플레이 기록 지우기', '쌓인 플레이 기록을 지웁니다. 도감과 저장은 그대로입니다.', '지우기'))) return;
              clearRunLog();
              render();
            },
          },
          '지우기',
        ),
      ),
    );
  };
  render();
  return section('플레이 기록', null, body);
}

function statsTab(data: GameData, codex: Codex, profile: Profile): HTMLElement {
  const rows: [string, string | number][] = [
    ['시작한 런', codex.stats.runs],
    ['캠페인을 마침', profile.clears],
    ['어려움으로 마침', profile.hardClears],
    ['하드코어로 마침', profile.hardcoreClears],
    ['이긴 전투', codex.stats.victories],
    ['진 전투', codex.stats.defeats],
    ['쓰러뜨린 적', codex.stats.kills],
  ];
  const prog = codexProgress(data, codex);
  return h(
    'div',
    {},
    section('기록', null, h('dl', { class: 'codex-stats' }, rows.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, String(v))]))),
    riftSection(data, codex),
    titlesSection(data, profile),
    runLogSection(),
    section(
      '채운 칸',
      null,
      h(
        'div',
        { class: 'codex-progress' },
        prog.map((p) => h('div', {}, h('span', {}, p.label), h('div', { class: 'bar' }, h('i', { style: `width:${p.total ? (100 * p.seen) / p.total : 0}%` })), h('small', {}, `${p.seen} / ${p.total}`))),
      ),
    ),
  );
}

/**
 * 칭호(순례 도전, GAME_DESIGN 2절): 얻은 칭호를 누르면 대표 칭호(시작 화면 저장 칸 요약 끝에 붙는다). 못 얻은 칭호는 어느 도전인지만
 */
function titlesSection(data: GameData, profile: Profile): HTMLElement {
  const all = [...data.challenges.values()].filter((c) => c.unlock.title);
  const list = h('div', { class: 'codex-titles' });
  const draw = () => {
    const main = mainTitle();
    list.replaceChildren(
      ...all.map((c) => {
        const t = c.unlock.title!;
        const stage = data.stages.find((st) => st.id === c.stage)?.name ?? c.stage;
        return profile.titles.includes(t)
          ? h('button', { class: `title-chip${t === main ? ' on' : ''}`, title: t === main ? '대표 칭호' : '누르면 대표 칭호로', onclick: () => (setMainTitle(t), draw()) }, `「${t}」`)
          : h('span', { class: 'title-chip locked', title: `${stage} — 도전 「${c.name}」` }, `? ${stage} · ${c.name}`);
      }),
    );
  };
  draw();
  return section('칭호', `${profile.titles.length} / ${all.length}`, h('div', {}, h('p', { class: 'hint' }, '순례(클리어 뒤 자유 여정)의 도전으로 얻는다. 누른 칭호가 시작 화면 저장 칸에 붙는다.'), list));
}

/** owned: 지금 런의 보유 카드(지도에서 열었을 때) — 카드 칸에 보유 여부·강화 단계 */
export function codexView(
  data: GameData,
  codex: Codex,
  profile: Profile,
  handlers: CodexHandlers,
  start: CodexTab = 'cards',
  owned?: Record<string, number>,
  meta?: AbyssMeta,
): HTMLElement {
  installTooltips();
  const prog = codexProgress(data, codex);
  const seen = prog.reduce((a, p) => a + p.seen, 0);
  const total = prog.reduce((a, p) => a + p.total, 0);
  const body = h('div', { class: 'codex-body' });
  // 분류 줄(2026-10-12, 편성의 동료 줄과 같은 칸): 탭마다 같은 폭 · 채운 수 · 막대
  const tabs = h('nav', { class: 'codex-roster', role: 'tablist', 'aria-label': '도감 분류' });
  const pct = (a: number, b: number) => (b ? Math.floor((100 * a) / b) : 0);
  // 머리: 지금 탭의 채움(크게) + 전체(작게) — 2026-10-11 UI/UX 4-1
  const tabProg = h('b', { class: 'codex-tabprog' });
  const tabCount = (tab: CodexTab): { seen: number; total: number; label: string } | null => {
    const of = (...labels: string[]) => prog.filter((p) => labels.includes(p.label));
    const sum = (ps: CodexProgress[], label: string) => (ps.length ? { seen: ps.reduce((a, p) => a + p.seen, 0), total: ps.reduce((a, p) => a + p.total, 0), label } : null);
    if (tab === 'items') return sum(of('유물', '물약'), '유물·물약');
    if (tab === 'abyss') return meta ? { seen: meta.achievements.length, total: data.achievements.size, label: '심연 업적' } : null;
    if (tab === 'glossary') return null;
    const t = TABS.find((x) => x.id === tab)!;
    return sum(of(t.label), t.label);
  };
  // 용어는 분류 줄이 아니라 머리의 단추(돌아가기 왼쪽, 2026-10-13)
  const glossaryBtn = h('button', { class: 'btn codex-glossary', 'aria-pressed': 'false', onclick: () => select('glossary') }, '용어');
  const select = (tab: CodexTab) => {
    glossaryBtn.classList.toggle('on', tab === 'glossary');
    glossaryBtn.setAttribute('aria-pressed', String(tab === 'glossary'));
    for (const b of tabs.children) {
      const on = (b as HTMLElement).dataset.tab === tab;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
    }
    const c = tabCount(tab);
    tabProg.textContent = c ? `${c.label} ${c.seen} / ${c.total} (${pct(c.seen, c.total)}%)` : '';
    const content =
      tab === 'cards'
        ? cardsTab(data, codex, owned)
        : tab === 'enemies'
          ? enemiesTab(data, codex)
          : tab === 'items'
            ? itemsTab(data, codex)
            : tab === 'people'
              ? peopleTab(data, codex)
              : tab === 'scenes'
                ? scenesTab(data, codex, (id) => handlers.onPlayScene(id, 'scenes'))
                : tab === 'abyss'
                  ? abyssTab(data, codex, profile, meta ?? { achievements: [], deaths: {}, oathCleared: -1, daily: {}, opened: [] })
                  : tab === 'glossary'
                    ? glossaryTab(data)
                    : statsTab(data, codex, profile);
    // 묶음이 있는 탭은 왼쪽 목록 + 가운데(codex-split), 심연·기록은 한 패널
    body.replaceChildren(content.classList.contains('codex-split') || content.classList.contains('codex-tabroot') ? content : h('div', { class: 'codex-main panel codex-single' }, content));
    body.scrollTop = 0;
  };
  for (const t of TABS) {
    tabs.append(
      (() => {
        const c = tabCount(t.id);
        return h(
          'button',
          { class: 'codex-tab lo-mate', role: 'tab', 'data-tab': t.id, onclick: () => select(t.id) },
          h('span', { class: 'lo-mate-top' }, h('b', {}, t.label), h('span', { class: 'lo-mate-count' }, c ? `${c.seen}/${c.total}` : '')),
          h('span', { class: 'lo-meter' }, h('i', { style: `width:${c ? pct(c.seen, c.total) : 0}%` })),
        );
      })(),
    );
  }
  const root = h(
    'section',
    { class: 'screen codex-screen' },
    h(
      'header',
      { class: 'codex-head panel' },
      h('span', { class: 'seal' }, '錄'),
      h('div', { class: 'codex-title' }, h('h2', {}, '도감'), tabProg),
      h('div', { class: 'codex-total' }, h('small', {}, `전체 ${seen} / ${total} (${pct(seen, total)}%)`), h('span', { class: 'lo-meter' }, h('i', { style: `width:${pct(seen, total)}%` }))),
      h('div', { class: 'codex-head-actions' }, glossaryBtn, h('button', { class: 'btn codex-back', onclick: handlers.onBack }, '돌아가기')),
    ),
    tabs,
    body,
  );
  select(start);
  return root;
}

/** 적 기술 한 줄: 피해(×횟수, 전체)와 그 밖의 핵심 수치 */
function moveSummary(data: GameData, m: EnemyDef['moves'][number]): string[] {
  const out: string[] = [];
  for (const e of m.effects) if (e.op === 'damage') out.push(`피해 ${e.amount ?? 0}${(e.times ?? 1) > 1 ? `×${e.times}` : ''}${e.target === 'all_enemies' ? ' 전체' : ''}`);
  return [...out, ...intentBadges(data, m.effects)];
}

/** 균열과 폭주(GAME_DESIGN 7절): 첫 폭주를 겪은 뒤에 열린다 */
function riftSection(data: GameData, codex: Codex): HTMLElement | null {
  if (!codex.stats.surges) return null;
  const b = data.balance.rift;
  const sc = b.scar;
  const lines = [
    `균열: 융합 카드(내공과 마나를 함께)를 쓰면 하늘에 금이 간다. 차례 끝에 세계마다 아문다(엘하임 -${b.decay.elheim} · 마왕성 -${b.decay.nocturna} · 무림·틈 0). ${b.echoThreshold} 이상이면 틈의 잔향이 덱에 섞인다.`,
    `폭주(균열 ${b.max}): ① 일행 모두 최대 체력 ${Math.round(b.surgeRatio * 100)}%(하운 +${b.surgeHaunExtra}, 같은 전투 n번째는 ×n) ② 적 모두 힘 +${b.surgeEnemyStrength}, 흐름을 먹는 적은 체력 ${b.surgeEnemyHeal} ③ 틈의 잔향 ${b.surgeEchoToHand}장을 손에 ④ 상흔 +${b.surgeScar}, 지도의 앞길 하나가 끊기고 裂 틈새가 열린다. 균열은 ${b.surgeResetTo}으로.`,
    `상흔: 전투 시작 균열 = 상흔 ÷ ${sc.startRiftPer}(${startRiftMaxText(data)}). ${sc.restAt} 이상이면 휴식 회복 -${Math.round((1 - sc.restHealMul) * 100)}%, ${sc.shopAt} 이상이면 상점 값 +${Math.round((sc.shopPriceMul - 1) * 100)}%(대신 꿰매기를 판다).`,
    `막는 법: 숨 세기 같은 감소 카드 · 봉인(스택마다 균열 상승 1을 막음) · 휴식의 꿰매기 · 지도의 裂 틈새 · 폭주 없이 넘긴 보스(상흔 -${sc.bossCleanBonus}).`,
  ];
  return section('균열과 폭주', `겪은 폭주 ${codex.stats.surges}번`, h('div', { class: 'codex-rift' }, lines.map((t) => h('p', {}, t))));
}

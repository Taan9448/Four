// 도감 화면(GAME_DESIGN 2절): 시작 화면에서 연다. 한 번이라도 본 것만 보이고, 못 본 칸은 ? 실루엣.
// 탭: 카드 · 적 · 유물·물약 · 인물 · 장면(다시 보기 + 장면 그림) · 심연(3차) · 기록
// 카드 칸은 3단계: ? (모름) → 윤곽(본 적 있음: 심연 풀에 들어간다) → 실물(보유: 강화 단계)
import { codexCards, codexPeople, codexProgress, type Codex } from '../engine/codex';
import type { GameData } from '../engine/data';
import { riftCards, unlockedRift, unlockName, unlockSource, oathMax, type AbyssMeta } from '../engine/abyss';
import { intentBadges } from '../engine/battle';
import type { CardDef, EnemyDef } from '../engine/schema';
import { frameUrl } from '../render/assets';
import { loadPortrait } from '../render/portrait';
import { cardView } from './card-view';
import { h } from './dom';
import { potionChip, relicChip } from './items';
import type { Profile } from './storage';
import { installTooltips } from './tooltip';
import { openOverlay } from './overlay';

export interface CodexHandlers {
  onBack: () => void;
  /** 본 장면 다시 보기(끝나면 도감으로 돌아온다) */
  onPlayScene: (sceneId: string, tab: CodexTab) => void;
}

export type CodexTab = 'cards' | 'enemies' | 'items' | 'people' | 'scenes' | 'abyss' | 'stats';
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
const RARITY_LABEL: Record<string, string> = { common: '일반', uncommon: '고급', rare: '희귀', epic: '영웅', legendary: '전설', special: '특수', boss: '보스' };
const INTENT_LABEL: Record<string, string> = { attack: '공격', defend: '방어', buff: '강화', debuff: '약화', special: '특수' };

const facts = (rows: [string, string][]) => h('dl', { class: 'zoom-facts' }, rows.filter(([, v]) => v).flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]));

/** 카드: 크게 + 본 적 있는 강화 단계(0~최고)를 골라 볼 수 있다 */
function openCard(data: GameData, def: CardDef, best: number): void {
  const big = h('div', { class: 'zoom-card' });
  const levels = h('div', { class: 'zoom-levels' });
  const owner = data.characters.get(def.owner)?.name ?? (def.owner === 'common' ? '공용' : def.owner);
  const show = (lv: number) => {
    big.replaceChildren(cardView(data, { uid: `zoom_${def.id}`, cardId: def.id, level: lv }));
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
        ch ? h('div', { class: 'zoom-kind' }, ch.title) : null,
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

function cardsTab(data: GameData, codex: Codex, owned?: Record<string, number>): HTMLElement {
  const cards = codexCards(data);
  const order = [...data.characters.keys(), 'common'];
  const rank = (owner: string) => (order.includes(owner) ? order.indexOf(owner) : order.length);
  const owners = [...new Set(cards.map((c) => c.owner))].sort((a, b) => rank(a) - rank(b));
  const rarityOrder = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'special'];
  const tile = (def: CardDef) => {
    const have = owned?.[def.id];
    if (!(def.id in codex.cards) && have === undefined) return h('div', { class: `codex-card unknown rarity-${def.rarity}` }, h('span', {}, '?'));
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
  return h(
    'div',
    {},
    owners.map((owner) => {
      const list = cards.filter((c) => c.owner === owner).sort((a, b) => rarityOrder.indexOf(a.rarity) - rarityOrder.indexOf(b.rarity) || a.name.localeCompare(b.name, 'ko'));
      const seen = list.filter((c) => c.id in codex.cards || owned?.[c.id] !== undefined).length;
      const name = data.characters.get(owner)?.name ?? '공용';
      const have = owned ? list.filter((c) => owned[c.id] !== undefined).length : null;
      return section(name, `${seen} / ${list.length}${have !== null ? ` · 보유 ${have}` : ''}`, h('div', { class: 'deck-cards' }, list.map(tile)));
    }),
    h(
      'p',
      { class: 'hint' },
      owned
        ? '칸은 세 단계: ? 모름 → 윤곽(보상·상점·사건에서 본 카드. 심연의 보상에 +0으로 나온다) → 실물(보유. 보유한 강화 단계로 심연에 나온다).'
        : '가지거나 보상·상점에서 본 카드가 채워진다. 카드는 본 적 있는 가장 높은 강화 단계로 보인다.',
    ),
  );
}

function enemiesTab(data: GameData, codex: Codex): HTMLElement {
  const stageOf = enemyStages(data);
  const groups = [...data.stages.map((s) => ({ id: s.id, name: s.name })), { id: '', name: '그 밖' }];
  return h(
    'div',
    {},
    groups.map((g) => {
      const list = [...data.enemies.values()].filter((e) => (stageOf.get(e.id) ?? '') === g.id);
      if (!list.length) return null;
      const seen = list.filter((e) => codex.enemies[e.id]).length;
      return section(
        g.name,
        `${seen} / ${list.length}`,
        h(
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
      );
    }),
  );
}

function itemsTab(data: GameData, codex: Codex): HTMLElement {
  const row = (chip: HTMLElement, name: string, text: string, open: () => void) =>
    h('div', { class: 'codex-item zoomable', title: '눌러서 크게 보기', onclick: open }, chip, h('div', {}, h('b', {}, name), h('small', {}, text)));
  const unknown = () => h('div', { class: 'codex-item unknown' }, h('span', { class: 'relic-chip' }, '?'), h('div', {}, h('b', {}, '???')));
  const relics = [...data.relics.values()];
  const potions = [...data.potions.values()];
  return h(
    'div',
    {},
    section(
      '유물',
      `${codex.relics.length} / ${relics.length}`,
      h('div', { class: 'codex-items' }, relics.map((r) =>
          codex.relics.includes(r.id)
            ? row(relicChip(data, r.id), r.name, r.description, () => openItem(relicChip(data, r.id, 'huge'), r.name, `${RARITY_LABEL[r.rarity]} 유물`, r.description, r.flavor))
            : unknown(),
        )),
    ),
    section(
      '물약',
      `${codex.potions.length} / ${potions.length}`,
      h('div', { class: 'codex-items' }, potions.map((p) =>
          codex.potions.includes(p.id) ? row(potionChip(data, p.id), p.name, p.description, () => openItem(potionChip(data, p.id, { extra: 'huge' }), p.name, `${RARITY_LABEL[p.rarity]} 물약`, p.description)) : unknown(),
        )),
    ),
  );
}

function peopleTab(data: GameData, codex: Codex): HTMLElement {
  const people = codexPeople(data);
  return section(
    '인물',
    `${people.filter((id) => codex.people.includes(id)).length} / ${people.length}`,
    h(
      'div',
      { class: 'codex-grid people' },
      people.map((id) => {
        if (!codex.people.includes(id)) return h('div', { class: 'codex-person unknown' }, h('div', { class: 'codex-portrait' }, '?'), h('b', {}, '???'));
        const ch = data.characters.get(id);
        const sp = data.speakers.get(id);
        const pic = h('div', { class: 'codex-portrait', style: `--who:${ch?.color ?? sp?.color ?? '#888'}` }, h('span', {}, (ch?.name ?? sp?.name ?? id).slice(0, 1)));
        void loadPortrait(id).then((img) => img && pic.replaceChildren(h('img', { src: img.src, alt: '' })));
        return h('div', { class: 'codex-person zoomable', title: '눌러서 크게 보기', onclick: () => openPerson(data, id) }, pic, h('b', {}, ch?.name ?? sp?.name ?? id), ch ? h('small', {}, ch.title) : null);
      }),
    ),
  );
}

function scenesTab(data: GameData, codex: Codex, onPlay: (id: string) => void): HTMLElement {
  const cgs = new Set<string>();
  for (const id of codex.scenes) for (const l of data.scenes.get(id)?.lines ?? []) if (l.cg && l.cg !== 'none') cgs.add(l.cg);
  const gallery = [...cgs].map((id) => ({ id, url: frameUrl(id, 1, { realOnly: true }) })).filter((x) => x.url);
  return h(
    'div',
    {},
    data.stages.map((st) => {
      const list = [...data.scenes.keys()].filter((id) => stageOfScene(data, id) === st.id);
      if (!list.length) return null;
      const seen = list.filter((id) => codex.scenes.includes(id));
      return section(
        st.name,
        `${seen.length} / ${list.length}`,
        h(
          'div',
          { class: 'codex-scenes' },
          list.map((id, i) => {
            if (!codex.scenes.includes(id)) return h('span', { class: 'btn btn-small codex-scene unknown' }, `${i + 1}. ???`);
            const first = data.scenes.get(id)!.lines.find((l) => l.effect !== 'title') ?? data.scenes.get(id)!.lines[0];
            return h('button', { class: 'btn btn-small codex-scene', title: first.text, onclick: () => onPlay(id) }, `${i + 1}. ${first.text.slice(0, 18)}${first.text.length > 18 ? '…' : ''}`);
          }),
        ),
      );
    }),
    section(
      '장면 그림',
      `${gallery.length}`,
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
    ),
  );
}

/** 심연 탭(3차): 기록 · 굽이별 멈춘 횟수 · 일일 · 업적 · 틈의 카드 40칸 · 법칙·접사(만난 것만) */
function abyssTab(data: GameData, codex: Codex, profile: Profile, meta: AbyssMeta): HTMLElement {
  const src = unlockSource(data);
  const open = unlockedRift(data, meta.achievements);
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
  const named = (glyph: string, name: string, text: string) => h('div', { class: 'codex-item' }, h('span', { class: 'relic-chip abyss-glyph' }, glyph), h('div', {}, h('b', {}, name), h('small', {}, text)));
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
      h('div', { class: 'codex-items' }, [...data.laws.values()].map((l) => ((codex.laws ?? []).includes(l.id) ? named(l.glyph, l.name, l.description) : unknown()))),
    ),
    section(
      '접사',
      `${(codex.affixes ?? []).length} / ${data.affixes.size}`,
      h('div', { class: 'codex-items' }, [...data.affixes.values()].map((a) => ((codex.affixes ?? []).includes(a.id) ? named(a.glyph, a.name, a.description) : unknown()))),
    ),
  );
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
  const tabs = h('nav', { class: 'codex-tabs', role: 'tablist' });
  const select = (tab: CodexTab) => {
    for (const b of tabs.children) b.classList.toggle('on', (b as HTMLElement).dataset.tab === tab);
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
                  ? abyssTab(data, codex, profile, meta ?? { achievements: [], deaths: {}, oathCleared: -1, daily: {} })
                  : statsTab(data, codex, profile);
    body.replaceChildren(content);
    body.scrollTop = 0;
  };
  for (const t of TABS) {
    const p = prog.find((x) => x.label === t.label || (t.id === 'items' && x.label === '유물'));
    tabs.append(
      h(
        'button',
        { class: 'codex-tab', role: 'tab', 'data-tab': t.id, onclick: () => select(t.id) },
        t.label,
        p && t.id !== 'items' ? h('small', {}, `${p.seen}/${p.total}`) : t.id === 'abyss' && meta ? h('small', {}, `${meta.achievements.length}/${data.achievements.size}`) : null,
      ),
    );
  }
  const root = h(
    'section',
    { class: 'screen codex-screen' },
    h(
      'header',
      { class: 'codex-head panel' },
      h('span', { class: 'seal' }, '錄'),
      h('div', { class: 'codex-title' }, h('h2', {}, '도감'), h('small', {}, `채운 칸 ${seen} / ${total} (${total ? Math.floor((100 * seen) / total) : 0}%)`)),
      tabs,
      h('button', { class: 'btn', onclick: handlers.onBack }, '돌아가기'),
    ),
    h('div', { class: 'codex-panel panel' }, body),
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

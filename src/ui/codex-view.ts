// 도감 화면(GAME_DESIGN 2절): 시작 화면에서 연다. 한 번이라도 본 것만 보이고, 못 본 칸은 ? 실루엣.
// 탭: 카드 · 적 · 유물·물약 · 인물 · 장면(다시 보기 + 장면 그림) · 기록
import { codexCards, codexPeople, codexProgress, type Codex } from '../engine/codex';
import type { GameData } from '../engine/data';
import type { CardDef } from '../engine/schema';
import { frameUrl } from '../render/assets';
import { loadPortrait } from '../render/portrait';
import { cardView } from './card-view';
import { h } from './dom';
import { potionChip, relicChip } from './items';
import type { Profile } from './storage';
import { installTooltips } from './tooltip';

export interface CodexHandlers {
  onBack: () => void;
  /** 본 장면 다시 보기(끝나면 도감으로 돌아온다) */
  onPlayScene: (sceneId: string, tab: CodexTab) => void;
}

export type CodexTab = 'cards' | 'enemies' | 'items' | 'people' | 'scenes' | 'stats';
const TABS: { id: CodexTab; label: string }[] = [
  { id: 'cards', label: '카드' },
  { id: 'enemies', label: '적' },
  { id: 'items', label: '유물·물약' },
  { id: 'people', label: '인물' },
  { id: 'scenes', label: '장면' },
  { id: 'stats', label: '기록' },
];

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

function cardsTab(data: GameData, codex: Codex): HTMLElement {
  const cards = codexCards(data);
  const order = [...data.characters.keys(), 'common'];
  const rank = (owner: string) => (order.includes(owner) ? order.indexOf(owner) : order.length);
  const owners = [...new Set(cards.map((c) => c.owner))].sort((a, b) => rank(a) - rank(b));
  const rarityOrder = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'special'];
  const tile = (def: CardDef) =>
    def.id in codex.cards
      ? h('div', { class: 'deck-card codex-card' }, cardView(data, { uid: `codex_${def.id}`, cardId: def.id, level: codex.cards[def.id] }))
      : h('div', { class: `codex-card unknown rarity-${def.rarity}` }, h('span', {}, '?'));
  return h(
    'div',
    {},
    owners.map((owner) => {
      const list = cards.filter((c) => c.owner === owner).sort((a, b) => rarityOrder.indexOf(a.rarity) - rarityOrder.indexOf(b.rarity) || a.name.localeCompare(b.name, 'ko'));
      const seen = list.filter((c) => c.id in codex.cards).length;
      const name = data.characters.get(owner)?.name ?? '공용';
      return section(name, `${seen} / ${list.length}`, h('div', { class: 'deck-cards' }, list.map(tile)));
    }),
    h('p', { class: 'hint' }, '덱에 들어오거나 보상으로 본 카드가 채워진다. 카드는 본 적 있는 가장 높은 강화 단계로 보인다.'),
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
              { class: `codex-enemy tier-${e.tier}${rec.defeated ? ' defeated' : ''}` },
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
  const row = (chip: HTMLElement, name: string, text: string) => h('div', { class: 'codex-item' }, chip, h('div', {}, h('b', {}, name), h('small', {}, text)));
  const unknown = () => h('div', { class: 'codex-item unknown' }, h('span', { class: 'relic-chip' }, '?'), h('div', {}, h('b', {}, '???')));
  const relics = [...data.relics.values()];
  const potions = [...data.potions.values()];
  return h(
    'div',
    {},
    section(
      '유물',
      `${codex.relics.length} / ${relics.length}`,
      h('div', { class: 'codex-items' }, relics.map((r) => (codex.relics.includes(r.id) ? row(relicChip(data, r.id), r.name, r.description) : unknown()))),
    ),
    section(
      '물약',
      `${codex.potions.length} / ${potions.length}`,
      h('div', { class: 'codex-items' }, potions.map((p) => (codex.potions.includes(p.id) ? row(potionChip(data, p.id), p.name, p.description) : unknown()))),
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
        return h('div', { class: 'codex-person' }, pic, h('b', {}, ch?.name ?? sp?.name ?? id), ch ? h('small', {}, ch.title) : null);
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
            gallery.map((g) => h('a', { href: g.url!, target: '_blank', rel: 'noopener' }, h('img', { src: g.url!, alt: g.id, loading: 'lazy' }))),
          )
        : h('p', { class: 'hint' }, '본 장면의 그림이 여기에 모인다.'),
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

export function codexView(data: GameData, codex: Codex, profile: Profile, handlers: CodexHandlers, start: CodexTab = 'cards'): HTMLElement {
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
        ? cardsTab(data, codex)
        : tab === 'enemies'
          ? enemiesTab(data, codex)
          : tab === 'items'
            ? itemsTab(data, codex)
            : tab === 'people'
              ? peopleTab(data, codex)
              : tab === 'scenes'
                ? scenesTab(data, codex, (id) => handlers.onPlayScene(id, 'scenes'))
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
        p && t.id !== 'items' ? h('small', {}, `${p.seen}/${p.total}`) : null,
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

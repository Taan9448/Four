// 편성 화면(GAME_DESIGN 9-1): 스테이지를 시작하기 전(그리고 여관에서) 보유 카드 중 동료마다 8장 + 공용 8장을 고른다.
// 위: 주인 탭(채운 수/칸), 가운데: 그 주인의 보유 카드(누르면 넣고 뺌), 오른쪽: 늘 들어가는 카드·저장 칸·추천·출발.
import type { GameData } from '../engine/data';
import {
  choosable,
  COMMON,
  loadoutOwners,
  loadoutProblems,
  loadPreset,
  ownedEssentials,
  recommendFor,
  recommendLoadout,
  requiredFor,
  savePreset,
  type Loadout,
} from '../engine/collection';
import type { RunState } from '../engine/run';
import { cardView } from './card-view';
import { h } from './dom';
import { installTooltips, tipAttrs } from './tooltip';

export interface LoadoutHandlers {
  /** 편성을 정했다(검사 통과). 덱은 부르는 쪽이 setLoadout으로 만든다 */
  onConfirm: (loadout: Loadout) => void;
  /** 여관에서 열었을 때만: 바꾸지 않고 돌아가기 */
  onCancel?: () => void;
  /** 보유 카드 전체 보기 */
  onShowCollection?: () => void;
}

const RARITY_RANK: Record<string, number> = { legendary: 0, epic: 1, rare: 2, uncommon: 3, common: 4, special: 5 };

export function loadoutView(data: GameData, run: RunState, title: string, handlers: LoadoutHandlers): HTMLElement {
  installTooltips();
  const owners = loadoutOwners(data, run);
  const draft: Loadout = recommendLoadout(data, run, run.loadout);
  let tab = owners[0];
  /** 아키타입 거르기(null: 전체) */
  let filter: string | null = null;
  const archName = new Map([...data.characters.values()].flatMap((c) => c.archetypes.map((a) => [a.id, a] as const)));
  const ownerName = (o: string) => (o === COMMON ? '공용' : (data.characters.get(o)?.name ?? o));
  const root = h('section', { class: 'screen loadout-screen' });

  const render = () => {
    const need = requiredFor(data, run, tab);
    const picked = new Set(draft[tab] ?? []);
    const archetypes = data.characters.get(tab)?.archetypes ?? [];
    if (filter && !archetypes.some((a) => a.id === filter) && tab !== COMMON) filter = null;
    const cards = choosable(data, run, tab).filter((d) => !filter || d.tags.includes(filter)).sort(
      (a, b) => RARITY_RANK[a.rarity] - RARITY_RANK[b.rarity] || (run.collection[b.id] ?? 0) - (run.collection[a.id] ?? 0) || a.name.localeCompare(b.name, 'ko'),
    );
    const problems = loadoutProblems(data, run, draft);
    const toggle = (id: string) => {
      const list = draft[tab] ?? (draft[tab] = []);
      const i = list.indexOf(id);
      if (i >= 0) list.splice(i, 1);
      else if (list.length < need) list.push(id);
      render();
    };
    const grid = h(
      'div',
      { class: 'deck-cards loadout-grid' },
      cards.map((d) => {
        const on = picked.has(d.id);
        const full = !on && picked.size >= need;
        const el = h(
          'div',
          { class: `deck-card loadout-card${on ? ' on' : ''}${full ? ' full' : ''}`, onclick: () => toggle(d.id), title: on ? '눌러서 빼기' : full ? '칸이 가득 찼다 — 먼저 한 장을 빼기' : '눌러서 넣기' },
          cardView(data, { uid: `lo_${d.id}`, cardId: d.id, level: run.collection[d.id] ?? 0 }, { selected: on }),
          on ? h('span', { class: 'loadout-check' }, '✓') : null,
          run.stageGains.includes(d.id) ? h('span', { class: 'loadout-new', ...tipAttrs('이번 스테이지에 얻은 카드', '편성과 상관없이 이 스테이지가 끝날 때까지 덱에 들어간다.') }, '새') : null,
          d.tags.length
            ? h('span', { class: 'loadout-tags' }, d.tags.map((t) => h('em', { class: 'arch-tag', ...tipAttrs(archName.get(t)?.name ?? t, archName.get(t)?.text ?? '') }, archName.get(t)?.name ?? t)))
            : null,
        );
        return el;
      }),
    );
    const essentials = ownedEssentials(data, run);
    const presets = Array.from({ length: data.balance.loadout.presets }, (_, i) => {
      const p = run.presets[i];
      return h(
        'div',
        { class: 'preset' },
        h('b', {}, `저장 ${i + 1}`),
        h('small', {}, p ? owners.map((o) => `${ownerName(o)} ${(p[o] ?? []).length}`).join(' · ') : '비어 있음'),
        h(
          'div',
          { class: 'preset-actions' },
          h('button', { class: 'btn btn-small', onclick: () => (savePreset(data, run, i, draft), render()) }, '저장'),
          h(
            'button',
            {
              class: 'btn btn-small',
              disabled: !p,
              onclick: () => {
                const loaded = loadPreset(data, run, i);
                if (loaded) Object.assign(draft, loaded);
                render();
              },
            },
            '불러오기',
          ),
        ),
      );
    });
    const deckSize = owners.filter((o) => o === COMMON || run.selected.includes(o)).reduce((a, o) => a + (draft[o]?.length ?? 0), 0) + essentials.length + run.stageGains.filter((id) => !Object.values(draft).flat().includes(id)).length;
    root.replaceChildren(
      h(
        'header',
        { class: 'loadout-head panel' },
        h('span', { class: 'seal' }, '編'),
        h('div', { class: 'loadout-title' }, h('h2', {}, '편성'), h('small', {}, title)),
        h(
          'nav',
          { class: 'codex-tabs loadout-tabs' },
          owners.map((o) =>
            h(
              'button',
              { class: `codex-tab${o === tab ? ' on' : ''}${(draft[o]?.length ?? 0) === requiredFor(data, run, o) ? ' done' : ''}`, onclick: () => ((tab = o), render()) },
              ownerName(o),
              h('small', {}, `${draft[o]?.length ?? 0}/${requiredFor(data, run, o)}`),
              o !== COMMON && !run.selected.includes(o) ? h('em', { class: 'rest-tag' }, '쉼') : null,
            ),
          ),
        ),
      ),
      h(
        'div',
        { class: 'loadout-body' },
        h(
          'div',
          { class: 'loadout-main panel' },
          h(
            'div',
            { class: 'loadout-bar' },
            h('b', {}, `${ownerName(tab)} — ${picked.size}/${need}장`),
            h('small', {}, `보유 ${cards.length}장 중에서 고른다. 같은 카드는 한 장만.`),
            h('button', { class: 'btn btn-small', onclick: () => ((draft[tab] = recommendFor(data, run, tab)), render()) }, `${ownerName(tab)} 추천`),
            h('button', { class: 'btn btn-small', onclick: () => ((draft[tab] = []), render()) }, '모두 빼기'),
          ),
          archetypes.length
            ? h(
                'div',
                { class: 'arch-filter' },
                h('button', { class: `btn btn-small${filter === null ? ' on' : ''}`, onclick: () => ((filter = null), render()) }, '전체'),
                archetypes.map((a) =>
                  h('button', { class: `btn btn-small${filter === a.id ? ' on' : ''}`, ...tipAttrs(a.name, a.text), onclick: () => ((filter = filter === a.id ? null : a.id), render()) }, a.name),
                ),
              )
            : null,
          grid,
        ),
        h(
          'aside',
          { class: 'loadout-side' },
          h(
            'div',
            { class: 'box' },
            h('h3', {}, '늘 들어가는 카드'),
            essentials.length
              ? h('div', { class: 'loadout-essentials' }, essentials.map((id) => h('span', { class: 'chip', ...tipAttrs(data.cards.get(id)!.name, '보스를 깨는 열쇠 — 편성과 상관없이 늘 덱에 들어간다.') }, data.cards.get(id)!.name)))
              : h('p', { class: 'hint' }, '아직 없다. 보스를 깨는 열쇠 카드는 편성과 상관없이 늘 들어간다.'),
            run.stageGains.length
              ? [h('h3', {}, '이번 스테이지에 얻은 카드'), h('div', { class: 'loadout-essentials' }, run.stageGains.map((id) => h('span', { class: 'chip new' }, data.cards.get(id)?.name ?? id)))]
              : null,
            h('p', { class: 'hint' }, `전투 덱: 출전한 동료의 편성 + 공용 + 위 카드 = 약 ${deckSize}장`),
          ),
          h('div', { class: 'box presets' }, h('h3', {}, '편성 저장'), presets),
          h(
            'div',
            { class: 'box loadout-actions' },
            h('button', { class: 'btn', onclick: () => (Object.assign(draft, recommendLoadout(data, run)), render()) }, '전체 추천 편성'),
            handlers.onShowCollection ? h('button', { class: 'btn', onclick: handlers.onShowCollection }, '보유 카드 전체 보기') : null,
            problems.length ? h('ul', { class: 'loadout-problems' }, problems.map((p) => h('li', {}, p))) : null,
            h('button', { class: 'btn btn-primary btn-large', disabled: problems.length > 0, onclick: () => handlers.onConfirm(structuredClone(draft)) }, handlers.onCancel ? '이 편성으로 바꾸기' : '이 편성으로 출발'),
            handlers.onCancel ? h('button', { class: 'btn', onclick: handlers.onCancel }, '바꾸지 않고 돌아가기') : null,
          ),
        ),
      ),
    );
  };
  render();
  return root;
}

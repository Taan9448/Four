// 편성 화면(GAME_DESIGN 9-1): 스테이지를 시작하기 전(그리고 여관에서) 보유 카드 중 동료마다 8장 + 공용 8장을 고른다.
// 위: 주인 탭(채운 수/칸), 가운데: 그 주인의 보유 카드(누르면 넣고 뺌), 오른쪽: 늘 들어가는 카드·저장 칸·추천·출발.
import type { GameData } from '../engine/data';
import {
  archetypeCounts,
  capFor,
  cardPoints,
  choosable,
  COMMON,
  loadoutFocus,
  loadoutPoints,
  loadoutOwners,
  loadoutProblems,
  loadPreset,
  ownedEssentials,
  ownedView,
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
  /** 그 주인의 편성에 든 아키타입별 장수(0장은 뺀다). 갈래 보너스가 켜진 갈래에는 ✓ */
  const archCounts = (o: string) => {
    const focus = loadoutFocus(data, o, draft[o] ?? []);
    return Object.entries(archetypeCounts(data, o, draft[o] ?? []))
      .filter(([, n]) => n > 0)
      .map(([id, n]) => `${archName.get(id)?.name ?? id} ${n}${id === focus ? ' ✓' : ''}`);
  };
  /** 점수 상한을 맞추느라 바꿨다는 알림(추천·불러오기) */
  let notice = '';
  // 지난 편성 그대로(모자란 칸만 추천으로): 바뀐 것이 없으면 이 버튼이 기본 초점
  const keep = recommendLoadout(data, run, run.loadout);
  const keepSame = owners.every((o) => JSON.stringify(keep[o] ?? []) === JSON.stringify(run.loadout[o] ?? []));
  const keepOk = !handlers.onCancel && Object.values(run.loadout).some((l) => l.length) && loadoutProblems(data, run, keep).length === 0;

  const render = () => {
    const need = requiredFor(data, run, tab);
    const picked = new Set(draft[tab] ?? []);
    const archetypes = data.characters.get(tab)?.archetypes ?? [];
    if (filter && !archetypes.some((a) => a.id === filter) && tab !== COMMON) filter = null;
    const cards = choosable(data, run, tab).filter((d) => !filter || d.tags.includes(filter)).sort(
      (a, b) => RARITY_RANK[a.rarity] - RARITY_RANK[b.rarity] || (run.collection[b.id] ?? 0) - (run.collection[a.id] ?? 0) || a.name.localeCompare(b.name, 'ko'),
    );
    const problems = loadoutProblems(data, run, draft);
    const tabPts = loadoutPoints(data, draft[tab] ?? []);
    const tabFocus = tab === COMMON ? null : loadoutFocus(data, tab, draft[tab] ?? []);
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
          cardView(data, ownedView(run, d.id, `lo_${d.id}`), { selected: on }),
          // 편성 점수 배지(위 가운데 — 왼쪽 위는 비용 자리)
          h('span', { class: `loadout-pts pts-${cardPoints(data, d)}`, ...tipAttrs(`편성 ${cardPoints(data, d)}점`, '등급마다 점수. 동료 24점 · 공용 17점까지.') }, `${cardPoints(data, d)}점`),
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
                if (loaded) {
                  // 저장한 편성이 점수 상한을 넘으면 싼 카드로 바꿔 채운다
                  const over = loadoutProblems(data, run, loaded).some((x) => x.includes('상한'));
                  Object.assign(draft, over ? recommendLoadout(data, run, loaded) : loaded);
                  notice = over ? `저장 ${i + 1}이 점수 상한을 넘어 일부를 싼 카드로 바꿔 채웠다.` : '';
                }
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
        h('div', { class: 'loadout-title' }, h('h2', {}, '편성'), h('small', {}, title), h('p', { class: 'loadout-hint' }, '이번 스테이지에 얻는 카드는 편성과 상관없이 덱에 들어간다. 다음 편성부터 고른다.')),
      ),
      // 동료 줄: 주인마다 한 칸(이름 · 채운 장수 · 점수 막대 · 갈래 보너스). 칸 폭이 같아 줄이 흐트러지지 않는다
      h(
        'nav',
        { class: 'loadout-roster', 'aria-label': '편성할 주인' },
        owners.map((o) => {
          const n = draft[o]?.length ?? 0;
          const need = requiredFor(data, run, o);
          const pts = loadoutPoints(data, draft[o] ?? []);
          const cap = capFor(data, o);
          const focus = o === COMMON ? null : loadoutFocus(data, o, draft[o] ?? []);
          const resting = o !== COMMON && !run.selected.includes(o);
          const arch = archCounts(o);
          return h(
            'button',
            {
              class: `lo-mate${o === tab ? ' on' : ''}${n === need ? ' done' : ''}${pts > cap ? ' over' : ''}${resting ? ' resting' : ''}`,
              'aria-pressed': String(o === tab),
              onclick: () => ((tab = o), render()),
            },
            h('span', { class: 'lo-mate-top' }, h('b', {}, ownerName(o)), resting ? h('em', { class: 'rest-tag' }, '쉼') : null, h('span', { class: 'lo-mate-count' }, `${n}/${need}장`)),
            h('span', { class: 'lo-meter', ...tipAttrs('편성 점수', `${pts}/${cap}점 — 상한 ${cap}`) }, h('i', { style: `width:${Math.min(100, Math.round((pts / Math.max(1, cap)) * 100))}%` })),
            h('small', { class: `lo-mate-pts${pts > cap ? ' pts-over' : ''}` }, `${pts}/${cap}점`),
            o === COMMON
              ? h('small', { class: 'lo-mate-arch' }, '공용 카드')
              : h('small', { class: `lo-mate-arch${focus ? ' on' : ''}` }, focus ? `✓ ${archName.get(focus)?.name ?? focus}` : arch.length ? arch.join(' · ') : '갈래 카드 없음'),
          );
        }),
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
            h('b', {}, `${ownerName(tab)} — ${picked.size}/${need}장 · `, h('span', { class: tabPts > capFor(data, tab) ? 'pts-over' : '' }, `${tabPts}/${capFor(data, tab)}점`)),
            h('small', { ...tipAttrs('편성 점수', `카드 등급마다 점수(일반 1 · 고급 2 · 희귀 3 · 영웅 5 · 전설 7, 열쇠 카드 0). 동료는 ${data.balance.loadout.cap.perCharacter}점, 공용은 ${data.balance.loadout.cap.common}점까지 — 센 카드를 넣으면 나머지는 싼 카드로 채운다. 강화 단계는 세지 않는다.`) }, `보유 ${cards.length}장 중에서 고른다. 같은 카드는 한 장만. 점수 상한 ${capFor(data, tab)}.`),
            h('button', { class: 'btn btn-small', onclick: () => ((draft[tab] = recommendFor(data, run, tab)), (notice = ''), render()) }, `${ownerName(tab)} 추천`),
            h('button', { class: 'btn btn-small', onclick: () => ((draft[tab] = []), render()) }, '모두 빼기'),
          ),
          // 갈래 보너스: 같은 갈래 focusMin장 이상이면 그 갈래의 전투 시작 효과
          archetypes.length
            ? h(
                'p',
                { class: `focus-line${tabFocus ? ' on' : ''}` },
                tabFocus
                  ? `갈래 보너스 ✓ ${archName.get(tabFocus)?.name} — ${archName.get(tabFocus)?.focus?.text ?? ''}`
                  : `같은 갈래 카드 ${data.balance.loadout.focusMin}장이면 갈래 보너스: ${archetypes.map((a) => `${a.name}(${a.focus?.text ?? ''})`).join(' · ')}`,
              )
            : null,
          notice ? h('p', { class: 'loadout-notice' }, notice) : null,
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
            h('button', { class: 'btn', onclick: () => (Object.assign(draft, recommendLoadout(data, run)), (notice = ''), render()) }, '전체 추천 편성'),
            handlers.onShowCollection ? h('button', { class: 'btn', onclick: handlers.onShowCollection }, '보유 카드 전체 보기') : null,
            problems.length ? h('ul', { class: 'loadout-problems' }, problems.map((p) => h('li', {}, p))) : null,
            keepOk
              ? h('button', { class: 'btn btn-large loadout-keep', onclick: () => handlers.onConfirm(structuredClone(keep)) }, '지난 편성 그대로 출발', h('small', {}, keepSame ? '바뀐 것 없음' : '새로 생긴 칸만 추천으로'))
              : null,
            h('button', { class: 'btn btn-primary btn-large', disabled: problems.length > 0, onclick: () => handlers.onConfirm(structuredClone(draft)) }, handlers.onCancel ? '이 편성으로 바꾸기' : '이 편성으로 출발'),
            handlers.onCancel ? h('button', { class: 'btn', onclick: handlers.onCancel }, '바꾸지 않고 돌아가기') : null,
          ),
        ),
      ),
    );
  };
  render();
  if (keepOk && keepSame) requestAnimationFrame(() => root.querySelector<HTMLElement>('.loadout-keep')?.focus());
  return root;
}

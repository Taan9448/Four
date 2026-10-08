// 클리어 지도(2026-10-08): 캠페인을 마친 런의 여정 띠. 지나온 스테이지를 눌러 마지막 파티로 다시 한다(결과는 남지 않고 이긴 횟수만).
import type { GameData } from '../engine/data';
import { playableStages, type RunState } from '../engine/run';
import { h } from './dom';
import { inventoryBox } from './items';
import { journeyBand, placeName } from './map-view';
import { installTooltips } from './tooltip';

export interface HubHandlers {
  onReplay: (stageId: string) => void;
  onShowDeck: () => void;
  onTitle: () => void;
}

export function hubView(data: GameData, run: RunState, handlers: HubHandlers): HTMLElement {
  installTooltips();
  const stages = playableStages(data);
  const fighters = run.roster.filter((r) => data.characters.get(r.id)?.role === 'fighter');
  const mode = [run.difficulty === 'hard' ? '어려움' : '보통', run.hardcore ? '하드코어' : ''].filter(Boolean).join(' · ');
  return h(
    'section',
    { class: 'screen map-screen hub-screen' },
    h('div', { class: 'journey-area' }, h('div', { class: 'journey-wrap' }, journeyBand(data, run, handlers.onReplay)), h('div', { class: 'banner banner-hub' }, '천외귀환 — 다시 걸을 길을 고른다')),
    h(
      'div',
      { class: 'local hub-local' },
      h(
        'div',
        { class: 'hub-list panel' },
        h('header', { class: 'panel-head' }, h('span', { class: 'seal' }, '還'), h('div', {}, h('div', { class: 'choice-kind' }, `클리어 · ${mode}`), h('h2', {}, '스테이지 다시 하기'))),
        h('p', { class: 'choice-text' }, '위 여정 띠의 장소나 아래 목록을 누르면, 마지막에 클리어한 파티·덱·유물로 그 스테이지를 처음부터 다시 한다. 다시 한 결과는 이 저장에 남지 않고 이긴 횟수만 남는다.'),
        h(
          'div',
          { class: 'hub-stages' },
          stages.map((st) =>
            h(
              'button',
              { class: 'btn hub-stage', onclick: () => handlers.onReplay(st.id) },
              h('b', {}, placeName(st, run)),
              h('small', {}, run.replays[st.id] ? `다시 해서 이긴 횟수 ${run.replays[st.id]}` : '아직 다시 하지 않음'),
            ),
          ),
        ),
      ),
      h(
        'aside',
        { class: 'side-panel' },
        h(
          'div',
          { class: 'box' },
          h('h3', {}, '마지막 파티'),
          fighters.map((r) => h('div', { class: 'hub-member' }, h('span', {}, data.characters.get(r.id)?.name ?? r.id), h('small', {}, `Lv ${r.level} · 최대 체력 ${r.maxHp}`))),
          run.fallen.length ? h('p', { class: 'hint' }, `잃은 동료: ${run.fallen.map((id) => data.characters.get(id)?.name ?? id).join(', ')}`) : null,
        ),
        inventoryBox(data, run.gold, run.potions, run.relics),
        h('div', { class: 'map-actions' }, h('button', { class: 'btn btn-primary', onclick: handlers.onShowDeck }, `덱 보기 (${run.deck.length})`), h('button', { class: 'btn', onclick: handlers.onTitle }, '타이틀로')),
      ),
    ),
  );
}

// 클리어 지도 = 자유 여정(2026-10-08, 2026-10-11 개편): 캠페인을 마친 런의 큰 세계 지도. 장소를 누르면 마지막 파티로 그 스테이지를 하고,
// 하다가 '전체 지도로' 나가면 그 자리에 멈춰 두었다가 다시 누르면 이어진다(결과는 남지 않고 이긴 횟수·얻은 카드만).
import type { GameData } from '../engine/data';
import { playableStages, type RunState } from '../engine/run';
import { h } from './dom';
import { inventoryBox } from './items';
import { journeyBand, placeName } from './map-view';
import { installTooltips } from './tooltip';

export interface HubHandlers {
  /** 장소를 눌렀다: 멈춰 둔 진행이 있으면 이어서, 없으면 처음부터 */
  onStage: (stageId: string) => void;
  /** 멈춰 둔 진행을 버린다 */
  onDiscard: (stageId: string) => void;
  onShowDeck: () => void;
  onCodex: () => void;
  onTitle: () => void;
}

export function hubView(data: GameData, run: RunState, handlers: HubHandlers): HTMLElement {
  installTooltips();
  const fighters = run.roster.filter((r) => data.characters.get(r.id)?.role === 'fighter');
  const mode = [run.difficulty === 'hard' ? '어려움' : '보통', run.hardcore ? '하드코어' : ''].filter(Boolean).join(' · ');
  const paused = playableStages(data).filter((st) => run.suspended?.[st.id]);
  const wins = Object.values(run.replays).reduce((a, n) => a + n, 0);
  return h(
    'section',
    { class: 'screen map-screen hub-screen' },
    h(
      'div',
      { class: 'journey-area hub-world' },
      h('div', { class: 'journey-wrap' }, journeyBand(data, run, { onStage: handlers.onStage, world: true })),
      h('div', { class: 'banner banner-hub' }, '자유 여정 — 가고 싶은 곳을 누른다'),
    ),
    h(
      'div',
      { class: 'hub-bottom' },
      h(
        'div',
        { class: 'box hub-guide' },
        h('div', { class: 'choice-kind' }, `클리어 · ${mode}${wins ? ` · 다시 해서 이긴 횟수 ${wins}` : ''}`),
        h('h3', {}, '어디로 갈까'),
        h(
          'p',
          { class: 'hint' },
          '지도의 장소를 누르면 지금 일행·덱·유물로 그곳을 처음부터 걷는다. 걷다가 지도 화면의 "전체 지도로"를 누르면 그 자리에 멈춰 두고 다른 곳으로 갈 수 있고, 멈춘 곳을 다시 누르면 이어진다. 길에서 얻는 카드·골드·유물·레벨은 그 길 안에서만 쓰고, 이긴 횟수만 남는다.',
        ),
        paused.length
          ? h(
              'div',
              { class: 'hub-paused' },
              h('h4', {}, '멈춰 둔 길'),
              paused.map((st) => {
                const p = run.suspended![st.id];
                return h(
                  'div',
                  { class: 'hub-paused-row' },
                  h('b', {}, placeName(st, run)),
                  h('small', {}, `${p.visited.length}칸 지남`),
                  h('button', { class: 'btn btn-small btn-primary', onclick: () => handlers.onStage(st.id) }, '이어서'),
                  h('button', { class: 'btn btn-small', onclick: () => handlers.onDiscard(st.id) }, '버리기'),
                );
              }),
            )
          : null,
      ),
      h(
        'div',
        { class: 'box hub-party' },
        h('h3', {}, '일행'),
        fighters.map((r) => h('div', { class: 'hub-member' }, h('span', {}, data.characters.get(r.id)?.name ?? r.id), h('small', {}, `Lv ${r.level} · 최대 체력 ${r.maxHp}`))),
        h('p', { class: 'hint' }, `전투에는 하운을 포함해 ${data.balance.party.max}명까지 나선다(지도의 출전 칸에서 고른다).`),
      ),
      h(
        'div',
        { class: 'hub-side' },
        inventoryBox(data, run.gold, run.potions, run.relics),
        h(
          'div',
          { class: 'map-actions' },
          h('button', { class: 'btn btn-primary wide', onclick: handlers.onShowDeck }, `보유 카드 (${run.deck.length})`),
          h('button', { class: 'btn', onclick: handlers.onCodex }, '도감'),
          h('button', { class: 'btn', onclick: handlers.onTitle }, '타이틀로'),
        ),
      ),
    ),
  );
}

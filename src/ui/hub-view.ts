// 클리어 지도 = 자유 여정(2026-10-08, 2026-10-11 개편): 캠페인을 마친 런의 큰 세계 지도. 장소를 누르면 마지막 파티로 그 스테이지를 하고,
// 하다가 '전체 지도로' 나가면 그 자리에 멈춰 두었다가 다시 누르면 이어진다(보스를 넘기면 그 길에서 얻은 것이 남는다).
import type { GameData } from '../engine/data';
import { pilgrimTierOpen, playableStages, type RunState } from '../engine/run';
import { h } from './dom';
import { journeyBand, placeName } from './map-view';
import { installTooltips } from './tooltip';
import { modeTipAttrs } from './difficulty-text';
import { openOverlay } from './overlay';
import { challengeDone, challengeUnlockName, pilgrimRewardDue, stageChallenges, tierLabel, tierNumeral } from '../engine/pilgrimage';

export interface HubHandlers {
  /** 장소를 눌렀다: 멈춰 둔 진행이 있으면 이어서, 없으면 처음부터 */
  onStage: (stageId: string) => void;
  /** 멈춰 둔 길을 바로 이어 걷는다(창 없이) */
  onResume: (stageId: string) => void;
  /** 멈춰 둔 진행을 버린다 */
  onDiscard: (stageId: string) => void;
  onShowDeck: () => void;
  /** 옷장(순례·심연, 2026-10-12): 도감 왼쪽 */
  onWardrobe: () => void;
  onCodex: () => void;
  onTitle: () => void;
}

export function hubView(data: GameData, run: RunState, handlers: HubHandlers): HTMLElement {
  installTooltips();
  const mode = [run.difficulty === 'hard' ? '어려움' : '보통', run.hardcore ? '하드코어' : ''].filter(Boolean).join(' · ');
  const paused = playableStages(data).filter((st) => run.suspended?.[st.id]);
  const wins = Object.values(run.replays).reduce((a, n) => a + n, 0);
  // 순례 모드(2026-10-11 사용자 요청): 위 왼쪽에 '순례 모드', 오른쪽에 보유 카드 · 도감 · 타이틀로.
  // 아래는 '어디로 갈까' 한 칸만, 지도와 같은 너비(일행·보유 장비 칸은 뺐다 — 일행은 길의 출전 칸, 장비는 보유 카드 창에서 본다)
  return h(
    'section',
    { class: 'screen map-screen hub-screen' },
    h(
      'div',
      { class: 'hub-top' },
      h('div', { class: 'hub-mode' }, h('span', { class: 'seal', 'aria-hidden': 'true' }, '巡'), h('b', {}, '순례 모드'), h('small', modeTipAttrs(data, run), mode)),
      h(
        'div',
        { class: 'hub-actions' },
        h('button', { class: 'btn btn-primary', onclick: handlers.onShowDeck }, `보유 카드 (${run.deck.length})`),
        h('button', { class: 'btn', onclick: handlers.onWardrobe }, '옷장'),
        h('button', { class: 'btn', onclick: handlers.onCodex }, '도감'),
        h('button', { class: 'btn', onclick: handlers.onTitle }, '타이틀로'),
      ),
    ),
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
          '장소를 누르면 지금 일행으로 그곳을 다시 걷는다. 길에서 얻은 카드·강화·유물·물약·골드는 보스를 넘기면 그대로 남는다(지거나 길을 버리면 그 길에서 얻은 것은 사라진다). 처음 다시 넘긴 스테이지마다 놓친 카드 하나를 더 줍는다. 도전을 이루면 틈의 카드·길·칭호가 열린다. 걷다가 "전체 지도로"를 누르면 그 자리에 멈춰 두고 다른 곳으로 갈 수 있다. 순례에서는 하운도 쉴 수 있다 — 네 명 중 3명을 길의 출전 칸에서 고른다.',
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
                  // 이어서: 창 없이 바로 그 자리에서(2026-10-11 사용자 요청)
                  h('button', { class: 'btn btn-small btn-primary', onclick: () => handlers.onResume(st.id) }, '이어서'),
                  h('button', { class: 'btn btn-small', onclick: () => handlers.onDiscard(st.id) }, '버리기'),
                );
              }),
            )
          : null,
      ),
    ),
  );
}

/**
 * 장소를 눌렀을 때의 작은 창(순례, GAME_DESIGN 2절): 이긴 횟수 · 첫 순례 보상 · 도전(이룬 것 표시) · 순례 난이도 단계(기본·Ⅰ·Ⅱ·Ⅲ, 열린 것만) · [출발](기본 초점) [편성부터].
 * 멈춰 둔 길이 있으면 [이어서] [버리고 처음부터]
 */
export function placeDialog(
  data: GameData,
  hub: RunState,
  stageId: string,
  handlers: { onGo: (tier: number) => void; onLoadout: (tier: number) => void; onResume: () => void; onDiscard: () => void },
): void {
  const st = data.stages.find((s) => s.id === stageId)!;
  const paused = hub.suspended?.[stageId];
  const list = stageChallenges(data, stageId);
  const done = list.filter((c) => challengeDone(hub, c)).length;
  const tiers = data.balance.pilgrimage.tiers;
  const open = pilgrimTierOpen(data, hub, stageId);
  // 순례 난이도 단계(2026-10-22): 열린 가장 높은 단계를 미리 고르지 않고 기본부터 — 고른 단계는 출발 버튼에 붙는다
  let tier = 0;
  const act = (fn: () => void) => () => {
    ov.close();
    fn();
  };
  const goSmall = h('small', {}, '지금 편성 그대로');
  const main = paused
    ? h('button', { class: 'btn btn-primary', onclick: act(handlers.onResume) }, '이어서', h('small', {}, `${paused.visited.length}칸 지남${paused.pilgrimTier ? ` · ${tierLabel(data, paused.pilgrimTier)}` : ''}`))
    : h('button', { class: 'btn btn-primary', onclick: act(() => handlers.onGo(tier)) }, '출발', goSmall);
  const chips: HTMLButtonElement[] = [];
  const pick = (k: number) => {
    tier = k;
    chips.forEach((c, i) => {
      c.classList.toggle('on', i === k);
      c.setAttribute('aria-pressed', String(i === k));
    });
    goSmall.textContent = k ? `${tierLabel(data, k)} · 적 체력 ×${tiers[k - 1].hp} · 골드 ×${tiers[k - 1].gold}` : '지금 편성 그대로';
  };
  const tierRow =
    paused || !tiers.length
      ? null
      : h(
          'div',
          { class: 'tier-row', role: 'group', 'aria-label': '순례 난이도 단계' },
          h('span', { class: 'tier-head' }, '단계'),
          [0, ...tiers.map((_, i) => i + 1)].map((k) => {
            const locked = k > open;
            const t = k ? tiers[k - 1] : undefined;
            const b = h(
              'button',
              {
                type: 'button',
                class: `tier-chip${k === 0 ? ' on' : ''}${(hub.tierCleared?.[stageId] ?? -1) >= k && hub.replays[stageId] ? ' cleared' : ''}`,
                disabled: locked,
                'aria-pressed': String(k === 0),
                title: locked ? `${k === 1 ? '기본' : tierLabel(data, k - 1)}으로 이 스테이지를 넘기면 열린다` : t ? `${tierLabel(data, k)} — 적 체력 ×${t.hp} · 피해 ×${t.dmg} · 전투 골드 ×${t.gold}` : '기본 순례',
                onclick: () => pick(k),
              },
              k ? tierNumeral(k) : '기본',
            ) as HTMLButtonElement;
            chips.push(b);
            return b;
          }),
        );
  const ov = openOverlay(
    placeName(st, hub),
    h(
      'div',
      { class: 'place-dialog' },
      h(
        'p',
        { class: 'place-stats' },
        h('span', {}, `이긴 횟수 ×${hub.replays[stageId] ?? 0}`),
        h('span', { class: pilgrimRewardDue(hub, stageId) ? 'place-reward due' : 'place-reward got' }, pilgrimRewardDue(hub, stageId) ? '첫 순례 보상 남음' : '첫 순례 보상 받음'),
        h('span', {}, `도전 ${done}/${list.length}`),
        hub.tierCleared?.[stageId] ? h('span', { class: 'place-tier' }, `${tierLabel(data, hub.tierCleared[stageId])}까지 넘김`) : null,
      ),
      tierRow,
      h(
        'ul',
        { class: 'challenge-list' },
        list.map((c) =>
          h(
            'li',
            { class: challengeDone(hub, c) ? 'done' : '' },
            h('b', {}, `${challengeDone(hub, c) ? '✓' : '·'} ${c.name}`, c.minTier ? h('em', { class: 'ch-tier' }, ` ${tierNumeral(c.minTier)} 이상`) : null),
            h('span', {}, c.description),
            h('small', {}, challengeUnlockName(data, c)),
          ),
        ),
      ),
      h(
        'div',
        { class: 'confirm-actions' },
        paused ? h('button', { class: 'btn', onclick: act(handlers.onDiscard) }, '버리고 처음부터') : h('button', { class: 'btn', onclick: act(() => handlers.onLoadout(tier)) }, '편성부터'),
        main,
      ),
    ),
  );
  // Enter 한 번으로 간다
  requestAnimationFrame(() => main.focus());
}

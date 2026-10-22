// 지도 화면(GAME_DESIGN 13절): 위 = 두 세계를 잇는 여정 띠, 아래 = 지금 스테이지의 두루마리 지역 지도 + 편성·요약.
import type { GameData } from '../engine/data';
import { findNode, type MapNode } from '../engine/route';
import { availableNodes, pilgrimScale, playableStages, setParty, stageWorld, xpToNext, type RunState } from '../engine/run';
import { scarStartRift } from '../engine/battle';
import { challengeDone, challengeState, pilgrimRewardDue, stageChallenges } from '../engine/pilgrimage';
import { frameUrl } from '../render/assets';
import { h } from './dom';
import { artOrGlyph, lawIconEl } from './icons';
import { isDebug } from './debug';
import { runTour, type TourStep } from './tour';
import { installTooltips, tipAttrs } from './tooltip';
import { inventoryBox } from './items';
import { starterCards } from '../engine/collection';
import { deckGroupsView } from './deck-view';
import { openOverlay } from './overlay';
import { loadPortrait, standingFor } from '../render/portrait';
import { abyssScale, loopLabel, nemesisEvery, WORLD_NAME } from '../engine/abyss';

/** 노드 표식: 두루마리 위의 한자 */
const NODE_GLYPH: Record<string, string> = { story: '史', battle: '戰', elite: '精', event: '事', rest: '休', inn: '宿', shop: '市', boss: '王' };
const NODE_LABEL: Record<string, string> = { story: '이야기', battle: '전투', elite: '엘리트', event: '사건', rest: '휴식', inn: '여관', shop: '상점', boss: '보스' };
/** 범례에만 더하는 표식: 폭주가 연 裂 틈새(GAME_DESIGN 7절) */
const LEGEND_EXTRA: Record<string, [string, string]> = { crack: ['裂', '틈새'] };
/** 노드 아이콘 시트(icons_nodes, 2026-10-12): 칸 순서. 그림이 오기 전에는 한자 */
const NODE_ICON = ['story', 'battle', 'elite', 'event', 'rest', 'inn', 'shop', 'boss', 'crack'];
const nodeMark = (kind: string, glyph: string) => artOrGlyph('icons_nodes', NODE_ICON.indexOf(kind) + 1, glyph, 'node-glyph');

/** 세계의 틈이 나타나는 사건: S7 낙안봉을 넘은 밤의 아물지 않는 금 */
const RIFT_FLAG = 'sky_crack';
/** 틈이 처음 나타나는 스테이지(이 스테이지 출발 지도에서 알림 띠와 함께 그어진다) */
const RIFT_REVEAL_STAGE = 's8';
/** 귀곡애 석문(두 세계의 유일한 통로) 자리 — journey_band 그림의 가운데 아래. 엘하임이 드러난 뒤에만 보인다 */
const GATE = { x: 47, y: 74 };
/** 여정 띠의 지역: 그림에서 차지하는 가로 범위(%)와 이름. 아직 들어선 적 없는 지역은 안개로 덮는다(GAME_DESIGN 14절) */
const REGIONS = {
  murim: { from: 0, to: 49, tag: '武林 · 무림', unknown: '낯선 땅' },
  elheim: { from: 51, to: 100, tag: '엘하임 · Elheim', unknown: '낯선 세계' },
} as const;

export interface MapViewHandlers {
  onEnter: (node: MapNode) => void;
  onToggleSupport: (on: boolean) => void;
  /** 편성이 바뀌어 다시 그려야 할 때 */
  onRefresh: () => void;
  onShowDeck: () => void;
  onSettings: () => void;
  /** 도감(돌아오면 지도) */
  /** 옷장(순례·심연, 2026-10-12): 도감 왼쪽 */
  onWardrobe?: () => void;
  onCodex: () => void;
  /** 타이틀로(런은 저장돼 있어 "이어하기"로 돌아온다) */
  onTitle: () => void;
  /** 출전 칸을 반짝여 눈에 띄게(동료가 막 합류했을 때) */
  highlightParty?: boolean;
  /** 자유 여정(다시 하는 중): 이 스테이지를 멈추고 전체 지도로 / 여정 띠의 다른 장소로 옮겨 간다(2026-10-11) */
  onWorldMap?: () => void;
  onSwitchStage?: (stageId: string) => void;
}

/**
 * 출전 편성 안내(동료가 처음 합류했을 때·자리가 가득 찼을 때 한 번씩, 그 뒤엔 출전 제목 옆 ? 표식으로).
 * 팝업 한 장 대신 지도 위의 실제 칸을 하나씩 비추며 짚어 준다(투어)
 */
export function openPartyGuide(data: GameData, run: RunState): void {
  const max = data.balance.party.max;
  const name = (id: string) => data.characters.get(id)?.name ?? id;
  const mates = run.selected.filter((id) => id !== 'haun');
  const resting = run.roster.filter((r) => data.characters.get(r.id)?.role === 'fighter' && !run.selected.includes(r.id)).map((r) => r.id);
  const steps: TourStep[] = [
    { target: '.party-box', title: '동료가 합류했다', text: `전투에 누구를 데려갈지는 이 <출전> 칸에서 고른다. 지금 ${run.selected.length}명 출전 중, 최대 ${max}명.` },
    {
      target: mates.length ? `.member[data-member="${mates[mates.length - 1]}"]` : '.member',
      title: '체크로 넣고 뺀다',
      text: `이름 옆 칸을 누르면 출전과 휴식이 바뀐다. 하운은 언제나 출전하고(고정), 하운을 포함해 ${max}명까지.`,
    },
  ];
  if (resting.length)
    steps.push({
      target: `.member[data-member="${resting[0]}"]`,
      title: `${resting.map(name).join(', ')} — 쉬는 중`,
      text: '자리가 가득 차면 쉬는 동료의 칸은 잠긴다. 데려가려면 먼저 출전 중인 동료 한 명의 체크를 풀고, 그다음 이 칸을 누른다.',
    });
  steps.push(
    { target: '.member-hp', title: '체력은 동료마다 따로', text: '전투가 끝나도 체력은 이어진다. 다친 동료는 쉬게 하고 성한 동료를 데려가도 된다.' },
    { target: '.map-actions .btn-primary', title: '덱도 함께 바뀐다', text: '출전한 동료의 카드만 전투 덱에 들어간다. 쉬는 동료의 카드는 그 전투에서만 빠질 뿐, 덱에서 사라지지 않는다.' },
    { target: '.node.open', title: '언제든 바꿀 수 있다', text: '편성은 지도에 서 있을 때면 언제든 바꿀 수 있다(전투·이벤트 안에서는 안 된다). 준비가 되면 갈 곳을 고른다.' },
  );
  runTour(steps);
}

/** 표시용 흔들림: 노드 id로 정해지는 -1~1(같은 지도는 늘 같은 모양. 엔진 난수와 무관) */
function wobble(id: string, salt: number): number {
  let x = salt * 2654435761;
  for (let i = 0; i < id.length; i++) x = Math.imul(x ^ id.charCodeAt(i), 2246822519) >>> 0;
  return ((x >>> 8) % 2001) / 1000 - 1;
}

const art = (id: string | undefined) => {
  const url = frameUrl(id, 1, { realOnly: true });
  return url ? `background-image:url("${url}")` : '';
};

type Stage = GameData['stages'][number];

/** 장소 이름: 하운이 아직 이름을 모르면(knownFlag 전) unknownLabel. 여정 띠가 없으면 스테이지 이름 */
export function placeName(stage: Stage, run: RunState): string {
  if (run.abyss) return loopLabel(run.abyss);
  const j = stage.journey;
  if (!j) return stage.name;
  return j.unknownLabel && j.knownFlag && !run.flags.includes(j.knownFlag) ? j.unknownLabel : j.label;
}

/**
 * 심연의 깊이 띠(여정 띠 대신): 굽이가 아래로 이어지는 검은 금. 지나온 굽이는 세계 이름, 지금 굽이는 밝게,
 * 숙적 굽이(5·10·15…)에는 표식
 */
function depthBand(data: GameData, run: RunState): HTMLElement {
  const ab = run.abyss!;
  const every = nemesisEvery(data, ab);
  const last = Math.max(ab.depth + 3, Math.ceil((ab.depth + 1) / every) * every);
  const first = Math.max(1, last - 11);
  const stops = [];
  for (let d = first; d <= last; d++) {
    const loop = ab.loops.find((l) => l.depth === d);
    const nemesis = d % every === 0;
    stops.push(
      h(
        'div',
        { class: `depth-stop${d === ab.depth ? ' here' : d < ab.depth ? ' done' : ''}${nemesis ? ' nemesis' : ''}`, ...tipAttrs(`${d}굽이`, [nemesis ? '숙적 — 모르데카이의 잔향' : loop ? WORLD_NAME[loop.world] : '아직 가 보지 않은 굽이', loop?.laws?.length ? `법칙: ${loop.laws.map((id) => data.laws.get(id)?.name ?? id).join(' · ')}` : ''].filter(Boolean).join('\n')) },
        h('b', {}, String(d)),
        h('small', {}, nemesis ? '숙적' : loop ? WORLD_NAME[loop.world] : '?'),
      ),
    );
  }
  return h('div', { class: 'depth-band' }, h('div', { class: 'depth-crack' }), ...stops);
}

/** 심연 지도의 도입 글: 지금 굽이의 세기와 다음 숙적 */
function abyssTeaser(data: GameData, run: RunState): string {
  const ab = run.abyss!;
  const sc = abyssScale(data, ab.depth);
  const every = nemesisEvery(data, ab);
  const next = Math.ceil(ab.depth / every) * every;
  const nemesis = ab.depth % every === 0 ? '이 굽이의 끝에서 숙적, 모르데카이의 잔향이 기다린다.' : `숙적까지 ${next - ab.depth}굽이.`;
  const oath = ab.oath ? ` 서약 ${ab.oath}단계(${data.oaths.find((o) => o.level === ab.oath)?.name ?? ''}까지).` : '';
  const daily = ab.daily ? ` 오늘의 심연(${ab.daily.slice(0, 4)}.${ab.daily.slice(4, 6)}.${ab.daily.slice(6)}).` : '';
  return `${WORLD_NAME[ab.world]}의 조각이 이어 붙은 굽이. 적이 단단해졌다(체력 ×${sc.hp.toFixed(2)}, 피해 ×${sc.dmg.toFixed(2)}). ${nemesis}${oath}${daily}`;
}

/** 동료 자세히: 반신 그림 · 소개 · 레벨·체력·경험치 · 이 동료의 보유 카드 */
export function openMemberInfo(data: GameData, run: RunState, id: string): void {
  const def = data.characters.get(id);
  const r = run.roster.find((x) => x.id === id);
  if (!def || !r) return;
  const next = xpToNext(data, r.level);
  const pic = h('div', { class: 'member-pic', style: `--owner:${def.color}` }, h('span', {}, def.name.slice(0, 1)));
  void loadPortrait(id, 'neutral', standingFor(data, id, run.flags)).then((img) => img && pic.replaceChildren(h('img', { src: img.src, alt: def.name })));
  const cards = run.deck.filter((c) => data.cards.get(c.cardId)?.owner === id);
  const stat = (label: string, value: string) => h('div', {}, h('dt', {}, label), h('dd', {}, value));
  openOverlay(
    def.name,
    h(
      'div',
      { class: 'member-detail' },
      h(
        'div',
        { class: 'member-head' },
        pic,
        h(
          'div',
          { class: 'member-facts' },
          h('div', { class: 'member-title' }, def.title),
          h(
            'dl',
            {},
            stat('레벨', `Lv ${r.level}`),
            stat('체력', `${r.hp} / ${r.maxHp}`),
            stat('경험치', next === null ? '최대 레벨' : `${r.xp} / ${next}`),
            stat('출전', id === 'haun' && !run.replayOf ? '항상' : run.selected.includes(id) ? '출전 중' : '쉼'),
            stat('치명타', `${Math.round((def.crit ?? data.balance.crit.chance) * 100)}%`),
          ),
          h('p', { class: 'member-desc' }, def.description),
        ),
      ),
      h('h3', {}, `${def.name}의 카드 (${cards.length})`),
      cards.length ? deckGroupsView(data, [{ label: def.name, cards }]) : h('p', { class: 'hint' }, '보유 카드에 이 동료의 카드가 없다.'),
    ),
    { wide: true },
  );
}

/** 위: 여정 띠. 지나온 곳과 지금만 보이고, 들어서 보지 않은 지역은 안개, 틈은 '하늘의 금' 사건 뒤에 나타난다 */
/** onStage: 클리어 지도처럼 장소를 눌러 고를 때(지나온 곳만) */
/**
 * 여정 띠. onStage가 있으면 자유 여정(캠페인을 마친 뒤, 2026-10-11): 모든 장소가 드러나고 누르면 그곳으로 간다.
 * world면 클리어 지도의 큰 세계 지도(같은 그림을 위아래로 더 넓게 3:1, 띠는 그 가운데 절반)
 */
export function journeyBand(data: GameData, run: RunState, opts: { onStage?: (stageId: string) => void; world?: boolean } = {}): HTMLElement {
  const { onStage } = opts;
  const free = !!onStage;
  const hubRun = run.replayOf ?? run;
  const stages = playableStages(data).filter((st) => st.journey);
  const cur = data.stages.find((s) => s.id === run.stageId)!;
  const reached = free ? stages : stages.filter((st) => st.order <= cur.order);
  const rift = run.flags.includes(RIFT_FLAG);
  const atStart = run.visited.length === 0 && !free;
  const revealRift = rift && run.stageId === RIFT_REVEAL_STAGE && atStart;
  const NS = 'http://www.w3.org/2000/svg';
  const crack = document.createElementNS(NS, 'svg');
  crack.setAttribute('class', `journey-crack${revealRift ? ' reveal' : ''}`);
  crack.setAttribute('viewBox', '0 0 100 100');
  crack.setAttribute('preserveAspectRatio', 'none');
  if (rift) {
    // 상흔이 쌓일수록 금이 벌어진다
    const w = 1.2 + Math.min(run.scar, 12) * 0.35;
    for (const [cls, sw] of [['glow', w * 3], ['line', w]] as const) {
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', 'M50 0 L48.6 14 L51.2 26 L49 38 L51.6 50 L49.4 62 L50.6 72');
      p.setAttribute('class', cls);
      p.setAttribute('stroke-width', String(sw));
      p.setAttribute('pathLength', '1');
      crack.appendChild(p);
    }
  }
  // 하늘의 금 그림(Codex ui_sky_crack, 2026-10-13): 상흔 0~3 · 4~9 · 10 이상 세 단계. 그림이 있으면 SVG 선 대신 쓴다
  const crackStage = run.scar >= 10 ? 3 : run.scar >= 4 ? 2 : 1;
  const crackUrl = rift ? frameUrl('ui_sky_crack', crackStage, { realOnly: true }) : null;
  const crackEl = crackUrl ? h('img', { class: `journey-crack-art${revealRift ? ' reveal' : ''}`, src: crackUrl, alt: '' }) : crack;
  // 지역: 그 지역의 스테이지에 한 번이라도 들어섰으면 드러난다. 이번 스테이지가 그 지역의 첫 스테이지이고 막 출발했으면 안개가 걷히는 연출
  const regionParts = (Object.keys(REGIONS) as (keyof typeof REGIONS)[]).map((key) => {
    const r = REGIONS[key];
    const first = stages.find((st) => st.journey!.region === key);
    const open = reached.some((st) => st.journey!.region === key);
    // 캠페인의 첫 지역(무림)은 하운의 세계라 처음부터 보인다. 그 밖의 지역은 처음 들어설 때 안개가 걷힌다
    const lifting = open && first?.id === cur.id && atStart && first.order !== stages[0].order;
    const known = open && (!first?.journey!.knownFlag || run.flags.includes(first.journey!.knownFlag));
    const side = key === 'murim' ? 'l' : 'r';
    return {
      tag: open ? h('span', { class: `tag tag-${side}` }, known ? r.tag : r.unknown) : null,
      fog: !open || lifting ? h('div', { class: `journey-fog${lifting ? ' lifting' : ''}`, style: `left:${r.from}%;right:${100 - r.to}%` }, h('span', {}, '?')) : null,
      lifting,
    };
  });
  const elheimOpen = reached.some((st) => st.journey!.region === 'elheim');
  const stops = reached
    .map((st) => {
      const j = st.journey!;
      const here = st.id === cur.id;
      if (onStage) {
        // 자유 여정: 지금 다시 하는 곳(here) · 멈춰 둔 곳(paused, 누르면 이어서) · 그 밖(누르면 처음부터)
        const now = !!run.replayOf && here;
        const paused = hubRun.suspended?.[st.id];
        const wins = hubRun.replays[st.id];
        const tip = now ? '지금 여기' : paused ? `멈춘 곳에서 이어서 — ${paused.visited.length}칸 지남` : '누르면 이곳으로 간다(처음부터)';
        // 순례: 첫 순례 보상을 받았으면 금빛 점, 도전 이룬 수 n/3
        const rewarded = !pilgrimRewardDue(hubRun, st.id);
        const chs = stageChallenges(data, st.id);
        const chDone = chs.filter((c) => challengeDone(hubRun, c)).length;
        const more = [wins ? `다시 해서 이긴 횟수 ${wins}` : '', rewarded ? '첫 순례 보상 받음' : '', chs.length ? `도전 ${chDone}/${chs.length}` : ''].filter(Boolean).join(' · ');
        return h(
          'button',
          { class: `stop done pick${now ? ' here' : ''}${paused ? ' paused' : ''}`, style: `left:${j.x}%;top:${j.y}%`, onclick: now ? undefined : () => onStage(st.id), ...tipAttrs(placeName(st, run), more ? `${tip}\n${more}` : tip) },
          h('i', {}),
          rewarded ? h('b', { class: 'pilgrim-dot', 'aria-label': '첫 순례 보상 받음' }) : null,
          h('span', { class: 'stop-name' }, placeName(st, run)),
          paused ? h('small', { class: 'paused-tag' }, '진행 중') : wins ? h('small', { class: 'replays' }, `×${wins}`) : null,
          opts.world && chs.length ? h('small', { class: `challenge-tag${chDone === chs.length ? ' all' : ''}` }, `${chDone}/${chs.length}`) : null,
        );
      }
      return h('div', { class: `stop ${here ? 'here' : 'done'}`, style: `left:${j.x}%;top:${j.y}%`, ...tipAttrs(placeName(st, run), here ? '지금 여기' : '지나온 곳') }, h('i', {}), h('span', { class: 'stop-name' }, placeName(st, run)));
    })
    .concat(
      // 틈의 심장: '하늘의 금' 뒤부터 사건 표시로(아직 들어서지 않았을 때)
      stages
        .filter((st) => !free && st.journey!.region === 'rift' && rift && st.order > cur.order)
        .map((st) =>
          h('div', { class: 'stop event', style: `left:${st.journey!.x}%;top:${st.journey!.y}%`, ...tipAttrs('하늘의 금', '두 세계 사이에 생긴 금. 그 너머는 아무도 모른다.') }, h('i', {}), h('span', { class: 'stop-name' }, '?')),
        ),
    );
  // 여정 띠 그림(journey_band)이 오기 전: 들어온 지역 지도 그림을 장소 자리에 번지듯 깔아 한 장의 큰 지도처럼 보이게 한다
  const bandArt = art('journey_band');
  const tiles = bandArt
    ? null
    : stages
        .filter((st) => st.journey!.region !== 'rift' || rift)
        .map((st) => {
          const url = frameUrl(st.mapArt, 1, { realOnly: true });
          return url ? h('div', { class: 'journey-tile', style: `left:${st.journey!.x}%;top:${st.journey!.y}%;background-image:url("${url}")` }) : null;
        });
  const band = h(
    'div',
    { class: `journey${bandArt ? ' has-art' : tiles?.some(Boolean) ? ' has-tiles' : ''}`, style: opts.world ? '' : bandArt },
    tiles,
    crackEl,
    regionParts.map((p) => p.fog),
    regionParts.map((p) => p.tag),
    rift ? h('span', { class: 'tag tag-c' }, '하늘의 금') : null,
    elheimOpen ? h('span', { class: 'gate', style: `left:${GATE.x}%;top:${GATE.y}%`, ...tipAttrs('귀곡애 석문', '두 세계를 잇는 단 하나의 문') }, '귀곡애 석문') : null,
    stops,
  );
  // 큰 세계 지도: 같은 그림(3:2)의 높이 25~75%를 3:1로 보이고, 띠(37.5~62.5%)는 그 가운데 절반에 그대로 얹는다
  return opts.world ? h('div', { class: `world-map${bandArt ? ' has-art' : ''}`, style: bandArt }, band) : band;
}

/** 여정 띠 위에 뜨는 알림(새 지역·하늘의 금). 띠가 가로로 밀려도 보이게 띠 바깥에 둔다 */
function journeyBanner(data: GameData, run: RunState): HTMLElement | null {
  const cur = data.stages.find((s) => s.id === run.stageId)!;
  if (run.visited.length > 0) return null;
  if (run.flags.includes(RIFT_FLAG) && run.stageId === RIFT_REVEAL_STAGE) return h('div', { class: 'banner' }, '하늘이 갈라졌다 — 두 세계 사이에 금이 생겼다');
  const stages = playableStages(data).filter((st) => st.journey);
  const region = cur.journey?.region;
  const first = stages.find((st) => st.journey!.region === region);
  if (region === 'elheim' && first?.id === cur.id) return h('div', { class: 'banner' }, '석문 너머 — 달이 둘 뜨는 낯선 세계');
  // 엘하임을 지나 무림으로 돌아온 첫 스테이지(S6)
  const lastElheim = Math.max(...stages.filter((st) => st.journey!.region === 'elheim').map((st) => st.order));
  const returnStage = stages.find((st) => st.journey!.region === 'murim' && st.order > lastElheim);
  if (returnStage?.id === cur.id) return h('div', { class: 'banner banner-return' }, '석문을 넘어 — 삼 년 만의 무림, 하늘에 달이 하나');
  return null;
}

/** 좁은 화면에서 띠·두루마리가 가로로 밀릴 때, 처음에 지금 위치가 보이게 */
function scrollToHere(wrap: HTMLElement, selector: string): void {
  requestAnimationFrame(() => {
    const el = wrap.querySelector<HTMLElement>(selector);
    if (!el || wrap.scrollWidth <= wrap.clientWidth) return;
    const wr = wrap.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    wrap.scrollLeft += er.left - wr.left - wr.width / 2 + er.width / 2;
  });
}

/** 지도마다 이미 그린 끊긴 길 수(새 금만 그어지는 연출을 하려고) */
const drawnCuts = new Map<string, number>();

export function mapView(data: GameData, run: RunState, handlers: MapViewHandlers): HTMLElement {
  installTooltips();
  const stage = data.stages.find((s) => s.id === run.stageId)!;
  const avail = new Set(availableNodes(run).map((n) => n.id));
  const floors = run.map.floors;
  // 가로 두루마리 위의 자리(%): 왼쪽 = 1층, 오른쪽 = 마지막 층(보스)
  const span = floors.length > 1 ? 84 / (floors.length - 1) : 0;
  const pos = (n: MapNode) => {
    const count = floors[n.floor - 1].length;
    const boss = n.type === 'boss';
    return {
      x: 8 + (n.floor - 1) * span + (boss ? 0 : wobble(n.id, 1) * Math.min(1.6, span * 0.16)),
      y: 10 + (80 / (count + 1)) * (n.index + 1) + (boss ? 0 : wobble(n.id, 2) * 4),
    };
  };

  // 길(SVG): 지나온 길은 진한 먹, 지금 갈 수 있는 길은 푸른 먹, 나머지는 옅은 점선
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('class', 'map-lines');
  for (const floor of floors) {
    for (const n of floor) {
      for (const nextId of n.next) {
        const m = findNode(run.map, nextId)!;
        const a = pos(n), b = pos(m);
        const line = document.createElementNS(svgNS, 'line');
        line.setAttribute('x1', String(a.x));
        line.setAttribute('y1', String(a.y));
        line.setAttribute('x2', String(b.x));
        line.setAttribute('y2', String(b.y));
        const walked = run.visited.includes(n.id) && run.visited.includes(m.id);
        line.setAttribute('class', walked ? 'walked' : avail.has(m.id) && run.position === n.id ? 'open' : '');
        svg.appendChild(line);
      }
    }
  }
  // 폭주가 끊은 길(GAME_DESIGN 7절): 옅은 끊긴 선 위로 검은 금. 상흔이 깊을수록 금이 굵다
  const crackW = 2 + Math.min(run.scar, 30) * 0.12; // 화면 px(non-scaling-stroke)
  // 새로 끊긴 길(지난번 지도를 그린 뒤 생긴 것)은 금이 그어지는 연출
  const cutKey = `${run.seed}:${run.stageId}`;
  const drawn = drawnCuts.get(cutKey) ?? (run.map.cuts?.length ?? 0);
  drawnCuts.set(cutKey, run.map.cuts?.length ?? 0);
  for (const [ci, [fromId, toId]] of (run.map.cuts ?? []).entries()) {
    const n = findNode(run.map, fromId);
    const m = findNode(run.map, toId);
    if (!n || !m) continue;
    const a = pos(n), b = pos(m);
    const cut = document.createElementNS(svgNS, 'line');
    cut.setAttribute('x1', String(a.x));
    cut.setAttribute('y1', String(a.y));
    cut.setAttribute('x2', String(b.x));
    cut.setAttribute('y2', String(b.y));
    cut.setAttribute('class', 'cut');
    svg.appendChild(cut);
    // 끊긴 자리: 길을 가로지르는 들쭉날쭉한 금
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const zig = [-8, -5, -2, 1, 4, 8].map((dy, i) => `${(mx + (i % 2 ? 0.9 : -0.9)).toFixed(2)} ${(my + dy).toFixed(2)}`);
    for (const [cls, sw] of [['crack-glow', crackW * 3], ['crack', crackW]] as const) {
      const path = document.createElementNS(svgNS, 'path');
      path.setAttribute('d', `M${zig.join(' L')}`);
      path.setAttribute('class', `${cls}${ci >= drawn ? ' fresh' : ''}`);
      path.setAttribute('stroke-width', String(sw));
      path.setAttribute('pathLength', '1');
      svg.appendChild(path);
    }
  }
  // 출발점(왼쪽 가장자리) → 1층
  const start = { x: 2.6, y: 50 };
  if (!run.position) {
    for (const n of floors[0]) {
      const p = pos(n);
      const line = document.createElementNS(svgNS, 'line');
      line.setAttribute('x1', String(start.x));
      line.setAttribute('y1', String(start.y));
      line.setAttribute('x2', String(p.x));
      line.setAttribute('y2', String(p.y));
      line.setAttribute('class', avail.has(n.id) ? 'open' : '');
      svg.appendChild(line);
    }
  }

  const revealAll = !!run.abyss && run.relics.some((id) => data.relics.get(id)?.rule === 'reveal_map');
  const nodes = floors.flat().map((n) => {
    const p = pos(n);
    const mod = data.modules.get(n.moduleId);
    const visited = run.visited.includes(n.id);
    const open = avail.has(n.id);
    // 들어가 본 노드만 이름이 보인다(보스 이름·이야기 제목은 가서 안다, GAME_DESIGN 14절)
    const known = visited;
    // 종류는 지나온 곳과 지금 갈 수 있는 다음 층만(2026-10-11 사용자 결정 — 그 뒤 층은 모양·색까지 감춘 ? 표식). 이름은 들어가 봐야
    // 심연의 그림자의 길: 종류가 모두 보인다(이름은 여전히 들어가 봐야)
    // 裂 틈새: 폭주가 연 자리는 멀리서도 보인다(종류는 들어가 봐야 — 틈의 짐승 또는 틈새의 거래)
    if (n.crack)
      return h(
        'button',
        {
          class: `node node-crack${visited ? ' done' : ''}${open ? ' open' : ''}${run.position === n.id ? ' here' : ''}`,
          style: `left:${p.x}%;top:${p.y}%;--tilt:${(wobble(n.id, 3) * 5).toFixed(1)}deg`,
          disabled: !open,
          'aria-label': `裂 틈새, ${n.floor}층${open ? ' — 갈 수 있다' : visited ? ' — 지나온 곳' : ''}`,
          onclick: () => handlers.onEnter(n),
          ...tipAttrs(`${n.floor}층 · 裂 틈새`, [visited ? mod?.name ?? '' : '폭주가 연 자리. 틈의 짐승(이기면 상흔 -5와 유물)이나 틈새의 거래(감소 카드·봉인 유물)가 있다.', open ? '갈 수 있다' : ''].filter(Boolean).join('\n'), 'rift'),
        },
        nodeMark('crack', '裂'),
      );
    if (!visited && !open && !revealAll)
      return h(
        'button',
        {
          class: `node node-unknown${open ? ' open' : ''}`,
          style: `left:${p.x}%;top:${p.y}%;--tilt:${(wobble(n.id, 3) * 5).toFixed(1)}deg`,
          disabled: !open,
          'aria-label': `${n.floor}층 알 수 없는 곳${open ? ' — 갈 수 있다' : ''}`,
          onclick: () => handlers.onEnter(n),
          ...tipAttrs(`${n.floor}층 · ?`, open ? '갈 수 있다. 무엇이 기다리는지는 들어가 봐야 안다.' : '아직 가 보지 않은 곳.'),
        },
        h('span', { class: 'node-glyph' }, '?'),
      );
    return h(
      'button',
      {
        class: `node node-${n.type}${visited ? ' done' : ''}${open ? ' open' : ''}${run.position === n.id ? ' here' : ''}`,
        style: `left:${p.x}%;top:${p.y}%;--tilt:${(wobble(n.id, 3) * 5).toFixed(1)}deg`,
        disabled: !open,
        'aria-label': `${NODE_LABEL[n.type]}, ${n.floor}층${open ? ' — 갈 수 있다' : visited ? ' — 지나온 곳' : ''}`,
        onclick: () => handlers.onEnter(n),
        ...tipAttrs(`${n.floor}층 · ${NODE_LABEL[n.type]}`, [known ? mod?.name ?? '' : '', open ? '갈 수 있다' : visited ? '지나온 곳' : ''].filter(Boolean).join('\n')),
      },
      nodeMark(n.type, NODE_GLYPH[n.type]),
    );
  });

  // 지금 위치: 작은 하운
  const here = run.position ? findNode(run.map, run.position) : null;
  const hp = here ? pos(here) : start;
  const mark = frameUrl('haun_idle', 1);
  const hereMark = mark ? h('img', { class: 'here-mark', src: mark, alt: '지금 위치', style: `left:${hp.x}%;top:${hp.y}%` }) : null;

  // 파티 편성(하운 고정, 최대 3명). 심연은 모두 출전(편성 없음)
  const fighters = run.roster.filter((r) => data.characters.get(r.id)?.role === 'fighter');
  const partyMax = run.abyss ? data.balance.abyss.partyMax : data.balance.party.max;
  const full = run.selected.length >= partyMax;
  // S3 폐사찰 재회에서 합류하면 지원은 늘 켜져 있다. 그 전에는 ?debug에서만 토글(합류 전 이름이 드러나지 않게)
  const wangJoined = run.flags.includes('support:wang');
  const support = wangJoined
    ? h('p', { class: 'support-toggle joined', title: data.characters.get('wang')?.description }, h('span', { class: 'member-tag' }, '지원'), ' 왕일검 - 일행을 돕는다')
    : isDebug()
      ? h(
          'label',
          { class: 'support-toggle', title: '원래 S3(혈로)에서 합류합니다.' },
          h('input', { type: 'checkbox', checked: run.supportActive, onchange: (e: Event) => handlers.onToggleSupport((e.target as HTMLInputElement).checked) }),
          ' 왕일검 지원(디버그)',
        )
      : null;

  const partyBox = h(
    'div',
    { class: `box party-box${handlers.highlightParty ? ' guide-pulse' : ''}` },
    h(
      'h3',
      { class: 'party-head' },
      run.abyss ? `일행 (${run.selected.length})` : `출전 (${run.selected.length}/${data.balance.party.max})`,
      // 출전 편성 안내(투어)는 제목 옆 ? 표식으로 다시 본다(2026-10-13 — 버튼 한 줄을 차지하던 것을 바꿈)
      fighters.length > 1 && !run.abyss
        ? h('button', { class: 'member-info party-help', type: 'button', 'aria-label': '출전 편성 안내', onclick: () => openPartyGuide(data, run), ...tipAttrs('출전 편성 안내', '누가 전투에 나가는지 고르는 법을 칸마다 짚어 준다.') }, '?')
        : null,
    ),
    fighters.map((r) => {
      const def = data.characters.get(r.id)!;
      const checked = run.selected.includes(r.id);
      const noCards = starterCards(data, r.id).length === 0;
      return h(
        'label',
        { class: `member${checked ? ' on' : ''}`, 'data-member': r.id, style: `--owner:${def.color}`, title: def.description },
        h('input', {
          type: 'checkbox',
          checked,
          // 자리가 가득 차면 쉬는 동료는 먼저 한 명을 빼야 고를 수 있다
          // 하운은 고정(순례에서는 하운도 쉴 수 있다 — 2026-10-11). 마지막 한 명은 뺄 수 없다
          disabled: (r.id === 'haun' && !run.replayOf) || !!run.abyss || (!checked && full) || (checked && run.selected.length === 1),
          onchange: (e: Event) => {
            const on = (e.target as HTMLInputElement).checked;
            const next = on ? [...run.selected, r.id] : run.selected.filter((x) => x !== r.id);
            try {
              setParty(data, run, next);
            } catch (err) {
              alert((err as Error).message);
            }
            handlers.onRefresh();
          },
        }),
        h('span', { class: 'member-name' }, def.name),
        r.id === 'haun' && !run.replayOf && !run.abyss ? h('span', { class: 'member-tag' }, '고정') : run.abyss?.injuries[r.id] ? h('span', { class: 'member-tag rest', title: `다음 굽이까지 최대 체력 -${run.abyss.injuries[r.id]}` }, '부상') : checked ? null : h('span', { class: 'member-tag rest' }, '쉼'),
        h('span', { class: 'member-lv', title: xpToNext(data, r.level) === null ? '최대 레벨' : `경험치 ${r.xp} / ${xpToNext(data, r.level)}` }, `Lv ${r.level}`),
        h('span', { class: 'member-hp' }, `${r.hp} / ${r.maxHp}`),
        h('i', { class: 'member-xp', style: `width:${xpToNext(data, r.level) === null ? 100 : Math.round((r.xp / xpToNext(data, r.level)!) * 100)}%` }),
        noCards ? h('span', { class: 'member-note' }, '카드 미구현') : null,
        h(
          'button',
          {
            class: 'member-info',
            title: `${def.name} 자세히`,
            'aria-label': `${def.name} 자세히`,
            // 줄(label)을 눌러도 출전이 바뀌지 않게
            onclick: (e: Event) => {
              e.preventDefault();
              e.stopPropagation();
              openMemberInfo(data, run, r.id);
            },
          },
          'i',
        ),
      );
    }),
    // 왕일검(지원)은 출전 목록 바로 아래(2026-10-11 사용자 요청)
    support,
    h(
      'p',
      { class: 'hint' },
      run.abyss
        ? '심연에서는 모두 출전한다. 쓰러진 채 전투가 끝난 동료는 다음 굽이까지 부상(최대 체력 감소).'
        : fighters.length > data.balance.party.max && full
        ? `자리가 가득 찼습니다(최대 ${data.balance.party.max}명). 쉬는 동료를 넣으려면 먼저 출전 중인 동료 한 명의 체크를 푸세요.${run.replayOf ? ' 순례에서는 하운도 쉴 수 있습니다.' : ''}`
        : run.replayOf
          ? `순례에서는 하운도 쉴 수 있다 — 네 명 중 최대 ${data.balance.party.max}명. 하운이 빠지면 출전한 모두가 쓰러져야 진다. 출전하지 않은 동료의 카드는 전투 덱에서 빠진다.`
          : '하운은 항상 출전합니다. 출전하지 않은 동료의 카드는 전투 덱에서 빠집니다.',
    ),
  );

  // 창 높이를 꽉 채운다: 위 여정 띠 → 아래 왼쪽 가로 두루마리(남은 자리 전부) + 오른쪽 좁은 칸
  const journeyWrap = h('div', { class: 'journey-wrap' }, run.abyss ? depthBand(data, run) : journeyBand(data, run, { onStage: run.replayOf ? handlers.onSwitchStage : undefined }));
  // 두루마리 축(ui_scroll_rod, Codex 그림 3조각: 위 끝 · 가운데(늘림) · 아래 끝). 그림이 오기 전에는 CSS 축
  const rodUrls = [1, 2, 3].map((n) => frameUrl('ui_scroll_rod', n, { realOnly: true }));
  const rods = rodUrls.every(Boolean)
    ? (['left', 'right'] as const).map((side) =>
        h('div', { class: `scroll-rod ${side}`, 'aria-hidden': 'true' }, ...rodUrls.map((u, i) => h('i', { class: ['top', 'mid', 'bot'][i], style: `background-image:url("${u}")` }))),
      )
    : [];
  const scrollWrap = h('div', { class: 'scroll-wrap' }, h(
      'div',
      { class: `scroll${art(stage.mapArt) ? ' has-art' : ''}${rods.length ? ' has-rod' : ''}`, style: art(stage.mapArt) },
      ...rods,
      // 종이 결(ui_parchment): 지역 지도 위에 곱하기로 겹쳐 두루마리 종이 느낌을 낸다(그림이 들어오면)
      art('ui_parchment') ? h('div', { class: 'scroll-paper', style: art('ui_parchment') }) : null,
      svg,
      nodes,
      hereMark,
    ));
  scrollToHere(journeyWrap, '.stop.here');
  scrollToHere(scrollWrap, '.here-mark');
  return h(
    'section',
    { class: 'screen map-screen' },
    h('div', { class: 'journey-area' }, journeyWrap, run.abyss ? null : journeyBanner(data, run)),
    h(
      'div',
      { class: 'local' },
      scrollWrap,
      h(
        'aside',
        { class: 'side-panel' },
        h(
          'div',
          { class: 'box stage-box' },
          h('h2', {}, placeName(stage, run)),
          run.replayOf || run.difficulty === 'hard' || run.hardcore
            ? h(
                'div',
                { class: 'mode-badges' },
                run.replayOf ? h('span', { class: 'mode-badge replay', ...tipAttrs('순례', '클리어한 일행으로 이 스테이지를 다시 걷는다. 보스를 넘기면 이 길에서 얻은 카드·강화·유물·물약·골드가 남는다. 지거나 길을 버리면 사라진다.') }, '순례') : null,
                run.difficulty === 'hard' ? h('span', { class: 'mode-badge hard' }, '어려움') : null,
                run.hardcore ? h('span', { class: 'mode-badge hardcore', ...tipAttrs('하드코어', `쓰러진 동료는 돌아오지 않는다.${run.fallen.length ? `\n잃은 동료: ${run.fallen.map((id) => data.characters.get(id)?.name ?? id).join(', ')}` : ''}`) }, '하드코어') : null,
              )
            : null,
          run.replayOf ? pilgrimChallenges(data, run) : null,
          run.replayOf ? h('p', { class: 'pilgrim-scale', ...tipAttrs('일행 보정', '클리어한 일행이 강한 만큼 적도 강해진다: 하운 레벨이 이 스테이지 기준보다 높은 만큼, 가진 유물(등급이 높을수록 더 — 일반 0.5% · 고급 0.7% · 희귀 1% · 영웅 1.5% · 전설 2%), 출발 편성의 평균 강화 단계만큼(상한 있음 — 많이 모을수록 순례는 쉬워진다). 출발할 때 정해져 이 길 동안 그대로다.') }, pilgrimLabel(data, run)) : null,
          h('p', { class: 'stage-summary' }, run.abyss ? abyssTeaser(data, run) : (stage.teaser ?? '')),
          run.abyss?.laws?.length
            ? h(
                'div',
                { class: 'law-badges' },
                run.abyss.laws.map((id) => data.laws.get(id)).filter(Boolean).map((l) => h('span', { class: 'law-badge', ...tipAttrs(`굽이의 법칙 — ${l!.name}`, l!.description, 'rift') }, lawIconEl(l!), l!.name)),
              )
            : null,
          h(
            'div',
            { class: 'stage-stats' },
            h('span', tipAttrs('마나', '런 전체에서 이어지는 마나. 세계마다 차는 양이 다르다.', 'mana'), h('b', {}, `${run.mana}/${data.balance.mana.max}`), '마나'),
            h('span', tipAttrs('상흔', scarTip(data), 'rift'), h('b', {}, run.scar), '상흔'),
            h('span', {}, h('b', {}, run.deck.length), '덱'),
          ),
          // 상흔이 남은 만큼 다음 싸움은 금이 간 채 시작한다(GAME_DESIGN 7절)
          startRiftLine(data, run.scar, stageWorld(data, run)),
        ),
        inventoryBox(data, run.gold, run.potions, run.relics),
        partyBox,
        h('div', { class: 'box legend' }, [...Object.entries(NODE_LABEL).map(([k, v]) => [k, NODE_GLYPH[k], v] as const), ...Object.entries(LEGEND_EXTRA).map(([k, [g, v]]) => [k, g, v] as const)].map(([k, g, v]) => h('span', {}, h('b', { class: `node node-${k} mini` }, nodeMark(k, g)), v))),
        h(
          'div',
          { class: 'map-actions' },
          // 보유 카드 · 전체 지도는 한 줄씩, 옷장 · 도감과 설정 · 타이틀로는 반 줄씩(옷장이 없으면 도감이 한 줄)
          h('button', { class: 'btn btn-primary wide', onclick: handlers.onShowDeck }, run.abyss ? `덱 (${run.deck.length})` : `보유 카드 (${run.deck.length})`),
          handlers.onWorldMap
            ? h('button', { class: 'btn wide btn-world', onclick: handlers.onWorldMap, ...tipAttrs('전체 지도', '이 스테이지는 지금 자리에 멈춰 두고 전체 지도로 나간다. 다시 누르면 여기서 이어진다.') }, '전체 지도로')
            : null,
          handlers.onWardrobe ? h('button', { class: 'btn', onclick: handlers.onWardrobe }, '옷장') : null,
          h('button', { class: handlers.onWardrobe ? 'btn' : 'btn wide', onclick: handlers.onCodex }, '도감'),
          h('button', { class: 'btn', onclick: handlers.onSettings }, '설정'),
          h('button', { class: 'btn', title: '런은 저장됩니다. 타이틀에서 이어하거나 새로 시작할 수 있습니다.', onclick: handlers.onTitle }, '타이틀로'),
        ),
        h('p', { class: 'seed hint' }, `시드 ${run.seed}`),
      ),
    ),
  );
}

/** 순례 일행 보정 한 줄(지도 오른쪽 칸·전투 시작 띠): "순례 — 적 체력 ×2.2 · 피해 ×1.8 (레벨 +8 · 유물 24(영웅 4 · 전설 2) · 강화 +1.5)" */
export function pilgrimLabel(data: GameData, run: RunState): string {
  const k = pilgrimScale(data, run);
  const x = (n: number) => `×${Number(n.toFixed(2))}`;
  const n1 = (n: number) => Number(n.toFixed(1));
  const tiers = [k.epic ? `영웅 ${k.epic}` : '', k.legendary ? `전설 ${k.legendary}` : ''].filter(Boolean).join(' · ');
  return `순례 — 적 체력 ${x(k.hp)} · 피해 ${x(k.dmg)} (레벨 +${n1(k.level)} · 유물 ${k.relics}${tiers ? `(${tiers})` : ''} · 강화 +${n1(k.upgrade)})`;
}

const CH_STATE: Record<string, [string, string]> = {
  done: ['✓', '이미 이룸'],
  ok: ['○', '지키는 중'],
  broken: ['✕', '이번 길에서는 깨짐'],
  open: ['◇', '보스전에서 판정'],
};

/** 다시 걷는 스테이지의 도전 3개와 이번 길의 상태(지도 오른쪽 칸). 동료·덱 조건은 지금 출전·덱으로 미리 본다 */
function pilgrimChallenges(data: GameData, run: RunState): HTMLElement | null {
  const list = stageChallenges(data, run.stageId);
  if (!list.length) return null;
  return h(
    'ul',
    { class: 'pilgrim-challenges' },
    list.map((c) => {
      const state = challengeState(data, run, c);
      const [mark, label] = CH_STATE[state];
      return h('li', { class: `ch-${state}`, ...tipAttrs(`도전 — ${c.name}`, `${c.description}\n${label}`) }, h('b', {}, mark), h('span', {}, c.name));
    }),
  );
}

/** 세계별 시작 균열 상한 문구: 가장 흔한 값은 '최대 N', 다른 세계만 따로(예: 최대 4 · 틈 2) */
export function startRiftMaxText(data: GameData): string {
  const max = data.balance.rift.scar.startRiftMax;
  const count = new Map<number, number>();
  for (const v of Object.values(max)) count.set(v, (count.get(v) ?? 0) + 1);
  const common = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
  const odd = Object.entries(max).filter(([, v]) => v !== common);
  return [`최대 ${common}`, ...odd.map(([w, v]) => `${WORLD_NAME[w as keyof typeof WORLD_NAME] ?? w} ${v}`)].join(' · ');
}

/** 상흔 주석: 두 단계(GAME_DESIGN 7절) */
function scarTip(data: GameData): string {
  const sc = data.balance.rift.scar;
  const crackAt = data.balance.rift.map.scarCrackAt;
  return (
    `균열이 남긴 흔적. 상흔 ${sc.startRiftPer}마다 전투 시작 균열 +1(${startRiftMaxText(data)}).\n상흔 ${sc.restAt} 이상이면 휴식 회복 -${Math.round((1 - sc.restHealMul) * 100)}%.` +
    `\n상흔 ${sc.shopAt} 이상이면 상점 값 +${Math.round((sc.shopPriceMul - 1) * 100)}%, 대신 균열 감소 카드가 반드시 나오고 꿰매기(-${sc.shopStitch}, ${sc.shopStitchGold}금)를 판다.` +
    (crackAt !== undefined ? `\n상흔 ${crackAt} 이상으로 새 지도에 들어서면 지도가 한 번 갈라진다(裂 틈새 하나).` : '') +
    `\n휴식의 꿰매기(상흔 -${sc.stitch}), 폭주 없이 보스를 넘기면(상흔 -${sc.bossCleanBonus}) 아문다.`
  );
}

/** 지금 상흔으로 걸린 효과 배지(2026-10-12 A5): 휴식 'rest' → "상흔 N · 회복 -20%", 상점 'shop' → "상흔 N · 값 +20%". 조건 미달이면 null */
export function scarBadge(data: GameData, scar: number, where: 'rest' | 'shop'): HTMLElement | null {
  const sc = data.balance.rift.scar;
  if (where === 'rest' && scar >= sc.restAt)
    return h('span', { class: 'scar-badge', ...tipAttrs('상흔', scarTip(data), 'rift') }, `상흔 ${scar} · 회복 -${Math.round((1 - sc.restHealMul) * 100)}%`);
  if (where === 'shop' && scar >= sc.shopAt)
    return h('span', { class: 'scar-badge', ...tipAttrs('상흔', scarTip(data), 'rift') }, `상흔 ${scar} · 값 +${Math.round((sc.shopPriceMul - 1) * 100)}%`);
  return null;
}

/** 다음 전투 시작 균열 줄(0이면 감춘다) */
function startRiftLine(data: GameData, scar: number, world: string): HTMLElement | null {
  const n = scarStartRift(data, scar, world);
  return n > 0 ? h('p', { class: 'start-rift', ...tipAttrs('금이 간 채 시작한다', scarTip(data), 'rift') }, `다음 전투 시작 균열 ${n}`) : null;
}

// 지도 화면(GAME_DESIGN 13절): 위 = 두 세계를 잇는 여정 띠, 아래 = 지금 스테이지의 두루마리 지역 지도 + 편성·요약.
import type { GameData } from '../engine/data';
import { findNode, type MapNode } from '../engine/route';
import { availableNodes, playableStages, setParty, xpToNext, type RunState } from '../engine/run';
import { frameUrl } from '../render/assets';
import { h } from './dom';
import { isDebug } from './debug';
import { runTour, type TourStep } from './tour';
import { installTooltips, tipAttrs } from './tooltip';
import { inventoryBox } from './items';

/** 노드 표식: 두루마리 위의 한자 */
const NODE_GLYPH: Record<string, string> = { story: '史', battle: '戰', elite: '精', event: '事', rest: '休', inn: '宿', shop: '市', boss: '王' };
const NODE_LABEL: Record<string, string> = { story: '이야기', battle: '전투', elite: '엘리트', event: '사건', rest: '휴식', inn: '여관', shop: '상점', boss: '보스' };

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
  /** 타이틀로(런은 저장돼 있어 "이어하기"로 돌아온다) */
  onTitle: () => void;
  /** 출전 칸을 반짝여 눈에 띄게(동료가 막 합류했을 때) */
  highlightParty?: boolean;
}

/**
 * 출전 편성 안내(동료가 처음 합류했을 때·자리가 가득 찼을 때 한 번씩, 그 뒤엔 출전 칸의 버튼으로).
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
  const j = stage.journey;
  if (!j) return stage.name;
  return j.unknownLabel && j.knownFlag && !run.flags.includes(j.knownFlag) ? j.unknownLabel : j.label;
}

/** 위: 여정 띠. 지나온 곳과 지금만 보이고, 들어서 보지 않은 지역은 안개, 틈은 '하늘의 금' 사건 뒤에 나타난다 */
function journeyBand(data: GameData, run: RunState): HTMLElement {
  const stages = playableStages(data).filter((st) => st.journey);
  const cur = data.stages.find((s) => s.id === run.stageId)!;
  const reached = stages.filter((st) => st.order <= cur.order);
  const rift = run.flags.includes(RIFT_FLAG);
  const atStart = run.visited.length === 0;
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
      return h('div', { class: `stop ${here ? 'here' : 'done'}`, style: `left:${j.x}%;top:${j.y}%`, ...tipAttrs(placeName(st, run), here ? '지금 여기' : '지나온 곳') }, h('i', {}), placeName(st, run));
    })
    .concat(
      // 틈의 심장: '하늘의 금' 뒤부터 사건 표시로(아직 들어서지 않았을 때)
      stages
        .filter((st) => st.journey!.region === 'rift' && rift && st.order > cur.order)
        .map((st) =>
          h('div', { class: 'stop event', style: `left:${st.journey!.x}%;top:${st.journey!.y}%`, ...tipAttrs('하늘의 금', '두 세계 사이에 생긴 금. 그 너머는 아무도 모른다.') }, h('i', {}), '?'),
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
  return h(
    'div',
    { class: `journey${bandArt ? ' has-art' : tiles?.some(Boolean) ? ' has-tiles' : ''}`, style: bandArt },
    tiles,
    crack,
    regionParts.map((p) => p.fog),
    regionParts.map((p) => p.tag),
    rift ? h('span', { class: 'tag tag-c' }, '하늘의 금') : null,
    elheimOpen ? h('span', { class: 'gate', style: `left:${GATE.x}%;top:${GATE.y}%`, ...tipAttrs('귀곡애 석문', '두 세계를 잇는 단 하나의 문') }, '귀곡애 석문') : null,
    stops,
  );
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

  const nodes = floors.flat().map((n) => {
    const p = pos(n);
    const mod = data.modules.get(n.moduleId);
    const visited = run.visited.includes(n.id);
    const open = avail.has(n.id);
    // 들어가 본 노드만 이름이 보인다(보스 이름·이야기 제목은 가서 안다, GAME_DESIGN 14절)
    const known = visited;
    return h(
      'button',
      {
        class: `node node-${n.type}${visited ? ' done' : ''}${open ? ' open' : ''}${run.position === n.id ? ' here' : ''}`,
        style: `left:${p.x}%;top:${p.y}%;--tilt:${(wobble(n.id, 3) * 5).toFixed(1)}deg`,
        disabled: !open,
        'aria-label': `${n.floor}층 ${NODE_LABEL[n.type]}`,
        onclick: () => handlers.onEnter(n),
        ...tipAttrs(`${n.floor}층 · ${NODE_LABEL[n.type]}`, [known ? mod?.name ?? '' : '', open ? '갈 수 있다' : visited ? '지나온 곳' : ''].filter(Boolean).join('\n')),
      },
      h('span', { class: 'node-glyph' }, NODE_GLYPH[n.type]),
    );
  });

  // 지금 위치: 작은 하운
  const here = run.position ? findNode(run.map, run.position) : null;
  const hp = here ? pos(here) : start;
  const mark = frameUrl('haun_idle', 1);
  const hereMark = mark ? h('img', { class: 'here-mark', src: mark, alt: '지금 위치', style: `left:${hp.x}%;top:${hp.y}%` }) : null;

  // 파티 편성(하운 고정, 최대 3명)
  const fighters = run.roster.filter((r) => data.characters.get(r.id)?.role === 'fighter');
  const full = run.selected.length >= data.balance.party.max;
  const partyBox = h(
    'div',
    { class: `box party-box${handlers.highlightParty ? ' guide-pulse' : ''}` },
    h('h3', {}, `출전 (${run.selected.length}/${data.balance.party.max})`),
    fighters.map((r) => {
      const def = data.characters.get(r.id)!;
      const checked = run.selected.includes(r.id);
      const noCards = def.starterDeck.length === 0;
      return h(
        'label',
        { class: `member${checked ? ' on' : ''}`, 'data-member': r.id, style: `--owner:${def.color}`, title: def.description },
        h('input', {
          type: 'checkbox',
          checked,
          // 자리가 가득 차면 쉬는 동료는 먼저 한 명을 빼야 고를 수 있다
          disabled: r.id === 'haun' || (!checked && full),
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
        r.id === 'haun' ? h('span', { class: 'member-tag' }, '고정') : checked ? null : h('span', { class: 'member-tag rest' }, '쉼'),
        h('span', { class: 'member-lv', title: xpToNext(data, r.level) === null ? '최대 레벨' : `경험치 ${r.xp} / ${xpToNext(data, r.level)}` }, `Lv ${r.level}`),
        h('span', { class: 'member-hp' }, `${r.hp} / ${r.maxHp}`),
        h('i', { class: 'member-xp', style: `width:${xpToNext(data, r.level) === null ? 100 : Math.round((r.xp / xpToNext(data, r.level)!) * 100)}%` }),
        noCards ? h('span', { class: 'member-note' }, '카드 미구현') : null,
      );
    }),
    h(
      'p',
      { class: 'hint' },
      fighters.length > data.balance.party.max && full
        ? `자리가 가득 찼습니다(최대 ${data.balance.party.max}명). 쉬는 동료를 넣으려면 먼저 출전 중인 동료 한 명의 체크를 푸세요.`
        : '하운은 항상 출전합니다. 출전하지 않은 동료의 카드는 전투 덱에서 빠집니다.',
    ),
    fighters.length > 1 ? h('button', { class: 'btn btn-small guide-link', onclick: () => openPartyGuide(data, run) }, '출전 편성 안내') : null,
  );

  // S3 폐사찰 재회에서 합류하면 지원은 늘 켜져 있다. 그 전에는 ?debug에서만 토글(합류 전 이름이 드러나지 않게)
  const wangJoined = run.flags.includes('support:wang');
  const support = wangJoined
    ? h('p', { class: 'support-toggle joined', title: data.characters.get('wang')?.description }, '왕일검 — 청운호흡으로 일행을 돕는다')
    : isDebug()
      ? h(
          'label',
          { class: 'support-toggle', title: '원래 S3(혈로)에서 합류합니다.' },
          h('input', { type: 'checkbox', checked: run.supportActive, onchange: (e: Event) => handlers.onToggleSupport((e.target as HTMLInputElement).checked) }),
          ' 왕일검 지원(디버그)',
        )
      : null;

  // 창 높이를 꽉 채운다: 위 여정 띠 → 아래 왼쪽 가로 두루마리(남은 자리 전부) + 오른쪽 좁은 칸
  const journeyWrap = h('div', { class: 'journey-wrap' }, journeyBand(data, run));
  const scrollWrap = h('div', { class: 'scroll-wrap' }, h('div', { class: `scroll${art(stage.mapArt) ? ' has-art' : ''}`, style: art(stage.mapArt) }, svg, nodes, hereMark));
  scrollToHere(journeyWrap, '.stop.here');
  scrollToHere(scrollWrap, '.here-mark');
  return h(
    'section',
    { class: 'screen map-screen' },
    h('div', { class: 'journey-area' }, journeyWrap, journeyBanner(data, run)),
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
          h('p', { class: 'stage-summary' }, stage.teaser ?? ''),
          h(
            'div',
            { class: 'stage-stats' },
            h('span', tipAttrs('마나', '런 전체에서 이어지는 마나. 세계마다 차는 양이 다르다.', 'mana'), h('b', {}, `${run.mana}/${data.balance.mana.max}`), '마나'),
            h('span', tipAttrs('상흔', '균열이 남긴 흔적.', 'rift'), h('b', {}, run.scar), '상흔'),
            h('span', {}, h('b', {}, run.deck.length), '덱'),
          ),
        ),
        inventoryBox(data, run.gold, run.potions, run.relics),
        partyBox,
        support,
        h('div', { class: 'box legend' }, Object.entries(NODE_LABEL).map(([k, v]) => h('span', {}, h('b', { class: `node node-${k} mini` }, h('span', { class: 'node-glyph' }, NODE_GLYPH[k])), v))),
        h(
          'div',
          { class: 'map-actions' },
          h('button', { class: 'btn btn-primary', onclick: handlers.onShowDeck }, `덱 보기 (${run.deck.length})`),
          h('button', { class: 'btn', onclick: handlers.onSettings }, '설정'),
          h('button', { class: 'btn', title: '런은 저장됩니다. 타이틀에서 이어하거나 새로 시작할 수 있습니다.', onclick: handlers.onTitle }, '타이틀로'),
        ),
        h('p', { class: 'seed hint' }, `시드 ${run.seed}`),
      ),
    ),
  );
}

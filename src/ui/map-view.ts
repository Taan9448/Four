// 지도 화면(GAME_DESIGN 13절): 위 = 두 세계를 잇는 여정 띠, 아래 = 지금 스테이지의 두루마리 지역 지도 + 편성·요약.
import type { GameData } from '../engine/data';
import { findNode, type MapNode } from '../engine/route';
import { availableNodes, playableStages, setParty, type RunState } from '../engine/run';
import { frameUrl } from '../render/assets';
import { h } from './dom';
import { installTooltips, tipAttrs } from './tooltip';

/** 노드 표식: 두루마리 위의 한자 */
const NODE_GLYPH: Record<string, string> = { story: '史', battle: '戰', elite: '精', event: '事', rest: '休', inn: '宿', boss: '王' };
const NODE_LABEL: Record<string, string> = { story: '이야기', battle: '전투', elite: '엘리트', event: '사건', rest: '휴식', inn: '여관', boss: '보스' };

/** 세계의 틈이 나타나는 사건: S3 보스를 넘은 밤의 '하늘의 금' */
const RIFT_FLAG = 'sky_crack';
/** 틈이 처음 나타나는 스테이지(이 스테이지 출발 지도에서 알림 띠와 함께 그어진다) */
const RIFT_REVEAL_STAGE = 's4';
/** 귀곡애 석문(두 세계의 유일한 통로) 자리 — journey_band 그림의 가운데 아래 */
const GATE = { x: 47, y: 76 };

export interface MapViewHandlers {
  onEnter: (node: MapNode) => void;
  onToggleSupport: (on: boolean) => void;
  /** 편성이 바뀌어 다시 그려야 할 때 */
  onRefresh: () => void;
  onShowDeck: () => void;
  onSettings: () => void;
  /** 타이틀로(런은 저장돼 있어 "이어하기"로 돌아온다) */
  onTitle: () => void;
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

/** 위: 여정 띠. 지나온 곳·지금·다음 목적지만 보이고, 틈은 '하늘의 금' 사건 뒤에 나타난다 */
function journeyBand(data: GameData, run: RunState): HTMLElement {
  const stages = playableStages(data);
  const cur = data.stages.find((s) => s.id === run.stageId)!;
  const rift = run.flags.includes(RIFT_FLAG);
  const reveal = rift && run.stageId === RIFT_REVEAL_STAGE && run.visited.length === 0;
  const NS = 'http://www.w3.org/2000/svg';
  const crack = document.createElementNS(NS, 'svg');
  crack.setAttribute('class', `journey-crack${reveal ? ' reveal' : ''}`);
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
  const stops = stages
    .filter((st) => st.journey)
    .map((st) => {
      const j = st.journey!;
      const isRift = st.world === 'rift';
      let state: string | null = null;
      let label = j.label;
      if (st.order < cur.order) state = 'done';
      else if (st.id === cur.id) state = 'here';
      else if (isRift && rift) {
        state = 'event';
        label = `${j.label} ?`;
      } else if (st.order === cur.order + 1 && !isRift) state = 'next';
      if (!state) return null;
      const tip = state === 'done' ? '지나온 곳' : state === 'here' ? `지금 — ${st.chapters}` : state === 'event' ? '하늘의 금 너머. 아직 아무도 가 본 적 없다.' : '다음 목적지';
      return h('div', { class: `stop ${state}`, style: `left:${j.x}%;top:${j.y}%`, ...tipAttrs(st.name, tip) }, h('i', {}), label);
    });
  return h(
    'div',
    { class: `journey${art('journey_band') ? ' has-art' : ''}`, 'data-phase': rift ? 'after' : 'before', style: art('journey_band') },
    crack,
    h('span', { class: 'tag tag-l' }, '武林 · 무림'),
    h('span', { class: 'tag tag-r' }, '엘하임 · Elheim'),
    rift ? h('span', { class: 'tag tag-c' }, '세계의 틈') : null,
    h('span', { class: 'gate', style: `left:${GATE.x}%;top:${GATE.y}%`, ...tipAttrs('귀곡애 석문', '두 세계를 잇는 단 하나의 문') }, '귀곡애 석문'),
    stops,
    reveal ? h('div', { class: 'banner' }, '하늘이 갈라졌다 — 두 세계 사이에 금이 생겼다') : null,
  );
}

export function mapView(data: GameData, run: RunState, handlers: MapViewHandlers): HTMLElement {
  installTooltips();
  const stage = data.stages.find((s) => s.id === run.stageId)!;
  const avail = new Set(availableNodes(run).map((n) => n.id));
  const floors = run.map.floors;
  // 두루마리(세로 2:3) 위의 자리(%): 아래 = 1층, 위 = 마지막 층(보스)
  const span = floors.length > 1 ? 82 / (floors.length - 1) : 0;
  const pos = (n: MapNode) => {
    const count = floors[n.floor - 1].length;
    const boss = n.type === 'boss';
    return {
      x: 12 + (76 / (count + 1)) * (n.index + 1) + (boss ? 0 : wobble(n.id, 1) * 4),
      y: 91 - (n.floor - 1) * span + (boss ? 0 : wobble(n.id, 2) * Math.min(2, span * 0.18)),
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
  // 출발점 → 1층
  const start = { x: 50, y: 98 };
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
    const known = visited || n.type === 'story' || n.type === 'boss';
    return h(
      'button',
      {
        class: `node node-${n.type}${visited ? ' done' : ''}${open ? ' open' : ''}${run.position === n.id ? ' here' : ''}`,
        style: `left:${p.x}%;top:${p.y}%`,
        disabled: !open,
        'aria-label': `${n.floor}층 ${NODE_LABEL[n.type]}`,
        onclick: () => handlers.onEnter(n),
        ...tipAttrs(`${n.floor}층 · ${NODE_LABEL[n.type]}`, [known ? mod?.name ?? '' : '', open ? '갈 수 있다' : visited ? '지나온 곳' : ''].filter(Boolean).join('\n')),
      },
      NODE_GLYPH[n.type],
    );
  });

  // 지금 위치: 작은 하운
  const here = run.position ? findNode(run.map, run.position) : null;
  const hp = here ? pos(here) : start;
  const mark = frameUrl('haun_idle', 1);
  const hereMark = mark ? h('img', { class: 'here-mark', src: mark, alt: '지금 위치', style: `left:${hp.x}%;top:${hp.y}%` }) : null;

  // 파티 편성(하운 고정, 최대 3명)
  const fighters = run.roster.filter((r) => data.characters.get(r.id)?.role === 'fighter');
  const partyBox = h(
    'div',
    { class: 'box party-box' },
    h('h3', {}, `출전 (${run.selected.length}/${data.balance.party.max})`),
    fighters.map((r) => {
      const def = data.characters.get(r.id)!;
      const checked = run.selected.includes(r.id);
      const noCards = def.starterDeck.length === 0;
      return h(
        'label',
        { class: `member${checked ? ' on' : ''}`, style: `--owner:${def.color}`, title: def.description },
        h('input', {
          type: 'checkbox',
          checked,
          disabled: r.id === 'haun',
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
        h('span', { class: 'member-hp' }, `${r.hp} / ${r.maxHp}`),
        noCards ? h('span', { class: 'member-note' }, '카드 미구현') : null,
      );
    }),
    h('p', { class: 'hint' }, '하운은 항상 출전합니다. 출전하지 않은 동료의 카드는 전투 덱에서 빠집니다.'),
  );

  // S3 폐사찰 재회에서 합류하면 지원은 늘 켜져 있다. 그 전에는 디버그 토글
  const wangJoined = run.flags.includes('support:wang');
  const support = wangJoined
    ? h('p', { class: 'support-toggle joined', title: data.characters.get('wang')?.description }, '왕일검 — 청운호흡으로 일행을 돕는다')
    : h(
        'label',
        { class: 'support-toggle', title: '원래 S3(혈로)에서 합류합니다. 그 전에는 디버그로 켤 수 있습니다.' },
        h('input', { type: 'checkbox', checked: run.supportActive, onchange: (e: Event) => handlers.onToggleSupport((e.target as HTMLInputElement).checked) }),
        ' 왕일검 지원(디버그)',
      );

  return h(
    'section',
    { class: 'screen map-screen' },
    journeyBand(data, run),
    h(
      'div',
      { class: 'local' },
      h('div', { class: `scroll${art(stage.mapArt) ? ' has-art' : ''}`, style: art(stage.mapArt) }, svg, nodes, hereMark),
      h(
        'aside',
        { class: 'side-panel' },
        h(
          'div',
          { class: 'box stage-box' },
          h('h2', {}, stage.name),
          h('div', { class: 'stage-meta' }, `${stage.chapters} · 마나 ${run.mana}/${data.balance.mana.max} · 상흔 ${run.scar} · 덱 ${run.deck.length}장`),
          h('p', { class: 'stage-summary' }, stage.summary),
        ),
        partyBox,
        support,
        h('div', { class: 'box legend' }, Object.entries(NODE_LABEL).map(([k, v]) => h('span', {}, h('b', {}, NODE_GLYPH[k]), v))),
        h(
          'div',
          { class: 'map-actions' },
          h('button', { class: 'btn', onclick: handlers.onShowDeck }, `덱 보기 (${run.deck.length})`),
          h('button', { class: 'btn', onclick: handlers.onSettings }, '설정'),
          h('button', { class: 'btn', title: '런은 저장됩니다. 타이틀에서 이어하거나 새로 시작할 수 있습니다.', onclick: handlers.onTitle }, '타이틀로'),
        ),
        h('p', { class: 'seed hint' }, `시드 ${run.seed}`),
      ),
    ),
  );
}

// 스테이지 지도 + 파티 편성.
import type { GameData } from '../engine/data';
import { findNode, type MapNode } from '../engine/route';
import { availableNodes, setParty, type RunState } from '../engine/run';
import { h } from './dom';

const NODE_ICON: Record<string, string> = {
  battle: '⚔',
  elite: '💀',
  event: '?',
  rest: '🔥',
  inn: '🏮',
  story: '★',
  boss: '👑',
};
const NODE_LABEL: Record<string, string> = {
  battle: '전투',
  elite: '엘리트',
  event: '이벤트',
  rest: '휴식',
  inn: '여관',
  story: '스토리',
  boss: '보스',
};

export interface MapViewHandlers {
  onEnter: (node: MapNode) => void;
  onToggleSupport: (on: boolean) => void;
  /** 편성이 바뀌어 다시 그려야 할 때 */
  onRefresh: () => void;
  onRestart: () => void;
}

export function mapView(data: GameData, run: RunState, handlers: MapViewHandlers): HTMLElement {
  const stage = data.stages.find((s) => s.id === run.stageId)!;
  const avail = new Set(availableNodes(run).map((n) => n.id));
  const floors = run.map.floors;
  const W = 560;
  const rowH = 70;
  const H = floors.length * rowH + 40;
  const pos = (n: MapNode) => {
    const count = floors[n.floor - 1].length;
    return { x: (W / (count + 1)) * (n.index + 1), y: H - 30 - (n.floor - 1) * rowH };
  };

  // 연결선(SVG) + 노드(버튼)
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
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
        line.setAttribute('class', walked ? 'walked' : avail.has(m.id) && (run.position === n.id) ? 'open' : '');
        svg.appendChild(line);
      }
    }
  }
  const nodes = floors.flat().map((n) => {
    const p = pos(n);
    const mod = data.modules.get(n.moduleId);
    const visited = run.visited.includes(n.id);
    const open = avail.has(n.id);
    return h(
      'button',
      {
        class: `map-node node-${n.type}${visited ? ' visited' : ''}${open ? ' open' : ''}${run.position === n.id ? ' here' : ''}`,
        style: `left:${(p.x / W) * 100}%;top:${(p.y / H) * 100}%`,
        title: `${n.floor}층 · ${NODE_LABEL[n.type]}${visited || n.type === 'story' || n.type === 'boss' ? ` — ${mod?.name ?? ''}` : ''}`,
        disabled: !open,
        onclick: () => handlers.onEnter(n),
      },
      NODE_ICON[n.type],
    );
  });

  // 파티 편성(하운 고정, 최대 3명)
  const fighters = run.roster.filter((r) => data.characters.get(r.id)?.role === 'fighter');
  const partyBox = h(
    'div',
    { class: 'party-box' },
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
        h('span', { class: 'member-hp' }, `${r.hp}/${r.maxHp}`),
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

  const deckCounts = new Map<string, number>();
  for (const c of run.deck) {
    const key = `${data.cards.get(c.cardId)!.name}${c.level ? ` +${c.level}` : ''}`;
    deckCounts.set(key, (deckCounts.get(key) ?? 0) + 1);
  }

  return h(
    'section',
    { class: 'screen map-screen' },
    h(
      'header',
      { class: 'topbar' },
      h('div', { class: 'title' }, `${stage.name}`),
      h('div', { class: 'sub' }, `${stage.chapters} · 마나 ${run.mana}/${data.balance.mana.max} · 상흔 ${run.scar}`),
      h('div', { class: 'seed' }, `시드 ${run.seed}`),
    ),
    h(
      'div',
      { class: 'map-layout' },
      h('div', { class: 'map-wrap', style: `aspect-ratio:${W}/${H}` }, svg, nodes),
      h(
        'aside',
        { class: 'map-side' },
        h('p', { class: 'stage-summary' }, stage.summary),
        partyBox,
        support,
        h('details', { class: 'deck-box' }, h('summary', {}, `덱 ${run.deck.length}장`), h('ul', {}, [...deckCounts].map(([k, n]) => h('li', {}, `${k} ×${n}`)))),
        h('div', { class: 'legend' }, Object.entries(NODE_LABEL).map(([k, v]) => h('span', {}, `${NODE_ICON[k]} ${v}`))),
        h('button', { class: 'btn', onclick: handlers.onRestart }, '새 런'),
      ),
    ),
  );
}

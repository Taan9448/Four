// 스테이지 지도 생성기. 원작 순서의 고정 노드(스토리·보스)는 그대로 두고,
// 그 사이의 경로와 노드 내용(모듈)을 시드 RNG로 무작위 구성한다.
import type { GameData } from './data';
import type { ModuleDef, NodeType, StageDef } from './schema';
import type { Rng } from './rng';

export interface MapNode {
  id: string;
  floor: number;
  index: number;
  type: NodeType;
  moduleId: string;
  next: string[];
}

export interface StageMap {
  stageId: string;
  /** floors[0]이 1층. 마지막 층은 보스 */
  floors: MapNode[][];
}

export interface RouteContext {
  scar: number;
  flags: string[];
  /** 이미 합류한 동료 id */
  roster: string[];
  /** 런에서 이미 쓴 once 모듈 */
  usedModules: string[];
}

const nodeId = (floor: number, index: number) => `f${floor}n${index}`;

/**
 * 전투가 없는 노드(사건·휴식·여관·이야기). 이런 노드가 길게 이어지면 그냥 넘어가는 구간이 된다(2026-10-08 S3·S4 리뷰).
 * 고정 이야기 노드도 센다(원작 장면이 몰린 곳은 고정 노드끼리라 검사에서 뺀다)
 */
export const isCalm = (type: NodeType) => type !== 'battle' && type !== 'elite' && type !== 'boss';

/** 고정 스토리 노드가 그 층 이전에 줄 플래그·합류 동료(조건 판정용) */
function expectedFromPinned(data: GameData, stage: StageDef, beforeFloor: number) {
  const flags = new Set<string>();
  const joins = new Set<string>();
  for (const pin of stage.pinned) {
    if (pin.floor >= beforeFloor) continue;
    const mod = data.modules.get(pin.module);
    for (const choice of mod?.content.choices ?? []) {
      for (const e of choice.effects) {
        if (e.op === 'set_flag' && e.flag) flags.add(e.flag);
        if (e.op === 'join_party' && e.member) joins.add(e.member);
      }
    }
  }
  return { flags, joins };
}

function moduleEligible(
  data: GameData,
  stage: StageDef,
  mod: ModuleDef,
  floor: number,
  ctx: RouteContext,
  used: Set<string>,
): boolean {
  if (mod.stage !== stage.id && !(mod.stage === '*' && stage.templateEvents)) return false;
  if ((mod.once || mod.stage === '*') && used.has(mod.id)) return false;
  const c = mod.conditions;
  if (c.floorRange && (floor < c.floorRange[0] || floor > c.floorRange[1])) return false;
  if (c.scarMin !== undefined && ctx.scar < c.scarMin) return false;
  if (c.flag !== undefined || c.partyHas !== undefined) {
    const exp = expectedFromPinned(data, stage, floor);
    if (c.flag !== undefined && !ctx.flags.includes(c.flag) && !exp.flags.has(c.flag)) return false;
    if (c.partyHas !== undefined && !ctx.roster.includes(c.partyHas) && !exp.joins.has(c.partyHas)) return false;
  }
  return true;
}

/** 심연(GAME_DESIGN 16절): 스테이지 정의를 바꿔 끼우고(층수·보스·비율), 모듈 자격을 따로 판정한다 */
export interface MapOverride {
  stage: StageDef;
  eligible: (mod: ModuleDef, floor: number, used: Set<string>) => boolean;
  /** 상흔 1마다 scar 모듈 가중(생략하면 balance.route.scarWeightPerPoint) */
  scarWeight?: number;
}

export function generateStageMap(data: GameData, stageId: string, rng: Rng, ctx: RouteContext, override?: MapOverride): StageMap {
  const stage = override?.stage ?? data.stages.find((s) => s.id === stageId);
  if (!stage) throw new Error(`알 수 없는 스테이지: ${stageId}`);
  if (!stage.boss) throw new Error(`스테이지 ${stageId}에 보스 모듈이 없다`);
  const route = data.balance.route;
  const pinnedByFloor = new Map(stage.pinned.map((p) => [p.floor, p.module]));
  const used = new Set(ctx.usedModules);

  // 1) 층별 노드 수
  const floors: MapNode[][] = [];
  for (let f = 1; f <= stage.floors; f++) {
    const count = pinnedByFloor.has(f) ? 1 : rng.int(route.nodesPerFloor[0], route.nodesPerFloor[1]);
    floors.push(Array.from({ length: count }, (_, i) => ({ id: nodeId(f, i), floor: f, index: i, type: 'battle' as NodeType, moduleId: '', next: [] })));
  }
  const bossFloor = stage.floors + 1;
  floors.push([{ id: nodeId(bossFloor, 0), floor: bossFloor, index: 0, type: 'boss', moduleId: stage.boss, next: [] }]);

  // 2) 연결: 위치가 비슷한 노드끼리 잇고, 가끔 옆 노드로 갈래길을 더한다
  for (let f = 0; f < floors.length - 1; f++) {
    const a = floors[f];
    const b = floors[f + 1];
    const link = (i: number, j: number) => {
      if (!a[i].next.includes(b[j].id)) a[i].next.push(b[j].id);
    };
    if (a.length === 1 || b.length === 1) {
      a.forEach((_, i) => b.forEach((_, j) => link(i, j)));
      continue;
    }
    a.forEach((_, i) => {
      const j = Math.round((i * (b.length - 1)) / (a.length - 1));
      link(i, j);
      if (rng.next() < route.extraEdgeChance) {
        const j2 = j + (rng.next() < 0.5 ? -1 : 1);
        if (j2 >= 0 && j2 < b.length) link(i, j2);
      }
    });
    b.forEach((node, j) => {
      if (!a.some((n) => n.next.includes(node.id))) link(Math.round((j * (a.length - 1)) / (b.length - 1)), j);
    });
    a.forEach((n) => n.next.sort());
  }

  // 3) 노드 유형과 모듈 배정(층 순서대로, 부모 유형을 보고 제약 확인)
  const parentsOf = (node: MapNode) => floors[node.floor - 2]?.filter((p) => p.next.includes(node.id)) ?? [];
  // 이 노드까지 이어진 '전투 없는 노드'(고정 이야기 포함)의 가장 긴 연속(어느 부모 길로 와도).
  // 바로 뒤에 고정된 이야기 노드나 정해진 휴식(보스 앞 등)이 있으면 그것까지 센다 — 그쪽은 바꿀 수 없으니 앞을 전투로 당긴다
  const calmRun = new Map<string, number>();
  const pinnedType = (g: number) => data.modules.get(pinnedByFloor.get(g) ?? '')?.type ?? stage.forcedTypes[String(g)];
  const pinnedCalmAhead = (f: number) => {
    let n = 0;
    for (let g = f + 1; g <= stage.floors; g++) {
      const t = pinnedType(g);
      if (!t || !isCalm(t)) break;
      n += 1;
    }
    return n;
  };
  const allModules = [...data.modules.values()];
  for (let f = 1; f <= stage.floors; f++) {
    for (const node of floors[f - 1]) {
      const pinned = pinnedByFloor.get(f);
      const runBefore = Math.max(0, ...parentsOf(node).map((p) => calmRun.get(p.id) ?? 0));
      if (pinned) {
        const mod = data.modules.get(pinned);
        if (!mod) throw new Error(`고정 모듈 없음: ${pinned}`);
        node.type = mod.type;
        node.moduleId = mod.id;
        used.add(mod.id);
        calmRun.set(node.id, isCalm(node.type) ? runBefore + 1 : 0);
        continue;
      }
      // 전투 없는 노드를 더 놓으면 연속 한도를 넘는가(뒤에 붙은 고정 이야기 노드까지)
      const calmFull = runBefore + 1 + pinnedCalmAhead(f) > route.maxCalmRun;
      const forced = stage.forcedTypes[String(f)];
      const parentRest = parentsOf(node).some((p) => p.type === 'rest');
      const nextForcedRest = stage.forcedTypes[String(f + 1)] === 'rest';
      // 상점도 휴식처럼 두 번 잇따르지 않는다(보스 앞 정해진 상점 바로 앞에도 두지 않는다)
      const parentShop = parentsOf(node).some((p) => p.type === 'shop');
      const nextForcedShop = stage.forcedTypes[String(f + 1)] === 'shop';
      let candidates = (Object.entries(stage.typeWeights) as [NodeType, number][]).filter(([type, w]) => {
        if (w <= 0 || type === 'story' || type === 'boss') return false;
        if (type === 'elite' && f < route.eliteMinFloor) return false;
        if (type === 'rest' && (parentRest || nextForcedRest)) return false;
        if (type === 'shop' && (parentShop || nextForcedShop)) return false;
        if (calmFull && isCalm(type)) return false;
        return true;
      });
      // 정해진 유형(forcedTypes)에 쓸 모듈이 바닥나면(심연 서약 '막아선 자'로 엘리트가 몰릴 때 등) 보통 유형으로 돌아간다
      const unforced = candidates.filter(([t]) => t !== forced);
      if (forced && !(forced === 'rest' && parentRest)) candidates = [[forced, 1]];

      let assigned = false;
      while (!assigned && candidates.length) {
        const [type] = rng.weighted(candidates, ([, w]) => w)!;
        const mods = allModules.filter((m) => m.type === type && (override ? override.eligible(m, f, used) : moduleEligible(data, stage, m, f, ctx, used)));
        const mod = rng.weighted(mods, (m) => m.weight * (m.tags.includes('scar') ? 1 + ctx.scar * (override?.scarWeight ?? route.scarWeightPerPoint) : 1));
        if (mod) {
          node.type = type;
          node.moduleId = mod.id;
          // 어디서나 나오는 사건(stage "*")은 한 지도에 한 번씩만(스테이지마다 다시 나올 수 있다)
          if (mod.once || mod.stage === '*') used.add(mod.id);
          assigned = true;
        } else {
          candidates = candidates.filter(([t]) => t !== type);
          if (!candidates.length && type === forced && unforced.length) candidates = unforced;
        }
      }
      if (!assigned) throw new Error(`${stageId} ${f}층에 배정할 모듈이 없다`);
      calmRun.set(node.id, isCalm(node.type) ? runBefore + 1 : 0);
    }
  }
  return { stageId, floors };
}

export function findNode(map: StageMap, id: string): MapNode | undefined {
  for (const floor of map.floors) {
    const n = floor.find((x) => x.id === id);
    if (n) return n;
  }
  return undefined;
}

/** 지도 규칙 검사. 테스트와 디버그에서 쓴다. 빈 배열이면 통과. */
export function validateMap(data: GameData, map: StageMap, stageOverride?: StageDef): string[] {
  const errors: string[] = [];
  const stage = stageOverride ?? data.stages.find((s) => s.id === map.stageId)!;
  const all = map.floors.flat();
  const byId = new Map(all.map((n) => [n.id, n]));
  const boss = map.floors[map.floors.length - 1];
  if (boss.length !== 1 || boss[0].type !== 'boss') errors.push('마지막 층은 보스 하나여야 한다');

  // 모든 노드가 1층에서 도달 가능하고, 보스까지 갈 수 있어야 한다
  const reachable = new Set<string>(map.floors[0].map((n) => n.id));
  for (const floor of map.floors) for (const n of floor) if (reachable.has(n.id)) n.next.forEach((x) => reachable.add(x));
  for (const n of all) if (!reachable.has(n.id)) errors.push(`${n.id}: 도달 불가`);
  const reachesBoss = new Set<string>([boss[0].id]);
  for (let f = map.floors.length - 2; f >= 0; f--) {
    for (const n of map.floors[f]) if (n.next.some((x) => reachesBoss.has(x))) reachesBoss.add(n.id);
  }
  for (const n of all) if (!reachesBoss.has(n.id)) errors.push(`${n.id}: 보스에 닿지 못함`);

  for (const pin of stage.pinned) {
    const floor = map.floors[pin.floor - 1];
    if (floor.length !== 1 || floor[0].moduleId !== pin.module) errors.push(`${pin.floor}층 고정 노드(${pin.module}) 누락`);
  }
  const pinnedFloors = new Set(stage.pinned.map((p) => p.floor));
  for (const n of all) {
    // 고정 노드(원작의 정해진 전투, 예: S5 1층 그림자의 밤)는 이른 엘리트 제한을 받지 않는다
    if (n.type === 'elite' && n.floor < data.balance.route.eliteMinFloor && !pinnedFloors.has(n.floor)) errors.push(`${n.id}: 너무 이른 엘리트`);
    if (n.type === 'rest' && n.next.some((x) => byId.get(x)?.type === 'rest')) errors.push(`${n.id}: 휴식 연속`);
    if (n.floor <= stage.floors && !n.moduleId) errors.push(`${n.id}: 모듈 없음`);
    for (const x of n.next) {
      const t = byId.get(x);
      if (!t || t.floor !== n.floor + 1) errors.push(`${n.id} → ${x}: 잘못된 연결`);
    }
  }
  // 전투 없는 노드의 연속: 어느 길로 가도 한도를 넘지 않는다(고정 노드끼리 붙어 생기는 것은 데이터 문제라 따로 본다)
  const run = new Map<string, number>();
  for (const floor of map.floors) {
    for (const n of floor) {
      const parents = (map.floors[n.floor - 2] ?? []).filter((p) => p.next.includes(n.id));
      const before = Math.max(0, ...parents.map((p) => run.get(p.id) ?? 0));
      const r = isCalm(n.type) ? before + 1 : 0;
      run.set(n.id, r);
      if (r > data.balance.route.maxCalmRun && !pinnedFloors.has(n.floor) && !stage.forcedTypes[String(n.floor)]) errors.push(`${n.id}: 전투 없는 노드 ${r}연속`);
    }
  }
  const onceSeen = new Set<string>();
  for (const n of all) {
    const mod = data.modules.get(n.moduleId);
    if (mod?.once) {
      if (onceSeen.has(mod.id)) errors.push(`${mod.id}: once 모듈 중복`);
      onceSeen.add(mod.id);
    }
  }
  return errors;
}

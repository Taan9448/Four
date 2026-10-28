// 순례 누적(GAME_DESIGN 2절, 2026-10-21 사용자 결정): 길에서 보스를 넘기면 그 길에서 달라진 것(카드·강화·각인·대강화 천장·유물·물약·골드·동료)을
// 클리어한 런(hub)에 더한다. 길마다 출발할 때의 모습(base)을 적어 두고 '달라진 만큼'만 옮기므로, 여러 길을 멈춰 두었다가
// 차례로 마쳐도 서로 덮어쓰지 않는다. 지거나 버린 길은 옮기지 않는다
import type { GameData } from './data';
import type { RunState } from './run';

/** 길을 출발할 때(또는 멈춘 길을 이어서 걸 때)의 모습 — 달라진 만큼을 셀 기준 */
export interface PilgrimBase {
  gold: number;
  relics: string[];
  potions: string[];
  /** 물약 칸 수(길에서 칸이 늘 수 있다) */
  potionSlots: number;
  collection: Record<string, number>;
  engravings: Record<string, string[]>;
  /** 대강화 천장(실패 수, 카드 id → 지금 단계에서 실패한 횟수). 옛 저장에는 없다 */
  forgeFails?: Record<string, number>;
  roster: Record<string, { maxHp: number; level: number; xp: number }>;
}

/** 지금 모습을 기준으로 적는다 */
export function pilgrimBase(run: Pick<RunState, 'gold' | 'relics' | 'potions' | 'collection' | 'engravings' | 'forgeFails' | 'roster'>): PilgrimBase {
  return {
    gold: run.gold,
    relics: [...run.relics],
    potions: run.potions.filter((p): p is string => !!p),
    potionSlots: run.potions.length,
    collection: { ...run.collection },
    engravings: structuredClone(run.engravings ?? {}),
    forgeFails: { ...(run.forgeFails ?? {}) },
    roster: Object.fromEntries(run.roster.map((r) => [r.id, { maxHp: r.maxHp, level: r.level, xp: r.xp }])),
  };
}

/** 같은 것끼리 짝지어 빼고 남은 것(물약처럼 같은 것이 여럿일 수 있는 목록) */
function minus(a: string[], b: string[]): string[] {
  const left = [...b];
  return a.filter((x) => {
    const i = left.indexOf(x);
    if (i < 0) return true;
    left.splice(i, 1);
    return false;
  });
}

/**
 * base에서 walk로 달라진 만큼을 target에 더한다(target을 고친다).
 * 카드: 새로 얻은 카드는 그 강화 단계로(이미 있으면 높은 쪽), 가진 카드는 오른 단계만큼(강화 상한 — 대강화로 넘긴 카드는 그 단계까지),
 * 길에서 넘기거나 바꾼 카드는 지운다. 각인은 달라진 카드만 길의 것으로. 유물·물약은 얻은 것을 넣고 잃은(쓴) 것을 뺀다(물약 칸이 모자라면 버린다).
 * 골드는 늘거나 준 만큼. 동료는 최대 체력이 달라진 만큼, 레벨·경험치는 높은 쪽
 */
export function applyPilgrimGains(data: GameData, target: RunState, base: PilgrimBase, walk: RunState): void {
  const maxLevel = data.balance.upgrade.maxLevel;
  // 카드
  for (const [id, lv] of Object.entries(walk.collection)) {
    const was = base.collection[id];
    if (was === undefined) target.collection[id] = Math.max(target.collection[id] ?? lv, lv);
    else if (lv !== was && target.collection[id] !== undefined) target.collection[id] = Math.max(0, Math.min(Math.max(maxLevel, lv), target.collection[id] + lv - was));
  }
  for (const id of Object.keys(base.collection)) {
    if (walk.collection[id] !== undefined) continue;
    delete target.collection[id];
    for (const key of Object.keys(target.loadout)) target.loadout[key] = target.loadout[key].filter((x) => x !== id);
    if (target.engravings) delete target.engravings[id];
  }
  // 각인
  for (const id of new Set([...Object.keys(walk.engravings ?? {}), ...Object.keys(base.engravings)])) {
    const now = walk.engravings?.[id];
    if (JSON.stringify(now ?? []) === JSON.stringify(base.engravings[id] ?? [])) continue;
    if (target.collection[id] === undefined) continue;
    target.engravings ??= {};
    if (now?.length) target.engravings[id] = [...now];
    else delete target.engravings[id];
  }
  // 대강화 천장(2026-10-28 사용자 요청 — "실패해서 오른 확률이 길을 마치면 사라진다"): 실패 수도 길에서 달라진 만큼 더한다.
  // 길에서 단계가 오른 카드는 새 단계의 실패 수(길의 것)로, 그대로인 카드는 늘어난 실패 수만큼
  const baseFails = base.forgeFails ?? {};
  for (const id of new Set([...Object.keys(walk.forgeFails ?? {}), ...Object.keys(baseFails)])) {
    if (target.collection[id] === undefined) continue;
    const now = walk.forgeFails?.[id] ?? 0;
    const was = baseFails[id] ?? 0;
    const leveled = walk.collection[id] !== base.collection[id];
    if (!leveled && now === was) continue;
    const fails = leveled ? now : Math.max(0, (target.forgeFails?.[id] ?? 0) + now - was);
    target.forgeFails ??= {};
    if (fails > 0) target.forgeFails[id] = fails;
    else delete target.forgeFails[id];
  }
  // 유물
  for (const id of walk.relics) if (!base.relics.includes(id) && !target.relics.includes(id)) target.relics.push(id);
  for (const id of base.relics) if (!walk.relics.includes(id)) target.relics = target.relics.filter((x) => x !== id);
  // 물약(늘어난 칸부터)
  for (let i = base.potionSlots ?? walk.potions.length; i < walk.potions.length; i++) target.potions.push(null);
  const held = walk.potions.filter((p): p is string => !!p);
  for (const id of minus(base.potions, held)) {
    const i = target.potions.indexOf(id);
    if (i >= 0) target.potions[i] = null;
  }
  for (const id of minus(held, base.potions)) {
    const i = target.potions.indexOf(null);
    if (i >= 0) target.potions[i] = id;
  }
  // 골드
  target.gold = Math.max(0, target.gold + walk.gold - base.gold);
  // 동료
  for (const r of walk.roster) {
    const was = base.roster[r.id];
    const t = target.roster.find((x) => x.id === r.id);
    if (!was || !t) continue;
    t.maxHp = Math.max(1, t.maxHp + r.maxHp - was.maxHp);
    if (r.level > t.level || (r.level === t.level && r.xp > t.xp)) {
      t.level = r.level;
      t.xp = r.xp;
    }
    t.hp = t.maxHp;
  }
}

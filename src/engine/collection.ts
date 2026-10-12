// 보유 카드와 편성(GAME_DESIGN 9-1): 모은 카드(collection) 중 동료마다 8장 + 공용 8장을 골라(loadout) 스테이지 덱을 만든다.
// 같은 카드는 한 장만 가지고, 또 얻으면 강화된다. 강화는 보유 카드 종류에 붙는다.
import type { GameData } from './data';
import type { CardDef } from './schema';
import type { CardInstance } from './state';
import type { RunState } from './run';
import { measurePilgrimScale } from './pilgrim-scale';

/** 편성: 주인(동료 id 또는 'common') → 카드 id 목록 */
export type Loadout = Record<string, string[]>;

export const COMMON = 'common';

/** 편성을 짜는 주인들: 합류한 싸우는 동료(합류 순) + 공용 */
export function loadoutOwners(data: GameData, run: Pick<RunState, 'roster'>): string[] {
  return [...run.roster.filter((r) => data.characters.get(r.id)?.role === 'fighter').map((r) => r.id), COMMON];
}

export const slotsFor = (data: GameData, owner: string) => (owner === COMMON ? data.balance.loadout.common : data.balance.loadout.perCharacter);

/** 카드의 편성 주인: 동료 카드면 그 동료, 아니면 공용 */
export const ownerKey = (data: GameData, def: CardDef) => (data.characters.has(def.owner) ? def.owner : COMMON);

/** 편성에서 고를 수 있는 보유 카드(필수 카드·상태 카드 제외) */
export function choosable(data: GameData, run: Pick<RunState, 'collection'>, owner: string): CardDef[] {
  return Object.keys(run.collection)
    .map((id) => data.cards.get(id))
    .filter((d): d is CardDef => !!d && !d.essential && d.pool !== 'status' && ownerKey(data, d) === owner);
}

/** 가지고 있는 필수 카드(편성과 상관없이 늘 덱에) */
export function ownedEssentials(data: GameData, run: Pick<RunState, 'collection'>): string[] {
  return Object.keys(run.collection).filter((id) => data.cards.get(id)?.essential);
}

/** 그 주인이 채워야 할 장수: 칸 수, 보유 카드가 모자라면 가진 만큼 */
export const requiredFor = (data: GameData, run: Pick<RunState, 'collection'>, owner: string) => Math.min(slotsFor(data, owner), choosable(data, run, owner).length);

const RARITY_SCORE: Record<string, number> = { common: 1, uncommon: 2, rare: 3, epic: 5, legendary: 7, special: 0 };

/** 추천 점수: 등급(편성 점수와 같은 비율 — 상한에 맞출 때 전설이 손해 보지 않게) + 강화 단계(+ 0비용 덤). 같은 점수면 이름 순(결정적) */
function score(data: GameData, run: Pick<RunState, 'collection'>, def: CardDef): number {
  return RARITY_SCORE[def.rarity] * 10 + (run.collection[def.id] ?? 0) * 4 + (def.cost.neigong + def.cost.mana === 0 ? 1 : 0);
}

/** 아키타입에 모으는 가산점(GAME_DESIGN 9-2): 한 갈래의 카드끼리 맞물리게 */
const FOCUS_BONUS = 12;

/** 이 주인이 가진 카드로 가장 강한 아키타입(동료: 자기 것 / 공용: 없음) */
export function focusArchetype(data: GameData, run: Pick<RunState, 'collection'>, owner: string): string | null {
  const archetypes = data.characters.get(owner)?.archetypes ?? [];
  let best: string | null = null;
  let bestV = 0;
  // 보너스를 켤 수 있는(카드가 focusMin장 이상인) 갈래를 먼저, 그다음 카드 점수 합
  const enough = (id: string) => choosable(data, run, owner).filter((d) => d.tags.includes(id)).length >= data.balance.loadout.focusMin;
  for (const a of archetypes) {
    const v = choosable(data, run, owner)
      .filter((d) => d.tags.includes(a.id))
      .reduce((sum, d) => sum + score(data, run, d), 0) + (enough(a.id) ? 10000 : 0);
    if (v > bestV) [best, bestV] = [a.id, v];
  }
  return best;
}

/** 편성 점수(카드 250장 확장): 등급 점수, 열쇠 카드 0. 강화 단계는 세지 않는다 */
export function cardPoints(data: GameData, def: CardDef): number {
  if (def.essential) return 0;
  return data.balance.loadout.points[def.rarity] ?? 0;
}

/** 주인의 편성 점수 상한(동료 24 · 공용 17) */
export const capFor = (data: GameData, owner: string) => (owner === COMMON ? data.balance.loadout.cap.common : data.balance.loadout.cap.perCharacter);

/** 카드 목록의 편성 점수 합 */
export function loadoutPoints(data: GameData, ids: readonly string[]): number {
  return ids.reduce((a, id) => a + (data.cards.has(id) ? cardPoints(data, data.cards.get(id)!) : 0), 0);
}

/** 편성에서 이 주인의 같은 갈래 카드 수(갈래 id → 장수) */
export function archetypeCounts(data: GameData, owner: string, ids: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const a of data.characters.get(owner)?.archetypes ?? []) out[a.id] = ids.filter((id) => data.cards.get(id)?.tags.includes(a.id)).length;
  return out;
}

/** 갈래 보너스가 켜지는 갈래(같은 갈래 카드 focusMin장 이상, 둘 다면 많은 쪽 — 같으면 앞의 갈래). 없으면 null */
export function loadoutFocus(data: GameData, owner: string, ids: readonly string[]): string | null {
  const counts = archetypeCounts(data, owner, ids);
  let best: string | null = null;
  for (const [id, n] of Object.entries(counts)) if (n >= data.balance.loadout.focusMin && (best === null || n > counts[best])) best = id;
  return best;
}

/**
 * 점수 상한에 맞춘다: 넘으면 넣은 카드 하나를 그보다 싼(아직 안 넣은) 카드로 바꾸기를 되풀이한다.
 * 바꿀 때마다 '줄어드는 점수 1당 잃는 값'(넘친 점수까지만 센다)이 가장 작은 바꾸기를 고른다(1점 넘었다고 전설을 빼지 않게 — 고급 하나를 일반으로).
 * 같은 갈래 태그 → 공격·그 밖이 같은 쪽 카드로 먼저 바꿔 갈래 보너스와 비율을 지킨다. 지키는 카드(keep)는 다른 바꾸기가 없을 때만 바꾼다
 */
function fitCap(data: GameData, run: Pick<RunState, 'collection'>, owner: string, ids: string[], value: (d: CardDef) => number, keep: ReadonlySet<string> = new Set()): string[] {
  const cap = capFor(data, owner);
  const def = (id: string) => data.cards.get(id)!;
  const out = [...ids];
  const kept = new Set(keep);
  for (let guard = 0; guard < 40 && loadoutPoints(data, out) > cap; guard++) {
    const over = loadoutPoints(data, out) - cap;
    let best: { id: string; to: string; kept: boolean; cost: number; cut: number } | null = null;
    for (const id of out) {
      const pts = cardPoints(data, def(id));
      const cheaper = choosable(data, run, owner)
        .filter((d) => !out.includes(d.id) && cardPoints(data, d) < pts)
        .sort((a, b) => value(b) - value(a));
      // 같은 갈래(태그) → 같은 쪽(공격·그 밖) 순으로 바꿀 카드를 고른다(갈래 보너스와 비율을 지키게)
      const sameTag = (d: CardDef) => d.tags.some((t) => def(id).tags.includes(t));
      const sameSide = (d: CardDef) => (d.type === 'attack') === (def(id).type === 'attack');
      const pick = cheaper.find((d) => sameTag(d) && sameSide(d)) ?? cheaper.find(sameTag) ?? cheaper.find(sameSide) ?? cheaper[0];
      if (!pick) continue;
      const cut = pts - cardPoints(data, pick);
      // 넘친 만큼보다 더 깎는 점수는 버려지므로 넘친 만큼까지만 센다
      const cost = (value(def(id)) - value(pick)) / Math.min(cut, over);
      const isKept = kept.has(id);
      // 같은 값이면 덜 깎는 바꾸기(남는 점수를 버리지 않게)
      if (!best || Number(isKept) < Number(best.kept) || (isKept === best.kept && (cost < best.cost || (cost === best.cost && cut < best.cut)))) best = { id, to: pick.id, kept: isKept, cost, cut };
    }
    if (!best) break;
    out[out.indexOf(best.id)] = best.to;
    // 지키는 카드를 바꿨으면 그 자리에 든 카드도 지킨다(갈래 핵심이 다음 바꾸기에서 다른 갈래로 밀리지 않게)
    if (best.kept) kept.add(best.to);
  }
  return out;
}

/**
 * 추천 편성(한 주인): 점수 높은 카드부터, 공격과 그 밖(방어·기술·심법)이 한쪽으로 쏠리지 않게
 * (칸의 3/8 이상은 공격, 1/4 이상은 공격 아닌 카드 — 가진 카드가 허락하는 만큼).
 * 동료는 가장 강한 아키타입의 카드에 가산점을 주고, 그 갈래 카드가 focusMin장 이상이면 좋은 것 focusMin장을 먼저 담아 갈래 보너스를 켠다
 */
export function recommendFor(data: GameData, run: Pick<RunState, 'collection'>, owner: string): string[] {
  const n = requiredFor(data, run, owner);
  const focus = focusArchetype(data, run, owner);
  const value = (d: CardDef) => score(data, run, d) + (focus && d.tags.includes(focus) ? FOCUS_BONUS : 0);
  const sorted = choosable(data, run, owner).sort((a, b) => value(b) - value(a) || a.id.localeCompare(b.id));
  // 갈래 핵심: 가장 강한 갈래의 카드가 focusMin장 이상이면 그 갈래의 좋은 카드 focusMin장을 먼저 담는다(갈래 보너스가 켜지게)
  const focusMin = data.balance.loadout.focusMin;
  const focusCards = focus ? sorted.filter((d) => d.tags.includes(focus)) : [];
  // 남은 칸을 가장 싼 카드(1점)로 채워도 상한 안에 들도록 좋은 것부터 담는다
  const core: CardDef[] = [];
  if (focusCards.length >= focusMin && n >= focusMin) {
    const cap = capFor(data, owner);
    let pts = 0;
    for (const d of focusCards) {
      if (core.length >= focusMin) break;
      const rest = n - core.length - 1;
      if (pts + cardPoints(data, d) + rest > cap) continue;
      core.push(d);
      pts += cardPoints(data, d);
    }
    if (core.length < focusMin) core.length = 0;
  }
  const pick = new Set<string>(core.map((d) => d.id));
  const isAtk = (d: CardDef) => d.type === 'attack';
  const minAtk = Math.min(sorted.filter(isAtk).length, Math.ceil((n * 3) / 8));
  const minOther = Math.min(sorted.filter((d) => !isAtk(d)).length, Math.ceil(n / 4));
  const count = (f: (d: CardDef) => boolean) => sorted.filter((d) => pick.has(d.id) && f(d)).length;
  for (const d of sorted) if (isAtk(d) && !pick.has(d.id) && count(isAtk) < minAtk) pick.add(d.id);
  for (const d of sorted) if (!isAtk(d) && !pick.has(d.id) && count((x) => !isAtk(x)) < minOther) pick.add(d.id);
  for (const d of sorted) {
    if (pick.size >= n) break;
    pick.add(d.id);
  }
  // 정렬 순서(점수 높은 순)로 돌려준다. 상한에 맞출 때 갈래 핵심은 마지막에 바꾼다
  return fitCap(data, run, owner, sorted.filter((d) => pick.has(d.id)).slice(0, n).map((d) => d.id), value, new Set(core.map((d) => d.id)));
}

/** 추천 편성(모든 주인). keep: 이미 고른 편성 중 유효한 것은 남기고 모자란 칸만 채운다 */
export function recommendLoadout(data: GameData, run: Pick<RunState, 'collection' | 'roster'>, keep?: Loadout): Loadout {
  const out: Loadout = {};
  for (const owner of loadoutOwners(data, run)) {
    const n = requiredFor(data, run, owner);
    const valid = new Set(choosable(data, run, owner).map((d) => d.id));
    const kept = [...new Set((keep?.[owner] ?? []).filter((id) => valid.has(id)))].slice(0, n);
    const fill = recommendFor(data, run, owner).filter((id) => !kept.includes(id));
    const focus = focusArchetype(data, run, owner);
    const value = (d: CardDef) => score(data, run, d) + (focus && d.tags.includes(focus) ? FOCUS_BONUS : 0);
    // 지킨 카드와 채운 카드를 합쳐 점수 상한에 맞춘다(넘으면 채운 카드부터 싼 것으로)
    out[owner] = fitCap(data, run, owner, [...kept, ...fill].slice(0, n), value, new Set(kept));
  }
  return out;
}

/** 편성의 문제(없으면 빈 배열): 칸 수가 맞지 않음, 가지지 않은 카드, 다른 주인의 카드, 같은 카드 두 장 */
export function loadoutProblems(data: GameData, run: Pick<RunState, 'collection' | 'roster'>, loadout: Loadout): string[] {
  const problems: string[] = [];
  for (const owner of loadoutOwners(data, run)) {
    const ids = loadout[owner] ?? [];
    const name = owner === COMMON ? '공용' : (data.characters.get(owner)?.name ?? owner);
    const need = requiredFor(data, run, owner);
    if (new Set(ids).size !== ids.length) problems.push(`${name}: 같은 카드를 두 장 넣을 수 없다`);
    const valid = new Set(choosable(data, run, owner).map((d) => d.id));
    const bad = ids.filter((id) => !valid.has(id));
    if (bad.length) problems.push(`${name}: 고를 수 없는 카드 ${bad.join(', ')}`);
    if (ids.length !== need) problems.push(`${name}: ${need}장을 골라야 한다(지금 ${ids.length}장)`);
    const pts = loadoutPoints(data, ids);
    if (pts > capFor(data, owner)) problems.push(`${name} 편성 ${pts}점 — 상한 ${capFor(data, owner)}`);
  }
  return problems;
}

function newInstance(run: RunState, cardId: string): CardInstance {
  run.counter += 1;
  return { uid: `c${run.counter}`, cardId, level: run.collection[cardId] ?? 0 };
}

/**
 * 스테이지 덱을 다시 만든다: 편성(합류한 동료 전원 + 공용) + 가진 필수 카드 + 이번 스테이지에 얻은 카드.
 * 같은 카드는 한 장, 강화 단계는 보유 카드의 단계
 */
export function buildStageDeck(data: GameData, run: RunState): void {
  const ids: string[] = [];
  const add = (id: string) => {
    if (data.cards.has(id) && !ids.includes(id)) ids.push(id);
  };
  for (const owner of loadoutOwners(data, run)) (run.loadout[owner] ?? []).forEach(add);
  ownedEssentials(data, run).forEach(add);
  run.stageGains.forEach(add);
  run.deck = ids.map((id) => newInstance(run, id));
}

/** 편성을 정한다(문제가 있으면 예외). 덱도 새로 만든다 */
export function setLoadout(data: GameData, run: RunState, loadout: Loadout): void {
  const problems = loadoutProblems(data, run, loadout);
  if (problems.length) throw new Error(problems.join('\n'));
  run.loadout = structuredClone(loadout);
  run.needsLoadout = false;
  // 갈래 보너스는 출발 편성으로 정한다(스테이지 중에 얻은 카드는 세지 않는다)
  run.loadoutFocus = Object.fromEntries(
    loadoutOwners(data, run)
      .filter((o) => o !== COMMON)
      .flatMap((o) => {
        const f = loadoutFocus(data, o, loadout[o] ?? []);
        return f ? [[o, f]] : [];
      }),
  );
  buildStageDeck(data, run);
  // 순례: 출발 편성으로 일행 보정을 고정한다(2026-10-12 보정식 세 항)
  if (run.replayOf) run.pilgrimScale = measurePilgrimScale(data, run);
}

/** 스테이지를 시작할 때: 이번 스테이지에 얻은 카드를 비우고, 편성을 다시 고르게 한다(모자란 칸은 추천으로 미리 채움) */
export function beginStageLoadout(data: GameData, run: RunState): void {
  run.stageGains = [];
  run.loadout = recommendLoadout(data, run, run.loadout);
  run.needsLoadout = true;
  buildStageDeck(data, run);
}

/** 보유 카드의 강화 단계를 올린다(덱에 든 그 카드도). 올렸으면 true */
export function upgradeOwned(data: GameData, run: RunState, cardId: string): boolean {
  const def = data.cards.get(cardId);
  const lv = run.collection[cardId];
  if (!def?.upgrade || lv === undefined || lv >= data.balance.upgrade.maxLevel) return false;
  run.collection[cardId] = lv + 1;
  for (const c of run.deck) if (c.cardId === cardId) c.level = lv + 1;
  return true;
}

/** 카드를 얻으면 어떻게 되는가(보상·상점 표시): 새 카드 / 보유 카드 강화 / 최대 강화라 골드 */
export type AcquirePreview =
  | { kind: 'new'; level: 0 }
  | { kind: 'upgrade'; from: number; level: number }
  | { kind: 'maxed'; level: number; gold: number };

export function acquirePreview(data: GameData, run: RunState, cardId: string): AcquirePreview {
  const def = data.cards.get(cardId);
  const lv = run.collection[cardId];
  if (lv === undefined) return { kind: 'new', level: 0 };
  if (def?.upgrade && lv < data.balance.upgrade.maxLevel) return { kind: 'upgrade', from: lv, level: lv + 1 };
  return { kind: 'maxed', level: lv, gold: data.balance.loadout.maxedGold };
}

/**
 * 카드를 얻는다(보상·상점·이벤트·이야기). 자유 여정은 덱에만(위). 처음이면 보유 목록과 이번 스테이지 덱에, 이미 있으면 +1 강화(덱에 없으면 이번 스테이지 덱에도),
 * 최대 강화면 골드. 결과 문구
 */
export function acquireCard(data: GameData, run: RunState, cardId: string): string {
  const def = data.cards.get(cardId);
  if (!def) throw new Error(`알 수 없는 카드: ${cardId}`);
  // 자유 여정(순례 A안, 2026-10-11): 보유 목록·강화 단계는 그대로 두고 이 길의 덱에만 한 장 더(심연과 같은 규칙, 가진 카드면 가진 단계로)
  if (run.replayOf) {
    if (!run.stageGains.includes(cardId)) run.stageGains.push(cardId);
    run.deck.push(newInstance(run, cardId));
    return `카드 획득(이 길에서만): ${def.name}${run.collection[cardId] ? ` +${run.collection[cardId]}` : ''}`;
  }
  const inDeck = run.deck.some((c) => c.cardId === cardId);
  const addToDeck = () => {
    if (!run.stageGains.includes(cardId)) run.stageGains.push(cardId);
    if (!inDeck) run.deck.push(newInstance(run, cardId));
  };
  if (run.collection[cardId] === undefined) {
    run.collection[cardId] = 0;
    addToDeck();
    return `카드 획득: ${def.name}`;
  }
  if (upgradeOwned(data, run, cardId)) {
    addToDeck();
    return `가진 카드라 강화: ${def.name} +${run.collection[cardId]}`;
  }
  run.gold += data.balance.loadout.maxedGold;
  addToDeck();
  return `더 강화할 수 없는 ${def.name} — 골드 +${data.balance.loadout.maxedGold}`;
}

/** 동료(또는 런 시작의 공용) 시작 카드: 그 주인의 starter 카드 */
export function starterCards(data: GameData, owner: string): string[] {
  return [...data.cards.values()].filter((d) => d.pool === 'starter' && ownerKey(data, d) === owner).map((d) => d.id);
}

/** 시작 카드를 보유 목록에 넣는다(이미 있으면 그대로) */
export function grantStarters(data: GameData, run: RunState, owner: string): void {
  for (const id of starterCards(data, owner)) if (run.collection[id] === undefined) run.collection[id] = 0;
}

/**
 * 스테이지 중간에 합류한 동료: 시작 카드를 받고 추천 편성으로 바로 덱에 들어간다
 */
export function joinMidStage(data: GameData, run: RunState, member: string): void {
  grantStarters(data, run, member);
  // 다시 합류하면(S5 이탈 뒤) 예전 편성을 살리고 모자란 칸만 추천으로
  run.loadout[member] = recommendLoadout(data, run, run.loadout)[member] ?? recommendFor(data, run, member);
  for (const id of run.loadout[member]) if (!run.deck.some((c) => c.cardId === id)) run.deck.push(newInstance(run, id));
}

/** 편성 저장 칸 */
export function savePreset(data: GameData, run: RunState, slot: number, loadout: Loadout = run.loadout): void {
  if (slot < 0 || slot >= data.balance.loadout.presets) throw new Error('없는 저장 칸');
  run.presets[slot] = structuredClone(loadout);
}

/** 저장 칸을 불러온다: 지금 고를 수 없는 카드는 빠지고 모자란 칸은 추천으로 채운다 */
export function loadPreset(data: GameData, run: RunState, slot: number): Loadout | null {
  const p = run.presets[slot];
  return p ? recommendLoadout(data, run, p) : null;
}

/**
 * 카드 바꾸기(상점, 카드 지우기 대신): 보유 카드 한 장을 같은 주인의 다른 카드(아직 없는 것 우선)로.
 * 편성·덱에 들어 있었으면 그 자리에 새 카드. 바꿀 후보가 없으면 null
 */
export function swapCard(data: GameData, run: RunState, cardId: string, pick: (pool: CardDef[]) => CardDef): { from: string; to: string } | null {
  const def = data.cards.get(cardId);
  if (!def || run.collection[cardId] === undefined || def.essential) return null;
  const owner = ownerKey(data, def);
  const all = [...data.cards.values()].filter((d) => (d.pool === 'reward' || d.pool === 'starter') && !d.essential && ownerKey(data, d) === owner && d.id !== cardId);
  const fresh = all.filter((d) => run.collection[d.id] === undefined);
  const pool = fresh.length ? fresh : all;
  if (!pool.length) return null;
  const next = pick(pool);
  delete run.collection[cardId];
  const owned = run.collection[next.id] !== undefined;
  if (!owned) run.collection[next.id] = 0;
  else upgradeOwned(data, run, next.id);
  for (const key of Object.keys(run.loadout)) {
    const list = run.loadout[key];
    const i = list.indexOf(cardId);
    if (i >= 0) {
      if (list.includes(next.id)) list.splice(i, 1);
      else list[i] = next.id;
    }
  }
  run.stageGains = run.stageGains.filter((id) => id !== cardId);
  const at = run.deck.findIndex((c) => c.cardId === cardId);
  if (at >= 0) {
    if (run.deck.some((c) => c.cardId === next.id)) run.deck.splice(at, 1);
    else run.deck[at] = newInstance(run, next.id);
  }
  for (const p of run.presets) if (p) for (const key of Object.keys(p)) p[key] = p[key].filter((id) => id !== cardId);
  return { from: cardId, to: next.id };
}

/** 바꿀 수 있는 보유 카드 */
export function swappableCards(data: GameData, run: Pick<RunState, 'collection'>): string[] {
  return Object.keys(run.collection).filter((id) => {
    const d = data.cards.get(id);
    return !!d && !d.essential && d.pool !== 'status';
  });
}

/** 옛 저장(덱만 있던 때)에서 보유 목록을 만든다: 덱의 카드 종류, 강화는 가장 높은 단계 */
export function collectionFromDeck(deck: CardInstance[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of deck) out[c.cardId] = Math.max(out[c.cardId] ?? 0, c.level);
  return out;
}

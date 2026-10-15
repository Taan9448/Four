// 경제(2026-10-08): 전투 전리품(골드·물약·유물)과 상점. 모두 시드로 정해진다(같은 시드·같은 노드면 같은 결과).
import type { GameData } from './data';
import type { CardDef } from './schema';
import type { MapNode } from './route';
import { createRng, type Rng } from './rng';
import { forgeMax, type CardInstance } from './state';
import { engravingOffer } from './forge';
import { swapCard, swappableCards } from './collection';
import { addCard, applyRunOps, fireRunRelics, gainPotion, gainRelic, lawRunMul, upgradeCandidates, type RunState, type ShopState } from './run';
import { abyssShopPool, abyssShopRift, isAbyss, relicAllowed, removePrice, runOath } from './abyss';

type Tier = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

// ───────────────────────── 전리품 ─────────────────────────

export interface Loot {
  gold: number;
  /** 떨어진 물약(없으면 null) */
  potion: string | null;
  /** 엘리트: 바로 얻는 유물 */
  relic: string | null;
  /** 보스: 고를 유물 후보(하나만 가진다) */
  relicChoices: string[];
}

/** 가중치로 등급을 뽑고 그 등급에서 하나. 등급이 비면 다른 등급으로 */
function pickByTier<T extends { rarity: string }>(rng: Rng, pool: T[], weights: Partial<Record<string, number>>): T | null {
  const tiers = Object.entries(weights).filter(([r, w]) => (w ?? 0) > 0 && pool.some((x) => x.rarity === r)) as [string, number][];
  if (!tiers.length) return pool.length ? rng.pick(pool) : null;
  const [tier] = rng.weighted(tiers, ([, w]) => w)!;
  return rng.pick(pool.filter((x) => x.rarity === tier));
}

/** 아직 없는 유물 후보(상점·엘리트용: 전설과 상점에 내놓지 않는 유물은 빼고) */
function relicPool(data: GameData, run: RunState, exclude: string[] = []) {
  return [...data.relics.values()].filter((r) => relicAllowed(run, r) && r.rarity !== 'legendary' && r.shop && !run.relics.includes(r.id) && !exclude.includes(r.id));
}

/** 보스 전리품 후보: 등급 가중치(relicWeights.boss)로 겹치지 않게 n개(영웅·전설, 모자라면 희귀) */
function bossRelicChoices(data: GameData, run: RunState, rng: Rng, n: number): string[] {
  const left = [...data.relics.values()].filter((r) => relicAllowed(run, r) && !run.relics.includes(r.id));
  const out: string[] = [];
  const weights = data.balance.economy.relicWeights.boss;
  while (out.length < n) {
    const pool = left.filter((r) => !out.includes(r.id) && (weights[r.rarity as Tier] ?? 0) > 0);
    const pick = pool.length ? pickByTier(rng, pool, weights) : rng.shuffle(left.filter((r) => r.rarity === 'rare' && !out.includes(r.id)))[0];
    if (!pick) break;
    out.push(pick.id);
  }
  return out;
}

/** 이긴 전투의 전리품을 굴린다(적용하지 않는다) */
export function rollLoot(data: GameData, run: RunState, node: MapNode): Loot {
  const eco = data.balance.economy;
  const kind = node.type === 'boss' ? 'boss' : node.type === 'elite' ? 'elite' : 'battle';
  const rng = createRng(run.seed).fork(`loot:${run.stageId}:${node.id}`);
  const [lo, hi] = eco.gold[kind];
  // 굽이의 법칙 '무거운 발': 골드 두 배
  const gold = Math.round(rng.int(lo, hi) * lawRunMul(data, run, 'goldMul'));
  const potion = rng.next() < eco.potionDrop[kind] ? (pickByTier(rng, [...data.potions.values()], eco.potionWeights)?.id ?? null) : null;
  let relic: string | null = null;
  let relicChoices: string[] = [];
  // 심연의 숙적·서약 '막아선 자'의 엘리트는 유물을 떨구지 않는다(2026-10-10: 숙적이 잦은 서약이 유물 때문에 봇에게 이득이던 것)
  const noRelic = isAbyss(run) && (node.moduleId === data.balance.abyss.nemesisModule || (kind === 'elite' && node.floor === runOath(data, run).eliteFloor));
  if (kind === 'elite' && !noRelic) relic = pickByTier(rng, relicPool(data, run), eco.relicWeights.elite)?.id ?? null;
  if (kind === 'boss' && !noRelic) {
    relicChoices = bossRelicChoices(data, run, rng, eco.bossRelicChoices);
  }
  return { gold, potion, relic, relicChoices };
}

/**
 * 전리품 중 바로 받는 것(골드·엘리트 유물·빈 칸이 있는 물약)을 런에 넣는다.
 * 돌려주는 potionLeft: 칸이 가득해 못 넣은 물약(화면에서 바꿔 넣기를 고른다). 보스 유물은 화면·봇이 골라 gainRelic
 */
export function claimLoot(data: GameData, run: RunState, loot: Loot): { messages: string[]; potionLeft: string | null } {
  const messages = applyRunOps(data, run, [{ op: 'gain_gold', amount: loot.gold }]);
  if (loot.relic) messages.push(...gainRelic(data, run, loot.relic));
  let potionLeft: string | null = null;
  if (loot.potion) {
    if (gainPotion(data, run, loot.potion)) messages.push(`물약 획득: ${data.potions.get(loot.potion)!.name}`);
    else potionLeft = loot.potion;
  }
  return { messages, potionLeft };
}

/** 물약 칸 하나를 버리고 그 자리에 새 물약을 넣는다 */
export function swapPotion(run: RunState, slot: number, potion: string): void {
  if (slot < 0 || slot >= run.potions.length) throw new Error('없는 물약 칸');
  run.potions[slot] = potion;
}

// ───────────────────────── 상점 ─────────────────────────

/** 가격을 ±jitter로 흔든다(5 단위) */
function jitterPrice(rng: Rng, base: number, jitter: number): number {
  const f = 1 + (rng.next() * 2 - 1) * jitter;
  return Math.max(5, Math.round((base * f) / 5) * 5);
}

/** 상점에 들어선다: 이 노드의 진열이 없으면 시드로 정한다(나갔다 와도 그대로) */
export function openShop(data: GameData, run: RunState, nodeId: string): ShopState {
  if (run.shop?.nodeId === nodeId) return run.shop;
  const eco = data.balance.economy;
  const sh = eco.shop;
  const rng = createRng(run.seed).fork(`shop:${run.stageId}:${nodeId}`);
  // 상점에 처음 들어설 때 유물(shopEnter), 규칙 유물 shop_discount면 진열 가격이 싸다
  fireRunRelics(data, run, 'shopEnter');
  // 상흔 shopAt 이상: '틈 냄새가 나는 손님' — 값이 오른다
  const sc = data.balance.rift.scar;
  const scarred = run.scar >= sc.shopAt;
  const discount = (run.relics.some((id) => data.relics.get(id)?.rule === 'shop_discount') ? data.balance.relicRules.shopDiscount : 1) * (scarred ? sc.shopPriceMul : 1);
  const priced = (r: Rng, base: number, jitter: number) => Math.max(5, Math.round((jitterPrice(r, base, jitter) * discount) / 5) * 5);
  // 카드: 합류한 동료(쉬는 동료 포함)와 공용의 보상 카드, 전투 보상과 같은 등급 가중치
  const owners = new Set(run.roster.map((r) => r.id));
  // 심연: 심연 풀(보유 ∪ 도감)에서, 그리고 틈의 카드 한 칸(GAME_DESIGN 16절)
  const abyss = isAbyss(run);
  const cardPool = rng.shuffle(
    (abyss ? abyssShopPool(data, run) : [...data.cards.values()].filter((c) => c.pool === 'reward' && !c.essential && (owners.has(c.owner) || !data.characters.has(c.owner)))).filter(
      (c) => sh.cardPrice[c.rarity] !== undefined,
    ),
  );
  const cards: ShopState['cards'] = [];
  const weights = data.balance.rewards.rarityWeights.battle;
  while (cards.length < sh.cards && cardPool.length) {
    const def = pickByTier(rng, cardPool, weights)!;
    cardPool.splice(cardPool.indexOf(def), 1);
    cards.push({ cardId: def.id, price: priced(rng, sh.cardPrice[def.rarity]!, sh.jitter), sold: false });
  }
  // 상흔 shopAt 이상: 균열 감소 카드 한 장은 반드시(없으면 마지막 칸을 바꾼다)
  if (scarred && cards.length && !cards.some((c) => isReduceCard(data.cards.get(c.cardId)!))) {
    const reduce = cardPool.filter((c) => isReduceCard(c));
    if (reduce.length) {
      const def = rng.pick(reduce);
      cards[cards.length - 1] = { cardId: def.id, price: priced(rng, sh.cardPrice[def.rarity]!, sh.jitter), sold: false };
    }
  }
  if (abyss) {
    const rift = abyssShopRift(data, run);
    const def = rift.length ? rng.pick(rift) : null;
    const base = def ? data.balance.abyss.shopRiftPrice[def.rarity] : undefined;
    if (def && base) cards.push({ cardId: def.id, price: priced(rng, base, sh.jitter), sold: false });
  }
  const relics: ShopState['relics'] = [];
  for (let i = 0; i < sh.relics; i++) {
    const def = pickByTier(rng, relicPool(data, run, relics.map((r) => r.relicId)), eco.relicWeights.shop);
    if (!def) break;
    relics.push({ relicId: def.id, price: priced(rng, sh.relicPrice[def.rarity as Tier], sh.jitter), sold: false });
  }
  const potions: ShopState['potions'] = [];
  const potionPool = [...data.potions.values()];
  for (let i = 0; i < sh.potions; i++) {
    const def = pickByTier(rng, potionPool.filter((p) => !potions.some((x) => x.potionId === p.id)), eco.potionWeights);
    if (!def) break;
    potions.push({ potionId: def.id, price: priced(rng, sh.potionPrice[def.rarity], sh.jitter), sold: false });
  }
  run.shop = { nodeId, cards, relics, potions, swapUsed: false, upgradeUsed: false, scarred };
  return run.shop;
}

/** 지금 카드 바꾸기 가격(상점에서 쓸 때마다 오른다) */
export function swapPrice(data: GameData, run: RunState): number {
  const sh = data.balance.economy.shop;
  return sh.swapPrice + sh.swapStep * run.shopSwaps;
}

export type BuyResult = { ok: true; message: string } | { ok: false; reason: string };

function pay(run: RunState, price: number): BuyResult | null {
  if (run.gold < price) return { ok: false, reason: '골드가 모자란다' };
  run.gold -= price;
  return null;
}

function shopOf(run: RunState): ShopState {
  if (!run.shop) throw new Error('상점에 있지 않다');
  return run.shop;
}

export function buyCard(data: GameData, run: RunState, index: number): BuyResult {
  const item = shopOf(run).cards[index];
  if (!item || item.sold) return { ok: false, reason: '팔린 물건' };
  const fail = pay(run, item.price);
  if (fail) return fail;
  item.sold = true;
  return { ok: true, message: addCard(data, run, item.cardId) };
}

export function buyRelic(data: GameData, run: RunState, index: number): BuyResult {
  const item = shopOf(run).relics[index];
  if (!item || item.sold) return { ok: false, reason: '팔린 물건' };
  const fail = pay(run, item.price);
  if (fail) return fail;
  item.sold = true;
  return { ok: true, message: gainRelic(data, run, item.relicId).join(' · ') };
}

export function buyPotion(data: GameData, run: RunState, index: number): BuyResult {
  const item = shopOf(run).potions[index];
  if (!item || item.sold) return { ok: false, reason: '팔린 물건' };
  if (!run.potions.includes(null)) return { ok: false, reason: '물약 칸이 가득하다' };
  const fail = pay(run, item.price);
  if (fail) return fail;
  item.sold = true;
  gainPotion(data, run, item.potionId);
  return { ok: true, message: `물약 구입: ${data.potions.get(item.potionId)!.name}` };
}

/** 바꿀 수 있는 보유 카드(필수 카드·상태 카드 제외) */
export const swappable = (data: GameData, run: RunState) => swappableCards(data, run);

/**
 * 카드 바꾸기(카드 지우기 대신, GAME_DESIGN 9-1): 보유 카드 한 장을 같은 주인의 다른 카드로(아직 없는 것 우선).
 * 편성·이번 스테이지 덱에 들어 있었으면 그 자리에 새 카드가 들어간다
 */
export function buySwap(data: GameData, run: RunState, cardId: string): BuyResult {
  const shop = shopOf(run);
  if (shop.swapUsed) return { ok: false, reason: '이 상점에서는 이미 바꿨다' };
  if (!swappable(data, run).includes(cardId)) return { ok: false, reason: '바꿀 수 없는 카드' };
  const price = swapPrice(data, run);
  if (run.gold < price) return { ok: false, reason: '골드가 모자란다' };
  const rng = createRng(run.seed).fork(`swap:${run.stageId}:${run.shopSwaps}:${cardId}`);
  const res = swapCard(data, run, cardId, (pool) => rng.pick(pool));
  if (!res) return { ok: false, reason: '바꿀 카드가 없다' };
  run.gold -= price;
  shop.swapUsed = true;
  run.shopSwaps += 1;
  return { ok: true, message: `카드 바꾸기: ${data.cards.get(res.from)!.name} → ${data.cards.get(res.to)!.name}` };
}

/** 심연 상점의 카드 지우기(카드 바꾸기 대신): 덱에서 한 장을 뺀다. 상점마다 한 번, 쓸수록 비싸진다(바늘의 길이면 공짜) */
export function buyRemove(data: GameData, run: RunState, uid: string): BuyResult {
  const shop = shopOf(run);
  if (!isAbyss(run)) return { ok: false, reason: '심연에서만' };
  if (shop.swapUsed) return { ok: false, reason: '이 상점에서는 이미 지웠다' };
  const c = run.deck.find((x) => x.uid === uid);
  if (!c) return { ok: false, reason: '덱에 없는 카드' };
  const fail = pay(run, removePrice(data, run));
  if (fail) return fail;
  shop.swapUsed = true;
  run.abyss!.removals += 1;
  run.deck = run.deck.filter((x) => x.uid !== uid);
  return { ok: true, message: `카드 지우기: ${data.cards.get(c.cardId)!.name}` };
}

/** 균열 감소 카드(숨 세기 갈래): 균열을 내리거나 · 소비하거나 · 봉인을 거는 카드 */
export function isReduceCard(def: CardDef): boolean {
  return def.effects.some((e) => (e.op === 'rift' && (e.amount ?? 0) < 0) || e.op === 'consume_rift' || (e.op === 'apply_status' && e.status === 'seal'));
}

/** 상점 꿰매기(상흔 shopAt 이상일 때 연 상점, 상점마다 한 번): 상흔 -shopStitch */
export function buyStitch(data: GameData, run: RunState): BuyResult {
  const shop = shopOf(run);
  const sc = data.balance.rift.scar;
  if (!shop.scarred) return { ok: false, reason: '상흔이 깊을 때만' };
  if (shop.stitchUsed) return { ok: false, reason: '이 상점에서는 이미 꿰맸다' };
  const fail = pay(run, sc.shopStitchGold);
  if (fail) return fail;
  shop.stitchUsed = true;
  const before = run.scar;
  run.scar = Math.max(0, run.scar - sc.shopStitch);
  return { ok: true, message: `꿰매기: 상흔 -${before - run.scar}` };
}

export function buyUpgrade(data: GameData, run: RunState, uid: string): BuyResult {
  const shop = shopOf(run);
  if (shop.upgradeUsed) return { ok: false, reason: '이 상점에서는 이미 강화했다' };
  if (!upgradeCandidates(data, run).some((c) => c.uid === uid)) return { ok: false, reason: '강화할 수 없는 카드' };
  const fail = pay(run, data.balance.economy.shop.upgradePrice);
  if (fail) return fail;
  shop.upgradeUsed = true;
  // 강화 문구는 런 동작(upgrade_card, 고르는 강화)과 같게
  const msgs = applyRunOps(data, run, [{ op: 'upgrade_card', choose: true }], { pick: uid });
  return { ok: true, message: msgs.join(' · ') };
}

/** 대강화(+6~+10, GAME_DESIGN 16절 ⑦) 후보: 덱의 영웅·전설 카드 중 +5 이상, 상한 아래 */
export function forgeCandidates(data: GameData, run: RunState): CardInstance[] {
  const seen = new Set<string>();
  return run.deck.filter((c) => {
    const def = data.cards.get(c.cardId);
    if (!def || c.temp || c.level < data.balance.upgrade.maxLevel || c.level >= forgeMax(data, def)) return false;
    // 캠페인은 보유 카드 단위(같은 카드는 한 장)
    if (!isAbyss(run)) {
      if (seen.has(c.cardId)) return false;
      seen.add(c.cardId);
    }
    return true;
  });
}

const forgeKey = (run: RunState, c: CardInstance) => (isAbyss(run) ? c.uid : c.cardId);

/** 이 카드의 다음 대강화 성공률(천장 반영)과 실패 횟수 */
export function forgeChance(data: GameData, run: RunState, c: CardInstance): { chance: number; base: number; fails: number } {
  const f = data.balance.upgrade.forge;
  const base = f.chance[c.level - data.balance.upgrade.maxLevel] ?? 0;
  const fails = run.forgeFails?.[forgeKey(run, c)] ?? 0;
  return { chance: Math.min(1, base * (1 + f.pity * fails)), base, fails };
}

export type ForgeResult = (BuyResult & { ok: true; success: boolean; level: number; choices: string[] }) | (BuyResult & { ok: false });

/**
 * 대강화 한 번(상점에서, 몇 번이든): price골드를 내고 성공하면 +1, 실패하면 단계 그대로 천장만 오른다.
 * +6~+9에 오르면 각인 후보(choices)가 run.forgePending에 남는다 — chooseEngraving으로 고를 때까지 다음 대강화는 못 한다.
 * 결과는 시드·카드·단계·실패 수로 정해진다(다시 불러와도 같다)
 */
export function buyForge(data: GameData, run: RunState, uid: string): ForgeResult {
  shopOf(run);
  if (run.forgePending) return { ok: false, reason: '먼저 각인을 고른다' };
  const c = forgeCandidates(data, run).find((x) => x.uid === uid);
  if (!c) return { ok: false, reason: '대강화할 수 없는 카드' };
  const fail = pay(run, data.balance.upgrade.forge.price);
  if (fail) return fail as ForgeResult;
  const key = forgeKey(run, c);
  const { chance, fails } = forgeChance(data, run, c);
  const roll = createRng(run.seed).fork(`forge:${key}:${c.level}:${fails}`).next();
  const name = data.cards.get(c.cardId)!.name;
  run.forgeFails ??= {};
  if (roll >= chance) {
    run.forgeFails[key] = fails + 1;
    return {
      ok: true,
      success: false,
      level: c.level,
      choices: [],
      message: `대강화 실패: ${name} +${c.level} 그대로(다음 ${Math.round(forgeChance(data, run, c).chance * 1000) / 10}%)`,
    };
  }
  delete run.forgeFails[key];
  const level = c.level + 1;
  if (isAbyss(run)) c.level = level;
  else {
    run.collection[c.cardId] = level;
    for (const x of run.deck) if (x.cardId === c.cardId) x.level = level;
  }
  const max = forgeMax(data, data.cards.get(c.cardId)!);
  const choices = level < max ? engravingOffer(data, run, c, key) : [];
  run.forgePending = choices.length ? { uid: c.uid, cardId: c.cardId, level, choices } : null;
  return { ok: true, success: true, level, choices, message: level >= max ? `대강화 성공: ${name} +${level} — 각성!` : `대강화 성공: ${name} +${level} — 각인을 고른다` };
}

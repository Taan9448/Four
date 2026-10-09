// 경제(2026-10-08): 전투 전리품(골드·물약·유물)과 상점. 모두 시드로 정해진다(같은 시드·같은 노드면 같은 결과).
import type { GameData } from './data';
import type { MapNode } from './route';
import { createRng, type Rng } from './rng';
import { swapCard, swappableCards } from './collection';
import { addCard, applyRunOps, fireRunRelics, gainPotion, gainRelic, upgradeCandidates, type RunState, type ShopState } from './run';
import { abyssShopPool, abyssShopRift, isAbyss, removePrice } from './abyss';

type Tier = 'common' | 'uncommon' | 'rare';

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

/** 아직 없는 유물 후보(상점·엘리트용: 보스 유물 제외) */
function relicPool(data: GameData, run: RunState, exclude: string[] = []) {
  return [...data.relics.values()].filter((r) => r.rarity !== 'boss' && r.rarity !== 'path' && r.shop && !run.relics.includes(r.id) && !exclude.includes(r.id));
}

/** 이긴 전투의 전리품을 굴린다(적용하지 않는다) */
export function rollLoot(data: GameData, run: RunState, node: MapNode): Loot {
  const eco = data.balance.economy;
  const kind = node.type === 'boss' ? 'boss' : node.type === 'elite' ? 'elite' : 'battle';
  const rng = createRng(run.seed).fork(`loot:${run.stageId}:${node.id}`);
  const [lo, hi] = eco.gold[kind];
  const gold = rng.int(lo, hi);
  const potion = rng.next() < eco.potionDrop[kind] ? (pickByTier(rng, [...data.potions.values()], eco.potionWeights)?.id ?? null) : null;
  let relic: string | null = null;
  let relicChoices: string[] = [];
  if (kind === 'elite') relic = pickByTier(rng, relicPool(data, run), eco.relicWeights.elite)?.id ?? null;
  if (kind === 'boss') {
    const boss = rng.shuffle([...data.relics.values()].filter((r) => r.rarity === 'boss' && !run.relics.includes(r.id))).map((r) => r.id);
    const rare = rng.shuffle(relicPool(data, run).filter((r) => r.rarity === 'rare')).map((r) => r.id);
    relicChoices = [...boss, ...rare].slice(0, eco.bossRelicChoices);
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
  const discount = run.relics.some((id) => data.relics.get(id)?.rule === 'shop_discount') ? data.balance.relicRules.shopDiscount : 1;
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
  run.shop = { nodeId, cards, relics, potions, swapUsed: false, upgradeUsed: false };
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

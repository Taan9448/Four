// 자동 플레이 봇: 엔진만으로 런 전체(S0~S5)를 사람 대신 둔다. 밸런스 측정용(npm run balance). UI·DOM 없음.
//
// 전투: 손에 든 카드마다(대상마다) 전투를 복제해 "이 카드를 쓰고 바로 턴을 끝내면 어떻게 되나"를 끝까지 돌려 보고
//       가장 좋아지는 수를 고른다. 어떤 수도 턴 종료보다 낫지 않으면 턴을 끝낸다(한 수 앞 탐색).
// 지도·선택지·보상: 단순한 규칙과 점수(체력이 낮으면 휴식, 선택지는 런 상태를 복제해 적용한 뒤 점수 비교).
// 봇은 사람보다 약하다. 승률은 절대값이 아니라 스테이지·전투 사이의 상대적인 어려움(난이도 곡선)을 보는 데 쓴다.
import { battleOutcome, canPlay, cloneBattle, createBattle, describeIntent, endTurn, needsTarget, playCard, potionTarget, usePotion } from '../engine/battle';
import { buyCard, buyPotion, buyRelic, buyRemove, buySwap, claimLoot, openShop, rollLoot, swappable, swapPrice } from '../engine/economy';
import { abyssScore, createAbyssRun, isAbyss, pathOffer, pathPicks, removePrice } from '../engine/abyss';
import { recommendLoadout, setLoadout, starterCards } from '../engine/collection';

export { cloneBattle };
import type { GameData } from '../engine/data';
import type { MapNode } from '../engine/route';
import {
  addCard,
  advanceStage,
  gainRelic,
  applyBattleOutcome,
  applyLevelUpgrade,
  applyChoice,
  availableNodes,
  battleSetupFor,
  choiceNeedsPick,
  choiceRemovePick,
  choicesFor,
  createRun,
  createRunAt,
  enterNode,
  isBattle,
  rewardOptions,
  setParty,
  upgradeCandidates,
  type RunOptions,
  type RunState,
} from '../engine/run';
import type { CardDef } from '../engine/schema';
import { alive, type BattleState, type CardInstance } from '../engine/state';

// ───────────────────────── 설정 ─────────────────────────

export interface BotOptions {
  /** 이 값보다 낮은 보상 카드는 받지 않는다(덱이 묽어지지 않게). 일반 2·고급 4·희귀 6·영웅 9 */
  minRewardValue: number;
  /** 적의 힘 1당 그 적의 남은 체력을 이만큼 더 무겁게 친다(오래 끌수록 세지는 적을 먼저) */
  strengthWeight: number;
  /** 다음 턴 하운에게 들어올 예상 피해 1당 감점 */
  threatWeight: number;
  /** 하운 체력 1의 값(동료는 1). 하운이 쓰러지면 패배라 더 무겁다 */
  haunHpWeight: number;
  /** 적의 남은 체력 1의 감점 */
  enemyHpWeight: number;
  /** 보상·강화·상점에서 피해 카드에 주는 가산점 / 방어·회복 카드에 주는 가산점(같은 등급 안에서 갈린다) */
  offenseBias: number;
  defenseBias: number;
  /** 엘리트에 들어가는 하운 체력 비율: 이보다 높으면 엘리트를 먼저, 둘째 값보다 낮으면 피한다 */
  eliteHp: [number, number];
}

/** 기본 봇(두 성향의 바탕. 테스트·전투 추적에 쓴다) */
export const DEFAULT_BOT: BotOptions = {
  minRewardValue: 6,
  strengthWeight: 0,
  threatWeight: 1,
  haunHpWeight: 2,
  enemyHpWeight: 1,
  offenseBias: 3,
  defenseBias: 2,
  eliteHp: [0.75, 0.55],
};

/**
 * 봇 두 종(1단계, 외부 검토 3-E): 한 종이면 그 봇에게만 이득인 선택(서약·유물)이 수치에 섞인다.
 * 보고서는 두 성향의 평균을 대표값으로 쓴다(tools/balance).
 * - 수비형: 들어올 피해·하운 체력을 무겁게, 방어 카드를 고르고, 엘리트는 체력이 넉넉할 때만
 * - 공격형: 적 체력을 빨리 깎는 쪽을, 피해 카드를 고르고, 엘리트를 더 자주
 */
export const BOT_STYLES = {
  guard: { ...DEFAULT_BOT, threatWeight: 1.6, haunHpWeight: 2.5, enemyHpWeight: 0.9, offenseBias: 1, defenseBias: 6, eliteHp: [0.85, 0.65] },
  strike: { ...DEFAULT_BOT, threatWeight: 0.6, haunHpWeight: 2, enemyHpWeight: 1.25, offenseBias: 6, defenseBias: 0, eliteHp: [0.65, 0.45] },
} satisfies Record<string, BotOptions>;

export type BotStyle = keyof typeof BOT_STYLES;
export const BOT_STYLE_NAME: Record<BotStyle, string> = { guard: '수비형', strike: '공격형' };

// ───────────────────────── 전투 ─────────────────────────

/** 전투 상태 점수(클수록 좋다). 턴을 끝낸 뒤(다음 턴 시작)나 전투가 끝난 상태에서 잰다 */
export function scoreBattle(s: BattleState, opts: BotOptions = DEFAULT_BOT): number {
  if (s.result === 'defeat') return -1e6;
  const data = s.data;
  let v = s.result === 'victory' ? 5000 : 0;
  // 하운이 쓰러지면 패배이므로 하운의 체력을 두 배로 친다
  for (const p of s.party) v += p.downed ? -120 : p.hp * (p.defId === 'haun' ? opts.haunHpWeight : 1);
  // 변신이 남은 적(뼈 거인·셀리아스 등)은 다음 모습의 체력까지 친다. 안 그러면 처치하면 체력이 '늘어나' 보여 봇이 마무리를 미룬다
  const phaseHp = (e: (typeof s.enemies)[number]) => {
    const into = data.enemies.get(data.enemies.get(e.defId)?.transform?.into ?? '');
    return into ? Math.round(into.maxHp * (s.enemyHpScale ?? 1)) : 0;
  };
  for (const e of alive(s.enemies)) v -= (e.hp + phaseHp(e)) * opts.enemyHpWeight * (1 + opts.strengthWeight * (e.statuses.strength ?? 0)) + 20;
  if (opts.threatWeight && !s.result) {
    const haun = s.party.find((p) => p.defId === 'haun');
    for (const e of alive(s.enemies)) {
      const view = describeIntent(s, e);
      if (!view?.damage || !haun) continue;
      if (view.damage.all || view.intent.targetUid === haun.uid) v -= opts.threatWeight * view.damage.perHit * view.damage.times;
    }
  }
  const kind = (id: string) => data.statuses.get(id)?.kind;
  for (const p of alive(s.party)) for (const [id, n] of Object.entries(p.statuses)) v += kind(id) === 'buff' ? 2 * n : kind(id) === 'debuff' ? -2 * n : 0;
  // 파워(발동 상태)는 전투가 끝날 때까지 값을 낸다: 한 수 앞만 보는 봇이 미리 깔아 두게
  for (const p of alive(s.party)) for (const [id, n] of Object.entries(p.statuses)) if (data.statuses.get(id)?.triggers.length) v += POWER_VALUE * n;
  for (const e of alive(s.enemies)) for (const [id, n] of Object.entries(e.statuses)) v += kind(id) === 'debuff' ? 2 * n : kind(id) === 'buff' ? -2 * n : 0;
  // 매듭(모르데카이): 결 노출을 문턱까지 쌓아 매듭을 드러내는 준비에 값을 준다(한 수 앞만 보는 봇이 준비 동작을 버리지 않게)
  const knotAt = data.balance.grain.knotThreshold;
  for (const e of alive(s.enemies)) {
    if (!e.statuses.knot) continue;
    v += e.statuses.knot_exposed ? 30 : 8 * Math.min(e.statuses.grain ?? 0, knotAt);
  }
  // 균열은 전투가 끝나면 상흔이 되고, 잔향 카드는 덱을 더럽힌다
  v -= s.rift * 2;
  const echo = data.balance.rift.echoCard;
  for (const pile of [s.draw, s.hand, s.discard]) for (const c of pile) if (c.cardId === echo) v -= 4;
  // 무림·틈은 마나가 전투 사이로 이월된다(아껴 둔 마나에 값)
  const carry = s.manaRule.battleStart === 'carry';
  v += s.mana * (carry ? 2 : 0.2);
  return v;
}

function scoreAfterEndTurn(s: BattleState, opts: BotOptions): number {
  if (s.result) return scoreBattle(s, opts);
  const c = cloneBattle(s);
  c.noCrit = true; // 미리 시험할 때 치명타 운을 엿보지 않는다
  endTurn(c);
  return scoreBattle(c, opts);
}

/** 파워 1스택의 값(남은 전투 동안 낼 값의 어림) */
const POWER_VALUE = 14;
/** 카드를 쓰는 것 자체에 주는 작은 가산점(뽑기·내공 회복처럼 이번 턴 안에서만 값이 나는 카드도 쓰게) */
const PLAY_BIAS = 0.5;
/** 물약을 쓰는 값(아껴 둔다: 이만큼 나아질 때만 쓴다) */
const POTION_COST = 18;

/** 한 턴: 나아지는 수가 없을 때까지 카드를 쓰고 턴을 끝낸다 */
export function playTurn(s: BattleState, opts: BotOptions = DEFAULT_BOT): void {
  for (let guard = 0; guard < 40 && !s.result; guard++) {
    let best: { i: number; t?: string; v: number } | null = null;
    let bestV = scoreAfterEndTurn(s, opts);
    const seen = new Set<string>();
    s.hand.forEach((inst, i) => {
      const key = `${inst.cardId}:${inst.level}`;
      if (seen.has(key) || !canPlay(s, i).ok) return;
      seen.add(key);
      const need = needsTarget(s, inst);
      const targets = need === 'enemy' ? alive(s.enemies).map((e) => e.uid) : need === 'ally' ? alive(s.party).map((p) => p.uid) : [undefined];
      for (const t of targets) {
        const c = cloneBattle(s);
        c.noCrit = true;
        if (!playCard(c, i, t).ok) continue;
        const v = scoreAfterEndTurn(c, opts) + PLAY_BIAS;
        if (v > bestV) {
          bestV = v;
          best = { i, t, v };
        }
      }
    });
    // 물약: 이번 수로 크게 나아질 때만(위험하거나 마무리할 때)
    let potion: { slot: number; t?: string } | null = null;
    s.potions.forEach((id, slot) => {
      if (!id) return;
      const need = potionTarget(s, slot);
      const targets = need === 'enemy' ? alive(s.enemies).map((e) => e.uid) : need === 'ally' ? alive(s.party).map((p) => p.uid) : [undefined];
      for (const t of targets) {
        const c = cloneBattle(s);
        c.noCrit = true;
        if (!usePotion(c, slot, t).ok) continue;
        const v = scoreAfterEndTurn(c, opts) - POTION_COST;
        if (v > bestV) {
          bestV = v;
          potion = { slot, t };
          best = null;
        }
      }
    });
    if (potion) {
      const { slot, t } = potion as { slot: number; t?: string };
      usePotion(s, slot, t);
      continue;
    }
    if (!best) break;
    const { i, t } = best as { i: number; t?: string };
    playCard(s, i, t);
  }
  if (!s.result) endTurn(s);
}

/** 전투를 끝까지 둔다. 너무 길어지면(무한 루프 방지) 패배로 친다 */
export function playBattle(s: BattleState, opts: BotOptions = DEFAULT_BOT, maxTurns = 60): void {
  while (!s.result && s.turn <= maxTurns) playTurn(s, opts);
  if (!s.result) s.result = 'defeat';
}

// ───────────────────────── 런 ─────────────────────────


/** 보스 유물의 대가 어림(봇이 고를 때): 자해·균열·나쁜 상태·독기·최대 체력 감소 */
function relicDownside(data: GameData, id: string): number {
  const r = data.relics.get(id);
  if (!r) return 99;
  let d = 0;
  for (const e of r.effects) {
    if (e.op === 'lose_hp') d += (e.amount ?? 0) * (r.trigger === 'turnStart' ? 1 : 0.3);
    if (e.op === 'rift' && (e.amount ?? 0) > 0) d += e.amount!;
    if (e.op === 'apply_status' && (e.status === 'weak' || e.status === 'vulnerable') && e.target !== 'all_enemies' && e.target !== 'enemy') d += 1;
    if (e.op === 'add_card' && data.cards.get(e.card ?? '')?.type === 'status') d += e.count ?? 1;
    if (e.op === 'gain_max_hp' && (e.amount ?? 0) < 0) d += -e.amount! / 3;
  }
  return d;
}

const RARITY_VALUE: Record<string, number> = { common: 2, uncommon: 4, rare: 6, epic: 9, legendary: 12, special: -10 };

function cardValue(def: CardDef): number {
  if (def.type === 'status') return -10;
  return RARITY_VALUE[def.rarity] ?? 0;
}

/** 성향 가산점: 피해를 주는 카드 / 방어·회복 카드 */
function lean(def: CardDef, opts: BotOptions): number {
  const ops = new Set(def.effects.map((e) => e.op));
  return (ops.has('damage') ? opts.offenseBias : 0) + (ops.has('block') || ops.has('heal') ? opts.defenseBias : 0);
}

/** 골드 1의 값(런 점수) */
const GOLD_VALUE = 0.12;
/**
 * 덱 솎기(1단계, 외부 검토 4-d): 심연에서 덱이 이 장수를 넘으면 카드 1장을 지우는 값을 골드 REMOVAL_GOLD로 친다.
 * 봇이 카드를 안 지우면 밸런스가 큰 덱 기준으로 잡힌다(지우기 전 평균 덱 35~61장)
 */
export const LEAN_DECK = 25;
export const REMOVAL_GOLD = 60;

/** 런 상태 점수(선택지 비교용) */
export function scoreRun(data: GameData, run: RunState): number {
  let v = 0;
  for (const r of run.roster) v += 25 + r.hp * (r.id === 'haun' ? 2 : 1);
  if (run.supportActive) v += 25;
  for (const c of run.deck) {
    const def = data.cards.get(c.cardId)!;
    v += cardValue(def) + c.level * 7;
    if (def.pool === 'starter') v -= 1; // 기본 카드는 덜어 내는 편이 낫다
  }
  v += run.mana * 2;
  v -= run.scar * 8;
  // 골드·유물에도 값을 준다(대가형 사건에서 공짜로 내지 않게)
  v += run.gold * GOLD_VALUE + run.relics.length * 15;
  // 심연: 덱이 크면 한 장 더 있을 때마다 '지우는 값'만큼 손해(휴식 버리기·틈의 거래가 제값을 받는다)
  if (isAbyss(run)) v -= Math.max(0, run.deck.length - LEAN_DECK) * REMOVAL_GOLD * GOLD_VALUE;
  return v;
}

/** 고르는 강화: 등급이 높고 덜 강화된 카드 */
function pickUpgrade(data: GameData, run: RunState, filter: Parameters<typeof upgradeCandidates>[2], opts: BotOptions): string | undefined {
  const list = upgradeCandidates(data, run, filter);
  const score = (c: CardInstance) => {
    const def = data.cards.get(c.cardId)!;
    return cardValue(def) * 10 + lean(def, opts) - c.level * 3;
  };
  return list.sort((a, b) => score(b) - score(a))[0]?.uid;
}

/** 버릴 카드(심연): 덱이 15장 넘을 때만, 가장 값싼 시작 카드 */
function pickRemoval(data: GameData, run: RunState): string | undefined {
  if (run.deck.length <= 15) return undefined;
  const score = (c: CardInstance) => {
    const def = data.cards.get(c.cardId)!;
    return cardValue(def) * 10 + c.level * 5 - (def.pool === 'starter' ? 8 : 0);
  };
  return [...run.deck].sort((a, b) => score(a) - score(b))[0]?.uid;
}

/** 선택지: 각 선택지를 런 사본에 적용해 점수가 가장 높은 것(같으면 앞의 것) */
function decideChoice(data: GameData, run: RunState, enc: { module: Parameters<typeof choicesFor>[2] }, opts: BotOptions): { index: number; pick?: string } | null {
  const choices = choicesFor(data, run, enc.module);
  let best: { index: number; pick?: string; v: number } | null = null;
  choices.forEach((c, index) => {
    if (c.disabled) return;
    const pickEffect = choiceNeedsPick(c);
    const removeEffect = choiceRemovePick(c);
    const copy = structuredClone(run);
    const pick = pickEffect ? pickUpgrade(data, copy, pickEffect.filter, opts) : removeEffect ? pickRemoval(data, copy) : undefined;
    if ((pickEffect || removeEffect) && !pick) return; // 강화·버릴 카드가 없다
    applyChoice(data, copy, enc.module, index, pick);
    const v = scoreRun(data, copy);
    if (!best || v > best.v) best = { index, pick, v };
  });
  return best;
}

/** 보상: 가장 값진 카드(등급 → 공격 우선). 값이 낮거나 덱이 크면 건너뛴다 */
function decideReward(data: GameData, run: RunState, options: string[], opts: BotOptions): string | undefined {
  const score = (id: string) => {
    const def = data.cards.get(id)!;
    return cardValue(def) * 10 + lean(def, opts);
  };
  const best = [...options].sort((a, b) => score(b) - score(a))[0];
  if (!best) return undefined;
  const value = cardValue(data.cards.get(best)!);
  // 얻은 카드는 보유 목록에 영구로 남는다(GAME_DESIGN 9-1): 값이 기준 이상이면 늘 가진다
  if (value < opts.minRewardValue) return undefined;
  // 심연: 덱에 바로 들어가므로 25장이 넘으면 영웅 이상만
  if (isAbyss(run) && run.deck.length >= 25 && value < RARITY_VALUE.epic) return undefined;
  return best;
}

/** 상점: 유물(비싼 등급부터) → 값진 카드 → 물약 → 남으면 편성에 없는 가장 약한 카드 바꾸기 */
function shopTurn(data: GameData, run: RunState, nodeId: string, opts: BotOptions): void {
  const shop = openShop(data, run, nodeId);
  const order = ['rare', 'uncommon', 'common'];
  shop.relics
    .map((r, i) => ({ ...r, i, rank: order.indexOf(data.relics.get(r.relicId)!.rarity) }))
    .sort((a, b) => a.rank - b.rank)
    .forEach((r) => !r.sold && run.gold >= r.price && buyRelic(data, run, r.i));
  // 심연에서 덱이 크면 카드 지우기를 카드·물약보다 먼저: 값(골드 60 + 넘친 장당 10)이 값보다 크면 산다
  const removeFirst = () => {
    if (!isAbyss(run) || run.deck.length <= LEAN_DECK) return;
    const price = removePrice(data, run);
    const uid = pickRemoval(data, run);
    if (uid && run.gold >= price && price <= REMOVAL_GOLD + 10 * (run.deck.length - LEAN_DECK)) buyRemove(data, run, uid);
  };
  removeFirst();
  const bigDeck = isAbyss(run) && run.deck.length >= LEAN_DECK;
  shop.cards.forEach((c, i) => {
    if (c.sold || run.gold < c.price) return;
    // 덱이 큰 심연에서는 영웅 이상만(보상과 같은 기준)
    if (cardValue(data.cards.get(c.cardId)!) >= Math.max(opts.minRewardValue, bigDeck ? RARITY_VALUE.epic : RARITY_VALUE.rare)) buyCard(data, run, i);
  });
  shop.potions.forEach((p, i) => !p.sold && run.gold >= p.price + 40 && buyPotion(data, run, i));
  if (isAbyss(run)) {
    // 심연: 남은 골드로 가장 값싼 카드 지우기(상점마다 한 번)
    const uid = pickRemoval(data, run);
    if (uid && !shop.swapUsed && run.gold >= removePrice(data, run)) buyRemove(data, run, uid);
    return;
  }
  const inLoadout = new Set(Object.values(run.loadout).flat());
  const weakest = swappable(data, run)
    .filter((id) => !inLoadout.has(id))
    .sort((a, b) => cardValue(data.cards.get(a)!) - cardValue(data.cards.get(b)!))[0];
  if (weakest && run.gold >= swapPrice(data, run) + 60) buySwap(data, run, weakest);
}

/** 출전: 하운 + 체력이 많은 동료(카드가 있는 전투원) */
function decideParty(data: GameData, run: RunState): void {
  const mates = run.roster
    .filter((r) => r.id !== 'haun')
    .filter((r) => {
      const def = data.characters.get(r.id)!;
      return def.role === 'fighter' && starterCards(data, r.id).length > 0;
    })
    .sort((a, b) => b.hp / b.maxHp - a.hp / a.maxHp);
  setParty(data, run, ['haun', ...mates.slice(0, data.balance.party.max - 1).map((r) => r.id)]);
}

/** 다음 노드: 하운의 체력 비율에 따라 휴식·전투·엘리트를 고른다 */
function decideNode(run: RunState, nodes: MapNode[], opts: BotOptions): MapNode {
  const haun = run.roster.find((r) => r.id === 'haun')!;
  const hp = haun.hp / haun.maxHp;
  const score = (n: MapNode) => {
    switch (n.type) {
      case 'rest':
      case 'inn':
        return 2 + (1 - hp) * 10;
      case 'event':
        return 4;
      case 'shop':
        return 4.5;
      case 'battle':
        return hp > 0.5 ? 5 : 2;
      case 'elite':
        return hp > opts.eliteHp[0] ? 6 : hp > opts.eliteHp[1] ? 3 : 0;
      default:
        return 10; // 스토리·보스(고정 노드)
    }
  };
  return [...nodes].sort((a, b) => score(b) - score(a))[0];
}

export interface BattleRecord {
  stageId: string;
  moduleId: string;
  type: string;
  floor: number;
  result: 'victory' | 'defeat';
  turns: number;
  /** 출전 멤버 체력 합(전/후)과 최대 체력 합 */
  hpBefore: number;
  hpAfter: number;
  hpMax: number;
  haunBefore: number;
  haunAfter: number;
  rift: number;
}

export interface RunReport {
  seed: string;
  result: 'complete' | 'defeat';
  /** 끝난(진) 스테이지 */
  stageId: string;
  floor: number;
  battles: BattleRecord[];
  /** 스테이지에 들어설 때 하운 체력 비율 */
  stageEntry: { stageId: string; haunRatio: number; deck: number; haunLevel: number }[];
  deckSize: number;
  scar: number;
  /** 끝날 때 가진 유물 */
  relics: string[];
}

const partyHp = (s: BattleState) => s.party.reduce((a, p) => a + Math.max(0, p.downed ? 0 : p.hp), 0);

/** 시드 하나로 S0부터(startStage면 그 스테이지부터, createRunAt) 끝(또는 패배)까지 둔다 */
export function playRun(data: GameData, seed: string, opts: BotOptions = DEFAULT_BOT, startStage?: string, mode: RunOptions = {}): RunReport {
  const run = startStage ? createRunAt(data, seed, startStage, mode) : createRun(data, seed, mode);
  const battles: BattleRecord[] = [];
  const stageEntry: RunReport['stageEntry'] = [];
  let floor = 0;
  let entered = '';
  for (let guard = 0; guard < 500; guard++) {
    if (run.status === 'complete' || run.status === 'defeat') break;
    if (run.status === 'stage_clear') {
      advanceStage(data, run);
      continue;
    }
    // 스테이지 시작 편성: 추천 편성 그대로(GAME_DESIGN 9-1)
    if (run.needsLoadout) setLoadout(data, run, recommendLoadout(data, run, run.loadout));
    if (entered !== run.stageId) {
      entered = run.stageId;
      const haun = run.roster.find((r) => r.id === 'haun')!;
      stageEntry.push({ stageId: run.stageId, haunRatio: haun.hp / haun.maxHp, deck: run.deck.length, haunLevel: haun.level });
    }
    decideParty(data, run);
    const nodes = availableNodes(run);
    if (!nodes.length) throw new Error(`${seed}: ${run.stageId}에서 갈 곳이 없다`);
    const enc = enterNode(data, run, decideNode(run, nodes, opts).id);
    floor = enc.node.floor;
    if (isBattle(enc)) {
      const state = createBattle(data, battleSetupFor(data, run, enc));
      const hpBefore = partyHp(state);
      const haunBefore = state.party.find((p) => p.defId === 'haun')!.hp;
      playBattle(state, opts);
      const outcome = battleOutcome(state)!;
      battles.push({
        stageId: run.stageId,
        moduleId: enc.module.id,
        type: enc.node.type,
        floor,
        result: outcome.result,
        turns: state.turn,
        hpBefore,
        hpAfter: partyHp(state),
        hpMax: state.party.reduce((a, p) => a + p.maxHp, 0),
        haunBefore,
        haunAfter: Math.max(0, state.party.find((p) => p.defId === 'haun')!.hp),
        rift: state.rift,
      });
      applyBattleOutcome(data, run, enc, outcome);
      if (outcome.result === 'victory') {
        // 전리품: 칸이 가득한 물약은 두고 가고, 보스 유물은 대가가 무겁지 않은 첫 후보(모두 무거우면 건너뛴다)
        const loot = rollLoot(data, run, enc.node);
        claimLoot(data, run, loot);
        const pick = loot.relicChoices.find((id) => relicDownside(data, id) < 2);
        if (pick) gainRelic(data, run, pick);
      }
      // 레벨업 강화는 무작위로 바로(봇은 카드 가치를 모른다)
      while (run.pendingUpgrades.length) applyLevelUpgrade(data, run, null);
      run.levelLog = [];
      if (run.status === 'map') {
        const card = decideReward(data, run, rewardOptions(data, run, enc.node.id), opts);
        if (card) addCard(data, run, card);
      }
    } else if (enc.module.type === 'inn' && run.stageGains.length) {
      // 여관: 이번 스테이지에 얻은 카드까지 넣어 추천 편성으로 다시 짠 뒤 선택지
      setLoadout(data, run, recommendLoadout(data, run));
      const d = decideChoice(data, run, enc, opts);
      if (d) applyChoice(data, run, enc.module, d.index, d.pick);
    } else if (enc.module.type === 'shop') {
      shopTurn(data, run, enc.node.id, opts);
    } else {
      const d = decideChoice(data, run, enc, opts);
      if (d) applyChoice(data, run, enc.module, d.index, d.pick);
    }
  }
  return {
    seed,
    result: run.status === 'complete' ? 'complete' : 'defeat',
    stageId: run.stageId,
    floor,
    battles,
    stageEntry,
    deckSize: run.deck.length,
    scar: run.scar,
    relics: [...run.relics],
  };
}


// ───────────────────────── 심연(GAME_DESIGN 16절) ─────────────────────────

/** 봇이 고르는 길 순서 */
const PATH_ORDER = ['path_mountain', 'path_river', 'path_woodcutter', 'path_debt', 'path_needle', 'path_shadow'];

export interface AbyssReport {
  seed: string;
  mates: number;
  /** 쓰러진(또는 멈춘) 굽이 */
  depth: number;
  /** 넘은 굽이 수 */
  cleared: number;
  result: 'defeat' | 'stopped';
  /** 쓰러진 곳: boss · elite · battle */
  diedAt: string | null;
  diedModule: string | null;
  poolSize: number;
  deckSize: number;
  score: number;
  battles: BattleRecord[];
}

/** 심연 런 하나를 maxDepth 굽이까지(또는 쓰러질 때까지) 둔다 */
export function playAbyss(
  data: GameData,
  seed: string,
  start: { mates: string[]; pool: Record<string, number>; oath?: number; unlocked?: string[] },
  opts: BotOptions = DEFAULT_BOT,
  maxDepth = 20,
): AbyssReport {
  const n = pathPicks(data, start.mates.length).picks;
  const offer = pathOffer(data, seed).sort((a, b) => PATH_ORDER.indexOf(a) - PATH_ORDER.indexOf(b));
  const run = createAbyssRun(data, seed, { mates: start.mates, paths: offer.slice(0, n), pool: start.pool, oath: start.oath, unlocked: start.unlocked });
  const battles: BattleRecord[] = [];
  let diedAt: string | null = null;
  let diedModule: string | null = null;
  let result: AbyssReport['result'] = 'stopped';
  for (let guard = 0; guard < 4000; guard++) {
    if (run.status === 'defeat') {
      result = 'defeat';
      break;
    }
    if (run.status === 'stage_clear') {
      if (run.abyss!.depth >= maxDepth) break;
      advanceStage(data, run);
      continue;
    }
    const nodes = availableNodes(run);
    if (!nodes.length) throw new Error(`${seed}: 심연 ${run.abyss!.depth}굽이에서 갈 곳이 없다`);
    const enc = enterNode(data, run, decideNode(run, nodes, opts).id);
    if (isBattle(enc)) {
      const state = createBattle(data, battleSetupFor(data, run, enc));
      const hpBefore = partyHp(state);
      const haunBefore = state.party.find((p) => p.defId === 'haun')!.hp;
      playBattle(state, opts);
      const outcome = battleOutcome(state)!;
      battles.push({
        stageId: `d${run.abyss!.depth}`,
        moduleId: enc.module.id,
        type: enc.node.type,
        floor: enc.node.floor,
        result: outcome.result,
        turns: state.turn,
        hpBefore,
        hpAfter: partyHp(state),
        hpMax: state.party.reduce((a, p) => a + p.maxHp, 0),
        haunBefore,
        haunAfter: Math.max(0, state.party.find((p) => p.defId === 'haun')!.hp),
        rift: state.rift,
      });
      applyBattleOutcome(data, run, enc, outcome);
      if (outcome.result === 'defeat') {
        diedAt = enc.node.type;
        diedModule = enc.module.id;
        continue;
      }
      const loot = rollLoot(data, run, enc.node);
      claimLoot(data, run, loot);
      const pick = loot.relicChoices.find((id) => relicDownside(data, id) < 2);
      if (pick) gainRelic(data, run, pick);
      while (run.pendingUpgrades.length) applyLevelUpgrade(data, run, null);
      run.levelLog = [];
      const card = decideReward(data, run, rewardOptions(data, run, enc.node.id), opts);
      if (card) addCard(data, run, card);
    } else if (enc.module.type === 'shop') {
      shopTurn(data, run, enc.node.id, opts);
    } else {
      const d = decideChoice(data, run, enc, opts);
      if (d) applyChoice(data, run, enc.module, d.index, d.pick);
    }
  }
  const ab = run.abyss!;
  return {
    seed,
    mates: start.mates.length,
    depth: ab.depth,
    cleared: ab.depth - (run.status === 'stage_clear' ? 0 : 1),
    result,
    diedAt,
    diedModule,
    poolSize: Object.keys(ab.pool).length,
    deckSize: run.deck.length,
    score: abyssScore(data, run),
    battles,
  };
}

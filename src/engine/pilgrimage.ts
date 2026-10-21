// 순례(자유 여정 개편, GAME_DESIGN 2절, 2026-10-11 사용자 결정 A안): 첫 순례 보상과 순례 도전.
// 길에서 얻은 것은 보스를 넘기면 클리어한 런에 남는다(run.ts finishReplay, 2026-10-21). 여기서는 한 번 더 받는 첫 순례 보상과
// 보스를 넘길 때 한 번 판정하는 도전(틈의 카드·길·칭호를 연다)을 다룬다.
import type { GameData } from './data';
import { COMMON, ownerKey, upgradeOwned } from './collection';
import { createRng } from './rng';
import type { RunState } from './run';
import type { CardDef, ChallengeDef, Effect, ModuleDef } from './schema';

// ───────── 첫 순례 보상(스테이지당 1회, 영구) ─────────

/** 첫 순례 보상 후보 하나: 새 카드(보유에 +0으로) 또는 가진 카드 +1 강화 */
export type PilgrimOffer = { kind: 'card'; cardId: string } | { kind: 'upgrade'; cardId: string };

/** 아직 받지 않았는가(받았거나 건너뛰었으면 false) */
export const pilgrimRewardDue = (hub: Pick<RunState, 'pilgrimRewarded'>, stageId: string): boolean => !hub.pilgrimRewarded?.[stageId];

/** 모듈(사건·장면 선택지)의 선택지에서 얻는 카드 id */
function choiceCards(module: ModuleDef): string[] {
  const ops: Effect[] = (module.content.choices ?? []).flatMap((c) => [...c.effects, ...(c.outcomes ?? []).flatMap((o) => o.effects)]);
  return ops.filter((e) => e.op === 'gain_card' && e.card).map((e) => e.card!);
}

/**
 * 후보 3장(시드 hub.seed · "pilgrim:" + stageId): ① 그 스테이지 보상 풀(동료 전원 + 공용) 중 아직 없는 카드 →
 * ② 그 스테이지 사건·장면 선택지로만 얻는 이야기 카드 중 아직 없는 것(보스 열쇠 카드 essential은 빼고) → ③ 가진 카드 +1 강화
 */
export function pilgrimRewardOptions(data: GameData, hub: RunState, stageId: string, count = 3): PilgrimOffer[] {
  const rng = createRng(hub.seed).fork(`pilgrim:${stageId}`);
  const owners = new Set([...hub.roster.map((r) => r.id), COMMON]);
  const unowned = (d: CardDef | undefined): d is CardDef => !!d && hub.collection[d.id] === undefined && !d.essential;
  const out: PilgrimOffer[] = [];
  const take = (list: CardDef[], kind: PilgrimOffer['kind']) => {
    for (const d of rng.shuffle(list)) if (out.length < count && !out.some((o) => o.cardId === d.id)) out.push({ kind, cardId: d.id });
  };
  // ① 보상 풀: 보상 카드 가운데 이 일행·공용 것
  take([...data.cards.values()].filter((d) => d.pool === 'reward' && owners.has(ownerKey(data, d)) && unowned(d)), 'card');
  // ② 그 스테이지의 선택지로만 얻는 이야기 카드
  const story = [...data.modules.values()].filter((m) => m.stage === stageId).flatMap(choiceCards);
  take([...new Set(story)].map((id) => data.cards.get(id)).filter((d): d is CardDef => unowned(d) && d.pool === 'story'), 'card');
  // ③ 가진 카드 +1 강화
  take(
    Object.entries(hub.collection)
      .filter(([id, lv]) => !!data.cards.get(id)?.upgrade && lv < data.balance.upgrade.maxLevel)
      .map(([id]) => data.cards.get(id)!),
    'upgrade',
  );
  return out;
}

/** 첫 순례 보상을 받는다(pick null = 건너뛰기). 어느 쪽이든 그 스테이지의 1회는 쓴다. 결과 문구 */
export function claimPilgrimReward(data: GameData, hub: RunState, stageId: string, pick: PilgrimOffer | null): string {
  (hub.pilgrimRewarded ??= {})[stageId] = true;
  if (!pick) return '순례의 보상을 두고 갔다';
  const def = data.cards.get(pick.cardId);
  if (!def) return '';
  if (pick.kind === 'card') {
    if (hub.collection[def.id] === undefined) hub.collection[def.id] = 0;
    return `보유 카드에 더했다: ${def.name}`;
  }
  upgradeOwned(data, hub, def.id);
  return `가진 카드 강화: ${def.name} +${hub.collection[def.id]}`;
}

// ───────── 순례 도전(스테이지마다 3개) ─────────

/** 그 스테이지의 도전(데이터 순서) */
export const stageChallenges = (data: GameData, stageId: string): ChallengeDef[] => [...data.challenges.values()].filter((c) => c.stage === stageId);

/** 이룬 도전인가(클리어한 런 기준) */
export const challengeDone = (hub: Pick<RunState, 'challenges'>, c: ChallengeDef): boolean => !!hub.challenges?.[c.stage]?.includes(c.id);

/** 하운을 뺀 싸운 동료 */
const matesFought = (run: RunState) => (run.stats.fought ?? []).filter((id) => id !== 'haun');

const deckCount = (data: GameData, run: RunState, test: (d: CardDef) => boolean) => run.deck.filter((c) => { const d = data.cards.get(c.cardId); return !!d && test(d); }).length;

/** 길(다시 하는 런)이 그 도전을 채웠는가. 보스전 조건은 이긴 보스전이 있어야 판정된다 */
export function challengeMet(data: GameData, run: RunState, c: ChallengeDef): boolean {
  const k = c.check;
  const st = run.stats;
  const n = k.n ?? 0;
  switch (k.kind) {
    case 'withoutMate':
      return !(st.fought ?? []).includes(k.mate!);
    case 'matesMax':
      return matesFought(run).length <= n;
    case 'onlyWith': {
      const m = matesFought(run);
      return m.length === 1 && m[0] === k.mate;
    }
    case 'noKeyword':
      return deckCount(data, run, (d) => d.keywords.includes(k.keyword!)) === 0;
    case 'noType':
      return deckCount(data, run, (d) => d.type === k.cardType) === 0;
    case 'keywordMax':
      return deckCount(data, run, (d) => d.keywords.includes(k.keyword!)) <= n;
    case 'noSurge':
      return st.surges === 0;
    case 'noRest':
      return !st.rests;
    case 'noShop':
      return !st.shops;
    case 'noDowned':
      return !st.downed;
    case 'bossTurnsMax':
      return !!st.boss && st.boss.turns <= n;
    case 'bossGrain':
      return !!st.boss && st.boss.grain >= n;
    case 'bossKeywordPlays':
      return !!st.boss && Object.entries(st.boss.cards).reduce((a, [id, times]) => a + (data.cards.get(id)?.keywords.includes(k.keyword!) ? times : 0), 0) >= n;
  }
}

/**
 * 걷는 동안의 상태(지도 오른쪽 칸): done 이미 이룸 · broken 이번 길에서는 깨졌다 · ok 지금까지 지키는 중 · open 보스전에서 판정.
 * 동료·덱 조건은 지금 출전·덱으로 미리 본다(출발 때 '가능/불가')
 */
export function challengeState(data: GameData, run: RunState, c: ChallengeDef): 'done' | 'broken' | 'ok' | 'open' {
  const hub = run.replayOf ?? run;
  if (challengeDone(hub, c)) return 'done';
  const k = c.check;
  const mates = [...new Set([...matesFought(run), ...run.selected.filter((id) => id !== 'haun')])];
  switch (k.kind) {
    case 'withoutMate':
      return mates.includes(k.mate!) ? 'broken' : 'ok';
    case 'matesMax':
      return mates.length > (k.n ?? 0) ? 'broken' : 'ok';
    case 'onlyWith':
      return mates.some((m) => m !== k.mate) ? 'broken' : 'ok';
    case 'noKeyword':
    case 'noType':
    case 'keywordMax':
      return challengeMet(data, run, c) ? 'ok' : 'broken';
    case 'noSurge':
    case 'noRest':
    case 'noShop':
    case 'noDowned':
      return challengeMet(data, run, c) ? 'ok' : 'broken';
    default:
      return 'open';
  }
}

/**
 * 보스를 넘긴 길에서 한 번: 새로 이룬 도전을 클리어한 런(hub.challenges)에 적고 돌려준다. 여는 것(틈의 카드·길·칭호)은 부르는 쪽이
 * 저장 칸과 상관없는 기록(심연 기록·프로필)에 남긴다. 이미 이룬 것은 다시 내지 않는다
 */
export function settleChallenges(data: GameData, run: RunState): ChallengeDef[] {
  const hub = run.replayOf;
  if (!hub || (run.status !== 'stage_clear' && run.status !== 'complete')) return [];
  const fresh = stageChallenges(data, run.stageId).filter((c) => !challengeDone(hub, c) && challengeMet(data, run, c));
  if (fresh.length) (hub.challenges ??= {})[run.stageId] = [...(hub.challenges[run.stageId] ?? []), ...fresh.map((c) => c.id)];
  return fresh;
}

/** 도전이 여는 것의 이름 */
export function challengeUnlockName(data: GameData, c: ChallengeDef): string {
  if (c.unlock.card) return `틈의 카드 「${data.cards.get(c.unlock.card)?.name ?? c.unlock.card}」`;
  if (c.unlock.path) return `심연의 ${data.relics.get(c.unlock.path)?.name ?? c.unlock.path}`;
  if (c.unlock.title) return `칭호 「${c.unlock.title}」`;
  return '';
}

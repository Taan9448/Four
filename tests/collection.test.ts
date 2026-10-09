import { describe, expect, it } from 'vitest';
import {
  acquireCard,
  acquirePreview,
  COMMON,
  loadoutOwners,
  loadoutProblems,
  loadPreset,
  ownedEssentials,
  recommendLoadout,
  requiredFor,
  savePreset,
  setLoadout,
  starterCards,
} from '../src/engine/collection';
import { advanceStage, createRun, createRunAt, finishReplay, startReplay } from '../src/engine/run';
import { deserializeRun, serializeRun } from '../src/engine/save';
import { data } from './helpers';

const deckIds = (run: { deck: { cardId: string }[] }) => run.deck.map((c) => c.cardId);

describe('보유 카드와 편성(GAME_DESIGN 9-1)', () => {
  it('런은 하운·공용 시작 카드로 시작하고, 편성 화면을 띄운다. 추천 편성은 규칙을 지킨다', () => {
    const run = createRun(data, 'COL1');
    for (const id of [...starterCards(data, 'haun'), ...starterCards(data, COMMON)]) expect(run.collection[id]).toBe(0);
    expect(run.needsLoadout).toBe(true);
    expect(loadoutOwners(data, run)).toEqual(['haun', COMMON]);
    expect(loadoutProblems(data, run, run.loadout)).toEqual([]);
    setLoadout(data, run, run.loadout);
    expect(run.needsLoadout).toBe(false);
    // 덱 = 편성(하운 + 공용) — 같은 카드는 한 장
    expect(new Set(deckIds(run)).size).toBe(run.deck.length);
    expect(run.deck).toHaveLength(requiredFor(data, run, 'haun') + requiredFor(data, run, COMMON));
  });

  it('편성 검사: 칸 수가 다르거나, 같은 카드 두 장이거나, 남의 카드면 막는다', () => {
    const run = createRun(data, 'COL2');
    const lo = recommendLoadout(data, run);
    expect(() => setLoadout(data, run, { ...lo, haun: lo.haun.slice(1) })).toThrow();
    expect(() => setLoadout(data, run, { ...lo, haun: [...lo.haun.slice(0, -1), lo.haun[0]] })).toThrow();
    expect(() => setLoadout(data, run, { ...lo, [COMMON]: [...lo[COMMON].slice(1), lo.haun[0]] })).toThrow();
  });

  it('카드를 얻으면 영구 보유 + 이번 스테이지 덱. 또 얻으면 강화, 최대면 골드', () => {
    const run = createRun(data, 'COL3');
    setLoadout(data, run, run.loadout);
    const card = [...data.cards.values()].find((c) => c.pool === 'reward' && c.owner === 'haun' && c.upgrade)!;
    // 보상·상점 표시(acquirePreview)는 실제 결과와 같다
    expect(acquirePreview(data, run, card.id)).toEqual({ kind: 'new', level: 0 });
    acquireCard(data, run, card.id);
    expect(run.collection[card.id]).toBe(0);
    expect(acquirePreview(data, run, card.id)).toEqual({ kind: 'upgrade', from: 0, level: 1 });
    expect(run.stageGains).toContain(card.id);
    expect(deckIds(run).filter((id) => id === card.id)).toHaveLength(1);
    acquireCard(data, run, card.id);
    expect(run.collection[card.id]).toBe(1);
    expect(run.deck.find((c) => c.cardId === card.id)!.level).toBe(1);
    expect(deckIds(run).filter((id) => id === card.id)).toHaveLength(1);
    run.collection[card.id] = data.balance.upgrade.maxLevel;
    expect(acquirePreview(data, run, card.id)).toEqual({ kind: 'maxed', level: data.balance.upgrade.maxLevel, gold: data.balance.loadout.maxedGold });
    const gold = run.gold;
    acquireCard(data, run, card.id);
    expect(run.gold).toBe(gold + data.balance.loadout.maxedGold);
  });

  it('다음 스테이지는 다시 편성: 얻은 카드는 보유로 남고, 덱은 편성 + 필수 카드', () => {
    const run = createRunAt(data, 'COL4', 's8');
    setLoadout(data, run, run.loadout);
    const essentials = ownedEssentials(data, run);
    expect(essentials.length).toBeGreaterThan(0); // 천외귀운(S5)
    for (const id of essentials) expect(deckIds(run)).toContain(id);
    const card = [...data.cards.values()].find((c) => c.pool === 'reward' && c.owner === COMMON || (c.pool === 'reward' && run.collection[c.id] === undefined && run.roster.some((r) => r.id === c.owner)))!;
    acquireCard(data, run, card.id);
    run.status = 'stage_clear';
    advanceStage(data, run);
    expect(run.needsLoadout).toBe(true);
    expect(run.stageGains).toEqual([]);
    expect(run.collection[card.id]).toBeDefined();
    for (const id of ownedEssentials(data, run)) expect(deckIds(run)).toContain(id);
  });

  it('편성 저장 칸: 저장·불러오기, 없는 카드는 추천으로 채운다', () => {
    const run = createRun(data, 'COL5');
    savePreset(data, run, 0, run.loadout);
    const gone = run.loadout.haun[0];
    delete run.collection[gone];
    const loaded = loadPreset(data, run, 1);
    expect(loaded).toBeNull();
    const back = loadPreset(data, run, 0)!;
    expect(back.haun).not.toContain(gone);
    expect(loadoutProblems(data, run, back)).toEqual([]);
  });

  it('다시 하기에서 얻은 카드도 클리어한 런에 남는다', () => {
    const hub = createRunAt(data, 'COL6', 's9');
    hub.status = 'complete';
    const replay = startReplay(data, hub, 's1');
    const card = [...data.cards.values()].find((c) => c.pool === 'reward' && hub.collection[c.id] === undefined && hub.roster.some((r) => r.id === c.owner))!;
    acquireCard(data, replay, card.id);
    replay.status = 'defeat';
    expect(finishReplay(replay).collection[card.id]).toBe(0);
  });

  it('옛 저장(덱만)은 덱을 보유 목록으로 바꾸고 이번 스테이지는 그 덱으로 이어 간다', () => {
    const run = createRunAt(data, 'COL7', 's3');
    setLoadout(data, run, run.loadout);
    const old = JSON.parse(serializeRun(run));
    for (const k of ['collection', 'loadout', 'presets', 'needsLoadout', 'stageGains']) delete old.run[k];
    const loaded = deserializeRun(data, JSON.stringify(old))!.run;
    for (const c of run.deck) expect(loaded.collection[c.cardId]).toBeDefined();
    expect(loaded.needsLoadout).toBe(false);
    expect(loaded.deck).toEqual(run.deck);
    expect(loadoutProblems(data, loaded, loaded.loadout)).toEqual([]);
  });
});

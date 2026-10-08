import { describe, expect, it } from 'vitest';
import { codexCards, codexProgress, emptyCodex, noteBattleEnd, noteCard, noteEnemiesSeen, noteRun, noteScene, parseCodex } from '../src/engine/codex';
import { createRun, createRunAt, startReplay } from '../src/engine/run';
import { data } from './helpers';

describe('도감', () => {
  it('런이 가진 카드(가장 높은 강화)·유물·물약·동료를 적는다', () => {
    const run = createRunAt(data, 'CODEX1', 's3');
    run.deck[0].level = 2;
    run.relics = [[...data.relics.keys()][0]];
    run.potions = [[...data.potions.keys()][0], null];
    const c = noteRun(emptyCodex(), run);
    expect(c.cards[run.deck[0].cardId]).toBeGreaterThanOrEqual(2);
    expect(c.relics).toEqual(run.relics);
    expect(c.potions).toEqual([run.potions[0]]);
    expect(c.people).toContain('haun');
    // 낮은 단계로 다시 봐도 최고 단계는 그대로
    noteCard(c, run.deck[0].cardId, 0);
    expect(c.cards[run.deck[0].cardId]).toBeGreaterThanOrEqual(2);
  });

  it('다시 하는 런은 원래 런의 것도 적는다', () => {
    const hub = createRunAt(data, 'CODEX2', 's9');
    hub.status = 'complete';
    hub.relics = [[...data.relics.keys()][1]];
    const replay = startReplay(data, hub, 's1');
    replay.relics = [];
    expect(noteRun(emptyCodex(), replay).relics).toEqual(hub.relics);
  });

  it('적은 만남·이김을 따로 세고, 장면은 화자도 적는다', () => {
    const c = emptyCodex();
    noteEnemiesSeen(c, ['shadow_wolf', 'shadow_wolf']);
    noteBattleEnd(c, ['shadow_wolf', 'shadow_wolf'], false);
    expect(c.enemies.shadow_wolf).toEqual({ seen: 1, defeated: 0 });
    noteEnemiesSeen(c, ['shadow_wolf']);
    noteBattleEnd(c, ['shadow_wolf', 'veilak'], true);
    expect(c.enemies.shadow_wolf).toEqual({ seen: 2, defeated: 1 });
    expect(c.enemies.veilak).toEqual({ seen: 1, defeated: 1 });
    expect(c.stats).toMatchObject({ victories: 1, defeats: 1, kills: 2 });
    const scene = [...data.scenes.values()].find((s) => s.lines.some((l) => l.speaker && data.speakers.has(l.speaker)))!;
    noteScene(data, c, scene.id);
    expect(c.scenes).toEqual([scene.id]);
    expect(c.people.length).toBeGreaterThan(0);
  });

  it('저장을 읽을 때 깨진 값·데이터에 없는 id는 버린다', () => {
    expect(parseCodex(data, null)).toEqual(emptyCodex());
    expect(parseCodex(data, '{oops')).toEqual(emptyCodex());
    const c = parseCodex(data, JSON.stringify({ cards: { no_such: 3, [codexCards(data)[0].id]: 1 }, relics: ['nope'], scenes: [[...data.scenes.keys()][0]], stats: { runs: '4' } }));
    expect(Object.keys(c.cards)).toEqual([codexCards(data)[0].id]);
    expect(c.relics).toEqual([]);
    expect(c.scenes.length).toBe(1);
    expect(c.stats.runs).toBe(4);
  });

  it('채운 칸은 분류마다 전체를 넘지 않는다', () => {
    const run = createRun(data, 'CODEX3');
    const prog = codexProgress(data, noteRun(emptyCodex(), run));
    expect(prog.map((p) => p.label)).toEqual(['카드', '적', '유물', '물약', '인물', '장면']);
    for (const p of prog) expect(p.seen).toBeLessThanOrEqual(p.total);
    expect(prog[0].seen).toBeGreaterThan(0);
  });
});

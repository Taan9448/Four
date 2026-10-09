// 결과 화면 통계(D단계): 전투 집계 → 런 통계
import { describe, expect, it } from 'vitest';
import { battleOutcome, endTurn, playCard } from '../src/engine/battle';
import { loseHp } from '../src/engine/effects';
import { applyBattleOutcome, createRunAt, type Encounter } from '../src/engine/run';
import { deserializeRun, serializeRun } from '../src/engine/save';
import { battle, data, give } from './helpers';

const enc = (): Encounter => {
  const module = [...data.modules.values()].find((m) => m.stage === 's3' && m.type === 'battle')!;
  return { node: { id: 'n1-0', floor: 1, index: 0, type: 'battle', moduleId: module.id, next: [] }, module: { ...module, content: { ...module.content, clearEffects: [] } } };
};

describe('결과 화면 통계', () => {
  it('전투가 준 피해·처치·쓴 카드를 세고, 런 통계에 더한다', () => {
    const s = battle();
    s.neigong = 9;
    const hp = s.enemies[0].hp;
    playCard(s, give(s, 'haun_chop'), s.enemies[0].uid);
    expect(s.tally!.damage).toBe(hp - s.enemies[0].hp);
    expect(s.tally!.cards.haun_chop).toBe(1);
    while (!s.result) {
      s.neigong = 9;
      playCard(s, give(s, 'haun_chop'), s.enemies.find((e) => !e.downed)!.uid);
    }
    expect(s.tally!.kills).toBe(s.enemies.length);
    const run = createRunAt(data, 'STAT', 's3');
    applyBattleOutcome(data, run, enc(), battleOutcome(s)!);
    expect(run.stats.battles).toBe(1);
    expect(run.stats.kills).toBe(s.enemies.length);
    expect(run.stats.cards.haun_chop).toBeGreaterThanOrEqual(2);
    expect(run.stats.turns).toBe(s.turn);
  });

  it('지면 어디서 무엇에 쓰러졌는지 남는다. 옛 저장에는 빈 통계가 붙는다', () => {
    const s = battle();
    loseHp(s, s.party[0], 999);
    const run = createRunAt(data, 'STAT2', 's3');
    const e = enc();
    applyBattleOutcome(data, run, e, battleOutcome(s)!);
    expect(run.status).toBe('defeat');
    expect(run.stats.deathCause).toContain(e.module.name);
    const old = JSON.parse(serializeRun(createRunAt(data, 'STAT3', 's3')));
    delete old.run.stats;
    expect(deserializeRun(data, JSON.stringify(old))!.run.stats.battles).toBe(0);
  });
});

describe('의도 이름표·도감의 기술 기록', () => {
  it('적 행동의 피해 말고 하는 일을 짧은 이름표로(방어·강화·카드·소환)', async () => {
    const { intentBadges } = await import('../src/engine/battle');
    expect(intentBadges(data, [{ op: 'block', amount: 12 }, { op: 'apply_status', status: 'strength', stacks: 2, target: 'self' }])).toEqual(['방어 12', '힘 +2']);
    expect(intentBadges(data, [{ op: 'add_card', card: 'status_miasma', to: 'discard' }, { op: 'summon', enemy: 'test_wolf', count: 2 }])).toEqual(['독기 +1', `소환: ${data.enemies.get('test_wolf')!.name} ×2`]);
  });

  it('전투에서 본 적의 기술이 도감에 남고, 데이터에 없는 기술은 읽을 때 버린다', async () => {
    const { emptyCodex, noteBattleEnd, parseCodex } = await import('../src/engine/codex');
    const c = noteBattleEnd(emptyCodex(), ['shadow_wolf'], true, { shadow_wolf: ['bite', 'bite', 'leap'] });
    expect(c.moves.shadow_wolf).toEqual(['bite', 'leap']);
    const back = parseCodex(data, JSON.stringify({ ...c, moves: { shadow_wolf: ['bite', 'nope'], nobody: ['x'] } }));
    expect(back.moves).toEqual({ shadow_wolf: ['bite'] });
  });

  it('전투 집계는 적이 쓴 행동을 적 id마다 모은다', () => {
    const s = battle();
    for (const e of s.enemies) e.hp = e.maxHp = 999;
    const move = s.enemies[0].intent!.moveId;
    endTurn(s);
    expect(s.tally!.moves![s.enemies[0].defId]).toContain(move);
  });
});

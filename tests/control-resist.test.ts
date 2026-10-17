// 행동 제약 내성(2026-10-16 사용자 요청): 기절·빙결·마비를 맞으면 다음 차례 끝까지 같은 종류가 50% 확률로 듣지 않는다
import { describe, expect, it } from 'vitest';
import { endTurn, playCard } from '../src/engine/battle';
import { addStatus } from '../src/engine/effects';
import { cardText } from '../src/engine/text';
import { battle, data, give } from './helpers';

const fixRng = (s: ReturnType<typeof battle>, v: number) => {
  s.rng = { ...s.rng, next: () => v };
};

describe('행동 제약 내성', () => {
  it('기절이 걸리면 기절 내성이 붙고, 내성이 남은 동안 같은 기절은 확률로 버틴다', () => {
    const s = battle();
    const e = s.enemies[0];
    addStatus(s, e, 'stun', 1);
    expect(e.statuses.stun).toBe(1);
    expect(e.statuses.resist_stun).toBe(data.balance.controlResist.stacks);
    endTurn(s); // 적이 기절로 쉬고, 차례 끝에 기절은 풀리고 내성은 하나 남는다
    expect(e.statuses.stun ?? 0).toBe(0);
    expect(e.statuses.resist_stun).toBe(1);
    fixRng(s, 0.1); // chance(0.5) 미만 → 버틴다
    addStatus(s, e, 'stun', 1);
    expect(e.statuses.stun ?? 0).toBe(0);
    fixRng(s, 0.9); // 이상 → 걸린다(내성은 다시 채워진다)
    addStatus(s, e, 'stun', 1);
    expect(e.statuses.stun).toBe(1);
    expect(e.statuses.resist_stun).toBe(data.balance.controlResist.stacks);
  });

  it('다른 종류의 행동 제약(기절 뒤 빙결)은 그대로 든다', () => {
    const s = battle();
    const e = s.enemies[0];
    addStatus(s, e, 'stun', 1);
    fixRng(s, 0);
    addStatus(s, e, 'bind', 1);
    expect(e.statuses.bind).toBe(1);
  });

  it('내성은 다음 적 차례가 끝나면 사라진다', () => {
    const s = battle();
    const e = s.enemies[0];
    addStatus(s, e, 'stun', 1);
    endTurn(s);
    endTurn(s);
    expect(e.statuses.resist_stun ?? 0).toBe(0);
    fixRng(s, 0);
    addStatus(s, e, 'stun', 1);
    expect(e.statuses.stun).toBe(1);
  });

  it('냉기가 쌓여 얼어붙을 때도 빙결 내성을 따른다', () => {
    const s = battle();
    const e = s.enemies[0];
    addStatus(s, e, 'bind', 1);
    fixRng(s, 0.1);
    addStatus(s, e, 'chill', 3);
    expect(e.statuses.bind).toBe(1); // 처음 빙결만(두 번째는 버팀)
    expect(e.statuses.chill ?? 0).toBe(0);
  });

  it('행동을 막는 상태는 모두 내성을 가진다(적이 처음부터 가진 특성 — 졸음 — 은 빼고)', () => {
    for (const st of data.statuses.values()) {
      if (st.modifiers.skipTurn && st.kind !== 'trait') {
        expect(st.resist, st.id).toBeDefined();
        expect(data.statuses.has(st.resist!), st.id).toBe(true);
      }
    }
  });
});

describe('한정 카드(광역 행동 제약, 2026-10-16)', () => {
  it('적 전체에 기절·빙결·마비를 거는 카드는 모두 한정 또는 고유다', () => {
    const bad: string[] = [];
    for (const c of data.cards.values()) {
      const effects = [...c.effects, ...(c.upgrade ? [...c.upgrade.plus4.effects, ...c.upgrade.plus5.effects] : [])];
      const aoe = effects.some((e) => e.op === 'apply_status' && !!e.status && !!data.statuses.get(e.status)?.modifiers.skipTurn && (e.target ?? c.target) === 'all_enemies');
      if (aoe && !c.keywords.includes('limited') && !c.keywords.includes('unique')) bad.push(c.id);
    }
    expect(bad).toEqual([]);
  });

  it('심연 덱에 limitedCopies장까지만, 그 뒤로는 보상 후보에도 나오지 않는다', async () => {
    const { abyssAddCard, copyLimit, createAbyssRun, pathOffer, pathPicks } = await import('../src/engine/abyss');
    const run = createAbyssRun(data, 'LIMIT', { mates: ['elia', 'kyle', 'born'], paths: pathOffer(data, 'LIMIT').slice(0, pathPicks(data, 3).picks), pool: {} });
    const def = data.cards.get('born_cliff')!;
    expect(copyLimit(data, def)).toBe(data.balance.limitedCopies);
    const before = run.deck.filter((c) => c.cardId === 'born_cliff').length;
    for (let i = before; i < data.balance.limitedCopies + 1; i++) abyssAddCard(data, run, 'born_cliff');
    expect(run.deck.filter((c) => c.cardId === 'born_cliff').length).toBe(data.balance.limitedCopies);
    expect(abyssAddCard(data, run, 'born_cliff')).toContain('한정');
  });

  it('졸음(교세소 보초): 처음 두 차례는 행동하지 않고, 졸 때 맞으면 깨면서 기절 1', () => {
    const s = battle({ enemies: ['sleeping_sentry'] });
    const sentry = s.enemies[0];
    expect(sentry.statuses.drowsy).toBe(2);
    const strike = s.hand.findIndex((c) => c.cardId === 'haun_chop');
    expect(playCard(s, strike, sentry.uid).ok).toBe(true);
    expect(sentry.statuses.drowsy ?? 0).toBe(0);
    expect(sentry.statuses.stun).toBe(1);
  });

  it('수면 카드(#1316): 졸음을 걸면 수면 내성이 붙고, 내성이 남은 동안 같은 졸음은 확률로 버틴다', () => {
    const s = battle({ party: [{ id: 'haun', hp: 600, maxHp: 600 }, { id: 'elia', hp: 500, maxHp: 500 }] });
    const e = s.enemies[0];
    s.neigong = 9;
    expect(playCard(s, give(s, 'elia_mist_herb'), e.uid).ok).toBe(true);
    expect(e.statuses.drowsy).toBe(2);
    expect(e.statuses.resist_sleep).toBe(data.balance.controlResist.stacks);
    fixRng(s, 0.1);
    addStatus(s, e, 'drowsy', 1);
    expect(e.statuses.drowsy).toBe(2);
    // 졸 때 맞아서 깨면 기절은 그대로 든다(수면 내성은 기절을 막지 않는다)
    expect(playCard(s, give(s, 'haun_chop'), e.uid).ok).toBe(true);
    expect(e.statuses.drowsy ?? 0).toBe(0);
    expect(e.statuses.stun).toBe(1);
  });

  it('잠결 베기: 졸고 있는 적에게 피해 +80, 깨어 있으면 기본 피해만', () => {
    const awake = battle();
    awake.neigong = 9;
    const a = awake.enemies[0];
    const hp0 = a.hp;
    playCard(awake, give(awake, 'haun_drowsy_seam'), a.uid);
    const sleeping = battle();
    sleeping.neigong = 9;
    const b = sleeping.enemies[0];
    addStatus(sleeping, b, 'drowsy', 2);
    const hp1 = b.hp;
    playCard(sleeping, give(sleeping, 'haun_drowsy_seam'), b.uid);
    expect(hp1 - b.hp - (hp0 - a.hp)).toBe(80);
    expect(b.statuses.stun).toBe(1);
  });

  it('적에게 거는 졸음은 지속 효과가 아니라 "졸음 n 부여"로 적는다', () => {
    expect(cardText(data, 'elia_mist_herb')).toBe('졸음 2 부여. 방어 30');
    expect(cardText(data, 'common_sleep_point')).toContain('피해 30. 졸음 2 부여');
    expect(cardText(data, 'elia_sleeping_valley')).toContain('적 전체에게 졸음 1 부여');
  });

  it('부동인 적은 졸음도 걸리지 않는다', () => {
    const s = battle();
    const e = s.enemies[0];
    e.statuses.steadfast = 1;
    addStatus(s, e, 'drowsy', 2);
    expect(e.statuses.drowsy ?? 0).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import { battleOutcome, canPlay, endTurn, playCard } from '../src/engine/battle';
import { cardText } from '../src/engine/text';
import { createRng } from '../src/engine/rng';
import { battle, cards, data, give } from './helpers';

const wolf = (s: ReturnType<typeof battle>) => s.enemies[0];

describe('효과 해석기와 자원', () => {
  it('카드 비용으로 내공·마나를 소모한다', () => {
    const s = battle();
    const i = give(s, 'haun_byeogun');
    expect(s.neigong).toBe(3);
    expect(s.mana).toBe(10);
    expect(playCard(s, i, wolf(s).uid).ok).toBe(true);
    expect(s.neigong).toBe(2);
    expect(s.mana).toBe(8);
  });

  it('비용이 모자라면 쓸 수 없다', () => {
    const s = battle();
    s.mana = 1;
    const i = give(s, 'haun_byeogun');
    expect(canPlay(s, i)).toEqual({ ok: false, reason: '마나 부족' });
  });

  it('대상이 필요한 카드는 대상 없이 쓸 수 없다', () => {
    const s = battle();
    const i = give(s, 'haun_chop');
    expect(playCard(s, i).ok).toBe(false);
  });

  it('엘하임은 전투 시작 시 마나가 가득 차고 턴마다 +2, 무림은 이월하고 회복 없음', () => {
    const e = battle({ world: 'elheim', mana: 0 });
    expect(e.mana).toBe(10);
    e.mana = 3;
    endTurn(e);
    expect(e.mana).toBe(5);

    const m = battle({ world: 'murim', mana: 4 });
    expect(m.mana).toBe(4);
    endTurn(m);
    expect(m.mana).toBe(4);

    const r = battle({ world: 'rift', mana: 4 });
    endTurn(r);
    expect(r.mana).toBe(3);
  });

  it('카드 문구를 효과로부터 만든다', () => {
    expect(cardText(data, 'haun_chop')).toBe('피해 6');
    expect(cardText(data, 'haun_byeogun')).toContain('융합');
    expect(cardText(data, 'haun_byeogun')).toContain('균열 +3');
    for (const id of data.cards.keys()) expect(cardText(data, id).length).toBeGreaterThan(0);
  });
});

describe('균열', () => {
  it('융합 카드를 쓰면 균열이 오른다', () => {
    const s = battle({ enemies: ['ignis'] });
    const i = give(s, 'haun_byeogun');
    playCard(s, i, s.enemies[0].uid);
    expect(s.rift).toBe(3);
  });

  it('세계별로 턴 종료 감쇠가 다르다(엘하임 -2, 마왕성 -1, 무림 0)', () => {
    for (const [world, expected] of [['elheim', 4], ['nocturna', 5], ['murim', 6], ['rift', 6]] as const) {
      const s = battle({ world, enemies: ['ignis'] });
      s.rift = 6;
      s.enemies[0].intent = null; // 적 행동 없음
      endTurn(s);
      expect(s.rift, world).toBe(expected);
    }
  });

  it('감쇠 뒤에도 임계치 이상이면 틈의 잔향이 덱에 들어간다', () => {
    const s = battle({ world: 'murim', enemies: ['ignis'] });
    s.rift = 5;
    s.enemies[0].intent = null;
    endTurn(s);
    const all = [...s.draw, ...s.discard, ...s.hand].map((c) => c.cardId);
    expect(all).toContain('status_rift_echo');
    const echo = s.hand.findIndex((c) => c.cardId === 'status_rift_echo');
    if (echo >= 0) expect(canPlay(s, echo).ok).toBe(false);
  });

  it('균열이 최대치에 이르면 폭주: 파티 전원 피해, 균열은 초기화값으로', () => {
    const s = battle({
      enemies: ['ignis'],
      party: [{ id: 'haun', hp: 60, maxHp: 60 }, { id: 'elia', hp: 42, maxHp: 42 }],
    });
    s.rift = 8;
    const i = give(s, 'haun_byeogun');
    playCard(s, i, s.enemies[0].uid);
    expect(s.events.some((e) => e.type === 'surge')).toBe(true);
    expect(s.rift).toBe(5);
    expect(s.party[0].hp).toBe(55);
    expect(s.party[1].hp).toBe(37);
  });

  it('전투가 끝나면 남은 균열의 절반이 상흔이 된다', () => {
    const s = battle();
    s.rift = 5;
    wolf(s).hp = 1;
    const i = give(s, 'haun_chop');
    playCard(s, i, wolf(s).uid);
    expect(battleOutcome(s)).toMatchObject({ result: 'victory', scarGain: 2 });
  });
});

describe('결 읽기와 특수 상태', () => {
  it('결 노출은 1스택을 소모해 피해 +50%, 방어 무시', () => {
    const s = battle({ enemies: ['ignis'] });
    const boss = s.enemies[0];
    boss.block = 20;
    playCard(s, give(s, 'haun_read_grain'), boss.uid);
    expect(boss.statuses.grain).toBe(2);
    playCard(s, give(s, 'haun_chop'), boss.uid);
    expect(boss.hp).toBe(120 - 9);
    expect(boss.block).toBe(20);
    expect(boss.statuses.grain).toBe(1);
  });

  it('무형: 내공만 쓰는 공격은 절반', () => {
    const s = battle({ enemies: ['shadow_wraith'] });
    const w = s.enemies[0];
    playCard(s, give(s, 'haun_chop'), w.uid);
    expect(w.hp).toBe(30 - 3);
    playCard(s, give(s, 'haun_byeogun'), w.uid);
    expect(w.hp).toBe(30 - 3 - 18);
  });

  it('흐름 포식: 흐름을 쓴 카드의 피해를 먹고, 매듭이 드러나면 날 얹기가 통한다', () => {
    const s = battle({ world: 'rift', enemies: ['mordecai'] });
    const m = s.enemies[0];
    playCard(s, give(s, 'haun_chop'), m.uid);
    expect(m.hp).toBe(206);
    expect(m.maxHp).toBe(206);
    s.neigong = 10;
    playCard(s, give(s, 'haun_read_grain'), m.uid);
    expect(m.statuses.knot_exposed).toBeUndefined();
    playCard(s, give(s, 'haun_read_grain'), m.uid);
    expect(m.statuses.knot_exposed).toBe(1);
    const before = m.hp;
    playCard(s, give(s, 'haun_place_blade'), m.uid);
    // 3 ×1.5(결) + 40 ×1.5(결) — 비용 0 카드라 흡수되지 않는다
    expect(before - m.hp).toBe(4 + 60);
  });
});

describe('파티', () => {
  const duo = [
    { id: 'haun', hp: 60, maxHp: 60 },
    { id: 'elia', hp: 42, maxHp: 42 },
  ];

  it('출전은 최대 3명이고 하운은 반드시 출전한다', () => {
    expect(() => battle({ party: [{ id: 'elia', hp: 1, maxHp: 1 }] })).toThrow();
    expect(() =>
      battle({ party: ['haun', 'elia', 'kyle', 'born'].map((id) => ({ id, hp: 10, maxHp: 10 })) }),
    ).toThrow();
    expect(() => battle({ party: [{ id: 'haun', hp: 1, maxHp: 1 }, { id: 'wang', hp: 1, maxHp: 1 }] })).toThrow();
  });

  it('출전하지 않은 동료의 카드는 덱에서 빠진다', () => {
    const s = battle({ deck: cards('haun_chop', 'elia_fireball', 'elia_fireball') });
    expect([...s.draw, ...s.hand].map((c) => c.cardId)).toEqual(['haun_chop']);
  });

  it('쓰러진 동료의 카드는 쓸 수 없고, 뽑히는 즉시 버려진다', () => {
    const s = battle({ party: duo, deck: cards('elia_fireball', 'elia_fireball', 'elia_fireball', 'haun_chop') });
    s.party[1].hp = 0;
    s.party[1].downed = true;
    const i = s.hand.findIndex((c) => c.cardId === 'elia_fireball');
    expect(canPlay(s, i).ok).toBe(false);
    s.hand = [];
    s.draw = [...s.discard, ...cards('elia_fireball', 'haun_chop')];
    s.discard = [];
    endTurn(s);
    expect(s.hand.map((c) => c.cardId)).not.toContain('elia_fireball');
    expect(s.events.some((e) => e.type === 'dead_draw')).toBe(true);
  });

  it('하운이 쓰러지면 패배, 동료는 전투 후 체력 1로 복귀', () => {
    const s = battle({ party: duo });
    s.party[1].hp = 1;
    s.party[0].hp = 1;
    s.enemies[0].intent = { moveId: 'bite', name: '물어뜯기', kind: 'attack', targetUid: s.party[1].uid };
    endTurn(s);
    expect(s.party[1].downed).toBe(true);
    expect(s.result).toBeNull();
    s.enemies[0].intent = { moveId: 'bite', name: '물어뜯기', kind: 'attack', targetUid: s.party[0].uid };
    s.party[0].block = 0;
    endTurn(s);
    expect(s.result).toBe('defeat');
    expect(battleOutcome(s)!.party.find((p) => p.id === 'elia')!.hp).toBe(1);
  });

  it('얼음 벽은 지정한 아군에게 방어를 준다', () => {
    const s = battle({ party: duo });
    playCard(s, give(s, 'elia_ice_wall'), s.party[0].uid);
    expect(s.party[0].block).toBe(7);
    expect(s.party[1].block).toBe(0);
  });

  it('왼편의 검(선천)은 첫 손패에 반드시 들어온다', () => {
    const party = [{ id: 'haun', hp: 60, maxHp: 60 }, { id: 'kyle', hp: 52, maxHp: 52 }];
    const filler = Array.from({ length: 12 }, () => 'haun_chop');
    for (const seed of ['a', 'b', 'c', 'd']) {
      const s = battle({ party, deck: cards(...filler, 'kyle_left_blade'), rng: createRng(seed) });
      expect(s.hand.map((c) => c.cardId)).toContain('kyle_left_blade');
    }
  });

  it('날개 베기는 적에게 큰 피해와 약화, 카일 자신은 대가로 피해를 입는다', () => {
    const s = battle({ party: [{ id: 'haun', hp: 60, maxHp: 60 }, { id: 'kyle', hp: 52, maxHp: 52 }], enemies: ['shadow_wolf_alpha'] });
    const before = wolf(s).hp;
    playCard(s, give(s, 'kyle_wing_cut'), wolf(s).uid);
    expect(before - wolf(s).hp).toBe(18);
    expect(wolf(s).statuses.weak).toBe(2);
    expect(s.party[1].hp).toBe(49);
    expect(s.party[0].hp).toBe(60);
  });

  it('먼저 가: 보른이 도발하면 다른 동료를 노리던 공격이 보른에게 간다', () => {
    const s = battle({ party: [{ id: 'haun', hp: 60, maxHp: 60 }, { id: 'born', hp: 70, maxHp: 70 }] });
    s.enemies[0].intent = { moveId: 'bite', name: '물어뜯기', kind: 'attack', targetUid: s.party[0].uid };
    playCard(s, give(s, 'born_go_first'));
    expect(s.party[1].block).toBe(15);
    endTurn(s);
    expect(s.party[0].hp).toBe(60);
    expect(s.party[1].block).toBeLessThan(15);
  });

  it('같이 가: 출전한 아군 전원에게 방어', () => {
    const s = battle({ party: [{ id: 'haun', hp: 60, maxHp: 60 }, { id: 'born', hp: 70, maxHp: 70 }] });
    playCard(s, give(s, 'born_together'));
    expect(s.party.map((p) => p.block)).toEqual([6, 6]);
  });

  it('빙결된 적은 행동하지 못한다', () => {
    const s = battle({ party: duo });
    playCard(s, give(s, 'elia_freeze'), wolf(s).uid);
    const hp = s.party[0].hp + s.party[1].hp;
    s.enemies[0].intent = { moveId: 'bite', name: '물어뜯기', kind: 'attack', targetUid: s.party[0].uid };
    endTurn(s);
    expect(s.party[0].hp + s.party[1].hp).toBe(hp);
    expect(wolf(s).statuses.bind).toBeUndefined();
  });
});

describe('왕일검 지원 규칙', () => {
  it('청운호흡 박자: 4턴마다 내공 +1, 카드 1장 추가', () => {
    const s = battle({ supportActive: true, enemies: ['ignis'], deck: cards(...Array(14).fill('haun_chop')) });
    s.party[0].hp = 9999;
    s.party[0].maxHp = 9999;
    const handSizes: number[] = [];
    const neigong: number[] = [];
    for (let t = 1; t <= 8; t++) {
      neigong.push(s.neigong);
      handSizes.push(s.hand.length);
      endTurn(s);
    }
    expect(neigong).toEqual([3, 3, 3, 4, 3, 3, 3, 4]);
    expect(handSizes[3]).toBe(handSizes[2] + 1);
  });

  it('지원이 꺼져 있으면 아무 일도 없다', () => {
    const s = battle({ supportActive: false, enemies: ['ignis'] });
    for (let t = 1; t < 4; t++) endTurn(s);
    expect(s.turn).toBe(4);
    expect(s.neigong).toBe(3);
  });

  it('장작의 결: 전투당 1회, 균열 7 이상이 되면 -3', () => {
    const s = battle({ supportActive: true, enemies: ['ignis'] });
    s.rift = 5;
    playCard(s, give(s, 'haun_byeogun'), s.enemies[0].uid);
    expect(s.rift).toBe(5);
    s.neigong = 5;
    s.mana = 10;
    playCard(s, give(s, 'haun_byeogun'), s.enemies[0].uid);
    expect(s.rift).toBe(8);
  });

  it('도진아: 곽도진의 체력이 절반 이하가 되면 1턴 기절', () => {
    const s = battle({ supportActive: true, enemies: ['kwak_dojin'] });
    const kwak = s.enemies[0];
    kwak.hp = 85;
    playCard(s, give(s, 'haun_chop'), kwak.uid);
    expect(kwak.statuses.stun).toBe(1);
    const hp = s.party[0].hp;
    endTurn(s);
    expect(s.party[0].hp).toBe(hp);
    expect(kwak.statuses.stun).toBeUndefined();
  });
});

describe('결정성', () => {
  it('같은 시드와 같은 입력이면 같은 전투가 된다', () => {
    const run = () => {
      const s = battle({ enemies: ['shadow_wolf', 'shadow_wolf'] });
      for (let t = 0; t < 5 && !s.result; t++) {
        const i = s.hand.findIndex((c) => c.cardId === 'haun_chop');
        const target = s.enemies.find((e) => !e.downed);
        if (i >= 0 && target) playCard(s, i, target.uid);
        endTurn(s);
      }
      return JSON.stringify({ log: s.log, hp: s.party[0].hp });
    };
    expect(run()).toBe(run());
  });
});

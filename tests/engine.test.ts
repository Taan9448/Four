import { describe, expect, it } from 'vitest';
import { _internal, battleOutcome, canPlay, endTurn, incomingDamage, playCard, playCost } from '../src/engine/battle';
import { intentHidden, resolveCard } from '../src/engine/state';
import { cardText, cardTextParts } from '../src/engine/text';
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

  it('엘하임은 전투 시작 시 마나가 가득 차고 턴마다 +2, 무림은 이월하고 회복 없음, 틈은 마나가 없다', () => {
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
    expect(r.mana).toBe(0);
    endTurn(r);
    expect(r.mana).toBe(0);
  });

  it('카드 문구를 효과로부터 만든다', () => {
    expect(cardText(data, 'haun_chop')).toBe('피해 60');
    expect(cardText(data, 'haun_byeogun')).toContain('융합');
    expect(cardText(data, 'haun_byeogun')).toContain('균열 +3');
    for (const id of data.cards.keys()) expect(cardText(data, id).length).toBeGreaterThan(0);
    // 대상 이름은 엔진 규칙과 같다: 적 전체 카드라도 방어는 자신에게, 상태는 적 전체에게
    expect(cardText(data, 'haun_nakun')).toBe('방어 80 (균열 1당 +10, 최대 +80). 적 전체에게 약화 1 부여');
    // 명시한 아군 대상(부작용)도 글에 드러난다
    expect(cardText(data, 'abyss_elia_black_fire')).toContain('아군 전체에게 화상 1 부여');
  });

  it('카드 글을 키워드 배지·본문·특수 스킬로 나눈다(2026-10-11)', () => {
    const fusion = cardTextParts(data, 'haun_byeogun');
    expect(fusion.keywords.map((k) => k.key)).toContain('fusion');
    expect(fusion.body).not.toContain('융합');
    expect(fusion.body).toContain('균열 +3');
    // +5: 열린 특수 스킬 두 줄은 본문과 따로(★ 없이 이름·내용), 키워드를 더하는 스킬은 배지에도
    const id = [...data.cards.values()].find((d) => d.upgrade?.plus5.addKeywords.length)!.id;
    const top = cardTextParts(data, { uid: 'x', cardId: id, level: 5 });
    expect(top.skills.map((sk) => sk.level)).toEqual([4, 5]);
    expect(top.skills[1].text).not.toMatch(/^★/);
    expect(top.keywords.map((k) => k.key)).toEqual(expect.arrayContaining(data.cards.get(id)!.upgrade!.plus5.addKeywords));
    expect(cardTextParts(data, { uid: 'y', cardId: id, level: 3 }).skills).toEqual([]);
  });
});

describe('균열', () => {
  it('융합 카드를 쓰면 균열이 오른다', () => {
    const s = battle({ enemies: ['test_ignis'] });
    const i = give(s, 'haun_byeogun');
    playCard(s, i, s.enemies[0].uid);
    expect(s.rift).toBe(3);
  });

  it('세계별로 턴 종료 감쇠가 다르다(엘하임 -2, 마왕성 -1, 무림 0)', () => {
    for (const [world, expected] of [['elheim', 4], ['nocturna', 5], ['murim', 6], ['rift', 6]] as const) {
      const s = battle({ world, enemies: ['test_ignis'] });
      s.rift = 6;
      s.enemies[0].intent = null; // 적 행동 없음
      endTurn(s);
      expect(s.rift, world).toBe(expected);
    }
  });

  it('감쇠 뒤에도 임계치 이상이면 틈의 잔향이 덱에 들어간다', () => {
    const s = battle({ world: 'murim', enemies: ['test_ignis'] });
    s.rift = 5;
    s.enemies[0].intent = null;
    endTurn(s);
    const all = [...s.draw, ...s.discard, ...s.hand].map((c) => c.cardId);
    expect(all).toContain('status_rift_echo');
  });

  it('틈의 잔향: 손에 든 채 턴이 끝나면 균열 +1, 내공 1로 털어 낼 수 있다(소멸)', () => {
    const s = battle({ world: 'murim', enemies: ['test_ignis'] });
    s.enemies[0].intent = null;
    s.hand = [];
    const i = give(s, 'status_rift_echo');
    give(s, 'status_rift_echo');
    expect(canPlay(s, i).ok).toBe(true);
    const nb = s.neigong;
    playCard(s, i);
    expect(s.neigong).toBe(nb - 1);
    expect(s.exhaust.map((c) => c.cardId)).toContain('status_rift_echo');
    s.rift = 1;
    endTurn(s);
    expect(s.rift).toBe(2);
  });

  it('균열이 최대치에 이르면 폭주: 파티 전원 피해, 균열은 초기화값으로', () => {
    const s = battle({
      enemies: ['test_ignis'],
      party: [{ id: 'haun', hp: 600, maxHp: 600 }, { id: 'elia', hp: 420, maxHp: 420 }],
    });
    s.rift = 8;
    const i = give(s, 'haun_byeogun');
    playCard(s, i, s.enemies[0].uid);
    expect(s.events.some((e) => e.type === 'surge')).toBe(true);
    // ① 최대 체력 10%(올림), 하운은 50 더 ② 적 힘 +1 ③ 잔향 2장을 손패에 ④ 상흔 +3, 균열은 3으로
    expect(s.rift).toBe(3);
    expect(s.party[0].hp).toBe(600 - 60 - 50);
    expect(s.party[1].hp).toBe(420 - 42);
    expect(s.enemies[0].statuses.strength).toBe(1);
    expect(s.hand.filter((c) => c.cardId === 'status_rift_echo')).toHaveLength(2);
    expect(s.tally?.surgeScar).toBe(3);
    // 같은 전투의 두 번째 폭주는 ×2
    s.neigong = 9;
    s.mana = 9;
    s.rift = 8;
    playCard(s, give(s, 'haun_byeogun'), s.enemies[0].uid);
    expect(s.party[1].hp).toBe(420 - 42 - 84);
    expect(s.tally?.surges).toBe(2);
  });

  it('상흔이 남은 만큼 금이 간 채 시작한다(상흔 ÷ 5, 최대 4)', () => {
    expect(battle({ scar: 0 }).rift).toBe(0);
    expect(battle({ scar: 12 }).rift).toBe(2);
    expect(battle({ scar: 40 }).rift).toBe(4);
  });

  it('전투가 끝나면 남은 균열의 절반이 상흔이 된다', () => {
    const s = battle();
    s.rift = 5;
    wolf(s).hp = 10;
    const i = give(s, 'haun_chop');
    playCard(s, i, wolf(s).uid);
    expect(battleOutcome(s)).toMatchObject({ result: 'victory', scarGain: 2 });
  });
});

describe('결 읽기와 특수 상태', () => {
  it('결 노출은 1스택을 소모해 피해 +50%, 방어 무시', () => {
    const s = battle({ enemies: ['test_ignis'] });
    const boss = s.enemies[0];
    boss.block = 200;
    playCard(s, give(s, 'haun_read_grain'), boss.uid);
    expect(boss.statuses.grain).toBe(2);
    playCard(s, give(s, 'haun_chop'), boss.uid);
    expect(boss.hp).toBe(1200 - 90);
    expect(boss.block).toBe(200);
    expect(boss.statuses.grain).toBe(1);
  });

  it('무형: 내공만 쓰는 공격은 절반', () => {
    const s = battle({ enemies: ['test_wraith'] });
    const w = s.enemies[0];
    playCard(s, give(s, 'haun_chop'), w.uid);
    expect(w.hp).toBe(300 - 30);
    playCard(s, give(s, 'haun_byeogun'), w.uid);
    expect(w.hp).toBe(300 - 30 - 180);
  });

  it('흐름 포식: 흐름을 쓴 카드의 피해를 먹고, 매듭이 드러나면 날 얹기가 통한다', () => {
    const s = battle({ world: 'rift', enemies: ['mordecai'] });
    const m = s.enemies[0];
    const base = data.enemies.get('mordecai')!.maxHp;
    playCard(s, give(s, 'haun_chop'), m.uid);
    expect(m.hp).toBe(base + 60);
    expect(m.maxHp).toBe(base + 60);
    s.neigong = 10;
    playCard(s, give(s, 'haun_read_grain'), m.uid);
    expect(m.statuses.knot_exposed).toBeUndefined();
    playCard(s, give(s, 'haun_read_grain'), m.uid);
    expect(m.statuses.knot_exposed).toBe(1);
    const before = m.hp;
    playCard(s, give(s, 'haun_place_blade'), m.uid);
    // 30 ×1.5(결) + 400 ×1.5(결) — 비용 0 카드라 흡수되지 않는다
    expect(before - m.hp).toBe(45 + 600);
  });
});

describe('파티', () => {
  const duo = [
    { id: 'haun', hp: 600, maxHp: 600 },
    { id: 'elia', hp: 420, maxHp: 420 },
  ];

  it('출전은 최대 3명이고 하운은 반드시 출전한다', () => {
    expect(() => battle({ party: [{ id: 'elia', hp: 10, maxHp: 10 }] })).toThrow();
    expect(() =>
      battle({ party: ['haun', 'elia', 'kyle', 'born'].map((id) => ({ id, hp: 10, maxHp: 10 })) }),
    ).toThrow();
    expect(() => battle({ party: [{ id: 'haun', hp: 10, maxHp: 10 }, { id: 'wang', hp: 10, maxHp: 10 }] })).toThrow();
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

  it('하운이 쓰러지면 패배, 동료는 전투 후 체력 10으로 복귀', () => {
    const s = battle({ party: duo });
    s.party[1].hp = 10;
    s.party[0].hp = 10;
    s.enemies[0].intent = { moveId: 'bite', name: '물어뜯기', kind: 'attack', targetUid: s.party[1].uid };
    endTurn(s);
    expect(s.party[1].downed).toBe(true);
    expect(s.result).toBeNull();
    s.enemies[0].intent = { moveId: 'bite', name: '물어뜯기', kind: 'attack', targetUid: s.party[0].uid };
    s.party[0].block = 0;
    endTurn(s);
    expect(s.result).toBe('defeat');
    expect(battleOutcome(s)!.party.find((p) => p.id === 'elia')!.hp).toBe(10);
  });

  it('얼음 벽은 지정한 아군에게 방어를 준다', () => {
    const s = battle({ party: duo });
    playCard(s, give(s, 'elia_ice_wall'), s.party[0].uid);
    expect(s.party[0].block).toBe(70);
    expect(s.party[1].block).toBe(0);
  });

  it('왼편의 검(선천)은 첫 손패에 반드시 들어온다', () => {
    const party = [{ id: 'haun', hp: 600, maxHp: 600 }, { id: 'kyle', hp: 520, maxHp: 520 }];
    const filler = Array.from({ length: 12 }, () => 'haun_chop');
    for (const seed of ['a', 'b', 'c', 'd']) {
      const s = battle({ party, deck: cards(...filler, 'kyle_left_blade'), rng: createRng(seed) });
      expect(s.hand.map((c) => c.cardId)).toContain('kyle_left_blade');
    }
  });

  it('날개 베기: 카일이 먼저 체력 40을 잃고, 잃은 체력 4당 피해 +1(최대 +150)로 벤 뒤 약화', () => {
    const s = battle({ party: [{ id: 'haun', hp: 600, maxHp: 600 }, { id: 'kyle', hp: 320, maxHp: 520 }], enemies: ['test_wolf_alpha'] });
    const before = wolf(s).hp;
    playCard(s, give(s, 'kyle_wing_cut'), wolf(s).uid);
    expect(before - wolf(s).hp).toBe(120 + 60); // 잃은 체력 240 → +60
    expect(wolf(s).statuses.weak).toBe(2);
    expect(s.party[1].hp).toBe(280);
    expect(s.party[0].hp).toBe(600);
  });

  it('먼저 가: 보른이 도발하면 다른 동료를 노리던 공격이 보른에게 간다', () => {
    const s = battle({ party: [{ id: 'haun', hp: 600, maxHp: 600 }, { id: 'born', hp: 700, maxHp: 700 }] });
    s.enemies[0].intent = { moveId: 'bite', name: '물어뜯기', kind: 'attack', targetUid: s.party[0].uid };
    playCard(s, give(s, 'born_go_first'));
    expect(s.party[1].block).toBe(150);
    endTurn(s);
    expect(s.party[0].hp).toBe(600);
    expect(s.party[1].block).toBeLessThan(150);
  });

  it('같이 가: 출전한 아군 전원에게 방어', () => {
    const s = battle({ party: [{ id: 'haun', hp: 600, maxHp: 600 }, { id: 'born', hp: 700, maxHp: 700 }] });
    playCard(s, give(s, 'born_together'));
    expect(s.party.map((p) => p.block)).toEqual([60, 60]);
  });

  it('카드 강화: +1~+3은 수치만, +4·+5는 특수 스킬이 붙는다', () => {
    const at = (level: number) => resolveCard(data, { uid: 'x', cardId: 'haun_chop', level });
    expect(at(0).effects).toEqual([{ op: 'damage', amount: 60 }]);
    expect(at(3).effects).toEqual([{ op: 'damage', amount: 150 }]);
    expect(at(3).skills).toEqual([]);
    expect(at(4).skills.map((s) => s.name)).toEqual(['결 따라 패기']);
    expect(at(5).effects.map((e) => e.op)).toEqual(['damage', 'reveal_grain', 'damage']);
    expect(at(9).level).toBe(5);
    expect(cardText(data, { uid: 'x', cardId: 'haun_chop', level: 5 })).toBe('피해 150\n★결 따라 패기: 결 노출 1\n★두 번째 도끼질: 피해 60');
    // 키워드·비용 변화
    expect(resolveCard(data, { uid: 'y', cardId: 'haun_breath', level: 5 }).keywords).not.toContain('exhaust');
    expect(resolveCard(data, { uid: 'z', cardId: 'haun_read_grain', level: 4 }).cost).toEqual({ neigong: 0, mana: 0 });
  });

  it('강화된 카드를 쓰면 성장한 수치와 특수 스킬이 그대로 적용된다', () => {
    const s = battle({ enemies: ['test_wolf_alpha'] });
    s.hand.push({ uid: 'up5', cardId: 'haun_chop', level: 5 });
    const before = wolf(s).hp;
    playCard(s, s.hand.length - 1, wolf(s).uid);
    // 150 + 결 노출 1 → 두 번째 도끼질 60 ×1.5(결) = 90
    expect(before - wolf(s).hp).toBe(150 + 90);
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
    const s = battle({ supportActive: true, enemies: ['test_ignis'], deck: cards(...Array(14).fill('haun_chop')) });
    s.party[0].hp = 99999;
    s.party[0].maxHp = 99999;
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
    const s = battle({ supportActive: false, enemies: ['test_ignis'] });
    for (let t = 1; t < 4; t++) endTurn(s);
    expect(s.turn).toBe(4);
    expect(s.neigong).toBe(3);
  });

  it('참아라, 하운아(왕일검): 전투당 1회, 균열이 9에 이르면 -2 — 폭주 한 걸음 앞에서', () => {
    const s = battle({ supportActive: true, enemies: ['test_ignis'] });
    s.rift = 6;
    playCard(s, give(s, 'haun_byeogun'), s.enemies[0].uid);
    expect(s.rift).toBe(7);
    s.neigong = 5;
    s.mana = 10;
    playCard(s, give(s, 'haun_byeogun'), s.enemies[0].uid);
    // 두 번째는 막지 않는다: 7 + 3 = 10 → 폭주 → 3
    expect(s.events.some((e) => e.type === 'surge')).toBe(true);
    expect(s.rift).toBe(3);
  });

  it('균열 소비(consume_rift)와 소비 비례: 벼린 날 · 흐름을 돌리다 · 한 땀, 은빛 바느질의 상흔 -1은 전투당 한 번', () => {
    const s = battle({ enemies: ['test_ignis'], party: [{ id: 'haun', hp: 600, maxHp: 600 }, { id: 'elia', hp: 420, maxHp: 420 }] });
    const e = s.enemies[0];
    e.hp = e.maxHp = 5000;
    s.rift = 5;
    playCard(s, give(s, 'haun_honed_edge'), e.uid);
    expect(s.rift).toBe(2);
    expect(e.hp).toBe(5000 - (60 + 90));
    s.rift = 6;
    s.neigong = 5;
    s.mana = 5;
    playCard(s, give(s, 'haun_turn_flow'), e.uid);
    expect(s.rift).toBe(0);
    expect(e.hp).toBe(5000 - 150 - 240);
    s.rift = 4;
    playCard(s, give(s, 'elia_one_stitch'));
    expect(s.rift).toBe(0);
    expect(s.party[1].block).toBe(80);
    s.scar = 6;
    s.mana = 5;
    playCard(s, give(s, 'elia_silver_stitch'), s.party[1].uid);
    playCard(s, give(s, 'elia_silver_stitch'), s.party[1].uid);
    expect(s.scar).toBe(5);
    expect(s.tally?.surgeScar).toBe(-1);
  });

  it('도진아: 곽도진의 체력이 절반 이하가 되면 1턴 기절', () => {
    const s = battle({ supportActive: true, enemies: ['kwak_dojin'] });
    const kwak = s.enemies[0];
    kwak.hp = Math.floor(kwak.maxHp / 2) + 50; // 장작 패기(60) 한 번이면 절반 이하
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
      const s = battle({ enemies: ['test_wolf', 'test_wolf'] });
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

describe('받을 피해 예고', () => {
  const party = [
    { id: 'haun', hp: 600, maxHp: 600 },
    { id: 'elia', hp: 100, maxHp: 420 },
  ];
  const aim = (s: ReturnType<typeof battle>, i: number, moveId: string, targetUid: string | null) => {
    const e = s.enemies[i];
    const move = data.enemies.get(e.defId)!.moves.find((m) => m.id === moveId)!;
    e.intent = { moveId, name: move.name, kind: move.intent, targetUid };
  };

  it('노리는 아군에게 피해를 더하고 지금 방어를 뺀다', () => {
    const s = battle({ party, enemies: ['test_wolf', 'test_wolf'] });
    const [haun, elia] = s.party;
    aim(s, 0, 'bite', haun.uid);
    aim(s, 1, 'bite', haun.uid);
    haun.block = 50;
    const v = incomingDamage(s).get(haun.uid)!;
    expect(v.raw).toBe(120);
    expect(v.blocked).toBe(50);
    expect(v.hpLoss).toBe(70);
    expect(v.lethal).toBe(false);
    expect(v.hits).toHaveLength(2);
    expect(incomingDamage(s).has(elia.uid)).toBe(false);
  });

  it('힘·취약·도발·움직이지 못함·쓰러짐을 반영한다', () => {
    const s = battle({ party, enemies: ['test_wolf', 'test_wolf'] });
    const [haun, elia] = s.party;
    aim(s, 0, 'bite', haun.uid);
    aim(s, 1, 'bite', elia.uid);
    s.enemies[0].statuses.strength = 2;
    elia.statuses.vulnerable = 1;
    let m = incomingDamage(s);
    expect(m.get(haun.uid)!.raw).toBe(80);
    expect(m.get(elia.uid)!.raw).toBe(90);
    expect(m.get(elia.uid)!.lethal).toBe(false);
    elia.hp = 90;
    expect(incomingDamage(s).get(elia.uid)!.lethal).toBe(true);

    s.enemies[1].statuses.stun = 1;
    expect(incomingDamage(s).has(elia.uid)).toBe(false);
    delete s.enemies[1].statuses.stun;

    haun.statuses.taunt = 1;
    m = incomingDamage(s);
    expect(m.get(haun.uid)!.raw).toBe(80 + 60);
    expect(m.has(elia.uid)).toBe(false);
    delete haun.statuses.taunt;

    s.enemies[0].downed = true;
    expect(incomingDamage(s).has(haun.uid)).toBe(false);
  });

  it('전체 공격은 살아 있는 아군 모두에게', () => {
    const s = battle({ party, enemies: ['test_ignis'] });
    aim(s, 0, 'flame_wave', null);
    const m = incomingDamage(s);
    const per = 70 + (s.enemies[0].statuses.strength ?? 0) * 10;
    for (const p of s.party) expect(m.get(p.uid)!.raw).toBe(per);
  });
});

describe('새 기본 동작(카드 250장 확장 2026-10-11)', () => {
  it('cost_next: 다음 카드 내공 비용 -N(0 아래로 가지 않음), 한 장에 다 쓰인다', () => {
    const s = battle({ enemies: ['test_ignis'] });
    s.neigong = 1;
    _internal.drawCards(s, 0);
    const owner = s.party[0];
    owner.statuses.cost_down = 1;
    const i = give(s, 'haun_byeogun'); // 내공 1 · 마나 2
    expect(playCost(s, s.hand[i]).neigong).toBe(0);
    s.mana = 5;
    playCard(s, i, s.enemies[0].uid);
    expect(s.neigong).toBe(1);
    expect(owner.statuses.cost_down).toBeUndefined();
  });

  it('keep_block: 다음 차례에도 방어가 남는다(한 번) · recall: 소멸한 카드를 손패로 · copy_card: 복제는 내면 소멸', () => {
    const s = battle({ world: 'murim', enemies: ['test_ignis'] });
    s.enemies[0].intent = null;
    const p = s.party[0];
    p.block = 90;
    p.statuses.block_kept = 1;
    endTurn(s);
    expect(p.block).toBe(90);
    expect(p.statuses.block_kept).toBeUndefined();
    s.hand = [];
    s.exhaust.push({ uid: 'x1', cardId: 'haun_chop', level: 0 });
    _internal.runEffects(s, [{ op: 'recall', amount: 1 }], { source: p });
    expect(s.hand.map((c) => c.cardId)).toEqual(['haun_chop']);
    _internal.runEffects(s, [{ op: 'copy_card', amount: 1 }], { source: p });
    expect(s.hand).toHaveLength(2);
    const copy = s.hand.find((c) => c.temp)!;
    expect(copy.cardId).toBe('haun_chop');
    playCard(s, s.hand.indexOf(copy), s.enemies[0].uid);
    expect(s.exhaust.some((c) => c.uid === copy.uid)).toBe(true);
  });

  it('1파 지속 효과: 기사의 맹세(체력을 잃으면 방어 30) · 오천의 무덤(방어 100 이상으로 차례를 마치면 힘 +1)', () => {
    const s = battle({ world: 'murim', enemies: ['test_ignis'] });
    s.enemies[0].intent = null;
    const p = s.party[0];
    p.statuses.p_knight_oath = 1;
    _internal.runEffects(s, [{ op: 'lose_hp', amount: 40, target: 'self' }], { source: p });
    expect(p.block).toBe(30);
    p.statuses.p_five_thousand_graves = 1;
    p.block = 90;
    endTurn(s);
    expect(p.statuses.strength ?? 0).toBe(0);
    p.block = 100;
    endTurn(s);
    expect(p.statuses.strength).toBe(1);
  });

  it('2파 기본 동작: reveal_intent(이번 차례만 안개를 걷는다) · purge(손패→버린 더미→뽑을 더미 순으로 소멸) · delay_enrage(격노·법칙 격노를 늦춘다)', () => {
    const s = battle({ world: 'murim', enemies: ['mordecai'] });
    const p = s.party[0];
    s.hideIntent = true;
    expect(intentHidden(s)).toBe(true);
    _internal.runEffects(s, [{ op: 'reveal_intent' }], { source: p });
    expect(intentHidden(s)).toBe(false);
    s.turn += 1;
    expect(intentHidden(s)).toBe(true);
    s.hand = [];
    give(s, 'status_rift_echo');
    s.discard.push({ uid: 'e1', cardId: 'status_rift_echo', level: 0 }, { uid: 'e2', cardId: 'status_rift_echo', level: 0 });
    _internal.runEffects(s, [{ op: 'purge', card: 'status_rift_echo', amount: 2 }], { source: p });
    expect(s.hand).toHaveLength(0);
    expect(s.discard.filter((c) => c.cardId === 'status_rift_echo')).toHaveLength(1);
    expect(s.exhaust.filter((c) => c.cardId === 'status_rift_echo')).toHaveLength(2);
    const boss = s.enemies[0];
    const at = boss.enrageAt ?? data.enemies.get('mordecai')!.enrage!.afterTurn;
    s.lawEnrage = [{ afterTurn: 8, text: 't', effects: [] }];
    _internal.runEffects(s, [{ op: 'delay_enrage', amount: 2 }], { source: p });
    expect(boss.enrageAt).toBe(Math.max(at, s.turn) + 2);
    expect(s.lawEnrage[0].afterTurn).toBe(10);
  });
});

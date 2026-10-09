// 시너지(GAME_DESIGN 9-2, CARD_EFFECTS 4-1): 상태 발동(파워)·비례 수치·아키타입
import { describe, expect, it } from 'vitest';
import { endTurn, playCard } from '../src/engine/battle';
import { addStatus } from '../src/engine/effects';
import { cardText } from '../src/engine/text';
import { battle, data, give } from './helpers';

const wolf = (s: ReturnType<typeof battle>) => s.enemies[0];
const big = (s: ReturnType<typeof battle>) => {
  for (const e of s.enemies) e.hp = e.maxHp = 999;
};

describe('상태 발동(파워)', () => {
  it('파워 카드는 소멸하고, 차례 시작 발동은 스택마다 겹친다(산의 소리: 방어 5)', () => {
    const s = battle({ party: [{ id: 'haun', hp: 60, maxHp: 60 }, { id: 'born', hp: 70, maxHp: 70 }] });
    big(s);
    playCard(s, give(s, 'born_mountain_voice'));
    expect(s.exhaust.map((c) => c.cardId)).toContain('born_mountain_voice');
    expect(s.party[1].statuses.p_mountain_body).toBe(1);
    addStatus(s, s.party[1], 'p_mountain_body', 1);
    endTurn(s);
    // 다음 차례 시작: 방어가 지워진 뒤 5 × 2스택
    expect(s.party[1].block).toBe(10);
  });

  it('카드를 낸 뒤 발동: 검의 박자는 아군의 공격 카드마다 무작위 적에게 피해 2, 스킬에는 발동하지 않는다', () => {
    const s = battle({ party: [{ id: 'haun', hp: 60, maxHp: 60 }, { id: 'kyle', hp: 52, maxHp: 52 }] });
    big(s);
    s.neigong = 9;
    playCard(s, give(s, 'kyle_eyes_closed'));
    const hp0 = wolf(s).hp;
    playCard(s, give(s, 'haun_step'));
    expect(wolf(s).hp).toBe(hp0);
    playCard(s, give(s, 'haun_chop'), wolf(s).uid);
    expect(hp0 - wolf(s).hp).toBe(6 + 2);
  });

  it('맞았을 때 발동: 되갚기는 방어로 다 막아도 때린 적에게 피해 3', () => {
    const s = battle({ party: [{ id: 'haun', hp: 60, maxHp: 60 }, { id: 'born', hp: 70, maxHp: 70 }] });
    big(s);
    playCard(s, give(s, 'born_payback'));
    s.party[1].block = 99;
    wolf(s).intent = { moveId: 'bite', name: '물어뜯기', kind: 'attack', targetUid: s.party[1].uid };
    const hp0 = wolf(s).hp;
    endTurn(s);
    expect(hp0 - wolf(s).hp).toBeGreaterThanOrEqual(3);
    expect(s.party[1].hp).toBe(70);
  });

  it('체력을 잃었을 때 발동: 흉터의 맹세는 스스로 잃는 체력에도 힘 +1', () => {
    const s = battle({ party: [{ id: 'haun', hp: 60, maxHp: 60 }, { id: 'kyle', hp: 52, maxHp: 52 }] });
    playCard(s, give(s, 'kyle_scar_oath'));
    expect(s.party[1].hp).toBe(50);
    expect(s.party[1].statuses.strength).toBe(1);
  });

  it('되갚기끼리는 끝없이 주고받지 않는다(발동 깊이 한도)', () => {
    const s = battle({ party: [{ id: 'haun', hp: 60, maxHp: 60 }] });
    big(s);
    addStatus(s, s.party[0], 'p_payback', 1);
    addStatus(s, wolf(s), 'p_payback', 1);
    const hp0 = wolf(s).hp;
    playCard(s, give(s, 'haun_chop'), wolf(s).uid);
    // 장작 패기 6 → 늑대 되갚기 3 → 하운 되갚기 3 → (깊이 한도) 멈춤
    expect(hp0 - wolf(s).hp).toBe(9);
    expect(s.party[0].hp).toBe(57);
  });
});

describe('비례 수치', () => {
  it('결을 따라: 결 노출 1스택당 +3(피해는 결 1스택을 쓰기 전에 센다)', () => {
    const s = battle();
    big(s);
    addStatus(s, wolf(s), 'grain', 2);
    const hp0 = wolf(s).hp;
    playCard(s, give(s, 'haun_ride_grain'), wolf(s).uid);
    // (4 + 6) × 결 노출 1.5
    expect(hp0 - wolf(s).hp).toBe(Math.floor((4 + 6) * (1 + data.balance.grain.damageBonus)));
  });

  it('검의 길: 이번 턴에 먼저 낸 카드 수만큼, 턴이 바뀌면 다시 0', () => {
    const s = battle({ party: [{ id: 'haun', hp: 60, maxHp: 60 }, { id: 'kyle', hp: 52, maxHp: 52 }] });
    big(s);
    s.neigong = 9;
    playCard(s, give(s, 'haun_step'));
    playCard(s, give(s, 'haun_step'));
    const hp0 = wolf(s).hp;
    playCard(s, give(s, 'kyle_sword_path'), wolf(s).uid);
    expect(hp0 - wolf(s).hp).toBe(3 + 3 * 2);
    endTurn(s);
    expect(s.cardsPlayed).toBe(0);
  });

  it('산처럼: 방어를 얻은 뒤 방어의 절반만큼 피해', () => {
    const s = battle({ party: [{ id: 'haun', hp: 60, maxHp: 60 }, { id: 'born', hp: 70, maxHp: 70 }] });
    big(s);
    s.party[1].block = 10;
    const hp0 = wolf(s).hp;
    playCard(s, give(s, 'born_like_mountain'), wolf(s).uid);
    expect(hp0 - wolf(s).hp).toBe(Math.floor((10 + 4) / 2));
  });

  it('불씨 잇기: 화염 피해로 화상을 붙인 뒤 화상을 두 배로', () => {
    const s = battle({ party: [{ id: 'haun', hp: 60, maxHp: 60 }, { id: 'elia', hp: 50, maxHp: 50 }] });
    big(s);
    addStatus(s, wolf(s), 'burn', 2);
    playCard(s, give(s, 'elia_kindle'), wolf(s).uid);
    expect(wolf(s).statuses.burn).toBe((2 + data.balance.elements.fire.stacks) * 2);
  });
});

describe('카드 문구', () => {
  it('파워는 상태 설명을, 비례 수치는 꼬리말을 보여 준다', () => {
    expect(cardText(data, 'born_mountain_voice')).toContain('지속 「산의 소리」');
    expect(cardText(data, 'haun_ride_grain')).toContain('대상의 결 노출 1당 +3');
    expect(cardText(data, 'born_like_mountain')).toContain('자신의 방어 2당 +1');
    expect(cardText(data, 'born_like_mountain')).not.toContain('피해 0');
    expect(cardText(data, 'kyle_fun')).toContain('체력 3 잃기');
  });
});

// 원작 기믹용 엔진 기능(2026-10-08 10스테이지 개편): 마나 규칙 덮어쓰기, 돌려보내기(dispel), 내공 최대치, 피의 덮개,
// 틈의 굶주림, 흐르지 않는 자, 꿰맬 자리, 짝이 쓰러지면 변신, 처치 효과, 상흔 체력, 차례 시작 회복, 복장.
import { describe, expect, it } from 'vitest';
import { endTurn, incomingDamage, playCard } from '../src/engine/battle';
import type { EnemyDef } from '../src/engine/schema';
import { EnemyDef as EnemySchema } from '../src/engine/schema';
import { spritesFor } from '../src/engine/state';
import { battle, data, give } from './helpers';

function defineEnemy(def: Partial<EnemyDef> & { id: string }): void {
  data.enemies.set(def.id, EnemySchema.parse({ name: def.id, maxHp: 50, pattern: 'cycle', moves: [{ id: 'hit', name: '치기', intent: 'attack', effects: [{ op: 'damage', amount: 5 }] }], ...def }));
}

defineEnemy({ id: 't_dummy', maxHp: 200 });
defineEnemy({ id: 't_partner', maxHp: 10 });
defineEnemy({ id: 't_after', maxHp: 30, moves: [{ id: 'roar', name: '포효', intent: 'buff', targeting: 'random', weight: 1, effects: [{ op: 'apply_status', status: 'strength', stacks: 1, target: 'self' }] }] });
defineEnemy({ id: 't_watcher', maxHp: 80, transform: { triggers: ['partnerDowned'], partner: 't_partner', into: 't_after', text: '짝이 쓰러지자 모습이 바뀐다', partyEffects: [{ op: 'gain_mana', amount: 3 }] } });
defineEnemy({ id: 't_commander', maxHp: 10, deathEffects: [{ op: 'damage', amount: 999, target: 'all_allies' }] });
defineEnemy({ id: 't_scarred', maxHp: 60, hpPerScar: 4 });

describe('마나 규칙 덮어쓰기(스테이지·모듈 mana)', () => {
  it('숫자로 시작하고 perTurn만큼 찬다', () => {
    const s = battle({ enemies: ['t_dummy'], manaRule: { battleStart: 0, perTurn: 2 } });
    expect(s.mana).toBe(0);
    endTurn(s);
    expect(s.mana).toBe(2);
    const a = battle({ enemies: ['t_dummy'], manaRule: { battleStart: 4, perTurn: 1 } });
    expect(a.mana).toBe(4);
  });
});

describe('돌려보내기와 실', () => {
  it('운해귀종(dispel): 적의 강화와 방어를 걷고 균열을 줄인다', () => {
    const s = battle({ enemies: ['t_dummy'] });
    const e = s.enemies[0];
    e.statuses.strength = 3;
    e.statuses.weak = 1;
    e.block = 10;
    s.rift = 4;
    playCard(s, give(s, 'haun_unhae'), e.uid);
    expect(e.statuses.strength).toBeUndefined();
    expect(e.statuses.weak).toBe(1); // 약화(debuff)는 남는다
    expect(e.block).toBe(0);
    expect(e.hp).toBe(200 - 12);
    expect(s.rift).toBe(2);
  });

  it('내공의 실: 쓸 때마다 이번 전투에서 턴마다 차는 내공이 1 줄어든다', () => {
    const s = battle({ enemies: ['t_dummy'] });
    playCard(s, give(s, 'haun_thread'), s.enemies[0].uid);
    expect(s.neigongMax).toBe(2);
    endTurn(s);
    expect(s.neigong).toBe(2);
  });

  it('꿰맬 자리: 실(thread) 카드가 아니면 피해가 들어가지 않는다', () => {
    const s = battle({ enemies: ['t_dummy'] });
    const e = s.enemies[0];
    e.statuses.seam = 1;
    playCard(s, give(s, 'haun_chop'), e.uid);
    expect(e.hp).toBe(200);
    playCard(s, give(s, 'haun_thread'), e.uid);
    expect(e.hp).toBe(200 - 12);
  });
});

describe('천마혈공과 틈', () => {
  it('피의 덮개: 결 노출이 붙지 않고, 천외귀운이 덮개를 벗긴다', () => {
    const s = battle({ enemies: ['t_dummy'] });
    const e = s.enemies[0];
    e.statuses.blood_cover = 1;
    playCard(s, give(s, 'haun_read_grain'), e.uid);
    expect(e.statuses.grain).toBeUndefined();
    s.neigong = 3;
    playCard(s, give(s, 'haun_cheonoe'));
    expect(e.statuses.blood_cover).toBeUndefined();
    s.neigong = 3;
    playCard(s, give(s, 'haun_read_grain'), e.uid);
    expect(e.statuses.grain).toBe(2);
  });

  it('틈의 굶주림: 내공 2 이상 카드는 절반, 그 카드로 쓰러뜨리면 균열 +1', () => {
    const s = battle({ party: [{ id: 'haun', hp: 60, maxHp: 60 }, { id: 'born', hp: 70, maxHp: 70 }], enemies: ['t_dummy'], deck: [] });
    const e = s.enemies[0];
    e.statuses.hungry = 1;
    playCard(s, give(s, 'born_cleave'), e.uid); // 내공 2, 피해 6 → 3
    expect(e.hp).toBe(197);
    e.hp = 2;
    s.neigong = 3;
    playCard(s, give(s, 'born_cleave'), e.uid);
    expect(e.downed).toBe(true);
    expect(s.rift).toBe(1);
  });

  it('흐르지 않는 자: 적이 하운을 노리지 못하고, 다른 아군이 없으면 헛손질한다', () => {
    const s = battle({ enemies: ['t_dummy'] });
    const haun = s.party[0];
    expect(s.enemies[0].intent?.targetUid).toBe(haun.uid);
    playCard(s, give(s, 'haun_stop_ring'), s.enemies[0].uid);
    expect(haun.statuses.still).toBe(1);
    expect(s.neigong).toBe(0);
    expect(s.enemies[0].statuses.grain).toBe(3);
    expect(incomingDamage(s).get(haun.uid)).toBeUndefined();
    const hp = haun.hp;
    endTurn(s);
    expect(haun.hp).toBe(hp);
    expect(s.log.some((l) => l.includes('놓쳤다'))).toBe(true);
    expect(haun.statuses.still).toBeUndefined(); // 라운드가 끝나면 다시 숨을 쉰다
  });
});

describe('적 구조', () => {
  it('짝이 쓰러지면 변신(partnerDowned)하고 partyEffects가 일어난다', () => {
    const s = battle({ enemies: ['t_partner', 't_watcher'], manaRule: { battleStart: 0, perTurn: 0 } });
    s.enemies[0].hp = 1;
    playCard(s, give(s, 'haun_chop'), s.enemies[0].uid);
    expect(s.enemies[1].defId).toBe('t_after');
    expect(s.enemies[1].hp).toBe(30);
    expect(s.mana).toBe(3);
    expect(s.result).toBeNull();
  });

  it('처치 효과: 군단장이 쓰러지면 졸개가 무너진다', () => {
    const s = battle({ enemies: ['t_commander', 't_dummy', 't_dummy'] });
    s.enemies[0].hp = 1;
    playCard(s, give(s, 'haun_chop'), s.enemies[0].uid);
    expect(s.enemies.every((e) => e.downed)).toBe(true);
    expect(s.result).toBe('victory');
  });

  it('상흔만큼 체력이 늘어나는 적(hpPerScar)', () => {
    const s = battle({ enemies: ['t_scarred'], scar: 5 });
    expect(s.enemies[0].maxHp).toBe(80);
  });

  it('차례 시작 회복(산이 메운다)', () => {
    const s = battle({ enemies: ['t_dummy'] });
    const e = s.enemies[0];
    e.statuses.mountain_regen = 2;
    e.hp = 150;
    endTurn(s);
    expect(e.hp).toBe(158);
  });
});

describe('복장', () => {
  it('런 플래그가 서면 그 복장의 스프라이트를 쓴다', () => {
    const haun = data.characters.get('haun')!;
    expect(spritesFor(haun, []).idle).toBe('haun_idle');
    expect(spritesFor(haun, ['ugly_sword']).idle).toBe('haun_sword_idle');
    const born = data.characters.get('born')!;
    expect(spritesFor(born, ['durin_hammer']).attack).toBe('born_hammer_attack');
  });
});

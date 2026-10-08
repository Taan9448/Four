import { describe, expect, it } from 'vitest';
import { critChance } from '../src/engine/effects';
import { applyLevelUpgrade, applyRunOps, awardBattleXp, createRun, gainXp, levelUpgradeCandidates, xpToNext } from '../src/engine/run';
import { deserializeRun, serializeRun } from '../src/engine/save';
import { battle, data } from './helpers';

const lv = data.balance.leveling;

describe('레벨', () => {
  it('경험치가 차면 레벨이 오르고, 최대 체력이 늘며 그만큼 회복한다', () => {
    const run = createRun(data, 'LV1');
    const haun = run.roster[0];
    const hp0 = haun.maxHp;
    gainXp(data, run, 'haun', xpToNext(data, 1)! + 3);
    expect(haun.level).toBe(2);
    expect(haun.xp).toBe(3);
    expect(haun.maxHp).toBe(hp0 + data.characters.get('haun')!.hpPerLevel);
    expect(run.levelLog).toEqual([expect.objectContaining({ id: 'haun', from: 1, to: 2 })]);
  });

  it(`${lv.upgradeEvery}레벨마다 그 동료의 카드 한 장을 고르는 강화가 생긴다`, () => {
    const run = createRun(data, 'LV2');
    let need = 0;
    for (let l = 1; l < lv.upgradeEvery; l++) need += xpToNext(data, l)!;
    gainXp(data, run, 'haun', need);
    expect(run.roster[0].level).toBe(lv.upgradeEvery);
    expect(run.pendingUpgrades).toEqual(['haun']);
    const pick = levelUpgradeCandidates(data, run, 'haun')[0];
    applyLevelUpgrade(data, run, pick.uid);
    expect(run.deck.find((c) => c.uid === pick.uid)!.level).toBe(1);
    expect(run.pendingUpgrades).toEqual([]);
  });

  it('최대 레벨에서 멈춘다', () => {
    const run = createRun(data, 'LV3');
    gainXp(data, run, 'haun', 99999);
    expect(run.roster[0].level).toBe(lv.maxLevel);
    expect(xpToNext(data, lv.maxLevel)).toBeNull();
  });

  it('이긴 전투: 출전한 동료는 전부, 쉬는 동료는 일부만 받는다. 동료는 하운 레벨 -1로 합류한다', () => {
    const run = createRun(data, 'LV4', { stageId: 's1' });
    gainXp(data, run, 'haun', xpToNext(data, 1)! + xpToNext(data, 2)!);
    applyRunOps(data, run, [{ op: 'join_party', member: 'elia' }, { op: 'join_party', member: 'kyle' }, { op: 'join_party', member: 'born' }]);
    const elia = run.roster.find((r) => r.id === 'elia')!;
    expect(elia.level).toBe(2);
    expect(elia.maxHp).toBe(data.characters.get('elia')!.maxHp + data.characters.get('elia')!.hpPerLevel);
    run.selected = ['haun', 'elia', 'kyle'];
    awardBattleXp(data, run, 'elite');
    expect(elia.xp).toBe(lv.xp.elite);
    expect(run.roster.find((r) => r.id === 'born')!.xp).toBe(Math.floor(lv.xp.elite * lv.restShare));
  });

  it('레벨마다 치명타 확률이 오른다', () => {
    const s = battle({ party: [{ id: 'haun', hp: 60, maxHp: 60, level: 5 }] });
    const base = data.characters.get('haun')!.crit!;
    expect(critChance(s, s.party[0])).toBeCloseTo(base + 4 * lv.critPerLevel);
  });

  it('레벨 도입 전 저장도 레벨 1로 이어진다', () => {
    const run = createRun(data, 'LV5');
    const raw = JSON.parse(serializeRun(run));
    for (const r of raw.run.roster) {
      delete r.level;
      delete r.xp;
    }
    delete raw.run.pendingUpgrades;
    delete raw.run.levelLog;
    const loaded = deserializeRun(data, JSON.stringify(raw));
    expect(loaded?.run.roster[0].level).toBe(1);
    expect(loaded?.run.pendingUpgrades).toEqual([]);
  });
});

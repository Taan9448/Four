// 순례 일행 보정의 세 항(GAME_DESIGN 2절, 2026-10-12 · 유물 몫은 등급별 2026-10-21): run.ts(전투 배율)와 collection.ts(출발 편성 때 고정)가 함께 쓴다
import type { GameData } from './data';
import type { RunState } from './run';

/** 순례 일행 보정과 그 세 항(지도·전투 띠에 그대로 보인다) */
export interface PilgrimScale {
  hp: number;
  dmg: number;
  /** 하운 레벨 − 스테이지 기준 레벨(0 이상) */
  level: number;
  relics: number;
  /** 유물 점수(등급별 relicPts의 합) · 유물이 곱한 적 체력 배율 · 그중 영웅·전설 수(지도·전투 띠에 보인다). 옛 저장에 고정된 값에는 없다 */
  relicPts?: number;
  relicMul?: number;
  epic?: number;
  legendary?: number;
  /** 출발 편성(열쇠 카드 제외)의 평균 강화 단계 */
  upgrade: number;
}

/** 지금 일행으로 보정을 센다(고정하지 않는다) */
export function measurePilgrimScale(data: GameData, run: Pick<RunState, 'roster' | 'relics' | 'stageId' | 'loadout' | 'collection'>): PilgrimScale {
  const p = data.balance.pilgrimage;
  const haun = run.roster.find((r) => r.id === 'haun')?.level ?? 1;
  const level = Math.max(0, haun - (p.baseLevel[run.stageId] ?? 1));
  const cards = Object.values(run.loadout ?? {})
    .flat()
    .filter((id) => !data.cards.get(id)?.essential);
  const upgrade = cards.length ? cards.reduce((a, id) => a + (run.collection?.[id] ?? 0), 0) / cards.length : 0;
  const rarities = run.relics.map((id) => data.relics.get(id)?.rarity);
  const relicPts = rarities.reduce((a, r) => a + (r ? (p.relicPts[r] ?? 0) : 0), 0);
  // 클리어 직후 일행이 가진 만큼(relicFree)은 무료, 그 위로 모은 유물 1점마다 곱으로(2026-10-21 순례 누적)
  const over = Math.max(0, relicPts - p.relicFree);
  const relicMul = Math.pow(1 + p.relicGrowth, over);
  const round = (x: number) => Math.round(x * 100) / 100;
  return {
    hp: round(Math.min(p.maxHp, (1 + level * p.hpPerLevel + upgrade * p.upgradePct) * relicMul)),
    dmg: round(Math.min(p.maxDmg, (1 + level * p.dmgPerLevel + upgrade * p.upgradePct) * Math.pow(1 + p.relicGrowth, over * p.relicDmgShare))),
    level,
    relics: run.relics.length,
    relicPts: Math.round(relicPts * 10) / 10,
    relicMul: round(relicMul),
    epic: rarities.filter((r) => r === 'epic').length,
    legendary: rarities.filter((r) => r === 'legendary').length,
    upgrade: round(upgrade),
  };
}

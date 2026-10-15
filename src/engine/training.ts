// 수련 레벨(2026-10-15, GAME_DESIGN 16절 '심연 개편' ④): 저장 칸·모드와 상관없이 계정에 하나.
// 이긴 전투마다 경험치(이야기·순례·심연), 레벨이 오르면 심연 시작 금화가 는다. 수치는 balance.training
import type { GameData } from './data';

export interface Training {
  /** 지금까지 모은 경험치(레벨은 여기서 계산한다) */
  xp: number;
}

export const emptyTraining = (): Training => ({ xp: 0 });

export function parseTraining(text: string | null): Training {
  try {
    const raw = JSON.parse(text ?? '{}') as Partial<Training>;
    const xp = Math.floor(Number(raw.xp));
    return { xp: Number.isFinite(xp) && xp > 0 ? xp : 0 };
  } catch {
    return emptyTraining();
  }
}

/** 레벨 L에서 L+1로 가는 데 드는 경험치 */
export function xpToNext(data: GameData, level: number): number {
  const t = data.balance.training;
  return t.xpBase + t.xpStep * (level - 1);
}

/** 경험치 → 레벨과 다음 레벨까지(최대 레벨이면 into = need = 0) */
export function trainingLevel(data: GameData, xp: number): { level: number; into: number; need: number } {
  const max = data.balance.training.levelMax;
  let level = 1;
  let left = Math.max(0, xp);
  while (level < max && left >= xpToNext(data, level)) {
    left -= xpToNext(data, level);
    level += 1;
  }
  return level >= max ? { level: max, into: 0, need: 0 } : { level, into: left, need: xpToNext(data, level) };
}

/** 이긴 전투 하나의 경험치(노드 종류: battle · elite · boss. 그 밖은 0) */
export function battleXp(data: GameData, nodeType: string | undefined): number {
  const xp = data.balance.training.xp;
  return nodeType === 'boss' ? xp.boss : nodeType === 'elite' ? xp.elite : nodeType === 'battle' ? xp.battle : 0;
}

/** 경험치를 더한다. 돌려주는 값: 오르기 전·후 레벨 */
export function gainTrainingXp(data: GameData, t: Training, amount: number): { from: number; to: number } {
  const from = trainingLevel(data, t.xp).level;
  t.xp += Math.max(0, Math.floor(amount));
  return { from, to: trainingLevel(data, t.xp).level };
}

/** 심연 시작 금화 덤: every레벨마다 amount, 최대 레벨에 maxBonus 더(일일 심연에도) */
export function trainingGold(data: GameData, level: number): number {
  const t = data.balance.training;
  const g = t.abyssGold;
  return Math.floor(Math.min(level, t.levelMax) / g.every) * g.amount + (level >= t.levelMax ? g.maxBonus : 0);
}

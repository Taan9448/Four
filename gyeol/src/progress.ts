// 「결」 5단계(2026-11-11): 하운 옷과 업적 — 조건은 gyeol/data/progress.json, 판정은 저장(gyeol.save)만 본다.
import raw from '../data/progress.json';
import type { SaveData } from './save';

export type Cond =
  | { kind: 'cleared'; chapter: string }
  | { kind: 'stars'; n: number }
  | { kind: 'stat'; key: keyof SaveData['stats']; n: number }
  | { kind: 'duelBest'; diff: string; rank: string }
  | { kind: 'rhythm'; rank: string; all?: boolean }
  | { kind: 'flagNot'; chapter: string; flag: string };

export interface Outfit {
  id: string;
  name: string;
  text: string;
  unlock: Cond | null;
}
export interface Achievement {
  id: string;
  name: string;
  text: string;
  cond: Cond;
}

export const progress = raw as unknown as { outfits: Outfit[]; achievements: Achievement[] };

const RANK = ['C', 'B', 'A', 'S'];
const atLeastRank = (r: string | undefined, need: string) => !!r && RANK.indexOf(r) >= RANK.indexOf(need);

export const starTotal = (save: SaveData): number => Object.values(save.story.stars).reduce((a, b) => a + b, 0);

/** 조건을 채웠나. 박자 도전 all은 chartIds(악보가 있는 상대) 모두 */
export function condMet(c: Cond | null, save: SaveData, chartIds: string[] = []): boolean {
  if (!c) return true;
  switch (c.kind) {
    case 'cleared':
      return save.story.cleared.includes(c.chapter);
    case 'stars':
      return starTotal(save) >= c.n;
    case 'stat':
      return (save.stats[c.key] ?? 0) >= c.n;
    case 'duelBest':
      return Object.entries(save.duelBest).some(([k, r]) => k.endsWith(`:${c.diff}`) && atLeastRank(r, c.rank));
    case 'rhythm':
      return c.all ? chartIds.length > 0 && chartIds.every((id) => atLeastRank(save.rhythmBest[id]?.rank, c.rank)) : Object.values(save.rhythmBest).some((b) => atLeastRank(b.rank, c.rank));
    case 'flagNot':
      return save.story.cleared.includes(c.chapter) && !save.story.flags.includes(c.flag);
  }
}

/** 새로 이룬 업적(저장의 achievements에 넣고 돌려준다 — 부른 쪽이 저장한다) */
export function newAchievements(save: SaveData, chartIds: string[]): Achievement[] {
  const got = progress.achievements.filter((a) => !save.achievements.includes(a.id) && condMet(a.cond, save, chartIds));
  save.achievements.push(...got.map((a) => a.id));
  return got;
}

/** 입은 옷의 그림 접두어(기본 옷이면 null) — 열리지 않은 옷이면 기본 */
export function outfitPrefix(save: SaveData): string | null {
  const o = progress.outfits.find((x) => x.id === save.outfit);
  if (!o || o.id === 'base' || !condMet(o.unlock, save)) return null;
  return `skin_${o.id}_haun`;
}

export function condText(c: Cond | null): string {
  if (!c) return '처음부터';
  switch (c.kind) {
    case 'cleared':
      return c.chapter === 'epilogue' ? '에필로그를 마치면' : `${c.chapter.replace('ch', '')}장을 마치면`;
    case 'stars':
      return `이야기 별 ${c.n}개`;
    default:
      return '';
  }
}

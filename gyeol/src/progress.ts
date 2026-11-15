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
  /** 입을 수 있는 인물(2026-11-14 동료 옷장 — 없으면 모두, 기본 옷 base는 모두) */
  chars?: string[];
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

/** 옷·업적은 칸과 상관없이(2026-11-14 불러오기 3칸): 어느 칸에서든 깬 장 · 가장 많이 모은 칸의 별 */
const allStories = (save: SaveData) => [save.story, ...(save.slots ?? []).filter((x) => x).map((x) => x!.story)];
export const clearedAnywhere = (save: SaveData, ch: string) => allStories(save).some((st) => st.cleared.includes(ch));
const bestStars = (save: SaveData) => Math.max(...allStories(save).map((st) => Object.values(st.stars).reduce((a, b) => a + b, 0)));

/** 조건을 채웠나. 박자 도전 all은 chartIds(악보가 있는 상대) 모두 */
export function condMet(c: Cond | null, save: SaveData, chartIds: string[] = []): boolean {
  if (!c) return true;
  switch (c.kind) {
    case 'cleared':
      return clearedAnywhere(save, c.chapter);
    case 'stars':
      return bestStars(save) >= c.n;
    case 'stat':
      return (save.stats[c.key] ?? 0) >= c.n;
    case 'duelBest':
      return Object.entries(save.duelBest).some(([k, r]) => k.endsWith(`:${c.diff}`) && atLeastRank(r, c.rank));
    case 'rhythm':
      return c.all ? chartIds.length > 0 && chartIds.every((id) => atLeastRank(save.rhythmBest[id]?.rank, c.rank)) : Object.values(save.rhythmBest).some((b) => atLeastRank(b.rank, c.rank));
    case 'flagNot':
      return allStories(save).some((st) => st.cleared.includes(c.chapter) && !st.flags.includes(c.flag));
  }
}

/** 새로 이룬 업적(저장의 achievements에 넣고 돌려준다 — 부른 쪽이 저장한다) */
export function newAchievements(save: SaveData, chartIds: string[]): Achievement[] {
  const got = progress.achievements.filter((a) => !save.achievements.includes(a.id) && condMet(a.cond, save, chartIds));
  save.achievements.push(...got.map((a) => a.id));
  return got;
}

/** 입은 옷의 그림 접두어(기본 옷이면 null) — 열리지 않은 옷이면 기본 */
/** 이 인물이 고른 옷 id(진하운은 예전 outfit 칸 그대로) */
export function outfitOf(save: SaveData, char = 'haun'): string {
  return (char === 'haun' ? save.outfit : save.outfits?.[char]) || 'base';
}

/** 이 인물이 입을 수 있는 옷 */
export const outfitsFor = (char: string): Outfit[] => progress.outfits.filter((o) => o.id === 'base' || !o.chars || o.chars.includes(char));

/** 전투 그림 이름 앞머리(skin_<옷>_<인물>) — 기본 옷이거나 잠겼으면 null */
export function outfitPrefix(save: SaveData, char = 'haun'): string | null {
  const id = outfitOf(save, char);
  const o = outfitsFor(char).find((x) => x.id === id);
  if (!o || o.id === 'base' || !condMet(o.unlock, save)) return null;
  return `skin_${o.id}_${char}`;
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

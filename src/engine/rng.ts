// 시드 RNG. 엔진 안의 모든 무작위는 이 모듈을 거친다(Math.random 금지).
// 같은 시드 + 같은 라벨이면 항상 같은 수열이 나온다.

export interface Rng {
  /** [0, 1) 실수 */
  next(): number;
  /** [min, max] 정수 */
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  weighted<T>(items: readonly T[], weight: (item: T) => number): T | undefined;
  shuffle<T>(items: T[]): T[];
  /** 라벨로 독립된 하위 수열을 만든다. 부모 수열의 진행과 무관하다. */
  fork(label: string): Rng;
  /** 지금 위치에서 같은 수열을 이어 가는 독립 사본(자동 플레이 봇이 전투를 미리 시험할 때) */
  clone(): Rng;
  readonly seed: string;
}

function hashString(str: string): number {
  // xmur3
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

export function createRng(seed: string): Rng {
  return makeRng(seed, hashString(seed));
}

function makeRng(seed: string, state: number): Rng {
  let a = state;
  const next = (): number => {
    // mulberry32
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng: Rng = {
    seed,
    next,
    int(min, max) {
      return min + Math.floor(next() * (max - min + 1));
    },
    pick(items) {
      if (items.length === 0) throw new Error('rng.pick: 빈 배열');
      return items[Math.floor(next() * items.length)];
    },
    weighted(items, weight) {
      const total = items.reduce((s, it) => s + Math.max(0, weight(it)), 0);
      if (total <= 0) return undefined;
      let r = next() * total;
      for (const it of items) {
        r -= Math.max(0, weight(it));
        if (r < 0) return it;
      }
      return items[items.length - 1];
    },
    shuffle(items) {
      for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
      }
      return items;
    },
    fork(label) {
      return createRng(`${seed}::${label}`);
    },
    clone() {
      return makeRng(seed, a);
    },
  };
  return rng;
}

/** 사람이 읽기 쉬운 새 시드. UI에서만 쓴다(엔진 밖). */
export function randomSeed(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

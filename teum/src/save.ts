// 「틈」 저장(2026-11-18 2차, GAME_DESIGN 10절): localStorage `teum.save` 하나에 칸 3개·지금 칸·도감·옵션·옷장.
// 장을 끝낼 때만 지금 칸에 자동 저장한다(손으로 저장하는 단추는 없다). 게스트 기록은 이 브라우저에만.
import { HEROES, STORY, type Carry } from './sim';
import type { Options } from './render';

export interface Slot {
  hero: string;
  difficulty: string;
  /** 다음에 할 장(0부터). 10이면 다 넘었다 */
  chapter: number;
  carry: Carry;
  updatedAt: number;
  /** 무공록: 들고 들어갈 카드 무공·심법 id(없으면 자동) */
  book?: string[];
  /** 재편성: 이번 장을 열자마자 고를 수 */
  rebuild?: number;
  /** 중간 보스를 넘은 자리(이 장 안에서만) */
  checkpoint?: { seed: string; t: number; carry: Carry };
}
export interface SaveData {
  v: 2;
  slots: (Slot | null)[];
  /** 자동 저장할 칸 */
  active: number;
  /** 만난 그림자(도감) */
  seen: string[];
  /** 넘은 가장 먼 장(인물 열기) */
  maxCleared: number;
  options: Options;
  /** 인물마다 입은 옷(옷장): 옷 id, 기본은 없음 */
  outfits: Record<string, string>;
  /** 금화 지갑(2026-11-21): 장을 마칠 때(넘든 지든) 그 장에서 모은 금화가 들어온다 — 무공서고에서 쓴다 */
  wallet: number;
  /** 연 카드 무공·심법 id(보스·중간 보스·비급·무공서고) */
  unlocked: string[];
  /** 무공서고 진열(다시 펼치면 +1) */
  shopSeed: number;
  /** 장터 수련 레벨(영구) */
  upgrades: Record<string, number>;
  /** 읽은 비석 id(도감) */
  steles: string[];
}

const KEY = 'teum.save';
const fresh = (): SaveData => ({ v: 2, slots: [null, null, null], active: 0, seen: [], maxCleared: 0, options: { shake: true, numbers: true, map: 'small' }, outfits: {}, wallet: 0, unlocked: [], shopSeed: 1, upgrades: {}, steles: [] });

export function loadSave(): SaveData {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    // 1차 시제품(v 없음)의 기록은 버리고 새로 — 칸 구조가 다르다
    if (raw && raw.v === 2) return { ...fresh(), ...raw, options: { ...fresh().options, ...raw.options } };
  } catch {
    /* 깨졌으면 새로 */
  }
  return fresh();
}
export function writeSave(s: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* 사생활 보호 창 등 */
  }
}

export const heroOpen = (sv: SaveData, id: string, all = false): boolean => {
  const h = HEROES.find((x) => x.id === id);
  return !!h && (all || !h.unlock || sv.maxCleared >= h.unlock.chapter);
};

export const slotLabel = (s: Slot | null): string => {
  if (!s) return '빈 칸';
  const hero = HEROES.find((h) => h.id === s.hero)?.name ?? s.hero;
  const diff = STORY.difficulties.find((d) => d.id === s.difficulty)?.name ?? s.difficulty;
  const where = s.chapter >= STORY.chapters.length ? '모든 장을 넘었다' : `다음: ${STORY.chapters[s.chapter].name}`;
  const t = Math.floor(s.carry.playTime / 60);
  return `${hero} · ${diff} · Lv.${s.carry.level} · ${where} · ${t}분`;
};

/** 판에서 번 것을 계정에 넣는다: 금화는 지갑으로, 연 무공은 목록으로(장을 넘든 지든 남는다 — 로그라이크) */
export function bank(sv: SaveData, gold: number, unlocks: string[], steles: string[] = []): void {
  sv.wallet = Math.max(0, (sv.wallet ?? 0) + Math.max(0, Math.round(gold)));
  sv.unlocked = [...new Set([...(sv.unlocked ?? []), ...unlocks])];
  sv.steles = [...new Set([...(sv.steles ?? []), ...steles])];
}

/** 「천외귀환」에서 모은 카드(저장 칸 셋의 보유 카드) — 「틈」에서도 열린 것으로 친다(2026-11-21 무공록) */
export function cheonoeCards(): string[] {
  const out = new Set<string>();
  for (let i = 0; i < 3; i++) {
    try {
      const raw = JSON.parse(localStorage.getItem(`cheonoe.run.${i}`) ?? 'null');
      const run = raw?.run;
      for (const r of [run, run?.replayOf]) {
        if (!r) continue;
        for (const id of Object.keys(r.collection ?? {})) out.add(id);
        for (const c of r.deck ?? []) if (c?.cardId) out.add(c.cardId);
      }
    } catch {
      /* 다른 저장 형식이면 넘어간다 */
    }
  }
  return [...out];
}

/** 장을 넘은 순간: 지금 칸에 이어 갈 것을 적는다 */
export function autosave(sv: SaveData, slot: Slot): void {
  sv.slots[sv.active] = { ...slot, updatedAt: Date.now() };
  sv.maxCleared = Math.max(sv.maxCleared, slot.chapter);
  writeSave(sv);
}

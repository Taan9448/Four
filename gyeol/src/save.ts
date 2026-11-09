// 「결」 저장(2026-11-09, 7-3절): localStorage `gyeol.save` 하나에 설정·진행·기록을 담는다. 판 번호(v)로 옛 저장을 옮긴다.
// 저장이 막힌 브라우저(사생활 보호 창 등)에서는 이번 판 메모리에만 둔다.

export type Quality = 'auto' | 'high' | 'normal' | 'low';

export interface Settings {
  /** 소리(0~1): 전체·배경·효과 */
  master: number;
  bgm: number;
  sfx: number;
  /** 화면 흔들림 배율(0~1) */
  shake: number;
  /** 번쩍임 줄이기(광과민) */
  reduceFlash: boolean;
  /** 판정 보정 ms: 늦게 누르는 버릇·화면 지연만큼 누른 시각을 앞당긴다(+면 앞당김) */
  inputOffset: number;
  quality: Quality;
}

export interface SaveData {
  v: 1;
  settings: Settings;
  /** 박자 도전 최고 기록(상대 id별) */
  rhythmBest: Record<string, { accuracy: number; rank: string }>;
  /** 이야기 진행(7-2): 깬 장·별 — 3단계에서 채운다 */
  story: { cleared: string[]; stars: Record<string, number> };
  /** 상대별 최고 대결 등급 — 2단계에서 채운다 */
  duelBest: Record<string, string>;
}

export const KEY = 'gyeol.save';
const OLD_RHYTHM_KEY = 'gyeol.rhythmBest';

export const defaultSettings = (): Settings => ({ master: 0.8, bgm: 0.55, sfx: 0.8, shake: 1, reduceFlash: false, inputOffset: 0, quality: 'auto' });

export const emptySave = (): SaveData => ({ v: 1, settings: defaultSettings(), rhythmBest: {}, story: { cleared: [], stars: {} }, duelBest: {} });

interface Store {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

function store(): Store | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

const clamp = (x: unknown, lo: number, hi: number, dflt: number): number => (typeof x === 'number' && Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : dflt);

/** 읽은 값을 지금 판 모양으로 맞춘다(모르는 칸은 버리고, 빠진 칸은 기본값) */
export function normalize(raw: unknown): SaveData {
  const s = emptySave();
  if (!raw || typeof raw !== 'object') return s;
  const r = raw as Partial<SaveData> & { settings?: Partial<Settings> };
  const d = s.settings;
  const st: Partial<Settings> = r.settings ?? {};
  s.settings = {
    master: clamp(st.master, 0, 1, d.master),
    bgm: clamp(st.bgm, 0, 1, d.bgm),
    sfx: clamp(st.sfx, 0, 1, d.sfx),
    shake: clamp(st.shake, 0, 1, d.shake),
    reduceFlash: typeof st.reduceFlash === 'boolean' ? st.reduceFlash : d.reduceFlash,
    inputOffset: Math.round(clamp(st.inputOffset, -120, 120, d.inputOffset)),
    quality: st.quality === 'high' || st.quality === 'normal' || st.quality === 'low' || st.quality === 'auto' ? st.quality : d.quality,
  };
  if (r.rhythmBest && typeof r.rhythmBest === 'object') s.rhythmBest = { ...r.rhythmBest };
  if (r.story && Array.isArray(r.story.cleared)) s.story = { cleared: [...r.story.cleared], stars: { ...(r.story.stars ?? {}) } };
  if (r.duelBest && typeof r.duelBest === 'object') s.duelBest = { ...r.duelBest };
  return s;
}

let cache: SaveData | null = null;

export function loadSave(st: Store | null = store()): SaveData {
  if (cache) return cache;
  let data = emptySave();
  try {
    const raw = st?.getItem(KEY);
    if (raw) data = normalize(JSON.parse(raw));
    else {
      // 옛 박자 도전 기록(gyeol.rhythmBest)을 옮긴다
      const old = st?.getItem(OLD_RHYTHM_KEY);
      if (old) data.rhythmBest = JSON.parse(old) as SaveData['rhythmBest'];
    }
  } catch {
    // 깨진 저장은 새로 시작
  }
  cache = data;
  return data;
}

export function writeSave(data: SaveData, st: Store | null = store()): void {
  cache = data;
  try {
    st?.setItem(KEY, JSON.stringify(data));
  } catch {
    // 저장이 막힌 브라우저면 이번 판만
  }
}

/** 시험용: 메모리 저장을 비운다 */
export function resetSaveCache(): void {
  cache = null;
}

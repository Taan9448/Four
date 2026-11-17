// 「결」 저장(2026-11-09, 7-3절): localStorage `gyeol.save` 하나에 설정·진행·기록을 담는다. 판 번호(v)로 옛 저장을 옮긴다.
// 저장이 막힌 브라우저(사생활 보호 창 등)에서는 이번 판 메모리에만 둔다.

import { defaultKeys, keyText, normalizeKeys, type KeyMap } from './keys';

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
  /** 받기마다 몇 ms 일찍 눌렀는지 숫자로(2026-11-17) */
  showTiming: boolean;
  /** 판정 보정 ms: 늦게 누르는 버릇·화면 지연만큼 누른 시각을 앞당긴다(+면 앞당김) */
  inputOffset: number;
  quality: Quality;
  /** 대결 키(2026-11-13): 입력마다 물리 키 둘(KeyboardEvent.code) */
  keys: KeyMap;
}

export interface StoryProgress {
  cleared: string[];
  stars: Record<string, number>;
  flags: string[];
}
export type StoryDifficulty = 'normal' | 'hard';
export interface StorySlot {
  story: StoryProgress;
  difficulty: StoryDifficulty;
  /** 마지막으로 저장한 때(ms) */
  updatedAt: number;
}
export const SLOT_COUNT = 3;

export interface SaveData {
  v: 1;
  settings: Settings;
  /** 박자 도전 최고 기록(상대 id별) */
  rhythmBest: Record<string, { accuracy: number; rank: string }>;
  /** 이야기 진행(7-2): 깬 장·별 — 3단계에서 채운다 */
  story: StoryProgress;
  /**
   * 이야기 불러오기 3칸(2026-11-14 사용자 요청 "천외귀환처럼 3개의 불러오기 창, 보통·어려움"): 칸마다 이야기 진행과 난이도.
   * story는 지금 고른 칸(slot)의 진행을 그대로 담는다 — 저장할 때 slots[slot]에도 옮겨 적는다. 설정·기록·업적·옷은 칸과 상관없이 하나
   */
  slots: (StorySlot | null)[];
  slot: number;
  /** 상대·난이도별 최고 대결 등급(`<상대 id>:<난이도 id>` → S·A·B·C) */
  duelBest: Record<string, string>;
  /** 쌓인 기록(기록 화면) */
  stats: Stats;
  /** 한 번이라도 겨뤄 본 상대(도감에서 그림·설명을 보인다) */
  seen: string[];
  /** 이미 본 안내(기술·집중·겨루기 — 처음 나오는 순간 한 번) */
  tips: string[];
  /** 이야기에서 본 그림 id(2026-11-15 도감 그림 모음) — 칸과 상관없이 하나 */
  gallery: string[];
  /** 이룬 업적 id · 입은 하운 옷 id(5단계, gyeol/data/progress.json) */
  achievements: string[];
  outfit: string;
  /** 동료 옷(2026-11-14): 인물 id → 옷 id(진하운은 outfit) */
  outfits?: Record<string, string>;
  /** 고른 인물(2026-11-11, duel.json characters) · 인물별 쌓인 기록 */
  character: string;
  charStats: Record<string, Stats>;
}

export interface Stats {
  duels: number;
  wins: number;
  parries: number;
  /** PERFECT 판정 수(옛 저장의 excellent를 옮긴다) */
  perfect: number;
  deathblows: number;
  techs: number;
  clashWins: number;
  maxStreak: number;
  /** 대결 시계 합(ms) */
  playMs: number;
}

export const emptyStats = (): Stats => ({ duels: 0, wins: 0, parries: 0, perfect: 0, deathblows: 0, techs: 0, clashWins: 0, maxStreak: 0, playMs: 0 });

export const KEY = 'gyeol.save';
const OLD_RHYTHM_KEY = 'gyeol.rhythmBest';

export const defaultSettings = (): Settings => ({ master: 0.8, bgm: 0.55, sfx: 0.8, shake: 1, reduceFlash: false, showTiming: true, inputOffset: 0, quality: 'auto', keys: defaultKeys() });

export const emptySave = (): SaveData => ({ v: 1, settings: defaultSettings(), rhythmBest: {}, story: { cleared: [], stars: {}, flags: [] }, slots: [{ story: { cleared: [], stars: {}, flags: [] }, difficulty: 'normal', updatedAt: 0 }, null, null], slot: 0, duelBest: {}, stats: emptyStats(), seen: [], tips: [], gallery: [], achievements: [], outfit: 'base', character: 'haun', charStats: {} });

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
    showTiming: typeof st.showTiming === 'boolean' ? st.showTiming : d.showTiming,
    inputOffset: Math.round(clamp(st.inputOffset, -120, 120, d.inputOffset)),
    quality: st.quality === 'high' || st.quality === 'normal' || st.quality === 'low' || st.quality === 'auto' ? st.quality : d.quality,
    keys: normalizeKeys(st.keys),
  };
  if (r.rhythmBest && typeof r.rhythmBest === 'object') s.rhythmBest = { ...r.rhythmBest };
  const readStory = (x: Partial<StoryProgress> | undefined): StoryProgress | null =>
    x && Array.isArray(x.cleared) ? { cleared: x.cleared.filter((c): c is string => typeof c === 'string'), stars: { ...(x.stars ?? {}) }, flags: Array.isArray(x.flags) ? x.flags.filter((f): f is string => typeof f === 'string') : [] } : null;
  const story = readStory(r.story);
  if (story) s.story = story;
  // 불러오기 칸: 옛 저장(칸 없음)은 지금 진행을 1번 칸(보통)으로 옮긴다
  if (Array.isArray(r.slots)) {
    s.slots = Array.from({ length: SLOT_COUNT }, (_, i) => {
      const x = r.slots![i] as Partial<StorySlot> | null | undefined;
      const st = x ? readStory(x.story) : null;
      return st ? { story: st, difficulty: x!.difficulty === 'hard' ? 'hard' : 'normal', updatedAt: typeof x!.updatedAt === 'number' ? x!.updatedAt : 0 } : null;
    });
    s.slot = typeof r.slot === 'number' && r.slot >= 0 && r.slot < SLOT_COUNT ? r.slot : 0;
    if (!s.slots[s.slot]) s.slots[s.slot] = { story: s.story, difficulty: 'normal', updatedAt: 0 };
    s.story = s.slots[s.slot]!.story;
  } else {
    s.slots = [{ story: s.story, difficulty: 'normal', updatedAt: 0 }, null, null];
    s.slot = 0;
  }
  if (r.duelBest && typeof r.duelBest === 'object') s.duelBest = { ...r.duelBest };
  if (r.stats && typeof r.stats === 'object') {
    const base = emptyStats();
    for (const k of Object.keys(base) as (keyof Stats)[]) base[k] = clamp(r.stats[k], 0, Number.MAX_SAFE_INTEGER, 0);
    const old = (r.stats as { excellent?: number }).excellent;
    if (!base.perfect && typeof old === 'number') base.perfect = clamp(old, 0, Number.MAX_SAFE_INTEGER, 0);
    s.stats = base;
  }
  if (Array.isArray(r.seen)) s.seen = r.seen.filter((x): x is string => typeof x === 'string');
  if (Array.isArray(r.tips)) s.tips = r.tips.filter((x): x is string => typeof x === 'string');
  if (Array.isArray(r.gallery)) s.gallery = r.gallery.filter((x): x is string => typeof x === 'string');
  if (Array.isArray(r.achievements)) s.achievements = r.achievements.filter((x): x is string => typeof x === 'string');
  if (typeof r.outfit === 'string') s.outfit = r.outfit;
  if (r.outfits && typeof r.outfits === 'object') s.outfits = Object.fromEntries(Object.entries(r.outfits).filter(([, v]) => typeof v === 'string'));
  if (typeof r.character === 'string') s.character = r.character;
  if (r.charStats && typeof r.charStats === 'object')
    for (const [id, st] of Object.entries(r.charStats)) {
      const base = emptyStats();
      for (const k of Object.keys(base) as (keyof Stats)[]) base[k] = clamp((st as Partial<Stats>)?.[k], 0, Number.MAX_SAFE_INTEGER, 0);
      s.charStats[id] = base;
    }
  return s;
}

let cache: SaveData | null = null;

/** 지금 칸의 난이도 */
export const storyDifficulty = (save: SaveData): StoryDifficulty => save.slots?.[save.slot]?.difficulty ?? 'normal';

/** 칸을 고른다(이어하기). 빈 칸이면 difficulty로 새로 시작 */
export function useSlot(save: SaveData, i: number, difficulty?: StoryDifficulty): SaveData {
  const slot = save.slots[i] ?? { story: { cleared: [], stars: {}, flags: [] }, difficulty: difficulty ?? 'normal', updatedAt: Date.now() };
  save.slots[i] = slot;
  save.slot = i;
  save.story = slot.story;
  return save;
}

/** 칸을 지운다(지금 칸이면 빈 보통 칸으로) */
export function clearSlot(save: SaveData, i: number): SaveData {
  save.slots[i] = null;
  if (save.slot === i) {
    const next = save.slots.findIndex((x) => x);
    if (next >= 0) useSlot(save, next);
    else useSlot(save, i, 'normal');
  }
  return save;
}

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

const writeListeners = new Set<() => void>();

/** 저장할 때마다 부른다(계정 올리기가 모아서 올린다 — cloud.ts). 돌려준 함수로 그만 듣는다 */
export function onSaveWrite(fn: () => void): () => void {
  writeListeners.add(fn);
  return () => writeListeners.delete(fn);
}

export function writeSave(data: SaveData, st: Store | null = store()): void {
  cache = data;
  // 지금 칸에 이야기 진행을 옮겨 적는다
  const cur = data.slots?.[data.slot];
  if (cur) {
    cur.story = data.story;
    cur.updatedAt = Date.now();
  }
  try {
    st?.setItem(KEY, JSON.stringify(data));
  } catch {
    // 저장이 막힌 브라우저면 이번 판만
  }
  for (const fn of writeListeners) fn();
}

/** 시험용: 메모리 저장을 비운다 */
export function resetSaveCache(): void {
  cache = null;
}

/** 안내 글의 {attack}·{parry}… 자리표를 지금 설정한 키 이름으로(2026-11-13 키 바꾸기) */
export const withKeys = (s: string): string => keyText(loadSave().settings.keys, s);

/** 이야기 그림을 봤다(도감 그림 모음에 열린다) */
export function rememberArt(id: string): void {
  const s = loadSave();
  if (s.gallery.includes(id)) return;
  s.gallery.push(id);
  writeSave(s);
}

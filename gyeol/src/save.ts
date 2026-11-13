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
  /** 판정 보정 ms: 늦게 누르는 버릇·화면 지연만큼 누른 시각을 앞당긴다(+면 앞당김) */
  inputOffset: number;
  quality: Quality;
  /** 대결 키(2026-11-13): 입력마다 물리 키 둘(KeyboardEvent.code) */
  keys: KeyMap;
}

export interface SaveData {
  v: 1;
  settings: Settings;
  /** 박자 도전 최고 기록(상대 id별) */
  rhythmBest: Record<string, { accuracy: number; rank: string }>;
  /** 이야기 진행(7-2): 깬 장·별 — 3단계에서 채운다 */
  story: { cleared: string[]; stars: Record<string, number>; flags: string[] };
  /** 상대·난이도별 최고 대결 등급(`<상대 id>:<난이도 id>` → S·A·B·C) */
  duelBest: Record<string, string>;
  /** 쌓인 기록(기록 화면) */
  stats: Stats;
  /** 한 번이라도 겨뤄 본 상대(도감에서 그림·설명을 보인다) */
  seen: string[];
  /** 이미 본 안내(기술·집중·겨루기 — 처음 나오는 순간 한 번) */
  tips: string[];
  /** 이룬 업적 id · 입은 하운 옷 id(5단계, gyeol/data/progress.json) */
  achievements: string[];
  outfit: string;
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

export const defaultSettings = (): Settings => ({ master: 0.8, bgm: 0.55, sfx: 0.8, shake: 1, reduceFlash: false, inputOffset: 0, quality: 'auto', keys: defaultKeys() });

export const emptySave = (): SaveData => ({ v: 1, settings: defaultSettings(), rhythmBest: {}, story: { cleared: [], stars: {}, flags: [] }, duelBest: {}, stats: emptyStats(), seen: [], tips: [], achievements: [], outfit: 'base', character: 'haun', charStats: {} });

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
    keys: normalizeKeys(st.keys),
  };
  if (r.rhythmBest && typeof r.rhythmBest === 'object') s.rhythmBest = { ...r.rhythmBest };
  if (r.story && Array.isArray(r.story.cleared)) s.story = { cleared: [...r.story.cleared], stars: { ...(r.story.stars ?? {}) }, flags: Array.isArray(r.story.flags) ? r.story.flags.filter((x): x is string => typeof x === 'string') : [] };
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
  if (Array.isArray(r.achievements)) s.achievements = r.achievements.filter((x): x is string => typeof x === 'string');
  if (typeof r.outfit === 'string') s.outfit = r.outfit;
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

// 고를 수 있는 인물(2026-11-11 사용자 요청 — "동료와 합류하면 인물을 골라 스테이지에 들어간다. 인물마다 특성, 기록은 따로").
// 인물 정의는 duel.json characters(진하운 기준 값을 덮어쓰는 player·rules). 판정 엔진(duel.ts)은 그대로 — 덮어쓴 데이터로 대결을 만든다.
import type { DuelData, Lines, PlayerDef } from './duel';

export interface CharacterDef {
  id: string;
  name: string;
  title: string;
  sprite: string;
  stand: string;
  fallbackStand?: string;
  /** 얼굴 동그라미에서 반신 그림의 어디를 보일지(background-position) */
  facePos?: string;
  /** 이 장을 마치면 합류(없으면 처음부터) */
  joinAfter?: string;
  trait: string;
  traits: string[];
  player?: Partial<Omit<PlayerDef, 'heavy' | 'combo' | 'attack'>> & { attack?: Partial<PlayerDef['attack']>; heavy?: Partial<NonNullable<PlayerDef['heavy']>> };
  rules?: Partial<DuelData['rules']>;
  /** 쓸 수 있는 기술(null이면 모두) */
  techs: string[] | null;
  lines?: Lines;
}

export const HAUN = 'haun';

export function characters(data: DuelData): CharacterDef[] {
  return (data as DuelData & { characters?: { list: CharacterDef[] } }).characters?.list ?? [];
}

export function characterOf(data: DuelData, id: string | undefined): CharacterDef | undefined {
  return characters(data).find((c) => c.id === (id ?? HAUN));
}

/** 합류했나: joinAfter 장을 마쳤으면 */
export function joined(c: CharacterDef, cleared: string[]): boolean {
  return !c.joinAfter || cleared.includes(c.joinAfter);
}

/** 고를 수 있는 인물이 둘 이상인가(합류한 동료가 있나) */
export const partyOpen = (data: DuelData, cleared: string[]): boolean => characters(data).filter((c) => joined(c, cleared)).length > 1;

/** 인물로 덮어쓴 대결 데이터(진하운이면 그대로) */
export function withCharacter(data: DuelData, id: string | undefined): DuelData {
  const c = characterOf(data, id);
  if (!c || c.id === HAUN) return data;
  const base = data.player;
  const o = c.player ?? {};
  const player: PlayerDef = {
    ...base,
    ...o,
    name: c.name,
    sprite: c.sprite,
    attack: { ...base.attack, ...(o.attack ?? {}) },
    heavy: base.heavy ? { ...base.heavy, ...(o.heavy ?? {}) } : undefined,
    combo: base.combo,
    lines: c.lines ?? base.lines,
  };
  return { ...data, player, rules: { ...data.rules, ...(c.rules ?? {}) } };
}

/** 인물이 쓸 수 있는 기술: 장 규칙(opts)과 인물 기술의 겹침 */
export function techsFor(data: DuelData, id: string | undefined, allowed?: string[]): string[] | undefined {
  const c = characterOf(data, id);
  if (!c || c.techs === null) return allowed;
  return allowed ? allowed.filter((t) => c.techs!.includes(t)) : c.techs;
}

/** 인물별 기록 키: 진하운은 예전 키 그대로(옛 저장과 이어진다), 동료는 @인물 */
export const recordKey = (key: string, id: string | undefined): string => (!id || id === HAUN ? key : `${key}@${id}`);

/** 지금 고른 인물(합류 전이면 진하운) */
export function chosen(data: DuelData, picked: string | undefined, cleared: string[]): string {
  const c = characterOf(data, picked);
  return c && joined(c, cleared) ? c.id : HAUN;
}

/** 얼굴 동그라미 전용 그림 id(2026-11-13, Codex face_gyeol_<인물>) */
export const faceId = (id: string): string => `face_gyeol_${id}`;

/**
 * 얼굴 동그라미 스타일. round: 동그라미 전용 얼굴 그림(face_gyeol_<인물>)이 실제로 왔으면 그 url — 동그라미에 꽉 차게(cover).
 * 없으면 반신 그림(url)을 크게 키워 얼굴 자리(facePos)만 보인다.
 */
export function faceStyle(c: CharacterDef | undefined, url: string | null, round: string | null = null): string {
  if (round) return `background-image:url("${round}");background-size:cover;background-position:50% 50%`;
  return url ? `background-image:url("${url}");background-position:${c?.facePos ?? '50% 6%'}` : '';
}

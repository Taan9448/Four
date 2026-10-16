// 비주얼 노벨 장면의 표정 규칙.
// 표정(face)을 적지 않은 줄은 그 인물의 직전 표정을 유지한다. 장면에 처음 나올 때는 기본(neutral).
import type { Face, SceneDef } from './schema';

/** 한 인물의 표정은 바뀐 뒤(또는 처음 나온 뒤) 장면 줄 수로 이만큼 지나야 다시 바뀔 수 있다 */
export const FACE_HOLD_LINES = 3;

/** 줄마다 실제로 보일 표정(화자 없는 줄은 null) */
export function sceneFaces(scene: SceneDef): (Face | null)[] {
  const cur = new Map<string, Face>();
  return scene.lines.map((l) => {
    if (!l.speaker) return null;
    const face = l.face ?? cur.get(l.speaker) ?? 'neutral';
    cur.set(l.speaker, face);
    return face;
  });
}

/** FACE_HOLD_LINES보다 빨리 표정이 바뀌는 곳(데이터 검사용) */
export function fastFaceChanges(scene: SceneDef, hold = FACE_HOLD_LINES): string[] {
  const faces = sceneFaces(scene);
  const last = new Map<string, { face: Face; at: number }>();
  const out: string[] = [];
  scene.lines.forEach((l, i) => {
    const face = faces[i];
    if (!l.speaker || !face) return;
    const prev = last.get(l.speaker);
    if (!prev) return void last.set(l.speaker, { face, at: i });
    if (prev.face === face) return;
    if (i - prev.at < hold) out.push(`${scene.id} ${i + 1}번째 줄: ${l.speaker} ${prev.face}(${prev.at + 1}줄) → ${face}`);
    last.set(l.speaker, { face, at: i });
  });
  return out;
}

/** 장면 글자 속도(설정 textSpeed): 한 글자에 걸리는 ms — 1 보통 40 · 2 두 배 20 · 3 즉시 0 */
export const TEXT_MS_PER_CHAR: Record<1 | 2 | 3, number> = { 1: 40, 2: 20, 3: 0 };

/** 자동 진행: 한 줄이 다 나온 뒤 기다리는 시간 = 글자 수 × 40ms + 600ms, 최소 1.2초 */
export const autoAdvanceDelay = (text: string) => Math.max(1200, [...text].length * 40 + 600);

/**
 * 본 장면 건너뛰기(2026-10-12 B3). seen = 이 브라우저 도감에 이미 기록된 장면.
 * 처음 보는 장면은 절대 건너뛰지 않는다. 자동으로 건너뛰는 것은 설정이 켜져 있고, 순례·심연이거나 캠페인을 한 번 마친 뒤일 때만 —
 * 캠페인 1회차는 '이미 본 장면 · 건너뛰기' 단추만 띄운다
 */
export function sceneSkip(opts: { seen: boolean; setting: boolean; mode: 'campaign' | 'pilgrimage' | 'abyss'; clears: number }): { auto: boolean } {
  if (!opts.seen) return { auto: false };
  const repeat = opts.mode !== 'campaign' || opts.clears > 0;
  return { auto: opts.setting && repeat };
}

/**
 * 줄 조건(SceneLine.if)에 맞는 줄만 남긴 장면(2026-10-16 #1305 — 보른이 화로 안에 들어갔을 때만 화로를 치는 줄 등).
 * 조건 없는 줄은 늘 남는다. 조건 줄이 빠지면 그 줄의 장면 일러스트(cg)도 함께 빠진다
 */
export function sceneForRun(scene: SceneDef, run: { flags: readonly string[]; selected: readonly string[] }): SceneDef {
  const keep = scene.lines.filter((l) => !l.if || ((!l.if.flag || run.flags.includes(l.if.flag)) && (!l.if.partyHas || run.selected.includes(l.if.partyHas))));
  return keep.length === scene.lines.length ? scene : { ...scene, lines: keep };
}

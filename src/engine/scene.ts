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

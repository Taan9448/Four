// 옷장(GAME_DESIGN 13-2절, 2026-10-12): 스토리를 마친 뒤 순례·심연에서 입는 옷. 여는 기록은 저장 칸과 상관없이 브라우저에 하나(UI가 저장).
// 세트 그림 id는 skin_<세트>_<동료>_<idle|attack|hit>. 세 장이 모두 실제 그림이어야 입는다(임시 그림이면 원래 옷).
import type { GameData } from './data';
import type { SkinUnlock } from './schema';

export interface Wardrobe {
  /** 연 세트 id(연 순서) */
  unlocked: string[];
  /** 동료 id → 입은 세트 id(없으면 원래 옷) */
  equipped: Record<string, string>;
}

export const emptyWardrobe = (): Wardrobe => ({ unlocked: [], equipped: {} });

/** 깨졌거나 옛 기록도 받는다. 데이터에 없는 세트·동료는 버린다 */
export function parseWardrobe(data: GameData, text: string | null): Wardrobe {
  const w = emptyWardrobe();
  try {
    const raw = JSON.parse(text ?? '{}') as Partial<Wardrobe>;
    const sets = new Set(data.skins.sets.map((s) => s.id));
    if (Array.isArray(raw.unlocked)) w.unlocked = [...new Set(raw.unlocked.filter((id) => typeof id === 'string' && sets.has(id)))];
    for (const [ch, id] of Object.entries(raw.equipped ?? {})) if (data.skins.characters.includes(ch) && w.unlocked.includes(id)) w.equipped[ch] = id;
  } catch {
    /* 빈 옷장 */
  }
  return w;
}

export const SKIN_ANIMS = ['idle', 'attack', 'hit'] as const;
export const skinSpriteId = (setId: string, charId: string, anim: string) => `skin_${setId}_${charId}_${anim}`;

/** 옷장이 여는 일 */
export type SkinEvent =
  | { kind: 'campaignClear'; difficulty: 'normal' | 'hard'; hardcore: boolean }
  | { kind: 'abyssDepth'; depth: number }
  | { kind: 'pilgrimStage'; stage: string };

function opens(u: SkinUnlock, ev: SkinEvent): boolean {
  switch (u.kind) {
    case 'campaignClear':
      // 어려움으로 마치면 보통 세트도 연다(더 어려운 쪽이 쉬운 쪽을 포함)
      return ev.kind === 'campaignClear' && (!u.difficulty || u.difficulty === 'normal' || ev.difficulty === 'hard');
    case 'hardcoreClear':
      return ev.kind === 'campaignClear' && ev.hardcore;
    case 'abyssDepth':
      return ev.kind === 'abyssDepth' && ev.depth >= u.depth;
    case 'pilgrimStage':
      return ev.kind === 'pilgrimStage' && ev.stage === u.stage;
  }
}

/** 이 일로 새로 열리는 세트(옷장에 더하고 그 세트들을 돌려준다) */
export function unlockSkins(data: GameData, w: Wardrobe, ev: SkinEvent): string[] {
  const fresh = data.skins.sets.filter((s) => !w.unlocked.includes(s.id) && opens(s.unlock, ev)).map((s) => s.id);
  w.unlocked.push(...fresh);
  return fresh;
}

/** 여는 조건 한 줄 */
export function unlockText(data: GameData, u: SkinUnlock): string {
  switch (u.kind) {
    case 'campaignClear':
      return u.difficulty === 'hard' ? '어려움으로 캠페인을 마친다' : '캠페인을 마친다';
    case 'hardcoreClear':
      return '하드코어로 캠페인을 마친다';
    case 'abyssDepth':
      return `심연 ${u.depth}굽이를 넘는다`;
    case 'pilgrimStage':
      return `순례로 ${data.stages.find((s) => s.id === u.stage)?.name ?? u.stage}을(를) 넘는다`;
  }
}

/** 입는다(연 세트만, null이면 원래 옷) */
export function equipSkin(w: Wardrobe, charId: string, setId: string | null): void {
  if (setId === null) delete w.equipped[charId];
  else if (w.unlocked.includes(setId)) w.equipped[charId] = setId;
}

/** 전투에서 쓸 동료 → 세트(순례·심연 런에서만). 그림이 다 왔는지는 화면이 본다 */
export function battleSkins(w: Wardrobe, run: { mode?: string; replayOf?: unknown; abyss?: unknown }): Record<string, string> {
  return run.abyss || run.replayOf ? { ...w.equipped } : {};
}

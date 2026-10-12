// 옷장(GAME_DESIGN 13-2절, 2026-10-12): 스토리를 마친 뒤 순례·심연에서 입는 옷. 여는 기록은 저장 칸과 상관없이 브라우저에 하나(UI가 저장).
// 세트 그림 id는 skin_<세트>_<동료>_<idle|attack|hit>(세트의 sprites로 다른 접두사를 쓸 수 있다). 세 장이 모두 실제 그림이어야 입는다(임시 그림이면 원래 옷).
// 2026-10-12: 처음부터 열린 세트(unlock 'always')·한 동료만의 세트(characters)·캠페인에서도 입는 세트(anyMode) — 카일 '은빛 기사검'
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
    addAlwaysOpen(data, w);
    for (const [ch, id] of Object.entries(raw.equipped ?? {})) if (skinFits(data, id, ch) && w.unlocked.includes(id)) w.equipped[ch] = id;
  } catch {
    /* 빈 옷장 */
  }
  addAlwaysOpen(data, w);
  return w;
}

/** 처음부터 열린 세트(unlock 'always')는 늘 연 목록에 있다 */
function addAlwaysOpen(data: GameData, w: Wardrobe): void {
  for (const s of data.skins.sets) if (s.unlock.kind === 'always' && !w.unlocked.includes(s.id)) w.unlocked.push(s.id);
}

/** 이 동료가 입을 수 있는 세트인가(세트의 characters, 없으면 옷장의 동료 전부) */
export function skinFits(data: GameData, setId: string, charId: string): boolean {
  const set = data.skins.sets.find((s) => s.id === setId);
  return !!set && data.skins.characters.includes(charId) && (!set.characters || set.characters.includes(charId));
}

export const SKIN_ANIMS = ['idle', 'attack', 'hit'] as const;
/** 세트 그림 id: 세트의 sprites[동료] 접두사가 있으면 그것(예: 은빛 기사검 → kyle_idle), 없으면 skin_<세트>_<동료>_<동작> */
export const skinSpriteId = (data: GameData, setId: string, charId: string, anim: string) => {
  const prefix = data.skins.sets.find((s) => s.id === setId)?.sprites?.[charId];
  return prefix ? `${prefix}_${anim}` : `skin_${setId}_${charId}_${anim}`;
};

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
    case 'always':
      return false;
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
    case 'always':
      return '처음부터 열려 있다';
  }
}

/** 입는다(연 세트·그 동료가 입을 수 있는 세트만, null이면 원래 옷) */
export function equipSkin(data: GameData, w: Wardrobe, charId: string, setId: string | null): void {
  if (setId === null) delete w.equipped[charId];
  else if (w.unlocked.includes(setId) && skinFits(data, setId, charId)) w.equipped[charId] = setId;
}

/** 전투에서 쓸 동료 → 세트. 순례·심연 런에서는 입은 옷 전부, 캠페인에서는 anyMode 세트만. 그림이 다 왔는지는 화면이 본다 */
export function battleSkins(data: GameData, w: Wardrobe, run: { mode?: string; replayOf?: unknown; abyss?: unknown }): Record<string, string> {
  if (run.abyss || run.replayOf) return { ...w.equipped };
  return Object.fromEntries(Object.entries(w.equipped).filter(([, id]) => data.skins.sets.find((s) => s.id === id)?.anyMode));
}

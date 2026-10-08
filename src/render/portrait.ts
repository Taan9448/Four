// 캐릭터 반신 그림(비주얼 노벨 장면·영웅/전설 카드 컷인 공용).
// 에셋 id는 <캐릭터>_stand, 프레임 1·2·3 = 표정 기본·결의·놀람. 그림이 아직 없으면 null(호출하는 쪽이 이름표로 대신한다).
import type { GameData } from '../engine/data';
import type { Face } from '../engine/schema';
import { spritesFor } from '../engine/state';
import { loadSprite, spriteSource } from './assets';

const FACE_FRAME: Record<Face, number> = { neutral: 0, resolve: 1, surprise: 2 };

export function standingId(characterId: string): string {
  return `${characterId}_stand`;
}

/**
 * 복장에 맞는 반신 그림 id: 런 플래그로 바뀐 복장(outfits의 sprites.stand, 예: 하운 '못생긴 검')의 실제 그림이 있으면 그것,
 * 없으면 기본 <캐릭터>_stand. 캐릭터가 아닌 화자(장면 인물)는 기본
 */
export function standingFor(data: GameData, characterId: string, flags: readonly string[] = []): string {
  const def = data.characters.get(characterId);
  const outfit = def ? spritesFor(def, flags).stand : undefined;
  return outfit && spriteSource(outfit) === 'sprites' ? outfit : standingId(characterId);
}

/** assetId: standingFor로 고른 반신 그림 id(생략하면 기본 <캐릭터>_stand) */
export async function loadPortrait(characterId: string, face: Face = 'neutral', assetId = standingId(characterId)): Promise<HTMLImageElement | null> {
  const asset = await loadSprite(assetId);
  if (!asset) return null;
  const img = asset.images[Math.min(FACE_FRAME[face], asset.images.length - 1)];
  return img instanceof HTMLImageElement ? img : null;
}

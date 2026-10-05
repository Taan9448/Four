// 캐릭터 반신 그림(비주얼 노벨 장면·영웅/전설 카드 컷인 공용).
// 에셋 id는 <캐릭터>_stand, 프레임 1·2·3 = 표정 기본·결의·놀람. 그림이 아직 없으면 null(호출하는 쪽이 이름표로 대신한다).
import type { Face } from '../engine/schema';
import { loadSprite } from './assets';

const FACE_FRAME: Record<Face, number> = { neutral: 0, resolve: 1, surprise: 2 };

export function standingId(characterId: string): string {
  return `${characterId}_stand`;
}

export async function loadPortrait(characterId: string, face: Face = 'neutral'): Promise<HTMLImageElement | null> {
  const asset = await loadSprite(standingId(characterId));
  if (!asset) return null;
  const img = asset.images[Math.min(FACE_FRAME[face], asset.images.length - 1)];
  return img instanceof HTMLImageElement ? img : null;
}

// 「결」 화면 배치(render·scene이 같이 쓴다)
export const W = 960;
export const H = 540;
export const GROUND = 452;
export const SCALE = 2.6;
export const PLAYER_X = 330;
export const FOE_X = 640;
export const CONTACT = { x: (PLAYER_X + FOE_X) / 2, y: GROUND - 120 };
/**
 * 인물·이펙트 층의 배율(2026-11-11 사용자 요청 "확대한 느낌으로 너무 크다" — 「천외귀환」처럼 배경은 화면을 채우고 인물은 작게).
 * 배경 위의 모든 것(인물·결·이펙트·판정 글자·말풍선)을 땅 가운데(W/2, GROUND)를 축으로 이만큼 줄여 그린다
 */
export const WORLD_ZOOM = 0.68;
/** 인물 층 좌표 → 화면 좌표 */
export const worldToScreen = (x: number, y: number): { x: number; y: number } => ({ x: W / 2 + (x - W / 2) * WORLD_ZOOM, y: GROUND + (y - GROUND) * WORLD_ZOOM });

/** 화면 가장자리 여백(이펙트가 이 안에 든다) */
const FX_MARGIN = 6;

/**
 * 이펙트 그림 자리(인물 층 좌표)를 화면 안에 들게 맞춘다(2026-11-13 사용자 보고 "적 스킬 이펙트가 잘려 나온다").
 * (x, y)는 그림의 기준점(ax, ay = 그림 안의 비율), w·h는 그릴 크기. 화면(W×H)보다 크면 기준점을 축으로 줄이고,
 * 가장자리를 넘으면 안쪽으로 민다. 돌려주는 값은 drawImage에 바로 쓰는 왼쪽 위 + 크기(인물 층 좌표).
 */
export function fitFx(x: number, y: number, w: number, h: number, ax = 0.5, ay = 0.5): { x: number; y: number; w: number; h: number } {
  const z = WORLD_ZOOM;
  const availW = W - FX_MARGIN * 2;
  const availH = H - FX_MARGIN * 2;
  const k = Math.min(1, availW / (w * z), availH / (h * z));
  w *= k;
  h *= k;
  let left = x - w * ax;
  let top = y - h * ay;
  const s = worldToScreen(left, top);
  const sRight = s.x + w * z;
  const sBottom = s.y + h * z;
  if (s.x < FX_MARGIN) left += (FX_MARGIN - s.x) / z;
  else if (sRight > W - FX_MARGIN) left -= (sRight - (W - FX_MARGIN)) / z;
  if (s.y < FX_MARGIN) top += (FX_MARGIN - s.y) / z;
  else if (sBottom > H - FX_MARGIN) top -= (sBottom - (H - FX_MARGIN)) / z;
  return { x: left, y: top, w, h };
}

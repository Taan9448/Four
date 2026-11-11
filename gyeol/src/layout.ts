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

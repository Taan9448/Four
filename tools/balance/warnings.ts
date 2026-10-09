// 보고서 맨 위의 경고 줄: tools/balance/targets.json의 목표와 비교한다(1단계, 외부 검토 3-c·5-d)
import targets from './targets.json';

export const TARGETS = targets;
const p = (x: number) => `${Math.round(x * 100)}%`;

/** 범위 밖이면 경고 문장, 안이면 null. lo/hi가 null이면 그쪽은 보지 않는다 */
export function outside(label: string, value: number, lo: number | null, hi: number | null, fmt: (x: number) => string = p): string | null {
  if (hi !== null && value > hi) return `${label} ${fmt(value)} — 목표 ${lo !== null ? `${fmt(lo)}~` : ''}${fmt(hi)} 넘음`;
  if (lo !== null && value < lo) return `${label} ${fmt(value)} — 목표 ${fmt(lo)}${hi !== null ? `~${fmt(hi)}` : ''} 아래`;
  return null;
}

/** 보고서에 넣을 '경고' 절 */
export function warningSection(lines: (string | null)[]): string[] {
  const ws = lines.filter((x): x is string => !!x);
  return ['## 경고', '', ...(ws.length ? ws.map((w) => `- ⚠ ${w}`) : ['- 목표 밖인 값이 없다.']), '', '목표: `tools/balance/targets.json`(GAME_DESIGN 12절·16절).', ''];
}

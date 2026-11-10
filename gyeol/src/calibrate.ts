// 「결」 박자 맞추기 계산(2026-11-10, 순수 함수 — 수련장 화면이 쓰고 테스트가 잰다)

/** 누른 시각과 가장 가까운 박의 차(ms, +면 늦게 눌렀다). 200ms 넘게 벗어난 것은 버린다 */
export function calibrationOffset(beats: number[], presses: number[]): { mean: number; spread: number; used: number } | null {
  const diffs: number[] = [];
  for (const p of presses) {
    let best = Infinity;
    for (const b of beats) if (Math.abs(p - b) < Math.abs(best)) best = p - b;
    if (Math.abs(best) <= 200) diffs.push(best);
  }
  if (diffs.length < 6) return null;
  diffs.sort((a, b) => a - b);
  // 위아래 하나씩 버리고 평균(손이 미끄러진 것)
  const trimmed = diffs.slice(1, -1);
  const mean = trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
  const spread = Math.sqrt(trimmed.reduce((a, b) => a + (b - mean) ** 2, 0) / trimmed.length);
  return { mean: Math.round(mean), spread: Math.round(spread), used: diffs.length };
}

// BALANCE_MODE=abyss: 심연(GAME_DESIGN 16절)을 봇으로 두고 굽이별 도달률·사망 원인·동료 수별·풀 크기별 표를 낸다
import type { GameData } from '../../src/engine/data';
import { abyssPool } from '../../src/engine/abyss';
import { DEFAULT_BOT, playAbyss, type AbyssReport, type BotOptions } from '../../src/sim/bot';

/** 봇용 풀: narrow = 캠페인 한 번 마친 저장 어림(시작 카드 + 보상 카드 절반, +0~1), wide = 전부 본 저장(+2) */
export function botPool(data: GameData, kind: 'narrow' | 'wide'): Record<string, number> {
  const rewards = [...data.cards.values()].filter((c) => c.pool === 'reward' && !c.essential);
  const collection: Record<string, number> = {};
  if (kind === 'wide') for (const c of rewards) collection[c.id] = 2;
  else rewards.forEach((c, i) => i % 2 === 0 && (collection[c.id] = i % 4 === 0 ? 1 : 0));
  return abyssPool(data, collection, []);
}

const MATE_SETS: string[][] = [['elia'], ['kyle'], ['born'], ['elia', 'kyle'], ['kyle', 'born'], ['elia', 'born'], ['elia', 'kyle', 'born']];

export function abyssReport(data: GameData, seeds: number, prefix: string, opts: BotOptions = DEFAULT_BOT, maxDepth = 15): string {
  const t0 = Date.now();
  const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '-');
  const lines: string[] = [];
  const runs: (AbyssReport & { pool: string; set: string })[] = [];
  for (const pool of ['narrow', 'wide'] as const) {
    const p = botPool(data, pool);
    for (const mates of MATE_SETS)
      for (let i = 1; i <= seeds; i++) runs.push({ ...playAbyss(data, `${prefix}${mates.join('')}${i}`, { mates, pool: p }, opts, maxDepth), pool, set: mates.join('+') });
  }
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
  const quant = (xs: number[], q: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * q))] ?? 0;
  const reach = (rs: AbyssReport[], d: number) => pct(rs.filter((r) => r.depth >= d).length, rs.length);
  lines.push('# 심연 밸런스 보고서 — 자동 플레이 봇');
  lines.push('');
  lines.push(`\`BALANCE_MODE=abyss npm run balance\`가 만든다(손으로 고치지 않는다). 조합마다 시드 ${seeds}개(${prefix}…), 풀 2종 × 동료 조합 ${MATE_SETS.length}개, 최대 ${maxDepth}굽이. 계산 ${((Date.now() - t0) / 1000).toFixed(1)}초.`);
  lines.push('목표(GAME_DESIGN 16절): 도달 굽이 중앙값 4, 8굽이 10%, 12굽이 1%. 동료 수별 중앙값 차이 1굽이 안. 풀이 좁아도 4굽이.');
  lines.push('');
  lines.push('## 동료 수 · 풀별');
  lines.push('');
  lines.push('| 풀 | 동료 수 | 런 | 도달 중앙값 | 상위 10% | 3굽이 | 5굽이 | 8굽이 | 12굽이 | 평균 덱 |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const pool of ['narrow', 'wide'])
    for (const n of [1, 2, 3]) {
      const rs = runs.filter((r) => r.pool === pool && r.mates === n);
      lines.push(`| ${pool === 'narrow' ? '좁음' : '넓음'} | ${n} | ${rs.length} | ${median(rs.map((r) => r.depth))} | ${quant(rs.map((r) => r.depth), 0.9)} | ${reach(rs, 3)} | ${reach(rs, 5)} | ${reach(rs, 8)} | ${reach(rs, 12)} | ${(rs.reduce((a, r) => a + r.deckSize, 0) / rs.length).toFixed(0)} |`);
    }
  lines.push('');
  lines.push('## 동료 조합별(좁은 풀)');
  lines.push('');
  lines.push('| 조합 | 도달 중앙값 | 상위 10% | 5굽이 |');
  lines.push('|---|---:|---:|---:|');
  for (const set of MATE_SETS.map((m) => m.join('+'))) {
    const rs = runs.filter((r) => r.pool === 'narrow' && r.set === set);
    lines.push(`| ${set} | ${median(rs.map((r) => r.depth))} | ${quant(rs.map((r) => r.depth), 0.9)} | ${reach(rs, 5)} |`);
  }
  lines.push('');
  lines.push('## 쓰러진 곳');
  lines.push('');
  const died = runs.filter((r) => r.result === 'defeat');
  const byType: Record<string, number> = {};
  for (const r of died) byType[r.diedAt ?? '?'] = (byType[r.diedAt ?? '?'] ?? 0) + 1;
  lines.push(`보스 ${pct(byType.boss ?? 0, died.length)} · 엘리트 ${pct(byType.elite ?? 0, died.length)} · 일반 ${pct(byType.battle ?? 0, died.length)} (쓰러진 런 ${died.length}/${runs.length})`);
  lines.push('');
  lines.push('| 전투 | 굽이 | 쓰러진 횟수 |');
  lines.push('|---|---:|---:|');
  const byMod = new Map<string, number>();
  for (const r of died) byMod.set(`${r.diedModule}@${r.depth}`, (byMod.get(`${r.diedModule}@${r.depth}`) ?? 0) + 1);
  for (const [k, v] of [...byMod].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
    const [id, d] = k.split('@');
    lines.push(`| ${data.modules.get(id)?.name ?? id} \`${id}\` | ${d} | ${v} |`);
  }
  return lines.join('\n');
}

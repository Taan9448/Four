// BALANCE_MODE=abyss: 심연(GAME_DESIGN 16절)을 봇으로 두고 굽이별 도달률·사망 원인·동료 수별·풀 크기별 표를 낸다
import type { GameData } from '../../src/engine/data';
import { abyssPool, unlockedRift } from '../../src/engine/abyss';
import { BOT_STYLE_NAME, playAbyss, type AbyssReport, type BotOptions } from '../../src/sim/bot';
import type { AbyssBatch } from './shared';
import { outside, TARGETS, warningSection } from './warnings';

/** 봇용 풀: narrow = 캠페인 한 번 마친 저장 어림(시작 카드 + 보상 카드 절반, +0~1), wide = 전부 본 저장(+2) */
export function botPool(data: GameData, kind: 'narrow' | 'wide'): Record<string, number> {
  const rewards = [...data.cards.values()].filter((c) => c.pool === 'reward' && !c.essential);
  const collection: Record<string, number> = {};
  if (kind === 'wide') for (const c of rewards) collection[c.id] = 2;
  else rewards.forEach((c, i) => i % 2 === 0 && (collection[c.id] = i % 4 === 0 ? 1 : 0));
  return abyssPool(data, collection, []);
}

const MATE_SETS: string[][] = [['elia'], ['kyle'], ['born'], ['elia', 'kyle'], ['kyle', 'born'], ['elia', 'born'], ['elia', 'kyle', 'born']];

export const MAX_DEPTH = 15;
const OATHS = [0, 3, 6, 10, 15];

/** 봇 한 성향으로 심연 표본을 둔다: 풀 2종 × 동료 조합, 서약 단계별 */
export function playAbyssBatch(data: GameData, seeds: number, prefix: string, opts: BotOptions, maxDepth = MAX_DEPTH): Omit<AbyssBatch, 'style' | 'ms'> {
  const runs: AbyssBatch['runs'] = [];
  // 좁은 풀 = 처음 심연(업적 없음: 틈의 카드 10장), 넓은 풀 = 다 연 저장(틈의 카드 40장)
  const fresh = unlockedRift(data, []);
  for (const pool of ['narrow', 'wide'] as const) {
    const p = botPool(data, pool);
    const unlocked = pool === 'narrow' ? fresh : undefined;
    for (const mates of MATE_SETS)
      for (let i = 1; i <= seeds; i++) runs.push({ ...playAbyss(data, `${prefix}${mates.join('')}${i}`, { mates, pool: p, unlocked }, opts, maxDepth), pool, set: mates.join('+') });
  }
  // 서약 단계별(넓은 풀, 엘리아+카일)
  const oathRuns = OATHS.map((oath) => ({
    oath,
    rs: Array.from({ length: seeds }, (_, i) => playAbyss(data, `${prefix}o${oath}_${i + 1}`, { mates: oath >= 14 ? ['elia'] : ['elia', 'kyle'], pool: botPool(data, 'wide'), oath }, opts, maxDepth)),
  }));
  return { runs, oathRuns };
}

/** 성향들의 표본을 합쳐(=평균) 보고서를 쓴다 */
export function abyssReport(data: GameData, batches: AbyssBatch[], seeds: number, prefix: string, maxDepth = MAX_DEPTH): string {
  const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '-');
  const lines: string[] = [];
  const runs = batches.flatMap((b) => b.runs);
  const oathRuns = OATHS.map((oath) => ({ oath, rs: batches.flatMap((b) => b.oathRuns.find((o) => o.oath === oath)?.rs ?? []) }));
  const secs = Math.max(...batches.map((b) => b.ms)) / 1000;
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
  const quant = (xs: number[], q: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * q))] ?? 0;
  const reach = (rs: AbyssReport[], d: number) => pct(rs.filter((r) => r.depth >= d).length, rs.length);
  lines.push('# 심연 밸런스 보고서 — 자동 플레이 봇');
  lines.push('');
  lines.push(`\`BALANCE_MODE=abyss npm run balance\`가 만든다(손으로 고치지 않는다). 조합마다 시드 ${seeds}개(${prefix}…), 풀 2종 × 동료 조합 ${MATE_SETS.length}개, 최대 ${maxDepth}굽이. 계산 ${secs.toFixed(1)}초(성향마다 동시에).`);
  lines.push(`봇 ${batches.map((b) => BOT_STYLE_NAME[b.style]).join(' · ')}(\`src/sim/bot.ts\` BOT_STYLES)의 표본을 합친 값 = 두 성향의 평균. 성향별 숫자는 아래 '봇 성향별'.`);
  lines.push('목표(GAME_DESIGN 16절): 도달 굽이 중앙값 4, 8굽이 10%, 12굽이 1%. 동료 수별 중앙값 차이 1굽이 안. 풀이 좁아도 4굽이.');
  lines.push('');
  // 경고: 숙적 비중 · 5굽이·15굽이 도달 · 넓은 풀 중앙값 · 평균 덱 · 서약이 앞 단계보다 쉬운지
  const t = TARGETS.abyss;
  const bossDeaths = runs.filter((r) => r.result === 'defeat' && r.diedAt === 'boss');
  const nemesis = bossDeaths.filter((r) => r.diedModule === data.balance.abyss.nemesisModule).length;
  const ws: (string | null)[] = [
    bossDeaths.length ? outside('숙적이 차지하는 보스 패배 비중', nemesis / bossDeaths.length, null, t.nemesisShareMax) : null,
    outside('5굽이 도달', runs.filter((r) => r.depth >= 5).length / runs.length, t.reach5[0], t.reach5[1]),
    outside(`${maxDepth}굽이 도달`, runs.filter((r) => r.depth >= maxDepth).length / runs.length, null, t.reach15Max),
    outside('넓은 풀 도달 중앙값', median(runs.filter((r) => r.pool === 'wide').map((r) => r.depth)), null, t.wideMedianMax, (x) => `${x}굽이`),
    outside('평균 덱', runs.reduce((a, r) => a + r.deckSize, 0) / runs.length, t.deck[0], t.deck[1], (x) => `${x.toFixed(0)}장`),
  ];
  oathRuns.forEach(({ oath, rs }, i) => {
    if (!i) return;
    const prev = oathRuns[i - 1];
    const a = median(prev.rs.map((r) => r.depth));
    const b = median(rs.map((r) => r.depth));
    if (b > a) ws.push(`서약 ${oath}단계가 ${prev.oath}단계보다 쉽다(도달 중앙값 ${b} > ${a}) — 단계마다 같거나 어려워야 한다`);
  });
  lines.push(...warningSection(ws));
  lines.push('## 봇 성향별');
  lines.push('');
  lines.push('| 성향 | 런 | 도달 중앙값 | 상위 10% | 5굽이 | 8굽이 | 평균 덱 |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|');
  for (const b of batches) {
    const rs = b.runs;
    lines.push(`| ${BOT_STYLE_NAME[b.style]} | ${rs.length} | ${median(rs.map((r) => r.depth))} | ${quant(rs.map((r) => r.depth), 0.9)} | ${reach(rs, 5)} | ${reach(rs, 8)} | ${(rs.reduce((a, r) => a + r.deckSize, 0) / rs.length).toFixed(0)} |`);
  }
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
  lines.push('## 서약 단계별(넓은 풀, 엘리아+카일 — 14단계부터 엘리아만)');
  lines.push('');
  lines.push('| 서약 | 런 | 도달 중앙값 | 상위 10% | 3굽이 | 5굽이 | 8굽이 | 평균 점수 |');
  lines.push('|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const { oath, rs } of oathRuns)
    lines.push(`| ${oath} | ${rs.length} | ${median(rs.map((r) => r.depth))} | ${quant(rs.map((r) => r.depth), 0.9)} | ${reach(rs, 3)} | ${reach(rs, 5)} | ${reach(rs, 8)} | ${Math.round(rs.reduce((a, r) => a + r.score, 0) / rs.length)} |`);
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

// npm run balance — 자동 플레이 봇으로 시드 여러 개를 S0부터 끝까지 두고 난이도 곡선을 낸다.
// 환경 변수: BALANCE_SEEDS(기본 300), BALANCE_PREFIX(시드 접두어, 기본 B), BALANCE_OUT(보고서 경로, 기본 docs/BALANCE_REPORT.md, "-"면 쓰지 않음)
import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { gameData } from '../../src/engine/data';
import { playableStages } from '../../src/engine/run';
import { DEFAULT_BOT, playRun, type RunReport } from '../../src/sim/bot';

const SEEDS = Number(process.env.BALANCE_SEEDS ?? 300);
const PREFIX = process.env.BALANCE_PREFIX ?? 'B';
const OUT = process.env.BALANCE_OUT ?? 'docs/BALANCE_REPORT.md';
// 실험용: BOT='{"minRewardValue":6}'처럼 봇 설정 일부를 덮어쓴다
// BALANCE_START=s3: 앞 스테이지를 건너뛰고 그 스테이지부터(뒤쪽 스테이지 표본을 늘릴 때. 보상·강화 없이 시작하므로 실제보다 약하다)
const START = process.env.BALANCE_START || undefined;
const BOT = { ...DEFAULT_BOT, ...JSON.parse(process.env.BOT ?? '{}') };
// BALANCE_DIFFICULTY=hard · BALANCE_HARDCORE=1: 난이도·하드코어 런으로(새 런 난이도 고르기와 같다)
const MODE = { difficulty: (process.env.BALANCE_DIFFICULTY === 'hard' ? 'hard' : 'normal') as 'normal' | 'hard', hardcore: process.env.BALANCE_HARDCORE === '1' };

const TYPE_ORDER: Record<string, number> = { battle: 0, elite: 1, story: 2, boss: 3 };
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '-');
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const f1 = (x: number) => x.toFixed(1);

it('밸런스: 봇 런', () => {
  const data = gameData();
  const t0 = Date.now();
  const runs: RunReport[] = [];
  for (let i = 1; i <= SEEDS; i++) runs.push(playRun(data, `${PREFIX}${String(i).padStart(4, '0')}`, BOT, START, MODE));
  const ms = Date.now() - t0;

  const stages = playableStages(data);
  const wins = runs.filter((r) => r.result === 'complete').length;
  const lines: string[] = [];
  lines.push('# 밸런스 보고서 — 자동 플레이 봇');
  lines.push('');
  lines.push(`\`npm run balance\`가 만든다(손으로 고치지 않는다). 시드 ${SEEDS}개(${PREFIX}0001~)${START ? `, ${START}부터 시작` : ''}, 봇 \`src/sim/bot.ts\`. 계산 ${(ms / 1000).toFixed(1)}초.`);
  lines.push('봇은 한 수 앞만 보는 탐욕 봇이라 사람보다 약하다. 절대 승률보다 **스테이지·전투 사이의 상대적인 어려움**을 본다. 목표는 `docs/GAME_DESIGN.md` 12절.');
  lines.push('');
  lines.push(`## 요약`);
  lines.push('');
  lines.push(`- 완주(에필로그까지): **${wins}/${SEEDS} (${pct(wins, SEEDS)})**`);
  lines.push(`- 평균 덱 ${f1(avg(runs.map((r) => r.deckSize)))}장 · 평균 상흔 ${f1(avg(runs.map((r) => r.scar)))}`);
  lines.push('');

  lines.push('## 스테이지별');
  lines.push('');
  lines.push('| 스테이지 | 도달 | 통과 | 통과율 | 여기서 패배 | 들어설 때 하운 체력 | 들어설 때 덱 | 들어설 때 하운 레벨 |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|---:|');
  for (const st of stages) {
    if (START && st.order < stages.find((x) => x.id === START)!.order) continue;
    const reached = runs.filter((r) => r.stageEntry.some((e) => e.stageId === st.id));
    const died = runs.filter((r) => r.result === 'defeat' && r.stageId === st.id).length;
    const entry = reached.map((r) => r.stageEntry.find((e) => e.stageId === st.id)!);
    lines.push(
      `| ${st.name} (${st.id}) | ${reached.length} | ${reached.length - died} | ${pct(reached.length - died, reached.length)} | ${died} | ${pct(avg(entry.map((e) => e.haunRatio)) * 100, 100)} | ${f1(avg(entry.map((e) => e.deck)))} | ${f1(avg(entry.map((e) => e.haunLevel)))} |`,
    );
  }
  lines.push('');

  lines.push('## 전투별');
  lines.push('');
  lines.push('체력 손실은 출전 멤버 최대 체력 합 대비. 패배율이 높거나 손실이 큰 전투가 벽이다.');
  lines.push('');
  lines.push('| 전투 | 유형 | 횟수 | 패배 | 평균 턴 | 시작 하운 체력 | 파티 체력 손실 | 하운 체력 손실 | 끝날 때 균열 |');
  lines.push('|---|---|---:|---:|---:|---:|---:|---:|---:|');
  const all = runs.flatMap((r) => r.battles);
  const byModule = new Map<string, typeof all>();
  for (const b of all) byModule.set(b.moduleId, [...(byModule.get(b.moduleId) ?? []), b]);
  const order = (id: string) => {
    const m = data.modules.get(id)!;
    return stages.findIndex((s) => s.id === m.stage) * 10 + (TYPE_ORDER[m.type] ?? 0);
  };
  for (const [id, bs] of [...byModule].sort((a, b) => order(a[0]) - order(b[0]) || a[0].localeCompare(b[0]))) {
    const lost = avg(bs.map((b) => (b.hpBefore - b.hpAfter) / b.hpMax));
    const haunLost = avg(bs.map((b) => (b.haunBefore - b.haunAfter) / data.characters.get('haun')!.maxHp));
    const defeats = bs.filter((b) => b.result === 'defeat').length;
    lines.push(
      `| ${data.modules.get(id)!.name} \`${id}\` | ${bs[0].type} | ${bs.length} | ${defeats ? `**${defeats} (${pct(defeats, bs.length)})**` : 0} | ${f1(avg(bs.map((b) => b.turns)))} | ${f1(avg(bs.map((b) => b.haunBefore)))} | ${pct(lost * 100, 100)} | ${pct(haunLost * 100, 100)} | ${f1(avg(bs.map((b) => b.rift)))} |`,
    );
  }
  lines.push('');
  const text = lines.join('\n');
  if (OUT !== '-') writeFileSync(OUT, text + '\n');
  // 요약을 콘솔에도(vitest가 삼키지 않게 stderr)
  process.stderr.write(`\n${text.split('\n## 전투별')[0]}\n`);
});

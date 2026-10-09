// npm run balance:human — 도감 '기록' 탭에서 내보낸 사람 플레이 기록(JSON)을 봇 보고서와 같은 칸으로 비교한다(1단계, 외부 검토 H).
// 환경 변수: HUMAN=<내보낸 파일>(필수), HUMAN_OUT(기본 .tmp/balance/human.md, "-"면 쓰지 않음).
// 봇 칸은 마지막 `npm run balance`의 결과(.tmp/balance/campaign-*.json)에서 읽는다. 없으면 '-'.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { gameData } from '../../src/engine/data';
import type { BattleLog } from '../../src/engine/run';
import type { RunLogEntry } from '../../src/ui/run-log';
import { DIR, type CampaignBatch } from './shared';

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '-');
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

it('밸런스: 사람 플레이 기록 비교', () => {
  const file = process.env.HUMAN;
  if (!file) throw new Error('HUMAN=<도감에서 내보낸 JSON 파일>을 주세요');
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  const runs: RunLogEntry[] = (Array.isArray(raw) ? raw : raw.runs ?? []).filter((e: RunLogEntry) => e?.v === 1);
  const data = gameData();
  const camp = runs.filter((r) => r.mode === 'campaign');
  const abyss = runs.filter((r) => r.mode === 'abyss');
  // 봇: 마지막 npm run balance 결과
  const botBattles: BattleLog[] = existsSync(DIR)
    ? readdirSync(DIR)
        .filter((f) => /^campaign-.*\.json$/.test(f))
        .flatMap((f) => (JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8')) as CampaignBatch).runs.flatMap((r) => r.battles))
    : [];

  const lines: string[] = [];
  lines.push('# 사람 플레이 기록 — 봇과 비교');
  lines.push('');
  lines.push(`\`HUMAN=${file} npm run balance:human\`이 만든다. 기록 ${runs.length}판(캠페인 ${camp.length} · 심연 ${abyss.length}), 버전 ${[...new Set(runs.map((r) => r.build))].join(', ') || '-'}.`);
  lines.push(`봇 칸은 마지막 \`npm run balance\`(${botBattles.length ? `전투 ${botBattles.length}번` : '없음'}).`);
  lines.push('');
  lines.push('## 요약');
  lines.push('');
  lines.push(`- 캠페인 완주 ${pct(camp.filter((r) => r.result === 'complete').length, camp.length)} (${camp.length}판)`);
  if (abyss.length) {
    const depths = abyss.map((r) => r.depth ?? 0).sort((a, b) => a - b);
    lines.push(`- 심연 도달 굽이 중앙값 ${depths[Math.floor(depths.length / 2)]} · 최고 ${depths[depths.length - 1]} (${abyss.length}판)`);
  }
  const died = camp.filter((r) => r.result === 'defeat');
  if (died.length) {
    const at = new Map<string, number>();
    for (const r of died) at.set(r.stageId, (at.get(r.stageId) ?? 0) + 1);
    lines.push(`- 캠페인에서 쓰러진 곳: ${[...at].map(([s, n]) => `${data.stages.find((x) => x.id === s)?.name ?? s} ${n}`).join(' · ')}`);
  }
  lines.push('');
  lines.push('## 전투별(사람이 한 번이라도 싸운 전투)');
  lines.push('');
  lines.push('| 전투 | 유형 | 사람 횟수 | 사람 패배 | 봇 패배 | 사람 평균 턴 | 봇 평균 턴 | 사람 파티 손실 | 봇 파티 손실 |');
  lines.push('|---|---|---:|---:|---:|---:|---:|---:|---:|');
  const group = (bs: BattleLog[]) => {
    const m = new Map<string, BattleLog[]>();
    for (const b of bs) m.set(b.moduleId, [...(m.get(b.moduleId) ?? []), b]);
    return m;
  };
  const human = group(runs.flatMap((r) => r.battles));
  const bot = group(botBattles);
  const loss = (bs: BattleLog[]) => avg(bs.map((b) => (b.hpMax ? (b.hpBefore - b.hpAfter) / b.hpMax : 0)));
  const order = (id: string) => data.stages.findIndex((s) => s.id === data.modules.get(id)?.stage);
  for (const [id, hs] of [...human].sort((a, b) => order(a[0]) - order(b[0]))) {
    const bs = bot.get(id) ?? [];
    const lost = (x: BattleLog[]) => x.filter((b) => b.result === 'defeat').length;
    lines.push(
      `| ${data.modules.get(id)?.name ?? id} | ${hs[0].type} | ${hs.length} | ${pct(lost(hs), hs.length)} | ${pct(lost(bs), bs.length)} | ${avg(hs.map((b) => b.turns)).toFixed(1)} | ${bs.length ? avg(bs.map((b) => b.turns)).toFixed(1) : '-'} | ${pct(loss(hs) * 100, 100)} | ${bs.length ? pct(loss(bs) * 100, 100) : '-'} |`,
    );
  }
  const text = lines.join('\n');
  const out = process.env.HUMAN_OUT ?? `${DIR}/human.md`;
  if (out !== '-') {
    mkdirSync(DIR, { recursive: true });
    writeFileSync(out, text + '\n');
  }
  process.stderr.write(`\n${text}\n`);
});

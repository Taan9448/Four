// 캠페인 밸런스 보고서(docs/BALANCE_REPORT.md): 봇 성향들의 런을 합쳐(=평균) 스테이지·전투별 표를 쓴다
import type { GameData } from '../../src/engine/data';
import { playableStages } from '../../src/engine/run';
import { BOT_STYLE_NAME, type RunReport } from '../../src/sim/bot';
import type { CampaignBatch } from './shared';

const TYPE_ORDER: Record<string, number> = { battle: 0, elite: 1, story: 2, boss: 3 };
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '-');
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const f1 = (x: number) => x.toFixed(1);

export function campaignReport(data: GameData, batches: CampaignBatch[], meta: { seeds: number; prefix: string; start?: string }): string {
  const { seeds, prefix, start } = meta;
  const runs = batches.flatMap((b) => b.runs);
  const stages = playableStages(data);
  const startOrder = start ? stages.find((x) => x.id === start)!.order : -1;
  const wins = (rs: RunReport[]) => rs.filter((r) => r.result === 'complete').length;
  const names = batches.map((b) => BOT_STYLE_NAME[b.style]);
  const lines: string[] = [];
  lines.push('# 밸런스 보고서 — 자동 플레이 봇');
  lines.push('');
  lines.push(
    `\`npm run balance\`가 만든다(손으로 고치지 않는다). 성향마다 시드 ${seeds}개(${prefix}0001~)${start ? `, ${start}부터 시작` : ''}, 봇 \`src/sim/bot.ts\` ${names.join(' · ')}. 계산 ${(Math.max(...batches.map((b) => b.ms)) / 1000).toFixed(1)}초(성향마다 동시에).`,
  );
  lines.push('봇은 한 수 앞만 보는 탐욕 봇이라 사람보다 약하다. 절대 승률보다 **스테이지·전투 사이의 상대적인 어려움**을 본다. 목표는 `docs/GAME_DESIGN.md` 12절.');
  lines.push(`대표값은 ${names.join('·')} 표본을 합친 값(= 두 성향의 평균). 한 성향에게만 쉬운 곳은 성향별 칸에서 갈린다.`);
  lines.push('');
  lines.push('## 요약');
  lines.push('');
  lines.push(`- 완주(에필로그까지): **${wins(runs)}/${runs.length} (${pct(wins(runs), runs.length)})** — ${batches.map((b) => `${BOT_STYLE_NAME[b.style]} ${pct(wins(b.runs), b.runs.length)}`).join(' · ')}`);
  lines.push(`- 평균 덱 ${f1(avg(runs.map((r) => r.deckSize)))}장 · 평균 상흔 ${f1(avg(runs.map((r) => r.scar)))}`);
  lines.push('');

  lines.push('## 스테이지별');
  lines.push('');
  lines.push(`| 스테이지 | 도달 | 통과 | 통과율 | ${names.map((n) => `통과율(${n})`).join(' | ')} | 여기서 패배 | 들어설 때 하운 체력 | 들어설 때 덱 | 들어설 때 하운 레벨 |`);
  lines.push(`|---|---:|---:|---:|${names.map(() => '---:|').join('')}---:|---:|---:|---:|`);
  const pass = (rs: RunReport[], id: string) => {
    const reached = rs.filter((r) => r.stageEntry.some((e) => e.stageId === id));
    const died = reached.filter((r) => r.result === 'defeat' && r.stageId === id).length;
    return { reached, died };
  };
  for (const st of stages) {
    if (st.order < startOrder) continue;
    const { reached, died } = pass(runs, st.id);
    const entry = reached.map((r) => r.stageEntry.find((e) => e.stageId === st.id)!);
    const perStyle = batches.map((b) => {
      const x = pass(b.runs, st.id);
      return pct(x.reached.length - x.died, x.reached.length);
    });
    lines.push(
      `| ${st.name} (${st.id}) | ${reached.length} | ${reached.length - died} | ${pct(reached.length - died, reached.length)} | ${perStyle.join(' | ')} | ${died} | ${pct(avg(entry.map((e) => e.haunRatio)) * 100, 100)} | ${f1(avg(entry.map((e) => e.deck)))} | ${f1(avg(entry.map((e) => e.haunLevel)))} |`,
    );
  }
  lines.push('');

  lines.push('## 전투별');
  lines.push('');
  lines.push('체력 손실은 출전 멤버 최대 체력 합 대비. 패배율이 높거나 손실이 큰 전투가 벽이다.');
  lines.push('');
  lines.push(`| 전투 | 유형 | 횟수 | 패배 | ${names.map((n) => `패배(${n})`).join(' | ')} | 평균 턴 | 시작 하운 체력 | 파티 체력 손실 | 하운 체력 손실 | 끝날 때 균열 |`);
  lines.push(`|---|---|---:|---:|${names.map(() => '---:|').join('')}---:|---:|---:|---:|---:|`);
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
    const perStyle = batches.map((s) => {
      const mine = s.runs.flatMap((r) => r.battles).filter((b) => b.moduleId === id);
      return pct(mine.filter((b) => b.result === 'defeat').length, mine.length);
    });
    lines.push(
      `| ${data.modules.get(id)!.name} \`${id}\` | ${bs[0].type} | ${bs.length} | ${defeats ? `**${defeats} (${pct(defeats, bs.length)})**` : 0} | ${perStyle.join(' | ')} | ${f1(avg(bs.map((b) => b.turns)))} | ${f1(avg(bs.map((b) => b.haunBefore)))} | ${pct(lost * 100, 100)} | ${pct(haunLost * 100, 100)} | ${f1(avg(bs.map((b) => b.rift)))} |`,
    );
  }
  lines.push('');
  return lines.join('\n');
}

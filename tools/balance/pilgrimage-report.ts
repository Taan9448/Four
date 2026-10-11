// BALANCE_MODE=pilgrimage: 순례(자유 여정, GAME_DESIGN 2절)를 봇으로 둔다 — 봇이 캠페인을 실제로 마친 일행(클리어 지도의 런)으로
// S1~S9를 스테이지마다 SEEDS번씩 다시 걷고, 일행 보정(balance.pilgrimage)이 캠페인 보통과 같은 체감을 내는지 본다
import type { GameData } from '../../src/engine/data';
import { pilgrimScale, playableStages, startReplay, type RunOptions, type RunState } from '../../src/engine/run';
import { BOT_STYLE_NAME, clearCampaign, playPilgrimage, type BotOptions, type RunReport } from '../../src/sim/bot';
import type { CampaignBatch } from './shared';
import { fmtPct, outside, TARGETS, targetTable, warningSection } from './warnings';

/** 순례로 걷는 스테이지(S0 프롤로그 제외) */
export const pilgrimStages = (data: GameData) => playableStages(data).filter((s) => s.id !== 's0').map((s) => s.id);

/** 클리어 일행 수: 봇이 캠페인을 마친 런을 이만큼 모아 돌려 쓴다(지도 시드는 걸을 때마다 다르다) */
export const HUBS = 8;

/** 봇 한 성향으로: 캠페인을 마친 일행 HUBS개를 모으고, 스테이지마다 seeds번 다시 걷는다 */
export function playPilgrimageBatch(data: GameData, seeds: number, prefix: string, opts: BotOptions, mode: RunOptions = {}): PilgrimRun[] {
  const hubs: RunState[] = [];
  for (let i = 1; i <= HUBS * 6 && hubs.length < HUBS; i++) {
    const hub = clearCampaign(data, `${prefix}C${String(i).padStart(3, '0')}`, opts, mode);
    if (hub) hubs.push(hub);
  }
  if (!hubs.length) throw new Error('봇이 캠페인을 한 번도 마치지 못했다');
  const runs: PilgrimRun[] = [];
  for (const stageId of pilgrimStages(data))
    for (let i = 1; i <= seeds; i++) {
      const hub = hubs[(i - 1) % hubs.length];
      runs.push({ ...playPilgrimage(data, hub, stageId, opts, i), scale: pilgrimScale(data, startReplay(data, hub, stageId)), relics: [...hub.relics], haunLevel: hub.roster.find((r) => r.id === 'haun')?.level ?? 1 });
    }
  return runs;
}

/** 순례 한 판: 봇 기록 + 그 길의 일행 보정 · 클리어 일행의 유물 · 하운 레벨 */
export type PilgrimRun = Omit<RunReport, 'relics'> & { scale: { hp: number; dmg: number }; relics: string[]; haunLevel: number };

interface Row {
  stageId: string;
  n: number;
  hp: number;
  dmg: number;
  win: number;
  bossDefeat: number;
  eliteDefeat: number;
  battleDefeat: number;
  turns: number;
  loss: number;
  bossTurns: number;
}

function rows(data: GameData, runs: PilgrimRun[]): Row[] {
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  return pilgrimStages(data).map((stageId) => {
    const rs = runs.filter((r) => r.stageId === stageId);
    const bs = rs.flatMap((r) => r.battles);
    const of = (type: string) => bs.filter((b) => b.type === type);
    const defeatRate = (type: string) => (of(type).length ? of(type).filter((b) => b.result === 'defeat').length / of(type).length : 0);
    const normal = of('battle');
    return {
      stageId,
      n: rs.length,
      hp: mean(rs.map((r) => r.scale.hp)),
      dmg: mean(rs.map((r) => r.scale.dmg)),
      win: rs.length ? rs.filter((r) => r.result === 'complete').length / rs.length : 0,
      bossDefeat: defeatRate('boss'),
      eliteDefeat: defeatRate('elite'),
      battleDefeat: defeatRate('battle'),
      turns: mean(normal.map((b) => b.turns)),
      // 전투 중 회복으로 끝 체력이 시작보다 많으면 손실 0으로 친다
      loss: mean(normal.map((b) => Math.max(0, b.hpBefore - b.hpAfter) / b.hpMax)),
      bossTurns: mean(of('boss').map((b) => b.turns)),
    };
  });
}

const table = (data: GameData, rs: Row[]) => [
  '| 스테이지 | 일행 보정(체력 · 피해, 평균) | 표본 | 넘김 | 보스 패배 | 엘리트 패배 | 일반 전투 패배 | 일반 전투 턴 | 파티 손실 | 보스 턴 |',
  '|---|---|---|---|---|---|---|---|---|---|',
  ...rs.map((r) => {
    const name = data.stages.find((s) => s.id === r.stageId)?.name ?? r.stageId;
    return `| ${r.stageId} ${name} | ×${r.hp.toFixed(2)} · ×${r.dmg.toFixed(2)} | ${r.n} | ${fmtPct(r.win)} | ${fmtPct(r.bossDefeat)} | ${fmtPct(r.eliteDefeat)} | ${fmtPct(r.battleDefeat)} | ${r.turns.toFixed(1)} | ${fmtPct(r.loss)} | ${r.bossTurns.toFixed(1)} |`;
  }),
];

export interface PilgrimBatch {
  style: CampaignBatch['style'];
  ms: number;
  runs: PilgrimRun[];
}

export function pilgrimageReport(data: GameData, batches: PilgrimBatch[], seeds: number, prefix: string): string {
  const t = TARGETS.pilgrimage;
  const runs = batches.flatMap((b) => b.runs);
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  const all = rows(data, runs);
  const secs = Math.max(...batches.map((b) => b.ms)) / 1000;
  const p = data.balance.pilgrimage;
  const lines: string[] = [];
  lines.push('# 순례 밸런스 보고서 — 자동 플레이 봇');
  lines.push('');
  lines.push(`\`BALANCE_MODE=pilgrimage npm run balance\`가 만든다(손으로 고치지 않는다). 스테이지마다 시드 ${seeds}개(${prefix}…) × 봇 ${batches.length}성향, 계산 ${secs.toFixed(1)}초(성향마다 동시에).`);
  const relics = runs.map((r) => r.relics.length);
  lines.push(`클리어 일행: 봇이 캠페인을 실제로 마친 런 ${HUBS}개(성향마다, \`src/sim/bot.ts\` clearCampaign — 일행 4명 복구)를 돌려 쓴다. 하운 레벨 평균 ${mean(runs.map((r) => r.haunLevel)).toFixed(1)} · 유물 평균 ${mean(relics).toFixed(1)}개(${Math.min(...relics)}~${Math.max(...relics)}). 봇 ${batches.map((b) => BOT_STYLE_NAME[b.style]).join(' · ')}의 표본을 합친 값.`);
  lines.push(`일행 보정(\`balance.pilgrimage\`): 1 + max(0, 하운 레벨 − 기준 레벨) × (체력 ${p.hpPerLevel} · 피해 ${p.dmgPerLevel}) + 유물 수 × ${p.relicPct}, 상한 체력 ×${p.maxHp} · 피해 ×${p.maxDmg}.`);
  lines.push(`목표(GAME_DESIGN 2절 · 12절, 캠페인 보통과 같은 체감): 일반 전투 ${t.normalTurns[0]}~${t.normalTurns[1]}턴 · 파티 손실 ${fmtPct(t.partyLoss[0])}~${fmtPct(t.partyLoss[1])} · 보스 패배 ${fmtPct(t.bossDefeat[0])}~${fmtPct(t.bossDefeat[1])}.`);
  lines.push('');
  lines.push(
    ...warningSection(
      all.flatMap((r) => [
        outside(`${r.stageId} 일반 전투 턴`, r.turns, t.normalTurns[0], t.normalTurns[1], (x) => x.toFixed(1)),
        outside(`${r.stageId} 파티 손실`, r.loss, t.partyLoss[0], t.partyLoss[1]),
        outside(`${r.stageId} 보스 패배`, r.bossDefeat, t.bossDefeat[0], t.bossDefeat[1]),
      ]),
    ),
  );
  const inRange = (x: number, [lo, hi]: number[]) => x >= lo && x <= hi;
  lines.push(
    ...targetTable([
      { label: '일반 전투 턴(스테이지 평균)', target: `${t.normalTurns[0]}~${t.normalTurns[1]}`, now: mean(all.map((r) => r.turns)).toFixed(1), ok: inRange(mean(all.map((r) => r.turns)), t.normalTurns) },
      { label: '파티 손실(스테이지 평균)', target: `${fmtPct(t.partyLoss[0])}~${fmtPct(t.partyLoss[1])}`, now: fmtPct(mean(all.map((r) => r.loss))), ok: inRange(mean(all.map((r) => r.loss)), t.partyLoss) },
      { label: '보스 패배(스테이지 평균)', target: `${fmtPct(t.bossDefeat[0])}~${fmtPct(t.bossDefeat[1])}`, now: fmtPct(mean(all.map((r) => r.bossDefeat))), ok: inRange(mean(all.map((r) => r.bossDefeat)), t.bossDefeat) },
    ]),
  );
  lines.push('## 스테이지별', '', ...table(data, all), '');
  lines.push('## 봇 성향별', '');
  for (const b of batches) lines.push(`### ${BOT_STYLE_NAME[b.style]}`, '', ...table(data, rows(data, b.runs)), '');
  return lines.join('\n');
}

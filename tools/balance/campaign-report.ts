// 캠페인 밸런스 보고서(docs/BALANCE_REPORT.md): 봇 성향들의 런을 합쳐(=평균) 스테이지·전투별 표를 쓴다
import type { GameData } from '../../src/engine/data';
import { playableStages } from '../../src/engine/run';
import { BOT_STYLE_NAME, type RunReport } from '../../src/sim/bot';
import { spreadSection, spreadWarning } from './enemy-ai';
import type { CampaignBatch } from './shared';
import { fmtPct, outside, TARGETS, targetTable, warningSection } from './warnings';

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
  lines.push(...campaignTargets(data, runs, stages.map((x) => x.id)));
  lines.push(...campaignWarnings(data, runs, stages.map((x) => x.id)));
  lines.push('## 요약');
  lines.push('');
  lines.push(`- 완주(에필로그까지): **${wins(runs)}/${runs.length} (${pct(wins(runs), runs.length)})** — ${batches.map((b) => `${BOT_STYLE_NAME[b.style]} ${pct(wins(b.runs), b.runs.length)}`).join(' · ')}`);
  lines.push(`- 평균 덱 ${f1(avg(runs.map((r) => r.deckSize)))}장 · 평균 상흔 ${f1(avg(runs.map((r) => r.scar)))}`);
  lines.push(...surgeSummary(data, runs));
  lines.push('');

  lines.push('## 스테이지별');
  lines.push('');
  lines.push(`| 스테이지 | 도달 | 통과 | 통과율 | ${names.map((n) => `통과율(${n})`).join(' | ')} | 여기서 패배 | 패배 위치(전체 패배 중) | 들어설 때 하운 체력 | 들어설 때 덱 | 들어설 때 하운 레벨 |`);
  lines.push(`|---|---:|---:|---:|${names.map(() => '---:|').join('')}---:|---:|---:|---:|---:|`);
  // 패배 위치: 모든 패배 중 이 스테이지에서 진 비율(어려움 목표: 한 스테이지 35% 이하 — 2026-10-12)
  const allDeaths = runs.filter((r) => r.result === 'defeat').length;
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
      `| ${st.name} (${st.id}) | ${reached.length} | ${reached.length - died} | ${pct(reached.length - died, reached.length)} | ${perStyle.join(' | ')} | ${died} | ${died ? pct(died, allDeaths) : '—'} | ${pct(avg(entry.map((e) => e.haunRatio)) * 100, 100)} | ${f1(avg(entry.map((e) => e.deck)))} | ${f1(avg(entry.map((e) => e.haunLevel)))} |`,
    );
  }
  lines.push('');

  lines.push('## 전투별');
  lines.push('');
  lines.push('체력 손실은 출전 멤버 최대 체력 합 대비. 패배율이 높거나 손실이 큰 전투가 벽이다.');
  lines.push('');
  lines.push(`| 전투 | 유형 | 횟수 | 패배 | ${names.map((n) => `패배(${n})`).join(' | ')} | 평균 턴 | 시작 하운 체력 | 파티 체력 손실 | 하운 체력 손실 | 끝날 때 균열 | 폭주 |`);
  lines.push(`|---|---|---:|---:|${names.map(() => '---:|').join('')}---:|---:|---:|---:|---:|---:|`);
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
      `| ${data.modules.get(id)!.name} \`${id}\` | ${bs[0].type} | ${bs.length} | ${defeats ? `**${defeats} (${pct(defeats, bs.length)})**` : 0} | ${perStyle.join(' | ')} | ${f1(avg(bs.map((b) => b.turns)))} | ${f1(avg(bs.map((b) => b.haunBefore)))} | ${pct(lost * 100, 100)} | ${pct(haunLost * 100, 100)} | ${f1(avg(bs.map((b) => b.rift)))} | ${avg(bs.map((b) => b.surges ?? 0)).toFixed(2)} |`,
    );
  }
  lines.push('');
  lines.push(...cardSection(data, runs));
  lines.push(...spreadSection(data, runs.flatMap((r) => r.battles)));
  return lines.join('\n');
}

/**
 * 카드(카드 250장 확장, 죽은 카드 찾기): 카드마다 보상 후보로 본 수 · 고른 수 · 선택률 · 스테이지 편성에 든 비율 · 전투에서 쓴 수 · 그 카드를 가진 런의 완주율.
 * 선택률 하위 15%와 편성 포함 0%를 '죽은 카드'로 따로. 시작·보상 카드만(이야기·틈·상태 카드 제외)
 */
function cardSection(data: GameData, runs: RunReport[]): string[] {
  const sum = (key: 'offered' | 'picked' | 'loadout' | 'used', id: string) => runs.reduce((a, r) => a + (r.cardLog?.[key][id] ?? 0), 0);
  const stages = runs.reduce((a, r) => a + r.stageEntry.length, 0);
  const loadouts = runs.reduce((a, r) => a + (r.focus?.loadouts ?? 0), 0);
  const focused = runs.reduce((a, r) => a + (r.focus?.focused ?? 0), 0);
  const possible = runs.reduce((a, r) => a + (r.focus?.possible ?? 0), 0);
  const rows = [...data.cards.values()]
    .filter((c) => c.pool === 'reward' || c.pool === 'starter')
    .map((c) => {
      const offered = sum('offered', c.id);
      const picked = sum('picked', c.id);
      const holders = runs.filter((r) => (r.cardLog?.picked[c.id] ?? 0) > 0 || (r.cardLog?.loadout[c.id] ?? 0) > 0);
      return {
        c,
        offered,
        picked,
        rate: offered ? picked / offered : 0,
        loadout: stages ? sum('loadout', c.id) / stages : 0,
        used: sum('used', c.id),
        win: holders.length ? holders.filter((r) => r.result === 'complete').length / holders.length : 0,
        holders: holders.length,
      };
    });
  const rewardRows = rows.filter((r) => r.c.pool === 'reward' && r.offered >= 20).sort((a, b) => a.rate - b.rate);
  const cut = rewardRows[Math.floor(rewardRows.length * 0.15)]?.rate ?? 0;
  const dead = rows.filter((r) => (r.c.pool === 'reward' && r.offered >= 20 && r.rate <= cut) || r.loadout === 0);
  const owner = (id: string) => (id === 'common' ? '공용' : (data.characters.get(id)?.name ?? id));
  const fmt = (x: number) => `${Math.round(x * 100)}%`;
  // 시작 카드(collection.grantStarters가 주는 pool 'starter')는 보상으로 나오지 않아 선택률이 없다 — 따로 센다(2026-10-12 A4)
  const starter = (r: (typeof rows)[number]) => r.c.pool === 'starter';
  const row = (r: (typeof rows)[number]) => `| ${r.c.name} \`${r.c.id}\` | ${owner(r.c.owner)} | ${r.c.rarity} | ${starter(r) ? '시작' : '—'} | ${r.offered} | ${r.picked} | ${fmt(r.rate)} | ${fmt(r.loadout)} | ${r.used} | ${r.holders ? fmt(r.win) : '-'} |`;
  const head = ['| 카드 | 주인 | 등급 | 시작 카드 | 보상 노출 | 선택 | 선택률 | 편성 포함(스테이지당) | 전투 사용 | 가진 런 완주 |', '|---|---|---|---|---:|---:|---:|---:|---:|---:|'];
  const deadReward = dead.filter((r) => !starter(r));
  return [
    '## 카드',
    '',
    `시작·보상 카드 ${rows.length}장. 선택률은 보상 후보로 본 횟수 중 고른 비율(봇: 희귀 이상 먼저, 없으면 모으는 갈래 태그가 맞는 카드). 편성 포함은 스테이지 편성 중 그 카드가 든 비율.`,
    `죽은 카드: 선택률 하위 15%(보상 노출 20번 이상, 선택률 ${fmt(cut)} 이하) 또는 편성에 한 번도 들지 않은 카드 — **${dead.length}장(${fmt(dead.length / Math.max(1, rows.length))})**(목표 15% 이하) — **시작 카드 제외 ${deadReward.length}장**(시작 카드 ${dead.length - deadReward.length}장은 편성에서 밀려난 것).`,
    `갈래 보너스가 켜진 편성(동료 편성 중 같은 갈래 5장 이상): 켤 수 있었던 편성(한 갈래 카드를 5장 이상 가짐) 중 **${fmt(focused / Math.max(1, possible))}**(목표 60% 이상, ${focused}/${possible}) · 모든 동료 편성 중 ${fmt(focused / Math.max(1, loadouts))}(${loadouts}).`,
    '',
    '### 죽은 카드',
    '',
    ...head,
    ...dead.sort((a, b) => Number(starter(a)) - Number(starter(b)) || a.loadout - b.loadout || a.rate - b.rate).map(row),
    '',
    '### 많이 쓰인 카드(전투 사용 상위 20)',
    '',
    ...head,
    ...[...rows].sort((a, b) => b.used - a.used).slice(0, 20).map(row),
    '',
  ];
}

/**
 * 폭주(GAME_DESIGN 7절, 2026-10-11 개편): 런당 횟수(목표 0.5~1), 폭주가 난 스테이지에서 진 비율 vs 안 난 스테이지(목표 2배 이하)
 */
function surgeSummary(data: GameData, runs: RunReport[]): string[] {
  const perRun = avg(runs.map((r) => r.battles.reduce((a, b) => a + (b.surges ?? 0), 0)));
  const visits: { surged: boolean; lost: boolean }[] = [];
  for (const r of runs) {
    const stages = [...new Set(r.battles.map((b) => b.stageId))];
    for (const st of stages) {
      const bs = r.battles.filter((b) => b.stageId === st);
      visits.push({ surged: bs.some((b) => (b.surges ?? 0) > 0), lost: bs.some((b) => b.result === 'defeat') });
    }
  }
  const rate = (xs: typeof visits) => (xs.length ? xs.filter((v) => v.lost).length / xs.length : 0);
  const withS = visits.filter((v) => v.surged);
  const without = visits.filter((v) => !v.surged);
  const ratio = rate(without) > 0 ? rate(withS) / rate(without) : 0;
  const made = runs.reduce((a, r) => a + (r.cracks?.made ?? 0), 0);
  const entered = runs.reduce((a, r) => a + (r.cracks?.entered ?? 0), 0);
  // 틈새 전투(틈의 짐승): crack 모듈의 전투
  const crackFights = runs.reduce((a, r) => a + r.battles.filter((b) => data.modules.get(b.moduleId)?.stage === 'crack').length, 0);
  // 스테이지별 폭주(런당): S2 이그니스 첫 폭주 목표 0.6~1.0
  const byStage = new Map<string, number>();
  for (const b of runs.flatMap((r) => r.battles)) byStage.set(b.stageId, (byStage.get(b.stageId) ?? 0) + (b.surges ?? 0));
  const stageLine = [...byStage].filter(([, n]) => n > 0).map(([st, n]) => `${st.toUpperCase()} ${(n / Math.max(1, runs.length)).toFixed(2)}`).join(' · ');
  return [
    `- 裂 틈새: 런당 ${(made / Math.max(1, runs.length)).toFixed(2)}곳 열림 · 들어간 비율 ${pct(entered, made)} · 틈새 전투 런당 **${(crackFights / Math.max(1, runs.length)).toFixed(2)}번**(목표 0.3 이상)`,
    `- 스테이지별 폭주(런당): ${stageLine || '없음'}`,
    `- 폭주: 런당 **${perRun.toFixed(2)}회**(목표 0.5~1) · 폭주가 난 스테이지 ${withS.length}곳 패배 ${pct(withS.filter((v) => v.lost).length, withS.length)} / 안 난 스테이지 패배 ${pct(without.filter((v) => v.lost).length, without.length)} → **${ratio.toFixed(1)}배**(목표 2배 이하, 4배를 넘으면 상흔→시작 균열을 약하게)`,
  ];
}

/** 목표 밖: 완주율, 일반 전투 패배, 엘리트 패배(3~7%), 스테이지별 보스 패배 상한. 표본이 30번 미만인 전투는 보지 않는다 */
function campaignWarnings(data: GameData, runs: RunReport[], stageIds: string[]): string[] {
  const t = TARGETS.campaign;
  const ws: (string | null)[] = [];
  if (runs.every((r) => r.stageEntry[0]?.stageId === 's0')) ws.push(outside('완주', runs.filter((r) => r.result === 'complete').length / runs.length, t.complete[0], t.complete[1]));
  const byModule = new Map<string, RunReport['battles']>();
  for (const b of runs.flatMap((r) => r.battles)) byModule.set(b.moduleId, [...(byModule.get(b.moduleId) ?? []), b]);
  const order = (id: string) => stageIds.indexOf(data.modules.get(id)?.stage ?? '');
  // 너무 쉬운 엘리트(목표 하한 아래)는 한 줄로 모은다(위험하지 않아 이름만)
  const easy: string[] = [];
  for (const [id, bs] of [...byModule].sort((a, b) => order(a[0]) - order(b[0]))) {
    if (bs.length < 30) continue;
    const rate = bs.filter((b) => b.result === 'defeat').length / bs.length;
    const name = `${data.modules.get(id)?.name ?? id} (${bs[0].type})`;
    if (bs[0].type === 'battle') ws.push(outside(name, rate, null, t.battleDefeatMax));
    else if (bs[0].type === 'elite') {
      ws.push(outside(name, rate, null, t.eliteDefeat[1]));
      if (rate < t.eliteDefeat[0]) easy.push(data.modules.get(id)?.name ?? id);
    }
    else if (bs[0].type === 'boss') {
      const max = (t.bossDefeatMax as Record<string, number>)[bs[0].stageId];
      if (max !== undefined) ws.push(outside(name, rate, null, max));
    }
  }
  ws.push(spreadWarning(data, runs.flatMap((r) => r.battles)));
  if (easy.length) ws.push(`엘리트 ${easy.length}곳이 목표 하한 ${Math.round(t.eliteDefeat[0] * 100)}% 아래: ${easy.join(' · ')}`);
  return warningSection(ws);
}

/** 목표와 지금: 완주 · 일반 전투 최대 패배 · 엘리트 최대 패배 · 스테이지별 보스 패배 */
function campaignTargets(data: GameData, runs: RunReport[], stageIds: string[]): string[] {
  const t = TARGETS.campaign;
  const rows: { label: string; target: string; now: string; ok: boolean }[] = [];
  const done = runs.filter((r) => r.result === 'complete').length / runs.length;
  rows.push({ label: '완주', target: `${fmtPct(t.complete[0])}~${fmtPct(t.complete[1])}`, now: fmtPct(done), ok: done >= t.complete[0] && done <= t.complete[1] });
  const byModule = new Map<string, RunReport['battles']>();
  for (const b of runs.flatMap((r) => r.battles)) byModule.set(b.moduleId, [...(byModule.get(b.moduleId) ?? []), b]);
  const rate = (bs: RunReport['battles']) => bs.filter((b) => b.result === 'defeat').length / bs.length;
  const worst = (type: string) => [...byModule].filter(([, bs]) => bs[0].type === type && bs.length >= 30).map(([id, bs]) => ({ id, r: rate(bs) })).sort((a, b) => b.r - a.r)[0];
  const wb = worst('battle');
  if (wb) rows.push({ label: '일반 전투 패배(가장 높은 곳)', target: `${fmtPct(t.battleDefeatMax)} 이하`, now: `${fmtPct(wb.r)} ${data.modules.get(wb.id)?.name ?? wb.id}`, ok: wb.r <= t.battleDefeatMax });
  const we = worst('elite');
  if (we) rows.push({ label: '엘리트 패배(가장 높은 곳)', target: `${fmtPct(t.eliteDefeat[0])}~${fmtPct(t.eliteDefeat[1])}`, now: `${fmtPct(we.r)} ${data.modules.get(we.id)?.name ?? we.id}`, ok: we.r <= t.eliteDefeat[1] });
  for (const st of stageIds) {
    const max = (t.bossDefeatMax as Record<string, number>)[st];
    const boss = [...byModule].find(([, bs]) => bs[0].type === 'boss' && bs[0].stageId === st);
    if (max === undefined || !boss) continue;
    const r = rate(boss[1]);
    rows.push({ label: `보스 패배 ${st.toUpperCase()} ${data.modules.get(boss[0])?.name ?? ''}`, target: `${fmtPct(max)} 이하`, now: fmtPct(r), ok: r <= max });
  }
  // 패배가 한 스테이지에 몰리지 않게(어려움 목표, 2026-10-12)
  const deaths = runs.filter((r) => r.result === 'defeat');
  if (deaths.length) {
    const by = new Map<string, number>();
    for (const r of deaths) by.set(r.stageId, (by.get(r.stageId) ?? 0) + 1);
    const [st, n] = [...by].sort((a, b) => b[1] - a[1])[0];
    const share = n / deaths.length;
    rows.push({ label: '패배가 가장 몰린 스테이지(전체 패배 중)', target: `${fmtPct(t.lossShareMax)} 이하`, now: `${fmtPct(share)} ${st.toUpperCase()}`, ok: share <= t.lossShareMax });
  }
  return targetTable(rows);
}

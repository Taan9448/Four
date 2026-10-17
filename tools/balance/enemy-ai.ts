// 적 AI 쏠림(2026-10-17 사용자 요청 — 적이 같은 기술만 쓴다): 봇 런의 전투 기록에서 적마다 행동을 쓴 횟수를 모아
// 되풀이하는 행동(한 번만·단계 기술 제외) 중 가장 많이 쓴 것의 비율과 1턴(첫 행동)의 고르기를 보인다.
// 보스는 원작 대본(순서)이라 표에만 두고 경고에서 뺀다
import type { GameData } from '../../src/engine/data';
import type { BattleRecord } from '../../src/sim/bot';
import { fmtPct, TARGETS } from './warnings';

export interface Spread {
  id: string;
  name: string;
  tier: string;
  pattern: string;
  /** 되풀이하는 행동 수 · 그 행동을 쓴 횟수 */
  moves: number;
  uses: number;
  top: { name: string; share: number };
  /** 이 적의 상한: max(topShareMin, topShareFactor ÷ 행동 수) */
  cap: number;
  openKinds: number;
  openTop: number;
}

export function enemySpread(data: GameData, battles: BattleRecord[]): Spread[] {
  const t = TARGETS.enemyAi;
  const use = new Map<string, Map<string, number>>();
  const open = new Map<string, Map<string, number>>();
  const add = (m: Map<string, Map<string, number>>, rec: Record<string, number> | undefined) => {
    for (const [k, n] of Object.entries(rec ?? {})) {
      const [enemy, move] = k.split(':');
      const row = m.get(enemy) ?? new Map<string, number>();
      row.set(move, (row.get(move) ?? 0) + n);
      m.set(enemy, row);
    }
  };
  for (const b of battles) {
    add(use, b.moveUse);
    add(open, b.moveOpen);
  }
  const out: Spread[] = [];
  for (const [id, all] of use) {
    const def = data.enemies.get(id);
    if (!def) continue;
    const repeat = new Set(def.moves.filter((m) => !m.phase && !m.oncePerBattle).map((m) => m.id));
    const row = [...all].filter(([m]) => repeat.has(m));
    const uses = row.reduce((a, [, n]) => a + n, 0);
    if (!uses) continue;
    const [topId, topN] = row.sort((a, b) => b[1] - a[1])[0];
    const o = open.get(id);
    const oTotal = o ? [...o.values()].reduce((a, b) => a + b, 0) : 0;
    out.push({
      id,
      name: def.name,
      tier: def.tier,
      pattern: def.pattern,
      moves: repeat.size,
      uses,
      top: { name: def.moves.find((m) => m.id === topId)?.name ?? topId, share: topN / uses },
      cap: Math.max(t.topShareMin, t.topShareFactor / Math.max(1, repeat.size)),
      openKinds: o ? o.size : 0,
      openTop: o && oTotal ? Math.max(...o.values()) / oTotal : 0,
    });
  }
  return out.sort((a, b) => b.top.share - b.cap - (a.top.share - a.cap) || b.uses - a.uses);
}

const watched = (s: Spread) => s.tier !== 'boss' && s.moves > 1 && s.uses >= TARGETS.enemyAi.minUses;
const overShare = (s: Spread) => s.top.share > s.cap;
const overOpen = (s: Spread) => s.openKinds > 0 && s.openTop > TARGETS.enemyAi.openTopMax;

/** 경고 줄: 일반·엘리트 적 중 최다 행동 비율이 상한을 넘는 수 · 1턴 행동이 한쪽으로 몰린 수 */
export function spreadWarning(data: GameData, battles: BattleRecord[]): string | null {
  const rows = enemySpread(data, battles).filter(watched);
  const bad = rows.filter(overShare);
  const opens = rows.filter(overOpen);
  const parts = [
    bad.length ? `적 기술 쏠림 ${bad.length}종 — ${bad.slice(0, 4).map((s) => `${s.name} ${fmtPct(s.top.share)}(상한 ${fmtPct(s.cap)})`).join(', ')}${bad.length > 4 ? ' …' : ''}` : '',
    opens.length ? `1턴 행동이 ${fmtPct(TARGETS.enemyAi.openTopMax)} 넘게 같은 적 ${opens.length}/${rows.length}종` : '',
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

/** 보고서 절: 적 기술 쏠림 표 */
export function spreadSection(data: GameData, battles: BattleRecord[]): string[] {
  const t = TARGETS.enemyAi;
  const rows = enemySpread(data, battles).filter((s) => s.uses >= t.minUses && s.moves > 1);
  const normal = rows.filter(watched);
  const lines = ['## 적 기술 쏠림', ''];
  lines.push(
    `되풀이하는 행동(한 번만·단계 기술 제외)이 둘 이상이고 ${t.minUses}번 이상 행동한 적. 가장 많이 쓴 행동의 비율이 상한 max(${fmtPct(t.topShareMin)}, ${t.topShareFactor} ÷ 행동 수)를 넘거나, 1턴 행동의 최다 비율이 ${fmtPct(t.openTopMax)}를 넘으면 ⚠(보스는 원작 대본이라 표시만). 일반·엘리트 ${normal.length}종 중 쏠림 ${normal.filter(overShare).length}종 · 1턴 고정 ${normal.filter(overOpen).length}종.`,
  );
  lines.push('');
  lines.push('| 적 | 등급 | 방식 | 행동 수 | 쓴 횟수 | 가장 많이 쓴 행동 | 비율(상한) | 1턴 행동 가짓수 | 1턴 최다 비율 |');
  lines.push('|---|---|---|---:|---:|---|---:|---:|---:|');
  const TIER: Record<string, string> = { normal: '일반', elite: '엘리트', boss: '보스' };
  for (const s of rows) {
    const w = watched(s);
    lines.push(
      `| ${s.name} | ${TIER[s.tier] ?? s.tier} | ${s.pattern === 'cycle' ? '순서' : '무작위'} | ${s.moves} | ${s.uses} | ${s.top.name} | ${fmtPct(s.top.share)} (${fmtPct(s.cap)})${w && overShare(s) ? ' ⚠' : ''} | ${s.openKinds} | ${fmtPct(s.openTop)}${w && overOpen(s) ? ' ⚠' : ''} |`,
    );
  }
  lines.push('');
  return lines;
}

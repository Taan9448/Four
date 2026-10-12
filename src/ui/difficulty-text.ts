// 난이도 문장(2026-10-12 C3): 난이도 고르기 화면·허브의 모드 라벨·런 요약의 주석이 같은 문장을 쓴다(문구 중복 금지)
import type { GameData } from '../engine/data';
import type { RunState } from '../engine/run';
import { tipAttrs } from './tooltip';

const x = (n: number | undefined) => `×${Number((n ?? 1).toFixed(3))}`;

/** 어려움: 스테이지별 배율(앞 · 가장 무거운 곳 · 끝) */
export function hardText(data: GameData): string {
  const by = data.balance.difficulty.hard.byStage;
  const ids = Object.keys(by);
  const peak = ids.reduce((a, b) => ((by[b]?.hp ?? 1) > (by[a]?.hp ?? 1) ? b : a), ids[0]);
  const first = ids[0];
  const last = ids[ids.length - 1];
  return `적 체력·공격력이 앞 ${x(by[first]?.hp)}·${x(by[first]?.dmg)}, 가장 무거운 ${peak.toUpperCase()} 무렵 ${x(by[peak]?.hp)}·${x(by[peak]?.dmg)}, 끝 ${x(by[last]?.hp)}·${x(by[last]?.dmg)}. 끝까지 가는 사람이 드물다.`;
}

export const HARDCORE_TEXT = '전투가 끝날 때 쓰러져 있던 동료는 다시 일어나지 않는다. 수치는 그대로.';

/** 모드 라벨 주석(허브·런 요약): 어려움이면 배율, 하드코어면 규칙 */
export function modeTipAttrs(data: GameData, run: Pick<RunState, 'difficulty' | 'hardcore'>): Record<string, string | undefined> {
  const lines = [run.difficulty === 'hard' ? `어려움 — ${hardText(data)}` : '보통 — 처음 마친 그 길 그대로.', run.hardcore ? `하드코어 — ${HARDCORE_TEXT}` : ''].filter(Boolean);
  return tipAttrs('난이도', lines.join('\n'));
}

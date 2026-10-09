// 사람 플레이 통계(1단계, 외부 검토 H): 끝난 런마다 한 줄을 이 브라우저에 쌓고(최근 200판), 도감 '기록' 탭에서 JSON으로 내보낸다.
// 내보낸 파일은 `HUMAN=파일 npm run balance:human`이 봇 보고서와 같은 칸(전투별 패배율·턴·체력 손실)으로 비교한다.
import type { GameData } from '../engine/data';
import type { BattleLog, RunState } from '../engine/run';
import { abyssScore } from '../engine/abyss';
import { readStore, writeStore } from './storage';

declare const __BUILD_ID__: string;

const KEY = 'cheonoe.runlog';
export const RUN_LOG_MAX = 200;

export interface RunLogEntry {
  v: 1;
  /** 끝난 시각(ISO) */
  at: string;
  /** 게임 버전(배포 커밋) */
  build: string;
  mode: 'campaign' | 'abyss';
  result: 'complete' | 'defeat';
  seed: string;
  /** 끝난 스테이지(심연은 굽이 d<n>) */
  stageId: string;
  difficulty: string;
  hardcore: boolean;
  party: string[];
  deck: number;
  scar: number;
  deathCause?: string;
  /** 심연: 굽이·서약·점수 */
  depth?: number;
  oath?: number;
  score?: number;
  battles: BattleLog[];
}

export function readRunLog(): RunLogEntry[] {
  try {
    const raw = JSON.parse(readStore(KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((e) => e && e.v === 1 && Array.isArray(e.battles)) : [];
  } catch {
    return [];
  }
}

/** 끝난 런 하나를 적는다. 같은 런을 두 번 적지 않는다(끝 화면을 다시 열 때) */
export function logRun(data: GameData, run: RunState, result: RunLogEntry['result']): void {
  const ab = run.abyss;
  const entry: RunLogEntry = {
    v: 1,
    at: new Date().toISOString(),
    build: typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev',
    mode: ab ? 'abyss' : 'campaign',
    result,
    seed: run.seed,
    stageId: ab ? `d${ab.depth}` : run.stageId,
    difficulty: run.difficulty ?? 'normal',
    hardcore: !!run.hardcore,
    party: run.roster.map((r) => r.id),
    deck: run.deck.length,
    scar: run.scar,
    deathCause: run.stats?.deathCause,
    ...(ab ? { depth: ab.depth, oath: ab.oath, score: abyssScore(data, run) } : {}),
    battles: run.stats?.log ?? [],
  };
  const log = readRunLog();
  const last = log[log.length - 1];
  if (last && last.seed === entry.seed && last.mode === entry.mode && last.battles.length === entry.battles.length && last.result === entry.result) return;
  writeStore(KEY, JSON.stringify([...log, entry].slice(-RUN_LOG_MAX)));
}

/** 내보내기: JSON 파일로 내려받는다 */
export function exportRunLog(): void {
  const blob = new Blob([JSON.stringify({ game: 'cheonoe', exported: new Date().toISOString(), runs: readRunLog() }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `cheonoe-runs-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function clearRunLog(): void {
  writeStore(KEY, null);
}

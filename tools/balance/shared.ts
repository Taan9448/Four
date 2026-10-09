// 밸런스 측정 공통: 봇 성향마다 런을 두어 .tmp/balance/<모드>-<성향>.json에 남기고(play.*.run.ts — 성향마다 다른 프로세스라 동시에 돈다),
// report.run.ts가 모아 보고서를 쓴다. 대표값은 두 성향의 평균(같은 시드 수를 합친 값).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { GameData } from '../../src/engine/data';
import { BOT_STYLES, playRun, type AbyssReport, type BotOptions, type BotStyle, type RunReport } from '../../src/sim/bot';
import { playAbyssBatch } from './abyss-report';

export const DIR = '.tmp/balance';
export const MODE = process.env.BALANCE_MODE === 'abyss' ? 'abyss' : 'campaign';
/** 성향 목록(BALANCE_STYLES=guard,strike). play.a·play.b가 하나씩 맡는다 */
export const STYLES = (process.env.BALANCE_STYLES ?? 'guard,strike').split(',').filter(Boolean) as BotStyle[];
export const SEEDS = Number(process.env.BALANCE_SEEDS ?? (MODE === 'abyss' ? 40 : 300));
export const PREFIX = process.env.BALANCE_PREFIX ?? (MODE === 'abyss' ? 'A' : 'B');
// BALANCE_START=s3: 앞 스테이지를 건너뛰고 그 스테이지부터(뒤쪽 스테이지 표본을 늘릴 때. 보상·강화 없이 시작하므로 실제보다 약하다)
export const START = process.env.BALANCE_START || undefined;
// BALANCE_DIFFICULTY=hard · BALANCE_HARDCORE=1: 난이도·하드코어 런으로(새 런 난이도 고르기와 같다)
export const RUN_MODE = { difficulty: (process.env.BALANCE_DIFFICULTY === 'hard' ? 'hard' : 'normal') as 'normal' | 'hard', hardcore: process.env.BALANCE_HARDCORE === '1' };

/** 실험용: BOT='{"minRewardValue":6}'처럼 봇 설정 일부를 덮어쓴다(두 성향 모두) */
export function botOptions(style: BotStyle): BotOptions {
  const base = BOT_STYLES[style];
  if (!base) throw new Error(`모르는 봇 성향: ${style} (guard · strike)`);
  return { ...base, ...JSON.parse(process.env.BOT ?? '{}') };
}

export interface CampaignBatch {
  style: BotStyle;
  ms: number;
  runs: RunReport[];
}
export interface AbyssBatch {
  style: BotStyle;
  ms: number;
  runs: (AbyssReport & { pool: string; set: string })[];
  oathRuns: { oath: number; rs: AbyssReport[] }[];
}

const file = (style: string) => `${DIR}/${MODE}-${style}.json`;

/** 성향 하나를 두고 결과를 남긴다(play.a / play.b) */
export function playStyle(data: GameData, slot: number): void {
  const style = STYLES[slot];
  if (!style) return; // 성향이 하나뿐이면 둘째 칸은 쉰다
  const t0 = Date.now();
  const opts = botOptions(style);
  let batch: CampaignBatch | AbyssBatch;
  if (MODE === 'abyss') batch = { style, ms: 0, ...playAbyssBatch(data, SEEDS, PREFIX, opts) };
  else {
    const runs: RunReport[] = [];
    for (let i = 1; i <= SEEDS; i++) runs.push(playRun(data, `${PREFIX}${String(i).padStart(4, '0')}`, opts, START, RUN_MODE));
    batch = { style, ms: 0, runs };
  }
  batch.ms = Date.now() - t0;
  mkdirSync(DIR, { recursive: true });
  writeFileSync(file(style), JSON.stringify(batch));
  process.stderr.write(`\n[balance] ${MODE} ${style}: ${(batch.ms / 1000).toFixed(1)}초\n`);
}

export function readBatches<T>(): T[] {
  return STYLES.map((style) => JSON.parse(readFileSync(file(style), 'utf8')) as T);
}

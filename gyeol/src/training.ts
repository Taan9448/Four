// 수련 Lv.(2026-11-11 사용자 요청 "수련 레벨이 동기화가 안 됨"): 「천외귀환」과 같은 계정 하나의 수련 경험치(cheonoe.training)를 함께 쓴다.
// 「결」에서 이긴 대결도 같은 표로 경험치를 더한다(일반 battle · 정예 elite · 보스 boss — data/balance.json training.xp).
// 「천외귀환」 코드는 고치지 않는다: 그 게임의 저장 키·계정 행(saves)을 그쪽 규칙(rev 낙관적 잠금·cloud-sync 지문) 그대로 읽고 고친다.
//  - 이 기기: localStorage cheonoe.training
//  - 로그인했으면: 계정 행 saves.data.keys['cheonoe.training']도 rev가 같을 때만 고치고, 이 기기 「천외귀환」 기록이 계정과 맞춰져 있었으면
//    맞춘 기록(cheonoe-cloud)도 새 rev로 옮겨 「천외귀환」이 다음에 열릴 때 묻지 않게 한다.
import balance from '../../data/balance.json';
import type { GameData } from '../../src/engine/data';
import { parseTraining, trainingLevel as cheonoeLevel } from '../../src/engine/training';
import { browserKV, type BackupFile, type KV } from '../../src/ui/backup';
import { cloudKeys, hashKeys, readMeta, writeMeta } from '../../src/ui/cloud-sync';

export const TRAINING_KEY = 'cheonoe.training';
const TRAINING = (balance as unknown as { training: GameData['balance']['training'] }).training;
const DATA = { balance: { training: TRAINING } } as unknown as GameData;

/** 이긴 전투 하나의 경험치 표(일반·정예·보스) */
export const TRAINING_XP = TRAINING.xp;

export interface Level {
  level: number;
  into: number;
  need: number;
  xp: number;
}

export const levelOf = (xp: number): Level => ({ ...cheonoeLevel(DATA, xp), xp });

/** 이긴 대결 하나의 경험치: 단계가 없으면 일반, 2단계 정예, 3단계 이상 보스 */
export function duelXp(phases: number): number {
  const x = TRAINING.xp;
  return phases >= 2 ? x.boss : phases === 1 ? x.elite : x.battle;
}

/** 계정 행(saves) 하나를 읽고 고치는 쪽 — 게임은 Supabase(cloud.ts), 테스트는 메모리 */
export interface CheonoeRow {
  fetch(): Promise<{ data: BackupFile; rev: number } | null>;
  /** rev가 expect일 때만 바꾼다(다른 기기가 먼저 바꿨으면 null) */
  update(data: BackupFile, expect: number): Promise<{ rev: number; updatedAt: string } | null>;
}

const readXp = (kv: KV): number => parseTraining(kv.get(TRAINING_KEY)).xp;
const xpText = (xp: number): string => JSON.stringify({ xp });

/** 계정에서 읽어 온 경험치(로그인했을 때) — 없으면 이 기기 것 */
let accountXp: number | null = null;
const listeners = new Set<() => void>();

export function onTrainingChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const notify = () => listeners.forEach((fn) => fn());

/** 지금 보일 수련(로그인했으면 계정 것, 아니면 이 기기 것 — 둘 중 큰 쪽) */
export function currentTraining(kv: KV = browserKV()): Level {
  return levelOf(Math.max(readXp(kv), accountXp ?? 0));
}

/** 로그아웃하면 이 기기 것만 */
export function forgetAccountTraining(): void {
  accountXp = null;
  notify();
}

/** 로그인했을 때 계정의 수련 경험치를 읽어 온다(「천외귀환」 행이 없으면 이 기기 것) */
export async function loadAccountTraining(row: CheonoeRow): Promise<void> {
  const r = await row.fetch();
  accountXp = r ? parseTraining(r.data.keys?.[TRAINING_KEY] ?? null).xp : null;
  notify();
}

/**
 * 경험치를 더한다. row: 로그인했으면 계정 행, 아니면 null. user: 로그인한 계정 id.
 * 돌려주는 값: 오르기 전·후 레벨
 */
export async function gainXp(amount: number, row: CheonoeRow | null, user: string | null, kv: KV = browserKV()): Promise<{ from: number; to: number }> {
  const from = currentTraining(kv).level;
  const add = Math.max(0, Math.floor(amount));
  if (!add) return { from, to: from };
  const local = () => kv.set(TRAINING_KEY, xpText(readXp(kv) + add));
  if (!row || !user) {
    local();
    notify();
    return { from, to: currentTraining(kv).level };
  }
  try {
    for (let tries = 0; tries < 3; tries++) {
      const r = await row.fetch();
      if (!r) {
        // 「천외귀환」을 아직 계정에 올린 적이 없다: 이 기기에만 — 「천외귀환」이 열릴 때 함께 올린다
        local();
        break;
      }
      // 이 기기 「천외귀환」 기록이 이 행과 맞춰져 있었나(그랬으면 함께 옮긴다)
      const meta = readMeta(kv);
      const inStep = !!meta && meta.user === user && meta.rev === r.rev && meta.hash === hashKeys(cloudKeys(kv));
      const xp = parseTraining(r.data.keys?.[TRAINING_KEY] ?? null).xp + add;
      const next: BackupFile = { ...r.data, keys: { ...r.data.keys, [TRAINING_KEY]: xpText(xp) } };
      const w = await row.update(next, r.rev);
      if (!w) continue;
      accountXp = xp;
      if (inStep) {
        kv.set(TRAINING_KEY, xpText(xp));
        writeMeta(kv, { user, rev: w.rev, hash: hashKeys(cloudKeys(kv)), at: w.updatedAt });
      }
      break;
    }
  } catch {
    // 서버에 닿지 않는다: 이 기기에 더해 두면 「천외귀환」이 다음에 열릴 때 올린다
    local();
  }
  notify();
  return { from, to: currentTraining(kv).level };
}

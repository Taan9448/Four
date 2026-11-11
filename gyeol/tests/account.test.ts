// 「결」 계정·수련 Lv.(2026-11-11): 로그인 규칙은 「천외귀환」과 같고(서버에 닿기 전에 막는다), 수련은 「천외귀환」과 같은 계정 수련을 함께 쓴다
import { beforeEach, describe, expect, it } from 'vitest';
import { accountState, chooseGuest, signOut } from '../src/account';
import { currentTraining, duelXp, gainXp, levelOf, TRAINING_KEY, type CheonoeRow } from '../src/training';
import type { BackupFile } from '../../src/ui/backup';
import { cloudKeys, hashKeys, readMeta, writeMeta } from '../../src/ui/cloud-sync';
import { signInWithId } from '../src/cloud';

describe('계정', () => {
  beforeEach(() => signOut());

  it('처음에는 로그인도 게스트도 고르지 않았다', () => {
    expect(accountState().kind).toBe('none');
  });

  it('아이디·비밀번호 규칙은 「천외귀환」과 같다(서버에 묻기 전에 막는다)', async () => {
    expect(await signInWithId('ab', 'secret1', 'login')).toMatchObject({ ok: false });
    expect(await signInWithId('haun', '123', 'login')).toMatchObject({ ok: false });
    expect(await signInWithId('haun', 'secret1', 'signup', 'secret2')).toEqual({ ok: false, message: '비밀번호 확인이 다르다' });
    expect(accountState().kind).toBe('none');
  });

  it('게스트와 로그아웃', async () => {
    chooseGuest();
    expect(accountState().kind).toBe('guest');
    await signOut();
    expect(accountState().kind).toBe('none');
  });
});

describe('수련 Lv.(「천외귀환」과 같은 계정 수련)', () => {
  const kv = () => {
    const map = new Map<string, string>();
    return { map, get: (k: string) => map.get(k) ?? null, set: (k: string, v: string | null) => (v === null ? map.delete(k) : map.set(k, v)), keys: () => [...map.keys()] };
  };

  it('「천외귀환」과 같은 표로 레벨을 셈한다', () => {
    expect(levelOf(0)).toMatchObject({ level: 1, into: 0, need: 100 });
    expect(levelOf(100)).toMatchObject({ level: 2, into: 0, need: 120 });
  });

  it('대결 경험치: 일반 · 정예(2단계) · 보스(3단계 이상)', () => {
    expect([duelXp(0), duelXp(1), duelXp(2), duelXp(3)]).toEqual([10, 25, 80, 80]);
  });

  it('로그인하지 않았으면 이 기기의 cheonoe.training에 더한다', async () => {
    const k = kv();
    k.set(TRAINING_KEY, JSON.stringify({ xp: 95 }));
    const r = await gainXp(10, null, null, k);
    expect(r).toEqual({ from: 1, to: 2 });
    expect(JSON.parse(k.get(TRAINING_KEY)!)).toEqual({ xp: 105 });
  });

  it('로그인했으면 계정 행(saves)도 rev가 같을 때만 고치고, 맞춰져 있던 이 기기 기록도 새 rev로 옮긴다', async () => {
    const k = kv();
    k.set(TRAINING_KEY, JSON.stringify({ xp: 50 }));
    k.set('cheonoe.profile', '{"clears":1}');
    let row = { data: { version: 1, exportedAt: '', keys: cloudKeys(k) } as BackupFile, rev: 7 };
    writeMeta(k, { user: 'u1', rev: 7, hash: hashKeys(cloudKeys(k)), at: '' });
    let conflictOnce = true;
    const store: CheonoeRow = {
      fetch: async () => structuredClone(row),
      update: async (data, expect) => {
        // 한 번은 다른 기기가 먼저 올린 것처럼
        if (conflictOnce) {
          conflictOnce = false;
          row = { ...row, rev: row.rev + 1 };
          return null;
        }
        if (expect !== row.rev) return null;
        row = { data: structuredClone(data), rev: expect + 1 };
        return { rev: row.rev, updatedAt: 'now' };
      },
    };
    await gainXp(25, store, 'u1', k);
    expect(JSON.parse(row.data.keys[TRAINING_KEY])).toEqual({ xp: 75 });
    expect(row.data.keys['cheonoe.profile']).toBe('{"clears":1}');
    expect(row.rev).toBe(9);
    // 다른 기기가 먼저 바꿨으므로(rev 8) 이 기기 「천외귀환」 기록은 건드리지 않는다 — 다음에 열 때 받는다
    expect(JSON.parse(k.get(TRAINING_KEY)!)).toEqual({ xp: 50 });
    expect(currentTraining(k).xp).toBe(75);
  });

  it('이 기기가 계정과 맞춰져 있으면 함께 옮겨, 「천외귀환」이 다음에 열릴 때 묻지 않는다', async () => {
    const k = kv();
    k.set(TRAINING_KEY, JSON.stringify({ xp: 10 }));
    let row = { data: { version: 1, exportedAt: '', keys: cloudKeys(k) } as BackupFile, rev: 3 };
    writeMeta(k, { user: 'u1', rev: 3, hash: hashKeys(cloudKeys(k)), at: '' });
    const store: CheonoeRow = {
      fetch: async () => structuredClone(row),
      update: async (data, expect) => (expect === row.rev ? ((row = { data: structuredClone(data), rev: expect + 1 }), { rev: row.rev, updatedAt: 'now' }) : null),
    };
    await gainXp(80, store, 'u1', k);
    expect(JSON.parse(k.get(TRAINING_KEY)!)).toEqual({ xp: 90 });
    const meta = readMeta(k)!;
    expect(meta.rev).toBe(4);
    expect(meta.hash).toBe(hashKeys(cloudKeys(k)));
    expect(meta.hash).toBe(hashKeys(cloudKeys(row.data.keys)));
  });
});

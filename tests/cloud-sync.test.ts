// 계정·클라우드 저장(2026-10-15): 게스트 기록·두 기기·충돌·오프라인. 서버는 메모리 행 하나(rev 낙관적 잠금)
import { describe, expect, it, vi } from 'vitest';
import { BACKUP_KEY, type BackupFile, type KV } from '../src/ui/backup';
import { CLOUD_META_KEY, CloudSync, cloudKeys, plan, readMeta, type CloudStore, type Remote, type SyncHooks } from '../src/ui/cloud-sync';

function memKV(init: Record<string, string> = {}): KV & { map: Map<string, string> } {
  const map = new Map(Object.entries(init));
  return { map, get: (k) => map.get(k) ?? null, set: (k, v) => (v === null ? map.delete(k) : map.set(k, v)), keys: () => [...map.keys()] };
}

/** 계정 행 하나를 가진 서버 */
function memServer() {
  let row: Remote | null = null;
  let t = 0;
  const calls = { fetch: 0, insert: 0, update: 0 };
  const stamp = () => new Date(Date.UTC(2026, 9, 15, 0, 0, ++t)).toISOString();
  const store: CloudStore = {
    async fetch() {
      calls.fetch++;
      return row && structuredClone(row);
    },
    async insert(data) {
      calls.insert++;
      if (row) return { ok: false };
      row = { data: structuredClone(data), rev: 1, updatedAt: stamp() };
      return { ok: true, rev: row.rev, updatedAt: row.updatedAt };
    },
    async update(data, expect) {
      calls.update++;
      if (!row || row.rev !== expect) return { ok: false };
      row = { data: structuredClone(data), rev: expect + 1, updatedAt: stamp() };
      return { ok: true, rev: row.rev, updatedAt: row.updatedAt };
    },
  };
  return { store, calls, row: () => row };
}

function hooks(choice: 'local' | 'remote' = 'local'): SyncHooks & { asked: number; reloads: number } {
  const h = {
    asked: 0,
    reloads: 0,
    ask: async () => (h.asked++, choice),
    reload: () => void h.reloads++,
  };
  return h;
}

const RUN_A = { 'cheonoe.run.1': '{"stage":"s3"}', 'cheonoe.codex': '{"cards":["a"]}' };
const RUN_B = { 'cheonoe.run.1': '{"stage":"s7"}', 'cheonoe.codex': '{"cards":["a","b"]}' };
const SETTINGS = { 'cheonoe.settings': '{"fontScale":1.12}' };

describe('계정·클라우드 저장 — 게스트 기록', () => {
  it('계정이 비어 있으면 게스트 기록을 그대로 올리고(설정은 빼고) 이 기기에 맞춘 판을 적는다', async () => {
    const kv = memKV({ ...RUN_A, ...SETTINGS });
    const srv = memServer();
    const h = hooks();
    await new CloudSync(kv, srv.store, 'u1', h).sync();
    expect(srv.row()!.data.keys).toEqual(RUN_A);
    expect(h.asked).toBe(0);
    expect(readMeta(kv)).toMatchObject({ user: 'u1', rev: 1 });
    // 게스트 기록은 그대로
    expect(kv.get('cheonoe.run.1')).toBe(RUN_A['cheonoe.run.1']);
  });

  it('이 기기가 비어 있으면 계정 기록을 받고 다시 연다(설정은 이 기기 것)', async () => {
    const srv = memServer();
    await new CloudSync(memKV(RUN_B), srv.store, 'u1', hooks()).sync();
    const kv = memKV({ ...SETTINGS, 'cheonoe.tours': '["battle-basics"]' });
    const h = hooks();
    await new CloudSync(kv, srv.store, 'u1', h).sync();
    expect(cloudKeys(kv)).toEqual(RUN_B);
    expect(kv.get('cheonoe.settings')).toBe(SETTINGS['cheonoe.settings']);
    expect(h.reloads).toBe(1);
    expect(h.asked).toBe(0);
  });

  it('게스트 기록과 계정 기록이 둘 다 있고 다르면 묻는다 — 이 기기 것을 고르면 계정을 덮고, 덮인 계정 기록은 되돌리기 한 벌로', async () => {
    const srv = memServer();
    await new CloudSync(memKV(RUN_B), srv.store, 'u1', hooks()).sync();
    const kv = memKV({ ...RUN_A, ...SETTINGS });
    const h = hooks('local');
    await new CloudSync(kv, srv.store, 'u1', h).sync();
    expect(h.asked).toBe(1);
    expect(srv.row()!.data.keys).toEqual(RUN_A);
    const undo = JSON.parse(kv.get(BACKUP_KEY)!) as BackupFile;
    expect(undo.keys['cheonoe.run.1']).toBe(RUN_B['cheonoe.run.1']);
    // 되돌려도 설정은 지금 것
    expect(undo.keys['cheonoe.settings']).toBe(SETTINGS['cheonoe.settings']);
  });

  it('계정 것을 고르면 이 기기에 받고, 게스트 기록은 되돌리기 한 벌로 남는다', async () => {
    const srv = memServer();
    await new CloudSync(memKV(RUN_B), srv.store, 'u1', hooks()).sync();
    const kv = memKV({ ...RUN_A });
    const h = hooks('remote');
    await new CloudSync(kv, srv.store, 'u1', h).sync();
    expect(cloudKeys(kv)).toEqual(RUN_B);
    expect((JSON.parse(kv.get(BACKUP_KEY)!) as BackupFile).keys['cheonoe.run.1']).toBe(RUN_A['cheonoe.run.1']);
    expect(srv.row()!.data.keys).toEqual(RUN_B);
    expect(h.reloads).toBe(1);
  });

  it('같은 기록이면 묻지도 받지도 않고 맞춘 판만 적는다', async () => {
    const srv = memServer();
    await new CloudSync(memKV(RUN_A), srv.store, 'u1', hooks()).sync();
    const kv = memKV({ ...RUN_A });
    const h = hooks();
    await new CloudSync(kv, srv.store, 'u1', h).sync();
    expect(h.asked + h.reloads).toBe(0);
    expect(readMeta(kv)?.rev).toBe(1);
  });

  it('다른 계정에서 로그아웃한 기록을 새 계정(빈 계정)에 올리기 전에는 묻는다', async () => {
    const kv = memKV({ ...RUN_A });
    await new CloudSync(kv, memServer().store, 'u1', hooks()).sync();
    const srv2 = memServer();
    const h = hooks('remote');
    await new CloudSync(kv, srv2.store, 'u2', h).sync();
    expect(h.asked).toBe(1);
    // 빈 계정으로 시작을 골랐다: 이 기기는 비고, 기록은 되돌리기 한 벌로
    expect(cloudKeys(kv)).toEqual({});
    expect((JSON.parse(kv.get(BACKUP_KEY)!) as BackupFile).keys['cheonoe.run.1']).toBe(RUN_A['cheonoe.run.1']);
    expect(srv2.row()).toBeNull();
    expect(kv.get(CLOUD_META_KEY)).toBeNull();
  });
});

describe('계정·클라우드 저장 — 두 기기', () => {
  it('PC에서 진행하고 휴대폰(그사이 바뀐 것 없음)을 열면 휴대폰이 계정 기록을 받는다', async () => {
    const srv = memServer();
    const pc = memKV({ ...RUN_A });
    const phone = memKV();
    const pcSync = new CloudSync(pc, srv.store, 'u1', hooks());
    await pcSync.sync();
    await new CloudSync(phone, srv.store, 'u1', hooks()).sync();
    expect(cloudKeys(phone)).toEqual(RUN_A);
    // PC에서 더 진행
    pc.set('cheonoe.run.1', RUN_B['cheonoe.run.1']);
    await pcSync.push();
    expect(srv.row()!.rev).toBe(2);
    const h = hooks();
    await new CloudSync(phone, srv.store, 'u1', h).sync();
    expect(phone.get('cheonoe.run.1')).toBe(RUN_B['cheonoe.run.1']);
    expect(h.asked).toBe(0);
    expect(h.reloads).toBe(1);
  });

  it('두 기기에서 따로 진행했으면 늦게 올리는 쪽이 덮어쓰지 않고 묻는다(낙관적 잠금)', async () => {
    const srv = memServer();
    const pc = memKV({ ...RUN_A });
    const phone = memKV();
    const pcSync = new CloudSync(pc, srv.store, 'u1', hooks());
    await pcSync.sync();
    const phoneHooks = hooks('remote');
    const phoneSync = new CloudSync(phone, srv.store, 'u1', phoneHooks);
    await phoneSync.sync();
    pc.set('cheonoe.run.1', '{"stage":"pc"}');
    phone.set('cheonoe.run.1', '{"stage":"phone"}');
    await pcSync.push();
    await phoneSync.push();
    expect(phoneHooks.asked).toBe(1);
    // 휴대폰은 계정(PC) 것을 골랐다 — PC 진행이 살아 있다
    expect(srv.row()!.data.keys['cheonoe.run.1']).toBe('{"stage":"pc"}');
    expect(phone.get('cheonoe.run.1')).toBe('{"stage":"pc"}');
  });

  it('바뀐 것이 없으면 올리지 않는다(설정만 바뀌어도)', async () => {
    const srv = memServer();
    const kv = memKV({ ...RUN_A });
    const s = new CloudSync(kv, srv.store, 'u1', hooks());
    await s.sync();
    kv.set('cheonoe.settings', '{"speed":0.5}');
    await s.push();
    expect(srv.calls.update).toBe(0);
  });

  it('오프라인이면 조용히 offline 상태만 알리고 기록은 그대로 둔다. 다시 연결되면 올린다', async () => {
    const srv = memServer();
    const statuses: string[] = [];
    const kv = memKV({ ...RUN_A });
    const flaky: CloudStore = { ...srv.store, fetch: vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockImplementation(srv.store.fetch) };
    const s = new CloudSync(kv, flaky, 'u1', { ...hooks(), status: (x) => statuses.push(x.state) });
    await expect(s.sync()).resolves.toBeUndefined();
    expect(statuses.at(-1)).toBe('offline');
    expect(cloudKeys(kv)).toEqual(RUN_A);
    await s.push();
    expect(srv.row()!.data.keys).toEqual(RUN_A);
    expect(statuses.at(-1)).toBe('synced');
  });

  it('plan: 기록 없는 기기·빈 계정이면 할 일이 없다(안내 본 기록만으로는 올리지 않는다)', () => {
    expect(plan(memKV({ 'cheonoe.tours': '[]', ...SETTINGS }), 'u1', null)).toBe('none');
  });
});

describe('저장이 바뀌면 알린다(모아서 올리기)', () => {
  it('writeStore는 저장 키가 바뀔 때 알리고, 설정(기기마다)은 알리지 않는다', async () => {
    const { onStoreWrite, writeStore } = await import('../src/ui/storage');
    const seen: string[] = [];
    onStoreWrite((k) => seen.push(k));
    writeStore('cheonoe.run.1', 'x');
    writeStore('cheonoe.settings', '{}');
    writeStore('cheonoe.codex', 'y');
    expect(seen).toEqual(['cheonoe.run.1', 'cheonoe.codex']);
  });
});

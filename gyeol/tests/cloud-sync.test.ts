// 「결」 계정 저장(2026-11-11, 7-6절): 게스트 기록·두 기기·충돌·설정은 기기마다. 서버는 메모리 행 하나(rev 낙관적 잠금)
import { describe, expect, it } from 'vitest';
import { BACKUP_KEY, GyeolSync, META_KEY, cloudData, hashData, plan, readMeta, type CloudData, type GyeolStore, type KV, type Remote, type SyncHooks } from '../src/cloud-sync';
import { emptySave, KEY, type SaveData } from '../src/save';

function memKV(save?: SaveData): KV & { map: Map<string, string> } {
  const map = new Map<string, string>();
  if (save) map.set(KEY, JSON.stringify(save));
  return { map, get: (k) => map.get(k) ?? null, set: (k, v) => (v === null ? map.delete(k) : map.set(k, v)) };
}

function memServer() {
  let row: Remote | null = null;
  let t = 0;
  const calls = { fetch: 0, insert: 0, update: 0 };
  const stamp = () => new Date(Date.UTC(2026, 10, 11, 0, 0, ++t)).toISOString();
  const store: GyeolStore = {
    async fetch() {
      calls.fetch++;
      return row && structuredClone(row);
    },
    async insert(data, device) {
      calls.insert++;
      if (row) return { ok: false };
      row = { data: structuredClone(data), rev: 1, updatedAt: stamp(), device };
      return { ok: true, rev: 1, updatedAt: row.updatedAt };
    },
    async update(data, expect, device) {
      calls.update++;
      if (!row || row.rev !== expect) return { ok: false };
      row = { data: structuredClone(data), rev: expect + 1, updatedAt: stamp(), device };
      return { ok: true, rev: row.rev, updatedAt: row.updatedAt };
    },
  };
  return { store, calls, row: () => row };
}

function hooks(choice: 'local' | 'remote' | null = 'local'): SyncHooks & { asked: number; reloads: number } {
  const h = {
    asked: 0,
    reloads: 0,
    async ask() {
      h.asked++;
      return choice;
    },
    reload() {
      h.reloads++;
    },
  };
  return h;
}

/** 진행이 있는 기록 */
function played(wins: number, settings?: Partial<SaveData['settings']>): SaveData {
  const s = emptySave();
  s.stats.duels = wins + 1;
  s.stats.wins = wins;
  s.story.cleared = ['prologue'];
  s.settings = { ...s.settings, ...settings };
  return s;
}

const local = (kv: KV): SaveData => JSON.parse(kv.get(KEY)!) as SaveData;

describe('「결」 계정 저장', () => {
  it('설정(소리·판정 보정·품질)은 올리지 않는다', () => {
    const a = played(3, { inputOffset: 40, quality: 'low' });
    const b = played(3);
    expect('settings' in cloudData(a)).toBe(false);
    expect(hashData(cloudData(a))).toBe(hashData(cloudData(b)));
  });

  it('지문은 키 순서와 상관없다', () => {
    const a = played(1);
    a.duelBest = { x: 'S', y: 'A' };
    const b = played(1);
    b.duelBest = { y: 'A', x: 'S' };
    expect(hashData(cloudData(a))).toBe(hashData(cloudData(b)));
  });

  it('빈 기기 + 빈 계정 = 할 일 없음, 안내만 본 기록도 빈 것으로 본다', () => {
    const s = emptySave();
    s.tips = ['clash'];
    expect(plan(memKV(s), 'u1', null)).toBe('none');
  });

  it('게스트 기록이 있고 계정이 비었으면 올린다', async () => {
    const kv = memKV(played(2));
    const srv = memServer();
    const h = hooks();
    await new GyeolSync(kv, srv.store, 'u1', h, 'PC').sync();
    expect(srv.calls.insert).toBe(1);
    expect(srv.row()!.data.stats.wins).toBe(2);
    expect(srv.row()!.device).toBe('PC');
    expect(readMeta(kv)).toMatchObject({ user: 'u1', rev: 1 });
    expect(h.asked).toBe(0);
  });

  it('빈 기기에 계정 기록이 있으면 받고, 이 기기 설정은 그대로 둔다', async () => {
    const srv = memServer();
    await new GyeolSync(memKV(played(5)), srv.store, 'u1', hooks()).sync();
    const kv = memKV({ ...emptySave(), settings: { ...emptySave().settings, inputOffset: 30 } });
    const h = hooks();
    await new GyeolSync(kv, srv.store, 'u1', h).sync();
    expect(h.reloads).toBe(1);
    expect(local(kv).stats.wins).toBe(5);
    expect(local(kv).settings.inputOffset).toBe(30);
    expect(kv.get(BACKUP_KEY)).not.toBeNull();
  });

  it('바뀐 것만 올리고(rev가 오른다), 같으면 올리지 않는다', async () => {
    const kv = memKV(played(1));
    const srv = memServer();
    const s = new GyeolSync(kv, srv.store, 'u1', hooks());
    await s.sync();
    await s.push();
    expect(srv.calls.update).toBe(0);
    kv.set(KEY, JSON.stringify(played(2)));
    await s.push();
    expect(srv.calls.update).toBe(1);
    expect(srv.row()!.rev).toBe(2);
    // 설정만 바뀌면 올리지 않는다
    kv.set(KEY, JSON.stringify(played(2, { master: 0.1 })));
    await s.push();
    expect(srv.calls.update).toBe(1);
  });

  it('두 기기가 모두 바꿨으면 묻는다 — 계정 것을 고르면 받는다', async () => {
    const srv = memServer();
    const pc = memKV(played(1));
    const a = new GyeolSync(pc, srv.store, 'u1', hooks());
    await a.sync();
    const phone = memKV();
    await new GyeolSync(phone, srv.store, 'u1', hooks()).sync();
    phone.set(KEY, JSON.stringify(played(7)));
    await new GyeolSync(phone, srv.store, 'u1', hooks()).push();
    pc.set(KEY, JSON.stringify(played(3)));
    const h = hooks('remote');
    await new GyeolSync(pc, srv.store, 'u1', h).push();
    expect(h.asked).toBe(1);
    expect(local(pc).stats.wins).toBe(7);
  });

  it('묻는 창을 닫으면 멈추고, 저절로 올리지 않는다', async () => {
    const srv = memServer();
    await new GyeolSync(memKV(played(4)), srv.store, 'u1', hooks()).sync();
    const kv = memKV(played(9));
    const h = hooks(null);
    const s = new GyeolSync(kv, srv.store, 'u1', h);
    await s.sync();
    await s.push();
    expect(h.asked).toBe(1);
    expect(srv.row()!.data.stats.wins).toBe(4);
  });

  it('다른 계정의 기록이 남은 기기에서 빈 계정으로 처음부터: 진행은 비우고 설정·되돌리기 한 벌은 남긴다', async () => {
    const kv = memKV(played(3, { sfx: 0.2 }));
    kv.set(META_KEY, JSON.stringify({ user: 'old', rev: 4, hash: 'x', at: '' }));
    const h = hooks('remote');
    await new GyeolSync(kv, memServer().store, 'u2', h).sync();
    expect(h.asked).toBe(1);
    expect(h.reloads).toBe(1);
    expect(local(kv).stats.wins).toBe(0);
    expect(local(kv).settings.sfx).toBe(0.2);
    expect((JSON.parse(kv.get(BACKUP_KEY)!) as SaveData).stats.wins).toBe(3);
  });

  it('서버에 닿지 않으면 오프라인으로 알린다', async () => {
    const states: string[] = [];
    const store: GyeolStore = {
      fetch: () => Promise.reject(new TypeError('Failed to fetch')),
      insert: () => Promise.reject(new TypeError('x')),
      update: () => Promise.reject(new TypeError('x')),
    };
    await new GyeolSync(memKV(played(1)), store, 'u1', { ...hooks(), status: (s) => states.push(s.state) }).sync();
    expect(states.at(-1)).toBe('offline');
  });

  it('계정 행의 빠진 칸은 기본값으로 채운다(옛 판 기록)', () => {
    const kv = memKV(played(1));
    const old = cloudData(played(1)) as Partial<CloudData>;
    delete old.achievements;
    expect(plan(kv, 'u1', { data: old as CloudData, rev: 1, updatedAt: '' })).toBe('adopt');
  });
});

import { describe, expect, it } from 'vitest';
import { applyBackup, BACKUP_KEY, backupFileName, exportBackup, hasUndo, parseBackup, previewBackup, undoImport, type KV } from '../src/ui/backup';
import { createRun } from '../src/engine/run';
import { serializeRun, SAVE_VERSION } from '../src/engine/save';
import { data } from './helpers';

function memKV(init: Record<string, string> = {}): KV & { map: Map<string, string> } {
  const map = new Map(Object.entries(init));
  return { map, get: (k) => map.get(k) ?? null, set: (k, v) => (v === null ? map.delete(k) : map.set(k, v)), keys: () => [...map.keys()] };
}

const run = createRun(data, 'BACKUP1');
const save = () =>
  memKV({
    'cheonoe.run.1': serializeRun(run, 1_700_000_000_000),
    'cheonoe.lastSlot': '1',
    'cheonoe.settings': '{"speed":0.6}',
    'cheonoe.codex': JSON.stringify({ scenes: [], cards: {} }),
    'cheonoe.tours': '["battle-basics"]',
    'other.app': 'x',
  });

describe('저장 백업·복원(B1)', () => {
  it('내보내기 → 가져오기 왕복이 같다(다른 앱의 키는 건드리지 않는다)', () => {
    const a = save();
    const file = exportBackup(a, new Date(2026, 9, 12, 9, 5));
    expect(file.version).toBe(SAVE_VERSION);
    expect(Object.keys(file.keys)).not.toContain('other.app');
    const parsed = parseBackup(JSON.stringify(file));
    expect(parsed.ok).toBe(true);
    const b = memKV({ 'cheonoe.run.2': 'old', 'other.app': 'y' });
    applyBackup(b, parsed.ok ? parsed.file : file);
    const back = exportBackup(b);
    expect(back.keys).toEqual(file.keys);
    expect(b.map.get('other.app')).toBe('y');
    expect(b.map.has('cheonoe.run.2')).toBe(false);
    expect(backupFileName(new Date(2026, 9, 12, 9, 5))).toBe('cheonoe-save-20261012-0905.json');
  });

  it('손상된 JSON·형식이 틀린 파일은 이유와 함께 거부한다', () => {
    const bad = parseBackup('{"version": 4, "keys": ');
    expect(bad.ok).toBe(false);
    expect(!bad.ok && bad.reason).toContain('손상');
    expect(parseBackup('{"hello": 1}').ok).toBe(false);
    expect(parseBackup(JSON.stringify({ version: 4, keys: { 'cheonoe.run.1': 5 } })).ok).toBe(false);
  });

  it('지금보다 높은 버전은 거부하고, 낮은 버전 런은 이행해서 읽는다', () => {
    const high = parseBackup(JSON.stringify({ version: SAVE_VERSION + 1, exportedAt: '', keys: { 'cheonoe.lastSlot': '1' } }));
    expect(high.ok).toBe(false);
    expect(!high.ok && high.reason).toContain('더 새 버전');
    const file = exportBackup(save());
    const p = previewBackup(data, { ...file, version: 3 });
    expect(p.slots[0].stage).toBeTruthy();
    expect(p.slots[0].savedAt).toBe(1_700_000_000_000);
    expect(p.slots[1].stage).toBeNull();
    expect(p.codex.total).toBeGreaterThan(0);
  });

  it('가져오기 전 상태를 한 벌 남기고, 되돌리기로 되살린다', () => {
    const kv = save();
    const before = exportBackup(kv).keys;
    applyBackup(kv, { version: SAVE_VERSION, exportedAt: '', keys: { 'cheonoe.settings': '{"speed":1}' } });
    expect(hasUndo(kv)).toBe(true);
    expect(kv.map.has('cheonoe.run.1')).toBe(false);
    expect(undoImport(kv)).toBe(true);
    expect(exportBackup(kv).keys).toEqual(before);
    expect(kv.map.has(BACKUP_KEY)).toBe(false);
  });
});

describe('장면 편의(B3)', () => {
  it('처음 보는 장면은 어떤 설정에서도 건너뛰지 않는다', async () => {
    const { sceneSkip, autoAdvanceDelay } = await import('../src/engine/scene');
    for (const mode of ['campaign', 'pilgrimage', 'abyss'] as const)
      for (const setting of [true, false]) expect(sceneSkip({ seen: false, setting, mode, clears: 3 })).toEqual({ button: false, auto: false });
    // 캠페인 1회차는 단추만, 순례·다회차는 설정이 켜져 있으면 자동
    expect(sceneSkip({ seen: true, setting: true, mode: 'campaign', clears: 0 })).toEqual({ button: true, auto: false });
    expect(sceneSkip({ seen: true, setting: true, mode: 'pilgrimage', clears: 0 })).toEqual({ button: true, auto: true });
    expect(sceneSkip({ seen: true, setting: false, mode: 'pilgrimage', clears: 1 })).toEqual({ button: true, auto: false });
    expect(autoAdvanceDelay('짧다')).toBe(1200);
    expect(autoAdvanceDelay('가'.repeat(30))).toBe(30 * 40 + 600);
  });

  it('건너뛴(이미 본) 장면을 다시 기록해도 도감은 그대로다', async () => {
    const { emptyCodex, noteScene } = await import('../src/engine/codex');
    const id = [...data.scenes.keys()][0];
    const c = noteScene(data, emptyCodex(), id);
    const before = JSON.stringify(c);
    noteScene(data, c, id);
    expect(JSON.stringify(c)).toBe(before);
  });
});

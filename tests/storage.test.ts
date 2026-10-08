import { beforeEach, describe, expect, it } from 'vitest';
import { createRun } from '../src/engine/run';
import { serializeRun } from '../src/engine/save';
import { clearRun, lastSlot, listSlots, loadRun, saveRun, SLOT_COUNT } from '../src/ui/storage';
import { data } from './helpers';

// 브라우저 localStorage 대신 메모리 저장소
const mem = new Map<string, string>();
beforeEach(() => {
  mem.clear();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  };
});

describe('저장 칸', () => {
  it(`${SLOT_COUNT}칸에 따로 저장하고, 마지막으로 저장한 칸을 이어하기로 고른다`, () => {
    saveRun(1, createRun(data, 'A'));
    saveRun(3, createRun(data, 'C'));
    expect(listSlots(data).map((x) => x.saved?.run.seed ?? null)).toEqual(['A', null, 'C']);
    expect(lastSlot(data)?.slot).toBe(3);
    clearRun(3);
    expect(loadRun(data, 3)).toBeNull();
    expect(lastSlot(data)?.slot).toBe(1);
  });

  it('옛 단일 저장(cheonoe.run)은 1번 칸으로 옮긴다', () => {
    mem.set('cheonoe.run', serializeRun(createRun(data, 'OLD')));
    expect(loadRun(data, 1)?.run.seed).toBe('OLD');
    expect(mem.has('cheonoe.run')).toBe(false);
  });
});

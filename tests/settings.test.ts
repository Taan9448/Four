import { describe, expect, it } from 'vitest';
import { settings, SETTINGS_TABS } from '../src/ui/settings';

describe('설정 탭(2026-10-13)', () => {
  it('설정 값마다 정확히 한 탭에 들어 있다 — 새 설정을 추가하면 탭도 정해야 한다', () => {
    const keys = SETTINGS_TABS.flatMap((t) => t.keys);
    expect(new Set(keys).size).toBe(keys.length);
    expect([...keys].sort()).toEqual(Object.keys(settings).sort());
  });

  it('탭은 여섯 개(소리·전투·화면·장면·도움말·저장)이고 이름이 겹치지 않는다', () => {
    expect(SETTINGS_TABS.map((t) => t.id)).toEqual(['sound', 'battle', 'view', 'scene', 'help', 'save']);
    expect(new Set(SETTINGS_TABS.map((t) => t.seal)).size).toBe(6);
  });
});

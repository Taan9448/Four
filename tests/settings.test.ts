import { describe, expect, it } from 'vitest';
import { settings, SETTINGS_TABS } from '../src/ui/settings';
import { surgeChips } from '../src/ui/surge-cut';
import { data } from './helpers';

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

describe('폭주 그림(2026-10-13)', () => {
  it('설정 「폭주 그림」은 기본 켬이고 전투 탭에 있다', () => {
    expect(settings.surgeArt).toBe(true);
    expect(SETTINGS_TABS.find((t) => t.id === 'battle')!.keys).toContain('surgeArt');
  });

  it('그림 위 네 가지 칩은 balance.rift 값을 쓰고, 같은 전투 n번째 폭주면 체력 손실이 ×n', () => {
    const b = data.balance.rift;
    const one = surgeChips(data, 1);
    expect(one.map(([g]) => g)).toEqual(['血', '力', '響', '裂']);
    expect(one[0][1]).toBe(`체력 −${Math.round(b.surgeRatio * 100)}%`);
    expect(one[3][1]).toBe(`상흔 +${b.surgeScar}`);
    expect(surgeChips(data, 2)[0][1]).toBe(`체력 −${Math.round(b.surgeRatio * 100) * 2}%`);
  });
});

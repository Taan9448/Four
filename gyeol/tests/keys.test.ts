import { describe, expect, it } from 'vitest';
import { actionFor, bindKey, defaultKeys, keyLabel, keyNames, keyText, normalizeKeys } from '../src/keys';
import { normalize } from '../src/save';

describe('키 바꾸기(2026-11-13)', () => {
  it('기본 키: J 베기 · H 강베기 · K·Space 받기 · L·Shift 피하기 · I 기술 · U 집중 · P 멈춤', () => {
    const m = defaultKeys();
    expect(actionFor(m, 'KeyJ')).toBe('attack');
    expect(actionFor(m, 'KeyH')).toBe('heavy');
    expect(actionFor(m, 'KeyK')).toBe('parry');
    expect(actionFor(m, 'Space')).toBe('parry');
    expect(actionFor(m, 'KeyL')).toBe('dodge');
    // 오른쪽 Shift도 같은 Shift
    expect(actionFor(m, 'ShiftRight')).toBe('dodge');
    expect(actionFor(m, 'KeyI')).toBe('tech');
    expect(actionFor(m, 'KeyU')).toBe('focus');
    expect(actionFor(m, 'KeyP')).toBe('pause');
    expect(actionFor(m, 'KeyQ')).toBeNull();
  });

  it('키를 바꾸면 다른 동작이 쓰던 같은 키는 빠진다', () => {
    const m = bindKey(defaultKeys(), 'attack', 0, 'KeyK');
    expect(actionFor(m, 'KeyK')).toBe('attack');
    expect(m.parry).toEqual(['', 'Space']);
    expect(actionFor(m, 'KeyJ')).toBeNull();
    // 오른쪽 Shift를 베기에 주면 피하기의 왼쪽 Shift도 빠진다(같은 키로 본다)
    const n = bindKey(defaultKeys(), 'attack', 1, 'ShiftRight');
    expect(n.dodge).toEqual(['KeyL', '']);
    expect(actionFor(n, 'ShiftLeft')).toBe('attack');
  });

  it('Esc·Tab·Enter는 바꿀 수 없다', () => {
    const m = bindKey(defaultKeys(), 'attack', 0, 'Escape');
    expect(m.attack).toEqual(['KeyJ', '']);
  });

  it('저장된 값이 겹치거나 잘못되면 고쳐 읽는다', () => {
    const m = normalizeKeys({ attack: ['KeyK', 'Escape'], parry: ['KeyK', ''], dodge: 'x' });
    expect(m.attack).toEqual(['KeyK', '']);
    // 받기는 K를 빼앗겨 빈 칸뿐이라 기본값에서 남는 키(Space)를 받는다
    expect(m.parry).toEqual(['', 'Space']);
    expect(m.dodge).toEqual(['KeyL', 'ShiftLeft']);
    expect(normalize({ settings: {} }).settings.keys).toEqual(defaultKeys());
    expect(normalize({ settings: { keys: { heavy: ['KeyF', ''] } } }).settings.keys.heavy).toEqual(['KeyF', '']);
  });

  it('키 이름과 안내 글의 자리표', () => {
    expect(keyLabel('KeyJ')).toBe('J');
    expect(keyLabel('Digit3')).toBe('3');
    expect(keyLabel('ShiftLeft')).toBe('Shift');
    expect(keyLabel('ArrowLeft')).toBe('←');
    expect(keyNames(defaultKeys(), 'parry')).toEqual(['K', 'Space']);
    const m = bindKey(defaultKeys(), 'parry', 0, 'KeyF');
    expect(keyText(m, '고리가 금빛일 때 {parry}. {attack}·{parry} 연타')).toBe('고리가 금빛일 때 F. J·F 연타');
  });

  it('안내 글에 키 글자를 박아 두지 않는다(자리표만)', async () => {
    const story = (await import('../data/story.json')).default as { tips: Record<string, { key: string; text: string }> };
    for (const t of Object.values(story.tips)) {
      expect(t.key, t.key).not.toMatch(/(^|[^A-Za-z{])[JKHLIU]([^A-Za-z}]|$)/);
      expect(t.text, t.text).not.toMatch(/(^|[^A-Za-z{])[JKHLIU]([(를을·로]|$)/);
    }
  });
});

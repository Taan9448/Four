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

describe('먹·한지 UI 그림 명세(2026-11-13)', () => {
  it('먹 아이콘 칸 수가 명세와 같고, 먹 붓 그림은 6칸', async () => {
    const { INK_ICON } = await import('../src/dom');
    const { loadSpec } = await import('../../tools/lib/specs.mjs');
    const icons = loadSpec('icons_gyeol_ink');
    expect(icons.frames).toBe(Object.keys(INK_ICON).length);
    expect(Math.max(...Object.values(INK_ICON))).toBe(icons.frames);
    expect(loadSpec('ui_gyeol_ink').frames).toBe(6);
  });
});

describe('매끄러운 이야기(2026-11-13)', () => {
  type Line = { speaker?: string; text: string; now?: boolean; kind?: string; art?: string };
  type Ch = { id: string; intro: Line[]; outro: Line[]; bouts?: { foe: string; survive?: number; intro?: Line[]; outro?: Line[] }[] };
  it('장마다 운곡루의 지금과 회상이 함께 있고, 규칙 쪽지는 화자 없이 대결 앞에만', async () => {
    const story = (await import('../data/story.json')).default as unknown as { chapters: Ch[] };
    for (const ch of story.chapters) {
      const all = [...ch.intro, ...ch.outro, ...(ch.bouts ?? []).flatMap((b) => [...(b.intro ?? []), ...(b.outro ?? [])])];
      if (ch.id !== 'epilogue') expect(all.some((l) => l.now), `${ch.id} 지금`).toBe(true);
      expect(all.some((l) => !l.now && l.kind !== 'rule'), `${ch.id} 회상`).toBe(true);
      for (const l of all) {
        if (l.kind === 'rule') expect(l.speaker, l.text).toBeUndefined();
        // 옛 방식의 괄호·화살표 안내가 대사로 남지 않는다
        expect(l.text.startsWith('(') || l.text.startsWith('▶'), l.text).toBe(false);
      }
      for (const b of ch.bouts ?? []) for (const l of b.outro ?? []) expect(l.kind, `${ch.id} ${b.foe} 끝 장면에 규칙 쪽지`).not.toBe('rule');
    }
  });
  it('10장은 돌내마을 → 틈 안 순서, 새 상대가 이야기에 들어 있다', async () => {
    const story = (await import('../data/story.json')).default as unknown as { chapters: Ch[] };
    const foes = (id: string) => story.chapters.find((c) => c.id === id)!.bouts!.map((b) => b.foe);
    expect(foes('ch10')).toEqual(['rift_beast', 'rift_phantom', 'bone_giant', 'mordecai']);
    expect(foes('ch6')[0]).toBe('ash_wraith');
    expect(story.chapters.find((c) => c.id === 'ch6')!.bouts![0].survive).toBe(6);
    expect(foes('ch8')[0]).toBe('wudang_warden');
  });
});

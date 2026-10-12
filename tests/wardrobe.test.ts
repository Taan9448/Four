import { describe, expect, it } from 'vitest';
import { spritesFor } from '../src/engine/state';
import { battleSkins, emptyWardrobe, equipSkin, parseWardrobe, skinSpriteId, unlockSkins } from '../src/engine/wardrobe';
import { data } from './helpers';

describe('옷장(2026-10-12)', () => {
  it('캠페인·어려움·하드코어·심연·순례가 세트를 하나씩 연다', () => {
    const w = emptyWardrobe();
    expect(unlockSkins(data, w, { kind: 'campaignClear', difficulty: 'normal', hardcore: false })).toEqual(['cheongun']);
    expect(unlockSkins(data, w, { kind: 'campaignClear', difficulty: 'hard', hardcore: false })).toEqual(['cheonma']);
    expect(unlockSkins(data, w, { kind: 'campaignClear', difficulty: 'normal', hardcore: true })).toEqual(['bulmyeol']);
    expect(unlockSkins(data, w, { kind: 'abyssDepth', depth: 4 })).toEqual([]);
    expect(unlockSkins(data, w, { kind: 'abyssDepth', depth: 5 })).toEqual(['simyeon']);
    expect(unlockSkins(data, w, { kind: 'pilgrimStage', stage: 's8' })).toEqual([]);
    expect(unlockSkins(data, w, { kind: 'pilgrimStage', stage: 's9' })).toEqual(['sullye']);
    expect(unlockSkins(data, w, { kind: 'campaignClear', difficulty: 'hard', hardcore: true })).toEqual([]);
  });

  it('어려움으로 처음 마치면 보통 세트도 함께 연다', () => {
    const w = emptyWardrobe();
    expect(unlockSkins(data, w, { kind: 'campaignClear', difficulty: 'hard', hardcore: false }).sort()).toEqual(['cheongun', 'cheonma'].sort());
  });

  it('연 세트만 입고, 순례·심연 런에서만 전투에 입는다', () => {
    const w = emptyWardrobe();
    equipSkin(data, w, 'haun', 'cheongun');
    expect(w.equipped.haun).toBeUndefined();
    unlockSkins(data, w, { kind: 'campaignClear', difficulty: 'normal', hardcore: false });
    equipSkin(data, w, 'haun', 'cheongun');
    expect(battleSkins(data, w, {})).toEqual({});
    expect(battleSkins(data, w, { replayOf: {} })).toEqual({ haun: 'cheongun' });
    expect(battleSkins(data, w, { abyss: {} })).toEqual({ haun: 'cheongun' });
    // 깨진 기록·없는 세트는 버린다(처음부터 열린 은빛 기사검은 늘 있다)
    expect(parseWardrobe(data, '{"unlocked":["cheongun","nope"],"equipped":{"haun":"cheongun","elia":"cheonma"}}')).toEqual({ unlocked: ['cheongun', 'silver_sword'], equipped: { haun: 'cheongun' } });
    expect(parseWardrobe(data, 'not json')).toEqual({ unlocked: ['silver_sword'], equipped: {} });
  });

  it('은빛 기사검: 처음부터 열려 있고, 카일만 입으며, 캠페인에서도 입고, 그림은 옛 기본 그림(kyle_*)이다', () => {
    const w = parseWardrobe(data, null);
    expect(w.unlocked).toContain('silver_sword');
    equipSkin(data, w, 'haun', 'silver_sword');
    expect(w.equipped.haun).toBeUndefined();
    equipSkin(data, w, 'kyle', 'silver_sword');
    expect(battleSkins(data, w, {})).toEqual({ kyle: 'silver_sword' });
    expect(skinSpriteId(data, 'silver_sword', 'kyle', 'attack')).toBe('kyle_attack');
    expect(skinSpriteId(data, 'cheongun', 'kyle', 'attack')).toBe('skin_cheongun_kyle_attack');
  });

  it('카일 기본 전투 그림은 붉은 검(늘 입는 복장), 그림이 오기 전에는 화면이 은빛 검 그림을 쓴다', () => {
    const kyle = data.characters.get('kyle')!;
    expect(spritesFor(kyle, []).attack).toBe('kyle_red_attack');
    expect(kyle.sprites.attack).toBe('kyle_attack');
  });

  it('세트마다 네 동료의 그림 명세(기준·대기·공격·피격)가 있다', async () => {
    const { readdirSync } = await import('node:fs');
    const specs = new Set(readdirSync('specs/assets').map((f) => f.replace(/\.yaml$/, '')));
    const missing = data.skins.sets
      .filter((s) => !s.sprites)
      .flatMap((s) => data.skins.characters.flatMap((c) => ['ref', 'idle', 'attack', 'hit'].map((a) => `skin_${s.id}_${c}_${a}`)))
      .filter((id) => !specs.has(id));
    expect(missing).toEqual([]);
  });
});

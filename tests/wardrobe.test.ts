import { describe, expect, it } from 'vitest';
import { spritesFor } from '../src/engine/state';
import { battleSkins, emptyWardrobe, equipSkin, parseWardrobe, skinSpriteId, skinStandId, unlockSkins, unlockText } from '../src/engine/wardrobe';
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

  it('세트마다 입는 동료의 그림 명세(기준·대기·공격·피격, 반신 그림 세트는 반신도)가 있다', async () => {
    const { readdirSync } = await import('node:fs');
    const specs = new Set(readdirSync('specs/assets').map((f) => f.replace(/\.yaml$/, '')));
    const missing = data.skins.sets
      .filter((s) => !s.sprites)
      .flatMap((s) =>
        (s.characters ?? data.skins.characters).flatMap((c) => ['ref', 'idle', 'attack', 'hit', ...(s.portrait ? ['stand'] : [])].map((a) => `skin_${s.id}_${c}_${a}`)),
      )
      .filter((id) => !specs.has(id));
    expect(missing).toEqual([]);
  });

  it('반신 그림 세트(엘리아 달빛 무희·여름 호숫가)를 입으면 반신 그림 id가 그 옷으로, 아니면 없다', () => {
    expect(skinStandId(data, 'elia', { elia: 'moon_dancer' })).toBe('skin_moon_dancer_elia_stand');
    expect(skinStandId(data, 'elia', { elia: 'summer_lake' })).toBe('skin_summer_lake_elia_stand');
    expect(skinStandId(data, 'elia', { elia: 'cheongun' })).toBeUndefined(); // 반신 그림이 없는 세트
    expect(skinStandId(data, 'elia', {})).toBeUndefined();
    expect(skinStandId(data, 'kyle', { kyle: 'moon_dancer' })).toBeUndefined(); // 엘리아만의 세트
    expect(skinStandId(data, 'elia', undefined)).toBeUndefined();
  });

  it('진하운 「화산의 매설」: 수련 Lv.20에 열리고, 전투 그림은 maeseol_*, 반신 그림은 maeseol_stand', async () => {
    const w = parseWardrobe(data, null);
    expect(unlockSkins(data, w, { kind: 'trainingLevel', level: 20 })).toContain('maeseol');
    equipSkin(data, w, 'elia', 'maeseol'); // 진하운만
    expect(w.equipped.elia).toBeUndefined();
    equipSkin(data, w, 'haun', 'maeseol');
    expect(battleSkins(data, w, {})).toEqual({ haun: 'maeseol' }); // 캠페인에서도
    expect(skinSpriteId(data, 'maeseol', 'haun', 'attack')).toBe('maeseol_attack');
    expect(skinStandId(data, 'haun', { haun: 'maeseol' })).toBe('maeseol_stand');
    const { readdirSync } = await import('node:fs');
    const specs = new Set(readdirSync('specs/assets').map((f) => f.replace(/\.yaml$/, '')));
    expect(['maeseol_ref', 'maeseol_idle', 'maeseol_attack', 'maeseol_hit', 'maeseol_stand'].filter((id) => !specs.has(id))).toEqual([]);
  });

  it('엘리아 새 옷 두 벌은 수련 Lv.10 · Lv.20에 열리고 캠페인에서도 입는다', () => {
    const w = parseWardrobe(data, null);
    expect(w.unlocked).not.toContain('moon_dancer');
    equipSkin(data, w, 'elia', 'moon_dancer'); // 아직 잠김
    expect(w.equipped.elia).toBeUndefined();
    expect(unlockSkins(data, w, { kind: 'trainingLevel', level: 9 })).toEqual([]);
    expect(unlockSkins(data, w, { kind: 'trainingLevel', level: 10 })).toEqual(['moon_dancer']);
    expect(unlockSkins(data, w, { kind: 'trainingLevel', level: 19 })).toEqual([]);
    expect(unlockSkins(data, w, { kind: 'trainingLevel', level: 25 })).toEqual(['summer_lake', 'maeseol']); // 넘긴 레벨이어도 연다(진하운 「화산의 매설」도 Lv.20)
    expect(unlockText(data, { kind: 'trainingLevel', level: 20 })).toBe('수련 Lv.20에 이른다');
    equipSkin(data, w, 'elia', 'summer_lake');
    expect(battleSkins(data, w, {})).toEqual({ elia: 'summer_lake' });
    equipSkin(data, w, 'haun', 'summer_lake'); // 엘리아만
    expect(w.equipped.haun).toBeUndefined();
  });
});

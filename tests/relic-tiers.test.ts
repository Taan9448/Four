// 유물 5등급(2026-10-15, GAME_DESIGN 16절 '심연 개편' ⑥): 등급별 전리품·상점, 심연 전용은 심연에서만, 전설은 보스에서만
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/engine/data';
import { createRun } from '../src/engine/run';
import { createAbyssRun, pathOffer, pathPicks } from '../src/engine/abyss';
import { openShop, rollLoot } from '../src/engine/economy';
import type { MapNode } from '../src/engine/route';

const data = gameData();
const node = (type: MapNode['type'], id = 'n1'): MapNode => ({ id, floor: 3, index: 0, type, moduleId: 'x', next: [] });
const abyssRun = (seed: string) => createAbyssRun(data, seed, { mates: ['elia'], paths: pathOffer(data, seed).slice(0, pathPicks(data, 1).picks), pool: {} });

describe('유물 5등급', () => {
  it('상점에는 전설이 없고, 캠페인 상점에는 심연 전용이 없다', () => {
    for (let i = 0; i < 40; i++) {
      const run = createRun(data, `SH${i}`);
      for (const r of openShop(data, run, `n${i}`).relics) {
        const def = data.relics.get(r.relicId)!;
        expect(def.rarity).not.toBe('legendary');
        expect(def.abyss).toBe(false);
        expect(r.price).toBeGreaterThan(0);
      }
    }
  });

  it('심연에서는 심연 전용 유물도 보스·엘리트 전리품에 나온다', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 80; i++) {
      const run = abyssRun(`AR${i}`);
      for (const id of [rollLoot(data, run, node('elite', `e${i}`)).relic, ...rollLoot(data, run, node('boss', `b${i}`)).relicChoices]) if (id) seen.add(id);
    }
    expect([...seen].some((id) => data.relics.get(id)!.abyss)).toBe(true);
    expect([...seen].some((id) => data.relics.get(id)!.rarity === 'legendary')).toBe(true);
  });

  it('보스 후보는 가진 유물을 빼고 영웅·전설에서', () => {
    const run = createRun(data, 'BOSSR');
    const first = rollLoot(data, run, node('boss')).relicChoices;
    run.relics.push(first[0]);
    expect(rollLoot(data, run, node('boss', 'n2')).relicChoices).not.toContain(first[0]);
  });
});

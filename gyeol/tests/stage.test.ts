// 2026-11-13 사용자 보고: "인물·몬스터 비율 조절 실패" · "적 스킬 이펙트가 잘려 나온다"
import { existsSync } from 'node:fs';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import data from '../data/duel.json';
import { boostFor, FX_MAX_BOOST, FX_TARGET } from '../src/fxfill';
import { fitFx, GROUND, H, SCALE, W, worldToScreen } from '../src/layout';

/** 서 있는 그림(idle 첫 칸)에서 보이는 키(px) */
async function standHeight(sprite: string): Promise<number | null> {
  const f = `assets/sprites/${sprite}_idle/frame_01.png`;
  if (!existsSync(f)) return null;
  const { data: px, info } = await sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let top = info.height;
  let bottom = -1;
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++)
      if (px[(y * info.width + x) * 4 + 3] > 40) {
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
  return bottom < 0 ? null : bottom - top + 1;
}

describe('인물 크기 비율', () => {
  type Ch = { id: string; sprite: string; player?: { scale?: number } };
  const list = (data as unknown as { characters: { list: Ch[] } }).characters.list;
  it('동료는 진하운과 머리 높이가 비슷하다(±6%), 드워프 보른은 가슴께(75~90%)', async () => {
    const haun = list.find((c) => c.id === 'haun')!;
    const base = await standHeight(haun.sprite);
    if (!base) return;
    for (const c of list) {
      if (c.id === 'haun') continue;
      const h = await standHeight(c.sprite);
      if (!h) continue;
      const ratio = (h * (c.player?.scale ?? 1)) / base;
      if (c.id === 'born') expect(ratio, c.id).toBeGreaterThan(0.75);
      if (c.id === 'born') expect(ratio, c.id).toBeLessThan(0.9);
      else expect(Math.abs(ratio - 1), `${c.id} ${ratio.toFixed(2)}`).toBeLessThan(0.06);
    }
  });
});

describe('이펙트는 화면 안에 든다(fitFx)', () => {
  const inside = (r: { x: number; y: number; w: number; h: number }) => {
    const a = worldToScreen(r.x, r.y);
    const b = worldToScreen(r.x + r.w, r.y + r.h);
    return a.x >= 0 && a.y >= 0 && b.x <= W + 0.01 && b.y <= H + 0.01;
  };
  it('땅에 선 적 기술(1.7배)·결정타(2.2배)·되살아남(2배)이 잘리지 않는다', () => {
    const cell = 160 * SCALE;
    expect(inside(fitFx(330, GROUND, cell * 1.7, cell * 1.7, 0.5, 0.9))).toBe(true);
    expect(inside(fitFx(640, GROUND - 120, cell * 2.2, cell * 2.2))).toBe(true);
    expect(inside(fitFx(640, GROUND - 120, cell * 2, cell * 2))).toBe(true);
    // 화면 끝에 붙은 것도 안쪽으로
    expect(inside(fitFx(940, GROUND - 120, cell, cell))).toBe(true);
  });
  it('이미 화면 안이면 그대로', () => {
    const r = fitFx(480, 300, 100, 100);
    expect(r).toEqual({ x: 430, y: 250, w: 100, h: 100 });
  });
});

describe('이펙트 크기 맞추기(2026-11-14)', () => {
  it('칸을 덜 채운 그림일수록 키우고, 충분히 큰 그림은 그대로, 너무 많이는 키우지 않는다', () => {
    expect(boostFor(FX_TARGET)).toBe(1);
    expect(boostFor(0.9)).toBe(1);
    expect(boostFor(0.64)).toBeCloseTo(1.25, 2);
    expect(boostFor(0.3)).toBe(FX_MAX_BOOST);
    expect(boostFor(0)).toBe(1);
  });
});

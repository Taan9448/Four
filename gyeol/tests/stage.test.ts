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

describe('연속 박자 숫자(2026-11-14)', () => {
  it('숫자가 클수록 크게, 단계마다 색이 바뀌고, 5·10·20…이 고비', async () => {
    const { comboStyle, comboMilestone } = await import('../src/render');
    const sizes = [1, 5, 10, 20, 30, 50, 100].map((n) => comboStyle(n).size);
    for (let i = 1; i < sizes.length; i++) expect(sizes[i]).toBeGreaterThan(sizes[i - 1]);
    expect(sizes.at(-1)!).toBeLessThanOrEqual(Math.round(64 * 1.9));
    expect(new Set([1, 5, 10, 20, 30, 50].map((n) => comboStyle(n).bottom)).size).toBe(6);
    expect([5, 10, 20, 30, 40].every(comboMilestone)).toBe(true);
    expect([1, 4, 6, 11, 25].some(comboMilestone)).toBe(false);
  });
});

describe('새벽 로비(2026-11-15 사용자 보고 — 엔딩 뒤 로비가 반쪽으로 밀렸다)', () => {
  it('새벽 로비 규칙이 모든 자식의 자리(position)를 바꾸지 않는다', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync('gyeol/src/style.css', 'utf8') + readFileSync('gyeol/src/ink.css', 'utf8');
    expect(css).not.toMatch(/\.lobby\.dawn\s*>\s*\*\s*\{[^}]*position/);
  });
});

describe('불러오기 3칸 · 어려움(2026-11-14)', () => {
  it('옛 저장은 1번 칸(보통)으로 옮기고, 칸을 바꾸면 이야기 진행이 따로 간다', async () => {
    const { normalize, useSlot, clearSlot, storyDifficulty } = await import('../src/save');
    const s = normalize({ v: 1, story: { cleared: ['prologue', 'ch1'], stars: { ch1: 2 }, flags: [] } });
    expect(s.slots[0]?.story.cleared).toEqual(['prologue', 'ch1']);
    expect(s.slot).toBe(0);
    useSlot(s, 1, 'hard');
    expect(s.story.cleared).toEqual([]);
    expect(storyDifficulty(s)).toBe('hard');
    s.story.cleared.push('prologue');
    useSlot(s, 0);
    expect(s.story.cleared).toEqual(['prologue', 'ch1']);
    expect(s.slots[1]?.story.cleared).toEqual(['prologue']);
    clearSlot(s, 1);
    expect(s.slots[1]).toBeNull();
    // 다시 읽어도 칸이 남는다
    const back = normalize(JSON.parse(JSON.stringify(s)));
    expect(back.slots[0]?.story.cleared).toEqual(['prologue', 'ch1']);
  });
  it('어려움 상대: 체력·공격력이 오르고, 패턴이 처음과 다르며, 단계가 하나 더', async () => {
    const { createDuel } = await import('../src/duel');
    const real = data as unknown as import('../src/duel').DuelData;
    for (const f of real.foes) {
      if (!f.hard) continue;
      const n = createDuel(real, f.id, 'h');
      const h = createDuel(real, f.id, 'h', 'duel', 'main', { hard: true });
      expect(h.foeDef.hp, f.id).toBeGreaterThan(n.foeDef.hp);
      expect(h.phaseCount, f.id).toBe(n.phaseCount + 1);
      expect(JSON.stringify(h.foeDef.patterns), f.id).not.toBe(JSON.stringify(n.foeDef.patterns));
      const anyMove = Object.keys(f.moves)[0];
      expect(h.foeDef.moves[anyMove].damage, f.id).toBeGreaterThanOrEqual(n.foeDef.moves[anyMove].damage);
      // 패턴의 모든 수가 그 단계까지 있는 수다
      const known = new Set(Object.keys(f.moves));
      for (const p of f.hard.patterns) for (const st of p.steps) expect(known.has(st.move), `${f.id} ${st.move}`).toBe(true);
      f.hard.phases.forEach((ph) => {
        for (const k of Object.keys(ph.moves ?? {})) known.add(k);
        for (const p of ph.patterns ?? []) for (const st of p.steps) expect(known.has(st.move), `${f.id} ${ph.name} ${st.move}`).toBe(true);
      });
    }
  });
});

describe('원작 상대 20종 · 기술 다섯(2026-11-15)', () => {
  type F = { id: string; sprite: string; arenaAfter?: string; moves: Record<string, { fx?: string }>; finisher?: unknown };
  const foes = (data as unknown as { foes: F[] }).foes;
  it('결투장 새 상대: 있는 장에서 열리고, 그림·결정타·기술 이펙트 명세가 있다', async () => {
    const story = (await import('../data/story.json')).default as unknown as { chapters: { id: string }[] };
    const chapters = new Set(story.chapters.map((c) => c.id));
    const fresh = foes.filter((f) => f.arenaAfter);
    expect(fresh.length).toBe(20);
    for (const f of fresh) {
      expect(chapters.has(f.arenaAfter!), f.id).toBe(true);
      for (const a of ['idle', 'attack', 'hit']) expect(existsSync(`specs/assets/${f.sprite}_${a}.yaml`), `${f.sprite}_${a}`).toBe(true);
      expect(existsSync(`specs/assets/${f.sprite}_death.yaml`), `${f.sprite}_death`).toBe(true);
      expect(existsSync(`specs/assets/fx_gyeol_finisher_${f.id}.yaml`), f.id).toBe(true);
      for (const m of Object.values(f.moves)) if (m.fx) expect(existsSync(`specs/assets/${m.fx}.yaml`), m.fx).toBe(true);
    }
  });
  it('기술마다 이펙트(_a·_b)·컷인 명세와 색이 있다', async () => {
    const { TECH_IDS, TECH_COLOR } = await import('../src/render');
    const techs = (data as unknown as { techs: { id: string }[] }).techs;
    expect([...TECH_IDS].sort()).toEqual(techs.map((t) => t.id).sort());
    for (const t of techs) {
      expect(TECH_COLOR[t.id], t.id).toBeTruthy();
      for (const s of [`fx_gyeol_tech_${t.id}_a`, `fx_gyeol_tech_${t.id}_b`, `cg_gyeol_tech_${t.id}`]) expect(existsSync(`specs/assets/${s}.yaml`), s).toBe(true);
    }
  });
});

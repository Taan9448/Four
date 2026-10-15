// 수련 레벨(2026-10-15, GAME_DESIGN 16절 '심연 개편' ④): 레벨 곡선 · 전투 경험치 · 심연 시작 금화(일일 포함)
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/engine/data';
import { battleXp, emptyTraining, gainTrainingXp, parseTraining, trainingGold, trainingLevel, xpToNext } from '../src/engine/training';
import { createAbyssRun, dailyPlan, pathOffer, pathPicks } from '../src/engine/abyss';

const data = gameData();
const t = data.balance.training;
const total = (to: number) => Array.from({ length: to - 1 }, (_, i) => xpToNext(data, i + 1)).reduce((a, b) => a + b, 0);

describe('수련 레벨', () => {
  it('레벨 곡선: 1에서 시작, 레벨마다 필요 경험치가 xpStep씩 늘고, levelMax에서 멈춘다', () => {
    expect(trainingLevel(data, 0)).toEqual({ level: 1, into: 0, need: t.xpBase });
    expect(xpToNext(data, 2) - xpToNext(data, 1)).toBe(t.xpStep);
    expect(trainingLevel(data, total(10)).level).toBe(10);
    expect(trainingLevel(data, total(10) - 1).level).toBe(9);
    expect(trainingLevel(data, total(t.levelMax))).toEqual({ level: t.levelMax, into: 0, need: 0 });
    expect(trainingLevel(data, total(t.levelMax) * 3).level).toBe(t.levelMax);
  });

  it('이긴 전투의 경험치: 일반 < 엘리트 < 보스, 전투가 아닌 노드는 0', () => {
    expect(battleXp(data, 'battle')).toBe(t.xp.battle);
    expect(battleXp(data, 'elite')).toBe(t.xp.elite);
    expect(battleXp(data, 'boss')).toBe(t.xp.boss);
    expect(battleXp(data, 'shop')).toBe(0);
    expect(t.xp.battle).toBeLessThan(t.xp.elite);
    expect(t.xp.elite).toBeLessThan(t.xp.boss);
  });

  it('경험치를 더하면 오르기 전·후 레벨을 돌려준다', () => {
    const tr = emptyTraining();
    expect(gainTrainingXp(data, tr, t.xpBase - 1)).toEqual({ from: 1, to: 1 });
    expect(gainTrainingXp(data, tr, 1)).toEqual({ from: 1, to: 2 });
    expect(gainTrainingXp(data, tr, -50)).toEqual({ from: 2, to: 2 });
  });

  it('저장 읽기: 깨졌거나 음수면 0부터', () => {
    expect(parseTraining(null)).toEqual({ xp: 0 });
    expect(parseTraining('not json')).toEqual({ xp: 0 });
    expect(parseTraining('{"xp":-5}')).toEqual({ xp: 0 });
    expect(parseTraining('{"xp":1234.7}')).toEqual({ xp: 1234 });
  });

  it('심연 시작 금화: 10레벨마다 +50, 99레벨에 +50 더 — 최대 500', () => {
    expect(trainingGold(data, 1)).toBe(0);
    expect(trainingGold(data, 9)).toBe(0);
    expect(trainingGold(data, 10)).toBe(50);
    expect(trainingGold(data, 19)).toBe(50);
    expect(trainingGold(data, 90)).toBe(450);
    expect(trainingGold(data, 98)).toBe(450);
    expect(trainingGold(data, 99)).toBe(500);
  });

  it('심연·일일 심연 시작 골드에 수련 덤이 붙는다(생략하면 덤 없음 — 봇)', () => {
    const seed = 'TR1';
    const mates = ['elia'];
    const paths = pathOffer(data, seed).slice(0, pathPicks(data, 1).picks);
    const base = createAbyssRun(data, seed, { mates, paths, pool: {} }).gold;
    expect(createAbyssRun(data, seed, { mates, paths, pool: {}, trainingLevel: 99 }).gold).toBe(base + 500);
    const day = 'D20261015';
    const plan = dailyPlan(data, day);
    const daily = (lv?: number) => createAbyssRun(data, day, { mates: plan.mates, paths: plan.paths, oath: plan.oath, pool: {}, daily: { date: '20261015', laws: plan.laws }, trainingLevel: lv }).gold;
    expect(daily(20) - daily()).toBe(100);
  });
});

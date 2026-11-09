import { describe, expect, it } from 'vitest';
import { advance, createDuel, cue, isOpen, press, type DuelData } from '../src/duel';
import realRaw from '../data/duel.json';

const real = realRaw as unknown as DuelData;

// 한 가지 공격만 하는 적: 첫 공격은 idle[1]=500ms 뒤 시작, windup 400 → 타격은 900ms
const data: DuelData = {
  rules: { ...real.rules, perfect: 150, guard: 420, parryLockout: 220, cueLead: 500, counterWindow: 700, counterMul: 3, stagger: 1600 },
  player: { ...real.player, hp: 100, posture: 100 },
  foes: [
    {
      id: 'dummy',
      title: '연습 상대',
      sprite: 'wolf',
      bg: 'bg_elheim_forest',
      note: '',
      hp: 100,
      posture: 50,
      postureRegen: 0,
      idle: [500, 500],
      moves: { swing: { name: '내려치기', windup: 400, recover: 200, damage: 20, posture: 20 } },
      patterns: [{ weight: 1, steps: [{ move: 'swing' }] }],
    },
  ],
};
const HIT = 900;

describe('「결」 대결 판정', () => {
  it('타격 직전(perfect 안)에 받으면 패링 — 적 체간이 오르고 되돌아오는 틈이 열린다', () => {
    const d = createDuel(data, 'dummy');
    advance(d, HIT - 100);
    expect(press(d, 'parry')).toBe(true);
    advance(d, HIT + 10);
    expect(d.events.map((e) => e.type)).toContain('parry');
    expect(d.player.hp).toBe(100);
    expect(d.foe.posture).toBeCloseTo(20 * data.rules.parryPostureMul, 0);
    expect(isOpen(d)).toBe(true);
  });

  it('틈 안의 베기는 반격(counterMul배), 틈이 닫힌 뒤엔 보통 베기', () => {
    const d = createDuel(data, 'dummy');
    advance(d, HIT - 50);
    press(d, 'parry');
    advance(d, HIT + 20);
    press(d, 'attack');
    advance(d, HIT + 20 + data.player.attack.duration);
    const strike = d.events.find((e) => e.type === 'strike');
    expect(strike).toMatchObject({ counter: true, damage: data.player.attack.damage * data.rules.counterMul });
    const later = createDuel(data, 'dummy');
    advance(later, 100);
    press(later, 'attack');
    advance(later, 100 + data.player.attack.duration);
    expect(later.events.find((e) => e.type === 'strike')).toMatchObject({ counter: false, damage: data.player.attack.damage });
  });

  it('너무 일찍(guard 안) 누르면 막기 — 피해 일부와 내 체간', () => {
    const d = createDuel(data, 'dummy');
    advance(d, HIT - 300);
    press(d, 'parry');
    advance(d, HIT + 10);
    const ev = d.events.find((e) => e.type === 'guard');
    expect(ev).toBeTruthy();
    expect(d.player.hp).toBe(100 - Math.round(20 * data.rules.guardChip));
    expect(d.player.posture).toBeGreaterThan(0);
  });

  it('누르지 않으면 그대로 맞는다, 너무 이르게 눌러도 맞는다', () => {
    const d = createDuel(data, 'dummy');
    advance(d, HIT + 10);
    expect(d.player.hp).toBe(80);
    const e = createDuel(data, 'dummy');
    advance(e, HIT - 600);
    press(e, 'parry');
    advance(e, HIT + 10);
    expect(e.player.hp).toBe(80);
  });

  it('받기를 연타하면 막힌다(parryLockout)', () => {
    const d = createDuel(data, 'dummy');
    advance(d, 100);
    expect(press(d, 'parry')).toBe(true);
    advance(d, 150);
    expect(press(d, 'parry')).toBe(false);
  });

  it('결(타격 예고)은 cueLead ms 전부터 보이고 타격에 가까울수록 ratio가 0으로', () => {
    const d = createDuel(data, 'dummy');
    advance(d, HIT - data.rules.cueLead - 20);
    expect(cue(d).visible).toBe(false);
    advance(d, HIT - 250);
    const c = cue(d);
    expect(c.visible).toBe(true);
    expect(c.ratio).toBeCloseTo(0.5, 1);
  });

  it('체간이 가득 차면 비틀거리고, 그때 베면 결정타', () => {
    const d = createDuel(data, 'dummy');
    // 패링 두 번(20×1.6×2 = 64 ≥ 50)
    let hit = HIT;
    for (let i = 0; i < 2; i++) {
      advance(d, hit - 60);
      press(d, 'parry');
      advance(d, hit + 5);
      hit += 200 + 500 + 400; // recover + idle + windup
    }
    expect(d.foe.state).toBe('stagger');
    press(d, 'attack');
    advance(d, d.t + data.player.attack.duration);
    const db = d.events.find((e) => e.type === 'deathblow');
    expect(db).toMatchObject({ damage: Math.round(100 * data.rules.deathblow) });
    expect(d.stats.deathblows).toBe(1);
  });

  it('적 체력이 0이면 승리, 내 체력이 0이면 패배', () => {
    const lose = createDuel(data, 'dummy');
    advance(lose, 20000);
    expect(lose.result).toBe('lose');
    const win = createDuel({ ...data, foes: [{ ...data.foes[0], hp: 6 }] }, 'dummy');
    press(win, 'attack');
    advance(win, data.player.attack.duration);
    expect(win.result).toBe('win');
  });

  it('같은 시드면 같은 공격 순서(시드 RNG)', () => {
    const run = (seed: string) => {
      const d = createDuel(real as DuelData, 'ignis', seed);
      const moves: string[] = [];
      for (let t = 0; t < 30000; t += 16) {
        advance(d, t);
        if (d.foe.state === 'windup' && moves[moves.length - 1] !== `${d.foe.move}@${d.foe.hitAt}`) moves.push(`${d.foe.move}@${d.foe.hitAt}`);
      }
      return moves;
    };
    expect(run('a')).toEqual(run('a'));
    expect(run('a')).not.toEqual(run('b'));
  });

  it('실제 데이터: 세 상대 모두 공격이 정의돼 있고 패턴의 공격 id가 있다', () => {
    const r = real;
    for (const f of r.foes) {
      for (const p of f.patterns) for (const s of p.steps) expect(f.moves[s.move], `${f.id}.${s.move}`).toBeTruthy();
      for (const m of Object.values(f.moves)) expect(m.windup).toBeGreaterThan(r.rules.perfect);
    }
  });
});

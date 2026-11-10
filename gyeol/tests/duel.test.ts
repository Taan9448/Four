import { describe, expect, it } from 'vitest';
import { advance, betterRank, createDuel, cue, duelGrade, isOpen, MAX_INPUT_LAG, press, rhythmScore, streakTier, TECH_DURATION, type DuelData, type DuelOptions, type MoveDef } from '../src/duel';
import { calibrationOffset } from '../src/calibrate';
import { defaultSettings, KEY, loadSave, normalize, resetSaveCache, writeSave } from '../src/save';
import realRaw from '../data/duel.json';
import storyRaw from '../data/story.json';
import { existsSync } from 'node:fs';

const real = realRaw as unknown as DuelData;
/** 대결 상대(수련장 철목인 빼고) */
const duelFoes = real.foes.filter((f) => !f.practice);
/** 박자 도전 악보가 있는 결투장 상대(처음 다섯) */
const chartFoes = duelFoes.filter((f) => f.chart);
/** 이길 수 있는 상대(버티기 전용 곽도진 빼고) */
const beatable = duelFoes.filter((f) => f.hp < 9999);

// 한 가지 공격만 하는 적: 첫 공격은 idle[1]=500ms 뒤 시작, windup 400 → 타격은 900ms
const data: DuelData = {
  rules: { ...real.rules, parry: 150, perfect: 40, guard: 420, parryLockout: 220, cueLead: 500, counterWindow: 700, counterMul: 3, stagger: 1600 },
  player: { ...real.player, hp: 100, posture: 100 },
  techs: real.techs,
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
  it('타격 직전(parry 안)에 받으면 패링 — 적 체간이 오르고 되돌아오는 틈이 열린다', () => {
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
    // 틈 밖의 베기는 적이 막는다(피해 foeGuardMul배, 최소 1)
    expect(later.events.find((e) => e.type === 'strike')).toMatchObject({ counter: false, blocked: true, damage: Math.max(1, Math.round(data.player.attack.damage * data.rules.foeGuardMul)) });
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
    const win = createDuel({ ...data, foes: [{ ...data.foes[0], hp: 1 }] }, 'dummy');
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
      for (const m of Object.values(f.moves)) expect(m.windup).toBeGreaterThan(r.rules.parry);
    }
  });
});

/** 한 가지 공격만 하는 연습 상대(첫 타격 900ms, 이후 recover 200 + idle 500 + windup) */
function single(move: MoveDef, rules: Partial<DuelData['rules']> = {}): DuelData {
  return { ...data, rules: { ...data.rules, lightningJitter: 0, ...rules }, foes: [{ ...data.foes[0], moves: { swing: move } }] };
}
const swing = (extra: Partial<MoveDef>): MoveDef => ({ name: '내려치기', windup: 400, recover: 200, damage: 10, posture: 10, ...extra });

describe('「결」 목업 2차 — 원소·받을 수 없는 공격·속임수·연속 박자·박자 도전', () => {
  it('속임수: 가짜 순간에 받으면 진짜 타격 때는 막기가 되고, 진짜 순간에 받으면 패링', () => {
    const dd = single(swing({ feint: 300 }));
    const fooled = createDuel(dd, 'dummy');
    advance(fooled, HIT - 60); // 가짜 순간(900) 직전 — 진짜는 1200
    press(fooled, 'parry');
    advance(fooled, HIT + 310);
    expect(fooled.events.map((e) => e.type)).toEqual(expect.arrayContaining(['feint', 'guard']));
    const read = createDuel(dd, 'dummy');
    advance(read, HIT + 300 - 60);
    press(read, 'parry');
    advance(read, HIT + 310);
    expect(read.events.some((e) => e.type === 'parry')).toBe(true);
    // 결의 고리는 가짜 순간까지는 faking
    const c = createDuel(dd, 'dummy');
    advance(c, HIT - 100);
    expect(cue(c)).toMatchObject({ visible: true, faking: true });
    advance(c, HIT + 50);
    expect(cue(c).faking).toBe(false);
  });

  it('받을 수 없는 공격: 받기는 통하지 않고, 제때 피하면 간파(틈이 열림)', () => {
    const dd = single(swing({ unblockable: true, damage: 22 }));
    const parried = createDuel(dd, 'dummy');
    advance(parried, HIT - 60);
    press(parried, 'parry');
    advance(parried, HIT + 10);
    expect(parried.player.hp).toBe(100 - 22);
    const dodged = createDuel(dd, 'dummy');
    advance(dodged, HIT - 150);
    expect(press(dodged, 'dodge')).toBe(true);
    advance(dodged, HIT + 10);
    expect(dodged.player.hp).toBe(100);
    expect(dodged.events.some((e) => e.type === 'mikiri')).toBe(true);
    expect(isOpen(dodged)).toBe(true);
    // 너무 일찍 피하면 무적이 끝나 맞는다
    const early = createDuel(dd, 'dummy');
    advance(early, HIT - 500);
    press(early, 'dodge');
    advance(early, HIT + 10);
    expect(early.player.hp).toBe(78);
  });

  it('보통 공격도 피할 수 있지만 틈은 열리지 않는다(회피)', () => {
    const d = createDuel(single(swing({})), 'dummy');
    advance(d, HIT - 100);
    press(d, 'dodge');
    advance(d, HIT + 10);
    expect(d.events.some((e) => e.type === 'evade')).toBe(true);
    expect(isOpen(d)).toBe(false);
    expect(d.player.hp).toBe(100);
  });

  it('화염: 패링해도 화상, 막으면 더 아프다', () => {
    const dd = single(swing({ element: 'fire', damage: 12 }));
    const p = createDuel(dd, 'dummy');
    advance(p, HIT - 60);
    press(p, 'parry');
    advance(p, HIT + 10);
    expect(p.player.hp).toBe(100 - dd.rules.fireParryChip);
    expect(p.events.some((e) => e.type === 'burn')).toBe(true);
    const g = createDuel(dd, 'dummy');
    advance(g, HIT - 300);
    press(g, 'parry');
    advance(g, HIT + 10);
    expect(g.player.hp).toBe(100 - Math.round(12 * dd.rules.guardChip) - dd.rules.fireGuardExtra);
  });

  it('냉기 결은 느리게 좁혀 들다 마지막에 빨라지고, 번개 결은 뚝뚝 끊긴다', () => {
    const plain = createDuel(single(swing({})), 'dummy');
    const ice = createDuel(single(swing({ element: 'ice' })), 'dummy');
    const bolt = createDuel(single(swing({ element: 'lightning' })), 'dummy');
    for (const d of [plain, ice, bolt]) advance(d, HIT - 230);
    expect(cue(ice).ratio).toBeGreaterThan(cue(plain).ratio);
    expect((cue(bolt).ratio * 5) % 1).toBeCloseTo(0, 5);
  });

  it('번개는 대결에서 타격 순간이 흔들린다(시드 RNG)', () => {
    const dd = single(swing({ element: 'lightning' }), { lightningJitter: 90 });
    const hits = ['a', 'b', 'c', 'd', 'e'].map((seed) => {
      const d = createDuel(dd, 'dummy', seed);
      advance(d, 600);
      return d.foe.hitAt;
    });
    expect(new Set(hits).size).toBeGreaterThan(1);
    for (const h of hits) expect(Math.abs(h - HIT)).toBeLessThanOrEqual(90);
  });

  it('연속 박자: 패링이 이어지면 단계가 오르고 맞으면 끊긴다', () => {
    const dd = single(swing({ posture: 1 }), { streakTiers: [2, 4] });
    const d = createDuel(dd, 'dummy');
    let hit = HIT;
    for (let i = 0; i < 4; i++) {
      advance(d, hit - 60);
      press(d, 'parry');
      advance(d, hit + 5);
      hit += 200 + 500 + 400;
    }
    expect(d.streak).toBe(4);
    expect(streakTier(d)).toBe(2);
    expect(d.events.some((e) => e.type === 'streak' && e.tier === 2)).toBe(true);
    advance(d, hit + 5); // 안 받고 맞음
    expect(d.streak).toBe(0);
    expect(d.stats.maxStreak).toBe(4);
  });

  it('박자 도전: 악보대로 오고, 판정을 세어 등급을 매기며 죽지 않는다', () => {
    for (const foe of chartFoes) {
      const d = createDuel(real, foe.id, 'x', 'rhythm');
      const steps = foe.chart!.steps;
      // 모든 타격을 정확히 받거나(받을 수 없으면) 피한다
      for (const st of steps) {
        const m = foe.moves[st.move];
        advance(d, st.at - (m.unblockable ? 120 : 30));
        press(d, m.unblockable ? 'dodge' : 'parry');
      }
      advance(d, steps[steps.length - 1].at + 1500);
      expect(d.result, foe.id).toBe('win');
      expect(d.stats.clean, foe.id).toBe(steps.length);
      expect(d.stats.perfect, foe.id).toBe(steps.length);
      expect(rhythmScore(d).rank).toBe('S');
      expect(d.foe.hp).toBe(foe.hp);
    }
    const lazy = createDuel(real, 'ignis', 'x', 'rhythm');
    advance(lazy, 60000);
    expect(lazy.result).toBe('win');
    expect(lazy.player.hp).toBe(real.player.hp);
    expect(rhythmScore(lazy)).toMatchObject({ accuracy: 0, rank: 'C' });
    expect(press(lazy, 'attack')).toBe(false);
  });

  it('실제 데이터: 다섯 상대 모두 원소·받을 수 없는 공격·속임수·악보를 갖췄다', () => {
    const els = new Set(chartFoes.flatMap((f) => Object.values(f.moves).map((m) => m.element)).filter(Boolean));
    expect([...els].sort()).toEqual(['fire', 'ice', 'lightning']);
    expect(chartFoes.length).toBe(5);
    for (const f of chartFoes) {
      const ms = Object.values(f.moves);
      expect(ms.some((m) => m.unblockable), f.id).toBe(true);
      expect(ms.some((m) => (m.feint ?? 0) > real.rules.parry), f.id).toBe(true);
      expect(f.chart?.steps.length ?? 0, f.id).toBeGreaterThanOrEqual(12);
      for (const st of f.chart!.steps) expect(f.moves[st.move], `${f.id}.${st.move}`).toBeTruthy();
    }
  });

  it('판정 4단계: 타격 40ms 안에 받으면 PERFECT, 그 밖의 패링은 EXCELLENT, 막기 GOOD, 맞으면 MISS', () => {
    const at = (lead: number | null) => {
      const d = createDuel(single(swing({})), 'dummy');
      if (lead !== null) {
        advance(d, HIT - lead);
        press(d, 'parry');
      }
      advance(d, HIT + 10);
      const ev = d.events.find((e) => e.type === 'parry');
      return ev && ev.type === 'parry' ? ev.judgement : d.events.some((e) => e.type === 'guard') ? 'good' : 'miss';
    };
    expect(at(30)).toBe('perfect');
    expect(at(50)).toBe('excellent');
    expect(at(120)).toBe('excellent');
    expect(at(300)).toBe('good');
    expect(at(null)).toBe('miss');
  });

  it('베기 연타로는 이길 수 없다 — 막힌 베기가 쌓이면 적이 되받아친다', () => {
    for (const foe of duelFoes) {
      const d = createDuel(real, foe.id, 'spam');
      for (let t = 0; t < 60000 && !d.result; t += 16) {
        advance(d, t);
        press(d, 'attack');
      }
      expect(d.result, foe.id).not.toBe('win');
    }
    const slow = single(swing({}));
    const d = createDuel({ ...slow, foes: [{ ...slow.foes[0], idle: [5000, 5000] }] }, 'dummy');
    for (let i = 0; i < 3; i++) {
      press(d, 'attack');
      advance(d, d.t + data.player.attack.duration + 5);
    }
    expect(d.events.some((e) => e.type === 'punish')).toBe(true);
    expect(d.foe.state).toBe('windup');
  });

  it('받을 수 없는 기술은 시작할 때 이름을 외치고(skill), 연속 박자는 1부터 숫자가 오른다', () => {
    const d = createDuel(single(swing({ unblockable: true, name: '그림자 덮치기' })), 'dummy');
    advance(d, 600);
    expect(d.events.find((e) => e.type === 'skill')).toMatchObject({ name: '그림자 덮치기' });
    const p = createDuel(single(swing({})), 'dummy');
    advance(p, HIT - 60);
    press(p, 'parry');
    advance(p, HIT + 5);
    expect(p.events.find((e) => e.type === 'streak')).toMatchObject({ streak: 1 });
  });

  it('진하운의 기술: EXCELLENT 이상 5연환 낙운무흔, PERFECT 5연환 벽운단하, EXCELLENT 이상 10연환 운해귀종(받아낸 힘을 돌려보낸다)', () => {
    const run = (leads: number[]) => {
      const dd = single(swing({ damage: 10, posture: 1 }));
      const d = createDuel({ ...dd, foes: [{ ...dd.foes[0], hp: 1000, posture: 1000 }] }, 'dummy');
      let hit = HIT;
      for (const lead of leads) {
        advance(d, hit - lead);
        press(d, 'parry');
        advance(d, hit + 5);
        hit += 200 + 500 + 400;
      }
      return d;
    };
    const ex = (n: number) => Array<number>(n).fill(30); // PERFECT
    expect(run(ex(4)).techReady).toBeNull();
    expect(run([30, 100, 30, 30]).techReady).toBeNull();
    expect(run([30, 100, 30, 30, 30]).techReady).toBe('nakun'); // EXCELLENT 섞임
    expect(run([30, 300, 30, 30, 30]).techReady).toBeNull(); // GOOD(막기)이 섞이면 아무것도 아니다
    expect(run(ex(5)).techReady).toBe('byeogun');
    expect(run([100, ...ex(8)]).techReady).toBe('nakun');
    const pure = run([100, ...ex(9)]);
    expect(pure.techReady).toBe('unhae');
    // 쓰면: 무적, 피해 = 최대 체력 × damage + 받아낸 힘(10×10) × returnMul, 체간은 가득(비틀거림)
    const unhae = real.techs.find((t) => t.id === 'unhae')!;
    expect(press(pure, 'tech')).toBe(true);
    advance(pure, pure.t + TECH_DURATION);
    const hit = pure.events.find((e) => e.type === 'techHit');
    expect(hit).toMatchObject({ tech: 'unhae', damage: Math.round(1000 * unhae.damage + 100 * unhae.returnMul) });
    expect(pure.foe.state).toBe('stagger');
    expect(pure.techReady).toBeNull();
    expect(pure.chain).toBe(0);
  });

  it('맞으면 결 연환은 끊기지만 준비된 기술은 남는다, 박자 도전에서는 기술이 없다', () => {
    const dd = single(swing({ posture: 1 }));
    const d = createDuel({ ...dd, foes: [{ ...dd.foes[0], posture: 1000 }] }, 'dummy');
    let hit = HIT;
    for (let i = 0; i < 5; i++) {
      advance(d, hit - 30);
      press(d, 'parry');
      advance(d, hit + 5);
      hit += 1100;
    }
    expect(d.techReady).toBe('byeogun');
    advance(d, hit + 5); // 맞음
    expect(d.chain).toBe(0);
    expect(d.techReady).toBe('byeogun');
    const r = createDuel(real, 'ignis', 'x', 'rhythm');
    expect(press(r, 'tech')).toBe(false);
  });
});

describe('「결」 목업 4차 — 겨루기·위기·집중', () => {
  const r = data.rules;
  const aim = HIT - data.player.attack.hitAt; // 베기가 적의 타격 순간에 닿도록

  it('겨루기: 결 연환을 이은 채 무거운 공격에 노려 벤 칼이 동시에 닿으면 칼끼리 맞부딪힌다 — 연타로 밀면 이기고 틈이 열린다', () => {
    const d = createDuel(data, 'dummy');
    d.chain = r.clashMinChain;
    advance(d, aim);
    press(d, 'attack');
    advance(d, HIT + 2);
    expect(d.events.some((e) => e.type === 'clash')).toBe(true);
    expect(d.foe.state).toBe('clash');
    expect(d.player.hp).toBe(100);
    // 대결 중 다른 입력은 받지 않고, J·K는 민다
    expect(press(d, 'dodge')).toBe(false);
    for (let t = d.t; d.clash && t < d.t + 2000; t += 60) {
      advance(d, t);
      press(d, t % 120 ? 'attack' : 'parry');
    }
    const won = d.events.find((e) => e.type === 'clashWin');
    expect(won).toMatchObject({ damage: Math.round(data.player.attack.damage * r.clashWinDamage) });
    expect(d.foe.hp).toBe(100 - Math.round(data.player.attack.damage * r.clashWinDamage));
    expect(d.foe.state).toBe('recover');
    expect(isOpen(d)).toBe(true);
    expect(d.player.action).toBe('idle');
  });

  it('겨루기에서 밀리면 베인다(적 공격 피해 × clashLoseMul)', () => {
    const d = createDuel(data, 'dummy');
    d.chain = r.clashMinChain;
    advance(d, aim);
    press(d, 'attack');
    advance(d, HIT + 2000);
    expect(d.events.find((e) => e.type === 'clashLose')).toMatchObject({ damage: Math.round(20 * r.clashLoseMul) });
    expect(d.player.hp).toBe(100 - Math.round(20 * r.clashLoseMul));
    expect(d.chain).toBe(0);
  });

  it('겨루기는 특수한 순간에만: 결 연환이 모자라거나, 가벼운 공격이거나, 연타한 베기거나, 받을 수 없는 공격이면 없다', () => {
    const fresh = createDuel(data, 'dummy'); // 결 연환 0
    advance(fresh, aim);
    press(fresh, 'attack');
    advance(fresh, HIT + 5);
    expect(fresh.events.some((e) => e.type === 'clash')).toBe(false);
    const light = createDuel(single(swing({ damage: 10 })), 'dummy');
    light.chain = r.clashMinChain;
    advance(light, aim);
    press(light, 'attack');
    advance(light, HIT + 5);
    expect(light.events.some((e) => e.type === 'clash')).toBe(false);
    const marked = createDuel(single(swing({ damage: 10, clash: true })), 'dummy');
    marked.chain = r.clashMinChain;
    advance(marked, aim);
    press(marked, 'attack');
    advance(marked, HIT + 5);
    expect(marked.events.some((e) => e.type === 'clash')).toBe(true);
    const spam = createDuel(data, 'dummy');
    spam.chain = r.clashMinChain;
    advance(spam, aim - data.player.attack.duration);
    press(spam, 'attack');
    advance(spam, aim);
    expect(press(spam, 'attack')).toBe(true); // 앞 베기가 끝나자마자 다시
    advance(spam, HIT + 5);
    expect(spam.events.some((e) => e.type === 'clash')).toBe(false);
    expect(spam.events.some((e) => e.type === 'hit')).toBe(true);
    const red = createDuel(single(swing({ unblockable: true, damage: 30 })), 'dummy');
    red.chain = r.clashMinChain;
    advance(red, aim);
    press(red, 'attack');
    advance(red, HIT + 5);
    expect(red.events.some((e) => e.type === 'clash')).toBe(false);
  });

  it('위기(배수의 진): 체력이 crisisHp 아래로 떨어지면 한 번 알리고, PERFECT 폭이 넓어진다', () => {
    const run = (damage: number) => {
      const d = createDuel(single(swing({ damage })), 'dummy');
      advance(d, HIT + 5); // 맞는다
      const H2 = HIT + 200 + 500 + 400;
      advance(d, H2 - 55); // PERFECT(40)보다 이르고, 넓힌 폭(40 × crisisPerfectMul) 안
      press(d, 'parry');
      advance(d, H2 + 5);
      return d;
    };
    const low = run(85);
    expect(low.crisis).toBe(true);
    expect(low.events.filter((e) => e.type === 'crisis')).toHaveLength(1);
    expect(low.events.find((e) => e.type === 'parry')).toMatchObject({ judgement: 'perfect' });
    const fine = run(10);
    expect(fine.crisis).toBe(false);
    expect(fine.events.find((e) => e.type === 'parry')).toMatchObject({ judgement: 'excellent' });
  });

  it('집중(심안): 받기로 게이지를 모아 가득 차면 쓴다 — 그동안 결이 공격 시작부터 보인다, 박자 도전에는 없다', () => {
    const d = createDuel({ ...data, foes: [{ ...data.foes[0], posture: 1000 }] }, 'dummy');
    expect(d.focus).toBe(r.focusStart);
    expect(press(d, 'focus')).toBe(false);
    let hit = HIT;
    for (let i = 0; i < 3; i++) {
      advance(d, hit - 20);
      press(d, 'parry');
      advance(d, hit + 5);
      hit += 200 + 500 + 400;
    }
    const got = d.events.filter((e) => e.type === 'parry').map((e) => (e.type === 'parry' ? e.judgement : 'miss'));
    expect(got).toHaveLength(3);
    expect(d.focus).toBe(Math.min(r.focusMax, r.focusStart + got.reduce((a, j) => a + (j === 'perfect' ? r.focusGain.perfect : r.focusGain.excellent), 0)));
    expect(press(d, 'focus')).toBe(true);
    expect(d.focus).toBe(0);
    expect(d.events.some((e) => e.type === 'focus')).toBe(true);

    const slow = single(swing({ windup: 1200 }));
    const seen = createDuel(slow, 'dummy');
    seen.focus = r.focusMax;
    press(seen, 'focus');
    advance(seen, 600); // 공격 시작(500) 직후, 타격(1700)까지 1100 — 평소에는 아직 안 보인다
    expect(cue(seen)).toMatchObject({ visible: true, focus: true });
    const plain = createDuel(slow, 'dummy');
    advance(plain, 600);
    expect(cue(plain).visible).toBe(false);

    const rh = createDuel(real, 'ignis', 'x', 'rhythm');
    rh.focus = r.focusMax;
    expect(press(rh, 'focus')).toBe(false);
  });

  it('모든 상대에 결정타·날씨·대사가 있다', () => {
    for (const f of duelFoes) {
      if (beatable.includes(f)) expect(f.finisher?.name, f.id).toBeTruthy();
      expect(f.weather, f.id).toBeTruthy();
      expect(f.lines?.start?.length, f.id).toBeGreaterThan(0);
    }
    expect(real.player.lines?.start?.length).toBeGreaterThan(0);
  });
});

describe('「결」 1단계 — 입력 시각 보정·저장', () => {
  it('늦게 닿은 받기는 실제로 누른 시각(at)으로 판정한다 — 단, MAX_INPUT_LAG까지만', () => {
    // 화면은 타격 순간을 지나지 않았지만 이미 타격 30ms 전에 있다: 140ms 전에 눌렀으면 GREAT(150 안), 지금 눌렀다고 치면 EXCELLENT
    const late = createDuel(data, 'dummy');
    advance(late, HIT - 30);
    expect(press(late, 'parry', HIT - 140)).toBe(true);
    advance(late, HIT + 5);
    expect(late.events.find((e) => e.type === 'parry')).toMatchObject({ judgement: 'excellent' });
    // 너무 먼 과거는 MAX_INPUT_LAG로 자른다
    const far = createDuel(data, 'dummy');
    advance(far, HIT - 30);
    press(far, 'parry', 0);
    expect(far.player.parryAt).toBe(HIT - 30 - MAX_INPUT_LAG);
    // 미래 시각은 지금으로
    const fut = createDuel(data, 'dummy');
    advance(fut, 100);
    press(fut, 'parry', 500);
    expect(fut.player.parryAt).toBe(100);
  });

  it('저장: 빈 저장은 기본값, 깨진 값은 걸러 내고, 옛 박자 도전 기록을 옮긴다', () => {
    const mem = new Map<string, string>();
    const st = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    resetSaveCache();
    mem.set('gyeol.rhythmBest', JSON.stringify({ ignis: { accuracy: 0.9, rank: 'A' } }));
    const s = loadSave(st);
    expect(s.settings).toEqual(defaultSettings());
    expect(s.rhythmBest.ignis.rank).toBe('A');
    s.settings.inputOffset = 30;
    writeSave(s, st);
    expect(JSON.parse(mem.get(KEY)!).settings.inputOffset).toBe(30);
    const bad = normalize({ settings: { master: 7, inputOffset: 999, quality: 'ultra', reduceFlash: 'yes' }, story: 3 });
    expect(bad.settings).toMatchObject({ master: 1, inputOffset: 120, quality: 'auto', reduceFlash: false });
    expect(bad.story).toEqual({ cleared: [], stars: {} });
    resetSaveCache();
  });
});

describe('「결」 2단계 — 난이도·수련장·대결 등급·박자 맞추기', () => {
  const withDiffs: DuelData = { ...data, difficulties: real.difficulties };

  it('난이도: 수련은 판정 폭이 넓고 적 피해가 적다, 결은 좁다 — 원본 데이터는 그대로', () => {
    const easy = createDuel(withDiffs, 'dummy', 'x', 'duel', 'easy');
    const hard = createDuel(withDiffs, 'dummy', 'x', 'duel', 'hard');
    const ez = real.difficulties!.find((d) => d.id === 'easy')!;
    expect(easy.data.rules.perfect).toBe(Math.round(data.rules.perfect * ez.judgeMul));
    expect(easy.foeDef.moves.swing.damage).toBe(Math.round(20 * ez.foeDamageMul));
    expect(hard.data.rules.perfect).toBeLessThan(data.rules.perfect);
    expect(data.foes[0].moves.swing.damage).toBe(20);
    // 수련에서는 본선이면 막기가 될 이른 받기도 패링이 된다
    advance(easy, HIT - 180);
    press(easy, 'parry');
    advance(easy, HIT + 5);
    expect(easy.events.some((e) => e.type === 'parry')).toBe(true);
  });

  it('수련장: 하운은 다치지 않고 철목인은 쓰러지면 다시 선다(끝나지 않는다)', () => {
    const d = createDuel({ ...data, foes: [{ ...data.foes[0], hp: 10 }] }, 'dummy', 'x', 'practice');
    advance(d, HIT + 5); // 맞는다
    expect(d.player.hp).toBe(data.player.hp);
    expect(d.events.find((e) => e.type === 'hit')).toMatchObject({ lead: null });
    advance(d, HIT + 400); // 맞고 움찔한 뒤
    d.foe.hp = 1;
    d.foe.state = 'stagger';
    d.foe.stateEnd = d.t + 1000;
    press(d, 'attack');
    advance(d, d.t + data.player.attack.duration);
    expect(d.result).toBeNull();
    expect(d.foe.hp).toBe(10);
    expect(d.events.some((e) => e.type === 'refill')).toBe(true);
  });

  it('받기·막기 사건에 누른 시점(타격 몇 ms 전)이 실린다', () => {
    const d = createDuel(data, 'dummy');
    advance(d, HIT - 40);
    press(d, 'parry');
    advance(d, HIT + 5);
    expect(d.events.find((e) => e.type === 'parry')).toMatchObject({ lead: 40 });
  });

  it('대결 등급: 이긴 대결만, 맞지 않고 PERFECT가 많을수록 높다', () => {
    const base = createDuel(real, 'shadow_wolf');
    expect(duelGrade(base)).toBeNull();
    const g = real.rules.grade;
    const mk = (hits: number, ex: number, judged: number) => {
      const d = createDuel(real, 'shadow_wolf');
      d.result = 'win';
      Object.assign(d.stats, { hits, perfect: ex, clean: ex, good: judged - ex - hits, miss: hits, guards: 0 });
      return duelGrade(d)!;
    };
    expect(mk(0, 10, 10)).toMatchObject({ rank: 'S', score: g.base + g.perfect });
    expect(mk(1, 4, 10).rank).toBe('A');
    expect(mk(4, 0, 10).rank).toBe('C');
    expect(betterRank('A', 'S')).toBe('S');
    expect(betterRank('S', 'B')).toBe('S');
    expect(betterRank(undefined, 'C')).toBe('C');
  });

  it('박자 맞추기: 가장 가까운 박과의 차를 평균(위아래 하나씩 버림), 너무 벗어난 것과 적은 수는 버린다', () => {
    const beats = Array.from({ length: 12 }, (_, i) => 1000 + i * 750);
    const late = beats.map((b, i) => b + 30 + (i % 3) - 1);
    expect(calibrationOffset(beats, late)).toMatchObject({ mean: 30, used: 12 });
    expect(calibrationOffset(beats, [...beats.slice(0, 8).map((b) => b - 20), 99999])).toMatchObject({ mean: -20, used: 8 });
    expect(calibrationOffset(beats, beats.slice(0, 4))).toBeNull();
  });
});

describe('「결」 3단계 — 이야기 규칙(버티기·2단계·잠금·튜토리얼 도움)', () => {
  it('버티기: 받기·막기를 정한 수만큼 해내면 상대가 쓰러지지 않고도 이긴다', () => {
    const d = createDuel(data, 'dummy', 'x', 'duel', 'main', { survive: 2 });
    let hit = HIT;
    for (let i = 0; i < 2; i++) {
      advance(d, hit - 100);
      press(d, 'parry');
      advance(d, hit + 5);
      hit += 200 + 500 + 400;
    }
    expect(d.result).toBe('win');
    expect(d.foe.hp).toBe(100);
    expect(d.events.find((e) => e.type === 'win')).toMatchObject({ survived: true });
    expect(d.events.filter((e) => e.type === 'endure')).toHaveLength(2);
  });

  it('2단계: 체력이 문턱 아래로 처음 떨어지면 포효하고 공격 준비가 빨라지며 세진다', () => {
    const dd: DuelData = { ...data, foes: [{ ...data.foes[0], phase2: { at: 0.5, name: '불이 커진다', speed: 0.5, damageMul: 2, roar: 800 } }] };
    const d = createDuel(dd, 'dummy');
    d.foe.hp = 52;
    d.foe.state = 'stagger';
    d.foe.stateEnd = 5000;
    press(d, 'attack');
    advance(d, data.player.attack.duration + 5);
    expect(d.events.find((e) => e.type === 'phase')).toMatchObject({ name: '불이 커진다' });
    expect(d.phase).toBe(2);
    expect(d.foeDef.moves.swing.windup).toBe(200);
    expect(d.foeDef.moves.swing.damage).toBe(40);
    expect(d.foe.state).toBe('idle');
    expect(data.foes[0].moves.swing.windup).toBe(400); // 원본은 그대로
  });

  it('잠금: 쓸 수 있는 기술만 준비되고, 집중이 잠기면 게이지도 안 찬다', () => {
    const run = (opts: DuelOptions) => {
      const dd = single(swing({ damage: 10, posture: 1 }));
      const d = createDuel({ ...dd, foes: [{ ...dd.foes[0], hp: 1000, posture: 1000 }] }, 'dummy', 'x', 'duel', 'main', opts);
      let hit = HIT;
      for (let i = 0; i < 5; i++) {
        advance(d, hit - 30);
        press(d, 'parry');
        advance(d, hit + 5);
        hit += 1100;
      }
      return d;
    };
    expect(run({}).techReady).toBe('byeogun');
    expect(run({ techs: ['nakun'] }).techReady).toBe('nakun');
    const nf = run({ focus: false });
    expect(nf.focus).toBe(real.rules.focusStart);
    nf.focus = 100;
    expect(press(nf, 'focus')).toBe(false);
  });

  it('튜토리얼 도움: noLose면 체력이 1 밑으로 내려가지 않고, assistCue면 결이 처음부터 보인다', () => {
    const d = createDuel(single(swing({ damage: 500 })), 'dummy', 'x', 'duel', 'main', { noLose: true });
    advance(d, HIT + 5);
    expect(d.player.hp).toBe(1);
    expect(d.result).toBeNull();
    const slow = createDuel(single(swing({ windup: 1200 })), 'dummy', 'x', 'duel', 'main', { assistCue: true });
    advance(slow, 600);
    expect(cue(slow).visible).toBe(true);
  });

  it('이야기 데이터: 장마다 상대·화자·장면 그림이 있고, 튜토리얼 목표가 알맞다', () => {
    const s = storyRaw as unknown as { speakers: Record<string, { stand: string | null }>; chapters: { id: string; intro: { speaker?: string; cg?: string }[]; outro: { speaker?: string; cg?: string }[]; bouts?: { foe: string; intro?: { speaker?: string; cg?: string }[]; outro?: { speaker?: string; cg?: string }[] }[]; tutorial?: { goal: { type: string } }[] }[] };
    const lines = s.chapters.flatMap((c) => [...c.intro, ...c.outro, ...(c.bouts ?? []).flatMap((b) => [...(b.intro ?? []), ...(b.outro ?? [])])]);
    for (const l of lines) {
      if (l.speaker) expect(s.speakers[l.speaker], l.speaker).toBeTruthy();
      if (l.cg && l.cg !== 'none') expect(existsSync(`assets/sprites/${l.cg}`), l.cg).toBe(true);
    }
    for (const sp of Object.values(s.speakers)) if (sp.stand) expect(existsSync(`assets/sprites/${sp.stand}`), sp.stand).toBe(true);
    for (const c of s.chapters) for (const b of c.bouts ?? []) expect(real.foes.find((f) => f.id === b.foe), b.foe).toBeTruthy();
    const tut = s.chapters[0].tutorial!;
    expect(tut).toHaveLength(8);
    expect(tut[tut.length - 1].goal.type).toBe('win');
  });
});

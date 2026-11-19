// 「틈」 자동 플레이 봇(밸런스 측정용, GAME_DESIGN 12절): 지형을 피해 원을 그리며 싸우고, 레벨업은 정한 방식으로 고른다.
import { carryOf, choose, createChapter, freshCarry, step, WEAPONS, type Carry, type Choice, type Input, type State } from '../src/sim';
import { CELL, moveCircle, walkable } from '../src/terrain';

export type Picker = 'first' | 'smart';

function pickIndex(s: State, how: Picker): number {
  const c = s.pending!;
  if (how === 'first') return 0;
  const want = new Set(s.weapons.map((w) => WEAPONS.get(w.id)!.evolve?.with).filter(Boolean) as string[]);
  const score = (x: Choice) =>
    x.kind === 'weapon' ? (x.lv > 1 ? 30 + x.lv : s.weapons.length < 4 ? 25 : 8) : x.kind === 'passive' ? (want.has(x.id) ? 20 : ['might', 'haste', 'area', 'vigor'].includes(x.id) ? 12 : 6) : 1;
  let best = 0;
  c.forEach((x, i) => score(x) > score(c[best]) && (best = i));
  return best;
}

/** 16방향 중 위험이 적고 막히지 않은 쪽(가까운 무리·탄·예고 원은 밀어내고, 멀면 다가가고, 결 조각·물건은 끌린다) */
export function botInput(s: State): Input {
  const p = s.player;
  let best = { x: 0, y: 0, v: -Infinity };
  let close = 0;
  for (const f of s.foes) if ((p.x - f.x) ** 2 + (p.y - f.y) ** 2 < (34 + f.def.radius) ** 2) close++;
  const near = s.foes.reduce<{ d: number; x: number; y: number } | null>((b, f) => {
    const d = (f.x - p.x) ** 2 + (f.y - p.y) ** 2;
    return !b || d < b.d ? { d, x: f.x, y: f.y } : b;
  }, null);
  let target: { x: number; y: number } | null = null;
  for (const it of s.items) if ((it.x - p.x) ** 2 + (it.y - p.y) ** 2 < 700 * 700) target = it;
  if (!target) {
    let gd = 300 * 300;
    for (const g of s.gems) {
      const d = (g.x - p.x) ** 2 + (g.y - p.y) ** 2;
      if (d < gd) {
        gd = d;
        target = g;
      }
    }
  }
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const [nx, ny] = moveCircle(s.terrain, p.x, p.y, dx * 70, dy * 70, 13);
    const moved = Math.hypot(nx - p.x, ny - p.y);
    if (moved < 16) continue;
    let v = 0;
    // 트인 곳을 좋아한다(벽에 몰리지 않게): 둘레 5×5칸 중 걸을 수 있는 칸
    let open = 0;
    for (let gy = -2; gy <= 2; gy++) for (let gx = -2; gx <= 2; gx++) open += walkable(s.terrain, nx + gx * CELL, ny + gy * CELL) ? 1 : 0;
    v += open * 0.08;
    for (const f of s.foes) {
      const d = Math.hypot(nx - f.x, ny - f.y);
      const keep = (f.def.rank ? 110 : 62) + f.def.radius;
      if (d < keep) v -= ((keep - d) / keep) * (f.def.rank ? 6 : 2);
    }
    for (const sh of s.shots) if (!sh.weapon && Math.hypot(nx - sh.x, ny - sh.y + 20) < 60) v -= 3;
    for (const m of s.slams) if (Math.hypot(nx - m.x, ny - m.y) < m.r + 20) v -= 8;
    if (target) v += (Math.hypot(p.x - target.x, p.y - target.y) - Math.hypot(nx - target.x, ny - target.y)) * 0.05;
    else if (near && near.d > 120 * 120) v += (Math.sqrt(near.d) - Math.hypot(nx - near.x, ny - near.y)) * 0.03;
    // 막다른 곳으로 덜 가게: 조금 덜 움직인 쪽은 깎는다
    v -= (70 - moved) * 0.04;
    if (v > best.v) best = { x: dx, y: dy, v };
  }
  return { x: best.x, y: best.y, dash: close >= 2 || (p.hp < p.maxHp * 0.35 && close >= 1), ult: s.ult >= 100 };
}

export interface BotChapter {
  chapter: number;
  result: State['result'];
  t: number;
  level: number;
  kills: number;
  minHp: number;
  weapons: string;
}

/** 한 장을 돌린다 */
export function runChapter(chapter: number, seed: string, carry: Carry, how: Picker = 'smart', limit = 600): { s: State; minHp: number } {
  const s = createChapter(chapter, seed, carry);
  let minHp = s.player.hp;
  for (let i = 0; i < limit * 60 && !s.result; i++) {
    if (s.pending) choose(s, pickIndex(s, how));
    step(s, botInput(s));
    minHp = Math.min(minHp, s.player.hp);
    s.events.length = 0;
  }
  return { s, minHp };
}

/** 1장부터 이어서(지면 멈춘다) */
export function runStory(hero: string, seed: string, how: Picker = 'smart', upTo = 10): BotChapter[] {
  let carry = freshCarry(hero);
  const out: BotChapter[] = [];
  for (let c = 0; c < upTo; c++) {
    const { s, minHp } = runChapter(c, seed, carry, how);
    out.push({ chapter: c + 1, result: s.result, t: Math.round(s.t), level: s.level, kills: s.chapterKills, minHp: Math.round(minHp), weapons: s.weapons.map((w) => w.id + w.lv).join(',') });
    if (s.result !== 'clear') break;
    carry = carryOf(s);
  }
  return out;
}

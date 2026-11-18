// 「틈」 자동 플레이 봇(밸런스 측정용, GAME_DESIGN 9절): 그림자 무리를 피해 돌며 결 조각을 줍고, 레벨업은 정한 방식으로 고른다.
import { choose, createRun, step, WEAPONS, type Choice, type Input, type State } from '../src/sim';

export type Picker = 'first' | 'smart';

function pickIndex(s: State, how: Picker): number {
  const c = s.pending!;
  if (how === 'first') return 0;
  // 가진 무공 올리기 > 새 무공(4칸까지) > 각성 짝 심법 > 그 밖 심법
  const want = new Set(s.weapons.map((w) => WEAPONS.get(w.id)!.evolve?.with).filter(Boolean) as string[]);
  const score = (x: Choice) =>
    x.kind === 'weapon' ? (x.lv > 1 ? 30 + x.lv : s.weapons.length < 4 ? 25 : 8) : x.kind === 'passive' ? (want.has(x.id) ? 20 : ['might', 'haste', 'area', 'vigor'].includes(x.id) ? 12 : 6) : 0;
  let best = 0;
  c.forEach((x, i) => score(x) > score(c[best]) && (best = i));
  return best;
}

export function botInput(s: State): Input {
  const p = s.player;
  // 가까운 무리는 밀어내고(110 안), 멀면 다가가며(싸울 거리 유지), 둘레를 돈다(원을 그리며 결 조각을 줍는다)
  let rx = 0;
  let ry = 0;
  let close = 0;
  let nd = Infinity;
  let nx = 0;
  let ny = 0;
  for (const f of s.foes) {
    const dx = p.x - f.x;
    const dy = p.y - f.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < nd) {
      nd = d2;
      nx = f.x;
      ny = f.y;
    }
    const keep = (f.def.rank ? 70 : 62) + f.def.radius;
    if (d2 < keep * keep) {
      const d = Math.sqrt(d2) || 1;
      const w = (keep - d) / keep;
      rx += (dx / d) * w * (f.def.rank ? 3 : 1);
      ry += (dy / d) * w * (f.def.rank ? 3 : 1);
      if (d < 34 + f.def.radius) close++;
    }
  }
  for (const sh of s.shots) {
    if (sh.weapon) continue;
    const dx = p.x - sh.x;
    const dy = p.y - sh.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < 110 * 110) {
      const d = Math.sqrt(d2) || 1;
      rx += (dx / d) * 1.5;
      ry += (dy / d) * 1.5;
    }
  }
  let x = rx;
  let y = ry;
  const rm = Math.hypot(rx, ry);
  if (rm > 0.05) {
    // 밀리는 쪽 + 옆으로 돌기
    x = rx / rm + (-ry / rm) * 0.7;
    y = ry / rm + (rx / rm) * 0.7;
  } else {
    // 안전하면 결 조각·상자, 아니면 가장 가까운 적과 싸울 거리로
    let g: { x: number; y: number } | null = null;
    let gd = 260 * 260;
    for (const it of s.items) {
      const d = (it.x - p.x) ** 2 + (it.y - p.y) ** 2;
      if (d < 600 * 600) {
        gd = 0;
        g = it;
        break;
      }
    }
    if (!g)
      for (const gem of s.gems) {
        const d = (gem.x - p.x) ** 2 + (gem.y - p.y) ** 2;
        if (d < gd) {
          gd = d;
          g = gem;
        }
      }
    if (g) {
      x = g.x - p.x;
      y = g.y - p.y;
    } else if (nd < Infinity && nd > 100 * 100) {
      x = nx - p.x;
      y = ny - p.y;
    } else {
      x = Math.cos(s.t * 0.7);
      y = Math.sin(s.t * 0.7);
    }
  }
  return { x, y, dash: close >= 2 || (p.hp < p.maxHp * 0.35 && close >= 1), ult: s.ult >= 100 };
}

export interface BotRun extends State {
  /** 보스·정예를 쓰러뜨린 때(초) */
  marks: string[];
  minHp: number;
}
export function runBot(hero: string, seed: string, how: Picker = 'smart', limit = 2100): BotRun {
  const s = createRun(hero, seed) as BotRun;
  s.marks = [];
  s.minHp = s.player.hp;
  const steps = limit * 60;
  for (let i = 0; i < steps && !s.result; i++) {
    if (s.pending) choose(s, pickIndex(s, how));
    step(s, botInput(s));
    for (const e of s.events) if (e.type === 'kill' && e.rank) s.marks.push(`${e.foe}@${Math.round(s.t)}`);
    s.minHp = Math.min(s.minHp, s.player.hp);
    s.events.length = 0;
  }
  return s;
}

// 「틈」 지형(2026-11-18 사용자 "평평한 맵보다 지형적인 구조"): 장마다 가둔 판을 시드로 짓는다(GAME_DESIGN 4절).
// 칸 종류: 바닥 · 벽(막음, 적 탄도 막음) · 위험(용암·물·허공 — 걷는 것은 못 감, 탄은 지나감) · 느림 · 다리.
// 짓기 재료는 데이터(story.json chapters[].terrain)로 고르고, 짓고 나면 모든 바닥이 이어지게 끊긴 곳을 뚫는다.
import type { Rng } from '../../src/engine/rng';

export const CELL = 40;
export const enum T {
  Floor = 0,
  Wall = 1,
  Hazard = 2,
  Slow = 3,
  Bridge = 4,
}
export type TerrainStep =
  | { kind: 'blobs'; count: number; r: [number, number]; type?: 'wall' | 'hazard' | 'slow' }
  | { kind: 'river'; count: number; width: number; bridges: number; dir?: 'v' | 'h'; type?: 'hazard' | 'slow' }
  | { kind: 'bands'; rows: number; gaps: number; gap: number; thick?: number }
  | { kind: 'rooms'; size: number; door: number; keep?: number }
  | { kind: 'caves'; fill: number; steps: number }
  | { kind: 'islands'; count: number; r: [number, number]; bridge: number }
  | { kind: 'slow'; count: number; r: [number, number] }
  | { kind: 'pillars'; count: number; size?: number }
  /** 틈(2026-11-22 무한 모드 전용 맵): 갈래 치며 구불구불 뻗는 허공 균열 — 폭이 들쭉날쭉, 가끔 부서진 돌다리, 둘레는 오염된 땅(느림) */
  | { kind: 'cracks'; count: number; len: [number, number]; width: [number, number]; branch: number; bridgeEvery: number; scar: number };
export interface TerrainDef {
  w: number;
  h: number;
  steps: TerrainStep[];
  /** 깨지는 것(항아리·등불) 수 */
  props: number;
}
/** 구역 성(2026-11-25 zones.json): 가운데 칸 · 반 너비(칸) · 성문 쪽(0 위 · 1 오른쪽 · 2 아래 · 3 왼쪽) · 안쪽 지형 */
export interface ZoneStamp {
  cx: number;
  cy: number;
  half: number;
  gates: number[];
  gateWidth: number;
  inner: TerrainStep[];
}
export interface Terrain {
  w: number;
  h: number;
  cells: Uint8Array;
  /** 칸마다 구역 번호+1(0 = 구역 밖) — 성벽 칸도 그 구역 */
  zone: Uint8Array;
  /** 흐름장: 인물 칸까지 걸음 수(못 가면 -1) */
  dist: Int16Array;
  /** 깨지는 것이 놓일 자리(세계 좌표) */
  props: { x: number; y: number }[];
  /** 시작 자리(가운데) */
  start: { x: number; y: number };
}

const walkCell = (c: number) => c === T.Floor || c === T.Slow || c === T.Bridge;

export function buildTerrain(def: TerrainDef, rng: Rng, stamps: ZoneStamp[] = []): Terrain {
  const { w, h } = def;
  const cells = new Uint8Array(w * h);
  const zone = new Uint8Array(w * h);
  const at = (x: number, y: number) => y * w + x;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h;
  const disc = (cx: number, cy: number, r: number, v: number, only?: number) => {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        if (!inside(x, y)) continue;
        // 가장자리가 울퉁불퉁하게
        const rr = r * (0.8 + 0.4 * ((((x * 73856093) ^ (y * 19349663)) >>> 0) % 100) / 100);
        if ((x - cx) ** 2 + (y - cy) ** 2 <= rr * rr && (only === undefined || cells[at(x, y)] === only)) cells[at(x, y)] = v;
      }
  };
  const typeOf = (t?: string) => (t === 'hazard' ? T.Hazard : t === 'slow' ? T.Slow : T.Wall);
  for (const st of def.steps) {
    switch (st.kind) {
      case 'blobs':
      case 'slow': {
        const v = st.kind === 'slow' ? T.Slow : typeOf(st.type);
        for (let i = 0; i < st.count; i++) disc(rng.int(2, w - 3), rng.int(2, h - 3), st.r[0] + rng.next() * (st.r[1] - st.r[0]), v, T.Floor);
        break;
      }
      case 'pillars': {
        const s = st.size ?? 2;
        for (let i = 0; i < st.count; i++) {
          const x0 = rng.int(2, w - 2 - s);
          const y0 = rng.int(2, h - 2 - s);
          for (let y = y0; y < y0 + s; y++) for (let x = x0; x < x0 + s; x++) cells[at(x, y)] = T.Wall;
        }
        break;
      }
      case 'river': {
        const v = typeOf(st.type ?? 'hazard');
        for (let i = 0; i < st.count; i++) {
          const vert = (st.dir ?? (rng.next() < 0.5 ? 'v' : 'h')) === 'v';
          const len = vert ? h : w;
          let pos = Math.floor(((i + 1) / (st.count + 1)) * (vert ? w : h)) + rng.int(-4, 4);
          const path: number[] = [];
          for (let t = 0; t < len; t++) {
            pos += rng.next() < 0.3 ? rng.int(-1, 1) : 0;
            pos = Math.max(3, Math.min((vert ? w : h) - 4, pos));
            path.push(pos);
            for (let k = -Math.floor(st.width / 2); k <= Math.floor((st.width - 1) / 2); k++) {
              const x = vert ? pos + k : t;
              const y = vert ? t : pos + k;
              if (inside(x, y)) cells[at(x, y)] = v;
            }
          }
          // 다리: 강을 가로질러 3칸 폭
          for (let b = 0; b < st.bridges; b++) {
            const t0 = Math.floor(((b + 0.5) / st.bridges) * len) + rng.int(-3, 3);
            for (let t = Math.max(0, t0 - 1); t <= Math.min(len - 1, t0 + 1); t++)
              for (let k = -Math.floor(st.width / 2) - 1; k <= Math.floor((st.width - 1) / 2) + 1; k++) {
                const x = vert ? path[t] + k : t;
                const y = vert ? t : path[t] + k;
                if (inside(x, y) && cells[at(x, y)] === v) cells[at(x, y)] = v === T.Hazard ? T.Bridge : T.Floor;
              }
          }
        }
        break;
      }
      case 'bands': {
        const thick = st.thick ?? 2;
        for (let r = 1; r <= st.rows; r++) {
          const y0 = Math.floor((r / (st.rows + 1)) * h);
          const gaps = Array.from({ length: st.gaps }, () => rng.int(3, w - 4 - st.gap));
          for (let y = y0; y < y0 + thick; y++)
            for (let x = 0; x < w; x++) if (!gaps.some((g) => x >= g && x < g + st.gap)) cells[at(x, y)] = T.Wall;
        }
        break;
      }
      case 'rooms': {
        const s = st.size;
        for (let gy = 0; gy + s <= h; gy += s)
          for (let gx = 0; gx + s <= w; gx += s) {
            if (rng.next() < (st.keep ?? 0)) continue;
            for (let k = 0; k <= s; k++) {
              for (const [x, y] of [
                [gx + k, gy],
                [gx, gy + k],
              ]) {
                // 문: 벽마다 가끔 뚫린다
                if (inside(x, y) && rng.next() > st.door) cells[at(x, y)] = T.Wall;
              }
            }
            // 벽마다 문 하나는 꼭
            const dx = gx + rng.int(2, s - 2);
            const dy = gy + rng.int(2, s - 2);
            for (const [x, y] of [
              [dx, gy],
              [dx + 1, gy],
              [gx, dy],
              [gx, dy + 1],
            ])
              if (inside(x, y)) cells[at(x, y)] = T.Floor;
          }
        break;
      }
      case 'caves': {
        const tmp = new Uint8Array(w * h);
        for (let i = 0; i < w * h; i++) tmp[i] = rng.next() < st.fill ? 1 : 0;
        for (let s = 0; s < st.steps; s++) {
          const next = new Uint8Array(w * h);
          for (let y = 0; y < h; y++)
            for (let x = 0; x < w; x++) {
              let n = 0;
              for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) n += !inside(x + dx, y + dy) || tmp[at(x + dx, y + dy)] ? 1 : 0;
              next[at(x, y)] = n >= 5 || (tmp[at(x, y)] && n >= 4) ? 1 : 0;
            }
          tmp.set(next);
        }
        for (let i = 0; i < w * h; i++) if (tmp[i]) cells[i] = T.Wall;
        break;
      }
      case 'cracks': {
        const crack = (x0: number, y0: number, a0: number, len: number, wid: number, depth: number) => {
          let x = x0;
          let y = y0;
          let a = a0;
          let sinceBridge = 0;
          for (let t = 0; t < len; t++) {
            a += (rng.next() - 0.5) * 0.7;
            x += Math.cos(a);
            y += Math.sin(a);
            if (x < 3 || y < 3 || x > w - 4 || y > h - 4) break;
            // 끝으로 갈수록 가늘어진다
            const r = Math.max(0.5, (wid * (1 - t / len) + 0.6) / 2);
            sinceBridge++;
            const bridge = sinceBridge > st.bridgeEvery && rng.next() < 0.25;
            if (bridge) sinceBridge = 0;
            for (let yy = Math.floor(y - r - 1); yy <= Math.ceil(y + r + 1); yy++)
              for (let xx = Math.floor(x - r - 1); xx <= Math.ceil(x + r + 1); xx++) {
                if (!inside(xx, yy)) continue;
                const d = Math.hypot(xx - x, yy - y);
                const i = at(xx, yy);
                if (d <= r) cells[i] = bridge ? T.Bridge : cells[i] === T.Bridge ? T.Bridge : T.Hazard;
                else if (d <= r + 1.4 && cells[i] === T.Floor && rng.next() < st.scar) cells[i] = T.Slow;
              }
            if (depth < 2 && rng.next() < st.branch) crack(x, y, a + (rng.next() < 0.5 ? -1 : 1) * (0.6 + rng.next() * 0.6), Math.floor(len * (0.3 + rng.next() * 0.3)), Math.max(1, wid - 1), depth + 1);
          }
        };
        for (let i = 0; i < st.count; i++) crack(rng.int(4, w - 5), rng.int(4, h - 5), rng.next() * Math.PI * 2, rng.int(st.len[0], st.len[1]), st.width[0] + rng.next() * (st.width[1] - st.width[0]), 0);
        break;
      }
      case 'islands': {
        cells.fill(T.Hazard);
        const pts: [number, number][] = [[w / 2, h / 2]];
        for (let i = 0; i < st.count; i++) pts.push([rng.int(8, w - 9), rng.int(8, h - 9)]);
        for (const [x, y] of pts) disc(x, y, st.r[0] + rng.next() * (st.r[1] - st.r[0]), T.Floor);
        // 섬마다 가장 가까운 섬과 좁은 다리로
        for (let i = 1; i < pts.length; i++) {
          let j = 0;
          let best = Infinity;
          for (let k = 0; k < i; k++) {
            const d = (pts[k][0] - pts[i][0]) ** 2 + (pts[k][1] - pts[i][1]) ** 2;
            if (d < best) {
              best = d;
              j = k;
            }
          }
          carve(cells, w, h, pts[i][0], pts[i][1], pts[j][0], pts[j][1], st.bridge, T.Bridge);
        }
        break;
      }
    }
  }
  // 구역 성: 둘레 길(2칸)을 비우고 · 사각 성벽(2칸 두께) + 모서리 탑 · 성문 · 안쪽 지형(가운데 보스 자리는 비운다)
  stamps.forEach((z, zi) => {
    const H = z.half;
    for (let y = z.cy - H - 3; y <= z.cy + H + 3; y++)
      for (let x = z.cx - H - 3; x <= z.cx + H + 3; x++) {
        if (!inside(x, y)) continue;
        cells[at(x, y)] = T.Floor;
        if (Math.abs(x - z.cx) <= H + 1 && Math.abs(y - z.cy) <= H + 1) zone[at(x, y)] = zi + 1;
      }
    // 안쪽 지형(성벽 안 3칸 띄움)
    const lo = (c: number) => c - H + 3;
    const hi = (c: number) => c + H - 3;
    for (const st of z.inner) {
      const n = 'count' in st ? st.count : 0;
      for (let i = 0; i < n; i++) {
        const x = rng.int(lo(z.cx), hi(z.cx));
        const y = rng.int(lo(z.cy), hi(z.cy));
        if (Math.hypot(x - z.cx, y - z.cy) < 5) continue;
        if (st.kind === 'pillars') {
          const sz = st.size ?? 2;
          for (let yy = y; yy < y + sz; yy++) for (let xx = x; xx < x + sz; xx++) if (inside(xx, yy)) cells[at(xx, yy)] = T.Wall;
        } else if (st.kind === 'blobs' || st.kind === 'slow') {
          const r = st.r[0] + rng.next() * (st.r[1] - st.r[0]);
          disc(x, y, r, st.kind === 'slow' ? T.Slow : typeOf(st.type), T.Floor);
        }
      }
    }
    // 성벽(H-1..H) · 모서리 탑(3칸 사각, 바깥으로 1칸 튀어나옴)
    for (let y = z.cy - H; y <= z.cy + H; y++)
      for (let x = z.cx - H; x <= z.cx + H; x++) if (inside(x, y) && (Math.abs(x - z.cx) >= H - 1 || Math.abs(y - z.cy) >= H - 1)) cells[at(x, y)] = T.Wall;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const x = z.cx + sx * H + dx;
        const y = z.cy + sy * H + dy;
        if (inside(x, y)) cells[at(x, y)] = T.Wall;
      }
    // 성문: 변 가운데를 gateWidth칸 뚫고 바깥으로 길을 잇는다
    const gw = z.gateWidth;
    for (const g of z.gates) {
      const ox = g === 1 ? 1 : g === 3 ? -1 : 0;
      const oy = g === 2 ? 1 : g === 0 ? -1 : 0;
      for (let k = H - 3; k <= H + 6; k++)
        for (let j = -Math.floor(gw / 2); j <= Math.floor((gw - 1) / 2); j++) {
          const x = z.cx + ox * k + (oy ? j : 0);
          const y = z.cy + oy * k + (ox ? j : 0);
          if (!inside(x, y) || x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
          const c = cells[at(x, y)];
          cells[at(x, y)] = c === T.Hazard ? T.Bridge : T.Floor;
        }
    }
    // 보스 자리
    disc(z.cx, z.cy, 3.5, T.Floor);
  });
  // 가장자리는 벽, 가운데 시작 자리는 넓게 비운다
  for (let x = 0; x < w; x++) (cells[at(x, 0)] = T.Wall), (cells[at(x, h - 1)] = T.Wall);
  for (let y = 0; y < h; y++) (cells[at(0, y)] = T.Wall), (cells[at(w - 1, y)] = T.Wall);
  const cx = Math.floor(w / 2);
  const cy = Math.floor(h / 2);
  for (let y = cy - 4; y <= cy + 4; y++) for (let x = cx - 4; x <= cx + 4; x++) if (cells[at(x, y)] !== T.Bridge) cells[at(x, y)] = T.Floor;
  connect(cells, w, h, cx, cy);
  const t: Terrain = { w, h, cells, zone, dist: new Int16Array(w * h).fill(-1), props: [], start: { x: (cx + 0.5) * CELL, y: (cy + 0.5) * CELL } };
  // 깨지는 것: 시작 자리에서 조금 떨어진 바닥에
  for (let i = 0, tries = 0; i < def.props && tries < def.props * 30; tries++) {
    const x = rng.int(2, w - 3);
    const y = rng.int(2, h - 3);
    if (cells[at(x, y)] !== T.Floor || Math.abs(x - cx) + Math.abs(y - cy) < 8) continue;
    t.props.push({ x: (x + 0.5) * CELL, y: (y + 0.5) * CELL });
    i++;
  }
  return t;
}

/** 두 점 사이를 폭 width로 판다(다리·통로) */
function carve(cells: Uint8Array, w: number, h: number, x0: number, y0: number, x1: number, y1: number, width: number, v: number): void {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= n; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / n);
    const y = Math.round(y0 + ((y1 - y0) * i) / n);
    for (let dy = -Math.floor(width / 2); dy <= Math.floor((width - 1) / 2); dy++)
      for (let dx = -Math.floor(width / 2); dx <= Math.floor((width - 1) / 2); dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 1 || yy < 1 || xx >= w - 1 || yy >= h - 1) continue;
        const c = cells[yy * w + xx];
        if (c === T.Wall) cells[yy * w + xx] = T.Floor;
        else if (c === T.Hazard) cells[yy * w + xx] = v === T.Bridge ? T.Bridge : T.Floor;
      }
  }
}

/** 끊긴 바닥 무리를 가운데 무리에 잇는다(작은 무리는 메운다) */
function connect(cells: Uint8Array, w: number, h: number, cx: number, cy: number): void {
  // 2026-11-25 맵 3배: 끊긴 무리마다 가장 가까운 가운데 무리 칸을 사각 고리로 넓혀 찾아 한 번에 잇는다(예전엔 한 바퀴에 하나씩 — 큰 맵에서 느리고 덜 이어졌다)
  const region = new Int32Array(w * h);
  const q = new Int32Array(w * h);
  const flood = (start: number, id: number, out: number[] | null): void => {
    let n = 0;
    q[n++] = start;
    region[start] = id;
    while (n) {
      const i = q[--n];
      if (out) out.push(i);
      const x = i % w;
      const y = (i / w) | 0;
      if (x + 1 < w && region[i + 1] === -1 && walkCell(cells[i + 1])) (region[i + 1] = id), (q[n++] = i + 1);
      if (x > 0 && region[i - 1] === -1 && walkCell(cells[i - 1])) (region[i - 1] = id), (q[n++] = i - 1);
      if (y + 1 < h && region[i + w] === -1 && walkCell(cells[i + w])) (region[i + w] = id), (q[n++] = i + w);
      if (y > 0 && region[i - w] === -1 && walkCell(cells[i - w])) (region[i - w] = id), (q[n++] = i - w);
    }
  };
  const nearestMain = (ax: number, ay: number): number => {
    const maxR = Math.max(w, h);
    for (let rad = 1; rad < maxR; rad++) {
      for (let k = -rad; k <= rad; k++) {
        for (const [x, y] of [
          [ax + k, ay - rad],
          [ax + k, ay + rad],
          [ax - rad, ay + k],
          [ax + rad, ay + k],
        ]) {
          if (x < 0 || y < 0 || x >= w || y >= h) continue;
          if (region[y * w + x] === 0) return y * w + x;
        }
      }
    }
    return -1;
  };
  for (let pass = 0; pass < 6; pass++) {
    region.fill(-1);
    flood(cy * w + cx, 0, null);
    let id = 1;
    let fixed = 0;
    for (let i = 0; i < w * h; i++) {
      if (region[i] !== -1 || !walkCell(cells[i])) continue;
      const r: number[] = [];
      flood(i, id++, r);
      if (r.length < 12) {
        for (const k of r) cells[k] = T.Wall;
        continue;
      }
      const a = r[0];
      const best = nearestMain(a % w, (a / w) | 0);
      if (best < 0) continue;
      carve(cells, w, h, a % w, (a / w) | 0, best % w, (best / w) | 0, 3, T.Bridge);
      for (const k of r) region[k] = 0;
      fixed++;
    }
    if (!fixed) return;
  }
}

export const cellAt = (t: Terrain, x: number, y: number): number => {
  const cx = Math.floor(x / CELL);
  const cy = Math.floor(y / CELL);
  if (cx < 0 || cy < 0 || cx >= t.w || cy >= t.h) return T.Wall;
  return t.cells[cy * t.w + cx];
};
export const walkable = (t: Terrain, x: number, y: number): boolean => walkCell(cellAt(t, x, y));
/** 탄을 막는가(벽만 — 용암·물·허공 위로는 날아간다) */
export const blocksShot = (t: Terrain, x: number, y: number): boolean => cellAt(t, x, y) === T.Wall;

/** 원(반지름 r)이 걸을 수 있는 칸에만 있도록 x·y를 따로 옮긴다 */
export function moveCircle(t: Terrain, x: number, y: number, dx: number, dy: number, r: number): [number, number] {
  const ok = (px: number, py: number) => walkable(t, px - r, py) && walkable(t, px + r, py) && walkable(t, px, py - r * 0.6) && walkable(t, px, py + r * 0.4);
  let nx = x;
  let ny = y;
  if (ok(x + dx, y)) nx = x + dx;
  if (ok(nx, y + dy)) ny = y + dy;
  return [nx, ny];
}

/** 흐름장: 인물 칸에서 BFS(걸을 수 있는 칸만, 판 전체 — 보스가 지형 뒤에서 길을 잃지 않게) */
export function updateFlow(t: Terrain, px: number, py: number, maxSteps = 200): void {
  const { w, h, cells, dist } = t;
  dist.fill(-1);
  const sx = Math.floor(px / CELL);
  const sy = Math.floor(py / CELL);
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return;
  const q = new Int32Array(w * h);
  let head = 0;
  let tail = 0;
  q[tail++] = sy * w + sx;
  dist[sy * w + sx] = 0;
  while (head < tail) {
    const i = q[head++];
    const d = dist[i];
    if (d >= maxSteps) continue;
    const x = i % w;
    const y = (i / w) | 0;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (y > 0) push(i - w);
    if (y < h - 1) push(i + w);
    function push(j: number) {
      if (dist[j] !== -1 || !walkCell(cells[j])) return;
      dist[j] = d + 1;
      q[tail++] = j;
    }
  }
}

/** 이 자리에서 인물 쪽으로 가는 방향(흐름장). 모르면 null */
export function flowDir(t: Terrain, x: number, y: number): [number, number] | null {
  const cx = Math.floor(x / CELL);
  const cy = Math.floor(y / CELL);
  if (cx < 0 || cy < 0 || cx >= t.w || cy >= t.h) return null;
  const here = t.dist[cy * t.w + cx];
  if (here <= 0) return null;
  let best = here;
  let bx = 0;
  let by = 0;
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= t.w || ny >= t.h) continue;
      const d = t.dist[ny * t.w + nx];
      if (d < 0 || d >= best) continue;
      // 모서리를 비스듬히 자르지 않는다
      if (dx && dy && (t.dist[cy * t.w + nx] < 0 || t.dist[ny * t.w + cx] < 0)) continue;
      best = d;
      bx = dx;
      by = dy;
    }
  if (!bx && !by) return null;
  // 칸 가운데로 향한다
  const tx = (cx + bx + 0.5) * CELL - x;
  const ty = (cy + by + 0.5) * CELL - y;
  const l = Math.hypot(tx, ty) || 1;
  return [tx / l, ty / l];
}

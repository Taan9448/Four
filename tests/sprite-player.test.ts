// 스프라이트 재생기의 수명(2026-10-15 렉 줄이기): 멈추면 기다리던 쪽이 false로 풀리고, 화면에서 빠진 캔버스에는 더 그리지 않으며,
// 대기 동작은 화면 주사율마다 깨어나지 않는다. 화면에 붙기 전에 부른 재생은 붙을 때까지 기다린다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let pending: Promise<unknown> | null = null;
vi.mock('../src/render/assets', () => ({
  spriteSource: () => 'sprites',
  loadSprite: (id: string | null) => {
    if (!id) return Promise.resolve(null);
    const asset = {
      id,
      source: 'sprites',
      meta: { id, type: 'character-anim', frameW: 16, frameH: 16, frames: 4, fps: id.endsWith('idle') ? 6 : 12, loop: id.endsWith('idle'), anchor: [0.5, 1], events: { hit: 2 }, blend: 'normal', fallbackLevel: 1 },
      images: [{}, {}, {}, {}],
    };
    return pending ? pending.then(() => asset) : Promise.resolve(asset);
  },
}));
vi.mock('../src/render/idle', () => ({ isIdle: () => false }));

const { SpritePlayer } = await import('../src/render/sprite-player');

function fakeCanvas(connected = true) {
  const draws: number[] = [];
  const canvas = {
    isConnected: connected,
    width: 300,
    height: 150,
    getContext: () => ({
      clearRect: () => draws.push(performance.now()),
      drawImage: () => undefined,
      setTransform: () => undefined,
      fillRect: () => undefined,
      imageSmoothingEnabled: true,
      globalAlpha: 1,
      fillStyle: '',
    }),
  };
  return { canvas: canvas as unknown as HTMLCanvasElement & { isConnected: boolean }, draws };
}

let rafs = 0;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'] });
  rafs = 0;
  pending = null;
  // 노드에는 rAF가 없다: 16ms 타이머로 흉내 낸다(가짜 시계를 따른다)
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    rafs++;
    return setTimeout(() => cb(performance.now()), 16) as unknown as number;
  }) as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = ((id: number) => clearTimeout(id as unknown as ReturnType<typeof setTimeout>)) as typeof cancelAnimationFrame;
});
afterEach(() => {
  vi.useRealTimers();
});

describe('스프라이트 재생기 수명', () => {
  it('한 번 재생은 끝까지 가면 true, 이벤트는 그 프레임에서 한 번', async () => {
    const { canvas } = fakeCanvas();
    const events: string[] = [];
    const done = new SpritePlayer(canvas).play('wolf_attack', { onEvent: (e) => events.push(e) });
    await vi.advanceTimersByTimeAsync(1000);
    await expect(done).resolves.toBe(true);
    expect(events).toEqual(['hit']);
  });

  it('반복 재생을 멈추면 기다리던 Promise가 false로 풀리고 더 그리지 않는다', async () => {
    const { canvas, draws } = fakeCanvas();
    const player = new SpritePlayer(canvas);
    const loop = player.play('wolf_idle', { loop: true });
    await vi.advanceTimersByTimeAsync(1000);
    expect(draws.length).toBeGreaterThan(0);
    player.stop();
    await expect(loop).resolves.toBe(false);
    const n = draws.length;
    const r = rafs;
    await vi.advanceTimersByTimeAsync(3000);
    expect(draws.length).toBe(n);
    expect(rafs).toBe(r);
  });

  it('다른 재생에 밀린 재생은 false로 풀린다(밀린 쪽의 후속 대기 동작이 새 재생을 덮지 않게)', async () => {
    const { canvas } = fakeCanvas();
    const player = new SpritePlayer(canvas);
    const first = player.play('wolf_attack');
    await vi.advanceTimersByTimeAsync(50);
    const second = player.play('wolf_hit');
    await expect(first).resolves.toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(second).resolves.toBe(true);
  });

  it('그림을 받는 중에 멈춰도 false로 풀리고 나중에 받아져도 그리지 않는다', async () => {
    let release!: () => void;
    pending = new Promise<void>((r) => (release = r));
    const { canvas, draws } = fakeCanvas();
    const player = new SpritePlayer(canvas);
    const p = player.play('wolf_idle', { loop: true });
    player.stop();
    release();
    await expect(p).resolves.toBe(false);
    await vi.advanceTimersByTimeAsync(2000);
    expect(draws.length).toBe(0);
  });

  it('화면에 붙기 전에 부른 재생은 붙을 때까지 기다렸다가 그리고, 붙은 뒤 빠지면 끝낸다', async () => {
    const { canvas, draws } = fakeCanvas(false);
    const loop = new SpritePlayer(canvas).play('wolf_idle', { loop: true });
    await vi.advanceTimersByTimeAsync(500);
    // 아직 붙지 않았지만 끝나지 않았다(만들자마자 play를 부르는 기존 흐름)
    const settled = vi.fn();
    void loop.then(settled);
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).not.toHaveBeenCalled();
    canvas.isConnected = true;
    await vi.advanceTimersByTimeAsync(500);
    expect(draws.length).toBeGreaterThan(0);
    canvas.isConnected = false;
    await vi.advanceTimersByTimeAsync(500);
    await expect(loop).resolves.toBe(false);
    const n = draws.length;
    const r = rafs;
    await vi.advanceTimersByTimeAsync(3000);
    expect(draws.length).toBe(n);
    expect(rafs).toBe(r);
  });

  it('6fps 대기 동작은 1초에 화면 갱신(rAF)을 열 번 안팎만 요청한다(60번이 아니라)', async () => {
    const { canvas } = fakeCanvas();
    const player = new SpritePlayer(canvas);
    void player.play('wolf_idle', { loop: true });
    await vi.advanceTimersByTimeAsync(1000);
    const r = rafs;
    await vi.advanceTimersByTimeAsync(1000);
    expect(rafs - r).toBeLessThanOrEqual(10);
    expect(rafs - r).toBeGreaterThanOrEqual(5);
    player.stop();
  });
});

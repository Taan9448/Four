// <canvas> 기반 스프라이트 재생기. meta.json(프레임 수·fps·반복·이벤트 프레임)을 그대로 따른다.
// 프레임 번호는 1부터. 이벤트(예: hit: 4)는 그 프레임에 들어서는 순간 한 번 발생한다.
// 대체 단계 2(키 포즈 3장)는 virtualFrames 길이로 키 포즈 사이를 이동·크로스페이드로 보간한다.
import { isIdle } from './idle';
import { loadSprite, spriteSource, type SpriteAsset } from './assets';
import { fxNow } from './fx';

export interface PlayOptions {
  loop?: boolean;
  onEvent?: (name: string) => void;
}

export interface PlayerOptions {
  /** 에셋이 없을 때 그릴 임시 실루엣의 색 */
  fallbackColor?: string;
  /** 에셋이 없을 때 실루엣 모양 */
  fallbackShape?: 'humanoid' | 'beast' | 'boss' | 'object';
  facing?: 'left' | 'right';
}

export class SpritePlayer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private raf = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private token = 0;
  /** 지금 재생의 Promise를 끝내는 함수(true: 끝까지 재생, false: 멈춤·다른 재생에 밀림·화면에서 빠짐) */
  private settle: ((done: boolean) => void) | null = null;

  constructor(canvas: HTMLCanvasElement, private opts: PlayerOptions = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
  }

  /**
   * 애니메이션을 재생한다. 1회 재생은 끝나면 true로, 반복 재생은 멈출 때까지 기다린다.
   * 멈추거나(stop) 다른 재생에 밀리거나 화면에서 빠지면 false로 끝난다 — 영원히 기다리는 Promise를 남기지 않는다(2026-10-15)
   */
  async play(assetId: string | null, options: PlayOptions = {}): Promise<boolean> {
    this.cancel();
    const token = this.token;
    const asset = await loadSprite(assetId);
    if (token !== this.token) return false;
    if (!asset) {
      // 실제 그림이 있는 id인데 받기에 실패했으면(일시 오류) 옛 임시 실루엣으로 바꾸지 않고 지금 그림을 그대로 둔다(2026-10-14)
      if (assetId && spriteSource(assetId) === 'sprites' && this.canvas.width > 80) return false;
      return this.playFallback(token, options);
    }
    const { meta } = asset;
    if (this.canvas.width !== meta.frameW || this.canvas.height !== meta.frameH) {
      this.canvas.width = meta.frameW;
      this.canvas.height = meta.frameH;
    }
    // 픽셀 아트: 보간 없이 그린다(캔버스 크기를 바꾸면 컨텍스트 설정이 초기화되므로 매번 지정)
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0); // 대체 실루엣의 2배 변환이 남지 않게
    const loop = options.loop ?? meta.loop;
    const total = meta.fallbackLevel === 2 ? (meta.virtualFrames ?? meta.frames) : meta.frames;
    const frameMs = 1000 / meta.fps;

    return new Promise<boolean>((resolve) => {
      this.settle = resolve;
      // 연출 시계(fxNow): 타격 멈춤 동안 프레임이 멈춘다
      const start = fxNow();
      let lastFrame = 0;
      let attached = false;
      const tick = () => {
        this.raf = 0;
        if (token !== this.token) return;
        // 화면에서 빠진 캔버스는 끝낸다(다른 화면으로 넘어가도 돌던 동작이 쌓이지 않게).
        // 화면에 붙기 전에 부른 재생(만들자마자 play)은 붙을 때까지 기다린다
        if (this.canvas.isConnected) attached = true;
        else if (attached) return this.finish(false);
        // 창을 떠나 쉬는 중이면 반복 동작은 그리지 않고 드물게만 깨어난다(render/idle.ts)
        if (loop && isIdle()) return this.later(token, tick, 250);
        const elapsed = fxNow() - start;
        let n = Math.floor(elapsed / frameMs) + 1; // 1부터
        if (loop) n = ((n - 1) % total) + 1;
        if (n > total) {
          this.drawFrame(asset, total, total);
          return this.finish(true);
        }
        if (n !== lastFrame) {
          // 건너뛴 프레임의 이벤트도 빠짐없이 발생시킨다
          const from = lastFrame >= n ? 1 : lastFrame + 1;
          for (let f = from; f <= n; f++) {
            for (const [name, at] of Object.entries(meta.events)) if (at === f) options.onEvent?.(name);
          }
          if (token !== this.token) return; // 이벤트 처리 중에 멈췄다
          lastFrame = n;
          this.drawFrame(asset, n, total);
        }
        // 다음 프레임까지 화면 주사율마다 깨어나지 않는다: 대기 동작(6fps)은 초당 6번만(2026-10-15 렉 줄이기)
        const wait = start + Math.floor(elapsed / frameMs + 1) * frameMs - fxNow();
        if (wait > 24) this.later(token, tick, wait - 12);
        else this.raf = requestAnimationFrame(tick);
      };
      this.raf = requestAnimationFrame(tick);
    });
  }

  /** 지금 재생을 멈춘다. 기다리던 Promise는 false로 끝난다 */
  stop(): void {
    this.cancel();
  }

  /** 재생 중이면 끊고(토큰을 넘겨 늦게 오는 콜백을 무시) 기다리던 쪽에 false를 알린다 */
  private cancel(): void {
    this.token++;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.finish(false);
  }

  private finish(done: boolean): void {
    const settle = this.settle;
    this.settle = null;
    settle?.(done);
  }

  /** ms 뒤 다음 화면 갱신 때 fn(그사이 멈추면 아무것도 하지 않는다) */
  private later(token: number, fn: () => void, ms: number): void {
    this.timer = setTimeout(() => {
      this.timer = null;
      if (token === this.token) this.raf = requestAnimationFrame(fn);
    }, ms);
  }

  private drawFrame(asset: SpriteAsset, n: number, total: number): void {
    const { ctx } = this;
    const { meta, images } = asset;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (meta.fallbackLevel === 2 && images.length === 3 && total > 1) {
      // 키 포즈 3장(준비·타격·회복) 사이 보간
      const t = ((n - 1) / (total - 1)) * 2;
      const a = Math.min(1, Math.floor(t));
      const f = t - a;
      ctx.globalAlpha = 1 - f;
      ctx.drawImage(images[a], 0, 0);
      ctx.globalAlpha = f;
      ctx.drawImage(images[a + 1], Math.round(1 - f) * (meta.facing === 'left' ? -1 : 1), 0);
      ctx.globalAlpha = 1;
      return;
    }
    // 대체 단계 3(파츠 시트)의 관절 애니메이션은 이후 작업. 지금은 첫 파츠만 보여 준다.
    if (meta.fallbackLevel === 3) return void ctx.drawImage(images[0], 0, 0);
    ctx.drawImage(images[Math.min(images.length, n) - 1], 0, 0);
  }

  /** 에셋이 아예 없을 때: 80×80 프레임에 픽셀 실루엣(40 격자를 2배로, 32 격자 도형을 가운데·발 기준선 36에)을 그리고, 이벤트는 프레임 4에 해당하는 시점에 발생 */
  private playFallback(token: number, options: PlayOptions): Promise<boolean> {
    const w = 40, h = 40;
    this.canvas.width = w * 2;
    this.canvas.height = h * 2;
    const { ctx } = this;
    ctx.imageSmoothingEnabled = false;
    // 도형 좌표는 32 격자(발 29) 기준: 가로 +4, 세로 +7 옮겨 40 격자의 가운데·발 36에 둔다
    ctx.setTransform(2, 0, 0, 2, 8, 14);
    const color = this.opts.fallbackColor ?? '#666';
    const shape = this.opts.fallbackShape ?? 'humanoid';
    const draw = (bob: number) => {
      ctx.clearRect(-4, -7, w, h);
      ctx.fillStyle = '#1d2433';
      const feet = 29;
      const box = (x: number, y: number, bw: number, bh: number) => {
        ctx.fillStyle = '#1d2433';
        ctx.fillRect(x - 1, y - 1 + bob, bw + 2, bh + 2);
      };
      const fill = (x: number, y: number, bw: number, bh: number) => {
        ctx.fillStyle = color;
        ctx.fillRect(x, y + bob, bw, bh);
      };
      if (shape === 'object') {
        // 장작더미·둥치 같은 사물: 낮고 넓은 덩어리
        box(9, feet - 9, 14, 9);
        fill(9, feet - 9, 14, 9);
        ctx.fillStyle = '#1d2433';
        ctx.fillRect(12, feet - 7 + bob, 8, 1);
        ctx.fillRect(13, feet - 4 + bob, 6, 1);
      } else if (shape === 'beast') {
        box(7, feet - 10, 18, 6); box(21, feet - 13, 6, 5);
        fill(7, feet - 10, 18, 6); fill(21, feet - 13, 6, 5);
        fill(9, feet - 4, 2, 4); fill(21, feet - 4, 2, 4);
      } else {
        const tall = shape === 'boss' ? 26 : 22;
        const top = feet - tall;
        box(13, top, 6, 6); box(11, top + 6, 10, tall - 12); box(12, feet - 6, 8, 6);
        fill(13, top, 6, 6); fill(11, top + 6, 10, tall - 12); fill(12, feet - 6, 3, 6); fill(17, feet - 6, 3, 6);
      }
    };
    if (options.loop) {
      const start = fxNow();
      return new Promise<boolean>((resolve) => {
        this.settle = resolve;
        let attached = false;
        const tick = () => {
          this.raf = 0;
          if (token !== this.token) return;
          if (this.canvas.isConnected) attached = true;
          else if (attached) return this.finish(false);
          draw(Math.floor((fxNow() - start) / 500) % 2 === 0 ? 0 : -1);
          // 0.5초마다 한 번 움직이므로 그때만 깨어난다
          this.later(token, tick, 250);
        };
        this.raf = requestAnimationFrame(tick);
      });
    }
    draw(0);
    return new Promise<boolean>((resolve) => {
      this.settle = resolve;
      this.timer = setTimeout(() => {
        if (token !== this.token) return;
        options.onEvent?.('hit');
        options.onEvent?.('impact');
        this.timer = setTimeout(() => token === this.token && this.finish(true), 200);
      }, 250);
    });
  }
}

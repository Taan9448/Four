// <canvas> 기반 스프라이트 재생기. meta.json(프레임 수·fps·반복·이벤트 프레임)을 그대로 따른다.
// 프레임 번호는 1부터. 이벤트(예: hit: 4)는 그 프레임에 들어서는 순간 한 번 발생한다.
// 대체 단계 2(키 포즈 3장)는 virtualFrames 길이로 키 포즈 사이를 이동·크로스페이드로 보간한다.
import { loadSprite, type SpriteAsset } from './assets';

export interface PlayOptions {
  loop?: boolean;
  onEvent?: (name: string) => void;
}

export interface PlayerOptions {
  /** 에셋이 없을 때 그릴 임시 실루엣의 색과 이름 */
  fallbackColor?: string;
  fallbackLabel?: string;
  /** 에셋이 없을 때 실루엣 모양 */
  fallbackShape?: 'humanoid' | 'beast' | 'boss';
  facing?: 'left' | 'right';
}

export class SpritePlayer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private raf = 0;
  private token = 0;

  constructor(canvas: HTMLCanvasElement, private opts: PlayerOptions = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
  }

  /** 애니메이션을 재생한다. 1회 재생이면 끝날 때 resolve된다(반복이면 바로 resolve). */
  async play(assetId: string | null, options: PlayOptions = {}): Promise<void> {
    const token = ++this.token;
    cancelAnimationFrame(this.raf);
    const asset = await loadSprite(assetId);
    if (token !== this.token) return;
    if (!asset) {
      return this.playFallback(token, options);
    }
    const { meta } = asset;
    if (this.canvas.width !== meta.frameW || this.canvas.height !== meta.frameH) {
      this.canvas.width = meta.frameW;
      this.canvas.height = meta.frameH;
    }
    const loop = options.loop ?? meta.loop;
    const total = meta.fallbackLevel === 2 ? (meta.virtualFrames ?? meta.frames) : meta.frames;
    const frameMs = 1000 / meta.fps;

    return new Promise<void>((resolve) => {
      const start = performance.now();
      let lastFrame = 0;
      const tick = (now: number) => {
        if (token !== this.token) return resolve();
        const elapsed = now - start;
        let n = Math.floor(elapsed / frameMs) + 1; // 1부터
        if (loop) n = ((n - 1) % total) + 1;
        if (n > total) {
          this.drawFrame(asset, total, total);
          return resolve();
        }
        if (n !== lastFrame) {
          // 건너뛴 프레임의 이벤트도 빠짐없이 발생시킨다
          const from = lastFrame >= n ? 1 : lastFrame + 1;
          for (let f = from; f <= n; f++) {
            for (const [name, at] of Object.entries(meta.events)) if (at === f) options.onEvent?.(name);
          }
          lastFrame = n;
          this.drawFrame(asset, n, total);
        }
        this.raf = requestAnimationFrame(tick);
      };
      this.raf = requestAnimationFrame(tick);
    });
  }

  stop(): void {
    this.token++;
    cancelAnimationFrame(this.raf);
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
      ctx.drawImage(images[a + 1], (1 - f) * 6 * (meta.facing === 'left' ? -1 : 1), 0);
      ctx.globalAlpha = 1;
      return;
    }
    // 대체 단계 3(파츠 시트)의 관절 애니메이션은 이후 작업. 지금은 첫 파츠만 보여 준다.
    if (meta.fallbackLevel === 3) return void ctx.drawImage(images[0], 0, 0);
    ctx.drawImage(images[Math.min(images.length, n) - 1], 0, 0);
  }

  /** 에셋이 아예 없을 때: 이름이 적힌 실루엣을 그리고, 이벤트는 프레임 4에 해당하는 시점에 발생 */
  private playFallback(token: number, options: PlayOptions): Promise<void> {
    const w = 384, h = 512;
    this.canvas.width = w;
    this.canvas.height = h;
    const { ctx } = this;
    const color = this.opts.fallbackColor ?? '#666';
    const shape = this.opts.fallbackShape ?? 'humanoid';
    const draw = (bob: number) => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = color;
      const feet = h * 0.9;
      if (shape === 'beast') {
        ctx.beginPath();
        ctx.ellipse(w / 2, feet - 90 + bob, 120, 45, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const bh = shape === 'boss' ? h * 0.78 : h * 0.6;
        ctx.beginPath();
        ctx.roundRect(w / 2 - bh * 0.16, feet - bh + bob, bh * 0.32, bh, 40);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(w / 2, feet - bh - 10 + bob, bh * 0.12, 0, Math.PI * 2);
        ctx.fill();
      }
      if (this.opts.fallbackLabel) {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 34px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(this.opts.fallbackLabel, w / 2, feet - 20);
      }
    };
    if (options.loop) {
      const start = performance.now();
      const tick = (now: number) => {
        if (token !== this.token) return;
        draw(Math.sin((now - start) / 400) * 4);
        this.raf = requestAnimationFrame(tick);
      };
      this.raf = requestAnimationFrame(tick);
      return Promise.resolve();
    }
    draw(0);
    return new Promise((resolve) => {
      setTimeout(() => {
        if (token !== this.token) return;
        options.onEvent?.('hit');
        options.onEvent?.('impact');
      }, 250);
      setTimeout(resolve, 450);
    });
  }
}

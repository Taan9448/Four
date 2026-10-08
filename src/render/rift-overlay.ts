// 균열 오버레이: 전투 화면 하늘에 걸린 금. 균열 수치만큼 금이 커지고, 임계치 이상이면 금 속에서 붉은 빛이 깜빡인다
// ("그 안에서 이따금 붉은 빛이 깜빡였다").
// 실제 그림이 들어오면(fx_rift_cracks 6단계 · fx_rift_tear 찢어짐 · fx_rift_surge 폭주) 그것을 쓰고, 그 전에는 SVG 선으로 그린다.
import { createRng } from '../engine/rng';
import { frameUrl, spriteSource } from './assets';
import { SpritePlayer } from './sprite-player';

const NS = 'http://www.w3.org/2000/svg';
/** fx_rift_cracks의 단계 수(specs/assets/fx_rift_cracks.yaml) */
const STAGES = 6;

function crackPath(i: number): string {
  // 표시용이므로 고정 시드로 매번 같은 모양을 만든다
  const rng = createRng(`crack-${i}`);
  let x = rng.int(80, 920);
  let y = rng.int(20, 200);
  const pts = [`M${x} ${y}`];
  const steps = rng.int(5, 9);
  for (let s = 0; s < steps; s++) {
    x += rng.int(-60, 60);
    y += rng.int(18, 60);
    pts.push(`L${x} ${y}`);
  }
  return pts.join(' ');
}

const hasArt = (id: string) => spriteSource(id) === 'sprites';

export class RiftOverlay {
  readonly el: HTMLElement;
  private svg: SVGSVGElement;
  private cracks: SVGPathElement[] = [];
  /** 그림이 있을 때: 지금 단계의 금 한 장 */
  private stageImg: HTMLImageElement;
  /** 찢어짐·폭주 이펙트를 재생하는 자리 */
  private fxCanvas: HTMLCanvasElement;
  private value = 0;

  constructor(private max: number, private threshold: number) {
    this.svg = document.createElementNS(NS, 'svg');
    this.svg.setAttribute('class', 'rift-lines');
    this.svg.setAttribute('viewBox', '0 0 1000 600');
    this.svg.setAttribute('preserveAspectRatio', 'none');
    for (let i = 0; i < max; i++) {
      const glow = document.createElementNS(NS, 'path');
      glow.setAttribute('d', crackPath(i));
      glow.setAttribute('class', 'crack-glow');
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', crackPath(i));
      path.setAttribute('class', 'crack');
      const g = document.createElementNS(NS, 'g');
      g.append(glow, path);
      g.style.opacity = '0';
      this.svg.appendChild(g);
      this.cracks.push(path);
    }
    this.stageImg = document.createElement('img');
    this.stageImg.className = 'rift-stage';
    this.stageImg.alt = '';
    this.fxCanvas = document.createElement('canvas');
    this.fxCanvas.className = 'rift-fx';
    this.el = document.createElement('div');
    this.el.className = 'rift-overlay';
    this.el.append(this.svg, this.stageImg, this.fxCanvas);
  }

  update(value: number): void {
    const grew = value > this.value;
    this.value = value;
    const art = hasArt('fx_rift_cracks');
    this.el.classList.toggle('has-art', art);
    if (art) {
      const stage = value <= 0 ? 0 : Math.min(STAGES, Math.ceil((value / this.max) * STAGES));
      const url = stage ? frameUrl('fx_rift_cracks', stage, { realOnly: true }) : null;
      if (url) this.stageImg.src = url;
      this.stageImg.classList.toggle('on', !!url);
    } else {
      this.cracks.forEach((p, i) => {
        (p.parentNode as SVGGElement).style.opacity = i < value ? '1' : '0';
      });
    }
    this.el.classList.toggle('rift-hot', value >= this.threshold);
    this.el.classList.toggle('rift-max', value >= this.max);
    if (grew) void this.play('fx_rift_tear');
  }

  /** 균열 폭주: 틈이 터지는 이펙트(그림이 있을 때만) */
  surge(): Promise<void> {
    return this.play('fx_rift_surge');
  }

  private async play(id: string): Promise<void> {
    if (!hasArt(id)) return;
    this.fxCanvas.classList.add('on');
    await new SpritePlayer(this.fxCanvas).play(id);
    this.fxCanvas.classList.remove('on');
  }
}

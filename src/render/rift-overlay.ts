// 균열 오버레이: 전투 화면 위에 검은 금(SVG)을 그린다. 균열 수치만큼 금이 늘어나고,
// 임계치 이상이면 금 속에서 붉은 빛이 깜빡인다("그 안에서 이따금 붉은 빛이 깜빡였다").
import { createRng } from '../engine/rng';

const NS = 'http://www.w3.org/2000/svg';

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

export class RiftOverlay {
  readonly el: SVGSVGElement;
  private cracks: SVGPathElement[] = [];

  constructor(private max: number, private threshold: number) {
    this.el = document.createElementNS(NS, 'svg');
    this.el.setAttribute('class', 'rift-overlay');
    this.el.setAttribute('viewBox', '0 0 1000 600');
    this.el.setAttribute('preserveAspectRatio', 'none');
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
      this.el.appendChild(g);
      this.cracks.push(path);
    }
  }

  update(value: number): void {
    this.cracks.forEach((p, i) => {
      (p.parentNode as SVGGElement).style.opacity = i < value ? '1' : '0';
    });
    this.el.classList.toggle('rift-hot', value >= this.threshold);
    this.el.classList.toggle('rift-max', value >= this.max);
  }
}

// 타격 연출: 피격 흔들림, 떠오르는 숫자, 짧은 번쩍임, 알림. 물리·파티클 엔진은 쓰지 않는다.

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function restartAnimation(el: HTMLElement, cls: string, ms: number): void {
  el.classList.remove(cls);
  void el.offsetWidth; // 리플로우로 애니메이션 재시작
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), ms);
}

export function shake(el: HTMLElement, strong = false): void {
  restartAnimation(el, strong ? 'fx-shake-strong' : 'fx-shake', strong ? 420 : 260);
}

export function flash(el: HTMLElement, color: 'white' | 'red' | 'blue' = 'white'): void {
  restartAnimation(el, `fx-flash-${color}`, 220);
}

export type FloatKind = 'damage' | 'crit' | 'block' | 'heal' | 'status' | 'absorb' | 'rift';

/** layer 기준 좌표(x, y)에 숫자/글자를 띄운다 */
export function floatText(layer: HTMLElement, x: number, y: number, text: string, kind: FloatKind): void {
  const el = document.createElement('div');
  el.className = `float-text float-${kind}`;
  el.textContent = text;
  el.style.left = `${x + (Math.random() - 0.5) * 24}px`;
  el.style.top = `${y}px`;
  layer.appendChild(el);
  setTimeout(() => el.remove(), 1000);
}

/** 대상 요소 위에 숫자를 띄운다 */
export function floatOver(layer: HTMLElement, target: HTMLElement, text: string, kind: FloatKind): void {
  const lr = layer.getBoundingClientRect();
  const tr = target.getBoundingClientRect();
  floatText(layer, tr.left - lr.left + tr.width / 2, tr.top - lr.top + tr.height * 0.3, text, kind);
}

export function toast(container: HTMLElement, text: string, kind: 'support' | 'info' | 'danger' = 'info'): void {
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.textContent = text;
  container.appendChild(el);
  setTimeout(() => el.classList.add('toast-out'), 1600);
  setTimeout(() => el.remove(), 2100);
}

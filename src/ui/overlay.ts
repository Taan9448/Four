// 화면 위에 뜨는 창(덱 보기·설정·확인). 바깥을 누르거나 Esc를 누르면 닫힌다.
import { h } from './dom';

export interface Overlay {
  el: HTMLElement;
  close: () => void;
}

export function openOverlay(title: string, body: HTMLElement, opts: { onClose?: () => void; wide?: boolean } = {}): Overlay {
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  };
  const close = () => {
    document.removeEventListener('keydown', onKey, true);
    el.remove();
    opts.onClose?.();
  };
  const panel = h(
    'div',
    { class: `overlay-panel${opts.wide ? ' wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('header', { class: 'overlay-head' }, h('h2', {}, title), h('button', { class: 'btn overlay-close', 'aria-label': '닫기', onclick: () => close() }, '✕')),
    h('div', { class: 'overlay-body' }, body),
  );
  const el = h('div', { class: 'overlay', onclick: (e: Event) => e.target === el && close() }, panel);
  document.addEventListener('keydown', onKey, true);
  document.body.appendChild(el);
  return { el, close };
}

/** 예/아니오 확인 창 */
export function confirmDialog(title: string, message: string, okLabel: string): Promise<boolean> {
  return new Promise((resolve) => {
    let answer = false;
    const ov = openOverlay(
      title,
      h(
        'div',
        { class: 'confirm' },
        h('p', {}, message),
        h(
          'div',
          { class: 'confirm-actions' },
          h('button', { class: 'btn', onclick: () => ov.close() }, '취소'),
          h('button', { class: 'btn btn-danger', onclick: () => ((answer = true), ov.close()) }, okLabel),
        ),
      ),
      { onClose: () => resolve(answer) },
    );
  });
}

// 도감 그림 모음(2026-11-15 사용자 요청 "스토리 라인에서 나오는 일러스트를 모아서 보는 기능"):
// 이야기 장면에 깔리는 그림(줄의 art — 「결」 그림, 없으면 「천외귀환」 cg)을 장 순서대로 모은다.
// 열림: 장면에서 본 그림(save.gallery) 또는 그 장을 (어느 칸에서든) 마쳤으면. 누르면 크게 보기(←·→ 넘기기, Esc 닫기)
import storyRaw from '../data/story.json';
import { button, el, realArt } from './dom';
import { clearedAnywhere } from './progress';
import type { SaveData } from './save';

interface Line {
  text?: string;
  art?: string;
  cg?: string;
}
interface Chapter {
  id: string;
  title: string;
  subtitle: string;
}

export interface ArtEntry {
  id: string;
  chapter: string;
  /** 장 이름(「1장 귀곡애」) */
  chapterName: string;
  /** 그림이 처음 깔리는 줄의 글 — 크게 볼 때 아래에 */
  caption: string;
}

/** 이야기에 나오는 그림 목록(장 순서, 같은 그림은 처음 한 번). 줄에 art가 있으면 그것이 보이고 cg는 대체라 art만 센다 */
export function storyArt(story = storyRaw as unknown as { chapters: (Chapter & Record<string, unknown>)[] }): ArtEntry[] {
  const out: ArtEntry[] = [];
  const have = new Set<string>();
  const walk = (o: unknown, ch: Chapter): void => {
    if (Array.isArray(o)) return o.forEach((x) => walk(x, ch));
    if (!o || typeof o !== 'object') return;
    const line = o as Line;
    const id = line.art || (line.cg && line.cg !== 'none' ? line.cg : '');
    if (id && !have.has(id)) {
      have.add(id);
      out.push({ id, chapter: ch.id, chapterName: `${ch.title} ${ch.subtitle}`, caption: (line.text ?? '').replace(/\{[a-z]+\}/g, '').trim() });
    }
    for (const v of Object.values(o)) walk(v, ch);
  };
  for (const ch of story.chapters) walk(ch, ch);
  return out;
}

export const artOpen = (save: SaveData, a: ArtEntry): boolean => save.gallery.includes(a.id) || clearedAnywhere(save, a.chapter);

/** 도감의 「이야기 그림」 칸: 장마다 묶은 작은 그림들. 열리지 않은 그림은 먹 칸에 자물쇠 */
export function gallerySection(save: SaveData): HTMLElement[] {
  const all = storyArt().filter((a) => realArt(a.id));
  if (!all.length) return [];
  const open = all.filter((a) => artOpen(save, a));
  const groups: HTMLElement[] = [];
  let cur = '';
  let grid: HTMLElement | null = null;
  for (const a of all) {
    if (a.chapter !== cur) {
      cur = a.chapter;
      grid = el('div', { class: 'gallery-grid' });
      groups.push(el('h3', { class: 'gallery-chapter' }, a.chapterName), grid);
    }
    const ok = open.includes(a);
    grid!.append(
      ok
        ? button([el('img', { src: realArt(a.id)!, alt: '', loading: 'lazy' })], 'gallery-thumb', () => viewer(open, open.indexOf(a)), { 'aria-label': `${a.chapterName} 그림 크게 보기`, title: a.caption })
        : el('div', { class: 'gallery-thumb locked', title: '이야기에서 이 장면을 보면 열린다' }, el('span', {}, '?')),
    );
  }
  return [el('h2', {}, '이야기 그림', el('small', { class: 'gallery-count' }, ` ${open.length} / ${all.length}`)), el('div', { class: 'gallery' }, ...groups)];
}

/** 크게 보기: ←·→(또는 양옆 단추)로 넘기고, Esc·바깥 누르기·닫기로 닫는다 */
function viewer(list: ArtEntry[], start: number): void {
  let i = start;
  const img = el('img', { class: 'gv-img', alt: '' });
  const cap = el('p', { class: 'gv-cap' });
  const where = el('p', { class: 'gv-where' });
  const show = () => {
    const a = list[i];
    img.src = realArt(a.id) ?? '';
    where.textContent = `${a.chapterName} · ${i + 1} / ${list.length}`;
    cap.textContent = a.caption;
  };
  const step = (d: number) => {
    i = (i + d + list.length) % list.length;
    show();
  };
  const close = () => {
    window.removeEventListener('keydown', onKey, true);
    root.remove();
  };
  const onKey = (e: KeyboardEvent) => {
    // 화면의 키(Esc = 로비로)보다 먼저 받는다
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') step(1);
    else return;
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  const root = el(
    'div',
    { class: 'gallery-viewer', role: 'dialog', 'aria-label': '이야기 그림' },
    el('figure', {}, img, el('figcaption', {}, where, cap)),
    button('‹', 'gv-nav prev', () => step(-1), { 'aria-label': '앞 그림' }),
    button('›', 'gv-nav next', () => step(1), { 'aria-label': '다음 그림' }),
    button('닫기', 'btn small gv-close', close),
  );
  root.addEventListener('click', (e) => e.target === root && close());
  window.addEventListener('keydown', onKey, true);
  document.body.append(root);
  show();
  (root.querySelector('.gv-close') as HTMLButtonElement).focus();
}

// 비주얼 노벨 장면: 좌우 반신 그림 + 아래 대화창. 클릭·스페이스·엔터로 다음 줄, 건너뛰기, 지난 대사 기록.
// 표정은 적지 않으면 유지되고(src/engine/scene.ts), 같은 인물의 표정이 바뀔 때는 겹쳐서 천천히 바꾼다.
import type { GameData } from '../engine/data';
import { sceneFaces } from '../engine/scene';
import type { Face, SceneDef, SceneLine } from '../engine/schema';
import { speakerInfo } from '../engine/text';
import { loadPortrait } from '../render/portrait';
import { frameUrl } from '../render/assets';
import { h } from './dom';

type Side = 'left' | 'right';

/** 표정 교차 페이드 시간(style.css .vn-face-in과 같게) */
const FACE_FADE_MS = 450;

interface Slot {
  el: HTMLElement;
  speaker: string | null;
  face: Face | null;
}

export function sceneView(data: GameData, scene: SceneDef, onDone: () => void): HTMLElement {
  const slots: Record<Side, Slot> = {
    left: { el: h('div', { class: 'vn-slot vn-left' }), speaker: null, face: null },
    right: { el: h('div', { class: 'vn-slot vn-right' }), speaker: null, face: null },
  };
  const nameEl = h('div', { class: 'vn-name' });
  const textEl = h('div', { class: 'vn-text' });
  const box = h('div', { class: 'vn-box' }, nameEl, textEl, h('div', { class: 'vn-next' }, '▼'));
  const logEl = h('div', { class: 'vn-log hidden' });
  // 장면 일러스트(CG): 실제 그림이 있을 때만 화면 전체에 깔고, 그동안 반신 그림은 숨긴다
  const cgEl = h('div', { class: 'vn-cg' });
  let index = -1;
  let finished = false;

  const faces = sceneFaces(scene);
  const sideOf = (l: SceneLine): Side => l.side ?? (l.speaker === 'haun' ? 'left' : 'right');
  const nameOf = (l: SceneLine) => l.name ?? (l.speaker ? speakerInfo(data, l.speaker).name : '');

  const showPortrait = async (slot: Slot, speaker: string, face: Face) => {
    if (slot.speaker === speaker && slot.face === face) return;
    const sameSpeaker = slot.speaker === speaker;
    slot.speaker = speaker;
    slot.face = face;
    const info = speakerInfo(data, speaker);
    const img = await loadPortrait(speaker, face);
    if (slot.speaker !== speaker || slot.face !== face) return; // 그 사이 다른 줄로 넘어감
    const el = img
      ? h('img', { class: 'vn-portrait', src: img.src, alt: info.name })
      : h('div', { class: 'vn-portrait vn-fallback', style: `--owner:${info.color}` }, info.name);
    if (!sameSpeaker) return void slot.el.replaceChildren(el); // 새 인물: 짧게 올라오며 등장
    // 같은 인물의 표정 변화: 새 그림을 위에 겹쳐 서서히 드러내고, 옛 그림은 그 뒤에 치운다
    const old = [...slot.el.children];
    el.classList.add('vn-face-in');
    slot.el.append(el);
    setTimeout(() => old.forEach((o) => o.remove()), FACE_FADE_MS);
  };

  const finish = () => {
    if (finished) return;
    finished = true;
    document.removeEventListener('keydown', onKey);
    onDone();
  };

  const next = () => {
    if (!logEl.classList.contains('hidden')) return void logEl.classList.add('hidden');
    index += 1;
    if (index >= scene.lines.length) return finish();
    const line = scene.lines[index];
    const side = sideOf(line);
    if (line.cg !== undefined) {
      // "none"이거나 아직 실제 그림이 없으면 걷고 반신 그림으로 돌아간다
      const url = line.cg === 'none' ? null : frameUrl(line.cg, 1, { realOnly: true });
      if (url) cgEl.style.backgroundImage = `url(${url})`;
      root.classList.toggle('has-cg', !!url);
    }
    if (line.effect) {
      root.classList.remove('vn-flash', 'vn-shake', 'vn-fade');
      void root.offsetWidth;
      root.classList.add(`vn-${line.effect}`);
    }
    if (line.speaker) void showPortrait(slots[side], line.speaker, faces[index] ?? 'neutral');
    for (const s of ['left', 'right'] as Side[]) slots[s].el.classList.toggle('dim', !line.speaker || s !== side);
    nameEl.textContent = nameOf(line);
    nameEl.classList.toggle('hidden', !line.speaker);
    if (line.speaker) nameEl.style.setProperty('--owner', speakerInfo(data, line.speaker).color);
    textEl.textContent = line.text;
    textEl.classList.toggle('narration', !line.speaker);
    box.classList.remove('vn-in');
    void box.offsetWidth; // 줄마다 짧은 등장 효과를 다시 건다
    box.classList.add('vn-in');
    logEl.append(h('p', {}, line.speaker ? h('b', {}, `${nameOf(line)}  `) : null, line.text));
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      next();
    } else if (e.key === 'Escape') finish();
  };
  document.addEventListener('keydown', onKey);

  const stop = (fn: () => void) => (e: Event) => {
    e.stopPropagation();
    fn();
  };
  const root = h(
    'section',
    { class: `screen scene-screen world-${scene.world ?? 'murim'}`, onclick: () => next() },
    cgEl,
    slots.left.el,
    slots.right.el,
    box,
    h(
      'div',
      { class: 'vn-controls' },
      h('button', { class: 'btn', onclick: stop(() => logEl.classList.toggle('hidden')) }, '기록'),
      h('button', { class: 'btn', onclick: stop(finish) }, '건너뛰기'),
    ),
    logEl,
  );
  next();
  return root;
}

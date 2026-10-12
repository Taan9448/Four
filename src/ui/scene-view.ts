// 비주얼 노벨 장면: 좌우 반신 그림 + 아래 대화창. 클릭·스페이스·엔터로 다음 줄, 건너뛰기, 지난 대사 기록.
// 표정은 적지 않으면 유지되고(src/engine/scene.ts), 같은 인물의 표정이 바뀔 때는 겹쳐서 천천히 바꾼다.
import type { GameData } from '../engine/data';
import { autoAdvanceDelay, sceneFaces, TEXT_MS_PER_CHAR } from '../engine/scene';
import { settings, TEXT_SPEEDS, update } from './settings';
import type { Face, SceneDef, SceneLine } from '../engine/schema';
import { speakerInfo } from '../engine/text';
import { loadPortrait, standingFor } from '../render/portrait';
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

/** background: 장면 뒤 배경 에셋 id(장면의 background가 우선). 실제 그림이 있을 때만 어둡게 깐다 */
/**
 * 글자 속도·자동 진행·본 장면 건너뛰기(2026-10-12 B3): settings.textSpeed · autoAdvance · skipSeenScenes.
 * 이미 본 장면을 자동으로 넘기는 것은 부르는 쪽이 engine/scene.ts sceneSkip으로 정한다(건너뛰기 단추는 장면 화면의 기본 '건너뛰기' 하나 — 2026-10-12 사용자 결정)
 */
export function sceneView(
  data: GameData,
  scene: SceneDef,
  onDone: () => void,
  opts: { background?: string; flags?: readonly string[] } = {},
): HTMLElement {
  const bgUrl = frameUrl(scene.background ?? opts.background, 1, { realOnly: true });
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
  const titleEl = h('div', { class: 'vn-title' });
  let index = -1;
  let finished = false;
  // 글자 찍기: typing 중에 누르면 그 줄을 다 보이고, 다 보인 뒤 누르면 다음 줄
  let typing: number | null = null;
  let autoTimer: number | null = null;
  const clearTimers = () => {
    if (typing !== null) clearInterval(typing);
    if (autoTimer !== null) clearTimeout(autoTimer);
    typing = autoTimer = null;
  };
  // 자동 진행: 줄이 다 보이면 잠시 뒤 다음 줄. 마지막 줄(뒤에 선택지·전투가 이어진다)에서는 기다린다
  const scheduleAuto = () => {
    if (!settings.autoAdvance || finished || index >= scene.lines.length - 1) return;
    autoTimer = window.setTimeout(() => ((autoTimer = null), next()), autoAdvanceDelay(scene.lines[index].text));
  };
  const showText = (text: string) => {
    clearTimers();
    const ms = TEXT_MS_PER_CHAR[settings.textSpeed];
    const chars = [...text];
    if (!ms || chars.length < 2) {
      textEl.textContent = text;
      return scheduleAuto();
    }
    let n = 0;
    textEl.textContent = '';
    typing = window.setInterval(() => {
      n += 1;
      textEl.textContent = chars.slice(0, n).join('');
      if (n >= chars.length) {
        clearInterval(typing!);
        typing = null;
        scheduleAuto();
      }
    }, ms);
  };

  const faces = sceneFaces(scene);
  const sideOf = (l: SceneLine): Side => l.side ?? (l.speaker === 'haun' ? 'left' : 'right');
  const nameOf = (l: SceneLine) => l.name ?? (l.speaker ? speakerInfo(data, l.speaker).name : '');

  const showPortrait = async (slot: Slot, speaker: string, face: Face) => {
    if (slot.speaker === speaker && slot.face === face) return;
    const sameSpeaker = slot.speaker === speaker;
    slot.speaker = speaker;
    slot.face = face;
    const info = speakerInfo(data, speaker);
    const img = await loadPortrait(speaker, face, standingFor(data, speaker, opts.flags));
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
    clearTimers();
    document.removeEventListener('keydown', onKey);
    onDone();
  };

  const next = () => {
    if (!logEl.classList.contains('hidden')) return void logEl.classList.add('hidden');
    if (typing !== null) {
      // 찍는 중: 이 줄을 다 보인다
      clearTimers();
      textEl.textContent = scene.lines[index].text;
      return scheduleAuto();
    }
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
      root.classList.remove('vn-flash', 'vn-shake', 'vn-fade', 'vn-glow', 'vn-rift');
      void root.offsetWidth;
      if (line.effect !== 'title') root.classList.add(`vn-${line.effect}`);
    }
    // 제목 카드: 대사창을 숨기고 화면 가운데 큰 글씨로(다음 줄에서 걷힌다)
    root.classList.toggle('vn-titling', line.effect === 'title');
    titleEl.textContent = line.effect === 'title' ? line.text : '';
    if (line.effect === 'title') {
      titleEl.classList.remove('in');
      void titleEl.offsetWidth;
      titleEl.classList.add('in');
    }
    if (line.speaker) void showPortrait(slots[side], line.speaker, faces[index] ?? 'neutral');
    for (const s of ['left', 'right'] as Side[]) slots[s].el.classList.toggle('dim', !line.speaker || s !== side);
    nameEl.textContent = nameOf(line);
    nameEl.classList.toggle('hidden', !line.speaker);
    if (line.speaker) nameEl.style.setProperty('--owner', speakerInfo(data, line.speaker).color);
    showText(line.text);
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
  // 화면 아무 곳이나 누르면 자동 진행은 꺼진다(그 누름은 다음 줄로)
  const tap = () => {
    if (settings.autoAdvance) {
      update({ autoAdvance: false });
      syncAuto();
    }
    next();
  };
  const autoBtn = h('button', { class: 'btn', 'aria-pressed': 'false' }, '자동');
  const speedBtn = h('button', { class: 'btn' });
  const syncAuto = () => {
    autoBtn.setAttribute('aria-pressed', String(settings.autoAdvance));
    autoBtn.classList.toggle('on', settings.autoAdvance);
    speedBtn.textContent = `글자 ${TEXT_SPEEDS.find((t) => t.value === settings.textSpeed)?.label ?? '보통'}`;
  };
  autoBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    update({ autoAdvance: !settings.autoAdvance });
    syncAuto();
    if (settings.autoAdvance && typing === null && autoTimer === null) scheduleAuto();
    else if (!settings.autoAdvance && autoTimer !== null) clearTimeout(autoTimer), (autoTimer = null);
  });
  speedBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    update({ textSpeed: settings.textSpeed === 3 ? 1 : ((settings.textSpeed + 1) as 2 | 3) });
    syncAuto();
  });
  syncAuto();
  document.addEventListener('keydown', onKey);

  const stop = (fn: () => void) => (e: Event) => {
    e.stopPropagation();
    fn();
  };
  const root = h(
    'section',
    { class: `screen scene-screen world-${scene.world ?? 'murim'}${bgUrl ? ' has-bg' : ''}`, onclick: tap },
    h('div', { class: 'vn-bg', style: bgUrl ? `background-image:url("${bgUrl}")` : '' }),
    cgEl,
    h('div', { class: 'vn-rift-line' }),
    slots.left.el,
    slots.right.el,
    box,
    titleEl,
    h(
      'div',
      { class: 'vn-controls' },
      speedBtn,
      autoBtn,
      h('button', { class: 'btn', onclick: stop(() => logEl.classList.toggle('hidden')) }, '기록'),
      h('button', { class: 'btn', onclick: stop(finish) }, '건너뛰기'),
    ),
    logEl,
  );
  next();
  return root;
}

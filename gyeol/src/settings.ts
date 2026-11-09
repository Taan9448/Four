// 「결」 설정 창(2026-11-09, 7-4절 8): 소리·흔들림·번쩍임·판정 보정·화면 품질. 바꾸는 즉시 저장하고 onChange로 반영한다.
import { loadSave, writeSave, type Quality, type Settings } from './save';

function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  e.append(...kids);
  return e;
}

const QUALITY: [Quality, string][] = [
  ['auto', '자동(느려지면 낮춤)'],
  ['high', '높음'],
  ['normal', '보통'],
  ['low', '낮음'],
];

export function openSettings(onChange: () => void): void {
  document.querySelector('.settings-panel')?.remove();
  const save = loadSave();
  const st = save.settings;
  const commit = (patch: Partial<Settings>) => {
    Object.assign(st, patch);
    writeSave(save);
    onChange();
  };
  const slider = (label: string, key: 'master' | 'bgm' | 'sfx' | 'shake') => {
    const out = h('output', {}, `${Math.round(st[key] * 100)}`);
    const input = h('input', { type: 'range', min: '0', max: '100', step: '5', value: String(Math.round(st[key] * 100)), 'aria-label': label });
    input.addEventListener('input', () => {
      out.textContent = input.value;
      commit({ [key]: Number(input.value) / 100 } as Partial<Settings>);
    });
    return h('label', { class: 'row' }, h('span', {}, label), input, out);
  };
  const offsetOut = h('output', {}, `${st.inputOffset > 0 ? '+' : ''}${st.inputOffset}ms`);
  const offset = h('input', { type: 'range', min: '-120', max: '120', step: '5', value: String(st.inputOffset), 'aria-label': '판정 보정' });
  offset.addEventListener('input', () => {
    const v = Number(offset.value);
    offsetOut.textContent = `${v > 0 ? '+' : ''}${v}ms`;
    commit({ inputOffset: v });
  });
  const flash = h('input', { type: 'checkbox', 'aria-label': '번쩍임 줄이기' });
  flash.checked = st.reduceFlash;
  flash.addEventListener('change', () => commit({ reduceFlash: flash.checked }));
  const quality = h('select', { 'aria-label': '화면 품질' }, ...QUALITY.map(([v, t]) => h('option', { value: v }, t)));
  quality.value = st.quality;
  quality.addEventListener('change', () => commit({ quality: quality.value as Quality }));
  const close = h('button', { class: 'btn primary', type: 'button' }, '닫기');
  const panel = h(
    'div',
    { class: 'settings-panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': '설정' },
    h(
      'div',
      { class: 'settings-box' },
      h('h2', {}, '설정'),
      slider('전체 소리', 'master'),
      slider('배경 음악', 'bgm'),
      slider('효과음', 'sfx'),
      slider('화면 흔들림', 'shake'),
      h('label', { class: 'row' }, h('span', {}, '번쩍임 줄이기'), flash, h('output', {}, '')),
      h('label', { class: 'row' }, h('span', {}, '판정 보정'), offset, offsetOut),
      h('p', { class: 'note' }, '받기가 늘 늦게 판정되면 +로 올린다(누른 시각을 그만큼 앞당긴다). 수련장에서 박자에 맞춰 재는 기능은 다음 단계에 들어간다.'),
      h('label', { class: 'row' }, h('span', {}, '화면 품질'), quality, h('output', {}, '')),
      h('p', { class: 'note' }, '높음: 빛 번짐·날씨 입자 전부, 고해상도 화면에서 선명하게 · 보통: 날씨 절반 · 낮음: 날씨 끔. 품질은 다음 대결부터 바뀐다.'),
      h('div', { class: 'row end' }, close),
    ),
  );
  const shut = () => {
    panel.remove();
    window.removeEventListener('keydown', onKey, true);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      shut();
    }
  };
  close.addEventListener('click', shut);
  panel.addEventListener('click', (e) => e.target === panel && shut());
  window.addEventListener('keydown', onKey, true);
  document.body.append(panel);
  close.focus();
}

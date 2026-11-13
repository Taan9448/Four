// 「결」 설정 창(2026-11-09, 7-4절 8): 소리·흔들림·번쩍임·판정 보정·화면 품질. 바꾸는 즉시 저장하고 onChange로 반영한다.
import { accountRows } from './account';
import { bindKey, defaultKeys, KEY_ACTIONS, keyLabel, RESERVED, type KeyAction } from './keys';
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
  // 키 바꾸기(2026-11-13): 칸을 누르고 쓸 키를 누른다. Delete·Backspace는 칸 비우기, Esc는 그만두기
  let capturing: { action: KeyAction; slot: 0 | 1; btn: HTMLButtonElement } | null = null;
  const keyGrid = h('div', { class: 'key-grid' });
  const drawKeys = () => {
    keyGrid.replaceChildren(
      ...KEY_ACTIONS.flatMap(({ id, name }) => {
        const slots = ([0, 1] as const).map((slot) => {
          const code = st.keys[id][slot];
          const b = h('button', { class: `key-slot${code ? '' : ' empty'}`, type: 'button', 'aria-label': `${name} ${slot ? '보조' : '주'} 키 바꾸기` }, code ? keyLabel(code) : '—');
          b.addEventListener('click', () => {
            capturing?.btn.classList.remove('wait');
            capturing = { action: id, slot, btn: b };
            b.classList.add('wait');
            b.textContent = '키를 누르세요';
            // Space·Enter를 받을 때 단추가 다시 눌리지 않게 초점을 뗀다
            b.blur();
          });
          return b;
        });
        return [h('span', { class: 'key-name' }, name + (id === 'pause' ? ' (Esc도)' : '')), ...slots];
      }),
    );
  };
  drawKeys();
  const resetKeys = h('button', { class: 'btn', type: 'button' }, '키 처음대로');
  resetKeys.addEventListener('click', () => {
    capturing = null;
    commit({ keys: defaultKeys() });
    drawKeys();
  });
  const close = h('button', { class: 'btn primary', type: 'button' }, '닫기');
  const panel = h(
    'div',
    { class: 'settings-panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': '설정' },
    h(
      'div',
      { class: 'settings-box' },
      h('h2', {}, '설정'),
      // 계정(2026-11-10 목업): 로그인 판 또는 아이디·동기화·로그아웃
      accountRows(() => {
        shut();
        openSettings(onChange);
      }),
      slider('전체 소리', 'master'),
      slider('배경 음악', 'bgm'),
      slider('효과음', 'sfx'),
      slider('화면 흔들림', 'shake'),
      h('label', { class: 'row' }, h('span', {}, '번쩍임 줄이기'), flash, h('output', {}, '')),
      h('label', { class: 'row' }, h('span', {}, '판정 보정'), offset, offsetOut),
      h('p', { class: 'note' }, '받기가 늘 늦게 판정되면 +로 올린다(누른 시각을 그만큼 앞당긴다). 수련장에서 박자에 맞춰 재는 기능은 다음 단계에 들어간다.'),
      h('label', { class: 'row' }, h('span', {}, '화면 품질'), quality, h('output', {}, '')),
      h('p', { class: 'note' }, '높음: 빛 번짐·날씨 입자 전부, 고해상도 화면에서 선명하게 · 보통: 날씨 절반 · 낮음: 날씨 끔. 품질은 다음 대결부터 바뀐다.'),
      h('h3', {}, '키'),
      keyGrid,
      h('div', { class: 'row end' }, h('p', { class: 'note' }, '칸을 누르고 쓸 키를 누른다. 다른 동작이 쓰던 키면 그쪽에서 빠진다. Delete는 칸 비우기.'), resetKeys),
      h('div', { class: 'row end' }, close),
    ),
  );
  const shut = () => {
    panel.remove();
    window.removeEventListener('keydown', onKey, true);
  };
  const onKey = (e: KeyboardEvent) => {
    if (capturing) {
      // 키 받기: 이 키는 게임으로 넘기지 않는다
      e.preventDefault();
      e.stopPropagation();
      const { action, slot } = capturing;
      capturing = null;
      if (e.key === 'Escape') return drawKeys();
      if (e.code === 'Delete' || e.code === 'Backspace') {
        const keys = { ...st.keys, [action]: [...st.keys[action]] as [string, string] };
        keys[action][slot] = '';
        commit({ keys });
      } else if (!RESERVED.has(e.code) && e.code) commit({ keys: bindKey(st.keys, action, slot, e.code) });
      drawKeys();
      return;
    }
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

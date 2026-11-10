// 「결」 장면 창(2026-11-10 3단계): 배경(장면 일러스트 또는 장소 그림) 위에 화자 반신 그림과 대화창.
// 클릭·Space·Enter로 다음 줄(글이 덜 나왔으면 다 보이기), Esc로 장면 건너뛰기. 「천외귀환」 scene-view는 고치지 않고 따로 둔다.
import { frameUrl } from '../../src/render/assets';
import { sfx } from '../../src/render/audio';
import { button, el, realArt } from './dom';

export interface SceneLine {
  speaker?: string;
  text: string;
  /** 장면 일러스트 id(none이면 걷는다) */
  cg?: string;
  /** 반신 그림 칸(1 기본 · 2 결의 · 3 놀람) */
  face?: number;
  /** 고르기(2026-11-10 6장 바르가스의 거래): 고른 쪽의 flag가 장 안에 남는다. 건너뛰면 아무것도 고르지 않은 것 */
  choices?: { text: string; flag?: string }[];
}

export interface Speaker {
  name: string;
  stand: string | null;
}

/** 장면을 처음부터 끝까지 보여 주고 끝나면 풀린다(고른 flag들을 돌려준다) */
export function playScene(host: HTMLElement, lines: SceneLine[], speakers: Record<string, Speaker>, bg?: string, title?: string): Promise<string[]> {
  if (!lines.length) return Promise.resolve([]);
  return new Promise((resolve) => {
    const picked: string[] = [];
    let choosing = false;
    const choiceBox = el('div', { class: 'vn-choices', hidden: '' });
    const bgUrl = bg ? frameUrl(bg, 1) : null;
    const back = el('div', { class: 'vn-bg' });
    if (bgUrl) back.style.backgroundImage = `url("${bgUrl}")`;
    const cg = el('img', { class: 'vn-cg', alt: '', hidden: '' });
    const left = el('img', { class: 'vn-stand left', alt: '', hidden: '' });
    const right = el('img', { class: 'vn-stand right', alt: '', hidden: '' });
    const name = el('b', { class: 'vn-name' });
    const text = el('p', { class: 'vn-text' });
    const more = el('span', { class: 'vn-more', 'aria-hidden': 'true' }, '▼');
    const skip = button('건너뛰기 (Esc)', 'btn vn-skip', () => finish());
    const box = el('div', { class: 'vn-box' }, name, text, more, choiceBox);
    const root = el('div', { class: 'vn', role: 'dialog', 'aria-label': title ?? '장면' }, back, cg, left, right, title ? el('div', { class: 'vn-title' }, title) : '', box, skip);
    host.append(root);
    let i = -1;
    const offered = new Set<number>();
    let typing = 0;
    let full = '';
    let shown = 0;
    /** 하운(과 젊은 하운)은 왼쪽, 나머지 화자는 오른쪽에 선다 */
    const side = (who: string) => (who.startsWith('haun') ? left : right);
    const show = () => {
      const line = lines[i];
      if (line.cg) {
        const u = line.cg === 'none' ? null : realArt(line.cg);
        cg.hidden = !u;
        if (u) cg.src = u;
      }
      const sp = line.speaker ? speakers[line.speaker] : undefined;
      name.textContent = sp?.name ?? '';
      box.classList.toggle('narration', !sp);
      if (sp?.stand) {
        const img = side(line.speaker!);
        const u = frameUrl(sp.stand, line.face ?? 1);
        if (u) {
          img.src = u;
          img.hidden = false;
        }
      }
      // 말하는 쪽은 밝게, 듣는 쪽은 어둡게, 내레이션이면 둘 다 흐리게
      const speaking = line.speaker ? side(line.speaker) : null;
      for (const s of [left, right]) s.classList.toggle('dim', s !== speaking);
      // 일러스트가 깔린 동안은 반신 그림을 숨긴다
      root.classList.toggle('has-cg', !cg.hidden);
      full = line.text;
      shown = 0;
      text.textContent = '';
      more.hidden = true;
      clearInterval(typing);
      typing = window.setInterval(() => {
        shown = Math.min(full.length, shown + 2);
        text.textContent = full.slice(0, shown);
        if (shown >= full.length) {
          clearInterval(typing);
          more.hidden = false;
          if (lines[i].choices?.length) {
            offered.add(i);
            offer();
          }
        }
      }, 22);
    };
    /** 고르기 줄: 글이 다 나오면 단추를 띄우고, 고를 때까지 다음 줄로 넘어가지 않는다 */
    const offer = () => {
      const ch = lines[i]?.choices;
      if (!ch?.length || choosing) return;
      choosing = true;
      more.hidden = true;
      choiceBox.hidden = false;
      choiceBox.replaceChildren(
        ...ch.map((c, k) =>
          button([el('span', { class: 'key' }, String(k + 1)), c.text], 'btn vn-choice', () => {
            if (c.flag) picked.push(c.flag);
            choosing = false;
            choiceBox.hidden = true;
            choiceBox.replaceChildren();
            next();
          }),
        ),
      );
      (choiceBox.firstElementChild as HTMLButtonElement | null)?.focus();
    };
    const next = () => {
      if (choosing) return;
      if (shown < full.length) {
        clearInterval(typing);
        shown = full.length;
        text.textContent = full;
        more.hidden = false;
        if (lines[i]?.choices?.length) {
          offered.add(i);
          offer();
        }
        return;
      }
      if (lines[i]?.choices?.length && !choosing && choiceBox.hidden && shown >= full.length && !offered.has(i)) {
        offered.add(i);
        offer();
        return;
      }
      i++;
      if (i >= lines.length) finish();
      else {
        sfx('click', { volume: 0.4 });
        show();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (choosing) {
        const k = Number(e.key);
        const btns = choiceBox.querySelectorAll<HTMLButtonElement>('.vn-choice');
        if (k >= 1 && k <= btns.length) {
          e.preventDefault();
          e.stopPropagation();
          btns[k - 1].click();
          return;
        }
        // Enter·Space는 초점이 간 단추를 누른다(바깥 단축키로 새지 않게)
        if (e.key === ' ' || e.key === 'Enter') {
          e.stopPropagation();
          return;
        }
      }
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        next();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        finish();
      }
    };
    let done = false;
    function finish() {
      if (done) return;
      done = true;
      clearInterval(typing);
      window.removeEventListener('keydown', onKey, true);
      root.remove();
      resolve(picked);
    }
    root.addEventListener('click', (e) => {
      if (e.target !== skip && !choiceBox.contains(e.target as Node)) next();
    });
    window.addEventListener('keydown', onKey, true);
    next();
  });
}

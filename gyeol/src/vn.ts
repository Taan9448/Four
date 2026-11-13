// 「결」 장면 창(2026-11-10 3단계, 2026-11-13 매끄러운 이야기): 배경 위에 화자 반신 그림과 대화창.
// 클릭·Space·Enter로 다음 줄(글이 덜 나왔으면 다 보이기), A로 자동 진행, Esc로 장면 건너뛰기. 「천외귀환」 scene-view는 고치지 않고 따로 둔다.
// 2026-11-13(사용자 요청 "스토리가 뚝뚝 끊긴다"):
//  - now 줄(운곡루의 지금)은 뒤뜰 그림 위에서, 나머지(회상)는 그 장의 장소 위에서 — 둘 사이는 천천히 번지듯 바뀐다
//  - 이야기 그림은 두 장을 겹쳐 서로 스며들게 바꾼다(깜빡이지 않게)
//  - kind: rule 줄은 대사가 아니라 '이번 대결' 쪽지로 보인다
//  - 장면 창은 먹이 번지듯 열리고, 닫힐 때 어둠으로 가라앉아 다음 화면(대결)으로 이어진다
import { frameUrl } from '../../src/render/assets';
import { sfx } from '../../src/render/audio';
import { button, el, realArt } from './dom';
import { withKeys } from './save';

export interface SceneLine {
  speaker?: string;
  text: string;
  /** 「천외귀환」 장면 일러스트 id(none이면 걷는다) — art가 아직 실제 그림이 아니면 이것 */
  cg?: string;
  /** 「결」 이야기 그림 id(Codex cg_gyeol_<장면>, 2026-11-12 — 「천외귀환」에 없는 새 장면·구도). 실제 그림이 오면 cg 대신 이것 */
  art?: string;
  /** 반신 그림 칸(1 기본 · 2 결의 · 3 놀람) */
  face?: number;
  /** 고르기(2026-11-10 6장 바르가스의 거래): 고른 쪽의 flag가 장 안에 남는다. 건너뛰면 아무것도 고르지 않은 것 */
  choices?: { text: string; flag?: string }[];
  /** 운곡루의 지금(회상 밖) — 뒤뜰 그림 위에서 */
  now?: boolean;
  /** rule: 대결 규칙 쪽지 */
  kind?: 'rule';
}

export interface Speaker {
  name: string;
  stand: string | null;
}

/** 지금(운곡루) 배경 */
const NOW_BG = 'bg_gyeol_lobby';
/** 자동 진행: 글이 다 나온 뒤 기다리는 시간 */
const autoWait = (len: number) => 1300 + len * 38;
let autoOn = false;

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
    const nowUrl = realArt(NOW_BG) ?? frameUrl(NOW_BG, 1);
    const backNow = el('div', { class: 'vn-bg now' });
    if (nowUrl) backNow.style.backgroundImage = `url("${nowUrl}")`;
    // 그림 두 장을 번갈아 써서 스며들게 바꾼다
    const cgs = [el('img', { class: 'vn-cg', alt: '' }), el('img', { class: 'vn-cg', alt: '' })];
    let cgFront = 0;
    let cgShown = false;
    const left = el('img', { class: 'vn-stand left', alt: '', hidden: '' });
    const right = el('img', { class: 'vn-stand right', alt: '', hidden: '' });
    const name = el('b', { class: 'vn-name' });
    const text = el('p', { class: 'vn-text' });
    const more = el('span', { class: 'vn-more', 'aria-hidden': 'true' }, '▼');
    const skip = button('건너뛰기 (Esc)', 'btn vn-skip', () => finish());
    const auto = button(['자동 ', el('small', {}, 'A')], `btn vn-auto${autoOn ? ' on' : ''}`, () => toggleAuto(), { 'aria-pressed': String(autoOn) });
    const box = el('div', { class: 'vn-box' }, name, text, more, choiceBox);
    const root = el('div', { class: 'vn', role: 'dialog', 'aria-label': title ?? '장면' }, back, backNow, ...cgs, left, right, title ? el('div', { class: 'vn-title' }, title) : '', box, el('div', { class: 'vn-tools' }, auto, skip));
    host.append(root);
    let i = -1;
    const offered = new Set<number>();
    let typing = 0;
    let autoTimer = 0;
    let full = '';
    let shown = 0;
    let wasNow: boolean | null = null;
    /** 하운(과 젊은 하운)은 왼쪽, 나머지 화자는 오른쪽에 선다 */
    const side = (who: string) => (who.startsWith('haun') ? left : right);
    const setCg = (u: string | null) => {
      if (!u) {
        cgs.forEach((c) => c.classList.remove('on'));
        cgShown = false;
        return;
      }
      if (cgShown && cgs[cgFront].getAttribute('src') === u) return;
      const next = cgShown ? 1 - cgFront : cgFront;
      cgs[next].src = u;
      cgs[next].classList.add('on');
      if (next !== cgFront) cgs[cgFront].classList.remove('on');
      cgFront = next;
      cgShown = true;
    };
    const toggleAuto = () => {
      autoOn = !autoOn;
      auto.classList.toggle('on', autoOn);
      auto.setAttribute('aria-pressed', String(autoOn));
      if (autoOn && shown >= full.length) armAuto();
      else clearTimeout(autoTimer);
    };
    const armAuto = () => {
      clearTimeout(autoTimer);
      if (!autoOn || choosing || lines[i]?.choices?.length) return;
      autoTimer = window.setTimeout(() => next(), autoWait(full.length));
    };
    const show = () => {
      const line = lines[i];
      const isNow = !!line.now;
      // 지금 ↔ 회상: 배경이 바뀌고, 그 줄에 그림 지정이 없으면 앞의 그림은 걷는다
      if (wasNow !== null && isNow !== wasNow) {
        if (!line.art && !line.cg) setCg(null);
        // 지금의 인물(운곡루의 왕일검)이 회상 속에 남지 않게 — 말하는 사람만 다시 선다
        left.hidden = true;
        right.hidden = true;
      }
      root.classList.toggle('now', isNow);
      wasNow = isNow;
      if (line.art || line.cg) {
        // 「결」 이야기 그림(art)이 실제로 왔으면 그것, 아니면 「천외귀환」 장면 그림(cg) — 둘 다 없으면 걷는다(2026-11-12)
        setCg((line.art ? realArt(line.art) : null) ?? (line.cg && line.cg !== 'none' ? realArt(line.cg) : null));
      }
      const rule = line.kind === 'rule';
      const sp = !rule && line.speaker ? speakers[line.speaker] : undefined;
      name.textContent = rule ? '이번 대결' : (sp?.name ?? '');
      box.classList.toggle('narration', !sp && !rule);
      box.classList.toggle('rule', rule);
      if (sp?.stand) {
        const img = side(line.speaker!);
        const u = frameUrl(sp.stand, line.face ?? 1);
        if (u) {
          img.src = u;
          img.hidden = false;
        }
      }
      // 말하는 쪽은 밝게, 듣는 쪽은 어둡게, 내레이션이면 둘 다 흐리게
      const speaking = line.speaker && !rule ? side(line.speaker) : null;
      for (const s of [left, right]) s.classList.toggle('dim', s !== speaking);
      // 일러스트가 깔린 동안은 반신 그림을 숨긴다
      root.classList.toggle('has-cg', cgShown);
      full = withKeys(line.text);
      shown = 0;
      text.textContent = '';
      more.hidden = true;
      clearInterval(typing);
      clearTimeout(autoTimer);
      typing = window.setInterval(() => {
        shown = Math.min(full.length, shown + 2);
        text.textContent = full.slice(0, shown);
        if (shown >= full.length) {
          clearInterval(typing);
          more.hidden = false;
          if (lines[i].choices?.length) {
            offered.add(i);
            offer();
          } else armAuto();
        }
      }, 22);
    };
    /** 고르기 줄: 글이 다 나오면 단추를 띄우고, 고를 때까지 다음 줄로 넘어가지 않는다 */
    const offer = () => {
      const ch = lines[i]?.choices;
      if (!ch?.length || choosing) return;
      choosing = true;
      clearTimeout(autoTimer);
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
      if (choosing || done) return;
      clearTimeout(autoTimer);
      if (shown < full.length) {
        clearInterval(typing);
        shown = full.length;
        text.textContent = full;
        more.hidden = false;
        if (lines[i]?.choices?.length) {
          offered.add(i);
          offer();
        } else armAuto();
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
      } else if (e.code === 'KeyA' && !e.repeat) {
        e.preventDefault();
        e.stopPropagation();
        toggleAuto();
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
      clearTimeout(autoTimer);
      window.removeEventListener('keydown', onKey, true);
      // 어둠으로 가라앉은 뒤 닫는다(다음 화면이 어둠에서 떠오른다). 움직임 줄이기면 바로
      const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
      root.classList.add('out');
      setTimeout(
        () => {
          root.remove();
          resolve(picked);
        },
        calm ? 0 : 380,
      );
    }
    root.addEventListener('click', (e) => {
      const t = e.target as Node;
      if (t !== skip && !auto.contains(t) && !choiceBox.contains(t)) next();
    });
    window.addEventListener('keydown', onKey, true);
    next();
  });
}

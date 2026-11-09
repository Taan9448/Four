// 「결」 손맛 시제품(2026-11-09): 상대 고르기 → 대결 → 결과. 입력: 받기 K·Space·오른쪽 버튼, 베기 J·왼쪽 클릭·왼쪽 버튼.
import { initAudio, sfx } from '../../src/render/audio';
import { frameUrl } from '../../src/render/assets';
import raw from '../data/duel.json';
import { advance, createDuel, isOpen, press, type DuelData, type FoeDef } from './duel';
import { CONTACT, draw, emptyFx, FOE_X, H, loadSprites, PLAYER_X, pruneFx, W, type Fx, type Sprites } from './render';
import './style.css';

const data = raw as unknown as DuelData;
const app = document.getElementById('app')!;
let stopLoop: (() => void) | null = null;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  e.append(...kids);
  return e;
}

function title(): void {
  stopLoop?.();
  const cards = data.foes.map((f) => {
    const img = frameUrl(`${f.sprite}_idle`, 1);
    const btn = el(
      'button',
      { class: 'foe-card', type: 'button' },
      img ? el('img', { src: img, alt: '' }) : '',
      el('b', {}, f.title),
      el('small', {}, f.note),
    );
    btn.addEventListener('click', () => void duel(f));
    return btn;
  });
  app.replaceChildren(
    el(
      'section',
      { class: 'title' },
      el('h1', {}, '결'),
      el('p', { class: 'sub' }, '적의 공격에는 결이 있다. 결을 읽고, 받아치고, 되돌아오는 틈을 벤다.'),
      el('div', { class: 'foes' }, ...cards),
      el(
        'div',
        { class: 'help' },
        el('p', {}, el('kbd', {}, 'K'), ' 또는 ', el('kbd', {}, 'Space'), ' — 받기. 빛줄기 끝의 고리가 과녁 고리와 겹칠 때(금빛) 누르면 패링.'),
        el('p', {}, el('kbd', {}, 'J'), ' 또는 화면 클릭 — 베기. 패링 직후 적에게 금이 보이는 동안 베면 반격(3배).'),
        el('p', {}, '적 체간(가운데 막대)이 가득 차면 비틀거린다 — 그때 베면 결정타.'),
      ),
      el('p', { class: 'proto' }, '손맛 시제품 · 하운의 받기·반격 전용 그림은 아직 없어 베기 그림으로 대신한다'),
    ),
  );
}

async function duel(foeDef: FoeDef): Promise<void> {
  stopLoop?.();
  const seed = `${foeDef.id}-${Date.now().toString(36)}`;
  const d = createDuel(data, foeDef.id, seed);
  const canvas = el('canvas', { width: String(W), height: String(H), class: 'field', 'aria-label': `${foeDef.title}와의 대결` });
  const ctx = canvas.getContext('2d')!;
  const foeHp = el('i'), foePosture = el('i'), myHp = el('i'), myPosture = el('i');
  const hud = el(
    'div',
    { class: 'hud' },
    el('div', { class: 'foe-bar' }, el('b', {}, foeDef.title), el('div', { class: 'bar hp' }, foeHp), el('div', { class: 'bar posture' }, foePosture)),
    el('div', { class: 'me-bar' }, el('b', {}, data.player.name), el('div', { class: 'bar hp' }, myHp), el('div', { class: 'bar posture' }, myPosture)),
  );
  const attackBtn = el('button', { class: 'pad attack', type: 'button' }, '베기', el('small', {}, 'J'));
  const parryBtn = el('button', { class: 'pad parry', type: 'button' }, '받기', el('small', {}, 'K'));
  const back = el('button', { class: 'back', type: 'button' }, '상대 고르기');
  back.addEventListener('click', title);
  const overlay = el('div', { class: 'result', hidden: '' });
  app.replaceChildren(el('section', { class: 'duel' }, el('div', { class: 'stage' }, canvas, hud, overlay), el('div', { class: 'pads' }, attackBtn, back, parryBtn)));

  const sp: Sprites = await loadSprites(data.player.sprite, foeDef.sprite, foeDef.bg);
  const fx: Fx = emptyFx();
  let hitstopUntil = 0;
  let last = performance.now();
  let raf = 0;
  let alive = true;

  const doPress = (input: 'parry' | 'attack') => {
    if (!alive) return;
    if (press(d, input) && input === 'parry') fx.guardPose = performance.now();
  };
  attackBtn.addEventListener('pointerdown', (e) => (e.preventDefault(), doPress('attack')));
  parryBtn.addEventListener('pointerdown', (e) => (e.preventDefault(), doPress('parry')));
  canvas.addEventListener('pointerdown', () => doPress('attack'));
  const onKey = (e: KeyboardEvent) => {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    if (k === 'k' || k === ' ') (e.preventDefault(), doPress('parry'));
    else if (k === 'j') doPress('attack');
    else if (k === 'escape') title();
  };
  window.addEventListener('keydown', onKey);

  const spark = (x: number, y: number, n: number, color: string, speed = 260) => {
    const now = performance.now();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (i % 3) * 0.3;
      const v = speed * (0.5 + ((i * 37) % 10) / 10);
      fx.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120, born: now, life: 420 + ((i * 53) % 200), color });
    }
  };
  const text = (x: number, y: number, s: string, color: string, size = 34) => fx.texts.push({ x, y, text: s, color, born: performance.now(), size });

  const handleEvents = () => {
    const now = performance.now();
    for (const ev of d.events) {
      switch (ev.type) {
        case 'parry':
          sfx('block');
          sfx('snap', { volume: 0.8 });
          spark(CONTACT.x, CONTACT.y, 22, '#ffd98a', 320);
          fx.bursts.push({ x: CONTACT.x, y: CONTACT.y, sprite: 'grain', born: now, scale: 0.9 });
          text(CONTACT.x, CONTACT.y - 70, '결!', '#ffd27a', 44);
          fx.shake = { power: 6, born: now, life: 160 };
          hitstopUntil = now + 70;
          break;
        case 'guard':
          sfx('block', { volume: 0.7 });
          spark(CONTACT.x - 30, CONTACT.y, 10, '#cfd6e6', 180);
          text(PLAYER_X, CONTACT.y - 80, `막음 -${ev.damage}`, '#cfd6e6', 26);
          break;
        case 'guardBreak':
          sfx('hit_heavy');
          text(PLAYER_X, CONTACT.y - 120, '자세가 무너졌다', '#ff9a8a', 28);
          fx.shake = { power: 10, born: now, life: 260 };
          break;
        case 'hit':
          sfx('hit');
          fx.bursts.push({ x: PLAYER_X + 10, y: CONTACT.y + 10, sprite: foeDef.id === 'ignis' ? 'fire' : 'blunt', born: now, scale: 0.8 });
          fx.flash = { color: '#ff3b3b', born: now, life: 180 };
          fx.shake = { power: 9, born: now, life: 220 };
          text(PLAYER_X, CONTACT.y - 90, `-${ev.damage}`, '#ff8a7a', 30);
          break;
        case 'strike':
          sfx(ev.counter ? 'crit' : 'slash');
          fx.bursts.push({ x: FOE_X - 10, y: CONTACT.y + 10, sprite: 'slash', born: now, scale: ev.counter ? 1.1 : 0.8 });
          text(FOE_X, CONTACT.y - 90, ev.counter ? `반격 ${ev.damage}` : `${ev.damage}`, ev.counter ? '#ffb15c' : '#ffffff', ev.counter ? 34 : 24);
          if (ev.counter) {
            spark(FOE_X - 20, CONTACT.y, 14, '#ffb15c', 260);
            hitstopUntil = now + 60;
          }
          break;
        case 'stagger':
          sfx('snap');
          text(FOE_X, CONTACT.y - 140, '체간이 무너졌다 — 베어라!', '#ffe9b0', 26);
          fx.flash = { color: '#fff3c4', born: now, life: 200 };
          break;
        case 'recover':
          text(FOE_X, CONTACT.y - 140, '자세를 되찾았다', '#c9c3d6', 22);
          break;
        case 'deathblow':
          sfx('slam_9');
          fx.bursts.push({ x: FOE_X - 10, y: CONTACT.y, sprite: 'grain', born: now, scale: 1.6 });
          spark(FOE_X - 10, CONTACT.y, 36, '#ffe6a0', 420);
          text(FOE_X, CONTACT.y - 120, `결정타 ${ev.damage}`, '#ffe08a', 44);
          fx.flash = { color: '#ffffff', born: now, life: 260 };
          fx.shake = { power: 14, born: now, life: 320 };
          hitstopUntil = now + 180;
          break;
        case 'win':
          sfx('victory');
          finish();
          break;
        case 'lose':
          sfx('defeat');
          finish();
          break;
      }
    }
    d.events.length = 0;
  };

  const finish = () => {
    setTimeout(() => {
      if (!alive) return;
      const s = d.stats;
      const again = el('button', { class: 'btn primary', type: 'button' }, '다시');
      again.addEventListener('click', () => void duel(foeDef));
      const pick = el('button', { class: 'btn', type: 'button' }, '상대 고르기');
      pick.addEventListener('click', title);
      overlay.replaceChildren(
        el('h2', {}, d.result === 'win' ? `${foeDef.title}을(를) 베었다` : '쓰러졌다'),
        el('p', {}, `패링 ${s.parries} · 막기 ${s.guards} · 맞음 ${s.hits} · 반격 ${s.counters} · 결정타 ${s.deathblows}`),
        el('p', { class: 'time' }, `${(d.t / 1000).toFixed(1)}초`),
        el('div', { class: 'row' }, again, pick),
      );
      overlay.hidden = false;
      again.focus();
    }, 900);
  };

  const bars = () => {
    foeHp.style.width = `${(d.foe.hp / foeDef.hp) * 100}%`;
    foePosture.style.width = `${Math.min(1, d.foe.posture / foeDef.posture) * 100}%`;
    myHp.style.width = `${(d.player.hp / data.player.hp) * 100}%`;
    myPosture.style.width = `${Math.min(1, d.player.posture / data.player.posture) * 100}%`;
    hud.classList.toggle('open', isOpen(d));
  };

  const frame = (now: number) => {
    if (!alive) return;
    const dt = Math.min(50, now - last);
    last = now;
    if (now >= hitstopUntil) advance(d, d.t + dt);
    handleEvents();
    pruneFx(fx, now);
    draw(ctx, d, sp, fx, now);
    bars();
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  stopLoop = () => {
    alive = false;
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', onKey);
    stopLoop = null;
  };
}

initAudio();
const params = new URLSearchParams(location.search);
const direct = data.foes.find((f) => f.id === params.get('foe'));
if (direct) void duel(direct);
else title();

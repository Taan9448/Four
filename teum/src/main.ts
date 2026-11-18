// 「틈」 화면 흐름(2026-11-18): 제목 → 인물 고르기 → 판(30분) → 결과. 판 안: 레벨업 카드 셋 · 멈춤.
// 입력: WASD·방향키 / 휴대폰은 왼쪽을 끌어 가상 막대, 오른쪽 아래 보법·천외귀운 단추.
import './style.css';
import { frameUrl } from '../../src/render/assets';
import { gainXp } from '../../gyeol/src/training';
import { choose, createRun, DT, FOES, HEROES, PASSIVES, RUN, step, trainingXp, WEAPONS, type Choice, type HeroDef, type Input } from './sim';
import { absorb, draw, emptyView, loadArt, rememberFoeScales, rememberPassives, type Art, type View } from './render';

rememberFoeScales(FOES.values());
rememberPassives(PASSIVES.values());

const app = document.getElementById('app')!;
const params = new URLSearchParams(location.search);

// ── 저장(기록·연 인물) ──
interface Save {
  best: number;
  wins: number;
  runs: number;
  bosses: string[];
  unlocked: string[];
}
const KEY = 'teum.save';
function loadSave(): Save {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (raw) return { best: 0, wins: 0, runs: 0, bosses: [], unlocked: ['haun'], ...raw };
  } catch {
    /* 저장이 깨졌으면 새로 */
  }
  return { best: 0, wins: 0, runs: 0, bosses: [], unlocked: ['haun'] };
}
function writeSave(s: Save): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* 사생활 보호 창 등 */
  }
}
const isOpen = (sv: Save, h: HeroDef) => !h.unlock || sv.unlocked.includes(h.id) || params.has('all');

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  e.append(...kids);
  return e;
}
function btn(label: string, cls: string, fn: () => void): HTMLButtonElement {
  const b = el('button', { class: cls, type: 'button' }, label);
  b.addEventListener('click', fn);
  return b;
}
const clock = (t: number) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

let stopRun: (() => void) | null = null;

// ── 제목 ──
function title(): void {
  stopRun?.();
  const sv = loadSave();
  app.replaceChildren(
    el(
      'section',
      { class: 'screen title' },
      el('div', { class: 'crack', 'aria-hidden': 'true' }),
      el('h1', { class: 'logo' }, el('span', { class: 'han' }, '隙'), el('span', { class: 'ko' }, '틈')),
      el('p', { class: 'sub' }, '천외귀환 외전 — 하늘이 갈라진 밤, 30분을 버텨 틈을 꿰맨다'),
      el(
        'div',
        { class: 'menu' },
        btn('시작', 'btn primary', select),
        btn('「천외귀환」으로', 'btn ghost', () => (location.href = '../')),
        btn('「결」로', 'btn ghost', () => (location.href = '../gyeol/')),
      ),
      el('p', { class: 'record' }, sv.runs ? `가장 오래 버틴 시간 ${clock(sv.best)} · 틈을 꿰맨 판 ${sv.wins} · 판 ${sv.runs}` : '처음 들어온다. 움직이기만 하면 무공은 저절로 나간다.'),
    ),
  );
}

// ── 인물 고르기 ──
function select(): void {
  const sv = loadSave();
  const cards = HEROES.map((h) => {
    const open = isOpen(sv, h);
    const art = frameUrl(h.stand, 1, { realOnly: true }) ?? frameUrl(`${h.sprite}_idle`, 1);
    const start = WEAPONS.get(h.start)!;
    const card = el(
      'button',
      { class: `hero${open ? '' : ' locked'}`, type: 'button', ...(open ? {} : { disabled: '' }) },
      el('div', { class: 'portrait' }, art ? el('img', { src: art, alt: '' }) : ''),
      el('div', { class: 'name' }, h.name),
      el('div', { class: 'role' }, h.title),
      el('div', { class: 'stats' }, `체력 ${h.hp} · 걸음 ${Math.round(h.speed * 100)}%${h.armor ? ` · 단단함 ${h.armor}` : ''}`),
      el('div', { class: 'start' }, `시작 무공 「${start.name}」 · 마지막 기술 「${h.ult.name}」`),
      open ? '' : el('div', { class: 'lock' }, `🔒 ${h.unlock?.text}`),
    );
    if (open) card.addEventListener('click', () => void play(h.id));
    return card;
  });
  app.replaceChildren(el('section', { class: 'screen select' }, el('h2', {}, '누가 틈 앞에 서는가'), el('div', { class: 'heroes' }, ...cards), btn('돌아가기', 'btn ghost', title)));
}

// ── 판 ──
async function play(heroId: string): Promise<void> {
  stopRun?.();
  const seed = params.get('seed') ?? `${heroId}-${Date.now().toString(36)}`;
  const s = createRun(heroId, seed);
  // 점검용: ?t=초 — 그 시간까지 봇 없이 빨리 감기(움직이지 않고, 레벨업은 첫 카드)
  const skip = Number(params.get('t') ?? 0);
  if (skip > 0) {
    s.player.hp = s.player.maxHp = 99999;
    const note = el('div', { class: 'loading' }, '빨리 감는 중…');
    app.replaceChildren(note);
    while (s.t < skip && !s.result) {
      for (let i = 0; i < 900 && s.t < skip; i++) {
        if (s.pending) choose(s, 0);
        step(s, { x: Math.cos(s.t / 3), y: Math.sin(s.t / 3) });
        s.events.length = 0;
      }
      note.textContent = `빨리 감는 중… ${clock(s.t)}`;
      await new Promise((r) => setTimeout(r, 0));
    }
    s.player.maxHp = s.hero.hp + (s.passives.get('vigor') ?? 0) * 10;
    s.player.hp = s.player.maxHp;
  }
  const canvas = el('canvas', { class: 'field', 'aria-label': '틈 — 판' });
  const ctx = canvas.getContext('2d')!;
  const overlay = el('div', { class: 'overlay', hidden: '' });
  const stick = el('div', { class: 'stick', hidden: '' }, el('div', { class: 'knob' }));
  const dashBtn = el('button', { class: 'pad dash', type: 'button', 'aria-label': '보법' }, '步');
  const ultBtn = el('button', { class: 'pad ult', type: 'button', 'aria-label': s.hero.ult.name }, '天');
  const pauseBtn = btn('Ⅱ', 'pad pause', () => pause());
  const hpText = el('div', { class: 'hp-text' });
  app.replaceChildren(el('section', { class: 'screen run' }, canvas, hpText, stick, dashBtn, ultBtn, pauseBtn, overlay));
  const loading = el('div', { class: 'loading' }, '그림을 불러오는 중…');
  app.append(loading);
  const art: Art = await loadArt(s);
  loading.remove();
  const view: View = emptyView();

  // 입력
  const keys = new Set<string>();
  let wantDash = false;
  let wantUlt = false;
  let touch: { id: number; x0: number; y0: number; x: number; y: number } | null = null;
  const onKey = (e: KeyboardEvent) => {
    if (e.type === 'keydown') {
      if (overlay.hidden === false && /^[123]$/.test(e.key) && s.pending) {
        pick(Number(e.key) - 1);
        return;
      }
      if (e.code === 'Escape') return void (paused ? resume() : pause());
      if (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') wantDash = true;
      if (e.code === 'KeyQ') wantUlt = true;
      keys.add(e.code);
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    } else keys.delete(e.code);
  };
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);
  const onDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' || touch) return;
    touch = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY };
    stick.hidden = false;
    stick.style.left = `${e.clientX}px`;
    stick.style.top = `${e.clientY}px`;
  };
  const onMove = (e: PointerEvent) => {
    if (!touch || e.pointerId !== touch.id) return;
    touch.x = e.clientX;
    touch.y = e.clientY;
    const dx = Math.max(-50, Math.min(50, touch.x - touch.x0));
    const dy = Math.max(-50, Math.min(50, touch.y - touch.y0));
    (stick.firstChild as HTMLElement).style.transform = `translate(${dx}px, ${dy}px)`;
  };
  const onUp = (e: PointerEvent) => {
    if (!touch || e.pointerId !== touch.id) return;
    touch = null;
    stick.hidden = true;
  };
  canvas.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  dashBtn.addEventListener('pointerdown', (e) => (e.preventDefault(), (wantDash = true)));
  ultBtn.addEventListener('pointerdown', (e) => (e.preventDefault(), (wantUlt = true)));
  const input = (): Input => {
    let x = 0;
    let y = 0;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
    if (keys.has('KeyW') || keys.has('ArrowUp')) y -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) y += 1;
    if (touch) {
      const dx = touch.x - touch.x0;
      const dy = touch.y - touch.y0;
      const d = Math.hypot(dx, dy);
      if (d > 8) {
        x = dx / Math.max(d, 50);
        y = dy / Math.max(d, 50);
      }
    }
    const out = { x, y, dash: wantDash, ult: wantUlt };
    wantDash = false;
    wantUlt = false;
    return out;
  };

  // 레벨업 카드
  const choiceCard = (c: Choice, i: number): HTMLElement => {
    const w = c.kind === 'weapon' ? WEAPONS.get(c.id) : undefined;
    const pd = c.kind === 'passive' ? PASSIVES.get(c.id) : undefined;
    const name = w?.name ?? pd?.name ?? '주먹밥';
    const desc = w ? (c.lv === 1 ? w.desc : levelDiff(c.id, c.lv)) : pd ? pd.desc : `체력 ${RUN.drops.foodHeal} 회복`;
    const tag = w ? (c.lv === 1 ? '새 무공' : `무공 Lv.${c.lv}`) : pd ? (c.lv === 1 ? '새 심법' : `심법 Lv.${c.lv}`) : '';
    const evo = w?.evolve ? `각성: ${PASSIVES.get(w.evolve.with)?.name}와 함께 Lv.5 → 「${WEAPONS.get(w.evolve.into)?.name}」` : '';
    const b = el(
      'button',
      { class: `choice ${c.kind}`, type: 'button', style: w ? `--c:${w.color}` : '' },
      el('span', { class: 'key' }, String(i + 1)),
      el('span', { class: 'tag' }, tag),
      el('b', {}, name),
      el('span', { class: 'desc' }, desc),
      evo ? el('span', { class: 'evo' }, evo) : '',
    );
    b.addEventListener('click', () => pick(i));
    return b;
  };
  const showChoices = () => {
    overlay.hidden = false;
    overlay.replaceChildren(el('div', { class: 'panel levelup' }, el('h3', {}, `Lv.${s.level - s.queuedLevels + 1} — 하나를 고른다`), el('div', { class: 'choices' }, ...s.pending!.map(choiceCard))));
  };
  const pick = (i: number) => {
    if (!s.pending) return;
    choose(s, i);
    if (s.pending) showChoices();
    else overlay.hidden = true;
  };

  let paused = false;
  const pause = () => {
    if (s.result || s.pending) return;
    paused = true;
    overlay.hidden = false;
    overlay.replaceChildren(
      el(
        'div',
        { class: 'panel' },
        el('h3', {}, '멈춤'),
        el('p', { class: 'muted' }, `${clock(s.t)} · Lv.${s.level} · 쓰러뜨림 ${s.kills}`),
        el('div', { class: 'menu' }, btn('계속', 'btn primary', resume), btn('그만두기', 'btn ghost', () => finish(true))),
      ),
    );
  };
  const resume = () => {
    paused = false;
    overlay.hidden = true;
    last = performance.now();
  };

  // 끝
  let ended = false;
  const finish = (quit = false) => {
    if (ended) return;
    ended = true;
    const sv = loadSave();
    sv.runs++;
    sv.best = Math.max(sv.best, s.t);
    if (s.result === 'win') sv.wins++;
    for (const b of s.bossKills) if (!sv.bosses.includes(b)) sv.bosses.push(b);
    const newly: string[] = [];
    for (const h of HEROES) {
      if (sv.unlocked.includes(h.id) || !h.unlock) continue;
      const u = h.unlock;
      if ((u.kind === 'survive' && s.t >= u.seconds) || (u.kind === 'boss' && s.bossKills.includes(u.foe))) {
        sv.unlocked.push(h.id);
        newly.push(h.name);
      }
    }
    writeSave(sv);
    const xp = trainingXp(s);
    void gainXp(xp, null, null).catch(() => undefined);
    const win = s.result === 'win';
    overlay.hidden = false;
    overlay.replaceChildren(
      el(
        'div',
        { class: `panel result ${win ? 'win' : 'lose'}` },
        el('div', { class: 'seal' }, win ? '縫' : quit ? '止' : '敗'),
        el('h3', {}, win ? '틈을 꿰맸다' : quit ? '그만두었다' : '그림자에 묻혔다'),
        el('p', {}, `버틴 시간 ${clock(s.t)} · Lv.${s.level} · 쓰러뜨림 ${s.kills}`),
        el('p', { class: 'muted' }, s.bossKills.length ? `끊은 매듭: ${s.bossKills.map((b) => FOES.get(b)?.name).join(' · ')}` : '매듭은 하나도 끊지 못했다'),
        el('p', { class: 'muted' }, `「천외귀환」 수련 경험치 +${xp}`),
        newly.length ? el('p', { class: 'unlock' }, `새 인물: ${newly.join(', ')}`) : '',
        el('div', { class: 'menu' }, btn('다시', 'btn primary', () => void play(heroId)), btn('인물 고르기', 'btn ghost', select), btn('제목으로', 'btn ghost', title)),
      ),
    );
  };

  // 돌리기
  const resize = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
  };
  resize();
  window.addEventListener('resize', resize);
  let last = performance.now();
  let acc = 0;
  let raf = 0;
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    const W = canvas.width;
    const H = canvas.height;
    // 짧은 변 600 CSS px에 세계 600을 담는다(휴대폰 세로는 조금 멀리, PC는 조금 가까이)
    const dpr = W / window.innerWidth;
    const zoom = dpr * Math.max(0.6, Math.min(1.6, Math.min(window.innerWidth, window.innerHeight) / 600));
    s.view = W / 2 / zoom;
    if (!paused && !s.pending && !s.result) {
      acc += Math.min(0.1, (now - last) / 1000);
      while (acc >= DT) {
        acc -= DT;
        step(s, input());
        if (s.pending || s.result) break;
      }
    }
    last = now;
    absorb(view, s, now);
    draw(ctx, s, art, view, now, W, H, zoom, dpr);
    hpText.textContent = `${Math.ceil(s.player.hp)} / ${s.player.maxHp}`;
    const dashLeft = Math.max(0, s.player.dashReady - s.t);
    dashBtn.style.setProperty('--k', String(1 - dashLeft / RUN.dash.cooldown));
    ultBtn.style.setProperty('--k', String(s.ult / RUN.ult.max));
    ultBtn.classList.toggle('ready', s.ult >= RUN.ult.max);
    if (s.pending && overlay.hidden) showChoices();
    if (s.result && !ended) setTimeout(() => finish(), s.result === 'lose' ? 900 : 1600);
  };
  raf = requestAnimationFrame(loop);
  stopRun = () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('keyup', onKey);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    window.removeEventListener('resize', resize);
    stopRun = null;
  };
}

/** 무공 레벨업 카드: 무엇이 오르나 */
function levelDiff(id: string, lv: number): string {
  const w = WEAPONS.get(id)!;
  const a = w.levels[lv - 2];
  const b = w.levels[lv - 1];
  const out: string[] = [];
  if (b.damage !== a.damage) out.push(`피해 ${a.damage}→${b.damage}`);
  if (b.cooldown !== a.cooldown) out.push(`대기 ${a.cooldown}→${b.cooldown}초`);
  if (b.count !== a.count) out.push(`${w.kind === 'slash' ? '방향' : '개수'} ${a.count}→${b.count}`);
  if (b.area !== a.area) out.push(`범위 +${Math.round((b.area / a.area - 1) * 100)}%`);
  if (b.pierce !== a.pierce && b.pierce) out.push(b.pierce >= 99 ? '모두 관통' : `관통 ${b.pierce}`);
  if (b.duration !== a.duration && (w.kind === 'orbit' || w.kind === 'rain')) out.push(`지속 ${b.duration}초`);
  return out.join(' · ') || w.desc;
}

const screen = params.get('screen');
if (params.get('hero') || screen === 'run') void play(params.get('hero') ?? 'haun');
else if (screen === 'select') select();
else title();

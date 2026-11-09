// 「결」 목업(2026-11-09): 상대 고르기 → 대결 또는 박자 도전 → 결과.
// 입력: 받기 K·Space, 베기 J·화면 클릭, 피하기 L·Shift, Esc 상대 고르기. 휴대폰은 세 버튼.
import { initAudio, sfx } from '../../src/render/audio';
import { frameUrl } from '../../src/render/assets';
import raw from '../data/duel.json';
import { advance, createDuel, isOpen, press, rhythmScore, streakTier, type DuelData, type Element, type FoeDef, type Judgement, type Mode } from './duel';
import { addShake, CONTACT, draw, ELEMENT_COLOR, emptyFx, FOE_X, H, ICON, judge, loadSprites, PLAYER_X, pruneFx, W, type Fx, type JudgeWord, type Sprites } from './render';
import './style.css';

const data = raw as unknown as DuelData;
const app = document.getElementById('app')!;
let stopLoop: (() => void) | null = null;

const ELEMENT_NAME: Record<Element, string> = { fire: '화염', ice: '냉기', lightning: '번개' };
const WORD: Record<Judgement, JudgeWord> = { excellent: 'EXCELLENT', great: 'GREAT', good: 'GOOD', miss: 'MISS' };
const BEST_KEY = 'gyeol.rhythmBest';
const GROUND_TEXT_Y = CONTACT.y - 150;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  e.append(...kids);
  return e;
}

function readBest(): Record<string, { accuracy: number; rank: string }> {
  try {
    return JSON.parse(localStorage.getItem(BEST_KEY) ?? '{}') as Record<string, { accuracy: number; rank: string }>;
  } catch {
    return {};
  }
}
function writeBest(id: string, accuracy: number, rank: string): boolean {
  const best = readBest();
  if ((best[id]?.accuracy ?? -1) >= accuracy) return false;
  best[id] = { accuracy, rank };
  try {
    localStorage.setItem(BEST_KEY, JSON.stringify(best));
  } catch {
    // 저장이 막힌 브라우저면 이번 판만
  }
  return true;
}

function elementsOf(f: FoeDef): Element[] {
  return [...new Set(Object.values(f.moves).map((m) => m.element).filter((e): e is Element => !!e))];
}

function title(): void {
  stopLoop?.();
  const best = readBest();
  const cards = data.foes.map((f) => {
    const img = frameUrl(`${f.sprite}_idle`, 1);
    const fight = el('button', { class: 'btn primary', type: 'button' }, '대결');
    fight.addEventListener('click', () => void play(f, 'duel'));
    const rhythm = el('button', { class: 'btn', type: 'button' }, '박자 도전');
    rhythm.addEventListener('click', () => void play(f, 'rhythm'));
    const tags = elementsOf(f).map((e) => el('span', { class: `tag el-${e}` }, ELEMENT_NAME[e]));
    const b = best[f.id];
    return el(
      'article',
      { class: 'foe-card' },
      img ? el('img', { src: img, alt: '' }) : '',
      el('div', { class: 'foe-text' }, el('b', {}, f.title), el('div', { class: 'tags' }, ...tags), el('small', {}, f.note), b ? el('small', { class: 'best' }, `박자 도전 최고 ${b.rank} · ${Math.round(b.accuracy * 100)}%`) : ''),
      el('div', { class: 'foe-actions' }, fight, rhythm),
    );
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
        el('p', {}, el('kbd', {}, 'K'), '·', el('kbd', {}, 'Space'), ' 받기 — 좁혀 드는 고리가 과녁 고리와 겹칠 때(금빛) 누르면 패링. 이르면 막기.'),
        el('p', {}, el('kbd', {}, 'L'), '·', el('kbd', {}, 'Shift'), ' 피하기 — ', el('b', { class: 'danger' }, '붉은 결(危)'), '은 받을 수 없다. 제때 피하면 간파로 틈이 열린다.'),
        el('p', {}, el('kbd', {}, 'J'), '·화면 클릭 베기 — 패링·간파 뒤 적에게 금이 보이는 동안 베면 반격(3배). 적 체간이 가득 차면 결정타.'),
        el('p', {}, '속임수: 고리가 과녁에 닿아도 치지 않고 멈춘다. "…지금!"이 뜨면 다시 좁혀 드는 진짜 결을 받는다.'),
        el('p', {}, '원소: ', el('span', { class: 'tag el-fire' }, '화염'), ' 받아도 화상 · ', el('span', { class: 'tag el-ice' }, '냉기'), ' 느리다 마지막에 빨라진다 · ', el('span', { class: 'tag el-lightning' }, '번개'), ' 박자가 튄다.'),
        el('p', {}, '패링·간파가 이어지면 연속 박자 — 3·6·10번째에 기운이 세지고 체간을 더 깎는다.'),
      ),
      el('p', { class: 'proto' }, '목업 · 하운의 받기·피하기 동작과 결 이펙트·기운·아이콘은 Codex 그림이 오면 자동으로 바뀐다'),
    ),
  );
}

async function play(foeDef: FoeDef, mode: Mode): Promise<void> {
  stopLoop?.();
  const seed = `${foeDef.id}-${Date.now().toString(36)}`;
  const d = createDuel(data, foeDef.id, seed, mode);
  const rhythm = mode === 'rhythm';
  const canvas = el('canvas', { width: String(W), height: String(H), class: 'field', 'aria-label': `${foeDef.title}와의 ${rhythm ? '박자 도전' : '대결'}` });
  const ctx = canvas.getContext('2d')!;
  const foeHp = el('i'), foePosture = el('i'), myHp = el('i'), myPosture = el('i'), progress = el('i');
  const streakEl = el('div', { class: 'streak' });
  const scoreEl = el('div', { class: 'score' });
  const hud = el(
    'div',
    { class: `hud${rhythm ? ' rhythm' : ''}` },
    el(
      'div',
      { class: 'foe-bar' },
      el('b', {}, rhythm ? `${foeDef.title} — ${foeDef.chart!.title}` : foeDef.title),
      rhythm ? el('div', { class: 'bar progress' }, progress) : el('div', { class: 'bar hp' }, foeHp),
      rhythm ? '' : el('div', { class: 'bar posture' }, foePosture),
    ),
    rhythm ? scoreEl : el('div', { class: 'me-bar' }, el('b', {}, data.player.name), el('div', { class: 'bar hp' }, myHp), el('div', { class: 'bar posture' }, myPosture)),
    streakEl,
  );
  const attackBtn = el('button', { class: 'pad attack', type: 'button' }, '베기', el('small', {}, 'J'));
  const dodgeBtn = el('button', { class: 'pad dodge', type: 'button' }, '피하기', el('small', {}, 'L'));
  const parryBtn = el('button', { class: 'pad parry', type: 'button' }, '받기', el('small', {}, 'K'));
  if (rhythm) attackBtn.disabled = true;
  const back = el('button', { class: 'back', type: 'button' }, '상대 고르기');
  back.addEventListener('click', title);
  const overlay = el('div', { class: 'result', hidden: '' });
  app.replaceChildren(el('section', { class: 'duel' }, el('div', { class: 'stage' }, canvas, hud, overlay), el('div', { class: 'pads' }, attackBtn, dodgeBtn, parryBtn, back)));

  // 점검용(?debug): 화면 점검 도구가 대결 상태를 읽어 제때 누를 수 있게
  if (new URLSearchParams(location.search).has('debug')) (window as unknown as { __gyeol?: unknown }).__gyeol = d;
  const sp: Sprites = await loadSprites(data.player.sprite, foeDef.sprite, foeDef.bg);
  const fx: Fx = emptyFx();
  let hitstopUntil = 0;
  let last = performance.now();
  let raf = 0;
  let alive = true;
  let lastTier = 0;

  const doPress = (input: 'parry' | 'attack' | 'dodge') => {
    if (!alive) return;
    if (press(d, input) && input === 'parry') fx.guardPose = performance.now();
  };
  attackBtn.addEventListener('pointerdown', (e) => (e.preventDefault(), doPress('attack')));
  dodgeBtn.addEventListener('pointerdown', (e) => (e.preventDefault(), doPress('dodge')));
  parryBtn.addEventListener('pointerdown', (e) => (e.preventDefault(), doPress('parry')));
  canvas.addEventListener('pointerdown', () => doPress('attack'));
  const onKey = (e: KeyboardEvent) => {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    if (k === 'k' || k === ' ') (e.preventDefault(), doPress('parry'));
    else if (k === 'j') doPress('attack');
    else if (k === 'l' || k === 'shift') (e.preventDefault(), doPress('dodge'));
    else if (k === 'escape') title();
  };
  window.addEventListener('keydown', onKey);

  const spark = (x: number, y: number, n: number, color: string, speed = 260, size = 4) => {
    const now = performance.now();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (i % 3) * 0.3;
      const v = speed * (0.5 + ((i * 37) % 10) / 10);
      fx.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120, born: now, life: 420 + ((i * 53) % 260), color, size });
    }
  };
  const text = (x: number, y: number, s: string, color: string, size = 34, icon?: number) => fx.texts.push({ x, y, text: s, color, born: performance.now(), size, icon });
  const flash = (color: string, life: number, strength = 0.55) => (fx.flash = { color, born: performance.now(), life, strength });
  const elColor = (e?: Element) => ELEMENT_COLOR[e ?? 'none'];
  const bloomColor = (e?: Element) => (e === 'fire' ? 'rgba(255,170,80,ALPHA)' : e === 'ice' ? 'rgba(170,235,255,ALPHA)' : e === 'lightning' ? 'rgba(210,160,255,ALPHA)' : 'rgba(255,214,120,ALPHA)');

  const handleEvents = () => {
    const now = performance.now();
    for (const ev of d.events) {
      switch (ev.type) {
        case 'parry': {
          sfx('block');
          sfx(ev.element === 'lightning' ? 'lightning' : ev.element === 'ice' ? 'ice' : ev.element === 'fire' ? 'fire' : 'snap', { volume: 0.8 });
          fx.blooms.push({ x: CONTACT.x - 20, y: CONTACT.y, born: now, color: bloomColor(ev.element), big: ev.heavy });
          spark(CONTACT.x - 20, CONTACT.y, ev.heavy ? 30 : 20, elColor(ev.element).spark, ev.heavy ? 380 : 300);
          judge(fx, WORD[ev.judgement], '결', now);
          // 무거운 공격을 받아칠수록 세게 흔들리고 오래 멈칫한다
          const dmg = d.foeDef.moves[ev.move].damage;
          addShake(fx, now, 3 + dmg * 0.4, ev.heavy ? 260 : 170);
          hitstopUntil = now + (ev.heavy ? 120 : 70);
          if (ev.heavy) flash('#fff3c4', 160, 0.35);
          break;
        }
        case 'mikiri':
          sfx('swirl');
          sfx('snap', { volume: 0.7 });
          spark(PLAYER_X + 40, CONTACT.y + 20, 16, '#ff9a8a', 260);
          judge(fx, WORD[ev.judgement], '간파', now);
          addShake(fx, now, 8, 220);
          hitstopUntil = now + 90;
          break;
        case 'evade':
          sfx('swirl', { volume: 0.6 });
          judge(fx, 'GOOD', '피함', now);
          break;
        case 'guard':
          sfx('block', { volume: 0.7 });
          spark(CONTACT.x - 30, CONTACT.y, 10, elColor(ev.element).spark, 180);
          judge(fx, 'GOOD', '막음', now);
          if (!rhythm) text(PLAYER_X, CONTACT.y - 30, `-${ev.damage}`, '#cfd6e6', 22);
          addShake(fx, now, 3 + d.foeDef.moves[ev.move].damage * 0.25, 160);
          break;
        case 'burn':
          text(PLAYER_X + 30, CONTACT.y - 40, `화상 -${ev.damage}`, '#ffae6a', 20);
          break;
        case 'feint':
          text(FOE_X, GROUND_TEXT_Y, '속임수!', '#ffe9b0', 24);
          break;
        case 'guardBreak':
          sfx('hit_heavy');
          text(PLAYER_X, CONTACT.y - 120, '자세가 무너졌다', '#ff9a8a', 28);
          addShake(fx, now, 12, 280);
          break;
        case 'hit': {
          sfx(ev.heavy ? 'hit_heavy' : 'hit');
          const sprite = ev.element === 'fire' ? 'fx_hit_fire' : ev.element === 'ice' ? 'fx_hit_ice' : ev.element === 'lightning' ? 'fx_hit_shock' : 'fx_hit_blunt';
          fx.bursts.push({ x: PLAYER_X + 10, y: CONTACT.y + 10, sprite, born: now, scale: ev.heavy ? 1.1 : 0.8 });
          // 강한 공격일수록 화면이 세게 흔들린다(피해 비례, 받을 수 없는 공격은 더)
          const power = 4 + ev.damage * 0.6 + (ev.unblockable ? 6 : 0);
          addShake(fx, now, power, ev.heavy ? 380 : 220);
          flash('#ff3b3b', ev.heavy ? 260 : 180, ev.heavy ? 0.6 : 0.45);
          if (ev.heavy) hitstopUntil = now + 90;
          judge(fx, 'MISS', '놓침', now);
          if (!rhythm) text(PLAYER_X, CONTACT.y - 30, `-${ev.damage}`, '#ff8a7a', ev.heavy ? 34 : 28);
          break;
        }
        case 'strike':
          sfx(ev.counter ? 'crit' : 'slash');
          fx.bursts.push({ x: FOE_X - 10, y: CONTACT.y + 10, sprite: 'fx_hit_slash', born: now, scale: ev.counter ? 1.1 : 0.8 });
          judge(fx, ev.counter ? 'COUNTER' : 'HIT', ev.counter ? '반격' : '', now, 'foe');
          text(FOE_X + 50, CONTACT.y - 40, `${ev.damage}`, ev.counter ? '#ffb15c' : '#ffffff', ev.counter ? 30 : 22);
          if (ev.counter) {
            spark(FOE_X - 20, CONTACT.y, 14, '#ffb15c', 260);
            addShake(fx, now, 6, 160);
            hitstopUntil = now + 60;
          }
          break;
        case 'streak': {
          const tier = streakTier(d);
          if (tier > lastTier) {
            const names = ['', '결이 보인다', '결을 탄다', '결과 하나가 된다'];
            text(PLAYER_X, CONTACT.y - 160, names[Math.min(3, tier)], tier >= 3 ? '#fff0c0' : tier === 2 ? '#ffd27a' : '#9fd8ff', 26);
            sfx('power', { volume: 0.6 });
            flash(tier >= 3 ? '#fff3c4' : '#9fd0ff', 220, 0.25);
          }
          lastTier = tier;
          break;
        }
        case 'stagger':
          sfx('snap');
          judge(fx, 'BREAK', '체간이 무너졌다 — 베어라!', now, 'foe');
          flash('#fff3c4', 200);
          addShake(fx, now, 8, 220);
          break;
        case 'recover':
          text(FOE_X, CONTACT.y - 140, '자세를 되찾았다', '#c9c3d6', 22);
          break;
        case 'deathblow':
          sfx('slam_9');
          fx.slashes.push({ born: now });
          spark(FOE_X - 10, CONTACT.y, 40, '#ffe6a0', 440, 5);
          text(FOE_X, CONTACT.y - 120, `결정타 ${ev.damage}`, '#ffe08a', 44);
          flash('#ffffff', 300, 0.7);
          addShake(fx, now, 18, 420);
          hitstopUntil = now + 200;
          break;
        case 'win':
          sfx('victory');
          finish();
          break;
        case 'lose':
          sfx('defeat');
          finish();
          break;
        case 'judge':
          break;
      }
    }
    d.events.length = 0;
    if (streakTier(d) < lastTier) lastTier = streakTier(d);
  };

  const finish = () => {
    setTimeout(() => {
      if (!alive) return;
      const s = d.stats;
      const again = el('button', { class: 'btn primary', type: 'button' }, '다시');
      again.addEventListener('click', () => void play(foeDef, mode));
      const pick = el('button', { class: 'btn', type: 'button' }, '상대 고르기');
      pick.addEventListener('click', title);
      if (rhythm) {
        const sc = rhythmScore(d);
        const newBest = writeBest(foeDef.id, sc.accuracy, sc.rank);
        const rankIcon = frameUrl('icons_gyeol', ICON[sc.rank], { realOnly: true });
        overlay.replaceChildren(
          el('p', { class: 'kicker' }, `${foeDef.chart!.title} — 박자 도전`),
          rankIcon ? el('img', { class: 'rank-icon', src: rankIcon, alt: `등급 ${sc.rank}` }) : el('div', { class: `rank rank-${sc.rank}` }, sc.rank),
          el('p', {}, `정확도 ${Math.round(sc.accuracy * 100)}%`),
          el(
            'div',
            { class: 'judge-row' },
            el('span', { class: 'j-excellent' }, `EXCELLENT ${s.excellent}`),
            el('span', { class: 'j-great' }, `GREAT ${s.perfect - s.excellent}`),
            el('span', { class: 'j-good' }, `GOOD ${s.good}`),
            el('span', { class: 'j-miss' }, `MISS ${s.miss}`),
          ),
          el('p', { class: 'time' }, `최대 연속 박자 ${s.maxStreak}${newBest ? ' · 최고 기록!' : ''}`),
          el('div', { class: 'row' }, again, pick),
        );
      } else {
        overlay.replaceChildren(
          el('h2', {}, d.result === 'win' ? `${foeDef.title}을(를) 베었다` : '쓰러졌다'),
          el('p', {}, `패링 ${s.parries} · 피하기 ${s.dodges} · 막기 ${s.guards} · 맞음 ${s.hits} · 반격 ${s.counters} · 결정타 ${s.deathblows}`),
          el('p', { class: 'time' }, `최대 연속 박자 ${s.maxStreak} · ${(d.t / 1000).toFixed(1)}초`),
          el('div', { class: 'row' }, again, pick),
        );
      }
      overlay.hidden = false;
      again.focus();
    }, 900);
  };

  const steps = foeDef.chart?.steps ?? [];
  const chartEnd = steps.length ? steps[steps.length - 1].at : 1;
  const bars = () => {
    if (rhythm) {
      progress.style.width = `${Math.min(1, d.t / chartEnd) * 100}%`;
      const sc = rhythmScore(d);
      scoreEl.textContent = sc.total ? `정확도 ${Math.round(sc.accuracy * 100)}% · EXCELLENT ${d.stats.excellent} · GREAT ${d.stats.perfect - d.stats.excellent} · GOOD ${d.stats.good} · MISS ${d.stats.miss}` : '결을 받아라';
    } else {
      foeHp.style.width = `${(d.foe.hp / foeDef.hp) * 100}%`;
      foePosture.style.width = `${Math.min(1, d.foe.posture / foeDef.posture) * 100}%`;
      myHp.style.width = `${(d.player.hp / data.player.hp) * 100}%`;
      myPosture.style.width = `${Math.min(1, d.player.posture / data.player.posture) * 100}%`;
    }
    const tier = streakTier(d);
    streakEl.textContent = d.streak >= 2 ? `연속 박자 ${d.streak}` : '';
    streakEl.className = `streak tier-${tier}`;
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
if (direct) void play(direct, params.has('rhythm') ? 'rhythm' : 'duel');
else title();

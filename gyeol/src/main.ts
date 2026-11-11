// 「결」(2026-11-10 2단계): 시작 → 로비 → 결투장·박자 도전·수련장·기록 → 대결 → 결과. 대결 밖의 화면은 screens.ts.
// 입력: 받기 K·Space, 베기 J·화면 클릭, 피하기 L·Shift, 기술 I, 집중 U, Esc 상대 고르기. 휴대폰은 버튼.
// 4차(2026-11-09): 칼 맞부딪힘 겨루기(J·K 연타), 위기(배수의 진), 집중(심안), 적별 결정타, 날씨 입자, 적 도발·하운 대사.
import { initAudio, setVolumes, sfx } from '../../src/render/audio';
import { frameUrl } from '../../src/render/assets';
import { applyUiArt, el, padIcon, rankBadge, realArt, toast } from './dom';
import { announceAchievements } from './screens';
import { outfitPrefix } from './progress';
import raw from '../data/duel.json';
import { advance, betterRank, createDuel, cue, duelGrade, isFocusing, isOpen, press, rhythmScore, streakTier, techOf, type DuelData, type DuelRank, type Element, type FoeDef, type Judgement, type LineKey, type Mode } from './duel';
import { heartbeat } from './heart';
import { loadSave, writeSave, type Quality } from './save';
import { askWhich } from './account';
import { bootCloud, trainingTarget } from './cloud';
import { duelXp, gainXp } from './training';
import { openSettings } from './settings';
import { renderStory, story } from './story';
import { renderArena, renderCalibrate, renderLobby, renderPractice, renderRecords, renderRhythm, renderWardrobe, renderTitle, setKeys, type Nav, type PlayOpts, type Screen } from './screens';
import { createWeather, gust } from './scene';
import { addShake, setRenderQuality, setShakeScale, CONTACT, draw, ELEMENT_COLOR, emptyFx, FOE_X, H, ICON, judge, loadSprites, PLAYER_X, pruneFx, TECH_COLOR, W, type Fx, type JudgeWord, type Sprites } from './render';
import './style.css';

const data = raw as unknown as DuelData;
const app = document.getElementById('app')!;
let stopLoop: (() => void) | null = null;

const WORD: Record<Judgement, JudgeWord> = { perfect: 'PERFECT', excellent: 'EXCELLENT', good: 'GOOD', miss: 'MISS' };
const GROUND_TEXT_Y = CONTACT.y - 150;

function writeBest(id: string, accuracy: number, rank: string): boolean {
  const save = loadSave();
  if ((save.rhythmBest[id]?.accuracy ?? -1) >= accuracy) return false;
  save.rhythmBest[id] = { accuracy, rank };
  writeSave(save);
  return true;
}

/**
 * 화면 품질(7-4절): 설정이 auto면 high에서 시작해, 대결 중 프레임이 계속 느리면(1.5초 평균 20ms 넘음) 한 단계씩 내린다.
 * 내린 단계는 이번 판(페이지) 동안 기억한다.
 */
let autoQuality: Exclude<Quality, 'auto'> = 'high';
const currentQuality = (): Exclude<Quality, 'auto'> => {
  const q = loadSave().settings.quality;
  return q === 'auto' ? autoQuality : q;
};

/** 설정을 소리·흔들림에 반영한다 */
function applySettings(): void {
  const st = loadSave().settings;
  setVolumes({ master: st.master, bgm: st.bgm, sfx: st.sfx });
  setShakeScale(st.shake);
}

/** 화면 사이 이동 */
const nav: Nav = {
  go(s: Screen) {
    stopLoop?.();
    setKeys(null);
    document.querySelector('.settings-panel')?.remove();
    if (s !== 'title') document.documentElement.classList.remove('on-title');
    window.scrollTo(0, 0);
    if (s === 'title') renderTitle(app, nav);
    else if (s === 'lobby') renderLobby(app, nav);
    else if (s === 'arena') renderArena(app, nav, data);
    else if (s === 'rhythm') renderRhythm(app, nav, data);
    else if (s === 'practice') renderPractice(app, nav, data);
    else if (s === 'records') renderRecords(app, nav, data);
    else if (s === 'wardrobe') renderWardrobe(app, nav);
    else if (s === 'calibrate') renderCalibrate(app, nav);
    else if (s === 'story') renderStory(app, nav, data);
  },
  stop() {
    stopLoop?.();
    setKeys(null);
  },
  play(foe, mode, opts) {
    setKeys(null);
    void play(foe, mode, opts);
  },
  settings() {
    openSettings(applySettings);
  },
};

const BACK_LABEL: Partial<Record<Screen, string>> = { arena: '결투장으로', rhythm: '수련장으로', practice: '수련장으로', lobby: '로비로', story: '이야기 지도' };

async function play(foeDef0: FoeDef, mode: Mode, opts: PlayOpts = { back: 'lobby' }): Promise<void> {
  stopLoop?.();
  document.documentElement.classList.remove('on-title');
  window.scrollTo(0, 0);
  const seed = `${foeDef0.id}-${Date.now().toString(36)}`;
  // 수련장: 고른 수련 종류의 패턴으로 바꿔 낀 철목인
  const drill = foeDef0.drills?.find((x) => x.id === opts.drill);
  const foeDef: FoeDef = drill ? { ...foeDef0, patterns: drill.patterns } : foeDef0;
  const playData: DuelData = drill ? { ...data, foes: data.foes.map((f) => (f.id === foeDef.id ? foeDef : f)) } : data;
  const d = createDuel(playData, foeDef.id, seed, mode, opts.difficulty ?? 'main', { ...(opts.duel ?? {}) });
  const tutorial = opts.tutorial;
  const practice = mode === 'practice';
  const leave = () => (tutorial ? (stopLoop?.(), opts.onTutorialDone?.(true)) : nav.go(opts.back));
  const rhythm = mode === 'rhythm';
  const canvas = el('canvas', { width: String(W), height: String(H), class: 'field', 'aria-label': `${foeDef.title}와의 ${rhythm ? '박자 도전' : '대결'}` });
  const ctx = canvas.getContext('2d')!;
  const foeHp = el('i', { class: 'fill' }), foePosture = el('i', { class: 'fill' }), myHp = el('i', { class: 'fill' }), myPosture = el('i', { class: 'fill' }), myFocus = el('i', { class: 'fill' }), progress = el('i');
  // 잔상 막대(2026-11-11): 깎인 만큼 밝은 띠가 잠깐 남았다가 따라 줄어든다
  const foeHpLag = el('i', { class: 'lag' }), myHpLag = el('i', { class: 'lag' });
  const myHpNum = el('span', { class: 'hp-num' }), foeHpNum = el('span', { class: 'hp-num' });
  const face = realArt('haun_gyeol_stand') ?? frameUrl('haun_sword_stand', 1);
  const streakEl = el('div', { class: 'streak' });
  const phasePips = el('span', { class: 'phase-pips' });
  const gimmickEl = el('span', { class: 'gimmicks' });
  const scoreEl = el('div', { class: 'score' });
  const hud = el(
    'div',
    { class: `hud${rhythm ? ' rhythm' : ''}` },
    el(
      'div',
      { class: 'foe-bar' },
      el('b', {}, rhythm ? `${foeDef.title} — ${foeDef.chart!.title}` : foeDef.title),
      rhythm ? el('div', { class: 'bar progress' }, progress) : el('div', { class: 'bar hp' }, foeHpLag, foeHp, el('span', { class: 'gloss' }), foeHpNum),
      rhythm ? '' : el('div', { class: 'bar posture' }, foePosture, el('span', { class: 'gloss' })),
      // 단계 점(◆ 지금·지난 단계, ◇ 남은 단계)과 기믹 표식(갑옷·재생·가속·결 가림)
      rhythm ? '' : el('div', { class: 'foe-phase' }, phasePips, gimmickEl),
    ),
    // 하운 이름판(2026-11-11): 얼굴 인장 + 이름·체력 숫자 + 굵은 체력 막대 + 이름 붙은 체간·집중 막대
    rhythm
      ? scoreEl
      : el(
          'div',
          { class: 'me-bar' },
          el('div', { class: 'me-face', style: face ? `background-image:url("${face}")` : '' }, face ? '' : el('b', {}, '雲')),
          el(
            'div',
            { class: 'me-body' },
            el('div', { class: 'me-name' }, el('b', {}, data.player.name), myHpNum),
            el('div', { class: 'bar hp' }, myHpLag, myHp, el('span', { class: 'gloss' })),
            el('div', { class: 'bar-row' }, el('em', {}, '체간'), el('div', { class: 'bar posture' }, myPosture, el('span', { class: 'gloss' }))),
            el('div', { class: 'bar-row' }, el('em', {}, '집중'), el('div', { class: 'bar focus' }, myFocus, el('span', { class: 'gloss' }))),
          ),
        ),
    streakEl,
  );
  const attackBtn = el('button', { class: 'pad attack', type: 'button' }, padIcon('attack'), '베기', el('small', {}, 'J'));
  const dodgeBtn = el('button', { class: 'pad dodge', type: 'button' }, padIcon('dodge'), '피하기', el('small', {}, 'L'));
  const parryBtn = el('button', { class: 'pad parry', type: 'button' }, padIcon('parry'), '받기', el('small', {}, 'K'));
  const techName = el('span', { class: 'tech-name' }, '기술');
  const techBtn = el('button', { class: 'pad tech', type: 'button', disabled: '' }, padIcon('tech'), techName, el('small', {}, 'I'));
  const focusBtn = el('button', { class: 'pad focus', type: 'button', disabled: '' }, padIcon('focus'), '집중', el('small', {}, 'U'));
  // 이야기에서 아직 배우지 않은 것은 잠가 둔다
  if (opts.duel?.focus === false) focusBtn.classList.add('locked');
  const cutin = el('div', { class: 'cutin', hidden: '' });
  if (rhythm) attackBtn.disabled = true;
  // 나가기 버튼 대신 일시 정지(2026-11-11 사용자 요청): Esc 또는 오른쪽 위 ⏸ — 계속 · 다시 · 나가기
  const leaveLabel = tutorial ? '서장 건너뛰기' : practice ? '그만하기' : (BACK_LABEL[opts.back] ?? '나가기');
  const pauseBtn = el('button', { class: 'pause-btn', type: 'button', 'aria-label': '일시 정지 (Esc)', title: '일시 정지 (Esc)' }, el('span', { 'aria-hidden': 'true' }, '❚❚'));
  const resumeBtn = el('button', { class: 'res-btn primary', type: 'button' }, el('b', {}, '계속'), el('small', {}, 'Esc'));
  const pauseAgain = el('button', { class: 'res-btn', type: 'button' }, el('b', {}, '처음부터'));
  const pauseLeave = el('button', { class: 'res-btn', type: 'button' }, el('b', {}, leaveLabel));
  const pauseEl = el(
    'div',
    { class: 'pause', hidden: '', role: 'dialog', 'aria-modal': 'true', 'aria-label': '일시 정지' },
    el('div', { class: 'pause-box' }, el('p', { class: 'pause-mark', 'aria-hidden': 'true' }, '止'), el('h2', {}, '일시 정지'), el('p', { class: 'kicker' }, opts.title ?? foeDef.title), el('div', { class: 'res-row' }, resumeBtn, pauseAgain, pauseLeave)),
  );
  const overlay = el('div', { class: 'result', hidden: '' });
  // 버티기(곽도진): 받아 낸 수, 처음 나오는 순간 안내 카드, 서장 튜토리얼 판
  const surviveEl = el('div', { class: 'survive', hidden: '' });
  const tipEl = el('div', { class: 'tip-card', hidden: '' });
  const tutTitle = el('b', {}), tutSay = el('p', { class: 'tut-say' }), tutGoal = el('p', { class: 'tut-goal' });
  const tutPanel = el('div', { class: 'tut-panel', hidden: '' }, tutTitle, tutSay, tutGoal);
  const loading = el('div', { class: 'loading' }, el('span', {}, '결을 고르는 중…'));
  const fsBtn = el('button', { class: 'fs', type: 'button', 'aria-label': '전체 화면', title: '전체 화면' }, '⛶');
  fsBtn.addEventListener('click', () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  });
  if (!document.fullscreenEnabled) fsBtn.hidden = true;
  const hint = el('p', { class: 'rotate-hint' }, '휴대폰을 가로로 돌리면 화면이 커지고 버튼이 양손 엄지 자리로 갑니다');
  app.replaceChildren(el('section', { class: 'duel' }, el('div', { class: 'stage' }, canvas, hud, surviveEl, tutPanel, tipEl, cutin, overlay, pauseEl, loading, pauseBtn, fsBtn), el('div', { class: 'pads' }, attackBtn, dodgeBtn, parryBtn, techBtn, focusBtn), hint));

  // 점검용(?debug): 화면 점검 도구가 대결 상태를 읽어 제때 누를 수 있게
  if (new URLSearchParams(location.search).has('debug')) (window as unknown as { __gyeol?: unknown }).__gyeol = d;
  const skillFx = [...new Set(Object.values(foeDef.moves).map((m) => m.fx).filter((x): x is string => !!x))];
  const sp: Sprites = await loadSprites(data.player.sprite, foeDef.sprite, foeDef.bg, skillFx, foeDef.id, outfitPrefix(loadSave()));
  loading.remove();
  // 대결 중 화면이 꺼지지 않게(지원하는 브라우저만)
  let wake: { release(): Promise<void> } | null = null;
  void (navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock
    ?.request('screen')
    .then((w) => (wake = w))
    .catch(() => undefined);
  // 품질: high면 고해상도 화면에서 캔버스를 그만큼 키운다(최대 2배)
  let quality = currentQuality();
  const fitCanvas = () => {
    setRenderQuality(quality);
    // 보통도 큰 화면(PC 전체 높이로 키운 전투 화면)에서는 1.5배까지 — 글자·판정 표시가 뭉개지지 않게
    const want = ((window.devicePixelRatio || 1) * canvas.clientWidth) / W;
    const k = quality === 'high' ? Math.min(2, Math.max(1, Math.round(want * 2) / 2)) : quality === 'normal' && want >= 1.4 ? 1.5 : 1;
    if (canvas.width !== W * k) {
      canvas.width = W * k;
      canvas.height = H * k;
    }
    // 화면 위 글·이름판(HUD)도 캔버스가 960px보다 커진 만큼 키운다(PC 전체 화면)
    if (canvas.clientWidth) canvas.parentElement?.style.setProperty('--ui', (canvas.clientWidth / W).toFixed(3));
  };
  fitCanvas();
  const resizeObs = new ResizeObserver(() => fitCanvas());
  resizeObs.observe(canvas);
  const fx: Fx = emptyFx();
  fx.weather = createWeather(foeDef.weather);
  fx.clashOn = mode === 'duel' && opts.duel?.clash !== false;
  if (practice) fx.practice = { marks: [], drill: drill?.name ?? '수련' };
  let hitstopUntil = 0;
  /** 일시 정지: 대결 시계·입력을 멈춘다. 풀 때 멈춘 동안만큼 멈칫·느린 화면 시각을 뒤로 민다 */
  let paused = false;
  let pausedAt = 0;
  const setPause = (on: boolean) => {
    if (on === paused || !alive) return;
    if (on && (d.result || !overlay.hidden)) return;
    paused = on;
    pauseEl.hidden = !on;
    pauseBtn.classList.toggle('on', on);
    const now = performance.now();
    if (on) {
      pausedAt = now;
      sfx('click');
      requestAnimationFrame(() => resumeBtn.focus());
    } else {
      const gap = now - pausedAt;
      hitstopUntil += gap;
      slowUntil += gap;
      lastReal = now;
    }
  };
  pauseBtn.addEventListener('click', () => setPause(!paused));
  resumeBtn.addEventListener('click', () => setPause(false));
  pauseAgain.addEventListener('click', () => void play(foeDef0, mode, opts));
  pauseLeave.addEventListener('click', () => {
    paused = false;
    leave();
  });
  /** 서장 튜토리얼 단계의 느린 화면 배율(도움) */
  let tutSlow = 1;
  /** 대결 시계를 마지막으로 민 실제 시각(입력 시각 보정의 기준) */
  let lastReal = performance.now();
  let raf = 0;
  let alive = true;
  let lastTier = 0;
  /** 끝 장면 느린 화면: 이 시각까지 대결 시계를 slowRate배로 민다 */
  let slowUntil = 0;
  const slowRate = 0.25;
  /** 받을 수 없는 기술이 터질 때 전용 이펙트(Codex fx_gyeol_skill_*)가 없으면 원소 타격 이펙트를 크게 */
  const skillBurst = (moveId: string, now: number, x: number) => {
    const m = d.foeDef.moves[moveId];
    if (!m?.unblockable) return;
    if (m.fx && sp.fx[m.fx]) fx.bursts.push({ x, y: CONTACT.y, sprite: m.fx, born: now, scale: 1.7 });
    else {
      const sprite = m.element === 'fire' ? 'fx_hit_fire' : m.element === 'ice' ? 'fx_hit_ice' : m.element === 'lightning' ? 'fx_hit_shock' : 'fx_hit_blunt';
      fx.bursts.push({ x, y: CONTACT.y, sprite, born: now, scale: 1.9 });
      spark(x, CONTACT.y, 24, ELEMENT_COLOR[m.element ?? 'danger'].spark, 360, 5);
    }
  };

  // 대사: 순간마다 여러 줄을 돌려 가며(첫 줄은 판마다 다르게)
  let lineSeed = 0;
  for (const ch of seed) lineSeed = (lineSeed * 31 + ch.charCodeAt(0)) >>> 0;
  const lineTurn: Partial<Record<string, number>> = {};
  const say = (who: 'player' | 'foe', key: LineKey, delay = 0, text?: string) => {
    if (rhythm) return;
    const pool = who === 'player' ? data.player.lines?.[key] : foeDef.lines?.[key];
    const id = `${who}:${key}`;
    const n = lineTurn[id] ?? lineSeed;
    lineTurn[id] = n + 1;
    const line = text ?? (pool?.length ? pool[n % pool.length] : null);
    if (!line) return;
    const born = performance.now() + delay;
    fx.bubbles = fx.bubbles.filter((b) => b.who !== who || b.born > born);
    fx.bubbles.push({ who, text: line, born, life: 1300 + line.length * 45 });
  };
  let foeStaggered = false;
  let lastDeathblow = -1;
  let lastBeat = 0;
  let lastClashFx = 0;

  /** 지금 대결 시계가 실제 시간의 몇 배로 흐르는가(끝 장면·집중이면 느리게) */
  const rateAt = (real: number) => (real < slowUntil ? slowRate : isFocusing(d) ? data.rules.focusRate : tutSlow);
  /** 대결 시계를 실제 시각 real까지 민다(멈칫 동안은 멈춰 있다) */
  const advanceTo = (real: number) => {
    if (real <= lastReal) return;
    const from = Math.max(lastReal, Math.min(real, hitstopUntil));
    const dt = Math.min(50, real - from);
    if (dt > 0) advance(d, d.t + dt * rateAt(real));
    lastReal = real;
  };
  /**
   * 입력 시각 보정(7-4절): 누른 순간(event.timeStamp − 판정 보정)까지 대결 시계를 먼저 민 다음 누른다.
   * 화면이 그보다 이미 앞서 있으면(입력이 늦게 닿음) 그만큼 거슬러 올라간 시각으로 받기·피하기를 판정한다.
   */
  const doPress = (input: 'parry' | 'attack' | 'dodge' | 'tech' | 'focus', stamp: number) => {
    if (!alive || paused) return;
    const real = stamp - loadSave().settings.inputOffset;
    advanceTo(real);
    const at = real < lastReal ? d.t - (lastReal - real) * rateAt(real) : d.t;
    if (press(d, input, at) && input === 'parry') fx.guardPose = performance.now();
  };
  const onPad = (input: 'parry' | 'attack' | 'dodge' | 'tech' | 'focus') => (e: PointerEvent) => (e.preventDefault(), doPress(input, e.timeStamp));
  attackBtn.addEventListener('pointerdown', onPad('attack'));
  dodgeBtn.addEventListener('pointerdown', onPad('dodge'));
  parryBtn.addEventListener('pointerdown', onPad('parry'));
  techBtn.addEventListener('pointerdown', onPad('tech'));
  focusBtn.addEventListener('pointerdown', onPad('focus'));
  canvas.addEventListener('pointerdown', (e) => doPress('attack', e.timeStamp));
  const onKey = (e: KeyboardEvent) => {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    if (k === 'k' || k === ' ') (e.preventDefault(), doPress('parry', e.timeStamp));
    else if (k === 'j') doPress('attack', e.timeStamp);
    else if (k === 'l' || k === 'shift') (e.preventDefault(), doPress('dodge', e.timeStamp));
    else if (k === 'i') doPress('tech', e.timeStamp);
    else if (k === 'u') doPress('focus', e.timeStamp);
    else if (k === 'escape' || k === 'p') {
      e.preventDefault();
      // 결과가 떠 있으면 Esc = 나가기, 아니면 멈춤·계속
      if (!overlay.hidden) leave();
      else setPause(!paused);
    }
  };
  window.addEventListener('keydown', onKey);
  // 창을 떠나면(다른 탭·창) 저절로 멈춘다
  const onHide = () => {
    if (document.hidden) setPause(true);
  };
  const onBlur = () => setPause(true);
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('blur', onBlur);

  const spark = (x: number, y: number, count: number, color: string, speed = 260, size = 4) => {
    const now = performance.now();
    // 품질이 낮으면 불꽃 수를 줄인다
    const n = Math.max(1, Math.round(count * (quality === 'high' ? 1 : quality === 'normal' ? 0.6 : 0.35)));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (i % 3) * 0.3;
      const v = speed * (0.5 + ((i * 37) % 10) / 10);
      fx.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120, born: now, life: 420 + ((i * 53) % 260), color, size });
    }
  };
  const text = (x: number, y: number, s: string, color: string, size = 34, icon?: number) => fx.texts.push({ x, y, text: s, color, born: performance.now(), size, icon });
  // 번쩍임 줄이기(광과민 설정)면 세기를 크게 낮춘다
  const flash = (color: string, life: number, strength = 0.55) => (fx.flash = { color, born: performance.now(), life, strength: loadSave().settings.reduceFlash ? strength * 0.25 : strength });
  const elColor = (e?: Element) => ELEMENT_COLOR[e ?? 'none'];
  const bloomColor = (e?: Element) => (e === 'fire' ? 'rgba(255,170,80,ALPHA)' : e === 'ice' ? 'rgba(170,235,255,ALPHA)' : e === 'lightning' ? 'rgba(210,160,255,ALPHA)' : 'rgba(255,214,120,ALPHA)');

  // 수련장: 누른 시점(타격 몇 ms 전)을 화면 아래 막대에 찍는다
  const mark = (lead: number | null, kind: Judgement) => {
    if (!practice || !fx.practice) return;
    fx.practice.marks.push({ lead, kind, born: performance.now() });
    if (fx.practice.marks.length > 12) fx.practice.marks.shift();
  };
  // 처음 나오는 순간 안내(이야기 — 장마다 tips): 한 번만, 잠깐 느려지며 카드가 뜬다
  /** 화면 위 가운데 칩(버티기·금·비틀거림·숨 세기) */
  const chip = (textValue: string, warn = false) => {
    surviveEl.hidden = false;
    surviveEl.textContent = textValue;
    surviveEl.classList.toggle('warn', warn);
    surviveEl.classList.remove('bump');
    void surviveEl.offsetWidth;
    surviveEl.classList.add('bump');
  };
  /** 처음 한 번 안내. global이면 이야기 장이 아니어도(결투장에서도) 띄운다 — 단계·기믹 */
  const tip = (id: string, global = false) => {
    if (!global && !opts.tips?.includes(id)) return;
    if (tutorial) return;
    const save = loadSave();
    if (save.tips.includes(id)) return;
    const t = story.tips[id];
    if (!t) return;
    save.tips.push(id);
    writeSave(save);
    tipEl.replaceChildren(el('kbd', {}, t.key), el('p', {}, t.text));
    tipEl.hidden = false;
    slowUntil = performance.now() + 1400;
    setTimeout(() => (tipEl.hidden = true), 4200);
  };

  // 서장 튜토리얼(7-2-1): 단계마다 설명 → 따라 하기 → 통과
  let tutStep = -1;
  let tutCount = 0;
  let tutPassing = false;
  const hintPads: Record<string, HTMLButtonElement> = { parry: parryBtn, attack: attackBtn, dodge: dodgeBtn };
  const tutApply = () => {
    const st = tutorial![tutStep];
    tutCount = 0;
    tutPassing = false;
    if (st.drill) d.foeDef = { ...d.foeDef, patterns: st.drill };
    else d.foeDef = { ...d.foeDef, patterns: foeDef0.patterns };
    d.foe.pattern = null;
    d.opts.assistCue = !!st.assist.earlyCue;
    tutSlow = st.assist.slow ?? 1;
    fx.practice = st.assist.window ? { marks: [], drill: st.title } : undefined;
    fx.labels = !!st.assist.labels;
    for (const [k, b] of Object.entries(hintPads)) b.classList.toggle('hint', st.hint === k);
    if (st.final) {
      // 마지막 한 판: 진짜 대결(쓰러지지는 않는다), 철목인 체력은 줄여서
      d.mode = 'duel';
      d.opts.noLose = true;
      d.foeDef = { ...d.foeDef, hp: 120 };
      d.foe.hp = 120;
      d.foe.posture = 0;
    }
    tutTitle.textContent = `서장 · ${tutStep + 1}/${tutorial!.length}  ${st.title}`;
    tutSay.textContent = `왕일검: "${st.say}"`;
    tutGoalText();
    tutPanel.hidden = false;
    tutPanel.classList.remove('pass');
  };
  const tutGoalText = () => {
    const st = tutorial![tutStep];
    tutGoal.textContent = st.goal.count ? `${st.goalText}  ${Math.min(tutCount, st.goal.count)} / ${st.goal.count}` : st.goalText;
  };
  const tutEvent = (ev: (typeof d.events)[number]) => {
    if (!tutorial || tutStep < 0 || tutPassing) return;
    const st = tutorial[tutStep];
    const g = st.goal;
    const m = 'move' in ev ? d.foeDef.moves[ev.move] : undefined;
    const hit =
      (g.type === 'resolved' && (ev.type === 'hit' || ev.type === 'guard' || ev.type === 'parry' || ev.type === 'evade' || ev.type === 'mikiri')) ||
      (g.type === 'block' && (ev.type === 'guard' || ev.type === 'parry')) ||
      (g.type === 'parry' && ev.type === 'parry') ||
      (g.type === 'counter' && ev.type === 'strike' && ev.counter) ||
      (g.type === 'deathblow' && ev.type === 'deathblow') ||
      (g.type === 'mikiri' && ev.type === 'mikiri') ||
      (g.type === 'feintParry' && ev.type === 'parry' && !!m?.feint);
    if (!hit) return;
    tutCount++;
    tutGoalText();
    if (tutCount < (g.count ?? 1)) return;
    // 통과: 잠깐 뒤 다음 단계
    tutPassing = true;
    tutPanel.classList.add('pass');
    tutGoal.textContent = '통과!';
    sfx('power', { volume: 0.7 });
    setTimeout(() => {
      if (!alive) return;
      tutStep++;
      tutApply();
    }, 1400);
  };

  const handleEvents = () => {
    const now = performance.now();
    for (const ev of d.events) {
      tutEvent(ev);
      switch (ev.type) {
        case 'parry': {
          mark(ev.lead, ev.judgement);
          sfx('block');
          sfx(ev.element === 'lightning' ? 'lightning' : ev.element === 'ice' ? 'ice' : ev.element === 'fire' ? 'fire' : 'snap', { volume: 0.8 });
          fx.blooms.push({ x: CONTACT.x - 20, y: CONTACT.y, born: now, color: bloomColor(ev.element), big: ev.heavy });
          spark(CONTACT.x - 20, CONTACT.y, ev.heavy ? 30 : 20, elColor(ev.element).spark, ev.heavy ? 380 : 300);
          judge(fx, WORD[ev.judgement], '결', now);
          // 무거운 공격을 받아칠수록 세게 흔들리고 오래 멈칫한다
          const dmg = d.foeDef.moves[ev.move].damage;
          addShake(fx, now, 3 + dmg * 0.4, ev.heavy ? 260 : 170);
          hitstopUntil = now + (ev.heavy ? 120 : 70);
          if (ev.heavy) {
            flash('#fff3c4', 160, 0.35);
            gust(fx.weather, CONTACT.x, CONTACT.y, 380);
          }
          break;
        }
        case 'mikiri':
          skillBurst(ev.move, now, PLAYER_X + 70);
          sfx('swirl');
          sfx('snap', { volume: 0.7 });
          spark(PLAYER_X + 40, CONTACT.y + 20, 16, '#ff9a8a', 260);
          judge(fx, WORD[ev.judgement], '간파', now);
          addShake(fx, now, 8, 220);
          hitstopUntil = now + 90;
          break;
        case 'evade':
          skillBurst(ev.move, now, PLAYER_X + 70);
          sfx('swirl', { volume: 0.6 });
          judge(fx, 'GOOD', '피함', now);
          break;
        case 'guard':
          mark(ev.lead, 'good');
          sfx('block', { volume: 0.7 });
          spark(CONTACT.x - 30, CONTACT.y, 10, elColor(ev.element).spark, 180);
          judge(fx, 'GOOD', '막음', now);
          if (!rhythm) text(PLAYER_X - 50, CONTACT.y - 10, `-${ev.damage}`, '#cfd6e6', 22);
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
          if (!ev.unblockable) mark(ev.lead, 'miss');
          sfx(ev.heavy ? 'hit_heavy' : 'hit');
          const sprite = ev.element === 'fire' ? 'fx_hit_fire' : ev.element === 'ice' ? 'fx_hit_ice' : ev.element === 'lightning' ? 'fx_hit_shock' : 'fx_hit_blunt';
          fx.bursts.push({ x: PLAYER_X + 10, y: CONTACT.y + 10, sprite, born: now, scale: ev.heavy ? 1.1 : 0.8 });
          // 강한 공격일수록 화면이 세게 흔들린다(피해 비례, 받을 수 없는 공격은 더)
          const power = 4 + ev.damage * 0.6 + (ev.unblockable ? 6 : 0);
          addShake(fx, now, power, ev.heavy ? 380 : 220);
          flash('#ff3b3b', ev.heavy ? 260 : 180, ev.heavy ? 0.6 : 0.45);
          if (ev.heavy) hitstopUntil = now + 90;
          if (ev.heavy || ev.unblockable) gust(fx.weather, PLAYER_X, CONTACT.y, 300 + ev.damage * 10);
          skillBurst(ev.move, now, PLAYER_X + 10);
          judge(fx, 'MISS', '놓침', now);
          if (!rhythm) text(PLAYER_X - 50, CONTACT.y - 10, `-${ev.damage}`, '#ff8a7a', ev.heavy ? 34 : 28);
          break;
        }
        case 'strike':
          if (ev.blocked) {
            // 틈 밖의 베기: 적이 칼을 막는다(쇳소리, 작은 불꽃, 피해 1)
            sfx('block', { volume: 0.5 });
            spark(FOE_X - 40, CONTACT.y, 6, '#d8dde8', 160, 3);
            text(FOE_X - 10, CONTACT.y - 60, `막힘 ${ev.damage}`, '#b8bcc8', 20);
            break;
          }
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
        case 'punish':
          sfx('enrage', { volume: 0.7 });
          text(FOE_X, CONTACT.y - 150, '되받아친다!', '#ff8a7a', 26);
          addShake(fx, now, 5, 160);
          break;
        case 'skill': {
          // 받을 수 없는 기술: 이름을 외치며 나간다
          sfx('roar', { volume: 0.8 });
          fx.banner = { name: ev.name, born: now, element: d.foeDef.moves[ev.move]?.element };
          break;
        }
        case 'techReady': {
          tip('tech');
          const t = techOf(d, ev.tech)!;
          sfx('power', { volume: 0.8 });
          text(PLAYER_X + 60, CONTACT.y - 215, `「${t.name}」 준비 — I`, TECH_COLOR[t.id]?.core ?? '#fff6d6', 24);
          flash(TECH_COLOR[t.id]?.glow ?? '#ffd27a', 220, 0.25);
          break;
        }
        case 'tech': {
          // 기술: 컷인(반신 그림 + 이름 + 대사) 동안 잠깐 멈췄다가 연출이 터진다
          const t = techOf(d, ev.tech)!;
          sfx('cutin');
          hitstopUntil = now + 700;
          fx.tech = { id: t.id, born: now };
          // 컷인: Codex 기술 일러스트(cg_gyeol_tech_<id>)가 오면 화면을 덮는 그림으로, 없으면 하운 반신 그림(결의)
          const cg = frameUrl(`cg_gyeol_tech_${t.id}`, 1, { realOnly: true });
          const stand = cg ? null : frameUrl('haun_sword_stand', 2);
          cutin.className = `cutin tech-${t.id}${cg ? ' has-cg' : ''}`;
          cutin.replaceChildren(
            cg ? el('img', { class: 'cg', src: cg, alt: '' }) : stand ? el('img', { src: stand, alt: '' }) : '',
            el('div', { class: 'cutin-text' }, el('div', { class: 'hanja' }, t.hanja), el('div', { class: 'tname' }, t.name), el('div', { class: 'tline' }, t.line)),
          );
          cutin.hidden = false;
          setTimeout(() => (cutin.hidden = true), 1150);
          break;
        }
        case 'techHit': {
          const t = techOf(d, ev.tech)!;
          sfx(t.id === 'unhae' ? 'slam_10' : t.id === 'byeogun' ? 'slam_9' : 'slam_8');
          const c = TECH_COLOR[t.id];
          flash(c?.core ?? '#ffffff', 360, 0.7);
          addShake(fx, now, t.id === 'nakun' ? 10 : 20, 480);
          hitstopUntil = now + 160;
          if (t.id === 'unhae') fx.blooms.push({ x: FOE_X, y: CONTACT.y, born: now, color: 'rgba(255,214,120,ALPHA)', big: true });
          spark(FOE_X, CONTACT.y, 44, c?.core ?? '#ffffff', 480, 5);
          text(FOE_X - 30, CONTACT.y + 50, `${t.name} ${ev.damage}`, c?.core ?? '#ffffff', 34);
          gust(fx.weather, FOE_X, CONTACT.y, 800);
          break;
        }
        case 'clash':
          tip('clash');
          // 칼끼리 맞부딪혔다: 번쩍 멈추고, 겨루기 막대가 뜬다
          sfx('crit');
          sfx('block');
          flash('#ffffff', 220, 0.55);
          addShake(fx, now, 10, 260);
          hitstopUntil = now + 140;
          spark(CONTACT.x, CONTACT.y - 10, 30, '#ffe6a0', 380, 4);
          gust(fx.weather, CONTACT.x, CONTACT.y, 500);
          say('foe', 'clash');
          say('player', 'clash', 600);
          break;
        case 'clashPush':
          sfx('block', { volume: 0.35 });
          addShake(fx, now, 3, 90);
          spark(CONTACT.x + (ev.balance - 0.5) * 80, CONTACT.y - 10, 6, '#fff0c0', 260, 3);
          break;
        case 'clashWin':
          sfx('slam_8');
          flash('#bfe4ff', 260, 0.5);
          addShake(fx, now, 14, 320);
          hitstopUntil = now + 140;
          spark(FOE_X - 30, CONTACT.y, 34, '#bfe4ff', 420, 4);
          gust(fx.weather, CONTACT.x + 40, CONTACT.y, 700);
          judge(fx, 'COUNTER', '밀어냈다 — 베어라!', now, 'foe');
          text(FOE_X + 50, CONTACT.y - 40, `${ev.damage}`, '#bfe4ff', 28);
          break;
        case 'clashLose':
          sfx('hit_heavy');
          flash('#ff3b3b', 260, 0.55);
          addShake(fx, now, 14, 320);
          judge(fx, 'MISS', '밀렸다', now);
          text(PLAYER_X - 50, CONTACT.y - 10, `-${ev.damage}`, '#ff8a7a', 30);
          break;
        case 'crisis':
          // 배수의 진: 붉은 가장자리와 심장 소리, PERFECT 폭이 넓어진다
          sfx('power', { volume: 0.9 });
          flash('#ff2a2a', 320, 0.35);
          fx.crisisBeat = now;
          lastBeat = now;
          heartbeat(0.6);
          text(PLAYER_X + 40, CONTACT.y - 200, '배수의 진 — 결이 넓어진다', '#ffb0a0', 24);
          say('foe', 'crisis');
          say('player', 'crisis', 1500);
          break;
        case 'focus':
          // 심안: 시간이 느려지고 결이 처음부터 보인다
          sfx('swirl');
          sfx('power', { volume: 0.5 });
          flash('#bfe4ff', 300, 0.3);
          text(PLAYER_X + 40, CONTACT.y - 200, '심안 — 결이 처음부터 보인다', '#cfe6ff', 24);
          break;
        case 'link':
          break;
        case 'streak': {
          const tier = streakTier(d);
          fx.combo = { n: ev.streak, tier, born: now, up: tier > lastTier };
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
          // 베지 않는다(7장): 결정타 대신 비틀거림을 센다
          if (d.opts.finish === 'stagger' && d.mode === 'duel') {
            judge(fx, 'BREAK', '비틀거린다 — 베지 않는다', now, 'foe');
            chip(`비틀거림 ${d.staggers} / ${d.opts.staggerWin ?? 3}`);
            tip('subdue');
          } else judge(fx, 'BREAK', '체간이 무너졌다 — 베어라!', now, 'foe');
          flash('#fff3c4', 200);
          addShake(fx, now, 8, 220);
          if (!foeStaggered) say('foe', 'stagger');
          say('player', 'stagger', foeStaggered ? 0 : 500);
          foeStaggered = true;
          break;
        case 'recover':
          text(FOE_X, CONTACT.y - 140, '자세를 되찾았다', '#c9c3d6', 22);
          break;
        case 'deathblow':
          sfx('slam_9');
          lastDeathblow = ev.t;
          // 적마다 다른 결정타(Codex fx_gyeol_finisher_<id>가 오면 그 그림만, 없으면 공통 일섬 + 적별 코드 연출)
          if (foeDef.finisher) fx.finisher = { def: foeDef.finisher, sprite: `fx_gyeol_finisher_${foeDef.id}`, born: now };
          if (!sp.fx[`fx_gyeol_finisher_${foeDef.id}`]) fx.slashes.push({ born: now });
          gust(fx.weather, FOE_X, CONTACT.y, 700);
          spark(FOE_X - 10, CONTACT.y, 40, '#ffe6a0', 440, 5);
          text(FOE_X, CONTACT.y - 120, `결정타 ${ev.damage}`, '#ffe08a', 44);
          flash('#ffffff', 300, 0.7);
          addShake(fx, now, 18, 420);
          hitstopUntil = now + 200;
          break;
        case 'win':
        case 'lose':
          // 끝 장면: 느린 화면으로 쓰러지는 쪽에 다가가고, 위아래로 검은 띠
          sfx(ev.type === 'win' ? 'victory' : 'defeat');
          slowUntil = now + 1600;
          fx.finale = { born: now, x: ev.type === 'win' && !(ev.type === 'win' && ev.survived) ? FOE_X - 60 : PLAYER_X + 20 };
          fx.combo = null;
          fx.banner = null;
          flash(ev.type === 'win' ? '#ffffff' : '#3a0000', 400, 0.5);
          if (ev.type === 'win' && ev.survived) {
            say('foe', 'win', 300);
          } else if (ev.type === 'win') {
            say('foe', 'lose', 150);
            // 결정타로 끝냈으면 그 결정타의 대사
            say('player', 'win', 1100, lastDeathblow === ev.t ? foeDef.finisher?.line : undefined);
          } else {
            say('player', 'lose', 150);
            say('foe', 'win', 1100);
          }
          finish();
          break;
        case 'phase':
          // 다단계: 격퇴했지만 다시 일어선다 — 패턴·기믹이 바뀐다
          sfx('roar');
          sfx('enrage', { volume: 0.8 });
          // 결정타로 넘어가면 결정타 이름이 먼저 — 단계 띠는 조금 뒤에
          fx.banner = { name: ev.name, born: now + 1100, element: 'fire' };
          flash('#ffffff', 360, 0.45);
          addShake(fx, now, 16, 600);
          gust(fx.weather, FOE_X, CONTACT.y, 900);
          if (ev.line) say('foe', 'start', 200, ev.line);
          text(FOE_X, CONTACT.y - 170, `다시 일어선다 — ${ev.n} / ${ev.of}단계`, '#ffb07a', 28);
          if (sp.fx.fx_gyeol_revive) fx.bursts.push({ x: FOE_X, y: CONTACT.y, sprite: 'fx_gyeol_revive', born: now, scale: 2 });
          tip('phase', true);
          break;
        case 'stanceCounter':
          // 반격 자세에 베었다
          sfx('hit_heavy');
          flash('#3a0000', 260, 0.5);
          addShake(fx, now, 12, 300);
          text(PLAYER_X, CONTACT.y - 140, `構 — 되받아 맞았다 -${ev.damage}`, '#ff9a8a', 26);
          break;
        case 'stanceBreak':
          sfx('snap');
          text(FOE_X, CONTACT.y - 150, '자세가 풀렸다 — 지금!', '#ffe08a', 26);
          break;
        case 'armorBreak':
          sfx('slam_8');
          text(FOE_X, CONTACT.y - 190, '갑옷이 깨졌다', '#ffe08a', 28);
          if (sp.fx.fx_gyeol_armor_break) fx.bursts.push({ x: FOE_X, y: CONTACT.y, sprite: 'fx_gyeol_armor_break', born: now, scale: 1.8 });
          break;
        case 'endure':
          chip(`버티기 ${ev.got} / ${ev.need}`);
          break;
        case 'crack':
          // 쪼개지 않기(4장): 왕녀의 얼음을 받아쳤다
          sfx('ice', { volume: 0.8 });
          flash('#cfe9ff', 240, 0.5);
          text(PLAYER_X + 60, CONTACT.y - 150, '왕녀의 얼음에 금이 갔다', '#cfe9ff', 26);
          chip(`왕녀의 얼음 금 ${ev.got} / ${ev.max}`, true);
          break;
        case 'breath':
          // 세 숨(10장): 흐름이 멈추는 숨을 이어서 받는다
          text(FOE_X - 40, CONTACT.y - 160, `숨 ${ev.got}`, '#f4f0ff', 30 + ev.got * 4);
          chip(`세 숨 ${ev.got} / 3`);
          break;
        case 'knot':
          sfx('slam_9');
          fx.banner = { name: '매듭이 드러난다', born: now };
          flash('#ffffff', 320, 0.6);
          addShake(fx, now, 12, 360);
          break;
        case 'finishHint':
          // 운해귀종으로만 끝난다(9장)
          text(FOE_X, CONTACT.y - 170, '운해귀종으로만 끝난다', '#bfe4ff', 28);
          tip('unhae');
          break;
        case 'judge':
        case 'refill':
          break;
      }
    }
    d.events.length = 0;
    if (streakTier(d) < lastTier) lastTier = streakTier(d);
  };

  /** 끝난 대결을 기록에 더한다(대결만 — 수련장은 끝나지 않고, 박자 도전은 최고 기록만) */
  let bestUp = false;
  const record = () => {
    const save = loadSave();
    if (!save.seen.includes(foeDef.id)) save.seen.push(foeDef.id);
    if (mode === 'duel') {
      const st = save.stats;
      const s = d.stats;
      st.duels++;
      if (d.result === 'win') st.wins++;
      st.parries += s.parries;
      st.perfect += s.perfect;
      st.deathblows += s.deathblows;
      st.techs += s.techs;
      st.clashWins += s.clashWins;
      st.maxStreak = Math.max(st.maxStreak, s.maxStreak);
      st.playMs += Math.round(d.t);
      const g = duelGrade(d);
      if (g) {
        const key = `${foeDef.id}:${d.difficulty}`;
        const prev = save.duelBest[key] as DuelRank | undefined;
        const next = betterRank(prev, g.rank);
        bestUp = next !== prev;
        save.duelBest[key] = next;
      }
    }
    writeSave(save);
    announceAchievements(data);
    // 수련 Lv.(「천외귀환」과 같은 계정 수련): 이긴 대결마다 — 일반·정예(2단계)·보스(3단계 이상)
    if (mode === 'duel' && d.result === 'win') {
      const { row, user } = trainingTarget();
      void gainXp(duelXp(foeDef.phases?.length ?? 0), row, user).then(({ from, to }) => {
        if (to > from) toast(`수련 Lv.${to}`, '「천외귀환」과 함께 쓰는 계정 수련이 올랐다');
      });
    }
  };
  const finish = () => {
    if (tutorial) {
      // 서장 마지막 한 판을 이겼다 → 바깥(story.ts)이 장면과 결과를 잇는다
      setTimeout(() => {
        if (!alive) return;
        stopLoop?.();
        opts.onTutorialDone?.(false);
      }, 2600);
      return;
    }
    record();
    setTimeout(() => {
      if (!alive) return;
      const s = d.stats;
      const won = d.result === 'win';
      // 이야기에서 이기면 '다음'이 앞에, 지면 '다시'가 앞에
      // 결과 단추(2026-11-11): 모두 같은 크기의 먹 판 — 앞에 오는 단추만 붉은 인장 테
      const nextBtn = won && opts.next ? el('button', { class: 'res-btn primary', type: 'button' }, el('b', {}, opts.next.label), el('small', {}, 'Enter')) : null;
      nextBtn?.addEventListener('click', () => {
        stopLoop?.();
        setKeys(null);
        opts.next!.go(d);
      });
      const again = el('button', { class: nextBtn ? 'res-btn' : 'res-btn primary', type: 'button' }, el('b', {}, '다시'), nextBtn ? '' : el('small', {}, 'Enter'));
      again.addEventListener('click', () => void play(foeDef0, mode, opts));
      const pick = el('button', { class: 'res-btn', type: 'button' }, el('b', {}, BACK_LABEL[opts.back] ?? '나가기'), el('small', {}, 'Esc'));
      pick.addEventListener('click', leave);
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
            el('span', { class: 'j-perfect' }, `PERFECT ${s.perfect}`),
            el('span', { class: 'j-excellent' }, `EXCELLENT ${s.clean - s.perfect}`),
            el('span', { class: 'j-good' }, `GOOD ${s.good}`),
            el('span', { class: 'j-miss' }, `MISS ${s.miss}`),
          ),
          el('p', { class: 'time' }, `최대 연속 박자 ${s.maxStreak}${newBest ? ' · 최고 기록!' : ''}`),
          el('div', { class: 'res-row' }, nextBtn ?? '', again, pick),
        );
      } else {
        const g = duelGrade(d);
        const diffName = data.difficulties?.find((x) => x.id === d.difficulty)?.name ?? '';
        overlay.replaceChildren(
          opts.title ? el('p', { class: 'kicker' }, opts.title) : '',
          el('h2', {}, d.result === 'win' ? (d.opts.survive ? '버텨 냈다' : d.opts.finish === 'stagger' ? `${foeDef.title}을(를) 데려 내려왔다` : `${foeDef.title}을(를) 베었다`) : d.cracks >= (d.opts.fragile ?? Infinity) ? '왕녀의 얼음이 깨졌다' : '쓰러졌다'),
          g ? el('div', { class: 'grade-line' }, rankBadge(g.rank, 'lg'), el('span', {}, `${diffName} · 점수 ${g.score}${bestUp ? ' · 최고 등급!' : ''}`)) : '',
          el('p', {}, `패링 ${s.parries}(PERFECT ${s.perfect}) · 피하기 ${s.dodges} · 막기 ${s.guards} · 맞음 ${s.hits} · 반격 ${s.counters} · 결정타 ${s.deathblows}`),
          el('p', { class: 'time' }, `최대 연속 박자 ${s.maxStreak} · ${(d.t / 1000).toFixed(1)}초`),
          el('div', { class: 'res-row' }, nextBtn ?? '', again, pick),
        );
      }
      overlay.hidden = false;
      (nextBtn ?? again).focus();
    }, 2600);
  };

  const steps = foeDef.chart?.steps ?? [];
  const chartEnd = steps.length ? steps[steps.length - 1].at : 1;
  // 막대·버튼은 값이 바뀔 때만 DOM에 쓴다(매 프레임 쓰면 스타일 계산이 프레임마다 돈다 — 7-4절)
  const shown = new Map<string, string>();
  const put = (key: string, value: string, apply: (v: string) => void) => {
    if (shown.get(key) === value) return;
    shown.set(key, value);
    apply(value);
  };
  const pct = (x: number) => `${(Math.max(0, Math.min(1, x)) * 100).toFixed(1)}%`;
  /** 애니메이션을 처음부터 다시 건다 */
  const replay = (node: HTMLElement | null | undefined, cls: string) => {
    if (!node) return;
    node.classList.remove(cls);
    void node.offsetWidth;
    node.classList.add(cls);
  };
  /**
   * 체력 막대(2026-11-11 사용자 요청 — 스펙타클하게): 깎이면 막대가 흔들리며 번쩍이고 잔상(밝은 띠)이 잠깐 남았다 따라 줄어든다,
   * 크게 깎이면 더 세게, 차오르면 초록빛, 30% 아래면 붉게 맥박친다. 숫자도 같이
   */
  const hpState = new Map<string, { v: number; timer: number }>();
  const animHp = (key: string, fill: HTMLElement, lag: HTMLElement, ratio: number, num: HTMLElement | null, cur: number, max: number) => {
    const v = Math.max(0, Math.min(1, ratio));
    const prev = hpState.get(key);
    if (prev && Math.abs(prev.v - v) < 0.0005) return;
    const bar = fill.parentElement!;
    fill.style.width = pct(v);
    if (num) num.textContent = `${Math.max(0, Math.ceil(cur))} / ${max}`;
    if (prev && v < prev.v) {
      clearTimeout(prev.timer);
      replay(bar, prev.v - v >= 0.12 ? 'hit-big' : 'hit');
      if (key === 'me') replay(hud.querySelector<HTMLElement>('.me-bar'), 'shake');
      const timer = window.setTimeout(() => (lag.style.width = pct(v)), 420);
      hpState.set(key, { v, timer });
    } else {
      if (prev && v > prev.v) replay(bar, 'heal');
      lag.style.width = pct(v);
      hpState.set(key, { v, timer: 0 });
    }
    bar.classList.toggle('danger', v > 0 && v <= 0.3);
    if (key === 'me') hud.querySelector('.me-bar')?.classList.toggle('danger', v > 0 && v <= 0.3);
  };
  const bars = () => {
    if (rhythm) {
      put('progress', pct(d.t / chartEnd), (v) => (progress.style.width = v));
      const sc = rhythmScore(d);
      put('score', sc.total ? `정확도 ${Math.round(sc.accuracy * 100)}% · PERFECT ${d.stats.perfect} · EXCELLENT ${d.stats.clean - d.stats.perfect} · GOOD ${d.stats.good} · MISS ${d.stats.miss}` : '결을 받아라', (v) => (scoreEl.textContent = v));
    } else {
      animHp('foe', foeHp, foeHpLag, d.foe.hp / d.foeDef.hp, foeHpNum, d.foe.hp, d.foeDef.hp);
      put('foePosture', pct(d.foe.posture / d.foeDef.posture), (v) => {
        foePosture.style.width = v;
        // 체간이 거의 찼다 = 무너뜨릴 때 — 금빛이 타오른다
        foePosture.parentElement!.classList.toggle('near', d.foe.posture / d.foeDef.posture >= 0.75);
      });
      // 단계 점과 기믹 표식
      put('phase', `${d.phase}/${d.phaseCount}`, () => (phasePips.textContent = d.phaseCount > 1 ? '◆'.repeat(d.phase) + '◇'.repeat(d.phaseCount - d.phase) : ''));
      const gm = d.foeDef.gimmicks ?? {};
      const tags = [gm.armor && !d.armorBroken ? '갑옷' : '', gm.regen ? '재생' : '', gm.accelerate ? `가속 ×${(1 / d.tempo).toFixed(2)}` : '', gm.veil ? '결 가림' : ''].filter(Boolean);
      put('gimmicks', tags.join('|'), () => gimmickEl.replaceChildren(...tags.map((x) => el('i', {}, x))));
      animHp('me', myHp, myHpLag, d.player.hp / data.player.hp, myHpNum, d.player.hp, data.player.hp);
      put('myPosture', pct(d.player.posture / data.player.posture), (v) => {
        myPosture.style.width = v;
        // 내 체간이 거의 찼다 = 무너지기 직전 — 붉게 깜박인다
        myPosture.parentElement!.classList.toggle('near', d.player.posture / data.player.posture >= 0.75);
      });
      const fk = d.focus / data.rules.focusMax;
      const focusing = isFocusing(d);
      put('myFocus', pct(focusing ? (d.focusUntil - d.t) / data.rules.focusDuration : fk), (v) => (myFocus.style.width = v));
      put('focusFull', `${fk >= 1}|${focusing}`, () => {
        const bar = myFocus.parentElement!;
        if (fk >= 1 && !focusing && !bar.classList.contains('full')) replay(bar, 'burst');
        bar.classList.toggle('full', fk >= 1 && !focusing);
        bar.classList.toggle('on', focusing);
      });
      put('focusK', fk.toFixed(2), (v) => focusBtn.style.setProperty('--focus', v));
      if (fk >= 1) tip('focus');
      // 장의 특수 규칙 안내(처음 한 번): 왕녀의 얼음·세 숨은 그 결이 처음 보일 때, 나머지는 대결이 시작되고 조금 뒤
      if (!d.result && !rhythm) {
        const c = cue(d);
        if (c.visible && c.stance) tip('stance', true);
        if (c.visible && c.clash) tip('clashReady', true);
        const gm = d.foeDef.gimmicks;
        if (d.t > 1500 && gm) {
          if (gm.armor && !d.armorBroken) tip('armor', true);
          if (gm.regen) tip('regen', true);
          if (gm.accelerate) tip('accelerate', true);
        }
      }
      if (opts.tips?.length && !d.result) {
        const c = cue(d);
        if (c.visible && c.fragile) tip('fragile');
        if (c.visible && c.breath) tip('breath');
        if (d.t > 1500) {
          if (d.opts.veil) tip('veil');
          if (foeDef.postureRegen >= 30) tip('mountain');
        }
      }
      put('focusState', `${fk >= 1}|${focusing}|${!!d.result}`, () => {
        focusBtn.disabled = fk < 1 || focusing || !!d.result;
        focusBtn.classList.toggle('ready', fk >= 1 && !focusing);
        focusBtn.classList.toggle('on', focusing);
      });
    }
    fx.chain = { n: d.chain, min: d.chainMin };
    const ready = techOf(d, d.techReady);
    put('tech', `${ready?.id ?? ''}|${!!d.result}`, () => {
      techBtn.disabled = rhythm || !ready || !!d.result;
      techName.textContent = ready ? ready.name : '기술';
      techBtn.classList.toggle('ready', !!ready);
      techBtn.dataset.tech = ready?.id ?? '';
    });
    put('tier', String(streakTier(d)), (v) => (streakEl.className = `streak tier-${v}`));
    put('open', String(isOpen(d)), (v) => hud.classList.toggle('open', v === 'true'));
  };

  // 품질 자동 조절: 최근 프레임 간격을 재서, 처음 1초(그림 풀기)를 빼고 1.5초 평균이 20ms를 넘으면 한 단계 내린다
  const started = performance.now();
  let prevFrame = started;
  let slowSince = 0;
  let avgFrame = 16.7;
  const tuneQuality = (now: number) => {
    const gap = now - prevFrame;
    prevFrame = now;
    if (loadSave().settings.quality !== 'auto' || now - started < 1000 || gap > 250) return;
    avgFrame = avgFrame * 0.94 + gap * 0.06;
    if (avgFrame <= 20 || quality === 'low') {
      slowSince = 0;
      return;
    }
    slowSince ||= now;
    if (now - slowSince > 1500) {
      quality = quality === 'high' ? 'normal' : 'low';
      autoQuality = quality;
      slowSince = 0;
      avgFrame = 16.7;
      fitCanvas();
    }
  };

  const frame = (now: number) => {
    if (!alive) return;
    tuneQuality(now);
    // 느린 화면: 끝 장면이면 0.25배, 집중(심안) 중이면 focusRate배
    fx.timeScale = rateAt(now);
    fx.uiScale = W / Math.max(1, canvas.clientWidth);
    if (paused) {
      draw(ctx, d, sp, fx, now);
      raf = requestAnimationFrame(frame);
      return;
    }
    advanceTo(now);
    handleEvents();
    // 위기: 심장이 뛴다(가장자리 붉은 맥박과 같은 박자)
    if (d.crisis && !d.result && now - lastBeat > 860) {
      lastBeat = now;
      fx.crisisBeat = now;
      heartbeat(0.45);
    }
    // 겨루기: 맞댄 칼에서 쉬지 않고 불꽃이 튄다
    if (d.clash && now - lastClashFx > 70) {
      lastClashFx = now;
      spark(CONTACT.x + (d.clash.balance - 0.5) * 80, CONTACT.y - 10, 4, '#ffd27a', 220, 3);
    }
    pruneFx(fx, now);
    draw(ctx, d, sp, fx, now);
    bars();
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  // 첫마디: 적이 먼저, 하운이 받는다
  if (tutorial) {
    tutStep = 0;
    tutApply();
  } else {
    say('foe', 'start', 350);
    say('player', 'start', 2100);
  }
  stopLoop = () => {
    alive = false;
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('blur', onBlur);
    resizeObs.disconnect();
    void wake?.release().catch(() => undefined);
    stopLoop = null;
  };
}

initAudio();
applySettings();
// 계정(7-6절): 로그인해 둔 적이 있으면 계정 기록과 맞춘다(둘 다 있고 다르면 묻는다, 계정 것을 받으면 다시 연다)
void bootCloud(askWhich);
applyUiArt();
const params = new URLSearchParams(location.search);
// 점검·개발용: ?foe=<id>[&rhythm|&practice[=drill]][&diff=easy|main|hard] 바로 대결, ?screen=lobby|story|arena|rhythm|practice|records|calibrate
const direct = data.foes.find((f) => f.id === params.get('foe'));
const screen = params.get('screen') as Screen | null;
if (direct) {
  const mode: Mode = params.has('rhythm') ? 'rhythm' : params.has('practice') || direct.practice ? 'practice' : 'duel';
  void play(direct, mode, { difficulty: params.get('diff') ?? 'main', drill: params.get('practice') || undefined, back: mode === 'practice' ? 'practice' : mode === 'rhythm' ? 'rhythm' : 'arena' });
} else nav.go(screen ?? 'title');

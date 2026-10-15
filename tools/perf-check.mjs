// npm run perf:check — 브라우저 수명·부하 점검(2026-10-15, 켜 둔 채 다른 프로그램이 느려진다는 보고). CI에는 넣지 않는다(브라우저가 필요하다).
// 개발 서버를 띄우고 Chromium(헤드리스)으로 같은 조건을 재서 표로 낸다. 수치는 이 컴퓨터에서의 상대 비교용이다.
//   수명: 전투 중(적 턴·카드 연출 중) 나가기 · 정상 승리 · 같은 전투 3번 재진입 뒤
//         → 화면에서 빠진 캔버스에 그린 횟수, 스프라이트 재생기의 새 requestAnimationFrame, 문서·창의 keydown 듣개 수
//   부하: 시작 화면(1920×1080, 화면 배율 2)·전투 대기(1440×900) × 보통 · 화면 연출 끔 · 창을 떠남 — 5초 동안 TaskDuration·스타일 재계산·그리기 횟수
//         + 화면 연출 끄기·켜기와 창 떠남·돌아옴을 5번 되풀이한 뒤에도 rAF 수가 그대로인가(루프 중복)
//   소리: 배경음악 8곡을 차례로 틀었을 때 decodeAudioData로 풀어 둔 바이트와 살아 있는 <audio> 수
// 환경 변수: PERF_ONLY=life,title,battle,bgm(일부만) · PERF_OUT=<파일.json>(결과 저장) · CHROME=<실행 파일>
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const ONLY = new Set((process.env.PERF_ONLY ?? 'life,title,battle,bgm').split(','));
const TOURS = ['battle-basics', 'battle-elements', 'notice-rift', 'battle-rift-heart', 'battle-grain', 'battle-intent'];
const BATTLE = 's1_battle_wolf_pack'; // 그림자늑대 셋

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!base || !existsSync(base)) return undefined;
  for (const d of readdirSync(base).filter((x) => /^chromium-\d+$/.test(x)).sort().reverse()) {
    const exe = join(base, d, 'chrome-linux', 'chrome');
    if (existsSync(exe)) return exe;
  }
  return undefined;
}

const ARGS = ['--autoplay-policy=no-user-gesture-required'];
async function launch() {
  try {
    return await chromium.launch({ args: ARGS });
  } catch (e) {
    const exe = findChrome();
    if (!exe) throw new Error(`Chromium을 찾지 못했다. CHROME=<실행 파일>로 알려 준다.\n${e}`);
    return chromium.launch({ executablePath: exe, args: ARGS });
  }
}

/** 페이지보다 먼저 돈다: 그리기·rAF·듣개·소리 풀기를 센다 */
function instrument(tours) {
  localStorage.setItem('cheonoe.tours', JSON.stringify(tours));
  // 턴 종료 확인 창 없이(남은 카드가 있어도 E로 바로)
  localStorage.setItem('cheonoe.settings', JSON.stringify({ confirmEndTurn: false }));
  const m = (window.__m = { det: 0, draws: 0, rafSprite: 0, rafAll: 0, decoded: 0, decodes: 0, audios: [] });
  for (const name of ['drawImage', 'clearRect', 'fillRect', 'putImageData']) {
    const f = CanvasRenderingContext2D.prototype[name];
    CanvasRenderingContext2D.prototype[name] = function (...a) {
      // 화면용 캔버스(클래스가 있는 것)만 센다 — 그림 받기에서 쓰는 화면 밖 작업 캔버스는 빼고
      if (this.canvas.className) {
        m.draws++;
        if (!this.canvas.isConnected) m.det++;
      }
      return f.apply(this, a);
    };
  }
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => {
    m.rafAll++;
    if (/sprite-player/.test(new Error().stack ?? '')) m.rafSprite++;
    return raf(cb);
  };
  const dec = BaseAudioContext.prototype.decodeAudioData;
  BaseAudioContext.prototype.decodeAudioData = function (...a) {
    return dec.apply(this, a).then((buf) => {
      m.decodes++;
      m.decoded += buf.length * buf.numberOfChannels * 4;
      return buf;
    });
  };
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    if (!m.audios.includes(this)) m.audios.push(this);
    return play.call(this);
  };
  // 문서·창의 keydown 듣개 수(전투 재진입으로 쌓이는지)
  m.keys = 0;
  for (const target of [Document.prototype, Window.prototype]) {
    const add = target.addEventListener;
    const remove = target.removeEventListener;
    const seen = new Set();
    target.addEventListener = function (type, fn, opts) {
      if (type === 'keydown' && !seen.has(fn)) (seen.add(fn), m.keys++);
      return add.call(this, type, fn, opts);
    };
    target.removeEventListener = function (type, fn, opts) {
      if (type === 'keydown' && seen.has(fn)) (seen.delete(fn), m.keys--);
      return remove.call(this, type, fn, opts);
    };
  }
}

const reset = (p) => p.evaluate(() => Object.assign(window.__m, { det: 0, draws: 0, rafSprite: 0, rafAll: 0 }));
const read = (p) =>
  p.evaluate(() => ({
    det: __m.det,
    draws: __m.draws,
    rafSprite: __m.rafSprite,
    rafAll: __m.rafAll,
    keys: __m.keys,
    canvases: document.querySelectorAll('canvas.sprite').length,
  }));

async function openBattle(p, base) {
  await p.goto(`${base}/?sandbox=elia&module=${BATTLE}&seed=PERF&debug`);
  await p.waitForFunction(() => document.querySelectorAll('.unit-enemy canvas.sprite').length >= 3, null, { timeout: 20000 });
  await p.waitForTimeout(1200);
}

async function quitToTitle(p) {
  await p.click('button.medal[aria-label="설정"]', { force: true });
  await p.getByRole('button', { name: /타이틀로/ }).click({ force: true });
}

/** 나간 뒤 1초 쉬고 3초 동안 센다 */
async function afterLeave(p) {
  await p.waitForTimeout(1000);
  await reset(p);
  await p.waitForTimeout(3000);
  return read(p);
}

async function life(browser, base) {
  const out = {};
  const page = async () => {
    const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    p.on('dialog', (d) => d.accept());
    await p.addInitScript(instrument, TOURS);
    return p;
  };
  // ① 적 턴 중 나가기
  let p = await page();
  await openBattle(p, base);
  await p.keyboard.press('e');
  await p.waitForTimeout(450);
  await quitToTitle(p);
  out['적 턴 중 나가기'] = await afterLeave(p);
  await p.close();
  // ② 카드 연출 중 나가기
  p = await page();
  await openBattle(p, base);
  await p.keyboard.press('1');
  await p.waitForTimeout(120);
  await p.keyboard.press('1');
  await p.waitForTimeout(150);
  await quitToTitle(p);
  out['카드 연출 중 나가기'] = await afterLeave(p);
  await p.close();
  // ③ 정상 승리(적 체력을 1로 → 공격 카드) → 결과 → 계속
  p = await page();
  await openBattle(p, base);
  await p.evaluate(() => {
    const b = window.__battle;
    for (const e of b.state.enemies) e.hp = 1;
  });
  for (let i = 0; i < 6 && !(await p.$('.result-overlay')); i++) {
    // 손패의 공격 카드(없으면 턴을 넘긴다)
    const k = await p.evaluate(() => {
      const b = window.__battle;
      return b?.state.hand.findIndex((c) => b.data.cards.get(c.cardId)?.type === 'attack') ?? -1;
    });
    if (k < 0 || k > 8) {
      await p.keyboard.press('e');
      await p.waitForTimeout(4000);
      continue;
    }
    await p.keyboard.press(String(k + 1));
    await p.waitForTimeout(120);
    await p.keyboard.press('1');
    await p.waitForTimeout(2000);
  }
  const won = !!(await p.$('.result-overlay'));
  if (won) await p.click('.result-overlay .btn-primary', { force: true });
  out['정상 승리 뒤'] = { won, ...(await afterLeave(p)) };
  await p.close();
  // ④ 같은 전투 3번 들어갔다 나오고 4번째 전투의 대기 중
  p = await page();
  await openBattle(p, base);
  await reset(p);
  await p.waitForTimeout(3000);
  const once = await read(p);
  for (let i = 0; i < 3; i++) {
    await quitToTitle(p);
    await p.waitForTimeout(400);
    await p.evaluate((m) => window.__app.sandbox('PERF', ['elia'], m), BATTLE);
    await p.waitForFunction(() => document.querySelectorAll('.unit-enemy canvas.sprite').length >= 3);
    await p.waitForTimeout(800);
  }
  await reset(p);
  await p.waitForTimeout(3000);
  out['첫 전투 대기 3초'] = once;
  out['재진입 3번 뒤 대기 3초'] = await read(p);
  await p.close();
  return out;
}

/** 5초 동안의 CDP 성능 지표 차이 */
async function load(p, ms = 5000) {
  const s = await p.context().newCDPSession(p);
  await s.send('Performance.enable');
  const get = async () => Object.fromEntries((await s.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
  await reset(p);
  const a = await get();
  await p.waitForTimeout(ms);
  const b = await get();
  const m = await read(p);
  await s.detach();
  const d = (k) => Math.round((b[k] - a[k]) * 1000);
  return { taskMs: d('TaskDuration'), styleMs: d('RecalcStyleDuration'), layoutMs: d('LayoutDuration'), styleCount: b.RecalcStyleCount - a.RecalcStyleCount, draws: m.draws, raf: m.rafAll };
}

/** 창을 떠난 것처럼(헤드리스는 늘 포커스라 hasFocus를 덮고 blur를 보낸다) */
const blur = (p) => p.evaluate(() => { document.hasFocus = () => false; window.dispatchEvent(new Event('blur')); });
const motion = (p, on) => p.evaluate((on) => document.documentElement.classList.toggle('no-motion', !on), on);

async function screens(browser, base, which) {
  const out = {};
  const vp = which === 'title' ? { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 } : { viewport: { width: 1440, height: 900 } };
  for (const mode of ['보통', '화면 연출 끔', '창을 떠남']) {
    const p = await browser.newPage(vp);
    await p.addInitScript(instrument, TOURS);
    if (which === 'title') {
      await p.goto(`${base}/?debug`);
      await p.waitForSelector('.title-stage canvas');
      await p.waitForTimeout(1500);
    } else await openBattle(p, base);
    if (mode === '화면 연출 끔') await motion(p, false);
    if (mode === '창을 떠남') await blur(p);
    await p.waitForTimeout(500);
    const r = await load(p);
    if (which === 'title') r.canvas = await p.evaluate(() => { const c = document.querySelector('.title-stage canvas'); return `${c.width}×${c.height}`; });
    out[mode] = r;
    await p.close();
  }
  return out;
}

/** 켜기·끄기·창 전환을 여러 번 되풀이해도 루프가 겹치지 않는가: 되풀이 전후 3초의 rAF 수 */
async function toggles(browser, base, which) {
  const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await p.addInitScript(instrument, TOURS);
  if (which === 'title') {
    await p.goto(`${base}/?debug`);
    await p.waitForSelector('.title-stage canvas');
    await p.waitForTimeout(1500);
  } else await openBattle(p, base);
  const rate = async () => {
    await reset(p);
    await p.waitForTimeout(3000);
    return (await read(p)).rafAll;
  };
  const before = await rate();
  for (let i = 0; i < 5; i++) {
    await motion(p, false);
    await p.waitForTimeout(100);
    await motion(p, true);
    await blur(p);
    await p.waitForTimeout(100);
    await p.evaluate(() => { document.hasFocus = () => true; window.dispatchEvent(new Event('focus')); });
    await p.waitForTimeout(100);
  }
  const after = await rate();
  await p.close();
  return { 'rAF 3초(되풀이 전)': before, 'rAF 3초(끄기·켜기·창 전환 5번 뒤)': after };
}

async function bgm(browser, base) {
  const p = await browser.newPage();
  await p.addInitScript(instrument, TOURS);
  await p.goto(`${base}/?debug`);
  await p.waitForSelector('.title-stage');
  await p.mouse.click(5, 5); // 첫 입력으로 소리를 켠다
  const moods = ['title', 'murim', 'elheim', 'nocturna', 'rift', 'battle', 'boss', 'ending'];
  for (const m of moods) {
    await p.evaluate((m) => window.__bgm(m), m);
    await p.waitForTimeout(2500);
  }
  // 빠른 전환: 늦게 끝난 받기가 옛 곡을 다시 틀지 않는가
  for (const m of ['murim', 'boss', 'title', 'rift']) await p.evaluate((m) => window.__bgm(m), m);
  await p.waitForTimeout(3000);
  const playingNow = () => p.evaluate(() => __m.audios.filter((a) => !a.paused).map((a) => decodeURIComponent(a.currentSrc.split('/').pop()).replace(/-[\w-]+(\.\w+)$/, '$1')));
  const r = await p.evaluate(() => ({
    decodedMiB: +(__m.decoded / 1048576).toFixed(1),
    decodes: __m.decodes,
    audioElements: __m.audios.length,
    audioWithSource: __m.audios.filter((a) => a.getAttribute('src')).length,
    jsHeapMiB: +(performance.memory?.usedJSHeapSize / 1048576 || 0).toFixed(1),
  }));
  r.playingAudio = await playingNow();
  // 탭을 숨겼다 돌아오기: 숨긴 동안 멈추고, 돌아오면 지금 곡만 다시
  const hide = (h) => p.evaluate((h) => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => h }); document.dispatchEvent(new Event('visibilitychange')); }, h);
  await hide(true);
  await p.waitForTimeout(500);
  r.playingWhileHidden = await playingNow();
  await hide(false);
  await p.waitForTimeout(800);
  r.playingAfterReturn = await playingNow();
  await p.close();
  return r;
}

const server = await createServer({ server: { port: 5219, strictPort: false }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await launch();
const result = {};
try {
  if (ONLY.has('life')) result['수명'] = await life(browser, base);
  if (ONLY.has('title')) result['시작 화면'] = { ...(await screens(browser, base, 'title')), '되풀이': await toggles(browser, base, 'title') };
  if (ONLY.has('battle')) result['전투 대기'] = { ...(await screens(browser, base, 'battle')), '되풀이': await toggles(browser, base, 'battle') };
  if (ONLY.has('bgm')) result['배경음악'] = await bgm(browser, base);
} finally {
  await browser.close();
  await server.close();
}
console.log(JSON.stringify(result, null, 2));
if (process.env.PERF_OUT) writeFileSync(process.env.PERF_OUT, JSON.stringify(result, null, 2));

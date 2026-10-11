// npm run ux:check — 화면 점검(2026-10-11 UI/UX 4-5). CI에는 넣지 않는다(브라우저가 필요하다).
// 모든 ?screen= 화면(+ 시작·지도·전투·심연 시작)을 PC·휴대폰 × 글자 보통·크게로 열고 표로 보고한다:
//   (a) 11px 미만 글자  (b) 36px(PC)·44px(휴대폰) 미만 버튼  (c) 가로 스크롤  (d) 겹친 글 상자  (e) 콘솔 오류
// 브라우저: playwright-core가 찾는 Chromium, 없으면 CHROME=<실행 파일> 또는 PLAYWRIGHT_BROWSERS_PATH 아래 chromium-*.
// 환경 변수: UX_JOBS=4(동시에 여는 페이지) · UX_SCREENS=title,battle(일부만) · UX_SHOTS=<폴더>(캡처 저장) · UX_OUT=<파일.md>(표 저장)
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const SCREENS = [
  ['title', ''],
  ['map', '?seed=UXCHK'],
  ['battle', '?sandbox&seed=UXCHK'],
  ['abyss', '?abyss=UXCHK'],
  ...['reward', 'choice', 'scene', 'clear', 'win', 'lose', 'deck', 'levelup', 'shop', 'bossloot', 'hub', 'codex', 'loadout', 'pilgrim', 'abyssclear', 'abyssend', 'abyssshop', 'abyssrest', 'surgeguide'].map((s) => [s, `?screen=${s}&seed=UXCHK`]),
];
const VIEWPORTS = [
  { tag: 'PC', width: 1440, height: 900, btn: 36 },
  { tag: '휴대폰', width: 390, height: 844, btn: 44, mobile: true },
];
const FONTS = [
  { tag: '보통', scale: 1 },
  { tag: '크게', scale: 1.12 },
];
const MIN_TEXT = 11;

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

async function launch() {
  try {
    return await chromium.launch();
  } catch (e) {
    const exe = findChrome();
    if (!exe) throw new Error(`Chromium을 찾지 못했다. CHROME=<실행 파일>로 알려 준다.\n${e}`);
    return chromium.launch({ executablePath: exe });
  }
}

/** 화면 안에서 재는 함수(브라우저에서 돈다) */
function measure({ minText, minBtn }) {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.05;
  };
  // 보이는 글자 크기 = 계산된 글자 크기 × 조상들의 zoom
  const zoomOf = (el) => {
    let z = 1;
    for (let e = el; e; e = e.parentElement) z *= parseFloat(getComputedStyle(e).zoom || '1') || 1;
    return z;
  };
  const cls = (el) => (typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
  // 이름표: 클래스, 없으면 '부모 클래스>태그'
  const label = (el) => (cls(el) ? `.${cls(el)}` : `${el.parentElement && cls(el.parentElement) ? `.${cls(el.parentElement)}>` : ''}${el.tagName.toLowerCase()}`);
  const texts = [];
  const small = new Map();
  for (const el of document.querySelectorAll('body *')) {
    const own = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim());
    if (!own.length || !visible(el)) continue;
    const shown = parseFloat(getComputedStyle(el).fontSize) * zoomOf(el);
    if (shown < minText - 0.05) small.set(label(el), Math.min(small.get(label(el)) ?? 99, shown));
    const range = document.createRange();
    let box = null;
    for (const n of own) {
      range.selectNodeContents(n);
      const r = range.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      box = box ? { l: Math.min(box.l, r.left), t: Math.min(box.t, r.top), r: Math.max(box.r, r.right), b: Math.max(box.b, r.bottom) } : { l: r.left, t: r.top, r: r.right, b: r.bottom };
    }
    // 넘침을 자르는 자신·조상(overflow: hidden, 말줄임 등) 밖으로 나간 부분은 보이지 않으므로 잘라 낸다
    for (let e = el; box && e && e !== document.body; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
      const r = e.getBoundingClientRect();
      box = { l: Math.max(box.l, r.left), t: Math.max(box.t, r.top), r: Math.min(box.r, r.right), b: Math.min(box.b, r.bottom) };
      if (box.r - box.l < 1 || box.b - box.t < 1) box = null;
    }
    if (box && box.r > 0 && box.b > 0 && box.l < innerWidth && box.t < innerHeight) texts.push({ el, box });
  }
  // (d) 둘 다 실제로 보이는(어느 한 점이라도 그 자리 맨 위에 있는) 글 상자가 서로 겹치면 센다 — 손패처럼 다 가려진 글은 빼고
  const onTop = (t) =>
    [0.15, 0.5, 0.85].some((fx) => {
      const x = Math.min(innerWidth - 1, Math.max(0, t.box.l + (t.box.r - t.box.l) * fx));
      const y = Math.min(innerHeight - 1, Math.max(0, (t.box.t + t.box.b) / 2));
      const hit = document.elementFromPoint(x, y);
      return !!hit && (hit === t.el || t.el.contains(hit) || hit.contains(t.el));
    });
  const top = texts.filter(onTop);
  const overlaps = new Set();
  for (let i = 0; i < top.length; i++)
    for (let j = i + 1; j < top.length; j++) {
      const a = top[i];
      const b = top[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const w = Math.min(a.box.r, b.box.r) - Math.max(a.box.l, b.box.l);
      const hh = Math.min(a.box.b, b.box.b) - Math.max(a.box.t, b.box.t);
      if (w <= 2 || hh <= 2) continue;
      const area = (t) => (t.box.r - t.box.l) * (t.box.b - t.box.t);
      if ((w * hh) / Math.min(area(a), area(b)) < 0.2) continue;
      overlaps.add(`${label(a.el)}×${label(b.el)}`);
    }
  // (b) 카드 몸체(카드 자체가 누르는 칸)와 누를 수 없는(disabled) 버튼은 빼고 잰다
  const tiny = new Map();
  for (const el of document.querySelectorAll('button, [role=button], .btn, a[href]')) {
    if (!visible(el) || el.closest('.card') || el.disabled || el.getAttribute('aria-disabled') === 'true') continue;
    // 투명한 테(::before·::after를 바깥으로 넓힌 누르는 자리)도 친다
    let hit = el.getBoundingClientRect().height;
    for (const pseudo of ['::before', '::after']) {
      const ps = getComputedStyle(el, pseudo);
      if (ps.content === 'none' || ps.position !== 'absolute' || ps.pointerEvents === 'none') continue;
      hit = Math.max(hit, el.getBoundingClientRect().height - Math.min(0, parseFloat(ps.top) || 0) - Math.min(0, parseFloat(ps.bottom) || 0));
    }
    if (hit < minBtn - 0.5) tiny.set(label(el), Math.min(tiny.get(label(el)) ?? 99, Math.round(hit)));
  }
  return {
    small: [...small].map(([k, v]) => `${k} ${v.toFixed(1)}px`),
    tiny: [...tiny].map(([k, v]) => `${k} ${v}px`),
    hscroll: document.documentElement.scrollWidth > innerWidth + 1,
    overlaps: [...overlaps],
  };
}

async function settle(page) {
  await page.waitForTimeout(1500);
  // 장면(대화)은 넘기고, 첫 안내는 건너뛴다
  for (let k = 0; k < 40 && (await page.locator('.vn').count()); k++) {
    await page.locator('.vn').first().click({ force: true, timeout: 1000 }).catch(() => {});
    await page.waitForTimeout(50);
  }
  for (let k = 0; k < 3; k++) await page.getByText('건너뛰기').first().click({ timeout: 500 }).catch(() => {});
  await page.waitForTimeout(400);
}

const only = process.env.UX_SCREENS?.split(',').filter(Boolean);
const screens = only ? SCREENS.filter(([n]) => only.includes(n)) : SCREENS;
const shots = process.env.UX_SHOTS;
if (shots) mkdirSync(shots, { recursive: true });

const server = await createServer({ server: { port: 0, strictPort: false }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await launch();
const rows = [];
try {
  // 페이지 여러 개를 동시에 연다(UX_JOBS, 기본 4)
  const jobs = screens.flatMap(([name, query]) => VIEWPORTS.flatMap((vp) => FONTS.map((font) => ({ name, query, vp, font }))));
  const one = async ({ name, query, vp, font }) => {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.mobile, hasTouch: !!vp.mobile });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message ?? e)));
    // 바깥 글꼴(Google Fonts) 같은 다른 출처의 받기 실패는 게임 오류가 아니므로 뺀다
    page.on('console', (m) => m.type() === 'error' && !(m.location().url && !m.location().url.startsWith(base)) && errors.push(m.text()));
    await page.addInitScript((scale) => {
      if (sessionStorage.getItem('uxchk')) return;
      sessionStorage.setItem('uxchk', '1');
      localStorage.clear();
      localStorage.setItem('cheonoe.settings', JSON.stringify({ fontScale: scale }));
    }, font.scale);
    try {
      await page.goto(base + query, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await settle(page);
      const m = await page.evaluate(measure, { minText: MIN_TEXT, minBtn: vp.btn });
      if (shots) await page.screenshot({ path: join(shots, `${name}-${vp.width}-${font.scale === 1 ? 'n' : 'l'}.png`) });
      return { name, vp: vp.tag, font: font.tag, ...m, errors: [...new Set(errors)] };
    } catch (e) {
      return { name, vp: vp.tag, font: font.tag, small: [], tiny: [], hscroll: false, overlaps: [], errors: [`점검 실패: ${String(e.message ?? e).split('\n')[0]}`, ...errors] };
    } finally {
      await page.close();
    }
  };
  const out = new Array(jobs.length);
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const i = next++;
      out[i] = await one(jobs[i]);
      process.stderr.write(`\r${out.filter(Boolean).length}/${jobs.length}`);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Number(process.env.UX_JOBS) || 4) }, worker));
  process.stderr.write('\n');
  rows.push(...out);
} finally {
  await browser.close();
  await server.close();
}

const cell = (xs) => (xs.length ? `${xs.length}: ${xs.slice(0, 3).join(', ')}${xs.length > 3 ? ' …' : ''}` : '—');
const lines = [
  `| 화면 | 기기 | 글자 | (a) ${MIN_TEXT}px 미만 글자 | (b) 작은 버튼 | (c) 가로 스크롤 | (d) 겹친 글 | (e) 콘솔 오류 |`,
  '|---|---|---|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.name} | ${r.vp} | ${r.font} | ${cell(r.small)} | ${cell(r.tiny)} | ${r.hscroll ? '있음' : '—'} | ${cell(r.overlaps)} | ${cell(r.errors)} |`),
];
const bad = (k) => rows.filter((r) => (Array.isArray(r[k]) ? r[k].length : r[k])).length;
lines.push('', `화면 ${rows.length}개(${screens.length}화면 × 기기 2 × 글자 2) — 작은 글자 ${bad('small')} · 작은 버튼 ${bad('tiny')} · 가로 스크롤 ${bad('hscroll')} · 겹침 ${bad('overlaps')} · 콘솔 오류 ${bad('errors')}`);
const table = lines.join('\n');
console.log(table);
if (process.env.UX_OUT) writeFileSync(process.env.UX_OUT, table + '\n');

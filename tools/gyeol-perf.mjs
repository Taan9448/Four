#!/usr/bin/env node
// 「결」 프레임 점검(CI 밖, 2026-11-09 7-4절): vite 개발 서버를 띄워 대결 화면의 무거운 순간(위기·집중 가득·기술 준비·연속 박자 12)을
// ?debug로 만들고 rAF 프레임 간격 240장을 잰다. CPU를 느리게(휴대폰 흉내) 하거나 품질을 고정할 수 있다.
// 환경 변수: GYEOL_FOES=ignis,shadow_assassin · GYEOL_CPU=1,4 · GYEOL_QUALITY=high,auto(저장 settings.quality) · CHROME=<실행 파일>
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const list = (v, d) => (v ?? d).split(',').filter(Boolean);
const FOES = list(process.env.GYEOL_FOES, 'ignis,shadow_assassin');
const CPUS = list(process.env.GYEOL_CPU, '1,4').map(Number);
const QUALITIES = list(process.env.GYEOL_QUALITY, 'high,auto');

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!base || !existsSync(base)) return existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
  for (const d of readdirSync(base).filter((x) => /^chromium-\d+$/.test(x)).sort().reverse()) {
    for (const sub of ['chrome-linux', 'chrome-linux64']) {
      const exe = join(base, d, sub, 'chrome');
      if (existsSync(exe)) return exe;
    }
  }
  return existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
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

const server = await createServer({ server: { port: 0 }, logLevel: 'error' });
await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await launch();
const rows = [];
try {
  for (const foe of FOES)
    for (const cpu of CPUS)
      for (const q of QUALITIES) {
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        const page = await ctx.newPage();
        await page.addInitScript((quality) => localStorage.setItem('gyeol.save', JSON.stringify({ v: 1, settings: { quality } })), q);
        const cdp = await ctx.newCDPSession(page);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
        await page.goto(`${url}gyeol/?foe=${foe}&debug`);
        await page.waitForFunction(() => !!window.__gyeol, null, { timeout: 30000 });
        await page.waitForTimeout(2500);
        await page.evaluate(() => {
          const d = window.__gyeol;
          d.crisis = true;
          d.focus = 100;
          d.techReady = 'unhae';
          d.streak = 12;
        });
        // auto면 자동 조절이 움직일 시간을 준다
        await page.waitForTimeout(q === 'auto' ? 3500 : 300);
        const gaps = await page.evaluate(
          () =>
            new Promise((res) => {
              const ts = [];
              let last = performance.now();
              const f = (t) => {
                ts.push(t - last);
                last = t;
                if (ts.length < 240) requestAnimationFrame(f);
                else res(ts);
              };
              requestAnimationFrame(f);
            }),
        );
        const canvas = await page.evaluate(() => document.querySelector('canvas')?.width ?? 0);
        gaps.sort((a, b) => a - b);
        const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
        rows.push({ foe, cpu, quality: q, canvas, avg: avg.toFixed(1), p50: gaps[120].toFixed(1), p95: gaps[228].toFixed(1), max: gaps[239].toFixed(1) });
        await ctx.close();
      }
} finally {
  await browser.close();
  await server.close();
}
console.log('| 상대 | CPU | 품질 | 캔버스 폭 | 평균 | 중간 | 상위 5% | 최대 |');
console.log('|---|---|---|---|---|---|---|---|');
for (const r of rows) console.log(`| ${r.foe} | ×${r.cpu} | ${r.quality} | ${r.canvas} | ${r.avg} | ${r.p50} | ${r.p95} | ${r.max} |`);

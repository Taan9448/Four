#!/usr/bin/env node
// 명세 기반 임시 시트 생성. 진짜 에셋이 오기 전에 게임이 먼저 돌아가게 한다.
// 사용: npm run assets:placeholder -- <id> | --all
//  결과: assets/placeholders/<id>/_sheet.png → 자동으로 잘라 frame_*.png + meta.json
//  시트도 규격(크기·칸·배경·기준선·여백)을 그대로 따르므로 파이프라인 자체 시험이 된다.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { sliceSheet } from './slice-sheet.mjs';
import { cellRect, extract, keyOut, loadRaw, pixelize, upscale } from './lib/image.mjs';
import { CHROMA, listSpecIds, loadSpec, paths, ROOT } from './lib/specs.mjs';
import { paletteFor } from './lib/style.mjs';

const deg = (d) => (d * Math.PI) / 180;

function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.max(0, Math.min(255, Math.round(v + amount * 255)));
  const r = ch(n >> 16), g = ch((n >> 8) & 255), b = ch(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** 사람형 실루엣. pose: { dx, dy, rot, weapon, arm, glow, tint } */
function humanoid(w, h, spec, pose, front = false) {
  const color = pose.tint ? shade(spec.placeholder?.color ?? '#5577aa', 0.35) : spec.placeholder?.color ?? '#5577aa';
  const accent = spec.placeholder?.accent ?? '#3fa9f5';
  const H = h * 0.74;
  const feetY = h * spec.baseline;
  const cx = w / 2;
  const r = H * 0.09;
  const headY = feetY - H + r;
  const neck = headY + r;
  const hip = feetY - H * 0.45;
  const tw = H * 0.22;
  const shoulderY = neck + H * 0.06;
  const handX = cx + Math.cos(deg(pose.arm ?? 20)) * H * 0.26;
  const handY = shoulderY + Math.sin(deg(pose.arm ?? 20)) * H * 0.26;
  const blade = H * 0.34;
  const tipX = handX + Math.cos(deg(pose.weapon ?? 20)) * blade;
  const tipY = handY + Math.sin(deg(pose.weapon ?? 20)) * blade;
  const legs = front
    ? `<rect x="${cx - tw * 0.45}" y="${hip}" width="${tw * 0.35}" height="${feetY - hip}" rx="6" fill="${shade(color, -0.15)}"/><rect x="${cx + tw * 0.1}" y="${hip}" width="${tw * 0.35}" height="${feetY - hip}" rx="6" fill="${shade(color, -0.15)}"/>`
    : `<rect x="${cx - tw * 0.35}" y="${hip}" width="${tw * 0.3}" height="${feetY - hip}" rx="6" fill="${shade(color, -0.2)}" transform="rotate(8 ${cx} ${hip})"/><rect x="${cx + tw * 0.02}" y="${hip}" width="${tw * 0.3}" height="${feetY - hip}" rx="6" fill="${shade(color, -0.1)}" transform="rotate(-10 ${cx} ${hip})"/>`;
  const weapon = spec.placeholder?.weapon === false
    ? ''
    : `<line x1="${handX}" y1="${handY}" x2="${tipX}" y2="${tipY}" stroke="#d8dde6" stroke-width="7" stroke-linecap="round"/><line x1="${handX}" y1="${handY}" x2="${tipX}" y2="${tipY}" stroke="${accent}" stroke-width="2" stroke-linecap="round"/>`;
  const glow = pose.glow ? `<circle cx="${handX}" cy="${handY}" r="${pose.glow}" fill="${accent}" opacity="0.55"/>` : '';
  return `<g transform="translate(${pose.dx ?? 0} ${pose.dy ?? 0}) rotate(${pose.rot ?? 0} ${cx} ${feetY})">
    ${legs}
    <rect x="${cx - tw / 2}" y="${neck}" width="${tw}" height="${hip - neck + 8}" rx="${tw * 0.3}" fill="${color}"/>
    <circle cx="${cx}" cy="${headY}" r="${r}" fill="${shade(color, 0.25)}"/>
    <rect x="${cx - r}" y="${headY - r}" width="${r * 2}" height="${r * 0.7}" rx="${r * 0.3}" fill="${shade(color, -0.3)}"/>
    <line x1="${cx}" y1="${shoulderY}" x2="${handX}" y2="${handY}" stroke="${shade(color, 0.1)}" stroke-width="${tw * 0.28}" stroke-linecap="round"/>
    ${glow}${weapon}
  </g>`;
}

/** 네발짐승 실루엣(그림자늑대 등) */
function beast(w, h, spec, pose) {
  const color = pose.tint ? shade(spec.placeholder?.color ?? '#2b2b3a', 0.35) : spec.placeholder?.color ?? '#2b2b3a';
  const accent = spec.placeholder?.accent ?? '#ffb347';
  const feetY = h * spec.baseline;
  const L = w * 0.5;
  const bodyH = h * 0.14;
  const cx = w / 2;
  const legH = h * 0.12;
  const bodyY = feetY - legH - bodyH / 2;
  const headX = cx + L * 0.42;
  const headY = bodyY - bodyH * 0.35 + (pose.headDy ?? 0);
  const flame = [0, 1, 2, 3, 4]
    .map((i) => {
      const x = cx - L * 0.3 + i * L * 0.14;
      const fh = bodyH * (0.55 + ((i + (pose.flame ?? 0)) % 3) * 0.18);
      return `<path d="M${x - 10} ${bodyY - bodyH * 0.4} Q${x} ${bodyY - bodyH * 0.4 - fh} ${x + 10} ${bodyY - bodyH * 0.4} Z" fill="#1a1024"/>`;
    })
    .join('');
  const legs = [-0.32, -0.18, 0.2, 0.32]
    .map((k, i) => `<rect x="${cx + L * k - 6}" y="${bodyY + bodyH * 0.2}" width="12" height="${feetY - bodyY - bodyH * 0.2}" rx="5" fill="${shade(color, i % 2 ? -0.1 : 0)}"/>`)
    .join('');
  return `<g transform="translate(${pose.dx ?? 0} ${pose.dy ?? 0}) rotate(${pose.rot ?? 0} ${cx} ${feetY})">
    ${legs}
    ${flame}
    <ellipse cx="${cx}" cy="${bodyY}" rx="${L / 2}" ry="${bodyH / 2}" fill="${color}"/>
    <path d="M${cx - L / 2} ${bodyY} Q${cx - L * 0.62} ${bodyY - bodyH} ${cx - L * 0.68} ${bodyY - bodyH * 0.2}" stroke="${color}" stroke-width="12" fill="none" stroke-linecap="round"/>
    <circle cx="${headX}" cy="${headY}" r="${bodyH * 0.55}" fill="${shade(color, 0.08)}"/>
    <path d="M${headX + bodyH * 0.3} ${headY - bodyH * 0.2} L${headX + bodyH * 0.95} ${headY + bodyH * 0.05} L${headX + bodyH * 0.3} ${headY + bodyH * 0.3} Z" fill="${shade(color, 0.08)}"/>
    <path d="M${headX - bodyH * 0.2} ${headY - bodyH * 0.45} L${headX - bodyH * 0.05} ${headY - bodyH * 0.95} L${headX + bodyH * 0.15} ${headY - bodyH * 0.45} Z" fill="${color}"/>
    <circle cx="${headX + bodyH * 0.25}" cy="${headY - bodyH * 0.1}" r="5" fill="${accent}"/>
  </g>`;
}

/** 애니메이션별 포즈 목록 */
function posesFor(spec) {
  const n = spec.frames;
  const beastShape = spec.placeholder?.shape === 'beast';
  switch (spec.anim) {
    case 'idle':
      return Array.from({ length: n }, (_, t) => ({ dy: -Math.round(Math.sin((t / n) * Math.PI * 2) * 4 + 4), flame: t, arm: 25, weapon: 30 }));
    case 'attack':
      if (beastShape) {
        return Array.from({ length: n }, (_, t) => ({ dx: [-8, -16, 6, 34, 26, 4][t % 6], headDy: [0, -6, -4, 10, 6, 0][t % 6], rot: [0, 4, -3, -5, -2, 0][t % 6], flame: t }));
      }
      return Array.from({ length: n }, (_, t) => ({
        dx: [-6, 2, 0, 16, 20, 4][t % 6],
        arm: [40, 0, -30, 25, 45, 20][t % 6],
        weapon: [30, -20, -55, 45, 60, 10][t % 6],
        glow: t === 3 ? 18 : 0,
      }));
    case 'skill':
      return Array.from({ length: n }, (_, t) => ({ arm: -10 - t * 5, weapon: -30, glow: 10 + Math.sin((t / (n - 1)) * Math.PI) * 26 }));
    case 'hit':
      return Array.from({ length: n }, (_, t) => ({ dx: [-14, -10, -3][t % 3], rot: [-7, -4, -1][t % 3], tint: t === 0, arm: 50, weapon: 70 }));
    case 'death':
      return Array.from({ length: n }, (_, t) => ({ rot: -(t / (n - 1)) * 82, dx: -t * 4, arm: 60, weapon: 80 }));
    default:
      return Array.from({ length: n }, () => ({}));
  }
}

function fxCell(w, h, spec, t) {
  const n = spec.frames;
  const accent = spec.placeholder?.accent ?? '#4fb4ff';
  const p = (t + 1) / n;
  const cx = w / 2, cy = h / 2;
  const R = w * 0.33;
  const a0 = deg(-140);
  const a1 = a0 + deg(220) * Math.min(1, p * 1.4);
  // 마지막 칸도 키 색(마젠타 등)과 섞여 지워지지 않을 만큼은 남긴다
  const fade = Math.max(0.5, p > 0.6 ? 1 - (p - 0.6) / 0.5 : 1);
  const x0 = cx + Math.cos(a0) * R, y0 = cy + Math.sin(a0) * R;
  const x1 = cx + Math.cos(a1) * R, y1 = cy + Math.sin(a1) * R;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const width = 6 + 22 * Math.sin(p * Math.PI);
  return `<path d="M${x0} ${y0} A${R} ${R} 0 ${large} 1 ${x1} ${y1}" stroke="${accent}" stroke-opacity="${fade.toFixed(2)}" stroke-width="${width.toFixed(1)}" fill="none" stroke-linecap="round"/>
    <path d="M${x0} ${y0} A${R} ${R} 0 ${large} 1 ${x1} ${y1}" stroke="#ffffff" stroke-opacity="${(fade * 0.8).toFixed(2)}" stroke-width="${(width / 3).toFixed(1)}" fill="none" stroke-linecap="round"/>`;
}

/** 반신 그림 임시: 머리·어깨 실루엣. face 0 기본 / 1 결의(눈썹 내림) / 2 놀람(입 벌림) */
function standing(w, h, spec, face) {
  const color = spec.placeholder?.color ?? '#3d4a63';
  const accent = spec.placeholder?.accent ?? '#e0cfae';
  const cx = w / 2, hy = h * 0.2, hr = w * 0.17;
  const brow = face === 1 ? `<path d="M${cx - hr * 0.6} ${hy - hr * 0.2} L${cx - hr * 0.15} ${hy - hr * 0.05} M${cx + hr * 0.6} ${hy - hr * 0.2} L${cx + hr * 0.15} ${hy - hr * 0.05}" stroke="#1d2433" stroke-width="10"/>` : '';
  const mouth = face === 2
    ? `<ellipse cx="${cx}" cy="${hy + hr * 0.5}" rx="${hr * 0.15}" ry="${hr * 0.22}" fill="#1d2433"/>`
    : `<path d="M${cx - hr * 0.25} ${hy + hr * 0.5} L${cx + hr * 0.25} ${hy + hr * 0.5}" stroke="#1d2433" stroke-width="8"/>`;
  return `<path d="M${w * 0.08} ${h} Q${w * 0.1} ${h * 0.34} ${cx} ${h * 0.27} Q${w * 0.9} ${h * 0.34} ${w * 0.92} ${h} Z" fill="${color}" stroke="#1d2433" stroke-width="8"/>
    <circle cx="${cx}" cy="${hy}" r="${hr}" fill="${accent}" stroke="#1d2433" stroke-width="8"/>
    <circle cx="${cx - hr * 0.35}" cy="${hy + hr * 0.1}" r="${face === 2 ? 11 : 8}" fill="#1d2433"/>
    <circle cx="${cx + hr * 0.35}" cy="${hy + hr * 0.1}" r="${face === 2 ? 11 : 8}" fill="#1d2433"/>${brow}${mouth}`;
}

/** 아이콘 임시 그림: 칸마다 모양이 다른 단순한 기호(번호를 알아보게) */
function iconCell(w, h, spec, n) {
  const color = spec.placeholder?.color ?? '#c2c6d1';
  const accent = spec.placeholder?.accent ?? '#f2a93b';
  const cx = w / 2, cy = h / 2, r = w * 0.3;
  const sides = 3 + ((n - 1) % 5);
  const pts = Array.from({ length: sides }, (_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / sides;
    return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
  }).join(' ');
  return `<polygon points="${pts}" fill="${color}" stroke="#1d2433" stroke-width="12"/>
    <circle cx="${cx}" cy="${cy}" r="${r * 0.3 + (n % 3) * 6}" fill="${accent}" stroke="#1d2433" stroke-width="8"/>`;
}

function illustration(w, h, spec) {
  const color = spec.placeholder?.color ?? '#3d4a63';
  return `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(color, 0.3)}"/><stop offset="1" stop-color="${shade(color, -0.2)}"/></linearGradient></defs>
    <rect width="${w}" height="${h}" fill="url(#g)"/>
    <circle cx="${w * 0.7}" cy="${h * 0.25}" r="${w * 0.08}" fill="#e8ecf2" opacity="0.8"/>
    <circle cx="${w * 0.8}" cy="${h * 0.2}" r="${w * 0.05}" fill="#9fc6ff" opacity="0.7"/>
    <path d="M0 ${h * 0.75} Q${w * 0.3} ${h * 0.55} ${w * 0.6} ${h * 0.7} T${w} ${h * 0.65} V${h} H0 Z" fill="${shade(color, -0.3)}"/>`;
}

/**
 * 명세대로 시트 SVG를 만든다.
 * @param {object} spec
 * @param {{ skipCells?: number[], extraCells?: number[] }} opts 테스트용: 일부 칸을 비우거나 빈 칸에 그림을 넣는다
 */
export function sheetSvg(spec, { skipCells = [], extraCells = [] } = {}) {
  const [W, H] = spec.canvas;
  const [cols, rows] = spec.grid;
  const [w, h] = spec.cell;
  const key = CHROMA[spec.chroma];
  const parts = [];
  if (key) parts.push(`<rect width="${W}" height="${H}" fill="${key.hex}"/>`);
  if (spec.type === 'character-standing') {
    for (let n = 1; n <= cols * rows; n++) {
      if (!((n <= spec.frames && !skipCells.includes(n)) || extraCells.includes(n))) continue;
      parts.push(`<g transform="translate(${((n - 1) % cols) * w} ${Math.floor((n - 1) / cols) * h})">${standing(w, h, spec, n - 1)}</g>`);
    }
  } else if (spec.type === 'ui-parts') {
    // 둥근 부품: 쓰는 칸마다 고리 하나(칸 번호만큼 밝기를 바꿔 상태를 구분)
    const color = spec.placeholder?.color ?? '#c9a24f';
    for (let n = 1; n <= cols * rows; n++) {
      if (!((n <= spec.frames && !skipCells.includes(n)) || extraCells.includes(n))) continue;
      const cx = ((n - 1) % cols) * w + w / 2;
      const cy = Math.floor((n - 1) / cols) * h + h / 2;
      const r = Math.min(w, h) * 0.43;
      parts.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" opacity="${1 - (n - 1) * 0.2}"/><circle cx="${cx}" cy="${cy}" r="${r * 0.72}" fill="#202020"/>`);
    }
  } else if (spec.type === 'icon-sheet') {
    for (let n = 1; n <= cols * rows; n++) {
      if (!((n <= spec.frames && !skipCells.includes(n)) || extraCells.includes(n))) continue;
      parts.push(`<g transform="translate(${((n - 1) % cols) * w} ${Math.floor((n - 1) / cols) * h})">${iconCell(w, h, spec, n)}</g>`);
    }
  } else if (spec.track === 'illustration' || spec.type === 'background') {
    parts.push(illustration(W, H, spec));
  } else {
    const poses = spec.type === 'character-ref' ? [{ arm: 25, weapon: 30 }, { arm: 25, weapon: 30 }] : posesFor(spec);
    for (let n = 1; n <= cols * rows; n++) {
      const draw = (n <= spec.frames && !skipCells.includes(n)) || extraCells.includes(n);
      if (!draw) continue;
      const t = Math.min(n, spec.frames) - 1;
      const x = ((n - 1) % cols) * w;
      const y = Math.floor((n - 1) / cols) * h;
      const front = spec.type === 'character-ref' && n === 1;
      const mirror = spec.facing === 'left' && !front ? `translate(${w} 0) scale(-1 1)` : '';
      let body;
      if (spec.type === 'fx') body = fxCell(w, h, spec, t);
      else if (spec.placeholder?.shape === 'beast') body = beast(w, h, spec, poses[t] ?? {});
      else body = humanoid(w, h, spec, poses[t] ?? {}, front);
      parts.push(`<g transform="translate(${x} ${y})"><g transform="${mirror}">${body}</g></g>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join('')}</svg>`;
}

/**
 * 임시 시트를 "확대된 픽셀 아트"로 만든다: 벡터 실루엣을 그린 뒤 칸마다 논리 해상도로 줄이고(팔레트 적용)
 * 다시 정수배로 키워 키 색 배경에 붙인다. Codex가 납품할 시트와 같은 형태라 파이프라인 시험이 된다.
 */
export async function renderSheet(spec, opts = {}) {
  const bg = CHROMA[spec.chroma]?.hex ?? '#000000';
  if (spec.track === 'illustration') {
    // 일러스트 임시 그림: 벡터 그대로(픽셀화하지 않음)
    return sharp(Buffer.from(sheetSvg(spec, opts))).flatten({ background: bg }).png().toBuffer();
  }
  const vector = await loadRaw(await sharp(Buffer.from(sheetSvg(spec, opts))).flatten({ background: bg }).png().toBuffer());
  const palette = paletteFor(spec, opts.styleRoot ?? ROOT);
  const composites = [];
  for (let n = 1; n <= spec.grid[0] * spec.grid[1]; n++) {
    const rect = cellRect(spec, n);
    const { img } = pixelize(keyOut(extract(vector, rect), spec), spec, palette);
    const big = upscale(img, spec.pixel_scale);
    composites.push({ input: big.data, raw: { width: big.width, height: big.height, channels: 4 }, left: rect.x, top: rect.y });
  }
  return sharp({ create: { width: spec.canvas[0], height: spec.canvas[1], channels: 4, background: bg } })
    .composite(composites)
    .flatten({ background: bg })
    .png()
    .toBuffer();
}

export async function makePlaceholder(id, { root = ROOT } = {}) {
  const spec = loadSpec(id, root);
  const p = paths(root);
  const sheet = p.placeholderSheet(id);
  mkdirSync(dirname(sheet), { recursive: true });
  writeFileSync(sheet, await renderSheet(spec));
  return sliceSheet(spec, { src: sheet, outDir: p.placeholders(id), placeholder: true });
}

async function main() {
  const args = process.argv.slice(2);
  const ids = args.includes('--all') ? listSpecIds() : args.filter((a) => !a.startsWith('--'));
  if (!ids.length) {
    console.error('사용: npm run assets:placeholder -- <id> | --all');
    process.exit(2);
  }
  for (const id of ids) {
    const meta = await makePlaceholder(id);
    console.log(`✔ ${id}: 임시 시트 + 프레임 ${meta.frames}장 → assets/placeholders/${id}/`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(`✖ ${e.message}`);
    process.exit(1);
  });
}

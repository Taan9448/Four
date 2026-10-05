#!/usr/bin/env node
// 명세 → 완성 이미지 생성 프롬프트(영어). 전투는 64px 그림 격자의 픽셀 아트, 이야기(카드·초상화·스토리 CG·설정화)는 애니메이션 채색 일러스트. 이슈 본문과 Codex 작업에 그대로 쓰인다.
// 사용: npm run assets:prompt -- <id> [--out file]
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { CHROMA, loadSpec, PADDING, ROOT } from './lib/specs.mjs';
import { loadStyleData } from './lib/style.mjs';

export { loadStyleData as loadPromptData };

const rulesFor = (spec) =>
  'Rules: no grid lines, no borders, no text, no numbers, no labels, no watermark.\n' +
  `Nothing crosses a cell boundary; keep at least ${Math.max(2, Math.floor(spec.draw[1] * PADDING))} sprite pixels of empty space inside every cell edge.`;

function pixelGrid(spec, what) {
  const [lw, lh] = spec.draw;
  const s = spec.pixel_scale;
  return (
    `PIXEL GRID: ${what} is a ${lw}x${lh} pixel-art sprite scaled up exactly ${s}x. ` +
    `Draw ONLY with solid square blocks of exactly ${s}x${s} px aligned to a ${s} px grid that starts at the cell's top-left corner. ` +
    `No anti-aliasing, no blur, no gradients, no soft edges, no half-blocks, no detail smaller than one block. ` +
    `Every block in the whole image must be the SAME size on ONE straight grid.\n`
  );
}

function paletteLine(spec, style) {
  if (spec.palette === 'free') return `Use at most ${spec.max_colors} colors.\n`;
  return `Palette: use at most ${spec.max_colors} colors per cell, only from this list: ${style.palette.join(', ')}.\n`;
}

export function renderPrompt(spec, style) {
  const [W, H] = spec.canvas;
  const [cols, rows] = spec.grid;
  const [cw, ch] = spec.cell;
  const [lw, lh] = spec.draw;
  const key = CHROMA[spec.chroma];
  const subject = spec.character ? style.subjects?.[spec.character] : null;
  if (spec.character && !subject) throw new Error(`ART_STYLE.md prompt-data에 subjects.${spec.character}가 없다`);
  const notes = (n) => spec.frame_notes[n] ?? spec.frame_notes[String(n)] ?? '';
  const frameLines = Array.from({ length: spec.frames }, (_, i) => `Cell ${i + 1}: ${notes(i + 1)}`).join('\n');
  const header =
    `Create ONE PNG pixel-art sprite sheet.\n` +
    `Canvas: ${W}x${H} px. Grid: ${cols} columns x ${rows} rows.\n` +
    `Each cell is exactly ${cw}x${ch} px. Read cells left-to-right, top-to-bottom; cell numbers start at 1.\n`;
  const empty = spec.frames < cols * rows ? `Cells ${spec.frames + 1} to ${cols * rows} are completely empty ${key?.name ?? ''}.\n` : '';
  const bodyHeight = Math.round(lh * 0.75);
  const feetRow = Math.round(spec.baseline * lh);
  const placement =
    `In sprite pixels: the character is about ${bodyHeight} px tall, the lowest pixel of the feet is on row ${feetRow} of ${lh} (counting from 1 at the top), horizontally centered.\n` +
    // 모델은 픽셀 수보다 칸 대비 비율을 더 잘 지킨다(PR #10: 48px 요청에 칸을 꽉 채움)
    `Seen in the whole cell: the figure fills only about three quarters of the cell height, about 1/${Math.round(lh / (feetRow - bodyHeight))} of the cell stays empty above the head and a thin empty strip stays below the feet. Never let the figure fill the cell from top to bottom.\n`;

  switch (spec.type) {
    case 'character-anim':
      return (
        header +
        pixelGrid(spec, 'Every cell') +
        `Background: flat solid ${key.name} ${key.hex} in every cell. No floor, no cast shadow, no vignette.\n` +
        `Subject: ${subject}. Match the attached reference sheet exactly: same sprite design, same colors, same proportions, same pixel size.\n` +
        `The SAME character in every cell, at the SAME scale. Side view, facing ${spec.facing}.\n` +
        placement +
        `Style: ${style.sprite_style}.\n` +
        paletteLine(spec, style) +
        `Never use ${key.name} or similar hues on the character.\n` +
        `Frames:\n${frameLines}\n${empty}${rulesFor(spec)}`
      );
    case 'character-ref':
      return (
        header +
        pixelGrid(spec, 'Every used cell') +
        `Background: flat solid ${key.name} ${key.hex} in every cell. No floor, no cast shadow, no vignette.\n` +
        `Subject: ${subject}.\n` +
        `This is the reference sheet for this character: both drawn cells show the SAME character at the SAME scale.\n` +
        placement +
        `Style: ${style.sprite_style}.\n` +
        paletteLine(spec, style) +
        `Never use ${key.name} or similar hues on the character.\n` +
        `Cell 1: ${notes(1) || 'full body, three-quarter front view, neutral standing pose'}\n` +
        `Cell 2: ${notes(2) || `full body, side view facing ${spec.facing}, same pose`}\n` +
        `${empty}${rulesFor(spec)}`
      );
    case 'fx':
      return (
        header +
        pixelGrid(spec, 'Every cell') +
        `Background: flat solid black #000000 in every cell.\n` +
        `Subject: a glowing visual effect only; no character, no ground, no background elements.\n` +
        `Style: ${style.fx_style ?? style.sprite_style}.\n` +
        paletteLine(spec, style) +
        `Frames:\n${frameLines}\n${spec.frames < cols * rows ? `Cells ${spec.frames + 1} to ${cols * rows} are completely black.\n` : ''}${rulesFor(spec)}`
      );
    case 'background':
      return (
        `Create ONE PNG pixel-art illustration, ${W}x${H} px, full-bleed.\n` +
        pixelGrid(spec, 'The whole image') +
        `(${lw}x${lh} sprite pixels in total.)\n` +
        `Scene: ${notes(1) || spec.summary || ''}\n` +
        `Style: ${style.sprite_style}; a battle backdrop that stays calm behind characters.\n` +
        paletteLine(spec, style) +
        'Rules: no text, no letters, no numbers, no signature, no watermark, no frame or border.'
      );
    case 'character-sheet':
      return (
        `Create ONE character design sheet illustration, ${W}x${H} px.\n` +
        `Background: plain warm off-white paper, no scenery.\n` +
        `Subject: ${subject}.\n` +
        `Layout: ${notes(1) || 'full body front view, three-quarter view and side view standing side by side at the same scale, plus three small head close-ups showing calm, determined and surprised expressions'}.\n` +
        `Style: ${style.illustration_style}.\n` +
        `Keep the outfit colors consistent with: ${style.palette_hint ?? 'the color notes in the subject description'}.\n` +
        'Rules: no text, no labels, no arrows, no color swatches, no signature, no watermark.'
      );
    default:
      // card-art, portrait, story-cg: 이야기 갈래(일러스트)
      return (
        `Create ONE illustration, ${W}x${H} px, full-bleed.\n` +
        (subject ? `Main character: ${subject}. Match the attached character design sheet if one is attached.\n` : '') +
        `Scene: ${notes(1) || spec.summary || ''}\n` +
        (spec.type === 'portrait' ? 'Framing: bust portrait, character centered, simple softly painted background.\n' : '') +
        (spec.type === 'card-art' ? 'Framing: vertical card illustration; keep the important subject in the upper two thirds.\n' : '') +
        `Style: ${style.illustration_style}.\n` +
        'Rules: no text, no letters, no numbers, no signature, no watermark, no frame or border.'
      );
  }
}

export function promptFor(id, root = ROOT) {
  return renderPrompt(loadSpec(id, root), loadStyleData(root));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const id = args.find((a) => !a.startsWith('--'));
  if (!id) {
    console.error('사용: npm run assets:prompt -- <id> [--out file]');
    process.exit(2);
  }
  try {
    const text = promptFor(id);
    const oi = args.indexOf('--out');
    if (oi >= 0) writeFileSync(args[oi + 1], text + '\n');
    else console.log(text);
  } catch (e) {
    console.error(`✖ ${e.message}`);
    process.exit(1);
  }
}

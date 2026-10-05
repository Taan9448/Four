#!/usr/bin/env node
// 명세 → 완성 이미지 생성 프롬프트(영어). 이슈 본문과 Codex 작업에 그대로 쓰인다.
// 사용: npm run assets:prompt -- <id> [--out file]
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parse } from 'yaml';
import { CHROMA, loadSpec, paths, ROOT } from './lib/specs.mjs';

export function loadPromptData(root = ROOT) {
  const md = readFileSync(paths(root).artStyle, 'utf8');
  const at = md.indexOf('<!-- prompt-data -->');
  if (at < 0) throw new Error('docs/ART_STYLE.md에 <!-- prompt-data --> 블록이 없다');
  const m = md.slice(at).match(/```yaml\n([\s\S]*?)```/);
  if (!m) throw new Error('prompt-data 아래에 ```yaml 블록이 없다');
  return parse(m[1]);
}

const RULES =
  'Rules: no grid lines, no borders, no text, no numbers, no labels, no watermark.\n' +
  'Nothing crosses a cell boundary; keep 8% padding inside every cell.';

export function renderPrompt(spec, style) {
  const [W, H] = spec.canvas;
  const [cols, rows] = spec.grid;
  const [cw, ch] = spec.cell;
  const key = CHROMA[spec.chroma];
  const subject = spec.character ? style.subjects?.[spec.character] : null;
  if (spec.character && !subject) throw new Error(`ART_STYLE.md prompt-data에 subjects.${spec.character}가 없다`);
  const notes = (n) => spec.frame_notes[n] ?? spec.frame_notes[String(n)] ?? '';
  const frameLines = Array.from({ length: spec.frames }, (_, i) => `Cell ${i + 1}: ${notes(i + 1)}`).join('\n');
  const header =
    `Create ONE PNG sprite sheet.\n` +
    `Canvas: ${W}x${H} px. Grid: ${cols} columns x ${rows} rows.\n` +
    `Each cell is exactly ${cw}x${ch} px. Read cells left-to-right, top-to-bottom; cell numbers start at 1.\n`;
  const empty = spec.frames < cols * rows ? `Cells ${spec.frames + 1} to ${cols * rows} are empty ${key?.name ?? ''}.\n` : '';

  switch (spec.type) {
    case 'character-anim':
      return (
        header +
        `Background: flat solid ${key.name} ${key.hex} in every cell. No gradient, no floor, no cast shadow, no vignette.\n` +
        `Subject: ${subject}. Match the attached reference sheet exactly: face, hair, outfit, colors, proportions.\n` +
        `The SAME character in every cell, at the SAME scale.\n` +
        `Side view. Facing ${spec.facing}. Feet rest on a baseline at ${Math.round(spec.baseline * 100)}% of cell height, horizontally centered.\n` +
        `Style: ${style.sprite_style}. Never use ${key.name} or similar hues on the character.\n` +
        `Frames:\n${frameLines}\n${empty}${RULES}`
      );
    case 'character-ref':
      return (
        header +
        `Background: flat solid ${key.name} ${key.hex} in every cell. No gradient, no floor, no cast shadow, no vignette.\n` +
        `Subject: ${subject}.\n` +
        `This is the reference sheet for this character: both cells show the SAME character at the SAME scale.\n` +
        `Feet rest on a baseline at ${Math.round(spec.baseline * 100)}% of cell height, horizontally centered.\n` +
        `Style: ${style.sprite_style}. Never use ${key.name} or similar hues on the character.\n` +
        `Cell 1: ${notes(1) || 'full body, three-quarter front view, neutral standing pose'}\n` +
        `Cell 2: ${notes(2) || `full body, side view facing ${spec.facing}, same pose`}\n${RULES}`
      );
    case 'fx':
      return (
        header +
        `Background: flat solid black #000000 in every cell.\n` +
        `Subject: a light-emitting effect drawn for additive blending; no character, no ground, no background elements.\n` +
        `Style: ${style.sprite_style}; glowing light, crisp core.\n` +
        `Frames:\n${frameLines}\n${spec.frames < cols * rows ? `Cells ${spec.frames + 1} to ${cols * rows} are empty black.\n` : ''}${RULES}`
      );
    default:
      return (
        `Create ONE PNG illustration, ${W}x${H} px, full-bleed.\n` +
        (subject ? `Subject: ${subject}.\n` : '') +
        `Scene: ${notes(1) || spec.summary || ''}\n` +
        `Style: ${style.illustration_style}.\n` +
        'Rules: no text, no letters, no numbers, no signature, no watermark, no frame or border.'
      );
  }
}

export function promptFor(id, root = ROOT) {
  return renderPrompt(loadSpec(id, root), loadPromptData(root));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
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

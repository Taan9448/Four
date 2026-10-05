// docs/ART_STYLE.md의 prompt-data 블록(스타일 문장·마스터 팔레트·캐릭터 묘사) 읽기.
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { paths, ROOT } from './specs.mjs';

export function loadStyleData(root = ROOT) {
  const md = readFileSync(paths(root).artStyle, 'utf8');
  const at = md.indexOf('<!-- prompt-data -->');
  if (at < 0) throw new Error('docs/ART_STYLE.md에 <!-- prompt-data --> 블록이 없다');
  const m = md.slice(at).match(/```yaml\n([\s\S]*?)```/);
  if (!m) throw new Error('prompt-data 아래에 ```yaml 블록이 없다');
  return parse(m[1]);
}

const hexToRgb = (hex) => {
  const n = parseInt(String(hex).replace('#', ''), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
};

/** 마스터 팔레트를 [r, g, b] 배열로. 명세가 palette: free면 null(색 맞춤 안 함) */
export function paletteFor(spec, root = ROOT) {
  if (spec.palette === 'free') return null;
  const list = loadStyleData(root).palette;
  if (!Array.isArray(list) || list.length === 0) throw new Error('ART_STYLE.md prompt-data에 palette가 없다');
  return list.map(hexToRgb);
}

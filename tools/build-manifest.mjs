#!/usr/bin/env node
// assets/manifest.json 생성(커밋하지 않음). predev·prebuild·test에서 자동 실행된다.
// 에셋 id마다 실제 스프라이트(assets/sprites)를 우선하고, 없으면 임시 시트(assets/placeholders)를 쓴다.
// 그래서 아트 PR이 머지되면 코드 수정 없이 게임 속 그림이 바뀐다.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { listSpecIds, paths, ROOT } from './lib/specs.mjs';

/** @returns {{ generatedBy: string, assets: Record<string, { source: 'sprites' | 'placeholders', dir: string, meta: any }> }} */
export function buildManifest(root = ROOT) {
  const p = paths(root);
  /** @type {Record<string, { source: 'sprites' | 'placeholders', dir: string, meta: any }>} */
  const assets = {};
  for (const id of listSpecIds(root)) {
    for (const [source, dir] of [['sprites', p.sprites(id)], ['placeholders', p.placeholders(id)]]) {
      const metaPath = join(dir, 'meta.json');
      if (!existsSync(metaPath)) continue;
      assets[id] = { source, dir: `assets/${source}/${id}`, meta: JSON.parse(readFileSync(metaPath, 'utf8')) };
      break;
    }
  }
  return { generatedBy: 'tools/build-manifest.mjs', assets };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const manifest = buildManifest();
  writeFileSync(paths().manifest, JSON.stringify(manifest, null, 2) + '\n');
  const list = Object.values(manifest.assets);
  const real = list.filter((a) => a.source === 'sprites').length;
  console.log(`manifest: 에셋 ${list.length}개 (실제 ${real}, 임시 ${list.length - real})`);
}

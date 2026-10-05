#!/usr/bin/env node
// 명세별 상태를 파일로 계산한다. 명세에는 status 필드가 없다.
//  requested: 명세만 있음 / delivered: assets/sprites/<id>/meta.json 있음
//  reslice: 납품됐지만 명세가 바뀌어(프레임 크기 등) Codex가 assets:slice를 다시 돌려야 함
//  integrated는 사람이 게임에서 확인한 뒤 이슈 라벨로 표시한다.
// 사용: npm run assets:status [-- --json]
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { listSpecIds, loadSpec, paths, ROOT } from './lib/specs.mjs';

export function assetStatus(root = ROOT) {
  const p = paths(root);
  const delivered = (id) => existsSync(join(p.sprites(id), 'meta.json'));
  return listSpecIds(root).map((id) => {
    const spec = loadSpec(id, root);
    const waiting = spec.depends_on.filter((d) => !delivered(d));
    let status = delivered(id) ? 'delivered' : 'requested';
    if (status === 'delivered') {
      const meta = JSON.parse(readFileSync(join(p.sprites(id), 'meta.json'), 'utf8'));
      if (meta.frameW !== spec.logical[0] || meta.frameH !== spec.logical[1]) status = 'reslice';
    }
    return {
      id,
      type: spec.type,
      status,
      placeholder: existsSync(join(p.placeholders(id), 'meta.json')),
      dependsOn: spec.depends_on,
      blockedBy: waiting,
      summary: spec.summary ?? '',
    };
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const rows = assetStatus();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(rows, null, 2));
  } else {
    console.log('id                 type            상태       임시  대기 중인 선행 에셋');
    for (const r of rows) {
      console.log(
        `${r.id.padEnd(18)} ${r.type.padEnd(15)} ${r.status.padEnd(10)} ${r.placeholder ? '✔' : '-'}     ${r.blockedBy.join(', ') || '-'}`,
      );
    }
  }
}

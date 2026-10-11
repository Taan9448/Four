#!/usr/bin/env node
// CI 폴더 소유권 검사.
//  - art/* 브랜치(Codex): assets/source/**, assets/sprites/** 외의 파일을 바꾸면 실패
//  - 그 밖의 브랜치(Claude·사람): 위 두 폴더를 바꾸면 실패
//  - 모든 브랜치: assets/manifest.json 커밋 금지(빌드 때 생성)
// 사용: node tools/check-ownership.mjs --base origin/main [--branch art/12-haun_idle]
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const ART_ONLY = [/^assets\/source\//, /^assets\/sprites\//];

export function checkOwnership(branch, files) {
  const errors = [];
  const isArt = branch.startsWith('art/');
  for (const f of files) {
    if (f === 'assets/manifest.json') {
      errors.push(`${f}: 커밋 금지(빌드 때 생성되는 파일)`);
      continue;
    }
    const artPath = ART_ONLY.some((re) => re.test(f));
    if (isArt && !artPath) errors.push(`${f}: art/* 브랜치는 assets/source/, assets/sprites/만 바꿀 수 있다`);
    if (!isArt && artPath) errors.push(`${f}: assets/source/, assets/sprites/는 Codex(art/* 브랜치) 전용이다`);
  }
  // 다시 그리기(이미 머지된 에셋을 새 PR로)는 art/<이슈번호>-<id>-fix(-2, -3 …)도 받는다
  if (isArt && !/^art\/\d+-[a-z0-9_]+(-fix(-\d+)?)?$/.test(branch)) errors.push(`브랜치 이름 "${branch}"이(가) art/<이슈번호>-<id>[-fix] 형식이 아니다`);
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const get = (name) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const base = get('--base') ?? 'origin/main';
  const branch =
    get('--branch') ??
    process.env.GITHUB_HEAD_REF ??
    execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim();
  const files = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
  const errors = checkOwnership(branch, files);
  console.log(`브랜치 ${branch}, 바뀐 파일 ${files.length}개`);
  if (errors.length) {
    for (const e of errors) console.log(`✖ ${e}`);
    process.exit(1);
  }
  console.log('✔ 폴더 소유권 검사 통과');
}

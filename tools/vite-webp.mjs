// 빌드용 Vite 플러그인(2026-10-09, 로딩 속도): 일러스트 계열 프레임 PNG를 배포본에서만 WebP로 바꾼다.
// - 대상: assets/manifest.json에서 type이 ILLUSTRATION인 실제 스프라이트(장면 그림·반신 그림·지도·시작 화면 그림).
//   픽셀 아트(캐릭터·배경·이펙트·아이콘)는 PNG 그대로 둔다(손실 압축은 픽셀 경계를 흐린다).
// - 원본 assets/는 건드리지 않는다. 바꾼 결과는 node_modules/.cache/webp에 내용 해시로 남겨 다음 빌드를 빠르게 한다.
// - 실제 그림이 들어온 에셋의 임시 시트(assets/placeholders/<id>)는 배포본에 넣지 않는다(manifest가 가리키지 않는 죽은 파일).
// - 개발 서버(npm run dev)는 원본 PNG를 그대로 쓴다.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

export const ILLUSTRATION = new Set(['story-cg', 'character-standing', 'map-art', 'key-art']);
const WEBP = { quality: 82, alphaQuality: 90, effort: 4 };

export function webpIllustrations({ root = process.cwd() } = {}) {
  const cacheDir = path.join(root, 'node_modules/.cache/webp');
  let ids = new Set();
  let real = new Set();
  let stats = { files: 0, before: 0, after: 0 };
  return {
    name: 'webp-illustrations',
    apply: 'build',
    enforce: 'pre',
    buildStart() {
      const manifest = JSON.parse(readFileSync(path.join(root, 'assets/manifest.json'), 'utf8'));
      real = new Set(Object.entries(manifest.assets).filter(([, e]) => e.source === 'sprites').map(([id]) => id));
      ids = new Set(Object.entries(manifest.assets).filter(([, e]) => e.source === 'sprites' && ILLUSTRATION.has(e.meta.type)).map(([id]) => id));
      stats = { files: 0, before: 0, after: 0 };
      mkdirSync(cacheDir, { recursive: true });
    },
    async load(id) {
      const dead = /[\\/]assets[\\/]placeholders[\\/]([^\\/]+)[\\/]frame_\d+\.png\?url$/.exec(id);
      if (dead && real.has(dead[1])) return 'export default "";';
      const m = /[\\/]assets[\\/]sprites[\\/]([^\\/]+)[\\/](frame_\d+)\.png\?url$/.exec(id);
      if (!m || !ids.has(m[1])) return null;
      const file = id.slice(0, -'?url'.length);
      const png = readFileSync(file);
      const key = createHash('sha1').update(png).update(JSON.stringify(WEBP)).digest('hex');
      const cached = path.join(cacheDir, `${key}.webp`);
      let webp;
      if (existsSync(cached)) webp = readFileSync(cached);
      else {
        webp = await sharp(png).webp(WEBP).toBuffer();
        writeFileSync(cached, webp);
      }
      stats.files++;
      stats.before += png.length;
      stats.after += webp.length;
      const ref = this.emitFile({ type: 'asset', name: `${m[1]}_${m[2]}.webp`, source: webp });
      return `export default import.meta.ROLLUP_FILE_URL_${ref};`;
    },
    buildEnd() {
      if (stats.files) console.log(`[webp] 일러스트 ${stats.files}장: ${(stats.before / 1e6).toFixed(1)}MB → ${(stats.after / 1e6).toFixed(1)}MB`);
    },
  };
}

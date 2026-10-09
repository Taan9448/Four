import { defineConfig } from 'vitest/config';
import { webpIllustrations } from './tools/vite-webp.mjs';

export default defineConfig({
  // 상대 경로로 빌드해 GitHub Pages의 /<repo>/ 하위 경로에서도 동작하게 한다.
  base: './',
  plugins: [webpIllustrations()],
  build: {
    // 스프라이트 프레임은 base64로 JS에 넣지 않는다(작은 PNG 1,200여 장이 JS를 1.7MB 키웠다). 쓸 때 파일로 받는다
    assetsInlineLimit: (file) => (/[\\/]assets[\\/](sprites|placeholders)[\\/]/.test(file) ? false : undefined),
  },
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000,
  },
});

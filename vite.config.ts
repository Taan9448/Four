import { defineConfig } from 'vitest/config';

export default defineConfig({
  // 상대 경로로 빌드해 GitHub Pages의 /<repo>/ 하위 경로에서도 동작하게 한다.
  base: './',
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000,
  },
});

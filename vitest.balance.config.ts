// npm run balance — 자동 플레이 봇 밸런스 측정(tools/balance/*.run.ts). 일반 테스트(npm test)와 따로 돈다.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tools/balance/**/*.run.ts'],
    testTimeout: 60 * 60 * 1000,
  },
});

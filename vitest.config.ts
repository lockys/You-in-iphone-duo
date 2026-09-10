import { defineConfig } from 'vitest/config';
import path from 'node:path';
export default defineConfig({
  resolve: { alias: { '@': path.resolve('src') } },
  test: { include: ['tests/**/*.test.ts'], testTimeout: 180000, hookTimeout: 180000, fileParallelism: false },
});

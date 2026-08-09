import { defineConfig } from 'vitest/config';
import path from 'path';

// Two projects instead of one: `environmentMatchGlobs` (which used to pick jsdom
// for `src/renderer/**`) is a no-op on Vitest 4, so the split has to be explicit.
// `extends: true` pulls in the root `resolve` alias and `globals` below.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer'),
    },
  },
  test: {
    globals: true,
    coverage: {
      provider: 'v8',
      include: ['src/main/serialize.ts', 'src/main/exportFormat.ts', 'src/main/version.ts', 'src/renderer/utils/**'],
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'main',
          environment: 'node',
          include: ['src/**/__tests__/**/*.test.{ts,tsx}'],
          exclude: ['**/node_modules/**', 'dist/**', 'src/renderer/**'],
        },
      },
      {
        extends: true,
        test: {
          name: 'renderer',
          environment: 'jsdom',
          include: ['src/renderer/**/__tests__/**/*.test.{ts,tsx}'],
          exclude: ['**/node_modules/**', 'dist/**'],
          // jest-dom's matchers are DOM-only, so they belong to this project.
          setupFiles: ['src/test/setup.ts'],
        },
      },
    ],
  },
});

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/model/**'],
    setupFiles: ['tests/offline.ts'],
  },
});

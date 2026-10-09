import { defineConfig } from 'vitest/config';

// Deliberately fails if no real-model cases exist; 1.6 owns the harness.
export default defineConfig({
  test: { environment: 'node', include: ['tests/model/**/*.test.ts'] },
});

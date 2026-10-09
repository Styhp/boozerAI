import { defineConfig } from 'vitest/config';

// Deliberately fails if no real-model cases exist; 1.6 owns the harness.
export default defineConfig({
  // One model request at a time: parallel files would queue behind each other and skew timings.
  test: { environment: 'node', include: ['tests/model/**/*.test.ts'], fileParallelism: false },
});

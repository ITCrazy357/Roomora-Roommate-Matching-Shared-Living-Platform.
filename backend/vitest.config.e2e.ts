import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Suites include global dashboard/queue assertions; isolate their fixtures in time.
    fileParallelism: false,
  },
});

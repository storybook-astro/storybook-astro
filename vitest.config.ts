import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      clean: true,
      reporter: ['text', 'html', 'cobertura', 'lcov'],
    },
    projects: ['apps/*/vitest.config.ts', 'packages/*/vitest.config.ts']
  }
});

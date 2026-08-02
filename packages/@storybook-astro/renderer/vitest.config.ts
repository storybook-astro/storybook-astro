import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'renderer',
    environment: 'node',
    include: ['src/**/*.test.ts']
  }
});

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'adapter-node',
    environment: 'node',
    include: ['src/**/*.test.ts']
  }
});

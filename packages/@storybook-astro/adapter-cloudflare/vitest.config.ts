import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'adapter-cloudflare',
    environment: 'node',
    include: ['src/**/*.test.ts']
  }
});

import { defineConfig } from '@storybook-astro/framework/vitest';

export default defineConfig({
  root: import.meta.dirname,
  test: {
    name: 'smoke-astro5',
    setupFiles: ['.storybook/vitest.setup.js'],
    include: ['src/**/*.test.ts'],
  },
  integrations: [],
});

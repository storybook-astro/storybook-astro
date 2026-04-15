/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';

export default defineConfig({
  plugins: [
    storybookTest({ configDir: '.storybook' }),
  ],
  test: {
    name: 'astro5-server-browser',
    browser: {
      enabled: true,
      provider: playwright,
      instances: [{ browser: 'chromium' }],
      headless: true,
    },
    setupFiles: ['.storybook/vitest.setup.ts'],
  },
});

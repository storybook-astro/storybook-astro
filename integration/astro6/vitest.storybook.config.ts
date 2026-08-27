/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';

// Deliberately NOT using `defineConfig` from '@storybook-astro/framework/vitest':
// `storybookTest` applies the framework's `viteFinal`, which already merges the
// Astro Vite config. Layering our own `getViteConfig` wrapper on top would
// duplicate every Astro plugin and re-introduce `astro:server`.
//
// No `setupFiles` either — addon-vitest provides the project annotations itself,
// and this app's existing setup file installs a happy-dom `window`, which would
// clobber the real one in browser mode.
export default defineConfig({
  plugins: [storybookTest({ configDir: '.storybook' })],
  test: {
    name: 'astro6-storybook',
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }]
    }
  }
});

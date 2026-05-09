import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import { getViteConfig } from 'astro/config';
import react from '@vitejs/plugin-react';
import preact from '@preact/preset-vite';
import vue from '@vitejs/plugin-vue';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import solid from 'vite-plugin-solid';
import alpinejs from '@astrojs/alpinejs';
import { alpinejs as alpineIntegration } from '@storybook-astro/framework/integrations';
import { registerTestingIntegrationsForRoot } from '@storybook-astro/framework/testing/integration-config';

const root = import.meta.dirname;

// Register the Alpine integration so the testing renderer daemon can SSR
// Alpine-based Astro components in the happy-dom test environment.
registerTestingIntegrationsForRoot(root, [alpineIntegration()]);

const globalSetupPath = resolve(
  root,
  '../@storybook-astro/framework/src/vitest/global-setup.ts'
);

const vitestConfig = defineConfig({
  mode: 'test',
  plugins: [
    preact({
      include: ['**/preact/**'],
      reactAliasesEnabled: false,
      babel: {}
    }),
    solid({
      include: ['**/solid/*.tsx']
    }),
    vue(),
    svelte(),
    react({
      include: [/[/\\]react[/\\]/]
    })
  ],
  test: {
    setupFiles: ['vitest.setup.ts'],
    name: 'components',
    environment: 'happy-dom',
    include: ['src/**/*.test.ts'],
    globalSetup: [globalSetupPath]
  }
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default getViteConfig(vitestConfig as any, {
  configFile: false,
  integrations: [alpinejs()]
});

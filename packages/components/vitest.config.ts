import react from '@vitejs/plugin-react';
import preact from '@preact/preset-vite';
import vue from '@vitejs/plugin-vue';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import solid from 'vite-plugin-solid';
import { alpinejs as alpineIntegration } from '@storybook-astro/framework/integrations';
import { defineConfig } from '@storybook-astro/framework/vitest';

const vitestConfig = defineConfig({
  root: import.meta.dirname,
  mode: 'test',
  integrations: [alpineIntegration()],
  astroConfigFile: false,
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
    include: ['src/**/*.test.ts']
  }
});

export default vitestConfig;

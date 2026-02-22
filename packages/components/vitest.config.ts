import { defineConfig } from 'vitest/config';
import { getViteConfig } from 'astro/config';
import react from '@vitejs/plugin-react';
import preact from '@preact/preset-vite';
import vue from '@vitejs/plugin-vue';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import solid from 'vite-plugin-solid';
import alpinejs from '@astrojs/alpinejs';

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
      include: ['**/react/**']
    })
  ],
  test: {
    setupFiles: ['vitest.setup.ts'],
    name: 'components',
    environment: 'happy-dom',
    include: ['src/**/*.test.ts']
  }
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default getViteConfig(vitestConfig as any, {
  configFile: false,
  integrations: [alpinejs()]
});

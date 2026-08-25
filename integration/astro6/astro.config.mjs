// @ts-check
import { defineConfig, fontProviders } from 'astro/config';
import react from '@astrojs/react';
import solid from '@astrojs/solid-js';
import vue from '@astrojs/vue';
import preact from '@astrojs/preact';
import svelte from '@astrojs/svelte';
import alpinejs from '@astrojs/alpinejs';
import { projectBanner } from './vite-plugin-project-banner.mjs';

// https://astro.build/config
export default defineConfig({
  output: 'static',
  vite: {
    plugins: [projectBanner()],
  },
  fonts: [
    {
      provider: fontProviders.google(),
      name: 'Inter',
      cssVariable: '--font-inter',
      weights: [400, 700],
    },
  ],
  integrations: [
    react({
      include: ['**/react/**'],
    }),
    solid({
      include: ['**/solid/**'],
    }),
    preact({
      include: ['**/preact/**'],
    }),
    vue(),
    svelte(),
    alpinejs(),
  ],
});

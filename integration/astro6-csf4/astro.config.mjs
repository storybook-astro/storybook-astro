// @ts-check
import { defineConfig, fontProviders } from 'astro/config';
import react from '@astrojs/react';
import solid from '@astrojs/solid-js';
import vue from '@astrojs/vue';
import preact from '@astrojs/preact';
import svelte from '@astrojs/svelte';
import alpinejs from '@astrojs/alpinejs';

export const fonts = [
  {
    provider: fontProviders.google(),
    name: 'Inter',
    cssVariable: '--font-inter',
    weights: [400, 700],
  },
];

// https://astro.build/config
export default defineConfig({
  output: 'static',
  fonts,
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

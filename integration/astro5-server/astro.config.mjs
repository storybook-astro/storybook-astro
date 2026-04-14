// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import react from '@astrojs/react';
import solid from '@astrojs/solid-js';
import vue from '@astrojs/vue';
import preact from '@astrojs/preact';
import svelte from '@astrojs/svelte';
import alpinejs from '@astrojs/alpinejs';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
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

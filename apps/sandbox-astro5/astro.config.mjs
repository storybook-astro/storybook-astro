// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import solid from '@astrojs/solid-js';
import vue from '@astrojs/vue';
import preact from '@astrojs/preact';
import svelte from '@astrojs/svelte';
import alpinejs from '@astrojs/alpinejs';

// https://astro.build/config
export default defineConfig({
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

/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import { getViteConfig } from 'astro/config';
import react from '@astrojs/react';
import solid from '@astrojs/solid-js';
import vue from '@astrojs/vue';
import preact from '@astrojs/preact';
import svelte from '@astrojs/svelte';
import alpinejs from '@astrojs/alpinejs';
import { cjsInteropPlugin } from '@storybook-astro/framework/testing';
import { vitePluginAstroComponentMarker } from '@storybook-astro/framework/vitePluginAstroComponentMarker.ts';

const vitestConfig = defineConfig({
  mode: 'test',
  plugins: [
    // Several Astro 6 runtime dependencies (cssesc, cookie, react, etc.) are
    // CJS modules that fail in Vite 6's ESM module runner. This plugin
    // auto-detects and wraps them with CJS shims so they evaluate as ESM.
    cjsInteropPlugin(),
    // In Astro 6, the client-side transform of .astro files no longer sets
    // isAstroComponentFactory. This plugin patches the stub so portable
    // stories can detect Astro components.
    vitePluginAstroComponentMarker()
  ],
  test: {
    name: 'astro5',
    environment: 'happy-dom',
    setupFiles: ['.storybook/vitest.setup.ts'],
    include: ['**/*.test.ts', '**/*.test.tsx']
  }
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default getViteConfig(vitestConfig as any, {
  // Don't read astro.config.mjs
  configFile: false,
  // Tests specific astro config
  integrations: [
    react({
      include: ['**/react/**']
    }),
    solid({
      // Use non-recursive glob so vite-plugin-solid doesn't compile test
      // components. In the test env, Solid's SSR compilation mode conflicts
      // with the client-side runtime (template() becomes notSup() on server).
      // Solid rendering is validated in Storybook's browser instead.
      include: ['**/solid/*.tsx']
    }),
    preact({
      include: ['**/preact/**']
    }),
    vue(),
    svelte({ extensions: ['.svelte'] }),
    alpinejs()
  ]
});

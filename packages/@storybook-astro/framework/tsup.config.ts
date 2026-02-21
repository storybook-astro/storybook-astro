// eslint-disable-next-line n/no-extraneous-import
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/preset.ts',
    'src/testing.ts',
    'src/integrations/index.ts',
    'src/middleware.ts',
  ],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: [
    'astro',
    'storybook',
    'storybook/internal/types',
    'vite',
    'react',
    'react-dom',
    'vue',
    'svelte',
    'solid-js',
    'preact',
    'alpinejs',
    '@storybook/react',
    '@storybook/vue3',
    '@storybook/svelte',
    '@storybook/preact',
    '@storybook-astro/renderer',
    'storybook-solidjs',
    'sanitize-html',
    'virtual:astro-container-renderers',
  ],
});

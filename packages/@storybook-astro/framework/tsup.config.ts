import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/node/index.ts',
    'src/preset.ts',
    'src/testing.ts',
    'src/vitest/index.ts',
    'src/integrations/index.ts',
    'src/renderer/renderer-dev.ts',
    'src/renderer/renderer-static.ts',
    'src/renderer/renderer-server.ts',
    'src/middleware.ts',
    'src/vitest/global-setup.ts',
  ],
  format: ['esm'],
  dts: {
    // middleware.ts is loaded dynamically via viteServer.ssrLoadModule at runtime
    // and imports virtual modules that can't be resolved during DTS compilation.
    // It has no public API consumers, so DTS is not needed for it.
    entry: [
      'src/index.ts',
      'src/node/index.ts',
      'src/preset.ts',
      'src/testing.ts',
      'src/vitest/index.ts',
      'src/integrations/index.ts',
    ],
    // Prepend the shim reference to every generated .d.ts so TypeScript
    // automatically loads dist/shim.d.ts and the declare module '*.astro'
    // ambient declaration is globally available to any consumer project.
    banner: '/// <reference path="./shim.d.ts" />',
  },
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

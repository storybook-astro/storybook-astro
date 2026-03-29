import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/preset.ts',
    'src/types.ts',
    'src/render.tsx',
    'src/entry-preview.ts',
    'src/index.ts',
  ],
  format: ['esm'],
  dts: {
    // render.tsx and entry-preview.ts import virtual modules that cannot be
    // resolved during isolated DTS compilation. Both are runtime-only entries
    // loaded by Vite/Storybook — they have no public API consumers needing DTS.
    entry: [
      'src/preset.ts',
      'src/types.ts',
      'src/index.ts',
    ],
  },
  sourcemap: true,
  clean: true,
  external: [
    'astro',
    'astro:scripts/page.js',
    'storybook',
    'storybook/internal/types',
    'react',
    'react-dom',
    '@storybook/react',
    /^virtual:/,
  ],
});

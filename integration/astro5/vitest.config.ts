/// <reference types="vitest" />
import { defineConfig } from '@storybook-astro/framework/vitest';
import {
  react,
  solid,
  preact,
  vue,
  svelte,
  alpinejs
} from '@storybook-astro/framework/integrations';

export default defineConfig({
  root: import.meta.dirname,
  test: {
    name: 'astro5',
    setupFiles: ['.storybook/vitest.setup.ts'],
    include: ['**/*.test.ts', '**/*.test.tsx']
  },
  integrations: [
    react({
      include: [/[/\\]react[/\\]/]
    }),
    solid({
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

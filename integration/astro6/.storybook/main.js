import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
// This file has been automatically migrated to valid ESM format by Storybook.
import {
  react,
  solid,
  preact,
  vue,
  svelte,
  alpinejs
} from '@storybook-astro/framework/integrations';

/** @type { import('@storybook-astro/framework').StorybookConfig } */
const config = {
  stories: [
    '../src/**/*.mdx',
    '../src/**/*.stories.@(js|jsx|mjs|ts|tsx)',
    getAbsolutePath('@storybook-astro/components') + '/src/*.mdx',
    getAbsolutePath('@storybook-astro/components') + '/src/**/*.stories.@(js|jsx|mjs|ts|tsx)'
  ],
  addons: [getAbsolutePath('@chromatic-com/storybook'), getAbsolutePath('@storybook/addon-docs')],
  framework: {
    name: '@storybook-astro/framework',
    options: {
      renderMode: 'static',
      storyRules: './.storybook/story-rules.ts',
      integrations: [
        react({
          include: ['**/react/**']
        }),
        solid({
          include: ['**/solid/**']
        }),
        preact({
          include: ['**/preact/**']
        }),
        vue(),
        svelte(),
        alpinejs({
          entrypoint: './.storybook/alpine-entrypoint.js'
        })
      ]
    }
  }
};

export default config;

function getAbsolutePath(value) {
  // eslint-disable-next-line n/no-unsupported-features/node-builtins
  return dirname(fileURLToPath(import.meta.resolve(`${value}/package.json`)));
}

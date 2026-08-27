import { fileURLToPath } from 'node:url';
import { dirname, relative } from 'node:path';
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
    relativeToConfig('@storybook-astro/components') + '/src/*.mdx',
    relativeToConfig('@storybook-astro/components') + '/src/**/*.stories.@(js|jsx|mjs|ts|tsx)'
  ],
  addons: [
    getAbsolutePath('@chromatic-com/storybook'),
    getAbsolutePath('@storybook/addon-docs'),
    getAbsolutePath('@storybook/addon-vitest')
  ],
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

// `@storybook/addon-vitest` builds its test globs with `join(configDir, ...)`,
// which mangles an absolute story path into `.storybook/Users/...` and silently
// matches nothing. Resolving the package the portable way and then making the
// result relative to this config dir keeps both Storybook and the test runner
// pointed at the same files.
function relativeToConfig(value) {
  return relative(dirname(fileURLToPath(import.meta.url)), getAbsolutePath(value));
}

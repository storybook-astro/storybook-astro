import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cloudflare } from '@storybook-astro/adapter-cloudflare';
import { preact } from '@storybook-astro/framework/integrations';

const componentsRoot = getAbsolutePath('@storybook-astro/components');

/** @type { import('@storybook-astro/framework').StorybookConfig } */
const config = {
  stories: [
    '../src/stories/Overview.mdx',
    `${componentsRoot}/src/NpmWeeklyDownloads/astro/NpmWeeklyDownloads.stories.js`,
    `${componentsRoot}/src/GithubContributors/astro/GithubContributors.stories.js`,
    `${componentsRoot}/src/GithubStars/astro/GithubStars.stories.js`,
    // A decorator-only component: Wrapper.astro is referenced only from this
    // story file, so it must still be compiled into the Worker.
    `${componentsRoot}/src/Decorator/Decorator.stories.jsx`
  ],
  addons: [getAbsolutePath('@storybook/addon-docs')],
  framework: {
    name: '@storybook-astro/framework',
    options: {
      renderMode: 'server',
      storyRules: './.storybook/story-rules.ts',
      server: {
        adapter: cloudflare({ name: 'storybook-astro6-server' })
      },
      integrations: [
        preact({
          include: ['**/preact/**']
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

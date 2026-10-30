import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cloudflare } from '@storybook-astro/adapter-cloudflare';
import { preact } from '@storybook-astro/framework/integrations';

const componentsRoot = getAbsolutePath('@storybook-astro/components');
const sharedRoot = getAbsolutePath('@storybook-astro/integration-server-shared');

/** @type { import('@storybook-astro/framework').StorybookConfig } */
const config = {
  stories: [
    `${componentsRoot}/src/NpmWeeklyDownloads/astro/NpmWeeklyDownloads.stories.js`,
    `${componentsRoot}/src/GithubContributors/astro/GithubContributors.stories.js`,
    `${componentsRoot}/src/GithubStars/astro/GithubStars.stories.js`,
    `${componentsRoot}/src/Decorator/Decorator.stories.jsx`,
    `${componentsRoot}/src/Decorator/AdvancedDecorator.stories.jsx`
  ],
  framework: {
    name: '@storybook-astro/framework',
    options: {
      renderMode: 'server',
      storyRules: `${sharedRoot}/story-rules.ts`,
      server: {
        adapter: cloudflare({ name: 'storybook-astro6-server' }),
        authToken: process.env.STORYBOOK_ASTRO_SERVER_TOKEN
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

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preact } from '@storybook-astro/framework/integrations';

const componentsRoot = getAbsolutePath('@storybook-astro/components');

/** @type { import('@storybook-astro/framework').StorybookConfig } */
const config = {
  stories: [
    '../src/stories/Overview.mdx',
    // Regression fixture for issue #136 — tsconfig `~/*` aliases in server mode.
    '../src/stories/aliased/AliasedOuter.stories.js',
    `${componentsRoot}/src/NpmWeeklyDownloads/astro/NpmWeeklyDownloads.stories.js`,
    `${componentsRoot}/src/GithubContributors/astro/GithubContributors.stories.js`,
    `${componentsRoot}/src/GithubStars/astro/GithubStars.stories.js`,
    // Component-level Astro decorator (docs/DECORATOR_SUPPORT.md, Step 4/6):
    // Wrapper.astro is only ever referenced from this story file, so it also
    // exercises the server-mode snapshot picking up a decorator-only component.
    `${componentsRoot}/src/Decorator/Decorator.stories.jsx`
  ],
  addons: [getAbsolutePath('@storybook/addon-docs')],
  framework: {
    name: '@storybook-astro/framework',
    options: {
      renderMode: 'server',
      storyRules: './.storybook/story-rules.ts',
      server: {
        serverUrl: process.env.STORYBOOK_ASTRO_SERVER_URL ?? '/api/storybook-astro',
        authToken: process.env.STORYBOOK_ASTRO_SERVER_TOKEN,
        authHeader: process.env.STORYBOOK_ASTRO_SERVER_AUTH_HEADER
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

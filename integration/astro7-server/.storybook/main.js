import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { react, solid, preact, vue, svelte, alpinejs } from '@storybook-astro/framework/integrations';

const componentsRoot = getAbsolutePath('@storybook-astro/components');

/** @type { import('@storybook-astro/framework').StorybookConfig } */
const config = {
  stories: [
    '../src/stories/Overview.mdx',
    // Regression fixture for issue #136 — tsconfig `~/*` aliases in server mode.
    '../src/stories/aliased/AliasedOuter.stories.js',
    // App-local Astro-variant stories for components whose "astro" story only
    // lives here, not in @storybook-astro/components (Accordion, Card,
    // CodeTabs, Counter, Footer, Header, ImageText, PageCard, plus the
    // local-only DateStamp and SlotBox components). FontDemo and PublicImage
    // are intentionally not copied here — see src/components/ for why.
    '../src/components/**/*.stories.@(js|jsx|mjs|ts|tsx)',
    // Pulls in the alpine/preact/react/solid/svelte/vue framework variants for
    // Accordion and Counter, the Decorator suite, Nesting, and the three
    // server-work Astro components (NpmWeeklyDownloads, GithubContributors,
    // GithubStars) — mirrors astro7's own componentsRoot globs. The Decorator
    // suite matters here beyond coverage: Wrapper.astro is only ever referenced
    // from its story file, so it exercises the server-mode snapshot picking up
    // a decorator-only component (docs/specs/decorators.md#server-snapshot).
    `${componentsRoot}/src/*.mdx`,
    `${componentsRoot}/src/**/*.stories.@(js|jsx|mjs|ts|tsx)`
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

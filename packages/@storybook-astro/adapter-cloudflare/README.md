# @storybook-astro/adapter-cloudflare

Deploys Storybook Astro server mode to Cloudflare Workers: one Worker serves the
Storybook UI as static assets and renders Astro stories at `/api`.

```bash
npm install -D @storybook-astro/adapter-cloudflare @astrojs/cloudflare@<version> wrangler
```

Install the `@astrojs/cloudflare` that matches your Astro version: **12** for
Astro 5, **13** for Astro 6, **14** for Astro 7.

```js
// .storybook/main.js
import { cloudflare } from '@storybook-astro/adapter-cloudflare';

export default {
  framework: {
    name: '@storybook-astro/framework',
    options: {
      renderMode: 'server',
      server: { adapter: cloudflare({ name: 'my-storybook' }) },
    },
  },
};
```

```bash
storybook-astro build
wrangler dev -c storybook-server/server/wrangler.json     # preview locally
wrangler deploy -c storybook-server/server/wrangler.json  # deploy
```

The Worker runs the render app `astro build` compiled; it never starts Vite.
Without a Wrangler config of your own, the adapter writes a minimal one with the
`nodejs_compat` flag; pass `configPath` to use yours. Other options are passed to
`@astrojs/cloudflare`.

Story rules that mock modules need the mocked module as a string literal, with a
replacement path or a factory: `mock('./api.ts', () => ({ ... }))`. MSW's Node
interceptors don't run on Workers; mock `fetch` in a story rule instead.

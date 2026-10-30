# @storybook-astro/adapter-cloudflare

Deploys Storybook Astro server mode to Cloudflare Workers. One Worker serves the
static Storybook and renders Astro stories at `/api`.

```js
// .storybook/main.js
import { cloudflare } from '@storybook-astro/adapter-cloudflare';

export default {
  framework: {
    name: '@storybook-astro/framework',
    options: {
      renderMode: 'server',
      server: { adapter: cloudflare() },
    },
  },
};
```

```bash
storybook-astro build
wrangler deploy -c storybook-cloudflare/wrangler.jsonc
```

Use `wrangler dev -c storybook-cloudflare/wrangler.jsonc` to run it locally.

Workers cannot run Vite, so the build compiles every story component into the
Worker. Story rules must pass the mocked module to `mock()` as a string literal
and mock with a factory, e.g. `mock('./api.ts', () => ({ ... }))`.

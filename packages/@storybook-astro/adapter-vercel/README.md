# @storybook-astro/adapter-vercel

Deploys Storybook Astro server mode to Vercel: the Storybook UI as static files
and the `/api` render routes as a function.

```bash
npm install -D @storybook-astro/adapter-vercel @astrojs/vercel@<version>
```

Install the `@astrojs/vercel` that matches your Astro version: **9** for Astro 5,
**10** for Astro 6, **11** for Astro 7.

```js
// .storybook/main.js
import { vercel } from '@storybook-astro/adapter-vercel';

export default {
  framework: {
    name: '@storybook-astro/framework',
    options: {
      renderMode: 'server',
      server: { adapter: vercel() },
    },
  },
};
```

```bash
storybook-astro build
vercel deploy --prebuilt
```

The build writes Vercel's Build Output API to `.vercel/output/`. Options are
passed to `@astrojs/vercel`. See the
[Deployment guide](https://storybook-astro.org/guides/deployment/).

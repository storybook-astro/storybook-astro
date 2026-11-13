# @storybook-astro/adapter-netlify

Deploys Storybook Astro server mode to Netlify: the Storybook UI as static files
and the `/api` render routes as a function.

```bash
npm install -D @storybook-astro/adapter-netlify @astrojs/netlify@<version>
```

Install the `@astrojs/netlify` that matches your Astro version: **6** for Astro 5,
**7** for Astro 6, **8** for Astro 7.

```js
// .storybook/main.js
import { netlify } from '@storybook-astro/adapter-netlify';

export default {
  framework: {
    name: '@storybook-astro/framework',
    options: {
      renderMode: 'server',
      server: { adapter: netlify() },
    },
  },
};
```

```bash
storybook-astro build
netlify deploy --build --prod
```

The build writes the UI to `storybook-server/` (the publish directory) and the render function to `.netlify/v1/`. Options are
passed to `@astrojs/netlify`. See the
[Deployment guide](https://storybook-astro.org/guides/deployment/).

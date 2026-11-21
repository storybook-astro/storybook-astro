# @storybook-astro/adapter-node

Runs Storybook Astro server mode on a Node.js server or container: one process
serves the Storybook UI and renders Astro stories at `/api`.

```bash
npm install -D @storybook-astro/adapter-node @astrojs/node@<version>
```

Install the `@astrojs/node` that matches your Astro version: **9** for Astro 5,
**10** for Astro 6, **11** for Astro 7.

```js
// .storybook/main.js
import { node } from '@storybook-astro/adapter-node';

export default {
  framework: {
    name: '@storybook-astro/framework',
    options: {
      renderMode: 'server',
      server: { adapter: node() },
    },
  },
};
```

```bash
storybook-astro build
HOST=0.0.0.0 PORT=3000 node storybook-server/server/entry.mjs
```

Options are passed to `@astrojs/node` (`mode: 'standalone'` by default).
See the [Deployment guide](https://storybook-astro.org/guides/deployment/).

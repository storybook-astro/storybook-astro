---
title: Deployment
description: Deploy Storybook Astro to a static host, Vercel, or a Node.js server.
---

## Static mode

Run `storybook build` and deploy `storybook-static/` to any static host.
No additional configuration is needed. Astro stories use their default args;
Controls remain available for framework components such as React and Vue.

## Server mode

Use server mode when you need interactive Controls for Astro components in production.
Choose an adapter in `.storybook/main.js`:

```js
import { vercel } from '@storybook-astro/framework/adapters';

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

Set your build script to:

```json
{
  "scripts": {
    "build": "storybook-astro build"
  }
}
```

This command runs the Storybook build, then packages it with your adapter.
`storybook-static/` and `storybook-server/` are intermediate outputs.
The render endpoint is always `/api/render` on the same origin as the UI.

### On Vercel

The build produces `.vercel/output/`, compatible with Vercel Build Output API v3.
After linking your app to a Vercel project, run:

```bash
yarn build
vercel deploy --prebuilt
# Production:
vercel deploy --prebuilt --prod
```

Build on Linux with the same Node major and CPU architecture as the deployment.
For Git deployments, select the **Other** framework preset and use `yarn build`
as the build command. Leave Output Directory unset.

`vercel({ maxDuration: 60, memory: 1024 })` optionally configures function limits.

### On any Node.js server or container

Replace `vercel()` with `node()`:

```js
import { node } from '@storybook-astro/framework/adapters';

// framework.options
renderMode: 'server',
server: { adapter: node() }
```

Run `yarn build`, copy `storybook-node/` to your host, then start it:

```bash
PORT=3000 node storybook-node/server.mjs
```

It serves both the UI and render API. `PORT` defaults to `3000`, and `HOST` to
`0.0.0.0`. Use the same OS, CPU architecture, and compatible Node version for
building and hosting.

## Platform support

| Host | Mode |
| --- | --- |
| Any static host | Static |
| Vercel | Server with `vercel()` |
| Node.js server or container | Server with `node()` |
| Cloudflare Workers / Pages Functions | Static only |

Other server platforms need a custom adapter; see the `ServerAdapter` type exported
from `@storybook-astro/framework/adapters`.

## Latency expectations

The first render in a new server process can take several seconds. Later renders
reuse that process. The client allows up to 60 seconds for a render request.

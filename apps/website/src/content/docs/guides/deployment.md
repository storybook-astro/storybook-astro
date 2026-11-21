---
title: Deployment
description: Deploy Storybook Astro to a static host, a Node.js server, Vercel, Netlify, or Cloudflare.
---

## Static mode

Run `storybook build` and deploy `storybook-static/` to any static host.
No additional configuration is needed. Astro stories use their default args;
Controls remain available for framework components such as React and Vue.

## Server mode

Use server mode when you need interactive Controls for Astro components in production.

`storybook-astro build` builds Storybook, then a small Astro app that renders
your stories at `/api/render` and serves the Storybook UI from the same origin.
That app is built by `astro build` with Astro's official adapter for your host,
so it runs the way an Astro site runs there: compiled, without Vite at request time.

### 1. Install an adapter

Each host has an adapter package. It uses the official Astro adapter, which you
install in the version that matches your Astro version:

| Host | Install | Astro 5 | Astro 6 | Astro 7 |
| --- | --- | --- | --- | --- |
| Node.js server or container | `@storybook-astro/adapter-node` `@astrojs/node` | 9 | 10 | 11 |
| Vercel | `@storybook-astro/adapter-vercel` `@astrojs/vercel` | 9 | 10 | 11 |
| Netlify | `@storybook-astro/adapter-netlify` `@astrojs/netlify` | 6 | 7 | 8 |
| Cloudflare | `@storybook-astro/adapter-cloudflare` `@astrojs/cloudflare` | 12 | 13 | 14 |

That's the same `@astrojs/*` version you'd use to deploy an Astro site on that
Astro version. For example, on Astro 6 with Node:

```bash
npm install -D @storybook-astro/adapter-node @astrojs/node@10
```

### 2. Configure it

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

### 3. Build

Set your build script to:

```json
{
  "scripts": {
    "build": "storybook-astro build"
  }
}
```

The build prints how to run or deploy its output. `storybook-static/` and
`.astro/storybook-server/` (the generated app's sources) are intermediate outputs.

### On a Node.js server or container

`node()` builds a standalone server into `storybook-server/`. Start it from the
project directory, where its `node_modules` are:

```bash
HOST=0.0.0.0 PORT=3000 node storybook-server/server/entry.mjs
```

It serves both the UI and the render API. Options are passed to `@astrojs/node`,
for example `node({ mode: 'middleware' })` to mount it in your own server.

### On Vercel

`vercel()` writes Vercel's Build Output API to `.vercel/output/`. After linking
your app to a Vercel project, run:

```bash
yarn build
vercel deploy --prebuilt
# Production:
vercel deploy --prebuilt --prod
```

For Git deployments, select the **Other** framework preset and use `yarn build`
as the build command. Leave Output Directory unset. Options are passed to
`@astrojs/vercel`, for example `vercel({ maxDuration: 60 })`.

### On Netlify

`netlify()` writes the Storybook UI to `storybook-server/` and the render
function to `.netlify/v1/`. Set the site's publish directory to
`storybook-server` (in `netlify.toml` or the Netlify UI), then:

```bash
netlify deploy --build --prod
```

For Git deployments, use `storybook-astro build` as the build command. Options
are passed to `@astrojs/netlify`.

### On Cloudflare Workers

`cloudflare()` builds one Worker that serves the UI as static assets and renders
stories at `/api`:

```bash
yarn build
npx wrangler dev -c storybook-server/server/wrangler.json     # preview locally
npx wrangler deploy -c storybook-server/server/wrangler.json  # deploy
```

On Astro 5, `@astrojs/cloudflare` 12 writes the Pages layout instead: the UI and
`_worker.js` in `storybook-server/`. It runs as a Worker with static assets, with
this `wrangler.jsonc` next to your `package.json`:

```jsonc
{
  "name": "my-storybook",
  "main": "./storybook-server/_worker.js/index.js",
  "assets": { "binding": "ASSETS", "directory": "./storybook-server" },
  "compatibility_date": "2026-04-15",
  "compatibility_flags": ["nodejs_compat"]
}
```

Keep the Worker's code out of the public assets with a `.assetsignore` after the build:

```bash
storybook-astro build && printf '_worker.js\n_routes.json\n' > storybook-server/.assetsignore
npx wrangler deploy
```

Without a Wrangler config of your own, the adapter uses a minimal one named
after `cloudflare({ name: 'my-storybook' })` with the `nodejs_compat` flag.
Pass `configPath` to use yours (keep `nodejs_compat` in it). Images are served
as they are, and stories don't use sessions, so the Worker needs no bindings.

Story rules that mock modules work on Workers when the module is passed to
`mock()` as a string literal with a factory: `mock('./api.ts', () => ({ … }))`.
MSW's Node interceptors don't run on Workers; mock `fetch` in a story rule instead.

## Platform support

| Host | Mode |
| --- | --- |
| Any static host | Static |
| Node.js server or container | Server with `node()` |
| Vercel | Server with `vercel()` |
| Netlify | Server with `netlify()` |
| Cloudflare Workers | Server with `cloudflare()` |

Another host works if Astro has an adapter for it: a `ServerAdapter`
(exported from `@storybook-astro/framework/adapters`) is a name and a
`createAstroAdapter()` that returns that Astro adapter.

## Latency expectations

The render app is compiled at build time, so a cold start only loads it. Each
render is one in-process Astro page render.

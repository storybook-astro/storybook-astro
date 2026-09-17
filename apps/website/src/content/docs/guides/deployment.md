---
title: Deployment
description: How to host Storybook Astro's static and server render modes in production, including a full Vercel walkthrough.
---

`storybook build` behaves differently depending on [`renderMode`](/reference/configuration/#rendermode). Static mode produces plain static files; server mode produces a static UI plus a small Node render server that must be hosted alongside it. This guide covers both.

## Static mode (any static host)

With the default `renderMode: 'static'`, `storybook build` emits a single `storybook-static/` directory of plain HTML, CSS, and JS. There's no server involved at runtime, so it deploys to any static host exactly like any other Storybook build: Cloudflare Pages, Netlify, GitHub Pages, S3 + CloudFront, or a plain web server serving the directory.

```bash
storybook build
# deploy storybook-static/ to your static host of choice
```

The tradeoff is that Astro component stories are pre-rendered with their default args, so the Controls panel is disabled for them (framework component stories are unaffected). See [Static Builds](/how-it-works/static-builds/) for how that pre-rendering works, and [Server Builds](/how-it-works/server-builds/) if you need interactive Controls in production.

## Server mode

With `renderMode: 'server'`, `storybook build` emits `storybook-static/` (the Storybook UI, same as above) plus a sibling `storybook-server/` directory containing a standalone Node render server (`index.js`, a [Hono](https://hono.dev/) app) and a `project/` snapshot of every Astro story component your build reaches. The Storybook UI calls this server on demand to keep Controls interactive for Astro components. Because it needs a real filesystem and Node APIs, it requires a Node-capable host — see the [platform support matrix](#platform-support) below before choosing a target.

### Deployment adapters

The framework builds a host-independent Hono app and source snapshot in `storybook-server/`.
Deployment adapters package that server together with the completed `storybook-static/` UI.
Run the adapter **after** `storybook build`: Storybook also writes manager and public assets
outside the Vite preview build, so packaging inside a Vite hook can miss files.

Set `framework.options.server.serverUrl` to a non-root API path such as
`'/api/storybook-astro'` in `.storybook/main.js`, then create `providers/build.mjs`:

```js
import { adaptServerBuild, vercel } from '@storybook-astro/framework/adapters';

await adaptServerBuild(vercel());
```

Then configure your package script:

```json
{
  "scripts": {
    "build": "storybook build && node ./providers/build.mjs"
  }
}
```

`adaptServerBuild` accepts `projectDir`, `staticDir`, and `serverDir` for custom paths.
The API base path comes from `framework.options.server.serverUrl` (normally
`'/api/storybook-astro'`). The server build records it in `deployment.json`, together
with the runtime packages discovered from the component snapshot and renderers, plus the server bundle's external imports.

Both adapters use [NF3](https://github.com/unjs/nf3) to trace and package runtime
`node_modules`. NF3 uses NFT for analysis and owns copying, package deduplication,
multiple versions and relative links. The adapters copy the server snapshot and static
assets; they do not reconstruct the package tree themselves.

The build records dynamic runtime packages and the server bundle's external imports.
NF3 resolves these using the app and framework package roots, including dependencies
that pnpm does not hoist into the app. A discovery pass supplies NF3's located runtime
JS files as additional inputs because Vite also loads renderer files outside package
entrypoints. The final passes include Node and Vite browser/development/production
export branches. NF3's package database handles known native and dynamic packages.

For computed imports that cannot be discovered, add the package to
`framework.options.server.runtimeDependencies`. `nf3.json` records package versions and
trace warnings. MSW is included through the application's imports, without any
MSW-specific packaging rule.

`node scripts/test-server-adapter-pnpm.mjs` creates a real isolated pnpm installation
using local fixture packages, then removes that installation before running the copied
output. It verifies multiple dependency versions, filesystem assets and a framework-owned
dependency that is not directly visible to the app. It does not require migrating this
Yarn monorepo to pnpm.

### On Vercel

The `vercel()` adapter writes **Build Output API v3** directly:

```text
.vercel/output/
  config.json
  static/
  functions/render.func/
    .vc-config.json
    handler.mjs
    storybook-server/
    node_modules/
```

There is no `api/` source wrapper, trace-hints generator, `includeFiles`, or `filePathMap`.
The adapter owns routing and the Node HTTP handler. The function contains its runtime files,
so uploading does not depend on paths back into the source repository.

Build on Linux with the same Node major and CPU architecture used by the function;
installed native dependencies are copied, not cross-compiled. The adapter records the current
Node major and x64/arm64 architecture. Build in Linux CI or a container from macOS/Windows.

From your app directory, after linking it to the intended Vercel project:

```bash
yarn build
vercel deploy --prebuilt
# Or, for production:
vercel deploy --prebuilt --prod
```

Do **not** run `vercel build`: `yarn build` has already produced the deployment output.
`vercel()` accepts optional `maxDuration` (default 60 seconds) and `memory` settings.
The Vercel function size limit still applies to packaged runtime dependencies.

For Git-triggered builds, use `"framework": null` in `vercel.json` and a build command
that runs the script above. In this monorepo, build the framework packages first:
`cd ../.. && yarn build:packages && cd - && yarn build`. Set Root Directory to the
integration app and enable access to source files outside it. No Output Directory override
is needed because the adapter emits `.vercel/output`.

The `integration/astro5-server`, `astro6-server`, and `astro7-server` apps use this adapter.
`node scripts/test-server-adapter.mjs integration/astro6-server` verifies the generated
function after copying it outside the repository, including factory mocks and user-owned MSW hooks.

#### Auth (optional)

Server mode supports an optional bearer token, enforced with a timing-safe comparison on the server:

```javascript
// .storybook/main.js
export default {
  framework: {
    name: '@storybook-astro/framework',
    options: {
      renderMode: 'server',
      server: {
        serverUrl: process.env.STORYBOOK_ASTRO_SERVER_URL ?? '/api/storybook-astro',
        authToken: process.env.STORYBOOK_ASTRO_SERVER_TOKEN,
        authHeader: process.env.STORYBOOK_ASTRO_SERVER_AUTH_HEADER, // defaults to 'authorization'
      },
    },
  },
};
```

Set `STORYBOOK_ASTRO_SERVER_TOKEN` (and optionally `STORYBOOK_ASTRO_SERVER_AUTH_HEADER`) in your hosting environment before running `storybook build` — the token is baked into the server bundle at build time, so it must be present during the build, not just at runtime.

### On any Node.js server or container

Use the `node()` adapter for a portable directory containing the server, static UI and
runtime dependencies:

```js
import { adaptServerBuild, node } from '@storybook-astro/framework/adapters';

await adaptServerBuild(node());
```

After building, copy `storybook-node/` to a compatible Node host and run:

```bash
PORT=3000 node storybook-node/server.mjs
```

The listener serves the static UI and mounts the render app at the configured API base path.
`HOST` defaults to `0.0.0.0`; `PORT` defaults to `3000`. The output must run on the same OS,
CPU architecture and compatible Node version as its installed native dependencies.

For local development, the integration apps also keep `yarn serve` to preview the original
`storybook-static/` and `storybook-server/` outputs without packaging them.

### Custom adapters

Implement the exported `ServerAdapter` interface: a `name` and an async `adapt(build)` method.
The build supplies absolute `projectDir`, `staticDir`, `serverDir` paths and the API `basePath`.
The adapter owns output layout, dependency packaging and host entrypoints; the Hono render app
remains independent of the provider. The exported `packageServer(build, directory, extraPackages)`
helper can copy the runtime and its dependencies for other Node-based hosts. See the built-in
Node and Vercel adapters for examples.

### Netlify Functions

Expected to work via [`hono/netlify`](https://hono.dev/docs/getting-started/netlify) in a custom deployment adapter. This is **untested** — there's no maintained example in this repo yet. If you try it, please report back.

### Cloudflare Workers / Pages Functions

**Not supported by this server runtime.** It starts Vite and native compilation tools
at request time, and ships a source snapshot rather than fully compiled SSR modules.
Workers' [Node compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/)
includes a [virtual filesystem](https://developers.cloudflare.com/workers/runtime-apis/nodejs/fs/),
but does not make this Node-based compilation pipeline portable to Workers.

Astro SSR itself supports Workers through its official Cloudflare adapter. Supporting our
render endpoint there requires compiling the components and renderers during the build;
a thin HTTP wrapper around the current server is insufficient. The deployment adapters
introduced here only package the existing runtime and do not make that architectural change.

[Cloudflare Containers](https://developers.cloudflare.com/containers/) can run Node processes,
so the Node adapter is a possible route there; it has no maintained example in this repo.

### Pure static hosts and other edge runtimes

By design, unsupported — use `renderMode: 'static'` instead. Static mode has no server-side runtime requirements at all.

## Platform support

| Platform | Server mode support |
|---|---|
| Vercel (Node serverless functions) | ✅ Works — maintained example (`integration/astro6-server`, `integration/astro7-server`) |
| Node.js server/container (Docker, Fly.io, Railway, Render, a VPS) | ✅ Works — mount with `@hono/node-server` |
| Netlify Functions | ⚠️ Expected to work via `hono/netlify`, untested |
| Cloudflare Workers / Pages Functions | ❌ Current runtime requires Vite and native compilation tools |
| Cloudflare Containers | ⚠️ Should work (Node-in-container), no maintained example |
| Pure static hosts / edge runtimes | ❌ Not applicable — use `renderMode: 'static'` |

## Latency expectations

Each process running the render server boots a Vite SSR dev server and an Astro Container the first time it handles a request:

- **Cold start**: roughly 10–15 seconds on Vercel, since a fresh serverless function instance has to boot the SSR server before it can render anything.
- **Warm renders**: roughly 0.3–0.5 seconds once the process is warm and the SSR server is already running.

The Storybook client's render request for server mode uses a 60-second timeout specifically to tolerate cold starts — a render that would otherwise fail while a fresh instance boots gets the time it needs instead of erroring out.

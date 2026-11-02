# Server-mode host apps

`integration/astro{5,6,7}-server-{vercel,cloudflare,netlify}` build the same
Storybook in server mode for each Astro major and host. This workspace holds
what they share: the story rules (`story-rules.ts`, which mocks `fetch` for a
render since MSW's Node interceptors don't run on Cloudflare), the Playwright
suite (`server-mode-tests.ts`) and the local preview for Vercel and Netlify
builds (`serve-build.mjs`, a small Hono server: neither `@astrojs/vercel` nor
`@astrojs/netlify` supports `astro preview`).

| App | Storybook dev | Local preview | Host output |
| --- | --- | --- | --- |
| astro5-server-vercel | 6150 | 6151 | `.vercel/output` |
| astro5-server-cloudflare | 6152 | 6153 | Worker: `wrangler.jsonc` (Pages layout as assets) |
| astro5-server-netlify | 6154 | 6155 | `storybook-server/` + `.netlify/v1` |
| astro6-server-vercel | 6160 | 6161 | `.vercel/output` |
| astro6-server-cloudflare | 6162 | 6163 | Worker: `storybook-server/server/wrangler.json` |
| astro6-server-netlify | 6164 | 6165 | `storybook-server/` + `.netlify/v1` |
| astro7-server-vercel | 6170 | 6171 | `.vercel/output` |
| astro7-server-cloudflare | 6172 | 6173 | Worker: `storybook-server/server/wrangler.json` |
| astro7-server-netlify | 6174 | 6175 | `storybook-server/` + `.netlify/v1` |

## Run one locally

```bash
# From the repository root, once (and after changing a package):
yarn build:packages

# From the app's directory, e.g. integration/astro6-server-netlify:
yarn build          # Storybook + the render app for the host
yarn serve          # local preview on the port above
yarn test:browser   # build, preview and run the Playwright suite
```

`yarn serve` runs the host's own runtime where there is one locally: `wrangler
dev` for Cloudflare. For Vercel and
Netlify, `serve-build.mjs` serves the static output and calls the built render
function the way the platform does; it doesn't emulate the rest of the
platform.

## Deploy from CI

`.github/workflows/deploy-server-apps.yml` deploys all nine apps: production on
a push to `main`, and a preview for every push to a PR (or on a manual run from
another branch), next to production: a Vercel preview deployment,
`pr-<n>-<worker>.storybook-astro.workers.dev` and `pr-<n>--<site>.netlify.app`.
Then one comment on the PR lists them with Chromatic's static builds
(`scripts/comment-deployments.mjs`).

It needs `VERCEL_TOKEN` and `VERCEL_ORG_ID`, `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID`, and `NETLIFY_AUTH_TOKEN`; a platform without its
secrets is skipped. Vercel projects and Netlify sites are found by name
(`storybook-<app>`). The Vercel projects aren't connected to Git, since CI
deploys them.

## Deploy one by hand

`yarn deploy` in an app deploys its last build. Each host's CLI reads its
credentials from the environment:

| Host | Environment | Notes |
| --- | --- | --- |
| Vercel | `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | One Vercel project per app; the CLI needs both ids together |
| Cloudflare | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | The Worker is created on first deploy |
| Netlify | `NETLIFY_AUTH_TOKEN`, `NETLIFY_SITE_ID` | One Netlify site per app; `netlify deploy --build` runs `netlify.toml`'s build |

The CLIs aren't dependencies of the apps: run them with `npx`, or install
`vercel` and `netlify-cli` globally. `wrangler` is an app dependency.

Set `STORYBOOK_ASTRO_SERVER_TOKEN` at build time to require a token on the
render API.

Run the suite against a deployment with
`STORYBOOK_URL=https://… yarn test:browser` in the app's directory.

## Deployments

| | Vercel | Cloudflare Workers | Netlify |
| --- | --- | --- | --- |
| Astro 5 | [storybook-astro5-server-vercel.vercel.app](https://storybook-astro5-server-vercel.vercel.app) | [storybook-astro5-server-cloudflare.storybook-astro.workers.dev](https://storybook-astro5-server-cloudflare.storybook-astro.workers.dev) | [storybook-astro5-server-netlify.netlify.app](https://storybook-astro5-server-netlify.netlify.app) |
| Astro 6 | [storybook-astro6-server-vercel.vercel.app](https://storybook-astro6-server-vercel.vercel.app) | [storybook-astro6-server-cloudflare.storybook-astro.workers.dev](https://storybook-astro6-server-cloudflare.storybook-astro.workers.dev) | [storybook-astro6-server-netlify.netlify.app](https://storybook-astro6-server-netlify.netlify.app) |
| Astro 7 | [storybook-astro7-server-vercel.vercel.app](https://storybook-astro7-server-vercel.vercel.app) | [storybook-astro7-server-cloudflare.storybook-astro.workers.dev](https://storybook-astro7-server-cloudflare.storybook-astro.workers.dev) | [storybook-astro7-server-netlify.netlify.app](https://storybook-astro7-server-netlify.netlify.app) |

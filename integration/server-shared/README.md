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
| astro5-server-cloudflare | 6152 | 6153 | Pages: `storybook-server/` |
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
dev` (Workers) or `wrangler pages dev` (Pages) for Cloudflare. For Vercel and
Netlify, `serve-build.mjs` serves the static output and calls the built render
function the way the platform does; it doesn't emulate the rest of the
platform.

## Deploy one

`yarn deploy` in an app deploys its last build. Each host's CLI reads its
credentials from the environment:

| Host | Environment | Notes |
| --- | --- | --- |
| Vercel | `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | One Vercel project per app; `vercel deploy --prebuilt` |
| Cloudflare | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | The Worker or Pages project is created on first deploy |
| Netlify | `NETLIFY_AUTH_TOKEN`, `NETLIFY_SITE_ID` | One Netlify site per app; `netlify deploy --build` |

The CLIs aren't dependencies of the apps: run them with `npx`, or install
`vercel` and `netlify-cli` globally. `wrangler` is an app dependency.

Set `STORYBOOK_ASTRO_SERVER_TOKEN` at build time to require a token on the
render API.

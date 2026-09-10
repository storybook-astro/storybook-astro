# Astro 7 Server Build on Vercel

This integration app exercises the production `server` render mode with Astro 7, deployed to a live Vercel project so the full path — build, trace hints, function deploy, cold start, render — is validated end-to-end, not just locally.

Unlike the minimal astro5/astro6-server apps, this is a full framework-integration story collection: the three server-work Astro components (npm weekly downloads, GitHub contributors, GitHub stars), the local `src/components/**` and `@storybook-astro/components` story sets, the `Decorator` suite, `Nesting`, and every React/Vue/Svelte/Preact/Solid/Alpine.js framework variant of `Accordion` and `Counter`. It also carries the regression fixture for issue #136 (tsconfig `~/*` path aliases resolved in server mode). `FontDemo` and `PublicImage` are intentionally excluded — fonts aren't yet plumbed through the server-build pipeline, and public-asset semantics under server mode are unverified.

The Storybook static app calls the generated Astro render server through `/api/storybook-astro/render`, which is wrapped by `api/storybook-astro/[...path].js` for Vercel.

## Vercel configuration

`vercel.json` sets `"framework": null`. This is required, not optional: without it, Vercel's Astro framework auto-detection takes over the build and ignores the `api/` directory entirely, so the render function never deploys and requests to it 404.

`functions["api/storybook-astro/[...path].js"].includeFiles` is set to `"storybook-server/**"` so the built render server and its component snapshot ship inside the function bundle. `yarn build` also runs `../../scripts/generate-vercel-trace-hints.mjs`, which generates `api/storybook-astro/_vercel-trace-hints.js` — Vercel's file tracer only bundles files reachable from static imports and ignores `includeFiles` paths under `node_modules`, but the render server resolves packages like `astro` and the framework integrations dynamically through Vite at request time. The generated file is a never-executed module of literal `import()` calls that forces the tracer to ship those packages (and, for this app, every framework integration it exercises) completely.

See the [Deployment guide](../../apps/website/src/content/docs/guides/deployment.md) for the full walkthrough this app follows.

## Vercel dashboard prerequisites

If you fork or redeploy this app from the Vercel dashboard:

- **Root Directory**: `integration/astro7-server`
- **Include source files outside of the Root Directory in the Build**: enabled — `buildCommand` runs `cd ../.. && yarn build:packages` before building this app, so Vercel needs permission to read outside the Root Directory
- **Environment Variables**: `STORYBOOK_ASTRO_SERVER_TOKEN` / `STORYBOOK_ASTRO_SERVER_AUTH_HEADER`, if you want auth enabled — set as build-time variables, since the token is compiled into the server bundle during `storybook build`, not read at request time

## Scripts

Build and preview the production artifacts locally with:

```bash
yarn dev
yarn build
yarn serve
```

`serve` is package-owned deployment glue for this Vercel variant. It serves `storybook-static` and mounts the generated Hono app from `storybook-server/index.js` at `/api/storybook-astro`, so local tests hit the same built server-mode boundary as deployment.

## Testing

```bash
yarn test:browser
```

Runs the Playwright suite in `tests/`. `playwright.config.ts`'s `webServer` builds the app and boots `preview-storybook.mjs` itself, so this single command exercises the same built server-mode boundary as deployment: static UI + render server, in one process, including the multi-framework component variants listed above. A CI server-mode job runs this against all three `*-server` integration apps.

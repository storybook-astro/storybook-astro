# Astro 5 Server Build

This integration app exercises the production `server` render mode with Astro 5. Unlike `astro6-server` and `astro7-server`, it isn't deployed to a live Vercel project — it's CI-only, validating that the same Vercel-shaped build (`vercel.json`, the `api/` wrapper, and the generated trace-hints file) produces a working render server for Astro 5 too, exercised locally via the commands below.

It intentionally includes only Astro stories that perform server-side work:

- npm weekly downloads
- GitHub contributors
- GitHub stars
- a component-level decorator (`Decorator.stories.jsx`), exercising the server-mode snapshot for a component that's only ever referenced from a decorator, not a story

The Storybook static app calls the generated Astro render server through `/api/storybook-astro/render`, which is wrapped by `api/storybook-astro/[...path].js` for Vercel-shaped deployment.

## Vercel-shaped build

`vercel.json` sets `"framework": null` — required so a real Vercel deploy wouldn't have its Astro framework auto-detection ignore the `api/` directory (this app just doesn't run that deploy in CI). `functions["api/storybook-astro/[...path].js"].includeFiles` is set to `"storybook-server/**"` so the render server and its component snapshot would ship inside the function bundle. `yarn build` also runs `../../scripts/generate-vercel-trace-hints.mjs`, which generates `api/storybook-astro/_vercel-trace-hints.js` to force-include the packages the render server resolves dynamically through Vite at request time.

See the [Deployment guide](../../apps/website/src/content/docs/guides/deployment.md) for the full walkthrough this build shape follows (the guide's Vercel steps apply if you ever want to actually deploy this app).

## Scripts

Build and preview the production artifacts locally with:

```bash
yarn dev
yarn build
yarn serve
```

`serve` is package-owned deployment glue for this Vercel-shaped variant. It serves `storybook-static` and mounts the generated Hono app from `storybook-server/index.js` at `/api/storybook-astro`, so local tests hit the same built server-mode boundary a real deployment would.

## Testing

```bash
yarn test:browser
```

Runs the Playwright suite in `tests/`. `playwright.config.ts`'s `webServer` builds the app and boots `preview-storybook.mjs` itself, so this single command exercises the same built server-mode boundary a real deployment would. A CI server-mode job runs this against all three `*-server` integration apps.

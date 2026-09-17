# Astro 7 Server Build

This app exercises host-independent server rendering. `storybook build` produces
`storybook-static/` and `storybook-server/`; `providers/build.mjs` selects a deployment
adapter after Storybook finishes writing all assets.

```bash
# From the repository root, once after framework changes:
yarn build:packages

# From this app directory:
yarn build                         # Vercel Build Output API v3
vercel deploy --prebuilt            # app must be linked to your Vercel project
yarn build:node                    # portable storybook-node/ directory
PORT=3000 node storybook-node/server.mjs
yarn serve                         # local preview of the original build
```

NF3 traces and packages runtime dependencies for both adapters. The Vercel adapter writes `.vercel/output/static`, a self-contained Node function,
and routing configuration. It does not use `vercel build`, trace hints or a source
`api/` wrapper. Build on Linux with the target Node version and CPU architecture.
The Node adapter uses the same runtime packaging, without Vercel configuration.

For Git-triggered Vercel builds, set Root Directory to `integration/astro7-server`,
allow source files outside it, and build the framework packages before this app.
Keep Framework Preset set to Other (`"framework": null`).

Server auth variables, if used, must be present during the Storybook build.
MSW belongs to this app's story rules, not the framework or deployment adapters.

See the [Deployment guide](../../apps/website/src/content/docs/guides/deployment.md).

## Verification

```bash
yarn test:browser
# From the repository root, after this app's build:
node scripts/test-server-adapter.mjs integration/astro7-server
```

The browser suite exercises rendering, controls and decorators. The adapter test
copies the generated function outside the repository and verifies rendering with
factory mocks and user-provided MSW hooks, so workspace dependencies cannot hide
missing files in the deployment.

# Astro 6 Server Build

The adapter in `.storybook/main.js` packages the build for Vercel or Node.

```bash
# From the repository root:
yarn build:packages

# From this app directory:
yarn build
vercel deploy --prebuilt
yarn build:node
PORT=3000 node storybook-node/server.mjs
```

For Vercel Git builds, use Root Directory `integration/astro6-server`, allow
source files outside it, and build the framework packages before this app.
Select the Other framework preset. Build on Linux with the deployment's Node
version and CPU architecture.

Run `yarn test:browser` for rendering and Controls tests. From the repository
root, `node scripts/test-server-adapter.mjs integration/astro6-server` tests
the packaged Vercel function outside the workspace.

See the [Deployment guide](../../apps/website/src/content/docs/guides/deployment.md).

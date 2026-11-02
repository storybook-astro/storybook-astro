# Astro 7 Server Build

The adapter in `.storybook/main.js` builds the render app with
`@storybook-astro/adapter-node` by default, or `@storybook-astro/adapter-vercel`
with `build:vercel`.

```bash
# From the repository root:
yarn build:packages

# From this app directory:
yarn build              # Node: storybook-server/
yarn serve              # starts it
yarn build:vercel       # Vercel: .vercel/output/
vercel deploy --prebuilt
```

For Vercel Git builds, use Root Directory `integration/astro7-server`, allow
source files outside it, and select the Other framework preset; `vercel.json`
builds the framework packages before this app.

Run `yarn test:browser` for rendering and Controls tests against the Node
server. From the repository root, after `yarn build:vercel`,
`node scripts/test-server-adapter.mjs integration/astro7-server` runs the
Vercel function from a copy outside the workspace.

See the [Deployment guide](../../apps/website/src/content/docs/guides/deployment.md).

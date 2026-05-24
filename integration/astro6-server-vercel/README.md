# Astro 6 Server Build on Vercel

This integration app exercises the production `server` render mode with Astro 6.

It intentionally includes only Astro stories that perform server-side work:

- npm weekly downloads
- GitHub contributors
- GitHub stars

The Storybook static app calls the generated Astro render server through `/api/storybook-astro/render`, which is wrapped by `api/storybook-astro/[...path].js` for Vercel.

Build and preview the production artifacts locally with:

```bash
yarn dev
yarn build
yarn serve
```

`serve` is package-owned deployment glue for this Vercel variant. It serves `storybook-static` and mounts the generated Hono app from `storybook-server/index.js` at `/api/storybook-astro`, so local tests hit the same built server-mode boundary as deployment.

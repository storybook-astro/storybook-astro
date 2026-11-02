---
title: Server Builds
description: Render Astro stories on demand with interactive Controls in production.
---

Server mode renders Astro stories on demand, so Controls work in production.
Choose a server adapter and run `storybook-astro build` as described in
[Deployment](/guides/deployment/).

## Build output

After the Storybook build, `storybook-astro build` generates a small Astro app in
`.astro/storybook-server/` and builds it with `astro build` and your adapter's
official Astro adapter. The app has:

- **A render page per story file**, which imports the Astro components that file
  uses (and the ones `.storybook/preview` uses for global decorators). Astro
  attaches only those components' styles and island scripts to a render.
- **The `/api` routes**: the render API the preview calls.
- **The Storybook UI** as its public directory, so one deployment serves both.

Your integrations, Vite plugins and aliases from `astro.config.*` apply, and story
rules are compiled in. The output is whatever the Astro adapter produces for its
host: a Node server, Vercel's Build Output API, or a Cloudflare Worker.

## Request flow

1. The preview sends args, slots, and decorators to `POST /api/render`.
2. The render API checks the auth token, applies the story's rules, and renders
   the story's render page in the same process (`Astro.rewrite`).
3. Astro renders the story, its slots and decorators as one page, with the
   built URLs of its styles and islands, and the preview displays that HTML.

Nothing compiles at request time: the host runs the code `astro build` produced.

## Hosting requirements

Any host Astro has an adapter for. Adapter packages exist for Node.js, Vercel and
Cloudflare Workers.

Choose [static mode](/how-it-works/static-builds/) if you don't need interactive
Astro Controls. Controls for React, Vue, and other framework components work in
both modes.

---
title: Server Builds
description: Render Astro stories on demand with interactive Controls in production.
---

Server mode renders Astro stories on demand, so Controls work in production.
Choose a server adapter and run `storybook-astro build` as described in
[Deployment](/guides/deployment/).

## Build output

The build creates the Storybook UI in `storybook-static/` and a render server in
`storybook-server/`. The server includes the component sources, their imports,
and compiled story rules. The adapter packages both directories and their runtime
dependencies for the target host.

## Request flow

1. The preview sends args, slots, and decorators to `POST /api/render`.
2. The server validates the request and renders the story with Astro's Container API.
3. The preview receives HTML with links to the built assets and displays it.

Each server process starts its rendering runtime once and reuses it for later
requests. The first render is slower; the client waits up to 60 seconds.

## Hosting requirements

The runtime needs Node.js, a filesystem, and native compilation tools.
Use Vercel's Node functions or a Node server/container. Cloudflare Workers and
Pages Functions are not supported by this runtime.

Choose [static mode](/how-it-works/static-builds/) if you don't need interactive
Astro Controls. Controls for React, Vue, and other framework components work in
both modes.

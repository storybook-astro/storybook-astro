---
title: Server Builds
description: How Storybook Astro renders Astro components on demand in production, keeping Controls interactive.
---

[Static builds](/how-it-works/static-builds/) pre-render Astro components at build time, which disables the Controls panel for them. Server builds (`storybook build` with `renderMode: 'server'`) trade that for an on-demand render server, so Controls stay fully functional for Astro components in production too.

## What gets emitted

`storybook build` with `renderMode: 'server'` emits two sibling directories instead of one:

- **`storybook-static/`** — the Storybook UI itself: the same static HTML/CSS/JS a static build produces, unchanged.
- **`storybook-server/`** — a standalone render server:
  - **`index.js`** — a [Hono](https://hono.dev/) app (`export default app`) with two routes: `GET /` (a health check returning `"OK"`) and `POST /render` (renders one story to HTML).
  - **`project/`** — a source snapshot of every Astro story component reached by the build, plus its transitive imports (including imports resolved through tsconfig path aliases) and any config files the render runtime needs at boot.

This server isn't runnable as-is — it needs a host that can execute it as a Node process. See [Deployment](/guides/deployment/) for how to wire it up on Vercel or any Node server, and the [platform support matrix](/guides/deployment/#platform-support) for where it can and can't run.

## Request flow

1. The Storybook client sends one `POST /render` request per story render, carrying the component id, args, slots, and (if the story has decorators) the decorator tree.
2. The Hono app authenticates the request (if an auth token is configured — see below), validates the payload, and hands it to the shared render runtime.
3. On first request, that runtime boots a Vite SSR dev server plus an Astro Container **per process** — this is the expensive part, and only happens once per warm process (see [Deployment: latency expectations](/guides/deployment/#latency-expectations) for cold-start and warm-render timings).
4. The Container renders the story (and any decorator tree around it, resolved depth-first — the same `reconstructSlots`/`renderDecoratedRoot` path the dev-mode and static-build renderers use) to an HTML string, resolving Astro component imports from the `project/` snapshot rather than the original build machine's filesystem.
5. The server rewrites that HTML: `/@fs`-style dev-server asset and module URLs are swapped for the actual built asset URLs from `storybook-static/`, and matching stylesheet `<link>` tags are added, so the browser only ever sees the URLs it can actually fetch.
6. The styled, rewritten HTML string is the response body. The Storybook client injects it into the canvas exactly like a dev-mode render.

## Story-rules and mocks are compiled in, not copied

If you use [`storyRules`](/reference/configuration/#storyrules) for per-story MSW mocks or module replacements, that config module is **compiled directly into the server bundle** at build time via a dedicated Vite plugin, rather than shipped as a loose file in the `project/` snapshot and loaded at runtime. Deployed hosts commonly transpile or strip `.ts` sources from what they ship (Vercel does both), so loading the snapshot's copy at request time isn't reliable — baking it into the bundle sidesteps that entirely.

## Snapshot paths and alias resolution

The `project/` snapshot is built from whatever `resolveFrom` (or `process.cwd()`) resolved to on the build machine, but those absolute paths mean nothing on the deploy host — Vercel runs functions from `/var/task`, for instance. To make the snapshot portable, the build step records two maps alongside it:

- A **component path map**, rewriting each Astro component module id to its location inside `project/`, so the render runtime loads component modules from the snapshot instead of the original build-time path.
- A **snapshot module alias map**, resolved against *this host's* filesystem at boot (not baked in as absolute build-machine paths), so hydrated framework component assets and other build outputs still resolve correctly no matter which host the server ends up running on.

tsconfig path aliases (e.g. `~/components/Button.astro`) are resolved to their real files before the snapshot is written, so the copied component tree only contains concrete relative imports — the deployed server doesn't need to re-resolve aliases at runtime.

## Why this needs Node, not an edge runtime

The render server isn't a plain request handler — it's a live Vite SSR dev server plus an Astro Container that has to boot inside the process and then read component source files from a real filesystem (`project/`) for the life of that process. Edge runtimes like Cloudflare Workers have no Node `fs` module and can't spawn the kind of long-lived, filesystem-backed dev server this requires. That's a structural limitation, not a missing adapter — see [Deployment](/guides/deployment/#cloudflare-workers--pages-functions) for the details.

## Choosing server vs. static

- **Static** (default) — no server to host, deploys anywhere, but Astro component stories are frozen at their default args; the Controls panel is disabled for them.
- **Server** — Controls stay fully interactive for Astro components in production, at the cost of needing a Node-capable host and tolerating a cold-start delay (roughly 10–15 seconds on Vercel) on the first render after a process boots.

If your Storybook is mostly framework components (React, Vue, etc.) with only a handful of Astro stories, static is usually the simpler choice — framework component Controls are unaffected by `renderMode` either way. If interactive Controls on Astro stories matter to your reviewers, server mode is worth the extra hosting step.

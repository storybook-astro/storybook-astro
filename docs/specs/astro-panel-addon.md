# Astro Panel Addon

## Context

The roadmap lists an **Astro Panel Addon** — a dedicated "Astro" tab in the Storybook UI that surfaces Astro-specific metadata for each story as it renders. Today the only way to inspect what the Astro Container produced (the raw HTML) or how long a render took is to add `console.log` to `middleware.ts` and watch the terminal. This panel makes that information visible in the browser, alongside Controls/Actions, for every Astro component story.

**Decisions:**
- **Packaging:** auto-bundled into `@storybook-astro/framework` — zero config, the panel just appears. Wired via a `managerEntries` export in the framework preset.
- **Coverage:** all three render modes — **dev**, **server builds**, and **static builds**.
- **Metadata (core set):** raw server HTML, render time, client round-trip time (dev/server only), render source/mode, and active framework integration names.

## Key architectural insight

`render.tsx` (renderer package) is **mode-agnostic** — for every mode it calls `astroRenderer.render()` and gets back a response, then injects `response.html`. The virtual module `virtual:storybook-astro-renderer` resolves to one of three implementations (`renderer-dev` / `renderer-static` / `renderer-server`), each returning `{ id, html }` today.

So the design is:
1. **Each renderer populates a new `meta` field** on its response (`{ id, html, meta }`), sourced per-mode.
2. **`render.tsx` emits that `meta` onto the Storybook channel once**, uniformly for all modes. (`render.tsx:1` already imports from `storybook/internal/preview-api`, so `addons.getChannel().emit(...)` is an additive import.)
3. **A new manager panel** subscribes to that channel event and renders it.

All render duration is captured around the single shared `container.renderToString(...)` in `astroRenderHandler.ts` (dev + server runtime) or at build time (static prerender). Integration names come from `options.integrations.map(i => i.name)`, available in every plugin context.

## Shared types — `packages/@storybook-astro/renderer/src/types.ts`

Widen the response data (currently `{ id, html }` at lines 37–43) and add a shared metadata type + channel event constant. The framework manager imports these via `@storybook-astro/renderer/types` (framework depends on renderer `workspace:*`).

```ts
export const ASTRO_RENDER_META_EVENT = 'astro/render:meta';

export type AstroRenderMeta = {
  storyId?: string;
  source: 'dev' | 'static' | 'server';
  html: string;
  renderMs: number;        // dev/server: live render; static: build-time render
  roundTripMs?: number;    // dev/server only (omitted for static manifest lookup)
  integrations: string[];  // active framework integration names
};

export type RenderResponseMessage = {
  type: 'astro:render:response';
  data: {
    id: string;
    html: string;
    meta?: AstroRenderMeta;   // optional → additive, existing consumers unaffected
  };
};
```

`source` drives the panel's labels (build-time vs live render, whether round-trip is shown), and is set by each renderer to its own identity.

## Shared render handler — `packages/@storybook-astro/framework/src/astroRenderHandler.ts`

Wrap the `container.renderToString(...)` call (lines 99–105) with `performance.now()` deltas and return `{ html, renderMs }` instead of a bare string. This single change feeds render duration to **dev, server, and static** (all three call this handler). Update `HandlerProps`/return typing accordingly.

## Mode 1 — Dev (`renderer-dev` + middleware)

- **`viteStorybookAstroMiddlewarePlugin.ts`**: integration names are already computed in `createViteServer` (~lines 178–184, `frameworkNames`). Capture them into a variable visible to the `configureServer` closure. In the `astro:render:request` handler (lines 67–99), build `meta = { source: 'dev', renderMs, integrations }` and include it in `ws.send('astro:render:response', { html, id, meta })` (lines 79–82). The error branch (89–97) may omit `meta`.
- **`renderer/renderer-dev.ts`**: no logic change — it already resolves the pending promise with the full `data` object; the widened type carries `meta` through automatically.

## Mode 2 — Server build (`renderer-server` + hono server)

- **`src/server/index.ts`**: the `/render` POST handler (lines 38–60) currently returns `context.text(html)`. Change it to `context.json({ html, meta })`, where `meta = { source: 'server', renderMs, integrations }`. `renderMs` comes from the handler (now returns `{ html, renderMs }`); `integrations` from the `integrations` already imported from `virtual:storybook-astro/server-runtime` (lines 19–22), mapped to `.name`.
- **`renderer/renderer-server.ts`**: change `renderWithHttp` from `await response.text()` (line 83) to `await response.json()`, and return `{ id, html: body.html, meta: body.meta }` (lines 85–88).
- **Contract note:** this changes the `/render` response from text to JSON — a coordinated breaking change to the server endpoint. The client changes in lockstep; update any server-mode test asserting a text body.

## Mode 3 — Static build (`renderer-static` + prerender plugin)

The static manifest value is currently a bare HTML string (`Record<string, string>`). Widen it to carry per-story metadata captured at build time.

- **`vitePluginAstroBuildPrerender.ts`**: in `prerenderAstroStories` (capture point ~line 184/207), time each `renderProductionStoryToHtml(...)` call and compute integration names from `options.integrations` (line 47). Change the manifest payload type from `Record<string, string>` to `Record<string, { html: string; renderMs: number; integrations: string[] }>` (lines 151, 181, 207). The JSON file is regenerated every build, so no migration concern.
- **`renderer/renderer-static.ts`**: update the `as Record<string, string>` cast (line 55) and the lookup (line 21) to the new value shape, and return `{ id, html, meta: { source: 'static', renderMs, integrations, ...no roundTripMs } }`.
- Render time here is **build-time**, labeled as such in the panel via `source: 'static'`. No round-trip (manifest lookup is local/cached).

## Preview emission — `packages/@storybook-astro/renderer/src/render.tsx`

In `renderAstroToCanvas` (lines 181–208): measure client round-trip around the `await astroRenderer.render(...)` call (lines 192–203), then after it resolves emit the metadata on the Storybook channel — once, for all modes:

```ts
import { addons } from 'storybook/internal/preview-api';
// ...
const t0 = performance.now();
const response = await astroRenderer.render({ ... });
const roundTripMs = performance.now() - t0;

const meta = response.meta;
if (meta) {
  addons.getChannel().emit(ASTRO_RENDER_META_EVENT, {
    ...meta,
    storyId: storyContext?.id,
    roundTripMs: meta.source === 'static' ? undefined : roundTripMs,
  } satisfies AstroRenderMeta);
}
```

This is the only edit to the render path itself, and it covers dev/static/server uniformly.

## Manager panel (new) — `packages/@storybook-astro/framework/src/manager.tsx`

New TSX file, using the `storybook/internal/*` namespace the repo already follows (not legacy `@storybook/manager-api`):

```ts
import { addons, types, useChannel } from 'storybook/internal/manager-api';
import { AddonPanel } from 'storybook/internal/components';
import { ASTRO_RENDER_META_EVENT, type AstroRenderMeta } from '@storybook-astro/renderer/types';
```

- Register panel `storybook-astro/panel`: `addons.register('storybook-astro', () => addons.add('storybook-astro/panel', { type: types.PANEL, title: 'Astro', match: ({ viewMode }) => viewMode === 'story', render: ({ active }) => <AstroPanel active={active} /> }))`.
- `AstroPanel` uses `useChannel({ [ASTRO_RENDER_META_EVENT]: (meta) => setMeta(meta) })` and renders inside `<AddonPanel active={active}>`:
  - Summary row: **source/mode** (dev / static / server) + **integrations**.
  - **Render time** — labeled "Render time (build)" when `source === 'static'`, else "Render time"; plus **round-trip** when present.
  - **Raw HTML** in a scrollable monospace block (primary debugging value).
  - Empty state when no metadata yet: "No Astro render captured — open an Astro component story."
- Keep it boring and small — match the project's readability conventions, no extra abstractions.

## Wiring + build config — framework package

- **`src/preset.ts`**: add a `managerEntries` export (mirrors how the renderer preset builds `previewAnnotations` with `__dirname` + `join`, extension omitted so dist `.js` resolves):
  ```ts
  export const managerEntries = async (entries: string[] = []) =>
    [...entries, join(__dirname, 'manager')];
  ```
  Storybook auto-loads `managerEntries` from the framework preset — no user `.storybook/main.js` change needed. The manager bundle ships in built Storybooks too, so the tab appears in static/server builds.
- **`tsup.config.ts`**: add `src/manager.tsx` to `entry`; exclude from DTS (runtime UI, like `middleware`). tsup handles `.tsx`/JSX; keep `react`/`react-dom`/`storybook` external (Storybook's manager builder provides React at runtime).
- **`package.json`**: add a `./manager` subpath export (→ `./dist/manager.js`), consistent with `./testing`, `./vitest`, `./node`.

## Files touched (summary)

| File | Change |
|------|--------|
| `renderer/src/types.ts` | Widen response data; add `AstroRenderMeta` + event const |
| `framework/src/astroRenderHandler.ts` | Time the container render; return `{ html, renderMs }` |
| `framework/src/viteStorybookAstroMiddlewarePlugin.ts` | Dev: capture integrations + build `meta` in response |
| `framework/src/server/index.ts` | Server: return `context.json({ html, meta })` instead of text |
| `framework/src/renderer/renderer-server.ts` | Server: `response.json()`, return `{ id, html, meta }` |
| `framework/src/vitePluginAstroBuildPrerender.ts` | Static: widen manifest value; capture build-time time + integrations |
| `framework/src/renderer/renderer-static.ts` | Static: read widened manifest, return `meta` |
| `renderer/src/render.tsx` | Measure round-trip; emit metadata on Storybook channel (all modes) |
| `framework/src/manager.tsx` | **New** — addon panel UI |
| `framework/src/preset.ts` | Add `managerEntries` export |
| `framework/tsup.config.ts` | Add `src/manager.tsx` entry |
| `framework/package.json` | Add `./manager` export |

## Verification

1. **Build packages first** (integrations consume `dist`): `yarn build:packages` (or `yarn dev:packages` watcher while iterating). Per AGENTS.md, stale `dist` = stale behavior.
2. **Dev mode**: `yarn workspace @storybook-astro/integration-astro6 dev`.
   - Open `Astro/FontDemo`. Confirm a new **"Astro"** tab appears next to Controls.
   - Confirm it shows source=dev, integration names, non-zero live render time, round-trip time, and raw HTML.
   - Change a Control arg → panel updates on re-render (channel fires per render).
   - Open a React/Solid story → panel shows empty state, no errors.
3. **Static build**: `yarn workspace @storybook-astro/integration-astro6 build` then serve `storybook-static/`.
   - Confirm the Astro tab ships, shows source=static, build-time render time, integrations, raw HTML; round-trip hidden.
4. **Server build**: build + run the `integration/astro6-server` setup; start the hono server.
   - Confirm the panel shows source=server with live render time + round-trip, and that `/render` now returns JSON (curl `POST /render`).
5. **Tests**: `yarn test` (run `nvm use` first — wrong Node version causes Vitest `ERR_UNKNOWN_FILE_EXTENSION`). The `meta` field is additive/optional, so most existing tests are unaffected; update any server-mode test that asserts a **text** `/render` body (now JSON).
6. **Lint**: `yarn lint`.

## Notes / risks

- **First manager layer in the repo.** Introduces the project's first `managerEntries`/manager bundle. Stay on `storybook/internal/*` imports.
- **Server `/render` contract change** (text → JSON) is the one breaking change; client + any server-mode tests/docs must move together. Worth a note in `docs/RELEASING.md`-style changelog if server mode is documented as a public contract.
- **Additive elsewhere.** `meta` optional on the shared type keeps dev/static renderers and existing tests working without forced changes.
- **Static render time is build-time**, not runtime — labeled via `source` so the panel doesn't imply a live measurement.
- **Scoped style modules** remain deferred (not tracked server-side today); revisit only if the panel proves useful.

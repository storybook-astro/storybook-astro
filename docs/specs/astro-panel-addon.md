# Astro Panel Addon

## Context

[Issue #162](https://github.com/storybook-astro/storybook-astro/issues/162) asks for an "Astro" tab in the Storybook addon panel, next to Controls and Actions. It shows what the server produced for the current story and how long it took. Today the only way to see the rendered HTML or the render time is to add `console.log` to the framework and watch the terminal.

[Issue #235](https://github.com/storybook-astro/storybook-astro/issues/235) moves story CSS out of the HTML string into its own field of the render response. Since #189 the render handler prepends the CSS to the HTML as `<style data-storybook-astro-styles>` elements, and three places take it back out again.

Both issues change the render response in every mode, so they ship together in 1.16.0 and the response is redesigned once. The panel then gets the stylesheet list for free.

The panel shows:

- **Render mode**: dev, static or server.
- **Integrations**: the framework integrations Storybook is configured with.
- **Timings**: the server's render time, the time it spent loading styles, and the client's round trip.
- **Stylesheets**: where each stylesheet the story shipped came from (a component's `<style>` block, an imported stylesheet, the font CSS).
- **HTML**: the HTML the server returned, before the renderer writes it into the canvas.

## Current state

`render.tsx` doesn't know which mode it runs in. `renderAstroToCanvas` calls `render()` from `virtual:storybook-astro-renderer`, which `viteStorybookAstroRendererPlugin` points at one of three modules. Each returns `{ id, html }` (`RenderResponseMessage['data']` in `renderer/src/types.ts`):

| Mode | Client module | Transport | Server side |
|---|---|---|---|
| Dev | `framework/src/renderer/renderer-dev.ts` | Vite HMR (`astro:render:request` / `astro:render:response`) | `viteStorybookAstroMiddlewarePlugin.ts` → `handlerFactory` (`middleware.ts`) |
| Server | `framework/src/renderer/renderer-server.ts` | `POST /render`, response body is the HTML as text | Hono app in `framework/src/server/index.ts` → `createProductionRenderRuntime` |
| Static | `framework/src/renderer/renderer-static.ts` | Lookup in `astro-prerendered-stories.json` (`Record<storyId, string>`) | `prerenderAstroStories` in `vitePluginAstroBuildPrerender.ts` → `renderProductionStoryToHtml` |

All three render through the `handler` that `createAstroRenderHandler` (`astroRenderHandler.ts`) returns. The testing runtime (`framework/src/testing/astro-runtime.ts`) and its renderer daemon (`testing/renderer-daemon.ts`) use the same handler.

The handler returns one string. After rendering, it calls `loadStylesOrWarn`, which calls `loadComponentStyles` (`lib/componentStyles.ts`), and prepends each stylesheet as `<style data-storybook-astro-styles>` (`STORY_STYLE_ATTRIBUTE`). It escapes `</style` inside the CSS so the element can't end early. Other code then adds to the string or takes it apart again:

- **Dev middleware.** The `astro:render:request` listener prepends the font CSS from `generateFontCss` as one more `<style data-storybook-astro-styles>` element. Builds put the font CSS in the iframe head instead (`transformIndexHtml` in `vitePluginAstroFonts.ts`).
- **Renderer.** `moveStoryStylesToHead` (`renderer/src/storyStyles.ts`) parses the HTML into a `<template>` and moves the `style[data-storybook-astro-styles]` elements into the head. This is a DOM query, not a regex.
- **Testing runtime.** `setRenderedHtml` strips the elements with a regex (`STORY_STYLES`), so `renderStory` returns only the markup. It also passes the full HTML to `moveStoryStylesToHead` to put the CSS in the test document's head.
- **Static prerender.** `pointStoryCssUrlsAtFsPaths`, called from `rewriteAssetPaths`, finds the elements with a regex (`STORY_STYLES`) to rewrite `url()` paths in the CSS only, never in HTML attributes.
- **Server mode and static prerender.** `addStaticStylesheets` (`lib/staticHtmlRewriting.ts`) prepends `<link rel="stylesheet">` tags for hydrated framework components. The renderer's `syncServerRenderedStylesheets` moves them into the head. These are unrelated to #235 and stay in the HTML (see [Settled questions](#settled-questions)).

`render.tsx` has also changed since this spec was first written. Each render into a canvas gets a token (`latestRenderByCanvas`, `shownRenderByCanvas`). A response that arrives after a newer render into the same canvas has started, or after a canvas that was in the document when the render started has left it, is dropped. The teardown `renderToCanvas` returns clears a canvas only while the canvas still shows that render.

## Design decisions

**Decision 1: One response shape in every mode: `{ id, html, stylesheets, timings? }`.** The handler returns `{ html, stylesheets, timings }`. Dev sends it with the request `id`. Server mode returns it as JSON. The static manifest stores `{ html, stylesheets }` per story. The fields are named for what they hold instead of being grouped under a `meta` object. Most of what the panel shows doesn't vary per render (Decision 2), and the stylesheets aren't metadata: the renderer applies them.

**Decision 2: Mode and integrations come from the renderer virtual module, not from the response.** The mode and the configured integrations are the same for every render in a Storybook. `preset.ts` already knows both when it calls `viteStorybookAstroRendererPlugin`, so the generated module exports them. Sending them with every response would mean changing three servers to repeat a constant.

**Decision 3: Each stylesheet says where it came from.** `loadComponentStyles` already knows the module id of every stylesheet it loads (`styleModules[index]`), so returning `{ source, css }` costs nothing. This covers the issue's "scoped style modules" item. The ids are made relative to the SSR server's root (`viteServer.config.root`). That keeps them short, and keeps build-machine paths out of a published static Storybook.

**Decision 4: The server measures its own time; the client measures the round trip.** The handler times its work after the render queue lets it start: `renderMs` covers rules setup, component loading and every `renderToString` call (slots and decorators render through it too), and `stylesMs` covers `loadStylesOrWarn`. Time spent waiting in the queue is not included. It shows up in the round trip, which `render.tsx` measures around `astroRenderer.render()`. Static builds omit `timings`. A number measured on the build machine, shown on a page that rendered nothing, is easy to misread. `performance.now()` is cheap, so timings are always on. #164 ([render-performance](render-performance.md)) plans a debug-flag `timings` field for dev. It should extend this one rather than add a second.

**Decision 5: `render.tsx` emits once, after it writes the response.** The event goes out after the token check, so a dropped response never reaches the panel. It carries the story id, and the panel shows only events for the selected story. It's emitted only in story view mode, because the panel isn't shown in Docs and a Docs page would send the HTML of every story on it.

**Decision 6: The panel ships inside the framework.** The framework preset adds a `managerEntries` export, so the tab appears with no user configuration, in dev and in built Storybooks. It imports from `storybook/manager-api` and `storybook/internal/components`. The old version of this spec named `storybook/internal/manager-api`, which Storybook 10 doesn't export.

**Decision 7: Server mode switches `/render` to JSON and the client still accepts text.** A render server can be deployed apart from the static Storybook that calls it, so the two can run different versions. `renderWithHttp` reads JSON when the response's `content-type` is JSON. Otherwise it treats the body as `{ html, stylesheets: [] }`. An older server's `<style data-storybook-astro-styles>` elements then stay in the canvas markup. They still apply there, as they did before #224, and leave with the markup. The other modes can't have version skew: dev uses one install, and the static manifest comes from the same build as the preview.

## Shared types: `renderer/src/types.ts`

```ts
/** One stylesheet a story ships, applied in the iframe head in this order. */
export type StoryStylesheet = {
  /**
   * Where the CSS came from, for the Astro panel. A style block or imported
   * stylesheet's module id relative to the project root
   * (`src/components/Card.astro?astro&type=style&index=0&lang.css`,
   * `src/styles/card.css`), or `fonts` for the font CSS dev mode adds.
   */
  source: string;
  css: string;
};

export type RenderTimings = {
  /** Rules setup, component loading and rendering, after the render queue let it start. */
  renderMs: number;
  /** Loading the stylesheets the render used. */
  stylesMs: number;
};

/** What a story render produces, in every mode. */
export type RenderResult = {
  html: string;
  stylesheets: StoryStylesheet[];
  /** Absent in static builds, which render at build time. */
  timings?: RenderTimings;
};

export type RenderResponseMessage = {
  type: 'astro:render:response';
  data: RenderResult & { id: string };
};

export const ASTRO_RENDER_INFO_EVENT = 'storybook-astro/render-info';

/** What the preview sends the Astro panel after each story render. */
export type AstroRenderInfo = {
  storyId: string;
  renderMode: 'dev' | 'static' | 'server';
  integrations: string[];
  html: string;
  stylesheetSources: string[];
  timings?: RenderTimings;
  /** Absent in static builds, where the "render" is a lookup in a cached file. */
  roundTripMs?: number;
  /** Set when the render failed. `html` is then empty and there are no stylesheet sources. */
  error?: string;
};
```

`STORY_STYLE_ATTRIBUTE` stays. It still marks the `<style>` elements the renderer creates in the head. `addStylesheetBeforeStoryStyles` selects on it, and the integration tests query for it (`scoped-styles.spec.ts`, `ImportedStylesCard.test.ts`). The framework stops importing it.

## Render handler: `framework/src/astroRenderHandler.ts`

- `handler` returns `RenderResult` instead of a string. `executeRender` records `performance.now()` when it starts, once the HTML is ready, and after `loadStylesOrWarn`.
- `loadStylesOrWarn` returns `StoryStylesheet[]`. The `styleTags` mapping and its `</style` escape go away. The renderer sets the CSS with `textContent`, so nothing in the CSS can end an element.
- `ComponentStyles.stylesheets` in `lib/componentStyles.ts` becomes `StoryStylesheet[]`. `loadComponentStyles` takes `config` in its `Pick<ViteDevServer, …>` to make `source` relative to `config.root`. `createStorySsrViteServer` sets the root to `resolveFrom`, which is the project in the static build and the snapshot in server mode, so the ids are project-relative there too. Ids outside the root (a package component's styles) keep their full id.
- `ProductionRenderRuntime.renderAstroStory` changes its return type to `Promise<RenderResult>`, and so does `renderProductionStoryToHtml`. Its name no longer fits; rename it to `renderProductionStory`.

## Mode 1: Dev

- **`viteStorybookAstroMiddlewarePlugin.ts`**: the `astro:render:request` listener sends `{ id, html, stylesheets, timings }`. When there is font CSS, `{ source: 'fonts', css: fontCss }` goes first in `stylesheets`, where its `<style>` element went before. The error branch sends `{ id, html: <error block>, stylesheets: [] }`, so a render error still shows in the canvas and in the panel's HTML.
- **`renderer-dev.ts`**: no logic change. It resolves the pending promise with the whole `data` object.

## Mode 2: Server

- **`server/index.ts`**: the `/render` route returns `context.json({ html, stylesheets, timings })`. `rewriteBuiltModulePaths` and `addStaticStylesheets` run on `html` only. Today `rewriteBuiltModulePaths` also runs over the CSS, because the CSS is inside the HTML string. It maps JS module sources (tracked specifiers, hydrated components), which CSS has no reason to reference, so it isn't applied to the CSS. The 400 and 401 responses stay text. The client checks `response.ok` before reading the body.
- **`renderer/renderer-server.ts`**: `renderWithHttp` reads `response.json()` when the `content-type` is JSON and returns `{ id, ...body }`, otherwise `{ id, html: await response.text(), stylesheets: [] }` (Decision 7).
- **`renderer-server.test.ts`**: the `fetch` mocks return `text()` only. They need a JSON response, plus one test for the text fallback.

## Mode 3: Static

- **`vitePluginAstroBuildPrerender.ts`**: the manifest becomes `Record<string, { html: string; stylesheets: StoryStylesheet[] }>` (`prerenderAstroStories`, `writePrerenderedStoriesFile`). `rewriteAssetPaths` currently takes the whole HTML. Split it so the `/@fs/` asset rewrite runs on `html` and on each stylesheet's `css`, and `pointStoryCssUrlsAtFsPaths` runs on each `css` directly. The `STORY_STYLES` regex goes, and so does the reason for it: the `url()` quoting can no longer reach an HTML attribute, because CSS and HTML are separate strings. `addStaticStylesheets` and `rewriteBuiltModulePaths` stay on `html`. `timings` isn't written (Decision 4).
- **`renderer/renderer-static.ts`**: the `loadPrerenderedStories` cast and the lookup in `render` read the new value and return `{ id, html, stylesheets }`.
- **Integration tests** that read the manifest as strings change to `.html`: `logo.spec.ts` and `scripted.spec.ts` in `integration/astro5`, `astro6` and `astro7`.

## Testing runtime

- **`testing/astro-runtime.ts`**: `setRenderedHtml(html)` becomes `setRenderedStory({ html, stylesheets })`. It writes `html` to the body, passes `stylesheets` to `setStoryStyles` (below), and returns `html`. The `STORY_STYLES` regex goes. The last-resort direct Container path, which has no handler, passes `stylesheets: []`. `renderStory` still returns the markup string, so its public API doesn't change.
- **`testing/renderer-daemon.ts`**: the daemon responds with `{ html, stylesheets }` instead of `{ html }`, and `renderViaTestingRendererDaemon` checks and returns both. The daemon starts from the same package as the tests, so there is no version skew to handle.

## What #235 removes

- The `<style>` tag building and `</style` escaping in the handler.
- The font `<style>` prepend in the dev middleware.
- The style parsing in `moveStoryStylesToHead`. `storyStyles.ts` gets `setStoryStyles(stylesheets, canvasElement)` in its place. It creates one `<style data-storybook-astro-styles>` element per stylesheet with `textContent = css`, then applies the current rules unchanged: keep the elements when the CSS text matches the canvas's last render, and otherwise replace them at the end of the head. `addStylesheetBeforeStoryStyles` and `removeStoryStyles` don't change.
- The `STORY_STYLES` regexes in `testing/astro-runtime.ts` and `vitePluginAstroBuildPrerender.ts`.

`render.tsx` still parses the HTML into a `<template>` in `prepareServerRenderedHtml`, for `syncServerRenderedStylesheets` and the `<noscript>` reason documented on `moveStoryStylesToHead`. That function becomes the place that owns the template.

## Preview emission: `renderer/src/render.tsx`

In `renderAstroToCanvas`:

```ts
import { addons } from 'storybook/internal/preview-api';
import { ASTRO_RENDER_INFO_EVENT, type AstroRenderInfo } from './types.ts';

// Build the request first, so serializing args isn't counted as round trip.
const request = { component: rootComponent.moduleId, /* args, slots, node, story as today */ };
const canvasWasConnected = canvasElement.isConnected;
const startedAt = performance.now();
const response = await astroRenderer.render(request);
const roundTripMs = performance.now() - startedAt;

if (latestRenderByCanvas.get(canvasElement) !== renderToken) {
  return;
}

// Storybook removed the canvas while the request was in flight (#288).
if (canvasWasConnected && !canvasElement.isConnected) {
  return;
}

// ... applyStyles, setStoryStyles, innerHTML, shownRenderByCanvas, invokeScriptTags as today

if (storyContext?.viewMode === 'story') {
  addons.getChannel().emit(ASTRO_RENDER_INFO_EVENT, {
    storyId: storyContext.id,
    renderMode: astroRenderer.renderMode,
    integrations: astroRenderer.integrations,
    html: response.html,
    stylesheetSources: response.stylesheets.map((stylesheet) => stylesheet.source),
    timings: response.timings,
    roundTripMs: astroRenderer.renderMode === 'static' ? undefined : roundTripMs
  } satisfies AstroRenderInfo);
}
```

- The HTML comes from the response, not from `canvasElement.innerHTML`. The canvas copy has had its links and scripts moved or replaced, and with #236 it can contain the loading indicator.
- `addons.getChannel()` returns a mock channel when the preview has none installed, so this is safe in portable stories and in `render.test.ts`.
- Framework-delegated stories, string stories and DOM-node stories never reach `renderAstroToCanvas`, so they don't emit.
- A failed render emits too, so the panel never presents an earlier render of the story as the current one. In the `catch` in `renderToCanvas`, inside the existing `latestRenderByCanvas.get(canvasElement) === thisRender` check and only in story view, emit the same event with `html: ''`, `stylesheetSources: []` and `error` set to the error's message. An out-of-date render's error stays silent, as it does today.

## Renderer virtual module: `viteStorybookAstroRendererPlugin.ts`

Pass `integrations: integrations.map((integration) => integration.name)` from `preset.ts`, the names users pass to `react()`, `solid()` and so on. Each of the three generated branches adds:

```ts
export const renderMode = 'dev'; // or 'static' / 'server'
export const integrations = ["react","solid"];
```

The dev branch currently is a single `export * from renderer-dev.js`; it gets these two lines after it. Declare both exports in the `virtual:storybook-astro-renderer` block of `framework/src/virtual.d.ts`. `isStaticMode` stays, because `entry-preview.ts` uses it, and removing it is out of scope.

## Manager panel: `framework/src/manager.tsx` (new)

```ts
import React, { useState } from 'react';
import { addons, types, useChannel, useStorybookState } from 'storybook/manager-api';
import { AddonPanel } from 'storybook/internal/components';
import { ASTRO_RENDER_INFO_EVENT, type AstroRenderInfo } from '@storybook-astro/renderer/types';
```

- Register under `storybook-astro`, add panel `storybook-astro/panel` with `type: types.PANEL`, `title: 'Astro'`, `match: ({ viewMode }) => viewMode === 'story'`, and `render: ({ active }) => <AstroPanel active={active} />`.
- `AstroPanel` keeps the latest `AstroRenderInfo` from `useChannel`. It shows it only when `info.storyId` equals `useStorybookState().storyId`. Without that check, a React story selected after an Astro story would show the Astro story's HTML.
- It renders inside `<AddonPanel active={active}>`, top to bottom:
  - Mode and integrations on one line. Label the integrations as configured for the Storybook, since they aren't detected per story.
  - Server render time, style loading time, and round trip when present. Static: "Rendered at build time".
  - The stylesheet sources, in the order they apply.
  - The HTML, in a scrollable monospace block.
  - For a failed render, the error message in place of the HTML and stylesheet sources.
  - With nothing to show: "No Astro render for this story. Stories rendered by React, Vue and other frameworks don't use the Astro server."
- Keep it one small file, with no state beyond the latest event.

## Wiring and build

- **`framework/src/preset.ts`**: add the export below. Storybook collects `managerEntries` from framework presets as it does from addon presets. Confirm on the first dev run that the tab appears.

  ```ts
  export const managerEntries = async (entries: string[] = []) => [
    ...entries,
    fileURLToPath(new URL('./manager.js', import.meta.url))
  ];
  ```

  The framework preset is ESM without `__dirname`; this follows how `viteStorybookAstroRendererPlugin` finds its own `dist` files.
- **`framework/tsup.config.ts`**: add `src/manager.tsx` to `entry`, not to `dts.entry`. `react` is already in `external`, and `storybook/*` subpaths are external through the `storybook` peer dependency.
- **JSX runtime**: `tsconfig.base.json` sets `"jsx": "react-jsx"`, which compiles to `react/jsx-runtime` imports. Storybook 10's manager builder maps `react`, `react-dom`, `storybook/manager-api`, `storybook/internal/components` and a few more to globals (`globalsNameReferenceMap` in `storybook/dist/manager/globals.js`), but not `react/jsx-runtime`. Compile `manager.tsx` with the classic runtime (`import React from 'react'`, tsup `esbuildOptions: (options) => { options.jsx = 'transform'; }` for that entry). The other choice is to verify that the builder bundles `react/jsx-runtime` against the global React, which is unverified.
- **Types**: the framework needs `@types/react` as a dev dependency if the workspace doesn't already provide it to the package.
- No `./manager` export in `package.json`. `managerEntries` passes an absolute path, so nothing imports the file by specifier.

## Files touched

| File | Change |
|---|---|
| `renderer/src/types.ts` | `StoryStylesheet`, `RenderTimings`, `RenderResult`, `AstroRenderInfo`, event name; response type |
| `renderer/src/storyStyles.ts` | `setStoryStyles(stylesheets, canvas)` replaces `moveStoryStylesToHead` |
| `renderer/src/render.tsx` | Apply `stylesheets`; time the round trip; emit render info |
| `framework/src/lib/componentStyles.ts` | Return `{ source, css }`, source relative to the root |
| `framework/src/astroRenderHandler.ts` | Return `RenderResult`; timings; no `<style>` building |
| `framework/src/viteStorybookAstroMiddlewarePlugin.ts` | Send the new shape; font CSS as a stylesheet |
| `framework/src/productionRenderRuntime.ts` | `RenderResult` return types; rename `renderProductionStoryToHtml` |
| `framework/src/server/index.ts` | `/render` returns JSON |
| `framework/src/renderer/renderer-server.ts` | Read JSON, fall back to text |
| `framework/src/vitePluginAstroBuildPrerender.ts` | New manifest value; rewrite CSS and HTML separately |
| `framework/src/renderer/renderer-static.ts` | Read the new manifest value |
| `framework/src/testing/astro-runtime.ts`, `testing/renderer-daemon.ts` | Carry `stylesheets`; drop the regex |
| `framework/src/viteStorybookAstroRendererPlugin.ts`, `virtual.d.ts` | Export `renderMode` and `integrations` |
| `framework/src/manager.tsx` | New: the panel |
| `framework/src/preset.ts`, `tsup.config.ts`, `package.json` | `managerEntries`, build entry, `@types/react` |
| Docs | `AGENTS.md` (data flow, Styles Not Applying, version compatibility item 6), `how-it-works/architecture.md`, `dev-mode.md`, `version-compatibility.md`, roadmap entry, changelog |

## Tests and verification

Unit tests:

- `astroRenderHandler.test.ts`: assert `stylesheets` and `timings` instead of `<style>` elements in the HTML. Make sure `</style` in the CSS reaches the client unchanged.
- `storyStyles.test.ts`: the `setStoryStyles` cases that replace the HTML-parsing cases: same CSS keeps its elements, changed CSS replaces them, and a teardown removes them.
- `render.test.ts`: stylesheets reach the head; the info event fires once per written render with the right story id; it doesn't fire for a dropped response, in Docs view, or for a delegated story.
- `vitePluginAstroBuildPrerender.test.ts`: `url()` rewriting runs on the CSS and never on HTML attributes.
- `renderer-server.test.ts`: JSON responses, plus the text fallback.

Manual checks, after `yarn build:packages`:

1. Dev (`yarn workspace @storybook-astro/integration-astro7 dev`): open an Astro story. The Astro tab shows mode `dev`, the integrations, all three timings, the stylesheet sources and the HTML. A Controls change updates it. A React story shows the empty state. A Docs page sends no events.
2. Static (`build`, then serve `storybook-static/`): mode `static`, no timings, and styles still apply. Check `astro-prerendered-stories.json` for no absolute build-machine paths.
3. Server (`integration/astro7-server`): `curl -X POST …/render` returns JSON. The panel shows mode `server` with timings.
4. `yarn lint`, `yarn lint:links`, `yarn test`, and the Playwright suites that cover scoped styles and the static manifest.

## Sequencing

- **After #236 merges.** `feature/236-loading-indicator` changes `renderToCanvas` around the same `renderAstroToCanvas` call. Its indicator starts in `renderToCanvas` before `renderAstroToCanvas` runs. The round-trip timer starts later, right around `astroRenderer.render()`, so the indicator's 200 ms delay isn't measured. The two don't share state. Rebasing this work onto #236 should only touch neighboring lines.
- **#153 (`feature/server-render-mode`).** That PR branches from 1.14.0 and is due to be updated after 1.15.0. It edits the same server-mode files, but not the response body:
  - `server/index.ts`: mounts the app under `basePath('/api')` and resolves `staticModuleMap` on the host. The `/render` route still returns `context.text(...)`.
  - `renderer-server.ts`: a fixed `/api` server URL, a 60 s timeout, and a warm-up request in `init()`. `renderWithHttp` still reads `response.text()`.
  - `render.tsx`: its own loading indicator (`scheduleRenderLoadingIndicator`), which #236 supersedes. It also predates the render tokens and story styles.

  Whichever lands second makes a small change: switch `/render` to `context.json(...)` and `renderWithHttp` to the JSON-or-text read. Keep that change in its own commit, so a rebase of #153 resolves in a few lines. This spec doesn't depend on any of #153's changes, and #153 doesn't need to be redesigned for it. When #153 is updated, drop its loading indicator in favor of #236's.
- **#164 (render performance).** If its Step 1 lands later, it adds detail to `RenderTimings` (queue wait, module load) instead of adding a second field (Decision 4).

## Settled questions

These were open when the spec was refreshed for 1.16.0 and have been decided.

1. **Hydrated-component `<link>` stylesheets stay in the HTML for now.** `addStaticStylesheets` still prepends `<link rel="stylesheet">` tags in server and static builds, and `syncServerRenderedStylesheets` moves them. Returning their hrefs in the response would finish #235's idea, but it touches `staticHtmlRewriting.ts`, which #153 changes. It's a follow-up after both land.
2. **The server-mode text fallback stays** (Decision 7). It keeps an older deployed render server working, with the CSS inline in the canvas, for one branch in `renderWithHttp`. It can go a release or two later.
3. **A failed render sends an event**, with `error` set (see [Preview emission](#preview-emission-renderersrcrendertsx)). Without it, in server mode the panel would keep showing the last successful render of a story whose latest render failed.
4. **The panel shows the configured integrations**, labeled as such. Listing the renderers a story actually hydrated would mean parsing `<astro-island renderer-url>` in the manager. It can be added later if the configured list proves too coarse.
5. **Static builds don't keep build-time timings** (Decision 4).
6. **The panel shows stylesheet sources, not CSS text.** The CSS roughly doubles the event payload for heavily styled stories, and DevTools already shows the `<style>` elements in the head.

# Decorator Support

## Problem Statement

Storybook's [decorator](https://storybook.js.org/docs/writing-stories/decorators) API lets users wrap stories with layout, context providers, or other surrounding markup. Decorators can be defined globally (in `.storybook/preview.js`), at the component level (in the story file's `default` export), or at the story level.

Users of Storybook Astro have reported that decorators do not work — neither at the story level nor globally — for both Astro component stories and framework component stories (React, Vue, etc.).

**Reference**: [Issue #40 — Unable to use decorators](https://github.com/storybook-astro/storybook-astro/issues/40)

## Current State

### How Storybook composes decorators

`storybook/internal/preview-api` composes decorators into the story function (`storyFn`) during story preparation. Composition is synchronous: each decorator is invoked as `decorator(Story, context)`, where `Story` is a thunk that returns whatever the inner decorator (or the renderer's `render()`) returns. The pipeline does not constrain the return type — the renderer does.

Crucially, Storybook lets a renderer **own decorator composition** via the `applyDecorators` project annotation (`BaseAnnotations.applyDecorators` in `storybook/internal/csf`; `defaultDecorateStory` and `decorateStory` are exported from `storybook/internal/preview-api`). `@storybook/svelte` and `@storybook/vue3` use this hook to normalize decorator return values into renderer-specific shapes. We do not currently provide one, so the default composition runs and Astro stories get unusable results.

### The render pipeline today (this has changed since the original plan)

Astro story rendering now flows through a shared server-side handler and **three client render modes** behind the `virtual:storybook-astro-renderer` abstraction:

| Mode | Client module | Transport | Server side |
|---|---|---|---|
| **Dev** | `framework/src/renderer/renderer-dev.ts` | Vite HMR (`astro:render:request`) | `viteStorybookAstroMiddlewarePlugin.ts` → `handlerFactory` (`middleware.ts`) |
| **Server** | `framework/src/renderer/renderer-server.ts` | HTTP POST `/render` | Standalone Hono server (`server/index.ts`) over a project snapshot |
| **Static** | `framework/src/renderer/renderer-static.ts` | none — lookup in `astro-prerendered-stories.json` | Build-time prerender (`vitePluginAstroBuildPrerender.ts`) |

All three server sides converge on `createAstroRenderHandler` (`framework/src/astroRenderHandler.ts`), which takes `{ component: moduleId, args, slots, story }`, loads the component module, applies story rules / module mocks, sanitizes the payload, and calls `container.renderToString(component, { props, slots })`.

Facts that constrain the decorator design:

1. **Slots already flow as renderable trees, not just strings.** Since "Astro components as props and slot content" (#134, v1.7.0) and configured-component slots (v1.8.0), a slot value (`SlotValue` in `renderer/src/types.ts`) can be an HTML string, a component reference, a **configured component** (`AstroComponentSlot` — `{ component, props, slots }`, recursively nestable), or an array of those. The client serializes component factories to `moduleId` markers (`serializeAstroComponentMarkers` in `renderer/src/astroComponentMarker.ts`, already wired into `render.tsx` for args and slots), and the handler resolves the tree depth-first (`reconstructSlots` in `framework/src/lib/reconstruct-component-args.ts`, depth cap 10), rendering inner components via the Container and splicing their HTML into the parent slot. This is most of the machinery a decorator tree needs, and it is shared by all render modes because it lives in `createAstroRenderHandler`.
2. **Sanitization already distinguishes trusted from user-authored content.** `lib/sanitization.ts` applies `sanitize-html` to string slot values (`slots: ['**']`) with a strict tag/attribute allowlist (no `<script>`, no `<style>`, no custom elements like `<astro-island>`, no `data-*` attributes). Component markers and descriptors pass through sanitization untouched, and component-rendered HTML is spliced in *after* sanitization, so trusted server output is never stripped. Array slot entries are sanitized as **one document**, with placeholders standing in for non-string entries (#149), so a wrapper tag split across entries (`['<div>', component, '</div>']`) stays balanced. Round-tripping rendered HTML through a client-side `slots` string would still destroy it — but the trusted-splice path a decorator needs already exists server-side.
3. **Static prerender bypasses Storybook composition entirely.** `renderProductionStoryToHtml` (`productionRenderRuntime.ts`) reads `index.json`, loads the story module directly, merges meta/story args, and renders the meta component. Decorators are never consulted. The same is true of the testing API: `renderStory` (`testing/astro-runtime.ts`) renders `meta.component` with merged args and skips the composed `storyFn` for Astro stories.
4. **Server mode renders from a snapshot.** `vitePluginAstroBuildServer.ts` copies the **story** `.astro` components plus their local import closure (`copyLocalRuntimeDependencies`) and project config files into the deployed snapshot, and maps their module ids via `componentPathMap`. Anything unmapped falls back to the verbatim original path (`resolveSnapshotComponentPath` in `server/index.ts`), which only works when the original project is on the same disk. A decorator component imported only from `preview.js` would not be in the snapshot today — the same gap already affects components referenced only via slot/prop markers from a story file.
5. **CSF4 is supported.** `definePreview` in `framework/src/index.ts` composes the renderer's `render`/`renderToCanvas` annotations; an `applyDecorators` annotation must be composed the same way, and must work both in the preview iframe and in Node (portable stories), where the renderer's virtual-module chain cannot be imported. The pattern to follow already exists: `renderer/src/preview-defaults.ts` is a virtual-module-free module that `definePreview` merges synchronously while lazy-loading the browser-only `entry-preview`.

Upstream status (checked 2026-07-18): Storybook 10.5.2 and Astro 7.1.1 change nothing this plan relies on — `defaultDecorateStory` is still exported from `storybook/internal/preview-api`, and the Container API is unchanged. Astro 7 support landed in this repo (v1.7.0), adding `integration/astro7` and `integration/astro7-server` to the test matrix.

### Framework component stories (React, Vue, Svelte, etc.)

For stories with `parameters.renderer`, `renderToCanvas` delegates to the framework renderer before calling `storyFn()`. The framework renderer calls `ctx.storyFn()` itself, so decorators written in the framework's native format should work through this path — still **untested and undocumented**. Note: once we supply a custom `applyDecorators`, it applies to *all* stories in the project, so it must defer to `defaultDecorateStory` semantics for framework-delegated stories.

## Design Decisions

The original plan proposed client-side recursive resolution: `Story()` returns a descriptor, and `render.tsx` walks the tree making one render request per nesting level. Two things about the current codebase invalidate that:

- **Round trips**: every decorator level would add an HMR/HTTP round trip per render (and controls changes re-render constantly).
- **Sanitization**: in server mode, inner rendered HTML sent back up as a `slots` string would be sanitized into mush (fact 2 above). Resolving the tree **server-side** sidesteps this cleanly: HTML the server itself just rendered is trusted and is spliced into the outer component's slot without re-sanitization; strings that came from the user are sanitized exactly as today.

Since the previous revision of this plan, v1.7.0–v1.8.0 shipped exactly this server-side tree resolution for **configured-component slots** (fact 1 above). The decorator design now *reuses* that machinery instead of building a parallel one.

Therefore:

**Decision 1 — Compose with a custom `applyDecorators`.** The renderer ships an `applyDecorators` annotation (the same mechanism Svelte and Vue 3 use). Because we control the `Story` thunk *and* see each decorator's return value, we can normalize every supported decorator shape — including auto-filling the default slot when a decorator never places `Story()` explicitly, and supporting plain HTML-string decorators via a placeholder token (the syntax users tried first in issue #40, and the syntax the public roadmap promises).

**Decision 2 — `storyFn()` returns a renderable tree; the server resolves it in one request, through the existing configured-component slot machinery.** The composed story function returns the existing `SlotValue` shape: each component-descriptor decorator becomes an `AstroComponentSlot` with the inner renderable in its default slot, and the whole tree is serialized with `serializeAstroComponentMarkers` and sent as the root of a single render request. `createAstroRenderHandler` resolves it with the same `reconstructSlots` code path that already resolves slot trees recursively, inner-to-outer. Because the handler is shared, this one implementation serves dev mode, server mode, build-time prerender, and the testing daemon.

**Decision 3 — Framework stories keep default composition.** Our `applyDecorators` branches at call time: stories with `parameters.renderer` get `defaultDecorateStory` behavior so React/Vue/Svelte decorators behave natively through the delegated renderer; only Astro-rendered stories get the tree composition.

> **Step 1 finding**: `defaultDecorateStory` is *not* fully equivalent to each framework's own composition. React's JSX decorators work, but Vue's documented `(story) => ({ components: { story }, template })` shape depends on `@storybook/vue3`'s own `decorateStory` normalization and renders as stringified function text under generic composition. Vue decorators must use the render-function form `(story) => () => h('div', attrs, [h(story())])` (see `integration/*/.storybook/preview.js`). Step 2 should either route `parameters.renderer` stories through the *framework's* `applyDecorators`/`decorateStory` when available (fixing the descriptor shape), or keep `defaultDecorateStory` and document the `h()`-form requirement for Vue.

## Decorator Contract

### Supported decorator shapes (Astro stories)

**1. Descriptor returning an Astro component** (primary form):

```js
// .storybook/preview.js
import Wrapper from './Wrapper.astro';

export const decorators = [
  (Story, ctx) => ({ component: Wrapper, props: { theme: ctx.globals.theme } }),
];
```

```astro
---
// Wrapper.astro
const { theme } = Astro.props;
---
<div class={`wrapper theme-${theme}`}>
  <slot />
</div>
```

If the descriptor has no `slots.default`, the inner story is placed there automatically. Named slots are supported explicitly:

```js
(Story) => ({ component: Layout, slots: { default: Story(), sidebar: '<nav>…</nav>' } })
```

**2. HTML string** (the "obvious" syntax):

```js
(Story) => `<div class="dark-background">${Story()}</div>`
```

`Story()` returns a handle whose `toString()` yields a unique placeholder token. At composition time (client-side), the wrapper string is **split on the token** into an array layer — `['<div class="dark-background">', innerNode, '</div>']` — so the token never crosses the wire. This is exactly the array slot shape the sanitizer already handles: the user-authored string parts are sanitized as one document with placeholders keeping the split tags balanced (#149), and the inner rendered HTML is spliced in trusted.

**3. Bare Astro component** as the decorator value — sugar for form 1 with the story in the default slot:

```js
export const decorators = [Wrapper];
```

### The renderable tree

The tree **is** the existing `SlotValue` shape from `renderer/src/types.ts` — no parallel `AstroRenderable` type is introduced:

```ts
// All of these are already SlotValue members:
AstroComponentFactory                                  // undecorated story
{ component, props?, slots? }   // AstroComponentSlot — component wrapper, nestable
['<div class="dark">', node, '</div>']                 // string wrapper (array form)
```

`applyDecorators` produces a `SlotValue` synchronously. `render.tsx` serializes it with the existing `serializeAstroComponentMarkers` (factory → `moduleId` marker) and sends it as a new optional root field on the render request (Step 3), keeping `component`/`args`/`slots` populated with the undecorated story for backward compatibility. The handler resolves the root exactly like a slot value — `reconstructSlots` already renders depth-first, splices server-rendered HTML in trusted, sanitizes user-authored strings, and caps depth (`MAX_DEPTH = 10` in `reconstruct-component-args.ts`). The genuinely new server-side work is small: accept a root node, and make sure the **story node's props** still run through the full top-level arg pipeline (`reconstructProps`, `processImageMetadata`, `reviveDateStrings`, arg-level sanitization) wherever the story sits in the tree, rather than the lighter slot-descriptor prop handling.

### Framework component stories

Handled entirely by the delegated framework renderer with default Storybook composition; users write decorators in that framework's native style (JSX for React, etc.). No Astro-specific code path — but verified by tests (Step 1).

### Explicitly out of scope

- **Framework components as decorators on Astro stories.** Wrap framework-context concerns (e.g. a React `ThemeProvider`) inside the decorator's Astro component as an island.
- **Reactive / runtime decorators.** Astro is SSR-first; decorators run at render time. Interactive wrapper behavior belongs in the decorator component's own `<script>` or islands.

## Implementation Plan

Each step lands with its tests and is independently shippable (canary releases through `develop`, per `docs/RELEASING.md`).

### Step 1 — Verify and lock down framework decorator delegation

Independent of everything else and closes half of issue #40. Add story-level and global decorators to React and Vue stories in `integration/astro5`, `integration/astro6`, and `integration/astro7`; confirm they apply through `typedRenderers[renderer].renderToCanvas`. Add Vitest coverage asserting wrapper markup in rendered output. If broken, investigate `virtual:storybook-renderer-fallback` before touching anything else.

**Files**: `integration/{astro5,astro6,astro7}/.storybook/preview.js`, a React and Vue story per app, matching `*.test.ts`.

**Exit criteria**: framework decorators proven working (or fixed), regression tests in `yarn test`.

### Step 2 — Decorator composition in the renderer (`applyDecorators`)

Implement tree composition in a new `packages/@storybook-astro/renderer/src/decorators.ts` with **no virtual-module imports**, so Node test processes and the framework package can import it directly — follow the `preview-defaults.ts` pattern, which `definePreview` already merges this way:

- `applyDecorators(storyFn, decorators)` — builds both compositions; at call time routes `parameters.renderer` stories through `defaultDecorateStory` (still exported from `storybook/internal/preview-api` as of Storybook 10.5.2), everything else through Astro composition.
- The `Story` thunk returns a handle carrying the inner renderable; `toString()` emits the placeholder token (unique per render). When a decorator returns a string containing the token, composition splits it into the array form `[before, inner, after]` — the token never leaves the client.
- Normalization of all three decorator shapes, including auto default slot and bare-component sugar (detected via `isAstroComponentFactory`).
- Export from `entry-preview.ts`. No new tree types: compose into the existing `SlotValue` / `AstroComponentSlot` shapes in `renderer/src/types.ts`.
- Compose into CSF4: `definePreview` in `framework/src/index.ts` adds `applyDecorators: input.applyDecorators ?? composedApplyDecorators`. The decorators module is virtual-module-free, so it can be imported statically alongside `preview-defaults` rather than through the lazy `entry-preview` load.

**Exit criteria**: unit tests on composition — single decorator, two-decorator chain, string + descriptor mixed chain, framework-story passthrough, `Story()` never called (auto-slot), named slots.

### Step 3 — Root-node wire field and server-side resolution

Most of the resolution shipped with configured-component slots (v1.7.0–v1.8.0); what remains:

- **Types** (`renderer/src/types.ts`): extend `RenderComponentInput` with an optional serialized root node (e.g. `node?: SlotValue`). Keep `component`/`args`/`slots` populated with the root story for backward compatibility — an older server renders the story undecorated instead of erroring (document the version skew).
- **Client** (`renderer/src/render.tsx`): `renderToCanvas` recognizes a renderable tree (not just a bare factory), serializes it with the existing `serializeAstroComponentMarkers` (which already errors on a factory missing `moduleId`), sends one request. No behavior change for undecorated stories.
- **Server** (`framework/src/astroRenderHandler.ts`): when `node` is present, resolve it through the existing `resolveSlotValue` path inside the render-queue/rules scope — array string parts already sanitize as one document (#149), component-rendered HTML already splices trusted. Two handler-specific additions: (1) the **story node's props** must run through the full top-level arg pipeline (`reconstructProps`, `processImageMetadata`, `reviveDateStrings`, arg-level sanitization) wherever the story sits in the tree, not the lighter slot-descriptor prop handling; (2) validate node shape at the boundary — the `MAX_DEPTH = 10` cap in `reconstruct-component-args.ts` already guards depth (confirm it accommodates realistic decorator chains). The HTTP server (`server/index.ts`) gets the validation for free since it forwards into the handler, but add an explicit payload check there too.
- Dev middleware and HTTP server need no transport changes — the payload passes through as JSON.

**Exit criteria**: handler unit tests (nested resolution, sanitization boundaries, split string wrapper, story-props pipeline, depth cap); manual check in `integration/astro6` and `integration/astro7` dev mode with a two-decorator chain; scoped styles from the decorator component apply (the marker plugin already imports style sub-modules for any client-imported `.astro` file — verify, don't assume).

### Step 4 — Static prerender and server-mode snapshot

Two gaps, one per production mode:

- **Prerender** (`vitePluginAstroBuildPrerender.ts` / `productionRenderRuntime.ts`): load the project's `.storybook/preview.*` through the existing SSR Vite server, compose each Astro story with `composeStory` (portable stories), call the composed story to get the tree, and resolve it with the same handler the runtime already owns. Stub `@storybook-astro/renderer/entry-preview` in the prerender SSR server (alias to the virtual-module-free decorators module) so `definePreview`'s eager renderer import doesn't pull browser-only virtual modules into Node — the prerender server already stubs `@storybook/preview` this way (v1.7.1), so the mechanism is proven. Decorators read `initialGlobals` at build time. If composition fails for a story, skip it (existing `undefined` → omit behavior) and log which stories were dropped.
- **Server snapshot** (`vitePluginAstroBuildServer.ts`): decorator components referenced only from `preview.js` must reach the snapshot and `componentPathMap`. Today the snapshot covers story components plus their local import closure, with a verbatim-original-path fallback for anything else — the same gap already affects components referenced only via slot/prop markers from a story file, so fixing it here repairs both. Collect the ids from the iframe build: `vitePluginAstroComponentMarker` transforms every client-imported `.astro` file and knows its module id — record those ids during the build and feed them into the snapshot copy + path map. Fallback if collection proves unreliable: copy all project `.astro` files (excluding `node_modules`) into the snapshot.

**Exit criteria**: `yarn workspace @storybook-astro/integration-astro6 build` and `…-astro7 build` (static) show decorated HTML in `astro-prerendered-stories.json`; `astro6-server` build + run renders a decorated story over HTTP; `yarn smoke` passes (covers astro5/6/7 templates).

### Step 5 — Portable stories and the testing API

- `framework/src/portable-stories.ts`: merge `applyDecorators` (imported from the renderer's decorators module) into project annotations alongside `render`, for both `composeStory` and `composeStories`.
- `framework/src/testing/astro-runtime.ts`: make `renderComposedStory` decorator-aware — when the composed story produces a renderable tree, pass it through `renderViaTestingRendererDaemon` / the in-worker handler instead of short-circuiting to `meta.component`. The daemon payload (`testing/renderer-daemon.ts`) already carries slot trees (the reconstruct helpers accept real factories on the Vitest path), so this is the same optional root-node field as Step 3, not a new serialization scheme. Undecorated stories keep the current fast path.

**Exit criteria**: a Vitest test using `composeStories` + `renderStory` asserts decorator markup for global, meta-level, and story-level decorators; all existing suites still pass.

### Step 6 — Integration coverage across apps

Concrete examples + tests exercising every authoring position and mode:

- `integration/astro5`, `integration/astro6`, and `integration/astro7`: global decorator (`Wrapper.astro` + theme from globals), component-level decorator, story-level decorator, two-decorator chain, HTML-string decorator, named-slot decorator.
- CSF4 coverage: `integration/astro6-csf4` exists only on the unmerged `feature/integration-astro6-csf4` branch — either merge that branch first or add `definePreview` / CSF4-factory decorator coverage as part of this step.
- `integration/{astro5,astro6,astro7}-server`: at least one decorated story verified in the server-mode build (smoke-level).
- React decorator on a React story in the main apps (regression from Step 1).

**Files**: `integration/*/.storybook/Wrapper.astro`, `preview.js`/`preview.ts`, story files, matching `*.test.ts`.

### Step 7 — Documentation and release

- New website guide `apps/website/src/content/docs/` (writing-stories/decorators): the three decorator shapes, composition model (sync composition, single async SSR pass), context/globals access, framework-story decorators, per-mode behavior (dev/server/static), limitations. Cross-link with `writing-stories/slots.md` — decorators ride the same configured-component machinery.
- Update `apps/website/src/content/docs/guides/roadmap.md`: Decorator Support → completed; flip the feature-table row to ✅.
- Update `AGENTS.md` (render pipeline section) with the tree-resolution flow.
- Package release through `develop` → canary → `main` per `docs/RELEASING.md` (renderer first, then framework — both packages change).

## Known Limitations

- Decorators on Astro stories produce SSR output only; decorator props can read `context` (globals, args, parameters) at render time but cannot react to client-side state changes. In **static** builds, decorators see `initialGlobals` frozen at build time — toolbar changes will not re-render prerendered stories.
- Component wrappers must be Astro components; framework wrappers (e.g. React `ThemeProvider`) go inside the decorator's Astro component as an island.
- HTML-string decorators are sanitized in server mode under the project's sanitization config — wrapper markup is limited to the allowed tags/attributes there (dev mode applies the same config, default-on).
- Version skew: a new renderer talking to an old framework server renders stories undecorated (graceful, but silent — upgrade both packages together).

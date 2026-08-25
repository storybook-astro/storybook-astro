# Decorator Support

Behavior contract and design rationale for Storybook decorators on Astro stories.
Shipped in v1.9.0; this document describes current behavior, not a plan.

**Reference**: [Issue #40 — Unable to use decorators](https://github.com/storybook-astro/storybook-astro/issues/40)

## Problem Statement

Storybook's [decorator](https://storybook.js.org/docs/writing-stories/decorators) API lets users wrap stories with layout, context providers, or other surrounding markup. Decorators can be defined globally (in `.storybook/preview.js`), at the component level (in the story file's `default` export), or at the story level.

Decorators previously did not work in Storybook Astro — neither at the story level nor globally — for either Astro component stories or framework component stories (React, Vue, etc.).

### How Storybook composes decorators

`storybook/internal/preview-api` composes decorators into the story function (`storyFn`) during story preparation. Composition is synchronous: each decorator is invoked as `decorator(Story, context)`, where `Story` is a thunk that returns whatever the inner decorator (or the renderer's `render()`) returns. The pipeline does not constrain the return type — the renderer does.

Crucially, Storybook lets a renderer **own decorator composition** via the `applyDecorators` project annotation (`BaseAnnotations.applyDecorators` in `storybook/internal/csf`; `defaultDecorateStory` and `decorateStory` are exported from `storybook/internal/preview-api`). `@storybook/svelte` and `@storybook/vue3` use this hook to normalize decorator return values into renderer-specific shapes. Storybook Astro supplies one too — see [Design Decisions](#design-decisions).

### Render pipeline

Astro story rendering flows through a shared server-side handler and **three client render modes** behind the `virtual:storybook-astro-renderer` abstraction:

| Mode | Client module | Transport | Server side |
|---|---|---|---|
| **Dev** | `framework/src/renderer/renderer-dev.ts` | Vite HMR (`astro:render:request`) | `viteStorybookAstroMiddlewarePlugin.ts` → `handlerFactory` (`middleware.ts`) |
| **Server** | `framework/src/renderer/renderer-server.ts` | HTTP POST `/render` | Standalone Hono server (`server/index.ts`) over a project snapshot |
| **Static** | `framework/src/renderer/renderer-static.ts` | none — lookup in `astro-prerendered-stories.json` | Build-time prerender (`vitePluginAstroBuildPrerender.ts`) |

All three converge on `createAstroRenderHandler` (`framework/src/astroRenderHandler.ts`), which takes `{ component: moduleId, args, slots, story, node }`, loads the component module, applies story rules / module mocks, sanitizes the payload, and calls `container.renderToString(component, { props, slots })`.

## Design Decisions

Decorators resolve **server-side**, reusing the configured-component slot machinery that shipped in v1.7.0–v1.8.0 rather than building a parallel one. Two properties of the codebase drive that choice:

- **Slots already flow as renderable trees, not just strings.** A slot value (`SlotValue` in `renderer/src/types.ts`) can be an HTML string, a component reference, a configured component (`AstroComponentSlot` — `{ component, props, slots }`, recursively nestable), or an array of those. The client serializes component factories to `moduleId` markers (`serializeAstroComponentMarkers` in `renderer/src/astroComponentMarker.ts`), and the handler resolves the tree depth-first (`reconstructSlots` in `framework/src/lib/reconstruct-component-args.ts`, depth cap 10).
- **Sanitization distinguishes trusted from user-authored content.** `lib/sanitization.ts` applies `sanitize-html` to string slot values with a strict tag/attribute allowlist. Component-rendered HTML is spliced in *after* sanitization, so trusted server output is never stripped. Resolving client-side instead would round-trip rendered HTML through a `slots` string and sanitize it into mush — and would add an HMR/HTTP round trip per nesting level on every controls change.

**Decision 1 — Compose with a custom `applyDecorators`.** The renderer ships an `applyDecorators` annotation (the same mechanism Svelte and Vue 3 use). Because we control the `Story` thunk *and* see each decorator's return value, we normalize every supported decorator shape — including auto-filling the default slot when a decorator never places `Story()` explicitly, and supporting plain HTML-string decorators via a placeholder token.

**Decision 2 — `storyFn()` returns a renderable tree; the server resolves it in one request.** The composed story function returns the existing `SlotValue` shape: each component-descriptor decorator becomes an `AstroComponentSlot` with the inner renderable in its default slot, and the whole tree is serialized and sent as the root of a single render request. `createAstroRenderHandler` resolves it with the same `reconstructSlots` path that resolves slot trees, inner-to-outer. Because the handler is shared, one implementation serves dev mode, server mode, build-time prerender, and the testing daemon.

**Decision 3 — Framework stories keep default composition.** `applyDecorators` branches at call time: stories with `parameters.renderer` get `defaultDecorateStory` behavior so React/Vue/Svelte decorators behave natively through the delegated renderer; only Astro-rendered stories get tree composition. See [Framework delegation](#framework-delegation) for the Vue caveat this creates.

## Decorator Contract

### Supported decorator shapes

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

`Story()` returns a handle whose `toString()` yields a unique placeholder token. At composition time (client-side), the wrapper string is **split on the token** into an array layer — `['<div class="dark-background">', innerNode, '</div>']` — so the token never crosses the wire. This is exactly the array slot shape the sanitizer already handles: user-authored string parts are sanitized as one document with placeholders keeping the split tags balanced (#149), and the inner rendered HTML is spliced in trusted.

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

`applyDecorators` produces a `SlotValue` synchronously. `render.tsx` serializes it with `serializeAstroComponentMarkers` (factory → `moduleId` marker) and sends it on the `node` field of the render request, keeping `component`/`args`/`slots` populated with the undecorated story for backward compatibility. The handler resolves the root exactly like a slot value — depth-first, trusted splice for server-rendered HTML, sanitization for user-authored strings, `MAX_DEPTH = 10`. The story node's props run through the full top-level arg pipeline (`reconstructProps`, `processImageMetadata`, `reviveDateStrings`, arg-level sanitization) wherever the story sits in the tree, rather than the lighter slot-descriptor prop handling.

### Framework component stories

Handled entirely by the delegated framework renderer with default Storybook composition; users write decorators in that framework's native style (JSX for React, etc.). No Astro-specific code path — but see [Framework delegation](#framework-delegation).

### Explicitly out of scope

- **Framework components as decorators on Astro stories.** Wrap framework-context concerns (e.g. a React `ThemeProvider`) inside the decorator's Astro component as an island.
- **Reactive / runtime decorators.** Astro is SSR-first; decorators run at render time. Interactive wrapper behavior belongs in the decorator component's own `<script>` or islands.

## Coverage

Where each part of the contract is implemented and tested. Source comments cite these anchors.

### Framework delegation

Stories with `parameters.renderer` compose through `defaultDecorateStory` and apply via `typedRenderers[renderer].renderToCanvas`.

`defaultDecorateStory` is **not** fully equivalent to each framework's own composition. React's JSX decorators work, but Vue's documented `(story) => ({ components: { story }, template })` shape depends on `@storybook/vue3`'s own `decorateStory` normalization and renders as stringified function text under generic composition. **Vue decorators must use the render-function form** `(story) => () => h('div', attrs, [h(story())])` — see `integration/*/.storybook/preview.js`.

**Files**: `integration/{astro5,astro6,astro7}/.storybook/preview.js`, `packages/components/src/Counter/{react,vue}/Counter.stories.js`, `integration/*/src/components/Counter/Decorators.test.ts`.

### Renderer composition

`packages/@storybook-astro/renderer/src/decorators.ts` — virtual-module-free so Node test processes and the framework package can import it directly (the `preview-defaults.ts` pattern, which `definePreview` merges the same way).

- `applyDecorators(storyFn, decorators)` builds both compositions and routes at call time.
- The `Story` thunk returns a handle carrying the inner renderable; `toString()` emits a per-render placeholder token. A decorator returning a string containing the token is split into the array form `[before, inner, after]` — the token never leaves the client.
- All three decorator shapes normalize here, including auto default slot and bare-component sugar (detected via `isAstroComponentFactory`).
- Exported from `entry-preview.ts`; composed into CSF4 by `definePreview` in `framework/src/index.ts`.

### Wire protocol

`RenderComponentInput` carries an optional serialized root node (`node?: SlotValue`). `component`/`args`/`slots` stay populated with the root story, so an older server renders the story undecorated rather than erroring — see the version-skew note in [Known Limitations](#known-limitations).

`renderToCanvas` recognizes a renderable tree (not just a bare factory) and sends one request. `astroRenderHandler.ts` resolves `node` through `resolveSlotValue` inside the render-queue/rules scope, validates node shape at the boundary, and applies the full arg pipeline to the story node. Dev middleware and the HTTP server need no transport changes — the payload passes through as JSON.

### Static prerender

`vitePluginAstroBuildPrerender.ts` / `productionRenderRuntime.ts` load the project's `.storybook/preview.*` through the SSR Vite server, compose each Astro story with `composeStory`, call it to get the tree, and resolve it with the handler the runtime already owns. `@storybook-astro/renderer/entry-preview` is stubbed in the prerender SSR server (aliased to the virtual-module-free decorators module) so `definePreview`'s eager renderer import doesn't pull browser-only virtual modules into Node. Decorators read `initialGlobals` at build time. Stories whose composition fails are skipped and logged.

### Server snapshot

`vitePluginAstroBuildServer.ts` must get decorator components referenced only from `preview.js` into the snapshot and `componentPathMap`. The snapshot covers story components plus their local import closure, with a verbatim-original-path fallback (`resolveSnapshotComponentPath` in `server/index.ts`) that only works when the original project is on the same disk. `vitePluginAstroComponentMarker` transforms every client-imported `.astro` file and knows its module id; those ids are recorded during the iframe build and fed into the snapshot copy and path map. The same gap affects components referenced only via slot/prop markers from a story file, so this covers both.

### Portable stories

`framework/src/portable-stories.ts` merges `applyDecorators` into project annotations alongside `render`, for both `composeStory` and `composeStories`. `framework/src/testing/astro-runtime.ts` is decorator-aware: when a composed story produces a renderable tree it goes through `renderViaTestingRendererDaemon` / the in-worker handler instead of short-circuiting to `meta.component`. Undecorated stories keep the fast path.

### Global decorators

Cross-app coverage of every authoring position and mode. `integration/{astro5,astro6,astro7}` each declare a real global Astro decorator (`GlobalWrapper.astro`, guarded on `parameters.renderer === 'astro'`) plus React/Vue global decorators that pass through for Astro stories. `packages/components/src/Decorator/` holds the shared examples: component-level, story-level, two-decorator chain, HTML-string, named-slot, and bare-component shapes. `integration/{astro5,astro6,astro7}-server` verify a decorated story in server-mode builds. CSF4 `definePreview` decorators are covered by `framework/src/csf4-decorators.test.ts`.

## Known Limitations

- Decorators on Astro stories produce SSR output only; decorator props can read `context` (globals, args, parameters) at render time but cannot react to client-side state changes. In **static** builds, decorators see `initialGlobals` frozen at build time — toolbar changes will not re-render prerendered stories.
- Component wrappers must be Astro components; framework wrappers (e.g. React `ThemeProvider`) go inside the decorator's Astro component as an island.
- HTML-string decorators are sanitized in server mode under the project's sanitization config. The **default allowlist** (`lib/sanitization.ts`) has no `<nav>`, `<aside>`, `<header>`, or `<footer>`, and no `data-*` attributes on any tag — wrapper markup should stick to `<div>`/`<span>` with `class`/`id`, or use a component descriptor when richer markup is needed.
- Version skew: a new renderer talking to an old framework server renders stories undecorated (graceful, but silent — upgrade both packages together).
- CSF4 (`definePreview`) portable-stories caveats, confirmed against Storybook 10.5.2: `composeStory` (singular) must be called with the CSF4 story's `meta.input` — not the `meta` wrapper object — as its component annotations argument; passing `meta` throws "component annotation is missing from the default export". The CSF4 story's own `.run()` isn't a Node-testable alternative either — it always renders through `definePreview`'s production `render`, which needs a browser.
- `setProjectAnnotations` was previously **silently ignored** by `composeStories`/`composeStory` in `portable-stories.ts` — both hardcoded (or defaulted to) an empty `defaultConfig` object, blocking Storybook's own `?? globalThis.globalProjectAnnotations` fallback. Fixed by passing `undefined` instead of `{}`.

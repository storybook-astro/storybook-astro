# Decorator Support

## Problem Statement

Storybook's [decorator](https://storybook.js.org/docs/writing-stories/decorators) API lets users wrap stories with layout, context providers, or other surrounding markup. Decorators can be defined globally (in `.storybook/preview.js`), at the component level (in the story file's `default` export), or at the story level.

Users of Storybook Astro have reported that decorators do not work — neither at the story level nor globally — for both Astro component stories and framework component stories (React, Vue, etc.).

**Reference**: [Issue #40 — Unable to use decorators](https://github.com/storybook-astro/storybook-astro/issues/40)

## Current State

### How Storybook composes decorators

`storybook/internal/preview-api` composes decorators into the story function (`storyFn`) before `renderToCanvas` is called. Composition is synchronous and renderer-agnostic: each decorator is invoked as `decorator(Story, context)`, where `Story` is a thunk that, when called, returns whatever the inner decorator (or the renderer's `render()`) returns. The pipeline does not constrain or interpret the return type — the renderer does.

### Framework component stories (React, Vue, Svelte, etc.)

For stories using `parameters.renderer: 'react'` (or other frameworks), `renderToCanvas` delegates to the framework renderer:

```ts
// render.tsx
if (renderer && Object.hasOwn(typedRenderers, renderer)) {
  showMain();
  await typedRenderers[renderer].renderToCanvas(ctx, canvasElement);
  return;
}
```

The framework renderer calls `ctx.storyFn()` internally. Because Storybook has already composed decorators into `storyFn`, decorators written in the framework's native format should work through this path — but this is currently **untested and undocumented**.

### Astro component stories — the structural problem

For Astro stories, the renderer's `render()` returns an `AstroComponentFactory`. SSR via the Astro Container API happens later, in `renderAstroToCanvas`. This means a decorator written in the obvious "string template" style does **not** work:

```js
// BROKEN: Story() returns an AstroComponentFactory (a function), not HTML.
(Story) => `<div class="wrapper">${Story()}</div>`
// Renders: <div class="wrapper">function () {...}</div>
```

To make decorators work for Astro stories, the decorator return value has to be something the renderer can resolve to HTML at SSR time. There is currently no defined contract for this.

## Design Considerations

Storybook's existing renderers offer four precedents:

| Renderer | Decorator shape | UX | Maintenance |
|---|---|---|---|
| **Svelte CSF** | Native Svelte components, parsed from `.stories.svelte` | High | High — custom `DecoratorHandler.svelte` and a custom CSF parser |
| **Vue 3** | Function returning a component options object or render function | Medium-high | Low — plain JS, standard Vue shapes |
| **React** | Function returning JSX (HOC pattern) | High (in React) | Very low — natural to JSX |
| **HTML** | Function returning a string or DOM node | Low | Very low |

The Storybook engineering team has indicated a preference for "native" syntax (better UX) but acknowledges higher maintenance, and has invited us to a contributor office hour to discuss the choice. The Nuxt community addon is also exploring a native-syntax approach.

For Astro, **native** in this context means: the decorator is an Astro component (`Wrapper.astro`) with a `<slot />` for the inner story. This is achievable cheaply because:

- Astro's compiler already handles parsing — we don't need a custom CSF format the way Svelte CSF does.
- Astro Container's `renderToString(Component, { props, slots })` already accepts HTML strings for slots, so passing inner-rendered HTML into an outer decorator component is a one-line operation.

The proposed primary contract is therefore Vue-shaped (function returning a descriptor) but with Astro components as the descriptor's payload — getting native UX without Svelte-CSF-level maintenance.

## Proposed Decorator Contract

### Primary: function returning an Astro component descriptor

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

The renderer renders the inner story to HTML, then renders `Wrapper` with the inner HTML supplied as the `default` slot. Named slots are supported via `slots: { sidebar: <Renderable> }` on the descriptor.

### Composition across multiple decorators

Because composition is synchronous and SSR is async, decorators do not call `await Story()`. Instead, calling `Story()` returns a **renderable descriptor** — a sync, normalized intermediate value. The renderer resolves the entire descriptor tree to HTML in a single async pass after `storyFn()` returns:

```ts
type Renderable =
  | AstroComponentFactory                                    // bare component, no decorators
  | { component: AstroComponentFactory; props?: object;
      slots?: Record<string, Renderable | string> };         // wrapped component
```

A two-decorator chain naturally composes: each decorator's `Story()` returns whatever the inner decorator returned, and the outer wraps it by placing it in `slots.default`. The renderer then walks the tree inner-to-outer, calling Astro Container at each level and threading the resulting HTML up as a slot string to the next level.

### Fallbacks

- **Bare Astro component as decorator value** — sugar for `(Story) => ({ component: Wrapper, slots: { default: Story() } })`. Detected because Astro component factories carry `isAstroComponentFactory`.
- **Framework component stories** — handled entirely by the delegated framework renderer; users write decorators in that framework's native style. Documented but no Astro-specific code path.

### Explicitly out of scope (for now)

- **HTML-string decorators**. Supporting `(Story) => string` cleanly requires either pre-rendering the inner story (forces every storyFn to be async, which Storybook's pipeline does not currently model) or an async `Story()` thunk (decorator pipeline is sync). Both options are invasive for marginal benefit — the Astro-component descriptor form covers all real wrapping cases. Revisit if user demand emerges.
- **Reactive / runtime decorators** — Astro is SSR-first; decorators run at render time only. Interactive wrapper behavior should be implemented inside the decorator's Astro component using its own `<script>` or framework islands.

## Implementation Plan

### Step 0 — Validate the contract with Storybook contributors

Attend a contributor office hour. Walk through the proposed contract, the trade space (vs. Svelte CSF, Vue, Nuxt's in-progress approach), and the "renderable descriptor" composition model. Adjust before implementation if precedents we don't yet know about argue for a different shape.

**Exit criteria**: rough alignment from at least one Storybook maintainer, or an explicit decision to diverge with documented rationale.

### Step 1 — Verify and lock down framework decorator delegation

Add story-level and global decorators for React and Vue framework component stories in both integration apps. Confirm they apply correctly through the existing `typedRenderers[renderer].renderToCanvas` delegation. Add a Vitest test per framework that asserts a decorator wrapper appears in rendered output.

If broken: investigate the `virtual:storybook-renderer-fallback` resolution path before touching anything else — this should work today.

**Files**:
- `integration/astro5/.storybook/preview.js`, `integration/astro6/.storybook/preview.js`
- A React and a Vue story file in each integration app, with decorators
- Vitest tests using `composeStories` + `renderStory`

### Step 2 — Introduce the renderable descriptor

In `packages/@storybook-astro/renderer/src/render.tsx`, define the `Renderable` union and a single `resolveRenderable(r): Promise<string>` function. It handles:

1. Bare `AstroComponentFactory` — render via Astro Container, return HTML.
2. `{ component, props, slots }` descriptor — recursively resolve each slot to an HTML string, then render `component` with those slot strings.
3. (Internal only) string passthrough, used when resolving slots.

`renderAstroToCanvas` becomes: `canvasElement.innerHTML = await resolveRenderable(storyFn())`.

This is the single architectural change. Everything else is documentation and tests.

**Files**:
- `packages/@storybook-astro/renderer/src/render.tsx` — restructure `renderAstroToCanvas`
- `packages/@storybook-astro/framework/src/middleware.ts` — confirm Container's `slots` map accepts strings (it does); no change expected
- `packages/@storybook-astro/renderer/src/types.ts` — export `Renderable` and `AstroDecoratorDescriptor` types

### Step 3 — Integration test stories with decorators

Add concrete examples in both integration apps:

- Global decorator (`Wrapper.astro` with theme class) wired in `preview.js`.
- Component-level decorator on an Astro story.
- Story-level decorator that reads `context.globals` and passes a prop.
- A two-decorator chain to exercise composition.
- A React decorator on a React story (regression coverage from Step 1).

Each gets a Vitest test asserting the wrapper markup is present.

**Files**:
- `integration/astro5/.storybook/Wrapper.astro`, `integration/astro6/.storybook/Wrapper.astro`
- `integration/{astro5,astro6}/.storybook/preview.js`
- One Astro story file and one React story file per integration app
- Matching `*.test.ts` files

### Step 4 — Document

Add `apps/website/src/content/docs/writing-stories/decorators.md`:

- Conceptual overview: where decorators run, sync composition + async resolution.
- Astro decorator authoring (Astro component + descriptor function).
- Framework decorators on framework stories (React, Vue, Svelte, etc.) — write them in the framework's native style; Storybook handles the rest.
- Globals/args access via the descriptor function's `context` argument.
- Limitations (see below).

## Known Limitations

- Decorators on Astro stories must be Astro components, not framework components or HTML strings. Wrap framework-context concerns (e.g. a React `ThemeProvider`) inside an Astro island within the decorator.
- Decorator props can read `context` (globals, args, parameters) at render time, but cannot react to client-side state changes — Astro is SSR-first.
- Slot content other than `default` requires explicit named slots in both the decorator's Astro template and the descriptor's `slots` map.

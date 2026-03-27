# Decorator Support

## Problem Statement

Storybook's [decorator](https://storybook.js.org/docs/writing-stories/decorators) API lets users wrap stories with layout, context providers, or other surrounding markup. Decorators can be defined globally (in `.storybook/preview.js`), at the component level (in the story file's `default` export), or at the story level.

Users of Storybook Astro have reported that decorators do not work — neither at the story level nor globally — for both Astro component stories and framework component stories (React, Vue, etc.).

**Reference**: [Issue #40 — Unable to use decorators](https://github.com/storybook-astro/storybook-astro/issues/40)

## Current State

### How Storybook applies decorators

Storybook's `preview-api` composes decorators into the story function (`storyFn`) before `renderToCanvas` is called. By the time our renderer's `renderToCanvas` runs, `ctx.storyFn` is already a composed function that, when called, returns the outermost decorator's output wrapping the inner story result.

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

The framework renderer calls `ctx.storyFn()` internally. Since Storybook has already composed decorators into `storyFn`, decorators written in the framework's native format (e.g. React JSX decorators for React stories) should work through this path — but this is **untested and undocumented**.

### Astro component stories

For Astro component stories, `renderToCanvas` calls `storyFn()` directly:

```ts
// render.tsx line 107
const element = storyFn();
```

Storybook composes decorators into `storyFn`, so the composed function calls the decorator chain. Each decorator receives the inner `storyFn` and is expected to wrap and return the result. But what should a decorator *return* for an Astro component?

- If a decorator returns a React element wrapping the Astro component, `renderToCanvas` can't handle it — it's not an Astro component, string, or DOM node.
- There is currently no defined decorator contract for the Astro SSR path.
- No examples exist in the integration apps.

## Implementation Plan

### Step 1 — Verify framework decorator path

Add story-level and global decorators to the integration apps for React and Vue component stories. Run Storybook manually to confirm that `typedRenderers[renderer].renderToCanvas(ctx, canvasElement)` correctly applies composed decorators.

If working: document the pattern and close the framework decorator part of the issue.
If broken: investigate the delegation path and `virtual:storybook-renderer-fallback` module resolution.

**Files to touch**:
- `integration/astro5/.storybook/preview.js`
- `integration/astro6/.storybook/preview.js`
- A React or Vue story file in each integration app

### Step 2 — Define an HTML string decorator contract for Astro stories

Define a decorator contract for Astro component stories: decorators should return an **HTML string** that wraps the SSR-rendered output of the inner story. The inner story's HTML is passed to the decorator as the result of calling `Story()`.

Proposed contract:

```js
// .storybook/preview.js
export const decorators = [
  (Story) => `<div class="padded-wrapper">${Story()}</div>`,
];
```

To support this, `renderAstroToCanvas` in `render.tsx` needs to be restructured so that:

1. The Astro component is rendered to an HTML string first.
2. Any decorators from `storyContext.decorators` that return strings are applied around that HTML string, outer-to-inner.
3. The final HTML string is set as `canvasElement.innerHTML`.

This avoids restructuring how Storybook composes decorators — it's a post-SSR HTML wrapping step that runs after `astroRenderer.render(...)`.

**Files to touch**:
- `packages/@storybook-astro/renderer/src/render.tsx` — restructure `renderAstroToCanvas` to accept and apply HTML string decorators after SSR

### Step 3 — Add integration test stories with decorators

Add concrete decorator examples to both integration apps:

- **Global decorator** in `preview.js`: adds a layout wrapper `<div>` with padding
- **Story-level decorator**: adds a background or theme class
- **React decorator** on a React component story: `(Story) => <ThemeProvider><Story /></ThemeProvider>`

These serve as both regression tests and usage examples.

**Files to touch**:
- `integration/astro5/.storybook/preview.js`
- `integration/astro6/.storybook/preview.js`
- One or more story files in each integration app

### Step 4 — Document decorator patterns

Add a `decorators.md` guide under `apps/website/src/content/docs/writing-stories/` covering:

- How decorators work for framework component stories (React, Vue, etc.)
- How to write Astro-compatible HTML string decorators
- Global vs. component-level vs. story-level decorator scoping
- Limitations: Astro decorators must return HTML strings; JSX decorators are not supported for Astro stories

## Known Limitations

- Decorators for Astro stories cannot return JSX or framework component trees — only HTML strings are supported in the SSR path.
- Decorators that need access to a framework's runtime (e.g. a React context provider) must be used on framework component stories with the appropriate `parameters.renderer` set.
- Interactive client-side decorator behavior (e.g. event handlers in a wrapper) is not supported in the Astro SSR path.

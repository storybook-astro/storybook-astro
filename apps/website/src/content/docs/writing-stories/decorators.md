---
title: Decorators
description: Wrap Astro and framework component stories with layout, theming, or context using Storybook's decorator API.
---

Storybook's [decorator](https://storybook.js.org/docs/writing-stories/decorators) API wraps a story with layout, theme providers, or other surrounding markup. Decorators can be set globally (`.storybook/preview.js`), at the component level (a story file's default export), or at the story level — all three positions work for both Astro component stories and framework component stories (React, Vue, etc.).

## Decorator shapes (Astro stories)

Astro decorators run server-side as part of the same SSR pass that renders the story, so a decorator returns a description of the wrapper rather than any rendered markup. There are three shapes.

### Component descriptor

The primary form — a decorator function returns `{ component, props?, slots? }`:

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

If the descriptor never sets `slots.default`, the inner story is placed there automatically — you don't need to call `Story()` at all. To place the story in a specific slot alongside other content, set `slots` explicitly:

```js
(Story) => ({
  component: Layout,
  slots: { default: Story(), sidebar: '<nav>…</nav>' },
});
```

### HTML string

The "obvious" syntax also works — build a string around `Story()`:

```js
(Story) => `<div class="dark-background">${Story()}</div>`;
```

`Story()` doesn't return real markup (there's nothing to render yet at composition time) — it returns a placeholder that gets swapped back out for the story's rendered tree once composition finishes. You never see the placeholder; write the template literal as if `Story()` were the final HTML.

### Bare component

A decorator entry can be the Astro component itself, with no wrapping function — sugar for the descriptor form with the story in the default slot:

```js
export const decorators = [Wrapper];
```

## Authoring positions

Decorators compose the same way regardless of where they're set:

```js
// .storybook/preview.js — applies to every story in the project
export const decorators = [(Story) => ({ component: Wrapper })];
```

```jsx
// Card.stories.jsx — applies to every story in this file
export default {
  title: 'Components/Card',
  component: Card,
  decorators: [(Story) => ({ component: Wrapper })],
};
```

```jsx
// applies to just this one story
export const Decorated = {
  decorators: [(Story) => ({ component: Wrapper, props: { label: 'Story-level' } })],
};
```

## Composition model

- **Sync composition, one SSR pass.** Decorators run synchronously to build a tree describing the wrapped story; the whole tree — story plus every decorator's descriptor — is resolved server-side in a single render request, using the same machinery that resolves [configured-component slots](/writing-stories/slots/#passing-a-configured-component-with-its-own-props-and-slots). There's no extra round trip per decorator.
- **Last decorator is outermost.** With multiple decorators, they nest inside-out: the first entry wraps the story directly, and each later entry wraps everything decided so far.

```js
export const TwoDecoratorChain = {
  decorators: [
    (Story) => ({ component: Wrapper, props: { label: 'Inner' } }),
    (Story) => ({ component: Wrapper, props: { label: 'Outer' } }),
  ],
};
// Renders: Outer > Inner > story
```

- **Context and globals.** A decorator function receives `(Story, context)`, same as any Storybook decorator — `context.globals`, `context.args`, and `context.parameters` are all available when building the descriptor's `props`.

## Framework story decorators

Stories with `parameters.renderer` set (React, Vue, Svelte, etc.) are delegated entirely to that framework's own renderer, so decorators for those stories should be written in the framework's native style — plain JSX for React, for example.

:::caution
**Vue is the one exception.** Vue 3's documented decorator shape — `(story) => ({ components: { story }, template })` — depends on `@storybook/vue3`'s own decorator normalization, which this project doesn't route framework stories through (Astro stories need their own composition, so all framework stories go through Storybook's generic decorator composition instead). Under that generic composition, the `{ components, template }` descriptor doesn't get interpreted as a Vue component — it renders as stringified function text.

Use the render-function form instead, which composes correctly either way:

```js
const wrapVueStoryInGlobalDecorator = (story, ctx) => {
  return () => h('div', { class: 'wrapper' }, [h(story())]);
};
```
:::

## Per-mode behavior

| Mode | Behavior |
|---|---|
| **Dev** | Decorators re-run on every render, so `context.globals` (e.g. a theme toolbar) updates the wrapper live. |
| **Server** | Same as dev — the decorated tree is resolved on each request against the deployed snapshot. |
| **Static** | Decorators run once at **build time**. Whatever `context.globals` resolves to then (the story's `initialGlobals`) is frozen into the prerendered HTML — toggling a toolbar control in a static build does not re-render the decorator or the story. |

## Limitations

- **HTML-string decorators are sanitized.** Wrapper markup you write as a string goes through the project's [sanitization](/guides/sanitization/) config, same as any string slot content. The default allowlist has no `<nav>`, `<aside>`, `<header>`, or `<footer>`, and no `data-*` attributes on any tag — stick to `<div>`/`<span>` with `class`/`id` for decorator wrapper markup, or use a component descriptor instead of a string.
- **No framework components as decorators on Astro stories.** A decorator wrapping an Astro story must itself be an Astro component. To use framework-specific context (e.g. a React `ThemeProvider`), wrap it inside the decorator's Astro component as a client island.
- **No reactive/runtime decorators.** Astro is SSR-first — a decorator's wrapper is whatever it rendered at request time (or build time, in static mode). Interactive behavior belongs in the decorator component's own `<script>` or islands, not in the decorator function itself.
- **Version skew.** An updated renderer talking to an old, un-upgraded framework server package renders the story **undecorated** rather than erroring — the old server doesn't know about the decorated-tree field on the render request and just falls back to the plain story. This fails silently, so upgrade `@storybook-astro/renderer` and `@storybook-astro/framework` together.
- **CSF4 caveats.** With `definePreview`, `composeStory` (portable stories) needs the CSF4 story's `meta.input` — not the `meta` object itself — as its component annotations argument. Calling the CSF4 story's own `.run()` isn't a Node-testable alternative either; it always renders through the production `render`, which needs a browser.

## See also

- [Slots](/writing-stories/slots/) — decorators are built on the same configured-component machinery that resolves slot trees, so the mental model (descriptors, arrays, sanitization boundaries) carries over directly.

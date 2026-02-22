---
title: Framework Integration
description: How Storybook Astro lets Astro and UI framework components work together.
---

Storybook Astro supports rendering components from React, Vue, Svelte, Preact, Solid, and Alpine.js alongside native Astro components. Each framework is handled by an integration adapter.

## Integration architecture

Each integration extends the `BaseIntegration` class and implements four methods:

- **`getAstroRenderer()`** — Returns the Astro framework integration (e.g. `@astrojs/react`)
- **`getVitePlugins()`** — Returns Vite plugins needed for the framework (e.g. `@vitejs/plugin-react`)
- **`getStorybookRenderer()`** — Returns the Storybook renderer name (e.g. `@storybook/react`)
- **`resolveClient(specifier)`** — Handles client-side module resolution if needed

Integration files live in `packages/@storybook-astro/framework/src/integrations/`.

## The `include` pattern

Most integrations accept an `include` option — a glob pattern that tells Vite which files to process with the framework's compiler:

```javascript
react({ include: ['**/react/**'] })
solid({ include: ['**/solid/**'] })
```

:::caution
Use recursive globs (`**`) in `include` patterns. A non-recursive glob like `**/solid/*` won't match files in subdirectories (e.g. `solid/Counter/Counter.tsx`), causing them to be compiled by the wrong framework plugin. This can result in blank renders or React element errors in other frameworks.
:::

## How delegation works

When a story sets `parameters.renderer`, the render pipeline changes:

1. The renderer (`render.tsx`) checks `parameters.renderer` on the story
2. Instead of routing through the Astro Container API, it delegates to the specified framework's `renderToCanvas` function
3. The framework renderer manages its own reactive root and lifecycle
4. `storyFn()` is called *after* delegation — this ordering is critical for frameworks like Solid that manage their own reactive roots

## Virtual modules

The framework integration system uses two virtual modules:

- **`virtual:astro-container-renderers`** — Provides an `addRenderers` function to register framework renderers with the Astro Container
- **`virtual:storybook-renderer-fallback`** — Provides framework renderers for client-side delegation

## Adding a new framework

To add a new framework integration:

1. Create an integration file in `packages/@storybook-astro/framework/src/integrations/`
2. Extend `BaseIntegration` and implement the required methods
3. Export a factory function in `integrations/index.ts`
4. Install the corresponding Astro integration, Vite plugin, and Storybook renderer packages

See the existing integrations (e.g. `react.ts`, `vue.ts`) for reference implementations.

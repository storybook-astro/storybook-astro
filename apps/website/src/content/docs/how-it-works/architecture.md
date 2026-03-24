---
title: Architecture
description: How the Storybook Astro framework is structured internally.
---

Storybook Astro consists of two packages that work together to render Astro components in Storybook.

## Two-package system

### `@storybook-astro/framework` (Server/Framework)

The core framework implementation that integrates Astro with Storybook's build system:

- **Vite Plugin Integration** — Configures Vite to handle `.astro` components during the Storybook build
- **Middleware Handler** — Sets up an Astro Container that renders components server-side on demand
- **Framework Integrations** — Manages UI framework renderers so Astro and framework components can be rendered in the same Storybook
- **Module Resolution** — Handles special module resolution for Astro's runtime

**Key files:**
- `src/preset.ts` — Storybook framework configuration and Vite setup
- `src/middleware.ts` — Astro Container setup and SSR handler, includes `patchCreateAstroCompat` for compiler bridging
- `src/integrations/` — Integration adapters for each supported framework
- `src/viteStorybookAstroMiddlewarePlugin.ts` — Vite plugin for handling render requests (dev)
- `src/vitePluginAstroBuildPrerender.ts` — Pre-renders Astro stories at build time
- `src/vitePluginAstroComponentMarker.ts` — Patches Astro 6's client-side `.astro` stubs
- `src/vitePluginAstroFontsFallback.ts` — Stubs Astro 6's font virtual modules
- `src/portable-stories.ts` — `composeStories`/`composeStory` for testing

### `@storybook-astro/renderer` (Client)

> This package is automatically installed as a dependency of `@storybook-astro/framework` — no separate installation is needed.

The client-side rendering package that manages how components display in Storybook's preview:

- **Render Function** — Determines how to render different component types
- **Communication Layer** — Sends render requests from the browser to the Astro middleware via Vite's HMR channel
- **Fallback Rendering** — Delegates to framework-specific renderers when `parameters.renderer` is specified
- **Style Management** — Handles Astro's scoped styles and HMR updates
- **Script Execution** — Manages client-side scripts and hydration

**Key files:**
- `src/render.tsx` — Main rendering logic and Canvas integration
- `src/preset.ts` — Client-side preview annotations

## Data flow

### Astro components (server-side rendered)

```
Story File (.stories.jsx)
    ↓
@storybook-astro/renderer (render.tsx)
    ↓ [detects isAstroComponentFactory flag]
    ↓ [sends render request via Vite HMR]
@storybook-astro/framework (middleware.ts)
    ↓ [patchCreateAstroCompat wraps component]
    ↓ [Astro Container API renders to HTML]
@storybook-astro/renderer (render.tsx)
    ↓ [injects HTML into canvas]
    ↓ [applies scoped styles, executes client scripts]
Storybook Canvas (rendered component)
```

### Framework components (delegated)

```
Story File (.stories.jsx)
    ↓
@storybook-astro/renderer (render.tsx)
    ↓ [checks parameters.renderer]
    ↓ [delegates to framework renderToCanvas BEFORE calling storyFn()]
Framework Renderer (e.g. @storybook/react-vite)
    ↓ [manages its own reactive root]
Storybook Canvas (rendered component)
```

## Component detection

Astro components are identified by the `isAstroComponentFactory` flag:

```typescript
if (Component.isAstroComponentFactory) {
  // Route to server-side rendering via Astro Container
}
```

In Astro 6, the client-side Vite transform no longer sets this flag. The `vitePluginAstroComponentMarker` plugin patches the stub to restore it. See [Astro 6 Compatibility](/how-it-works/astro6-compat/) for details.

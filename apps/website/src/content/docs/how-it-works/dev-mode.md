---
title: Dev Mode Rendering
description: How Storybook Astro renders components during development.
---

In dev mode (`storybook dev`), Astro components are rendered on-demand through a request cycle between the browser and the Vite dev server.

## Step-by-step flow

1. **Story definition** — Stories import Astro components and define variations with different props and slots.

2. **Component detection** — The renderer checks imported components for the `isAstroComponentFactory` flag to identify Astro components.

3. **Server rendering** — When an Astro component is detected, a render request is sent to the Vite dev server middleware via HMR (Hot Module Replacement).

4. **Container rendering** — The middleware uses Astro's Container API to render the component with the provided props and slots. The `patchCreateAstroCompat` wrapper bridges the Astro compiler v2/v3 calling convention difference.

5. **HTML injection** — The rendered HTML string is sent back to the client and injected into Storybook's canvas.

6. **Hydration** — Client-side scripts are re-executed to add interactivity. This handles framework islands (e.g. React components inside Astro with `client:load`) and Alpine.js directives.

7. **Style application** — The rendered HTML is preceded by `<style>` elements holding the scoped CSS Astro compiled for every component the story rendered, one per `<style>` block, so styles are scoped the way Astro scopes them. The renderer moves them into the preview's `<head>` before injecting the HTML, and removes them, along with the story's markup, when Storybook removes the story.

8. **Framework delegation** — For non-Astro framework components (React, Solid, Vue, etc.), the renderer delegates directly to the framework-specific `renderToCanvas` *before* calling `storyFn()`. This ordering is critical — it lets reactive frameworks like Solid manage their own rendering lifecycle without orphaned effects.

9. **HMR updates** — Changes to components trigger re-renders. The Vite HMR event listeners in `render.tsx` handle updates while preserving state when possible.

## The Vite HMR channel

Communication between the browser and server uses Vite's built-in HMR channel:

- **Client side** (`render.tsx`): Sends `astro:render:request` events with the component module ID, props, and slots
- **Server side** (`viteStorybookAstroMiddlewarePlugin.ts`): Listens for requests, invokes the Container API, and responds with `astro:render:response` containing the rendered HTML

This approach avoids additional HTTP endpoints and reuses Vite's existing WebSocket connection.

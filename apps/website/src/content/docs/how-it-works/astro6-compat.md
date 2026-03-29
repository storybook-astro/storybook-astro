---
title: Astro Compatibility
description: The compatibility layers that enable Storybook Astro to work with Astro 6.
---

Storybook Astro includes compatibility layers to handle differences between Astro versions and maintain consistent component rendering across the ecosystem.

## 1. Component detection — `vitePluginAstroComponentMarker`

**Problem:** In Astro 6, the client-side Vite transform of `.astro` files produces a stub that throws "Astro components cannot be used in the browser" — without setting the `isAstroComponentFactory` marker that the renderer uses to identify Astro components.

**Solution:** A post-transform Vite plugin detects the Astro 6 stub pattern and replaces it with a version that sets `isAstroComponentFactory = true` and preserves the `moduleId` for the server render request.

## 2. Props passing — `patchCreateAstroCompat`

**Problem:** The Astro compiler v2 generates `result.createAstro($$Astro, $$props, $$slots)` (3 args), but the Astro 6 runtime expects `result.createAstro($$props, $$slots)` (2 args). When v2-compiled components run against the v6 runtime, `$$Astro` is captured as "props" and actual props are lost.

**Solution:** `patchCreateAstroCompat()` in `middleware.ts` wraps the component factory and intercepts `createAstro` calls. If 3 arguments are detected, it strips the leading `$$Astro` argument.

## 3. Scoped CSS — `vitePluginAstroComponentMarker`

**Problem:** Astro 6's client-side transform no longer includes `<style>` block imports. Storybook's preview iframe receives the component stub but none of the scoped CSS.

**Solution:** The component marker plugin reads the original `.astro` source, counts `<style>` blocks, and generates import statements for each style sub-module using Astro's convention: `Component.astro?astro&type=style&index=N&lang.css`. During builds, it extracts raw CSS directly from the source and inlines it.

## 4. Font virtual modules — `vitePluginAstroFontsFallback`

**Problem:** Astro 6's `astro:assets` module depends on font-related virtual modules (`virtual:astro:assets/fonts/runtime`, `virtual:astro:assets/fonts/internal`) and a bare `astro/assets/fonts/runtime` import. These fail to resolve in Storybook's SSR Vite server.

**Solution:** `vitePluginAstroFontsFallback.ts` stubs all three font module paths with no-op exports. Components render correctly but without Astro's font optimization.

## 5. Framework renderer delegation — `render.tsx`

**Problem:** In Astro 5, `renderToCanvas()` called `storyFn()` first, then delegated to framework renderers. In Astro 6, this created orphaned reactive effects for frameworks like Solid that manage their own rendering lifecycle.

**Solution:** `renderToCanvas()` now delegates to framework-specific renderers *before* calling `storyFn()`. This lets each framework manage its own reactive root without interference.

## 6. Image service injection — `middleware.ts`

**Problem:** Astro's `getConfiguredImageService()` calls `import("virtual:image-service")` to load the configured service. In Vite 7's module runner (used by Astro 6), this dynamic import fails with `InvalidImageService`. In Vite 6 (Astro 5), even when it succeeds, the noop service still routes through `/_image?href=...` URLs that the Storybook dev server does not serve reliably.

**Solution:** `handlerFactory()` in `middleware.ts` pre-populates `globalThis.astroAsset.imageService` with a custom inline service before creating the Astro Container. `getConfiguredImageService()` checks `globalThis.astroAsset.imageService` first and returns it directly, bypassing the dynamic import entirely. The inline service's `getURL()` returns the `/@fs/...` Vite URL from the `ImageMetadata` object, which Vite can serve as a static asset in the browser.

## 7. CJS module interop — `cjsInteropPlugin`

**Problem:** Vite 6's ESM module runner cannot evaluate raw CommonJS modules (e.g. `cssesc`, `cookie`, `react`). Several Astro 6 runtime dependencies are still CJS.

**Solution:** `cjsInteropPlugin()` from `@storybook-astro/framework/testing` auto-detects CJS modules and wraps them with ESM-compatible shims providing `module`, `exports`, `require`, `__dirname`, and `__filename`. It also redirects bare package imports to ESM entry points when available.

## Future outlook

These compatibility layers can be simplified or removed as Astro evolves:

- **Component marker** — Can be removed if Astro reintroduces `isAstroComponentFactory` in client-side transforms
- **Props patching** — Can be removed once the compiler is updated to match the runtime calling convention
- **Font fallback** — Can be removed if Astro's font plugin handles the Storybook SSR context
- **Image service injection** — Can be removed if Astro exposes an image service configuration API for the Container, or if `virtual:image-service` resolves correctly in all Vite contexts
- **CJS interop** — May be simplified as dependencies migrate to ESM

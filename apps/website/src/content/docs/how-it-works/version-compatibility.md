---
title: Version Compatibility
description: Supported Astro, Storybook, and Vite versions, and the compatibility layers that keep Storybook Astro working across Astro releases.
---

Storybook Astro tracks Astro's major releases and includes a small set of compatibility layers that absorb the differences between Astro versions, so the same framework package renders Astro 5, 6, and 7 components consistently.

## Supported versions

| Tool | Supported |
| --- | --- |
| **Astro** | 5.5.3+, 6.x, or 7.x |
| **Storybook** | 10.0.0+ |
| **Vite** | 6.4.1+ (required by Astro 5), 7.x, or 8.x |
| **Node.js** | 20.16.0+, 22.19.0+, or 24.0.0+ |

Each supported Astro major has a matching integration example in the repository (`integration/astro5`, `integration/astro6`, `integration/astro7`) plus a server-render variant, and every release is smoke-tested against all three majors.

### What changed in Astro 7

Astro 7 makes the Rust-based compiler the default (replacing the Go compiler) and upgrades to Vite 8 (with the Rolldown bundler). Both changes are handled transparently:

- The client-side `.astro` stub still throws the same "Astro components cannot be used in the browser" error the component marker keys off of, so component detection is unchanged (see layer 1 below).
- Vite 8 moves dependency-optimizer options from `esbuildOptions` to `rolldownOptions`; the framework writes whichever key the running Vite uses.

No configuration changes are required to move an existing Storybook Astro setup from Astro 6 to Astro 7.

## Compatibility layers

These layers live in `@storybook-astro/framework`. Each one solves a specific mismatch between what Astro emits and what Storybook's preview needs.

### 1. Component detection — `vitePluginAstroComponentMarker`

**Problem:** Since Astro 6, the client-side Vite transform of `.astro` files produces a stub that throws "Astro components cannot be used in the browser" — without setting the `isAstroComponentFactory` marker that the renderer uses to identify Astro components. Astro 7's Rust compiler emits the same stub.

**Solution:** A post-transform Vite plugin detects the stub pattern and replaces it with a version that sets `isAstroComponentFactory = true` and preserves the `moduleId` for the server render request. The single detection string covers Astro 5–7.

### 2. Props passing — `patchCreateAstroCompat`

**Problem:** Some Astro compiler outputs generate `result.createAstro($$Astro, $$props, $$slots)` (3 args) while the runtime expects `result.createAstro($$props, $$slots)` (2 args). When those disagree, `$$Astro` is captured as "props" and the real props are lost.

**Solution:** `patchCreateAstroCompat()` wraps the component factory and intercepts `createAstro` calls. It inspects the argument count at runtime and strips the leading `$$Astro` argument only when the runtime does not expect it, so it adapts to whichever calling convention the compiler produces.

### 3. Scoped CSS — `vitePluginAstroComponentMarker`

**Problem:** The client-side transform no longer includes `<style>` block imports, so Storybook's preview iframe receives the component stub but none of the scoped CSS.

**Solution:** The component marker plugin reads the original `.astro` source, counts `<style>` blocks, and generates import statements for each style sub-module using Astro's convention: `Component.astro?astro&type=style&index=N&lang.css`. During builds, it extracts raw CSS directly from the source and inlines it.

### 4. Fonts — `vitePluginAstroFonts`

**Problem:** Astro's Font Provider API (`astro:assets/fonts`) depends on font-related virtual modules that are not wired up in Storybook's SSR Vite server, so font CSS variables would be missing.

**Solution:** `vitePluginAstroFonts` resolves the Font Provider API in Storybook's SSR context and auto-loads the font families declared in your `astro.config.*`, exposing their CSS variables to rendered components. No mirror into `.storybook/main.js` is required.

### 5. Framework renderer delegation — `render.tsx`

**Problem:** Calling `storyFn()` before delegating to a framework renderer creates orphaned reactive effects for frameworks like Solid that manage their own rendering lifecycle.

**Solution:** `renderToCanvas()` delegates to framework-specific renderers *before* calling `storyFn()`, letting each framework manage its own reactive root without interference.

### 6. Image service injection — `middleware.ts`

**Problem:** Astro's `getConfiguredImageService()` calls `import("virtual:image-service")` to load the configured service. Under Vite's module runner this dynamic import fails with `InvalidImageService`, and even when it succeeds the noop service routes through `/_image?href=...` URLs the Storybook dev server does not serve reliably.

**Solution:** `handlerFactory()` pre-populates `globalThis.astroAsset.imageService` with a custom inline service before creating the Astro Container, bypassing the dynamic import entirely. The inline service's `getURL()` returns the `/@fs/...` Vite URL from the `ImageMetadata` object, which Vite serves as a static asset in the browser.

### 7. CJS module interop — `cjsInteropPlugin`

**Problem:** Vite's ESM module runner cannot evaluate raw CommonJS modules (e.g. `cssesc`, `cookie`, `react`), and several Astro runtime dependencies are still CJS.

**Solution:** `cjsInteropPlugin()` (from `@storybook-astro/framework/testing`) auto-detects CJS modules and wraps them with ESM-compatible shims providing `module`, `exports`, `require`, `__dirname`, and `__filename`. It also redirects bare package imports to ESM entry points when available.

## Future outlook

These layers can be simplified or removed as Astro evolves:

- **Component marker** — can be removed if a future Astro reintroduces `isAstroComponentFactory` in client-side transforms.
- **Props patching** — can be removed once every supported compiler matches the runtime calling convention.
- **Fonts** — can be simplified if Astro's font plugin handles the Storybook SSR context directly.
- **Image service injection** — can be removed if Astro exposes an image service configuration API for the Container, or if `virtual:image-service` resolves correctly in all Vite contexts.
- **CJS interop** — will shrink as dependencies migrate to ESM.

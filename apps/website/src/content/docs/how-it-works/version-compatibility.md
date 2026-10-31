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

Each supported Astro major has a matching integration example in the repository (`integration/astro5`, `integration/astro6`, `integration/astro7`) plus a server-render variant, and every release is smoke-tested against all three majors. A weekly CI job also runs the test suites against the newest release of each major, so new Astro minors are checked as they ship.

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

### 3. Scoped CSS — `lib/componentStyles.ts`

**Problem:** The client-side transform no longer includes `<style>` block imports, so Storybook's preview iframe receives the component stub but none of the scoped CSS. Astro versions also disagree on how to scope some selectors: Astro 7's compiler scopes nested selectors, while Astro 5 and 6 scope only the top-level one. Rewriting the CSS by hand can't match every version.

**Solution:** Every render goes through Astro's SSR Vite server, which compiles each component it loads, including a style sub-module for each `<style>` block (`Component.astro?astro&type=style&index=N&lang.css`). After a render, the framework walks that server's module graph from every component the story loaded, loads each style sub-module, and the stylesheets imported by those components and the modules they import (`import './card.css'`, Sass, CSS Modules), with Vite's `inline` query, as an Astro page ships them. It sends the compiled CSS ahead of the HTML, one `<style>` element per block or stylesheet, the way Astro's dev server ships them. Decorators' styles come before the story's, as a layout's come before a page's. The CSS carries the same `data-astro-cid-*` scope as the markup and is scoped the way the installed Astro compiler scopes it, in dev, static builds and server mode.

Preprocessed blocks such as `<style lang="scss">` work the same way: Astro compiles them with the project's own preprocessor (`sass` for SCSS) before scoping.

The SSR server reads integrations, `fonts`, `vite.plugins`, `scopedStyleStrategy` and `compressHTML` from `astro.config.*`. Other options, for example `markdown`, aren't read, so a component that depends on one can render differently than on a real page. The [Styling guide](/guides/styling/) lists what is picked up.

CSS Modules in framework components (React, Preact, Solid, …) need their class names to match between the prerendered HTML and the stylesheet the static build emits. Since Astro 7.4, Astro's dev-server config names CSS Module classes with a path-based hash, while builds keep Vite's default naming. Static builds prerender stories through a dev-style server, so that server drops Astro's naming to stay consistent with the built CSS. In dev, a component's CSS Modules ship by loading them again with an `inline` query, and the dev server ignores the `inline` query in Astro's naming function, so the shipped class names match the markup with Vite's default naming and with Astro's. They can still differ with a string `css.modules.generateScopedName` pattern or `css.transformer: 'lightningcss'` ([#242](https://github.com/storybook-astro/storybook-astro/issues/242)).

### 4. Fonts — `vitePluginAstroFonts`

**Problem:** Astro's Font Provider API (`astro:assets/fonts`) depends on font-related virtual modules that are not wired up in Storybook's SSR Vite server, so font CSS variables would be missing.

**Solution:** `vitePluginAstroFonts` resolves the Font Provider API in Storybook's SSR context and auto-loads the font families declared in your `astro.config.*`, exposing their CSS variables to rendered components. No mirror into `.storybook/main.js` is required. Since Astro 7.4, providers make their API requests through a `fetch` function passed to `init()`, which the plugin supplies.

### 5. Framework renderer delegation — `render.tsx`

**Problem:** Calling `storyFn()` before delegating to a framework renderer creates orphaned reactive effects for frameworks like Solid that manage their own rendering lifecycle.

**Solution:** `renderToCanvas()` delegates to framework-specific renderers *before* calling `storyFn()`, letting each framework manage its own reactive root without interference.

### 6. Image service injection — `astroImageService.ts`

**Problem:** Astro's `getConfiguredImageService()` calls `import("virtual:image-service")` to load the configured service. Under Vite's module runner this dynamic import fails with `InvalidImageService` on some versions (Astro 6 on Vite 7), and Astro's default services route through `/_image?href=...` URLs the Storybook dev server does not serve.

**Solution:** Storybook uses its own image service, whose `getURL()` returns the `/@fs/...` Vite URL from the `ImageMetadata` object, which Vite serves as a static asset in the browser (and which static builds rewrite to the emitted asset). It is installed two ways, because Astro changed how it looks the service up:

- **Astro 5 through 7.3** check `globalThis.astroAsset.imageService` before the dynamic import, so the render pipeline sets that global and the import never runs.
- **Astro 7.4+** ignore the global and only load the service through `virtual:image-service`. The Storybook SSR servers and the Vitest config pass the same service as `image.service.entrypoint` (`@storybook-astro/framework/image-service`), so that import loads it.

### 7. CJS module interop — `cjsInteropPlugin`

**Problem:** Vite's ESM module runner cannot evaluate raw CommonJS modules (e.g. `cssesc`, `cookie`, `react`), and several Astro runtime dependencies are still CJS.

**Solution:** `cjsInteropPlugin()` (from `@storybook-astro/framework/testing`) auto-detects CJS modules and wraps them with ESM-compatible shims providing `module`, `exports`, `require`, `__dirname`, and `__filename`. It also redirects bare package imports to ESM entry points when available.

## Future outlook

These layers can be simplified or removed as Astro evolves:

- **Component marker** — can be removed if a future Astro reintroduces `isAstroComponentFactory` in client-side transforms.
- **Props patching** — can be removed once every supported compiler matches the runtime calling convention.
- **Fonts** — can be simplified if Astro's font plugin handles the Storybook SSR context directly.
- **Image service injection** — the global can be dropped along with support for Astro versions below 7.4, leaving only the `image.service.entrypoint` config.
- **CJS interop** — will shrink as dependencies migrate to ESM.

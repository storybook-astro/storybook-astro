---
title: Static Builds
description: How Storybook Astro pre-renders Astro components at build time.
---

Since Astro components require server-side rendering via the Container API, static builds (`storybook build`) use a **build-time pre-rendering** approach.

## How it works

1. **SSR Server** — During the Vite build, `vitePluginAstroBuildPrerender` creates an internal Vite SSR server with AstroContainer.

2. **Story Discovery** — For each story file that imports an `.astro` component, the plugin loads the full story module via `ssrLoadModule` to get fully evaluated args (including imported assets like images).

3. **Pre-rendering** — Each story variant is rendered using AstroContainer with its merged args (meta-level + story-level).

4. **HTML Injection** — The pre-rendered HTML is injected as a `parameters.__astroPrerendered` property on each story export.

5. **Asset Emission** — Any `/@fs` dev-server asset URLs (e.g. images) in the rendered HTML are emitted as Rollup assets with content-hashed filenames, and the URLs are rewritten to their final paths.

6. **Client Runtime** — At runtime, the renderer detects the pre-rendered HTML parameter and uses it directly, bypassing the HMR-based render path.

## Limitations

:::caution
Astro component stories are rendered with their default args at build time. Changing args via the Controls panel has no effect in static builds.
:::

- **No interactive Controls** — Since Astro components are pre-rendered at build time, the Controls panel cannot re-render them with different args. This only affects Astro components — framework component stories (React, Vue, etc.) remain fully interactive. In static builds, the package automatically disables all control inputs for Astro stories and shows an **ℹ️ Astro** info row in the Controls table so viewers understand why. No configuration is needed. For interactive Controls in production, see [Server Builds](/how-it-works/server-builds/).
- **No story-level component override** — Stories that override the meta-level `component` are not pre-rendered.
- **Dev mode unaffected** — In `storybook dev`, all components render on-demand and Controls work as expected.

## Future considerations

If you need live re-rendering of Astro components with different args in production, see [Server Builds](/how-it-works/server-builds/) — it trades the zero-server simplicity described above for an on-demand render server that keeps Controls interactive. A lighter-weight, no-server option (e.g. a service worker) remains a possible future enhancement for static builds specifically.

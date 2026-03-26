# Issue #36: "Failed to load astro-prerendered-stories.json" 404 in `storybook dev`

**Fixed in**: v1.0.1
**Affected**: v1.0.0 — users who installed `@storybook-astro/framework` via npm and ran `storybook dev`

## Symptoms

Running `storybook dev` with a fresh npm install produced one of two errors:

```
Failed to load astro-prerendered-stories.json. Received 404 Not Found.
```

Or after the first partial fix:

```
Astro Component
Astro components require server-side rendering and cannot be displayed
in a static build. Run storybook dev for interactive rendering.
```

Both errors stem from the same root cause: `import.meta.hot` being unavailable in the renderer.

## Why It Wasn't Caught

**Tests passed** — the test suite uses `composeStories`/`renderStory` (Vitest portable stories), which call `handlerFactory()` directly and never touch Vite HMR or `astro-prerendered-stories.json`.

**The demo site worked** — `demo.storybook-astro.org` is a static build deployed to Cloudflare Pages (`storybook-static/`). `storybook build` generates `astro-prerendered-stories.json` correctly. No dev server involved.

**Monorepo integration examples worked** — `integration/astro5` and `integration/astro6` use `@storybook-astro/framework: workspace:*`, which loads TypeScript source directly through Vite. This entirely bypasses the compiled `dist/` files and esbuild pre-bundling.

## Architecture Background

The framework uses a dual-mode rendering system:

**Development (`storybook dev`)**
1. `vitePluginStorybookAstroMiddleware` registers a Vite dev server plugin
2. An internal Astro Vite server is created to handle SSR
3. The plugin listens on `astro:render:request` via Vite's WebSocket HMR channel
4. The browser renderer sends a request via `import.meta.hot.send()`
5. The middleware renders the component with `AstroContainer.renderToString()` and sends back HTML

**Production (`storybook build`)**
1. `vitePluginAstroBuildPrerender` runs during the Vite build
2. All Astro stories are pre-rendered to HTML strings
3. Results are written to `astro-prerendered-stories.json`
4. The browser renderer fetches this JSON and injects the pre-rendered HTML

The renderer chooses between these paths by checking `import.meta.hot`. If it's defined, use HMR. If undefined, fall back to the pre-rendered JSON.

## Root Causes (Two Separate Issues)

### Root Cause 1: Vite esbuild pre-bundling

When a package is installed via npm into `node_modules`, Vite pre-bundles it using esbuild for performance. During this pre-bundling, esbuild does not understand Vite-specific runtime constructs — it strips `import.meta.hot` from the bundled output. The renderer chunk was being pre-bundled, leaving `import.meta.hot` permanently `undefined`.

**Fix**: Add `@storybook-astro/renderer` to `optimizeDeps.exclude` in the framework's `viteFinal` (`packages/@storybook-astro/framework/src/preset.ts`). This tells Vite to serve the renderer directly through its transform pipeline rather than pre-bundling it.

### Root Cause 2: Indirect `import.meta.hot` access bypasses Vite's static analysis

Even with the renderer excluded from pre-bundling, `import.meta.hot` was still `undefined`. The original `getViteHot()` function in the renderer was:

```typescript
// BROKEN: tsup compiles this to: const meta = import.meta; return meta.hot;
function getViteHot(): ViteHot | undefined {
  const meta = import.meta as ImportMeta & { hot?: ViteHot };
  return meta.hot;
}
```

Vite's `importAnalysis` plugin detects hot module usage by **static analysis** — it looks for the literal `import.meta.hot` string in module source. When tsup compiled the TypeScript cast expression, it produced:

```javascript
const meta = import.meta;
return meta.hot;
```

Vite's analysis sees `import.meta` but not `import.meta.hot` as a direct access, so it never creates a hot context for the module, leaving `import.meta.hot` undefined at runtime.

**Fix**: Change `getViteHot()` to access `import.meta.hot` directly:

```typescript
// FIXED: tsup compiles this to: return import.meta.hot;
function getViteHot(): ViteHot | undefined {
  return (import.meta as ImportMeta & { hot?: ViteHot }).hot;
}
```

The cast expression `(import.meta as T).hot` compiles to `import.meta.hot` — a direct property access that Vite's static analysis correctly detects.

## The Fix (v1.0.1)

Three changes in total across two files:

**`packages/@storybook-astro/framework/src/preset.ts`**
- Added `@storybook-astro/renderer` to `optimizeDeps.exclude` to prevent esbuild pre-bundling

**`packages/@storybook-astro/renderer/src/render.tsx`**
- Changed `getViteHot()` to use direct `import.meta.hot` access (fixes Vite static analysis detection)
- Wrapped `resolvePrerenderedStoryHtml()` in a `try/catch` in `renderAstroToCanvas()` so a 404 emits a clear warning and falls through to HMR rather than crashing (defensive fallback)

## Verification

After the fix, users with fresh npm installs should see Astro component stories render correctly in `storybook dev`. The story canvas renders via HMR instead of the prerendered JSON, and no 404 error appears. Controls update the rendered component in real time.

To confirm HMR is working: open DevTools → Network tab — `astro-prerendered-stories.json` should not be requested at all.

---
title: Troubleshooting
description: Common issues and solutions when installing or using Storybook Astro.
---

Having trouble? Check the common issues and solutions below.

## Installation Issues

### npm ERESOLVE: Could not resolve peer dependencies with Vite 5

**Error message:**
```
npm error code ERESOLVE
npm error ERESOLVE could not resolve
npm error Could not resolve dependency:
npm error dev @storybook-astro/framework
npm error Conflicting peer dependency: vite@...
```

**What's happening:**

This error occurs when your project uses Astro 5 with Vite 5.x and npm tries to resolve optional peer dependencies. The issue is an upstream incompatibility in the Astro Solid integration:

- `@astrojs/solid-js@6.0.1` requires `solid-devtools@^0.30.1`
- That version brings in `solid-start@0.3.11`, which only supports `vite@^4.4.6`
- This conflicts with Vite 5.x

This is a **transitive dependency issue in the Astro ecosystem**, not a problem with Storybook Astro itself.

**Solutions:**

#### Option 1: Use `--legacy-peer-deps` (if not using Solid)

If you're not using the Solid framework integration, this is the quickest workaround:

```bash
npm install -D --legacy-peer-deps storybook @storybook/builder-vite @storybook-astro/framework
```

#### Option 2: Use Yarn instead of npm

Yarn's dependency resolution algorithm handles this edge case better:

```bash
yarn add -D storybook @storybook/builder-vite @storybook-astro/framework
```

#### Option 3: Wait for upstream fixes

The Astro team will eventually update `@astrojs/solid-js` to use newer `solid-devtools` that supports Vite 5+. Monitor [Astro's releases](https://github.com/withastro/astro/releases).

**Why we don't recommend `--legacy-peer-deps` universally:**

`--legacy-peer-deps` disables npm's peer dependency validation, which can mask real incompatibilities. We only suggest it as a workaround for this specific upstream issue.

---

## Runtime Issues

### Vite Version Mismatch: "Cannot read properties of undefined"

**Error message:**
```
TypeError: Cannot read properties of undefined (reading 'name')
at TransformPluginContext.transform (vite-plugin-astro/index.js:161:30)
```

**Cause:**

This error occurs when Vite 5.x is installed in a project using Astro 5.17.2+. Modern Astro 5 requires Vite 6.4.1+, not 5.x. The Astro Vite plugin expects features introduced in Vite 6 (like `this.environment`).

**Solution:**

Install Vite 6.4.1 or later:

```bash
npm install -D vite@^6.4.1
```

If Vite 5.x is already installed, do a clean install:

```bash
rm -rf node_modules package-lock.json
npm install
```

The framework now requires `vite@^6.4.1 || ^7.0.0 || ^8.0.0` for compatibility with Astro 5+.

---

### `No loader is configured for ".node" files` (fsevents)

**Error message:**
```
Error: Error during dependency optimization:
✘ [ERROR] No loader is configured for ".node" files:
    node_modules/.../fsevents/fsevents.node
```

**Cause:**

Vite's esbuild dependency prebundler scans installed packages and tries to bundle `fsevents`, a macOS-only native module used by Vite's HMR file watcher. esbuild has no loader for the `.node` binary it ships with, so the scan fails. The error is most commonly seen on macOS with pnpm because pnpm's directory layout makes `fsevents` visible to the scan path.

**Solution:**

Recent framework versions exclude `fsevents` from `optimizeDeps` automatically. If you're pinned to an older release, add it yourself in your `.storybook/main.ts`:

```ts
const config: StorybookConfig = {
  // ...
  viteFinal: async (config) => {
    const { mergeConfig } = await import('vite');
    return mergeConfig(config, {
      optimizeDeps: { exclude: ['fsevents'] },
    });
  },
};
```

---

### `SyntaxError: redeclaration of import __vite__injectQuery` (portable stories)

**Error message (browser console):**
```
Uncaught SyntaxError: redeclaration of import __vite__injectQuery
    chunk-XXXXXXXX.js
```

**Cause:**

When a story uses the CSF Next `preview.meta({...})` portable-stories shape, `storybook/internal/preview-api` can be processed by Vite's transform pipeline twice — once during dependency prebundling and again as a regular module. Each pass injects its own `__vite__injectQuery` helper import, producing a duplicate declaration in the generated chunk.

**Solution:**

Recent framework versions exclude `storybook/internal/preview-api` from `optimizeDeps` so it's only resolved once. If you're pinned to an older release, mirror the workaround from the fsevents entry above and add `'storybook/internal/preview-api'` to the same `optimizeDeps.exclude` list.

---

### "Astro components cannot be used in the browser"

**Error message:**
```
Error: Astro components cannot be used in the browser
```

**Cause:**

The framework isn't properly configured or the middleware isn't running.

**Solution:**

1. Verify your `.storybook/main.js` includes the framework:
   ```javascript
   export default {
     framework: {
       name: '@storybook-astro/framework',
       options: {},
     },
   };
   ```

2. Make sure you're running Storybook in dev mode:
   ```bash
   npm run dev
   ```

3. Clear Storybook's cache and restart:
   ```bash
   rm -rf node_modules/.cache
   npm run dev
   ```

---

### Framework components render blank or show errors

**Cause:**

Framework integration may not be configured or glob patterns are too restrictive.

**Solution:**

1. Add integrations to your `.storybook/main.js`:
   ```javascript
   import { react, vue, svelte } from '@storybook-astro/framework/integrations';

   export default {
     framework: {
       name: '@storybook-astro/framework',
       options: {
         integrations: [
           react({ include: ['**/react/**'] }),
           vue(),
           svelte(),
         ],
       },
     },
   };
   ```

2. Use recursive `**` glob patterns — single wildcards won't match nested files:
   ```javascript
   // ❌ Wrong — only matches one level
   react({ include: ['*/react/*'] })
   
   // ✅ Correct — matches nested directories
   react({ include: ['**/react/**'] })
   ```

3. Verify your components are in locations matching the glob pattern:
   ```
   src/components/react/Button.jsx  ← matches **/react/**
   src/react/Button.jsx             ← matches **/react/**
   src/Button.jsx                   ← does NOT match **/react/**
   ```

---

### `@typescript-eslint/no-unsafe-assignment` on `.astro` imports

**Error message (ESLint):**
```
Unsafe assignment of an error typed value.  @typescript-eslint/no-unsafe-assignment
```

**Cause:**

ESLint's type-checker does not use the Astro language server. When it encounters `import Button from './Button.astro'`, it cannot resolve the `.astro` module and treats `Button` as an error-typed value — which fires `@typescript-eslint/no-unsafe-assignment` (and related rules like `no-unsafe-argument`, `no-unsafe-call`) when the component is passed to story objects or helper functions.

**Solution:**

Add a triple-slash reference directive to your project's `src/env.d.ts`:

```ts
/// <reference types="@storybook-astro/framework/shim" />
```

This pulls in an ambient `declare module '*.astro'` declaration that gives ESLint a concrete type for Astro component imports, resolving the rule violation.

If your project does not have a `src/env.d.ts`, create one with just that line, or add it to any `.d.ts` file that is included in your `tsconfig.json`.

---

### Slot content shows as raw HTML text (early Astro 6.0.x)

**Symptom:**

HTML passed as slot content via `args.slots` renders as visible, escaped text instead of markup — e.g. the story shows the literal `<strong>Hello</strong>` rather than a bold "Hello".

```js
export const Default = {
  args: {
    slots: { default: '<p>Welcome</p>' }, // renders "<p>Welcome</p>" as text
  },
};
```

**Cause:**

Early Astro **6.0.x** releases (e.g. `6.0.3`) HTML-escape string slot content in the Container API. This was fixed in a later Astro 6.x release. **Astro 5 and Astro 7 are not affected.**

**Solution:**

Upgrade Astro to a recent 6.x (6.4.0 or newer):

```bash
npm install -D astro@^6.4.0
```

If an older version is already installed, do a clean install:

```bash
rm -rf node_modules package-lock.json
npm install
```

### `Unknown file extension ".astro"` in Vitest

**Symptom:** A test fails at module load, before any test runs:

```
TypeError: Unknown file extension ".astro" for .../astro/components/Image.astro
```

**Cause:** Your component imports `astro:assets` (e.g. `<Image>`), which
re-exports `astro/components/Image.astro`. Vitest 4.0.x externalized `astro` in
its SSR environment, so that `.astro` file reached Node's ESM loader
untransformed.

**Fix:** Upgrade to **Vitest 4.1.0 or newer**. `4.0.18`, the last 4.0 release,
still reproduces it. Nothing in your Astro or Storybook Astro configuration
affects this — it is purely the Vitest version.

### Storybook Test addon: "Vitest failed to find the current suite"

**Symptom:** Running stories through `@storybook/addon-vitest` fails to collect
tests, sometimes alongside `Failed to run dependency scan. Skipping dependency
pre-bundling` or a `TypeError: Illegal invocation` from `userEvent`.

**Cause:** Vite could not pre-bundle a dependency up front, so it discovered one
mid-run and reloaded the test page during collection.

**Fix:** Upgrade to a Storybook Astro version that teaches Vite's dependency
scanner to read `.astro` files. If it persists, a dependency of your own is being
discovered late — add it to `optimizeDeps.include` in your Vitest config and
open an issue so it can be handled by default.

### Storybook Test addon: some stories are never tested

**Symptom:** The run passes, but stories from another package never appear.

**Cause:** `@storybook/addon-vitest` resolves each `stories` entry against your
`.storybook` directory, so an absolute path silently matches nothing.

**Fix:** Make the glob relative — see
[Story globs must be relative](/guides/testing/#story-globs-must-be-relative).

---

## Known Limitations

### Vite 5 + Solid Integration

The Solid framework integration (`@astrojs/solid-js@6.0.1`) has a transitive dependency incompatibility with Vite 5. See the [npm ERESOLVE solution](#npm-eresolve-could-not-resolve-peer-dependencies-with-vite-5) above.

**Status:** Waiting for Astro to update the Solid integration with compatible dependencies.

### Production Builds

Storybook Astro is currently optimized for development. Production builds (`npm run build`) are still more limited than dev mode.

---

## Getting Help

If you don't find your issue here:

1. Check [existing GitHub issues](https://github.com/storybook-astro/storybook-astro/issues)
2. Search [Storybook's discussions](https://github.com/storybookjs/storybook/discussions)
3. [Open a new issue](https://github.com/storybook-astro/storybook-astro/issues/new) with:
   - Full error message and stack trace
   - Your Node.js, npm, Storybook, and Astro versions
   - Exact reproduction steps
   - Output of `npm ls vite` to show your dependency tree

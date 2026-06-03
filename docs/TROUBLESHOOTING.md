# Troubleshooting

Common issues and solutions when installing or using Storybook Astro.

## Installation Issues

### npm ERESOLVE: Could not resolve peer dependencies with Vite 5

**Error:**
```
npm error code ERESOLVE
npm error ERESOLVE could not resolve
npm error Could not resolve dependency:
npm error dev @storybook-astro/framework
npm error Conflicting peer dependency: vite@...
```

**Cause:**

This occurs when your project uses Astro 5 with Vite 5.x and you install the Solid framework integration. The issue is an upstream incompatibility in the Astro Solid integration:

- `@astrojs/solid-js@6.0.1` declares `solid-devtools@^0.30.1` as a peer dependency
- That version of `solid-devtools` brings in `solid-start@0.3.11`, which only supports `vite@^4.4.6`
- This conflicts with Vite 5.x

**Solution:**

**If you're not using Solid**, this error shouldn't occur. If it does, it may be a transitive dependency issue. Try:

```bash
npm install -D --legacy-peer-deps storybook @storybook/builder-vite @storybook-astro/framework
```

**If you are using Solid**, you have these options:

1. **Recommended:** Use `--legacy-peer-deps` (temporarily, until Astro updates the Solid integration):
   ```bash
   npm install -D --legacy-peer-deps storybook @storybook/builder-vite @storybook-astro/framework @astrojs/solid-js
   ```

2. **Use Yarn instead** — Yarn's dependency resolution algorithm handles this edge case better:
   ```bash
   yarn add -D storybook @storybook/builder-vite @storybook-astro/framework
   ```

3. **Wait for upstream fixes** — The Astro team will eventually update `@astrojs/solid-js` to use a newer version of `solid-devtools` that supports Vite 5+. Check [Astro's GitHub releases](https://github.com/withastro/astro/releases) for updates.

**Why we don't recommend `--legacy-peer-deps` for all installs:**

`--legacy-peer-deps` disables npm's peer dependency validation globally, which can mask real incompatibilities. We only recommend it as a workaround for this specific upstream issue in the Astro ecosystem.

---

### Vite Version Mismatch: "Cannot read properties of undefined (reading 'name')"

**Error message:**
```
TypeError: Cannot read properties of undefined (reading 'name')
at TransformPluginContext.transform (vite-plugin-astro/index.js:161:30)
```

**Cause:**

This error occurs when **Vite 5.x is installed** in a project that uses **Astro 5.17.2+**. Modern Astro 5 releases require Vite 6.4.1+, not 5.x. The Astro Vite plugin expects features introduced in Vite 6 (like `this.environment`), which don't exist in Vite 5.

**Solution:**

Ensure your project uses **Vite 6.4.1 or later**:

```bash
npm install -D vite@^6.4.1
```

If you accidentally have Vite 5.x installed, clean install to resolve to Vite 6+:

```bash
rm -rf node_modules package-lock.json
npm install
```

The framework now requires `vite@^6.4.1 || ^7.0.0 || ^8.0.0` to ensure compatibility with Astro 5+.

---

## Runtime Issues

### `No loader is configured for ".node" files` (fsevents)

**Error:**
```
Error: Error during dependency optimization:
✘ [ERROR] No loader is configured for ".node" files:
    node_modules/.../fsevents/fsevents.node
```

**Cause:**

Vite's esbuild dependency prebundler scans installed packages and tries to bundle `fsevents`, a macOS-only native module used by Vite's HMR file watcher. esbuild has no loader for the `.node` binary it ships with, so the scan fails. The error is most commonly seen on macOS with pnpm because pnpm's directory layout makes `fsevents` visible to the scan path.

**Solution:**

Recent framework versions exclude `fsevents` from `optimizeDeps` automatically. If you're pinned to an older release, add it yourself in `.storybook/main.ts`:

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

**Error (browser console):**
```
Uncaught SyntaxError: redeclaration of import __vite__injectQuery
    chunk-XXXXXXXX.js
```

**Cause:**

When a story uses the CSF Next `preview.meta({...})` portable-stories shape, `storybook/internal/preview-api` can be processed by Vite's transform pipeline twice — once during dependency prebundling and again as a regular module. Each pass injects its own `__vite__injectQuery` helper import, producing a duplicate declaration in the generated chunk.

**Solution:**

Recent framework versions exclude `storybook/internal/preview-api` from `optimizeDeps` so it's only resolved once. If you're pinned to an older release, mirror the fsevents workaround above and add `'storybook/internal/preview-api'` to the same `optimizeDeps.exclude` list.

---

### Storybook won't start / "Astro components cannot be used in the browser"

**Error:**
```
Error: Astro components cannot be used in the browser
```

**Cause:**

This typically means the framework isn't properly configured or the middleware isn't running.

**Solution:**

1. Verify `.storybook/main.js` has the framework configured:
   ```javascript
   export default {
     framework: {
       name: '@storybook-astro/framework',
       options: {},
     },
   };
   ```

2. Check that you're running Storybook dev mode (not build):
   ```bash
   npm run dev
   ```

3. Try clearing Storybook's cache:
   ```bash
   rm -rf node_modules/.cache
   npm run dev
   ```

---

## Framework Integration Issues

### Framework components don't render (show blank or error)

**Cause:**

Framework integration may not be configured properly or the glob patterns are too restrictive.

**Solution:**

1. Add integrations to `.storybook/main.js`:
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

2. Make sure glob patterns use recursive `**` notation:
   ```javascript
   // ❌ Won't match nested files
   react({ include: ['*/react/*'] })
   
   // ✅ Correct - matches nested files
   react({ include: ['**/react/**'] })
   ```

3. Verify the framework component is in a location matching the glob:
   ```
   src/components/react/Button.jsx  ← matches **/react/**
   src/react/Button.jsx             ← matches **/react/**
   src/Button.jsx                   ← does NOT match **/react/**
   ```

---

## Known Limitations

### Vite 5 with Solid Integration

The Solid framework integration (`@astrojs/solid-js`) has a transitive dependency on an older version of `solid-devtools` that doesn't support Vite 5. This is an upstream issue in the Astro ecosystem.

**Workaround:** Use `--legacy-peer-deps` or Yarn.

### Production Builds

Storybook Astro is currently optimized for development. Production builds (`npm run build`) are still more limited than dev mode.

---

## Getting Help

If you encounter an issue not listed here:

1. Check [existing GitHub issues](https://github.com/storybook-astro/storybook-astro/issues)
2. Search [Storybook's GitHub discussions](https://github.com/storybookjs/storybook/discussions)
3. Open a [new GitHub issue](https://github.com/storybook-astro/storybook-astro/issues/new) with:
   - Error message and full stack trace
   - Node.js, npm, Storybook, and Astro versions
   - Reproduction steps or a minimal example
   - Output of `npm ls` to show dependency versions

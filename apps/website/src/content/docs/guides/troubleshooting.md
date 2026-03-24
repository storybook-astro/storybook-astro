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
   npm run storybook
   ```

3. Clear Storybook's cache and restart:
   ```bash
   rm -rf node_modules/.cache
   npm run storybook
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

## Known Limitations

### Vite 5 + Solid Integration

The Solid framework integration (`@astrojs/solid-js@6.0.1`) has a transitive dependency incompatibility with Vite 5. See the [npm ERESOLVE solution](#npm-eresolve-could-not-resolve-peer-dependencies-with-vite-5) above.

**Status:** Waiting for Astro to update the Solid integration with compatible dependencies.

### Production Builds

Storybook Astro is currently optimized for development. Static builds (`npm run build-storybook`) are not fully supported yet.

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

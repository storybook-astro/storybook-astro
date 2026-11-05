# Framework Integration Standards

This document covers standards for integrating UI frameworks with Storybook Astro. The integration contract and the steps for adding a framework are in [AGENTS.md](../../AGENTS.md#adding-a-new-framework-integration); this file adds per-framework details and pitfalls.

## Supported Frameworks

Each integration lives in `packages/@storybook-astro/framework/src/integrations/` and is exported as a factory from `@storybook-astro/framework/integrations`.

| Framework | Factory | Astro integration | Storybook entry preview | File |
|-----------|---------|-------------------|-------------------------|------|
| React | `react()` | `@astrojs/react` | `@storybook/react/entry-preview` | `react.ts` |
| Vue 3 | `vue()` | `@astrojs/vue` | `@storybook/vue3/entry-preview` | `vue.ts` |
| Svelte | `svelte()` | `@astrojs/svelte` | `@storybook/svelte/entry-preview` | `svelte.ts` |
| Preact | `preact()` | `@astrojs/preact` | `@storybook/preact/entry-preview` | `preact.ts` |
| Solid | `solid()` | `@astrojs/solid-js` | `storybook-solidjs-vite`'s Solid 1 entry | `solid.ts` |
| Alpine.js | `alpinejs()` | `@astrojs/alpinejs` | None | `alpine.ts` |

## How an Integration Is Used

An integration is a class that `implements Integration` from `integrations/base.ts`. It doesn't build Vite config itself: `loadIntegration()` loads the framework's Astro integration, which brings the framework's Vite plugins. The rest of the class is data the framework reads:

- `renderer.server` / `renderer.client` entrypoints are registered with the Astro Container and the browser build, so Astro components can render framework islands
- `storybookEntryPreview` is exported under the integration's `name` from `virtual:storybook-renderer-fallback`. A story with `parameters.renderer` set to that `name` is rendered by that Storybook renderer instead of the Astro server
- `resolveClient()` maps the Astro renderer's client module to a browser URL

See [AGENTS.md](../../AGENTS.md#adding-a-new-framework-integration) for every field and a template.

## Rendering Flow

The two paths, Astro components rendered on the server and framework stories delegated to a Storybook renderer, are diagrammed in [AGENTS.md's Data Flow](../../AGENTS.md#data-flow).

Keep in mind:

- `render.tsx` detects Astro components by `isAstroComponentFactory`, set by `vitePluginAstroComponentMarker` on Astro 6+
- `renderToCanvas()` delegates to the framework renderer BEFORE calling `storyFn()`. Solid manages its own reactive root, and reordering this leaves orphaned effects

## Configuration

In each integration app's `.storybook/main.js`, integrations go in the framework options:

```javascript
import { react, solid, preact, vue, svelte, alpinejs } from '@storybook-astro/framework/integrations';

const config = {
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  addons: ['@storybook/addon-docs'],
  framework: {
    name: '@storybook-astro/framework',
    options: {
      integrations: [
        react({ include: ['**/react/**'] }),
        solid({ include: ['**/solid/**'] }),
        preact({ include: ['**/preact/**'] }),
        vue(),
        svelte(),
        alpinejs({ entrypoint: './.storybook/alpine-entrypoint.js' })
      ]
    }
  }
};
```

The same integrations are passed to `defineConfig` from `@storybook-astro/framework/vitest` in each app's `vitest.config.ts`.

**Critical**: React, Solid and Preact all compile `.jsx`/`.tsx`, so their `include` globs decide which plugin compiles a file. Use recursive patterns (`**/react/**`), not single-level ones (`*/react/*`). A file the glob misses is compiled by the wrong plugin.

## Per-Framework Notes

Framework stories set `parameters.renderer` to the integration's `name` (`'react'`, `'vue'`, `'svelte'`, `'preact'`, `'solid'`) so they render through that framework's Storybook renderer:

```javascript
import Counter from './Counter.jsx';

export default {
  title: 'React/Counter',
  component: Counter,
  parameters: { renderer: 'react' },
};

export const Default = {};
```

### React
- Options: `include`, `exclude` (passed to `@astrojs/react`)
- Framework peers: `@astrojs/react`, `@storybook/react`. The integration apps install `@storybook/react-vite`

### Vue 3
- Options: `include`, `exclude`, `jsx`. Defaults to `include: ['**/*.vue']`

### Svelte
- Options: `@sveltejs/vite-plugin-svelte` options. Defaults to `extensions: ['.svelte']`

### Preact
- Options: `include`, `exclude`, `compat`, `devtools`
- Declares `@storybook/preact-vite` as a dependency; the entry preview comes from `@storybook/preact`

### Solid
- Uses `storybook-solidjs-vite` (10.0.x, or 10.6 and later), not `@storybook/solidjs`
- `@astrojs/solid-js` renders Solid 1, so the integration looks up the Solid 1 entry in the installed package's exports: `renderer/entry-preview` in 10.0.x, `renderer/solid-legacy` from 10.6. Versions 10.1–10.5 have neither and fail with an error
- Depends on the delegation order above

### Alpine.js
- Alpine components are `.astro` files using `x-` directives, rendered by the Astro server like any Astro component. Alpine stories don't set `parameters.renderer`
- The integration has no Storybook entry preview and no renderer entrypoints. Its `name` is `alpine` and its factory is `alpinejs`
- `alpinejs({ entrypoint })` is passed to `@astrojs/alpinejs`. The integration apps' `.storybook/alpine-entrypoint.js` keeps Alpine from starting on its own, and the `initializeAstroRenderer` block in `render.tsx` starts it

## Component File Organization

Shared example components live in `packages/components/src/`, one folder per framework:

```
packages/components/src/Counter/
├── astro/Counter.astro
├── alpine/
│   ├── Counter.astro
│   ├── Counter.stories.js
│   └── Counter.test.ts
├── react/
│   ├── Counter.jsx
│   ├── Counter.stories.js
│   └── Counter.test.ts
├── vue/ ...
├── svelte/ ...
├── preact/ ...
└── solid/ ...
```

Each integration app (`integration/astro5`, `astro6`, `astro7`) loads those stories through its `stories` globs. Its `src/components/<Component>/` folders hold Astro stories and tests that import from `@storybook-astro/components/...`.

## Integration Checklist

When adding or changing a framework integration:

- [ ] Integration class in `src/integrations/[framework].ts` implements `Integration`
- [ ] Factory exported from `integrations/index.ts`, named after `name` (or `factoryName`)
- [ ] Framework packages added to the framework's optional `peerDependencies`
- [ ] Example components and stories in `packages/components/src/<Component>/<framework>/`
- [ ] The framework's Vite plugin added to `packages/components/vitest.config.ts`
- [ ] Tests next to those components (see [testing-guidelines.md](./testing-guidelines.md))
- [ ] Integration registered with a recursive `include` glob in `.storybook/main.js` and `vitest.config.ts` of `integration/astro5`, `astro6` and `astro7`
- [ ] `yarn test` passes
- [ ] `yarn workspace @storybook-astro/integration-astro7 dev` loads without errors, and stories render, hydrate and pick up styles and HMR

## Common Pitfalls

See [AGENTS.md's Common Issues](../../AGENTS.md#common-issues) for blank framework components, framework integrations not working, and Alpine not starting. Two more:

### Framework Story Has No Renderer
**Symptom**: A framework component story shows an error that no renderer is specified, or `Renderer '<name>' not found. Available renderers: ...`
**Fix**: Set `parameters.renderer` to the integration's `name`, and check that the integration is configured in `.storybook/main.js` and has a `storybookEntryPreview`.

### Astro Integration Not Found
**Symptom**: Errors importing `@astrojs/<framework>`
**Fix**: `loadIntegration()` imports it from the user's project with `importModule`. Check that the package is installed there.

## References

- [AGENTS.md](../../AGENTS.md) - Architecture and debugging
- [project-structure.md](./project-structure.md) - Monorepo navigation
- [testing-guidelines.md](./testing-guidelines.md) - Testing patterns
- [Astro Framework Integrations](https://docs.astro.build/en/guides/framework-components/)
- [Storybook Framework API](https://storybook.js.org/docs/configure/integration/frameworks)

# Framework Integration Standards

This document covers standards for integrating UI frameworks with Storybook Astro.

## Supported Frameworks

| Framework | Package | Status | Location |
|-----------|---------|--------|----------|
| React | @storybook/react-vite | Stable | `integrations/react.ts` |
| Vue 3 | @storybook/vue3 | Stable | `integrations/vue.ts` |
| Svelte | @storybook/svelte | Stable | `integrations/svelte.ts` |
| Preact | @storybook/preact | Stable | `integrations/preact.ts` |
| Solid.js | storybook-solidjs | Stable | `integrations/solid.ts` |
| Alpine.js | Custom | Experimental | `integrations/alpine.ts` |

## Integration Architecture

### Base Integration Class

All integrations extend `BaseIntegration` from `packages/@storybook-astro/framework/src/integrations/base.ts`:

```typescript
export class MyFrameworkIntegration extends BaseIntegration {
  override getAstroRenderer() {
    // Return Astro integration for this framework
  }

  override getVitePlugins() {
    // Return Vite plugins needed for compilation
  }

  override getStorybookRenderer() {
    // Return Storybook framework identifier
  }

  override resolveClient(specifier: string) {
    // Handle special client-side module resolution if needed
  }
}
```

### Key Methods

#### getAstroRenderer()

Returns the Astro integration package for this framework.

```typescript
override getAstroRenderer() {
  return react(); // From @astrojs/react
}
```

The Astro integration configures how Astro renders components from this framework.

#### getVitePlugins()

Returns array of Vite plugins needed to compile components.

```typescript
override getVitePlugins() {
  return [
    react({ fast: true }),
    // Other framework-specific plugins
  ];
}
```

Critical: Vite must be able to compile `.jsx`, `.tsx`, or `.vue` files accordingly.

#### getStorybookRenderer()

Returns the Storybook renderer identifier.

```typescript
override getStorybookRenderer() {
  return '@storybook/react'; // Maps to Storybook's React renderer
}
```

This tells Storybook which framework's preview addon to load.

#### resolveClient(specifier)

Optional. Handles special module resolution for client-side code.

```typescript
override resolveClient(specifier: string) {
  if (specifier === 'custom-entrypoint') {
    return '/path/to/entrypoint.js';
  }
  return null; // Delegate to default resolution
}
```

Useful for Alpine.js and other frameworks needing special initialization.

## Rendering Flow

### Detection Phase

**Server-side** (`middleware.ts`):
1. Framework integration is instantiated
2. Astro Container is created with all integrations' renderers
3. Container can render both Astro and framework components

**Client-side** (`render.tsx`):
1. `isAstroComponentFactory` flag detects Astro components
2. Other components are delegated to framework renderers via `parameters.renderer`

### Server Rendering (Astro Components)

```
story request
  ↓
detect isAstroComponentFactory
  ↓
send request to framework middleware via HMR
  ↓
getAstroRenderer() returns integration
  ↓
Astro Container renders component to HTML
  ↓
return HTML string
  ↓
inject into canvas, apply styles
```

### Client Rendering (Framework Components)

```
story request
  ↓
detect parameters.renderer
  ↓
delegate to framework's renderToCanvas BEFORE storyFn()
  ↓
framework renderer handles state/hydration
  ↓
framework component renders to DOM
```

**Important**: Framework renderers are called BEFORE `storyFn()` to allow frameworks like Solid.js to manage their own reactive roots.

## Configuration Pattern

### In .storybook/main.js

```javascript
const config = {
  framework: '@storybook-astro/framework',
  stories: ['../src/**/*.stories.{jsx,tsx}'],
  addons: ['@storybook/addon-essentials'],
  
  // Framework integration configuration
  astroIntegrations: [
    // React
    {
      name: '@storybook-astro/react',
      include: '**/react/**', // Recursive glob
    },
    // Vue
    {
      name: '@storybook-astro/vue',
      include: '**/vue/**',
    },
    // ... other frameworks
  ],
};
```

**Critical**: Use recursive glob patterns (`**/framework/**`) not single-level (`*/framework/*`). Single-level globs won't match files in nested subdirectories and will cause files to compile with wrong plugins.

## Per-Framework Guidelines

### React

**File extensions**: `.jsx`, `.tsx`

**Story example**:
```javascript
import Button from './Button.jsx';

export default {
  title: 'Components/Button',
  component: Button,
};

export const Primary = {
  args: { label: 'Click me' },
};
```

**Notes**:
- Uses @storybook/react-vite renderer
- Hooks work normally in Storybook
- No special initialization needed

### Vue 3

**File extensions**: `.vue`

**Story example**:
```javascript
import Button from './Button.vue';

export default {
  title: 'Components/Button',
  component: Button,
};

export const Primary = {
  args: { label: 'Click me' },
};
```

**Notes**:
- Uses @storybook/vue3 renderer
- Both Composition API and Options API supported
- Props bind via `args`
- Slots work via `slots` parameter

### Svelte

**File extensions**: `.svelte`

**Story example**:
```javascript
import Button from './Button.svelte';

export default {
  title: 'Components/Button',
  component: Button,
};

export const Primary = {
  args: { label: 'Click me' },
};
```

**Notes**:
- Uses @storybook/svelte renderer
- Reactive stores work via `setContext`
- Props bind via `args`

### Preact

**File extensions**: `.jsx`, `.tsx`

**Story example**:
```javascript
import Button from './Button.jsx';

export default {
  title: 'Components/Button',
  component: Button,
};

export const Primary = {
  args: { label: 'Click me' },
};
```

**Notes**:
- Uses @storybook/preact renderer
- Similar to React but smaller footprint
- Hooks available (via preact/hooks)

### Solid.js

**File extensions**: `.jsx`, `.tsx`

**Story example**:
```javascript
import Button from './Button.jsx';

export default {
  title: 'Components/Button',
  component: Button,
};

export const Primary = {
  args: { label: 'Click me' },
};
```

**Notes**:
- Uses storybook-solidjs renderer (NOT @storybook/solidjs)
- **Critical**: `renderToCanvas()` delegates to Solid renderer BEFORE calling `storyFn()`. This is required for Solid to manage reactive roots properly. If this order is wrong, effects and reactive primitives break.
- Reactive primitives (createSignal, createEffect, etc.) work normally

### Alpine.js

**File extensions**: `.astro` (wrapped) or `.html` (standalone)

**Story example**:
```javascript
import Counter from './Counter.astro';

export default {
  title: 'Components/Counter',
  component: Counter,
};

export const Default = {};
```

**Notes**:
- Alpine is started manually in `render.tsx` init function
- HTML must contain `x-` directives
- No build step needed (Alpine is runtime only)
- Entrypoint: `resolveClient()` in Alpine integration returns custom initialization

## Component File Organization

### Single-Framework Component
```
src/components/Button/
├── Button.jsx          # React component
├── Button.stories.jsx  # Story
└── Button.test.ts      # Test
```

### Multi-Framework Component (Astro wrapper)
```
src/components/Button/
├── Button.astro        # Astro shell component
├── Button.stories.jsx  # Wraps React/Vue/etc
├── Button.test.ts      # Tests via portable stories
├── react/
│   └── Button.jsx
├── vue/
│   └── Button.vue
└── styles.css          # Shared styles
```

## Integration Testing Checklist

When adding or modifying a framework integration:

- [ ] Integration file created in `src/integrations/[framework].ts`
- [ ] Extends `BaseIntegration` with all required methods
- [ ] `getAstroRenderer()` returns correct Astro integration
- [ ] `getVitePlugins()` returns plugins that can compile source files
- [ ] `getStorybookRenderer()` returns valid Storybook renderer identifier
- [ ] Example components in sandbox apps (`apps/sandbox-astro{5,6}/src/components/`)
- [ ] Story files demonstrate key features (props, slots, events)
- [ ] Tests in `packages/@storybook-astro/framework/src/[framework].test.ts`
- [ ] `.storybook/main.js` in both sandboxes updated with recursive glob for this framework
- [ ] `yarn test` passes
- [ ] `yarn workspace @storybook-astro/sandbox-astro6 storybook` loads without errors
- [ ] Components render correctly in Storybook UI
- [ ] Interactivity works (if applicable)
- [ ] Styles apply correctly
- [ ] HMR updates work when files change

## Common Integration Pitfalls

### Glob Pattern Issues

**Symptom**: Framework components not found, compiled by wrong plugin

**Fix**: Use recursive `**` patterns in glob:
```javascript
// Good
include: '**/react/**'

// Bad
include: '*/react/*'  // Won't match src/components/react/Button/Button.jsx
```

### Missing Storybook Renderer

**Symptom**: Framework components show as objects or blank

**Fix**: Check `getStorybookRenderer()` returns valid identifier and that the Storybook addon for this framework is installed.

### Astro Renderer Not Configured

**Symptom**: Astro Container errors about missing integration

**Fix**: Check `getAstroRenderer()` returns correct integration package (e.g., `react()` from `@astrojs/react`).

### Vite Plugin Chain Incomplete

**Symptom**: Syntax errors in component files

**Fix**: Check `getVitePlugins()` returns all necessary plugins for this framework. May need framework plugin + dependencies.

### Client Module Resolution Broken

**Symptom**: Runtime errors about missing modules (Alpine.js issue)

**Fix**: Implement `resolveClient()` to handle special module paths for client-side initialization.

## Extending the Base Integration

To create a new integration:

```typescript
// packages/@storybook-astro/framework/src/integrations/newframework.ts

import { BaseIntegration, type BaseOptions } from './base.ts';
import newFrameworkAstro from '@astrojs/new-framework';
import newFrameworkVitePlugin from 'vite-plugin-new-framework';

export type Options = BaseOptions & {
  // Framework-specific options
  customOption?: string;
};

export class NewFrameworkIntegration extends BaseIntegration {
  readonly options: Options;

  constructor(options?: Options) {
    super(options);
    this.options = options || {};
  }

  override getAstroRenderer() {
    return newFrameworkAstro();
  }

  override getVitePlugins() {
    return [newFrameworkVitePlugin()];
  }

  override getStorybookRenderer() {
    return '@storybook/new-framework';
  }

  override resolveClient(specifier: string) {
    // Optional: handle special client-side resolution
    return null;
  }
}
```

Then export from `integrations/index.ts`:

```typescript
export { NewFrameworkIntegration as newframework } from './newframework.ts';
```

Add to `.storybook/main.js`:

```javascript
astroIntegrations: [
  {
    name: 'newframework',
    include: '**/newframework/**',
  },
]
```

## References

- [AGENTS.md](../AGENTS.md) - Architecture and debugging
- [project-structure.md](./project-structure.md) - Monorepo navigation
- [testing-guidelines.md](./testing-guidelines.md) - Testing patterns
- [Astro Framework Integrations](https://docs.astro.build/en/guides/framework-components/)
- [Storybook Framework API](https://storybook.js.org/docs/configure/integration/frameworks)

# Storybook Astro Project Structure

## Monorepo Overview

This is a Yarn 4+ Berry monorepo with ES modules throughout (`"type": "module"`).

## Workspace Layout

```
storybook-astro/
├── packages/                     # Published npm packages
│   ├── @storybook-astro/
│   │   ├── framework/            # Server-side Storybook integration
│   │   │   ├── src/
│   │   │   │   ├── preset.ts     # Framework config exports (viteFinal, core)
│   │   │   │   ├── middleware.ts # Astro Container + render handler
│   │   │   │   ├── viteStorage*.ts
│   │   │   │   ├── integrations/ # Framework-specific adapters
│   │   │   │   ├── portable-stories.ts # Testing API
│   │   │   │   └── types.ts
│   │   │   ├── package.json      # Exports testing via conditional "exports"
│   │   │   └── vitest.config.ts
│   │   └── renderer/             # Client-side rendering
│   │       ├── src/
│   │       │   ├── render.tsx    # Canvas render + HMR handling
│   │       │   ├── preset.ts
│   │       │   └── types.ts
│   │       └── package.json
│   └── components/               # Component library (internal)
│       └── src/components/       # Example components for testing
├── apps/                         # Private website app
│   └── website/                  # Marketing website
│       └── astro.config.mjs
├── integration/                  # Private integration examples
│   ├── astro6/                   # Astro 6 integration example
│   │   ├── .storybook/main.js    # Framework config with integrations
│   │   ├── src/stories/
│   │   └── src/components/
│   ├── astro5/                   # Astro 5 stable integration example
│   │   └── [same structure]
├── docs/                         # Documentation
├── AGENTS.md                     # AI development guide
├── CONTRIBUTING.md               # Contribution guidelines
├── package.json                  # Root workspace config
├── tsconfig.base.json            # Shared TypeScript config
├── eslint.config.js              # Shared ESLint config
└── vitest.config.ts              # Shared Vitest config
```

## Key Files and Their Roles

### Root Level Configuration
- **package.json**: Workspace definition, scripts, dev dependencies
- **tsconfig.base.json**: Base TypeScript configuration (extended by workspace packages)
- **eslint.config.js**: ESLint rules for the entire monorepo (flat config)
- **vitest.config.ts**: Shared Vitest configuration for all workspaces
- **AGENTS.md**: Technical architecture and AI development guidance (referenced by WARP.md/CLAUDE.md)

### Workspace Commands
All commands run from root using `yarn workspace <name> <script>`:

```bash
# Framework package
yarn workspace @storybook-astro/framework test
yarn workspace @storybook-astro/framework build

# Renderer package
yarn workspace @storybook-astro/renderer test
yarn workspace @storybook-astro/renderer build

# Integration examples
yarn workspace @storybook-astro/integration-astro6 storybook
yarn workspace @storybook-astro/integration-astro5 storybook

# Website
yarn workspace @storybook-astro/website dev

# All tests
yarn test  # Runs vitest across all packages with tests

# All linting
yarn lint
yarn lint:fix

# Build packages only
yarn build:packages
```

## Important Conventions

### Imports
- **Always use explicit extensions**: `.ts`, `.tsx`, `.js`, `.jsx`
- **Use workspace protocol**: `import { foo } from '@storybook-astro/framework'` pulls from `packages/@storybook-astro/framework/src/`

### File Extensions
- TypeScript source: `.ts`, `.tsx`
- JavaScript (config): `.js`, `.mjs`
- Never omit extensions in imports

### Package Dependencies
- Framework depends on Renderer via `workspace:*`
- All internal dependencies use `workspace:*` protocol
- When publishing to npm, Yarn Berry resolves these to actual versions

### Testing
- Vitest configuration at root with `vitest.config.ts`
- Happy-DOM environment for browser simulation
- Tests live alongside source with `.test.ts` extension
- Portable stories API enables testing outside Storybook

## Integrations and Dependencies

### Framework Integrations
Located in `packages/@storybook-astro/framework/src/integrations/`:
- `base.ts` - Base class for all integrations
- `react.ts` - React (via @storybook/react)
- `vue.ts` - Vue 3 (via @storybook/vue3)
- `svelte.ts` - Svelte (via @storybook/svelte)
- `preact.ts` - Preact (via @storybook/preact)
- `solid.ts` - Solid.js (via storybook-solidjs)
- `alpine.ts` - Alpine.js

Each integration:
1. Extends `BaseIntegration` from `base.ts`
2. Returns Astro integration via `getAstroRenderer()`
3. Returns Vite plugins via `getVitePlugins()`
4. Maps to Storybook renderer via `getStorybookRenderer()`

### Virtual Modules
Used internally for plugin communication:
- `virtual:astro-container-renderers` - Renderer registry
- `virtual:storybook-renderer-fallback` - Framework fallbacks
- `virtual:astro:assets/fonts/*` - Stubs for Astro 6 font handling

## Astro Compatibility

### Astro 6 vs Astro 5
- **Astro 6** (primary): Uses `AstroContainer.create()` API for SSR, Vite-based component client stubs
- **Astro 5 stable** (tested): Compatible, may have different internal APIs

### Compatibility Layers in Code
1. **vitePluginAstroComponentMarker.ts** - Replaces Astro 6's runtime error stub with our own
2. **patchCreateAstroCompat()** in middleware.ts - Bridges 3-arg (compiler v2) vs 2-arg (compiler v3/v6) `createAstro()`
3. **vitePluginAstroFontsFallback.ts** - Stubs Astro 6's font virtual modules

## Development Workflow

### For AI/LLM Assistance
Always reference:
1. **AGENTS.md** - Architecture, conventions, debugging
2. **This file (project-structure.md)** - Navigation and workspace rules
3. **CONTRIBUTING.md** - Code conventions and PR workflow

### Common Tasks

**Adding a new framework integration:**
1. Create `packages/@storybook-astro/framework/src/integrations/[framework].ts`
2. Extend `BaseIntegration` from `base.ts`
3. Add example components to `integration/astro6/src/components/`
4. Add tests in `packages/@storybook-astro/framework/src/[framework].test.ts`
5. Update `.storybook/main.js` in both integration examples

**Publishing packages:**
```bash
# IMPORTANT: Always use yarn npm publish, not npm publish
cd packages/@storybook-astro/renderer
rm -rf dist && yarn build
yarn npm publish --tag beta --access public

cd ../framework
rm -rf dist && yarn build
yarn npm publish --tag beta --access public

# Then promote to latest
npm dist-tag add @storybook-astro/renderer@<version> latest
npm dist-tag add @storybook-astro/framework@<version> latest
```

## Module Resolution

### TypeScript Path Mapping
See `tsconfig.base.json` for shared path mappings across all packages.

### Vite Module Resolution
Framework's Vite configuration in `preset.ts` handles:
- Astro component `.astro` files
- Framework-specific imports (React, Vue, etc.)
- Virtual modules from Vite plugins
- Scoped CSS imports from `.astro` files

## Environment and Versions

- **Node.js**: 20.16.0+, 22.19.0+, or 24.0.0+
- **Yarn**: 4.12.0+ (Berry)
- **TypeScript**: 5.8.3+
- **Vite**: 6.x or 7.x
- **Storybook**: 10.2.7+
- **Astro**: 6 (primary) and 5.17.2 (stable support)

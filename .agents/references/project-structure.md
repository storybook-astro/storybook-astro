# Storybook Astro Project Structure

## Monorepo Overview

This is a Yarn 4+ Berry monorepo with ES modules throughout (`"type": "module"`). [AGENTS.md](../../AGENTS.md) describes the architecture and each package's important files; this file is for finding your way around the workspaces.

## Workspace Layout

```
storybook-astro/
├── packages/
│   ├── @storybook-astro/
│   │   ├── framework/            # Published: Storybook framework, server-side rendering
│   │   │   └── src/
│   │   │       ├── preset.ts                 # viteFinal and core config
│   │   │       ├── middleware.ts             # Astro Container, handlerFactory
│   │   │       ├── astroRenderHandler.ts     # Render handler, slot and decorator trees
│   │   │       ├── vitePlugin*.ts / vite*.ts # Vite plugins
│   │   │       ├── lib/                      # componentStyles, compiledStylesheets, ...
│   │   │       ├── docgen/                   # Prop tables from .astro frontmatter
│   │   │       ├── integrations/             # Framework integrations
│   │   │       ├── portable-stories.ts       # composeStories / composeStory
│   │   │       ├── testing/                  # renderStory and the test runtime
│   │   │       ├── vitest/                   # defineConfig for Vitest
│   │   │       └── types.ts
│   │   └── renderer/             # Published: client-side rendering in the preview iframe
│   │       └── src/
│   │           ├── render.tsx            # render(), renderToCanvas()
│   │           ├── decorators.ts         # applyDecorators
│   │           ├── storyStyles.ts        # Moves story CSS into the iframe head
│   │           ├── renderLoadingIndicator.ts
│   │           ├── slotArgs.ts           # Per-slot controls
│   │           ├── extractArgTypes.ts
│   │           ├── docs/                 # "Show code" source
│   │           ├── preset.ts
│   │           └── types.ts
│   └── components/               # Private: shared example components, src/<Component>/<framework>/
├── apps/
│   └── website/                  # Private: documentation website (Astro)
├── integration/                  # Private: Storybook apps that consume the packages
│   ├── astro5/                   # Astro 5, Vite 6, port 6007
│   ├── astro6/                   # Astro 6, Vite 7, port 6006
│   └── astro7/                   # Astro 7, Vite 8, port 6008
├── smoke/                        # Templates for the pre-publish smoke test
├── scripts/                      # Doc link check, smoke test, Storybook next-version switch
├── docs/                         # GETTING_STARTED, TROUBLESHOOTING, RELEASING, specs/
├── AGENTS.md                     # AI development guide
├── CONTRIBUTING.md
├── CHANGELOG.md
├── package.json                  # Workspaces and root scripts
├── tsconfig.base.json            # Shared compiler options
├── eslint.config.js
├── prettier.config.js
└── vitest.config.ts              # Vitest projects and coverage for running Vitest from the root
```

Each integration app has:

- `.storybook/` - `main.js` (framework options and integrations), `preview.js`, `vitest.setup.ts`, `alpine-entrypoint.js`, `story-rules.ts`
- `src/components/<Component>/` - Astro stories and Vitest tests, importing shared components from `@storybook-astro/components`
- `tests/*.spec.ts` - Playwright tests against the built Storybook
- `vitest.config.ts` (component tests) and `vitest.storybook.config.ts` (`@storybook/addon-vitest`)

## Commands

Run from the repo root.

```bash
# Build the framework and renderer (integration apps import their dist)
yarn build:packages

# Rebuild the framework and renderer on change
yarn dev:packages

# Build the packages, then start the package watchers, every integration app's Storybook and the website
yarn dev

# One integration app
yarn workspace @storybook-astro/integration-astro5 dev
yarn workspace @storybook-astro/integration-astro6 dev
yarn workspace @storybook-astro/integration-astro7 dev

# Website
yarn website

# Build the packages, then run every workspace's `test` script
yarn test

# Integration app browser tests
yarn workspace @storybook-astro/integration-astro7 test:browser    # Playwright
yarn workspace @storybook-astro/integration-astro7 test:storybook  # addon-vitest

# Lint
yarn lint
yarn lint:fix
yarn lint:links   # checks that references to docs/ files and their anchors resolve

# Build everything, or serve the builds
yarn build
yarn serve

# Pre-publish smoke test
yarn smoke
```

## Important Conventions

See [AGENTS.md's Code Conventions](../../AGENTS.md#code-conventions). In short:

- Use explicit file extensions in imports (`./middleware.ts`)
- Internal dependencies use `workspace:*`; the framework depends on the renderer this way, and Yarn replaces it with the real version on publish
- Package entrypoints point at `dist`, not `src`. Run `yarn build:packages`, or keep `yarn dev:packages` running, before running integration apps or tests that import them

## Integrations

Framework integrations live in `packages/@storybook-astro/framework/src/integrations/`: `react.ts`, `vue.ts`, `svelte.ts`, `preact.ts`, `solid.ts`, `alpine.ts`, plus `base.ts` (the `Integration` contract), `index.ts` (factory exports) and `moduleResolver.ts`. See [framework-standards.md](./framework-standards.md) and [AGENTS.md](../../AGENTS.md#adding-a-new-framework-integration).

## Virtual Modules

The main ones:

- `virtual:astro-container-renderers` - Registers each integration's Astro renderers with the Container
- `virtual:storybook-renderer-fallback` - Exports each integration's Storybook renderer under its `name`, for framework-delegated stories
- `virtual:storybook-astro-renderer` - Imported by the renderer's `render.tsx`
- `virtual:astro:assets/fonts/internal`, `virtual:astro:assets/fonts/runtime` - Astro's font modules, resolved by `vitePluginAstroFonts.ts`

## Astro Version Support

Astro 5 (5.5.3+), 6 and 7 are supported. The integration apps pin Astro 5.17.2, 6.4.8 and 7.4.2. The code that adapts to each version is listed in [AGENTS.md's Astro Version Compatibility Layers](../../AGENTS.md#astro-version-compatibility-layers).

## Development Workflow

### For AI Assistance
Read in this order:
1. **AGENTS.md** - Architecture, conventions, debugging, the pre-PR checklist
2. **This file** - Navigation and workspace commands
3. **CONTRIBUTING.md** - Contribution process

### Common Tasks

**Adding a framework integration:** follow [AGENTS.md](../../AGENTS.md#adding-a-new-framework-integration).

**Releasing:** follow [docs/RELEASING.md](../../docs/RELEASING.md). Pushing a `vX.Y.Z` tag on `main` runs the publish workflow (`.github/workflows/publish.yml`), which publishes the renderer, then the framework. Publishing by hand is only for when the workflow fails, and always uses `yarn npm publish`.

## Versions

From the `package.json` files:

- **Node.js**: 20.16.0+, 22.19.0+, or 24.0.0+
- **Yarn**: 4.12.0
- **TypeScript**: 5.8.3+ in the repo; the framework accepts TypeScript 5 or 6
- **Vite**: 6.4.1+, 7, or 8
- **Storybook**: 10 (the integration apps use 10.6.0)
- **Astro**: 5.5.3+, 6, or 7

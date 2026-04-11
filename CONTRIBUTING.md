# Contributing to Storybook Astro

Thank you for your interest in contributing! This project is community-driven and welcomes contributions of all kinds — bug fixes, new features, documentation improvements, and more.

## Getting Started

### Prerequisites

- **Node.js**: 20.16.0+, 22.19.0+, or 24.0.0+
- **Yarn**: 4+ (Berry)

### Setup

1. Fork the repository: [github.com/storybook-astro/storybook-astro](https://github.com/storybook-astro/storybook-astro)
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR-USERNAME/storybook-astro.git
   cd storybook-astro
   ```
   Or clone the main repo directly if you have write access:
   ```bash
   git clone https://github.com/storybook-astro/storybook-astro.git
   ```
3. Install dependencies:
   ```bash
   yarn install
   ```
4. Start both Storybook instances and the website simultaneously:
   ```bash
   yarn dev
   ```
   This runs the Astro 6 demo on port **6006**, the Astro 5 demo on port **6007**, and the marketing website in parallel.

   Or start a single Storybook instance:
   ```bash
   # Astro 6 (port 6006)
   yarn workspace @storybook-astro/integration-astro6 storybook

   # Astro 5 (port 6007)
   yarn workspace @storybook-astro/integration-astro5 storybook
   ```
5. Run tests:
   ```bash
   yarn test
   ```

## Branching Strategy

| Branch | Purpose |
|--------|---------|
| `main` | Stable, deployable branch. All releases are tagged from here. |
| `develop` | Integration branch for in-progress work. PRs merge here first. |
| `feature/*` | Feature branches off `develop` (e.g. `feature/vue-slots`) |
| `fix/*` | Bug fix branches off `develop` |
| `release/*` | Release prep branches off `develop`, merged to `main` when ready |

### Workflow

1. Create a branch from `develop`:
   ```bash
   git checkout develop
   git checkout -b feature/your-feature
   ```
2. Make your changes
3. Run linting and fix any issues:
   ```bash
   yarn lint
   ```
   To auto-fix what ESLint can handle:
   ```bash
   yarn lint:fix
   ```
   **PRs must pass linting** — CI will reject PRs with lint errors.
4. Run `yarn test` to ensure all tests pass
5. Open a PR targeting `develop`
5. Once reviewed and merged, your changes will be included in the next release

### Releases

When `develop` is ready for a release:
1. Create a `release/x.y.z` branch from `develop`
2. Final testing and version bumps
3. Merge to `main` and tag the release
4. Publish to npm
5. Merge back to `develop`

### Hotfixes

For critical bugs in production:
1. Branch from `main` as `fix/critical-bug`
2. Fix and test
3. Merge to both `main` and `develop`

## Code Conventions

- **ES Modules only** — All packages use `"type": "module"`
- **Explicit file extensions** — Use `.ts`, `.tsx`, `.js` in imports
- **Yarn 4+ workspaces** — Use `workspace:*` for internal dependencies
- **TypeScript** — Used throughout with proper types where possible
- **`AstroRenderer`** (extending `WebRenderer`) is the canonical Storybook renderer type

## Project Structure

This is a monorepo managed with Yarn 4 workspaces:

**Packages** (published to npm):
- **`packages/@storybook-astro/framework`** — Server-side framework integration (Vite plugins, Astro Container, middleware)
- **`packages/@storybook-astro/renderer`** — Client-side rendering logic (canvas rendering, HMR, style management)

**Apps and integration examples** (private, not published):
- **`apps/website`** — Marketing website at storybook-astro.org
- **`integration/astro6`** — Integration example using Astro 6 (also deployed as demo)
- **`integration/astro5`** — Integration example using Astro 5.17.2 (stable)

See `AGENTS.md` for detailed architecture documentation and AI-assisted development guidance.

## Testing

Run the full test suite before submitting a PR:

```bash
yarn test
```

All 17 test suites (36 tests) should pass, covering Astro, React, Vue, Svelte, Preact, Solid, and Alpine.js components.

### Manual Testing

```bash
# Test with Astro 6
yarn workspace @storybook-astro/integration-astro6 storybook

# Test with Astro 5
yarn workspace @storybook-astro/integration-astro5 storybook
```

Check the browser console for errors and verify your changes work across different component types and Astro versions.

## Adding a New Framework Integration

1. Create an integration file in `packages/@storybook-astro/framework/src/integrations/`
2. Implement the `Integration` interface from `base.ts`
3. Export a factory function in `integrations/index.ts`
4. Add example components and stories in the integration examples
5. Add tests

See `AGENTS.md` for a detailed template and walkthrough.

## Questions?

- Open a [GitHub Issue](https://github.com/storybook-astro/storybook-astro/issues) for bugs or feature requests
- See [AGENTS.md](./AGENTS.md) for technical architecture details

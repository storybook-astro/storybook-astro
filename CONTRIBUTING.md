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
   yarn workspace @storybook-astro/integration-astro6 dev

   # Astro 5 (port 6007)
   yarn workspace @storybook-astro/integration-astro5 dev
   ```
5. Run tests:
   ```bash
   yarn test
   ```

   Build everything:
   ```bash
   yarn build
   ```

   Serve all prebuilt apps:
   ```bash
   yarn serve
   ```

## Branching Strategy

| Branch | Purpose |
|--------|---------|
| `main` | Stable, deployable branch. All releases are tagged from here. |
| `develop` | Integration branch for in-progress work. PRs merge here first. |
| `website` | What Cloudflare deploys to storybook-astro.org. Gets stable releases, published hotfixes and website-only changes |
| `feature/*` | Feature branches off `develop` (e.g. `feature/vue-slots`) |
| `fix/*` | Bug fix branches off `develop` (hotfixes branch off `main`) |
| `next` | Until 2.0.0 is released: 2.0 work (Storybook 11 only). Branch from `next` and open the PR to `next` for issues on the `2.0.0` milestone |

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
5. If the change was written with an AI assistant, have a fresh AI session review it before you open the PR — see [Before Opening a PR](./AGENTS.md#before-opening-a-pr) in `AGENTS.md`. Changes written by hand skip this step and go straight to the normal PR review
6. Open a PR targeting `develop`
7. Once reviewed and merged, your changes will be included in the next release

### Releases and hotfixes

Maintainers release by merging `develop` into `main` and `website` and tagging `main`, which publishes to npm. Hotfixes branch from `main`, go to `main` and `develop` by PR, and reach `website` after the patch is published. See [`docs/RELEASING.md`](./docs/RELEASING.md) for both.

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
yarn workspace @storybook-astro/integration-astro6 dev

# Test with Astro 5
yarn workspace @storybook-astro/integration-astro5 dev
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

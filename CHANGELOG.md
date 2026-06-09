# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.4.0] - 2026-06-09

### Added
- Astro 6 Font Provider API — font providers declared in `astro.config` are now resolved and injected during Storybook SSR

### Fixed
- User `astro.config` integrations are now auto-loaded into Vite, so framework-specific plugins (e.g. `@astrojs/react`) no longer need manual configuration
- Tsconfig path aliases (e.g. `@/components/...`) now resolve correctly for embedded island hydration
- Renderer annotations are now composed into `definePreview` for CSF4 compatibility

## [1.3.0] - 2026-06-06

### Added
- Factory story-rule mocks — `defineStoryRules` now supports factory functions for dynamic mock values

### Fixed
- Date props (e.g. `pubDate`) now survive JSON serialization across the render pipeline — previously caused `date.toISOString is not a function` errors in components like FormattedDate
- Restored missing `./node` export dropped during dist migration
- Removed preset re-export from index entry to prevent bundler conflicts and excluded framework from Vite `optimizeDeps`
- Hydrated framework component styles now emitted correctly in static prerender builds
- `defineStoryRules` and `StoryRule` types moved to the `./node` entry so they resolve in Node-only contexts
- Scoped `hasDefaultExport` check to `.jsx/.tsx` files only in the hydratable component scan
- Renderer now clears the canvas when switching between framework renderers, preventing stacked DOM from different frameworks
- Suppressed unanalyzable dynamic import warning emitted by Vite during SSR
- Restored built server hydration and interactive behavior for server-mode stories
- Astro container now loaded via Vite SSR for correct slot class identity
- Excluded `fsevents` and `preview-api` from `optimizeDeps` to prevent bundling errors

### Changed
- Unified Astro render pipeline and shared production render runtime across dev, static, and server modes
- Simplified Vite plugin naming conventions
- Integration examples now consume compiled package dist instead of source

## [1.2.0] - 2026-05-09

### Added
- Controls panel is now automatically disabled for Astro stories in production (static Storybook) builds

### Fixed
- Resolved broken images and escaped slot HTML in static prerender
- Alpine.js component detection no longer incorrectly includes plain `.ts`/`.js` files in the hydratable source scan
- Svelte and Vue component chunks now emitted directly instead of through virtual modules, improving static build compatibility
- Prevented `vite-plugin-svelte` from processing component virtual module stubs
- Passthrough image service now correctly injected during Astro 6 build prerender
- React plugin `include` filter in vitest configs now uses a RegExp for compatibility with more project setups
- `setProjectAnnotations`, `composeStory`, and `composeStories` are now generic over renderer type for improved TypeScript support
- Widened `@vitejs/plugin-vue` peer dep range to `^5.2.3 || ^6.0.0` and `@vitejs/plugin-vue-jsx` to `^4.1.2 || ^5.0.0` — fixes install conflict when using `@astrojs/vue@6`

## [1.1.1] - 2026-05-07

### Fixed
- Stubbed `astro:toolbar:internal` virtual module in Storybook context to prevent build errors with Astro's internal toolbar module
- Renderer now resolved via `import.meta.resolve` for compatibility with pnpm installations

## [1.1.0]

### Added
- Nested Astro component rendering support — components can now include other Astro components as children
- Image support via astro:assets Image component — integrated passthrough image service into the renderer
- definePreview and defineMain helpers for improved type safety and DX in preview.js and main.js files
- Pre-release smoke test infrastructure — validates compiled packages work in real Astro 5 and 6 projects before publishing
- Astro integration virtual module stubs (@astrojs/react:opts, astro:preact:opts, etc.)

### Fixed
- TypeScript declarations now properly generated with tsconfig.json in both packages
- Resolved implicit any and Integration[] | undefined type errors in middleware plugin
- Virtual module ambient declarations now globally visible across the framework
- Middleware path correctly resolved from compiled dist chunks
- Global setup correctly compiled and resolved from dist/
- Server entry resolved correctly from package root for tarball installations
- Framework package now includes @storybook/builder-vite in smoke test dependencies
- Removed invalid --no-telemetry flag from storybook build
- Fixed portable timeout wrapper in smoke test orchestration

### Changed
- Release Manager skill updated with release branch cutting workflow
- Documentation updated for nested component support and assets handling

## [1.0.3] - 2026-03-24

### Fixed
- Fixed Astro 5.17.2+ compatibility by requiring Vite 6.4.1+ — the framework package previously allowed Vite 5.x which caused "Cannot read properties of undefined (reading 'name')" error due to missing Vite 6+ `this.environment` feature

## [1.0.2] - 2026-03-24

### Added
- Vite 5.4.0+ support — framework package now compatible with Astro 5 projects using Vite 5.x

### Fixed
- Astro 5 projects with Vite 5.4.21+ can now install `@storybook-astro/framework` without peer dependency conflicts

## [1.0.1] - 2026-03-24

### Fixed
- `storybook dev` now works correctly with fresh npm installs — previously produced a `Failed to load astro-prerendered-stories.json. Received 404 Not Found` error or a blank "Astro Component / requires server-side rendering" placeholder
- Added `@storybook-astro/renderer` to Vite `optimizeDeps.exclude` in the framework preset, preventing esbuild pre-bundling from stripping `import.meta.hot` out of the renderer chunk
- Changed `getViteHot()` in the renderer to access `import.meta.hot` directly rather than via an intermediate variable — Vite's `importAnalysis` plugin detects hot usage by static analysis on the literal `import.meta.hot` string; the previous indirect pattern compiled by tsup was invisible to this analysis
- `renderAstroToCanvas` now catches a prerendered stories fetch failure gracefully and falls through to HMR rendering with a clear console warning, instead of crashing with a confusing network error (defensive fallback)

## [1.0.0] - 2026-03-24

### Added
- Stable 1.0.0 release with production-ready Storybook Astro framework
- Full support for Astro 5 (5.5.3+) and Astro 6
- Multi-framework support: React, Vue, Svelte, Solid, Preact, Alpine.js
- Server-side rendering with middleware pipeline
- Portable stories (composeStories) for vitest integration
- Comprehensive testing utilities and framework integration helpers

### Changed
- Framework now production-ready after extensive beta testing and monorepo restructuring
- Improved documentation and Getting Started guide
- Enhanced website with component demos across all frameworks

## [0.1.0-beta.13] - 2026-02-18

### Changed
- Documentation and website updated to reflect support for both Astro 5 (5.5.3+) and Astro 6 Beta
- Framework package description, README, Getting Started guide, and root README now list Astro 5 + 6

## [0.1.0-beta.12] - 2026-02-17

### Changed
- Migrated repository from `lukemcd/storybook-astro` to `storybook-astro/storybook-astro`
- Restructured as a monorepo with Yarn workspaces (`packages/@storybook-astro/*`, `apps/*`)
- Marketing website separated into `apps/website/`
- Storybook demo/test project moved to `apps/sandbox-astro6/`
- Added Astro 5 sandbox (`apps/sandbox-astro5/`) for cross-version compatibility testing
- Root `package.json` stripped to monorepo config with shared devDeps only

### Added
- Getting Started guide (`docs/GETTING_STARTED.md`) with detailed story file and Astro slots documentation
- Package README for npm display
- `findPackageDir` helper in `cjsInteropPlugin` for monorepo-aware `node_modules` resolution

### Fixed
- `cjsInteropPlugin` now walks up from `process.cwd()` to find hoisted packages in monorepo structure
- ESLint config updated for monorepo paths and Svelte parser compatibility
- CI workflow updated with workspace-based builds and `timeout` for hung Storybook processes
- Website build fixes: resolved missing assets, styles, and README path for monorepo layout

## [0.1.0-beta.7] - 2026-02-16

### Fixed
- Ensure `integrations ?? []` guard survives tsup compilation (default parameter was stripped)

## [0.1.0-beta.6] - 2026-02-16

### Fixed
- Handle undefined `integrations` option — Storybook now starts without requiring integrations in framework options
- Add `@storybook/builder-vite` to install instructions

## [0.1.0-beta.5] - 2026-02-16

### Fixed
- Use `npm publish` compatible version for `@storybook-astro/renderer` dependency (was `workspace:*` which only Yarn resolves)

## [0.1.0-beta.4] - 2026-02-16

### Fixed
- Remove wildcard `*` hard dependencies (react, vue, svelte, etc.) from framework package that caused install failures — these are peer dependencies only

## [0.1.0-beta.3] - 2026-02-16

### Fixed
- Astro 6 peer dependency fix was missing from beta.2 publish due to branch sync issue

## [0.1.0-beta.2] - 2026-02-16

### Fixed
- Astro 6 peer dependency compatibility — `astro` peer dep now accepts `^5.5.3 || ^6.0.0-beta.0`
- All `@astrojs/*` integration peer deps updated for Astro 6 beta versions

### Added
- `yarn lint` and `yarn lint:fix` scripts
- Versioning and branching strategy documentation (`docs/VERSIONING.md`)
- Storybook docs panel typography overrides for light background readability
- Mobile hamburger navigation for the website

### Changed
- Accordion components updated to dark theme styling across all 7 frameworks
- Website "Components Demo" renamed to "Sample Components"
- Navigation reordered: About, Contribute, Sample Components, Storybook Demo
- About page text contrast improved (`#c9d1d9` for paragraphs/lists, styled inline code and code blocks)

## [0.1.0-beta.1] - 2025-06-15

### Added
- Astro 6 component rendering in Storybook via the Container API
- Multi-framework support: React, Vue, Svelte, Solid, Preact, Alpine.js
- Server-side rendering with middleware pipeline
- Portable stories (`composeStories`) for vitest integration
- Testing utilities (`testStoryRenders`, `testStoryComposition`)
- Framework integration helpers with glob-based routing
- Astro website with component demos and documentation
- Header and Footer components with configurable props and Storybook controls
- Contribute page and CONTRIBUTING.md with branching strategy

### Notes
- Requires Astro 6 (beta) and Storybook 8.6+
- This is the first public beta release under the `@storybook-astro` organization

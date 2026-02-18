# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

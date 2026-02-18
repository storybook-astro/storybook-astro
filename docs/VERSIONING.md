# Versioning and Branching Strategy

This document defines how the project handles versioning, branching, and the distinction between **package releases** and **website-only updates**.

## Overview

The repository contains two categories of content:

- **Packages** — `@storybook-astro/framework` and `@storybook-astro/renderer` in `packages/@storybook-astro/*`. These are published to npm and follow semantic versioning with a formal release process.
- **Website** — The Astro site at `apps/website/`. Deployed to [storybook-astro.org](https://storybook-astro.org) via CloudFlare. Website changes do **not** require a package release.
- **Sandbox Apps** — Test projects at `apps/sandbox-astro5/` and `apps/sandbox-astro6/` for validating the framework against different Astro versions. Changes to sandbox apps do not require a package release.

## Versioning

The project follows [Semantic Versioning](https://semver.org/):

- **Major** (`x.0.0`) — Breaking API changes
- **Minor** (`0.x.0`) — New features, backward-compatible
- **Patch** (`0.0.x`) — Bug fixes, backward-compatible

During beta, versions use the format `0.x.y-beta.z` (e.g. `0.1.0-beta.1`). Pre-release versions are published to npm with the `beta` dist-tag.

Only the packages in `packages/@storybook-astro/*` are versioned and published. The website, sandbox apps, stories, and root project config are not versioned separately.

## Branches

- **`main`** — Stable, deployable branch. Package releases are tagged here. Website deploys from here.
- **`develop`** — Integration branch for in-progress package work. Feature and fix PRs merge here first.
- **`feature/*`** — New features, branched from `develop` (e.g. `feature/vue-slots`).
- **`fix/*`** — Bug fixes, branched from `develop`.
- **`release/*`** — Release prep, branched from `develop` and merged to `main` when ready.

## Workflow: Package Changes (Releases)

Changes to anything under `packages/@storybook-astro/*` follow the full Gitflow process:

1. Branch from `develop` (e.g. `feature/container-api-update`)
2. Implement and test changes (`yarn test`, `yarn lint`)
3. Open a PR targeting `develop`
4. After review and merge, the change sits in `develop` until the next release

### Cutting a Release

1. Bump versions in both `packages/@storybook-astro/renderer/package.json` and `packages/@storybook-astro/framework/package.json`
2. Update `CHANGELOG.md`
3. Commit, push to `develop`
4. Merge `develop` into `main` and push
5. Tag on `main` and push the tag:
   ```bash
   git tag v0.1.0-beta.N
   git push origin v0.1.0-beta.N
   ```
6. The `v*` tag triggers the **Publish to npm** GitHub Actions workflow (`.github/workflows/publish.yml`), which:
   - Runs `yarn lint` and tests for both Astro 5 and Astro 6 sandboxes
   - Clean-builds both packages (`rm -rf dist && yarn build:packages`)
   - Publishes renderer first, then framework, with the `beta` dist-tag
   - Promotes both packages to the `latest` dist-tag
7. Verify the publish succeeded:
   ```bash
   gh run list --repo storybook-astro/storybook-astro --workflow publish.yml --limit 1
   npm view @storybook-astro/framework versions --json
   ```
8. Merge `main` back into `develop` if needed

> **Convention**: Only tag on `main`. The workflow triggers on any `v*` tag push regardless of branch, so tagging on `develop` or a feature branch would publish from an unreleased state.

### Automated Publish Workflow

The publish workflow (`.github/workflows/publish.yml`) handles the full build-and-publish pipeline. It requires an `NPM_TOKEN` secret in the GitHub repo settings — a granular npm access token scoped to the `@storybook-astro` organization with read/write package permissions.

The workflow uses `yarn npm publish` (not raw `npm publish`) because the framework package depends on the renderer via `"@storybook-astro/renderer": "workspace:*"`. Yarn Berry resolves `workspace:*` to the actual version number at publish time. Raw `npm publish` does not understand the `workspace:` protocol and will publish it verbatim, causing install failures for consumers.

### Manual Publishing (Fallback)

If the automated workflow fails or manual publishing is needed:

```bash
cd packages/@storybook-astro/renderer
rm -rf dist && yarn build
yarn npm publish --tag beta --access public

cd ../framework
rm -rf dist && yarn build
yarn npm publish --tag beta --access public

# Promote to latest
npm dist-tag add @storybook-astro/renderer@x.y.z-beta.N latest
npm dist-tag add @storybook-astro/framework@x.y.z-beta.N latest
```

> **Warning — stale builds**: The `prepublishOnly` hook runs `tsup`, but tsup may produce a cached/stale build that omits recent source changes. Always `rm -rf dist` and rebuild explicitly before publishing.

### Hotfixes

For critical bugs in a published release:

1. Branch from `main` as `fix/critical-bug`
2. Fix, test, bump patch version
3. Merge to both `main` and `develop`
4. Tag on `main` and push — the publish workflow handles the rest

## Workflow: Website-Only Changes

Changes that only affect the website (`apps/website/`) do **not** go through the release process. These changes:

- Can be merged directly to `main` via PR
- Do not require a version bump or changelog entry
- Do not require an npm publish
- Are deployed automatically when `main` is updated (via CloudFlare)

### Examples of Website-Only Changes

- Updating page copy or styling in `apps/website/`
- Adding or editing docs pages
- Fixing layout or navigation bugs
- Updating the home page hero or feature grid
- Changing `apps/website/astro.config.mjs` settings

### How to Identify Website-Only Changes

A PR is website-only if it **only** touches files under `apps/website/` and does not touch:

- `packages/@storybook-astro/framework/**`
- `packages/@storybook-astro/renderer/**`
- Root config that affects packages (e.g. `tsconfig.json`, `tsconfig.base.json`)

### Process

1. Branch from `main` (e.g. `website/update-hero`)
2. Make website changes
3. Open a PR targeting `main`
4. After review and merge, CloudFlare deploys automatically

## Mixed Changes

If a PR includes both package and website changes, it must follow the **package release workflow** (branch from `develop`, merge to `develop`, release to `main`). The website updates will deploy when the release is merged to `main`.

## Summary

| Change Type | Branch From | PR Target | Version Bump | npm Publish | Deploy |
|---|---|---|---|---|---|
| Package feature/fix | `develop` | `develop` | Yes (at release) | Yes | At release |
| Website-only | `main` | `main` | No | No | On merge |
| Hotfix | `main` | `main` + `develop` | Yes (patch) | Yes | On merge |
| Mixed | `develop` | `develop` | Yes (at release) | Yes | At release |

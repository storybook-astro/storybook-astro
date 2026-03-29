---
name: release-manager
description: Manage semantic versioning, changelogs, and package publishing for Storybook Astro
---

# Release Manager Skill

Guide for managing semantic version releases of the Storybook Astro packages (`@storybook-astro/framework` and `@storybook-astro/renderer`) to npm.

## What This Skill Does

Helps with:
- **Version bumping** — Updating semantic versions (major/minor/patch) for both packages
- **Changelog management** — Adding and organizing entries in CHANGELOG.md
- **Release validation** — Verifying tests pass and linting succeeds
- **Git workflow** — Proper branching, tagging, and merge strategies
- **Publishing** — Managing npm publication with correct dist-tags
- **Hotfixes** — Fast-track release process for critical bugs

## Key Concepts

### Versioning

Storybook Astro follows [Semantic Versioning](https://semver.org/):
- **Major** (`x.0.0`) — Breaking API changes
- **Minor** (`0.x.0`) — New features, backward-compatible
- **Patch** (`0.0.x`) — Bug fixes, backward-compatible

**Beta format**: `0.x.y-beta.z` (e.g., `0.1.0-beta.14`)

Only packages under `packages/@storybook-astro/*` are versioned:
- `@storybook-astro/framework`
- `@storybook-astro/renderer`

The website, integration examples, and component library are NOT versioned separately.

### Branches

- **`main`** — Stable, deployable. Package releases tagged here. Website deploys from here.
- **`develop`** — Integration branch for in-progress work. Features/fixes merge here first.
- **`feature/*`** — New features, branched from `develop` (e.g., `feature/vue-slots`)
- **`fix/*`** — Bug fixes, branched from `develop`
- **`release/*`** — Release prep, branched from `develop`, merged to `main`

## Release Workflow

### Standard Release (Features/Fixes)

**1. Prepare on `develop` branch**

Changes accumulate on `develop` until a release is needed. When ready:

```bash
# Switch to develop and pull latest
git checkout develop
git pull origin develop
```

**2. Cut release branch**

Create a release branch from `develop` for this specific version:

```bash
# Create and switch to release branch (e.g., release/0.1.0-beta.14)
git checkout -b release/0.1.0-beta.14
git push origin release/0.1.0-beta.14
```

> **Convention**: Release branches follow the pattern `release/X.Y.Z-beta.N` and allow for last-minute fixes without blocking `develop`.

**3. Bump versions**

Update BOTH package files:
- `packages/@storybook-astro/renderer/package.json`
- `packages/@storybook-astro/framework/package.json`

Use the same version for both (they're always released together):

```json
{
  "version": "0.1.0-beta.14"
}
```

**4. Update CHANGELOG.md**

Add a new section at the top with the version and date:

```markdown
## [0.1.0-beta.14] - 2026-03-15

### Added
- New feature description

### Changed
- Modified behavior description

### Fixed
- Bug fix description
```

Format follows [Keep a Changelog](https://keepachangelog.com/).

Sections:
- `Added` — New features
- `Changed` — Behavior changes
- `Fixed` — Bug fixes
- `Deprecated` — Deprecated features
- `Removed` — Removed features
- `Security` — Security fixes

**5. Commit and push to release branch**

```bash
git add packages/*/package.json CHANGELOG.md
git commit -m "chore: release v0.1.0-beta.14"
git push origin release/0.1.0-beta.14
```

**6. Merge release branch into `main`**

```bash
git checkout main
git pull origin main
git merge --no-ff release/0.1.0-beta.14
git push origin main
```

**7. Tag on `main` and push**

Tags trigger the publish workflow:

```bash
git tag v0.1.0-beta.14
git push origin v0.1.0-beta.14
```

> **Convention**: Only tag on `main`. Tagging on `develop` or other branches would publish from an unreleased state.

**8. Verify publish succeeded**

The `.github/workflows/publish.yml` workflow automatically:
- Runs `yarn lint` and tests (both Astro 5 and 6)
- Builds both packages (`rm -rf dist && yarn build:packages`)
- **Runs smoke tests** — installs packed tarballs into clean Astro 5 and 6 projects outside the workspace, runs `storybook build` and vitest to validate the compiled dist before any publish step
- Publishes renderer first, then framework with `beta` dist-tag
- Promotes both to `latest` dist-tag

Check status:

```bash
# Check workflow run
gh run list --repo storybook-astro/storybook-astro --workflow publish.yml --limit 1

# Verify npm packages
npm view @storybook-astro/framework versions --json
npm view @storybook-astro/renderer versions --json
```

**9. Merge `main` back to `develop` (optional)**

If there are conflicts or just to keep branches in sync:

```bash
git checkout develop
git merge main
git push origin develop
```

## Hotfix Workflow

For critical bugs in published releases:

**1. Branch from `main`**

```bash
git checkout main
git pull origin main
git checkout -b fix/critical-bug-name
```

**2. Fix and test**

Make the fix, test thoroughly:

```bash
yarn test
yarn lint
```

**3. Bump patch version only**

In both `package.json` files, increment patch:

```json
// Was: 0.1.0-beta.13
// Now: 0.1.0-beta.14 (or 0.1.1 if releasing from stable)
```

**4. Update CHANGELOG.md**

Add hotfix entry at top with current date.

**5. Commit to both branches**

```bash
git add packages/*/package.json CHANGELOG.md
git commit -m "fix: critical bug fix

Description of what was fixed."
git push origin fix/critical-bug-name
```

Open PR to `main` and `develop`, merge both after review.

**6. Tag on `main`**

```bash
git checkout main
git tag v0.1.0-beta.14
git push origin v0.1.0-beta.14
```

The publish workflow handles the rest.

## Publishing (If Automated Fails)

### Manual Publish Fallback

If the GitHub Actions workflow fails:

```bash
# Build and publish renderer
cd packages/@storybook-astro/renderer
rm -rf dist && yarn build
yarn npm publish --tag beta --access public

# Build and publish framework
cd ../framework
rm -rf dist && yarn build
yarn npm publish --tag beta --access public

# Promote both to latest
npm dist-tag add @storybook-astro/renderer@0.1.0-beta.14 latest
npm dist-tag add @storybook-astro/framework@0.1.0-beta.14 latest
```

> **Warning**: Always `rm -rf dist` before building. tsup may cache stale builds.

### Publish Prerequisites

- `NPM_TOKEN` secret configured in GitHub repo settings
- Token must be granular npm access token scoped to `@storybook-astro` org with read/write permissions
- Published with `yarn npm publish` (not `npm publish`) to handle `workspace:*` protocol

## Website-Only Changes

Website-only changes (to `apps/website/`) do **not** require a release:

```
Branch from: main
Merge to: main
Version bump: NO
npm publish: NO
Deploy: Automatic via CloudFlare
```

Examples:
- Documentation updates
- Homepage styling changes
- Navigation fixes
- Copy updates

Website deploys automatically when `main` is updated.

## Mixed Changes

If a PR includes both package and website changes, follow the **standard release workflow**. Website updates will deploy when the release merges to `main`.

## Common Issues

### Stale Build Artifacts

**Problem**: Published code doesn't include recent changes

**Solution**: Always `rm -rf dist` before building:

```bash
rm -rf dist && yarn build:packages
```

Run `yarn validate:dist` after building to confirm all `publishConfig.exports` paths exist in `dist/` before proceeding.

### Smoke Test Failures

**Problem**: `yarn smoke` or the publish workflow smoke step fails

**What it means**: The compiled, packed package cannot be installed or used in a real project. This is a blocking issue — do not publish.

**Debug steps**:
1. The working directory is preserved at `/tmp/sb-smoke-*` on failure — inspect it
2. Check `storybook build` output for Vite/import errors (often a missing `external` in tsup)
3. Check vitest output for runtime rendering errors
4. Run `yarn validate:dist` separately to isolate missing dist files

```bash
# Run smoke test manually against a single version
yarn smoke 6 fresh
```

### Workspace Protocol Not Resolved

**Problem**: Framework package has `workspace:*` reference that doesn't resolve

**Solution**: Use `yarn npm publish` (not `npm publish`). Yarn resolves `workspace:*` to actual versions at publish time.

### Failed Tests Before Release

**Problem**: `yarn test` or `yarn lint` fails before releasing

**Solution**: Fix issues on `develop` branch and re-test before bumping versions and tagging.

Tests run against both Astro 5 and Astro 6 integration examples:
```bash
yarn workspace @storybook-astro/integration-astro5 test
yarn workspace @storybook-astro/integration-astro6 test
```

### Wrong Tag Location

**Problem**: Tagged on `develop` instead of `main`

**Solution**: Delete the tag and recreate on main:

```bash
git tag -d v0.1.0-beta.14
git push origin :v0.1.0-beta.14  # Delete from remote

git checkout main
git tag v0.1.0-beta.14
git push origin v0.1.0-beta.14
```

## Checklist

Use this before releasing:

- [ ] All features/fixes on `develop` branch
- [ ] Release branch created: `git checkout -b release/X.Y.Z-beta.N`
- [ ] Both `packages/@storybook-astro/*/package.json` files updated to same version
- [ ] CHANGELOG.md updated with new version section and entries
- [ ] `yarn lint` passes
- [ ] `yarn test` passes (both Astro 5 and 6)
- [ ] `yarn build:packages` succeeds (clean build — `rm -rf dist` first)
- [ ] `yarn validate:dist` passes (all publishConfig.exports paths exist in dist)
- [ ] `yarn smoke` passes (tarball install + storybook build + tests on Astro 5 and 6)
- [ ] Changes committed and pushed to release branch
- [ ] Release branch merged into `main` and pushed
- [ ] Tag created on `main`: `git tag vX.Y.Z-beta.N`
- [ ] Tag pushed to remote: `git push origin vX.Y.Z-beta.N`
- [ ] Publish workflow completes successfully (includes automated smoke test)
- [ ] `npm view @storybook-astro/framework versions --json` shows new version
- [ ] `npm dist-tag ls @storybook-astro/framework` shows `latest` pointing to new version

## References

- `docs/RELEASING.md` - Full release walkthrough (standard, hotfix, website-only)
- `CHANGELOG.md` - Release history and change entries
- `packages/@storybook-astro/framework/package.json` - Framework package config
- `packages/@storybook-astro/renderer/package.json` - Renderer package config
- `.github/workflows/publish.yml` - Automated publish workflow
- `.github/workflows/smoke-test.yml` - Smoke test CI workflow (runs on PRs to main)
- `scripts/smoke-test.sh` - Smoke test orchestration script (`yarn smoke`)
- `scripts/validate-dist.js` - Dist validation script (`yarn validate:dist`)
- `smoke/templates/` - Minimal Astro project templates used by smoke tests
- [Semantic Versioning](https://semver.org/)
- [Keep a Changelog](https://keepachangelog.com/)

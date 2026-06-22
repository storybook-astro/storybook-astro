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

**Beta format**: `0.x.y-beta.z` (e.g., `0.1.0-beta.14`) — promoted to `latest` automatically

**Test/preview format**: `0.x.y-<label>.z` where `<label>` is one of `next`, `alpha`, `canary`, `rc`, or `test` (e.g., `0.1.0-next.1`, `0.1.0-canary.3`) — published under the matching dist-tag only, never promoted to `latest`

Only packages under `packages/@storybook-astro/*` are versioned:
- `@storybook-astro/framework`
- `@storybook-astro/renderer`

The website, integration examples, and component library are NOT versioned separately.

### Branches

- **`main`** — Stable, deployable. Package releases tagged here. All releases (including canary) merge here first to trigger the publish workflow.
- **`website`** — What Cloudflare deploys to storybook-astro.org. Only stable releases and website-only changes reach this branch. Canary releases never touch it, so the website always reflects what's in the `latest` npm dist-tag.
- **`develop`** — Integration branch for in-progress work. Features/fixes merge here first.
- **`feature/*`** — New features, branched from `develop` (e.g., `feature/vue-slots`)
- **`fix/*`** — Bug fixes, branched from `develop`
- **`release/*`** — Release prep, branched from `develop`, merged to `main` and `website`

### Deploy pipeline

The Cloudflare Pages worker watches the `website` branch. This keeps the public website in sync with what's actually in the `latest` npm dist-tag:

| Release type | Goes to `main`? | Goes to `website`? |
|---|---|---|
| Standard (beta/stable) | Yes | Yes |
| Hotfix | Yes | Yes |
| Canary / next / alpha / rc | Yes (publish trigger only) | **No** |
| Website-only | Yes | Yes |

Do not push website content changes (docs, changelog updates) to `main` as part of a canary release. Those changes live on `develop` until the next stable/beta release.

## Release Workflow

### Standard Release (Features/Fixes)

**1. Prepare on `develop` branch**

Changes accumulate on `develop` until a release is needed. When ready:

```bash
# Switch to develop and pull latest
git checkout develop
git pull origin develop
```

**2. Bump versions and update changelogs on `develop`**

> **Important**: Version bumps, CHANGELOG.md, and the website changelog must all be committed to `develop` **before** cutting the release branch. This prevents merge conflicts with `main`, which may have changelog entries from previous releases that `develop` hasn't seen yet.

Update BOTH package files to the same version:
- `packages/@storybook-astro/renderer/package.json`
- `packages/@storybook-astro/framework/package.json`

```json
{
  "version": "0.1.0-beta.14"
}
```

Add a new section at the top of CHANGELOG.md with the version and date:

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

**Website Changelog**: Also update `apps/website/src/content/docs/reference/changelog.md` with the same changes to keep the website changelog in sync.

Commit and push to `develop`:

```bash
git add packages/*/package.json CHANGELOG.md apps/website/src/content/docs/reference/changelog.md
git commit -m "chore: release v0.1.0-beta.14"
git push origin develop
```

**3. Cut release branch**

Create a release branch from `develop`. Since changelogs and versions are already committed, the release branch only exists for any last-minute fixes before merging to `main`.

```bash
git checkout -b release/0.1.0-beta.14
git push origin release/0.1.0-beta.14
```

> **Convention**: Release branches follow the pattern `release/X.Y.Z` or `release/X.Y.Z-beta.N`.

**4. Merge release branch into `main` and `website`**

```bash
git checkout main
git pull origin main
git merge --no-ff release/0.1.0-beta.14
git push origin main

git checkout website
git pull origin website
git merge --no-ff release/0.1.0-beta.14
git push origin website
```

The `website` branch is what Cloudflare deploys. Both branches get the same release commit.

**5. Tag on `main` and push**

Tags trigger the publish workflow:

```bash
git checkout main
git tag v0.1.0-beta.14
git push origin v0.1.0-beta.14
```

> **Convention**: Only tag on `main`. Tagging on `develop` or other branches would publish from an unreleased state.

**6. Verify publish succeeded**

The `.github/workflows/publish.yml` workflow automatically:
- Runs `yarn lint` and tests (both Astro 5 and 6)
- Builds both packages (`rm -rf dist && yarn build:packages`)
- **Runs smoke tests** — installs packed tarballs into clean Astro 5 and 6 projects outside the workspace, runs `storybook build` and vitest to validate the compiled dist before any publish step
- Publishes renderer first, then framework with `beta` dist-tag
- Promotes both to `latest` dist-tag

Check workflow status:

```bash
# Check workflow run
gh run list --repo storybook-astro/storybook-astro --workflow publish.yml --limit 1
```

The workflow should show a **✓** (success) status. If it shows an **X** (failed), check the logs with:

```bash
gh run view <RUN_ID> --repo storybook-astro/storybook-astro
```

**7. Confirm packages on npm**

This is the final verification step. Confirm both packages are published with the correct version and latest dist-tag:

```bash
# Check that new version exists in version list
npm view @storybook-astro/framework versions --json | grep X.Y.Z
npm view @storybook-astro/renderer versions --json | grep X.Y.Z

# Confirm latest dist-tag points to new version
npm dist-tag ls @storybook-astro/framework
npm dist-tag ls @storybook-astro/renderer

# Check package info
npm view @storybook-astro/framework@latest
npm view @storybook-astro/renderer@latest
```

Expected output:
- Both version lists include `X.Y.Z`
- Both `latest` dist-tags point to `X.Y.Z`
- Package info shows the correct version with correct description

If versions are missing or dist-tags are incorrect, refer to the **Manual Publish Fallback** section.

**8. Merge `main` back to `develop`**

Sync `main` back to `develop` so that changelog and version entries are present on both branches:

```bash
git checkout develop
git merge main
git push origin develop
```

> After a standard release, `main`, `website`, and `develop` should all be at the same commit (or `develop` may be ahead with in-progress work).

## Test/Preview Release Workflow

Use this when you want to publish a version for testing or previewing unreleased changes without affecting what `npm install @storybook-astro/framework` gives to end users.

The publish workflow detects the pre-release label in the version string and uses it as the dist-tag. Any label other than `beta` skips the "Promote to latest" step.

| Version format | Dist-tag | Promoted to `latest`? |
|---|---|---|
| `0.1.0-beta.14` | `beta` | Yes |
| `0.1.0-next.1` | `next` | No |
| `0.1.0-alpha.1` | `alpha` | No |
| `0.1.0-canary.1` | `canary` | No |
| `0.1.0-rc.1` | `rc` | No |

**When to use `next`**: Validating that a future `beta` release works before committing to it.

**When to use `canary`**: Publishing work-in-progress builds for early feedback.

**When to use `rc`**: Release candidates that are feature-complete and in final testing.

### Steps

**1. Bump versions to a test/preview identifier**

In both `packages/@storybook-astro/*/package.json`:

```json
{
  "version": "0.1.0-next.1"
}
```

**2. Commit and push — no changelog or website updates**

Canary/preview releases are transient. Changes will be captured in `CHANGELOG.md` and the website changelog when the real beta ships. Do not add a changelog entry and do not update `apps/website/`.

```bash
git add packages/*/package.json
git commit -m "chore: release v0.1.0-next.1 (canary)"
git push origin <branch>
```

**3. Merge to `main` only and tag**

> **Important**: Do NOT merge to `website`. Merging canary content to `website` would deploy docs for features that are not yet in the `latest` npm dist-tag, making the website out of sync with what users actually install.

```bash
git checkout main
git pull origin main
git merge --no-ff <branch>
git push origin main
git tag v0.1.0-next.1
git push origin v0.1.0-next.1
```

**5. Verify it did NOT become latest**

```bash
npm dist-tag ls @storybook-astro/framework
# Should show:  next: 0.1.0-next.1
# Should NOT show:  latest: 0.1.0-next.1
```

**6. Consumers install via dist-tag**

```bash
npm install @storybook-astro/framework@next
# or
npm install @storybook-astro/framework@canary
```

### Cleanup After Testing

Once the preview is no longer needed, remove the dist-tag to keep npm tidy:

```bash
npm dist-tag rm @storybook-astro/framework next
npm dist-tag rm @storybook-astro/renderer next
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

**5. Commit and push**

```bash
git add packages/*/package.json CHANGELOG.md apps/website/src/content/docs/reference/changelog.md
git commit -m "fix: critical bug fix

Description of what was fixed."
git push origin fix/critical-bug-name
```

Open PRs to `main`, `website`, and `develop`; merge all three after review.

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
Merge to: main AND website
Version bump: NO
npm publish: NO
Deploy: Automatic via CloudFlare (from website branch)
```

Examples:
- Documentation updates
- Homepage styling changes
- Navigation fixes
- Copy updates

```bash
git checkout main
git pull origin main
git checkout -b website/describe-change
# make changes
git push origin website/describe-change
gh pr create --base main    # merge to main first
gh pr create --base website # then merge to website to deploy
```

## Mixed Changes

If a PR includes both package and website changes, follow the **standard release workflow**. Website updates deploy when the release merges to `website`.

## Common Issues

### Stale Build Artifacts

**Problem**: Published code doesn't include recent changes

**Solution**: Always `rm -rf dist` before building:

```bash
rm -rf dist && yarn build:packages
```

Run `yarn smoke` after building to confirm the packed packages install and work before proceeding.

### Smoke Test Failures

**Problem**: `yarn smoke` or the publish workflow smoke step fails

**What it means**: The compiled, packed package cannot be installed or used in a real project. This is a blocking issue — do not publish.

**Debug steps**:
1. The working directory is preserved at `/tmp/sb-smoke-*` on failure — inspect it
2. Check `storybook build` output for Vite/import errors (often a missing `external` in tsup)
3. Check vitest output for runtime rendering errors
4. Rebuild packages and inspect package `exports` if a packed install reports missing dist files

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

### Version Changes Not in Commit

**Problem**: Workflow publishes with old version (e.g., 1.0.3 instead of 1.1.0), causing npm 403 error: "You cannot publish over the previously published versions"

**What it means**: The version bump changes in `package.json` files were not committed to git before pushing the release tag. The workflow checks out the committed code, not your working directory changes.

**Solution**:
1. Verify versions are updated in your working directory:
   ```bash
   cat packages/@storybook-astro/renderer/package.json | grep version
   cat packages/@storybook-astro/framework/package.json | grep version
   ```
2. Commit the changes:
   ```bash
   git add packages/*/package.json CHANGELOG.md
   git commit -a -m "chore: update versions to X.Y.Z"
   git push origin main
   ```
3. Delete and recreate the tag on the new commit:
   ```bash
   git tag -d vX.Y.Z
   git tag vX.Y.Z
   git push origin vX.Y.Z --force
   ```
4. The workflow will automatically re-trigger and use the correct versions

**Prevention**: Always verify versions are committed with `git show HEAD:packages/@storybook-astro/renderer/package.json | grep version` before tagging.

## Checklist

### Standard release

- [ ] All features/fixes on `develop` branch
- [ ] Both `packages/@storybook-astro/*/package.json` files updated to same version on `develop`
- [ ] CHANGELOG.md updated with new version section and entries on `develop`
- [ ] Website changelog at `apps/website/src/content/docs/reference/changelog.md` updated on `develop`
- [ ] Version and changelog changes committed and pushed to `develop`
- [ ] Release branch created from `develop`: `git checkout -b release/X.Y.Z`
- [ ] `yarn lint` passes
- [ ] `yarn test` passes (both Astro 5 and 6)
- [ ] `yarn build:packages` succeeds (clean build — `rm -rf dist` first)
- [ ] `yarn smoke` passes (tarball install + storybook build + tests on Astro 5 and 6)
- [ ] Release branch merged into `main` and pushed
- [ ] Release branch merged into `website` and pushed (triggers Cloudflare deploy)
- [ ] Tag created on `main`: `git tag vX.Y.Z`
- [ ] Tag pushed to remote: `git push origin vX.Y.Z`
- [ ] Publish workflow completes successfully (includes automated smoke test)
- [ ] `npm view @storybook-astro/framework versions --json` shows new version
- [ ] `npm dist-tag ls @storybook-astro/framework` shows `latest` pointing to new version
- [ ] `main` merged back to `develop`

### Test/preview release

- [ ] Version uses a non-`beta` pre-release label: `next`, `alpha`, `canary`, `rc`, or `test`
- [ ] Both `packages/@storybook-astro/*/package.json` files updated to same version
- [ ] **No** CHANGELOG.md or website changelog changes committed (those ship with the real beta)
- [ ] Branch merged into `main` only — **do not merge to `website`**
- [ ] Tag created on `main` and pushed: `git tag vX.Y.Z-<label>.N && git push origin vX.Y.Z-<label>.N`
- [ ] Publish workflow completes successfully
- [ ] `npm dist-tag ls @storybook-astro/framework` shows `<label>: X.Y.Z-<label>.N` but **not** `latest`

## References

- `docs/RELEASING.md` - Full release walkthrough (standard, hotfix, website-only)
- `CHANGELOG.md` - Release history and change entries
- `apps/website/src/content/docs/reference/changelog.md` - Website changelog reference page (links to GitHub CHANGELOG.md)
- `packages/@storybook-astro/framework/package.json` - Framework package config
- `packages/@storybook-astro/renderer/package.json` - Renderer package config
- `.github/workflows/publish.yml` - Automated publish workflow
- `.github/workflows/smoke-test.yml` - Smoke test CI workflow (runs on PRs to main)
- `scripts/smoke-test.sh` - Smoke test orchestration script (`yarn smoke`)
- `smoke/templates/` - Minimal Astro project templates used by smoke tests
- [Semantic Versioning](https://semver.org/)
- [Keep a Changelog](https://keepachangelog.com/)

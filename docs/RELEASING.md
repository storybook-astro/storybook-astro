# Creating a Release

Step-by-step guide for publishing a new version of `@storybook-astro/framework` and `@storybook-astro/renderer` to npm.

## Before you start

**Who publishes**: Maintainers with access to the `NPM_TOKEN` secret in GitHub repo settings.

**What gets published**: Only `packages/@storybook-astro/framework` and `packages/@storybook-astro/renderer`. The website, integration examples, and component library are not published.

**Branch rule**: Releases always tag from `main`. Never tag on `develop` or a feature branch — the publish workflow triggers on any `v*` tag push, regardless of branch.

**Milestone**: Each release has a GitHub milestone named for its version (`1.15.0`). Before you tag, every open issue on it is either fixed on `develop` or moved to the next release's milestone. Setting a milestone needs the API, because `gh issue edit --milestone` and `gh pr edit --milestone` fail in this repo (they still query the retired classic Projects):

```bash
gh api 'repos/storybook-astro/storybook-astro/milestones?state=all' --jq '.[] | "\(.number) \(.title) \(.state)"'
gh api -X PATCH repos/storybook-astro/storybook-astro/issues/<issue> -F milestone=<milestone-number>
```

---

## Decide the version number

Follow [Semantic Versioning](https://semver.org/):

| Change | Bump |
|---|---|
| Breaking API change | Major (`2.0.0`) |
| New feature, backward-compatible | Minor (`1.1.0`) |
| Bug fix, backward-compatible | Patch (`1.0.4`) |

Both packages always share the same version and are released together.

---

## Standard release

### 1. Start from a clean `develop`

```bash
git checkout develop
git pull origin develop
```

Check that everything you want in the release is already merged to `develop`.

### 2. Bump the version

Edit **both** `package.json` files to the new version — they must always match:

- `packages/@storybook-astro/renderer/package.json`
- `packages/@storybook-astro/framework/package.json`

```json
{
  "version": "1.0.4"
}
```

### 3. Update CHANGELOG.md

Add a new section at the top of `CHANGELOG.md`, above `[Unreleased]`:

```markdown
## [1.0.4] - 2026-04-01

### Added
- `definePreview` and `defineMain` typed config helpers (#53)

### Fixed
- Smoke test infrastructure catches broken dist before publish (#54)
```

Use these section headings as needed: `Added`, `Changed`, `Fixed`, `Deprecated`, `Removed`, `Security`.

### 4. Validate locally

Run the full pre-release check sequence. These same checks run in CI, but catching failures locally saves time.

```bash
# Linting
yarn lint

# Unit and integration tests (both Astro versions)
yarn test
yarn workspace @storybook-astro/integration-astro5 test
yarn workspace @storybook-astro/integration-astro6 test

# Clean build
rm -rf packages/@storybook-astro/renderer/dist packages/@storybook-astro/framework/dist
yarn build:packages

# Smoke test — installs from tarball into a clean project outside the workspace,
# runs storybook build and vitest. Catches issues yarn test cannot.
yarn smoke
```

`yarn smoke` takes a few minutes. It creates a fresh Astro 5 and Astro 6 project in `/tmp/`, installs the packed tarballs, runs `storybook build`, and runs the component tests. If it fails, the working directory is preserved at `/tmp/sb-smoke-*` for inspection.

### 5. Commit and push to `develop`

```bash
git add packages/@storybook-astro/renderer/package.json \
        packages/@storybook-astro/framework/package.json \
        CHANGELOG.md
git commit -m "chore: release v1.0.4"
git push origin develop
```

### 6. Merge `develop` into `main` and `website`

```bash
git checkout main
git pull origin main
git merge --no-ff develop
git push origin main

git checkout website
git pull origin website
git merge --no-ff develop
git push origin website
```

The `website` branch is what Cloudflare deploys to storybook-astro.org. Standard releases always merge to both.

### 7. Tag on `main` and push

```bash
git tag v1.0.4
git push origin v1.0.4
```

This triggers the **Publish to npm** workflow (`.github/workflows/publish.yml`), which:

1. Lints and runs tests (Astro 5 and 6)
2. Clean-builds both packages
3. Runs smoke tests — tarball install on Astro 5 and 6, storybook build + vitest
4. Publishes renderer then framework with the `beta` dist-tag
5. Promotes both to `latest`

### 8. Verify the publish

```bash
# Watch the workflow
gh run list --repo storybook-astro/storybook-astro --workflow publish.yml --limit 1
gh run watch  # follow live

# Confirm the version is on npm
npm view @storybook-astro/framework dist-tags
npm view @storybook-astro/renderer dist-tags
```

`latest` should point to the new version. If it doesn't, see [If the workflow fails](#if-the-workflow-fails) below.

### 9. Sync `develop` with `main` (optional)

Only needed if `main` has commits that aren't in `develop` (e.g. a previous hotfix):

```bash
git checkout develop
git merge main
git push origin develop
```

### 10. Close out the milestone and the project board

Once the publish is verified:

1. **Close the milestone.** `gh` has no milestone command, so use the API:

   ```bash
   gh api -X PATCH repos/storybook-astro/storybook-astro/milestones/<milestone-number> -f state=closed
   ```

2. **Create the next release's milestone** if it doesn't exist yet:

   ```bash
   gh api -X POST repos/storybook-astro/storybook-astro/milestones -f title=1.16.0
   ```

3. **Check the [Storybook Astro Roadmap](https://github.com/orgs/storybook-astro/projects/1) board.** Issues the release closed should be in Done. Issues moved to the next milestone go to Ready if they're planned for it, or Backlog if not.

4. **Add a view for the next release** if it doesn't have one: board layout, filtered to `milestone:<version>`, columns by Status, like the existing per-release views. A view can be added in the project's UI, or with the GraphQL `createProjectV2View` and `updateProjectV2View` mutations.

### 11. Thank outside contributors and reporters

Do this only after step 8 confirms the new version is on npm, so the comment can tell people they can install it.

List the release's issues and PRs opened by someone outside the core team:

```bash
gh api 'repos/storybook-astro/storybook-astro/issues?milestone=<milestone-number>&state=all&per_page=100' --paginate \
  -q '.[] | select(.author_association | IN("OWNER","MEMBER","COLLABORATOR") | not) | "#\(.number) @\(.user.login) \(.title)"'
```

The list misses an outside reporter whose issue isn't on the milestone, such as one closed as a duplicate of an issue that is, so check the release's CHANGELOG entries for issues credited to someone else.

Comment on each issue or PR: thank them for the report or the contribution, and say which version has it, with a link to its CHANGELOG entry. One comment per person and issue is enough; don't mention people who are already in the core team.

---

## Hotfix release

For critical bugs in a published version that can't wait for the normal release cycle.

### 1. Branch from `main`

```bash
git checkout main
git pull origin main
git checkout -b fix/describe-the-bug
```

### 2. Fix, test, validate

Make the fix. Run the full check sequence from step 4 above (`yarn lint`, `yarn test`, `yarn build:packages`, `yarn smoke`).

### 3. Bump the patch version and update CHANGELOG.md

In both `package.json` files, increment the patch number only. Add a changelog entry.

### 4. Open PRs to both `main` and `develop`

```bash
git push origin fix/describe-the-bug
gh pr create --base main --title "fix: describe the bug"
gh pr create --base develop --title "fix: describe the bug"
```

Merge both after review.

### 5. Tag on `main`

```bash
git checkout main
git pull origin main
git tag v1.0.5
git push origin v1.0.5
```

The publish workflow handles the rest.

### 6. Verify the publish and thank the reporter

Verify the publish as in [step 8](#8-verify-the-publish) of the standard release. Then, if the bug was reported or fixed by someone outside the core team, thank them on the issue or PR as in [step 11](#11-thank-outside-contributors-and-reporters).

---

## Website-only changes

Changes to `apps/website/` only — documentation updates, styling, copy — do **not** need a release:

- Branch from `main` (e.g. `website/update-docs`)
- Open PRs targeting both `main` and `website`
- Merge `main` first, then `website` — CloudFlare deploys from `website` automatically, no version bump or publish needed

A PR is website-only if it touches nothing under `packages/@storybook-astro/*`.

> **Why two branches?** The `website` branch is what Cloudflare deploys. Canary releases merge to `main` (to trigger the npm publish workflow) but never to `website`, so the public site always reflects the `latest` npm package.

---

## If the workflow fails

### Smoke test failed

The compiled dist is broken in some way. **Do not proceed with the publish.** The working directory is preserved in the CI runner logs.

Common causes:
- A missing `external` in `tsup.config.ts` caused a dep to be inlined that shouldn't be
- A new entry point added to `src/` but not to `tsup.config.ts` or package `exports`
- A package `exports` path points to a file that doesn't exist in `dist/`

Run `yarn smoke 6 fresh` locally to reproduce.

### Publish step failed (after smoke passed)

The packages may be in a partially published state (renderer published, framework not, or both published but not promoted to `latest`). Check npm before taking any action:

```bash
npm view @storybook-astro/renderer dist-tags
npm view @storybook-astro/framework dist-tags
```

If the `beta` tag is set but `latest` isn't promoted, promote manually:

```bash
npm dist-tag add @storybook-astro/renderer@1.0.4 latest
npm dist-tag add @storybook-astro/framework@1.0.4 latest
```

If neither package was published, run the manual fallback:

```bash
cd packages/@storybook-astro/renderer
rm -rf dist && yarn build
yarn npm publish --tag beta --access public

cd ../framework
rm -rf dist && yarn build
yarn npm publish --tag beta --access public

npm dist-tag add @storybook-astro/renderer@1.0.4 latest
npm dist-tag add @storybook-astro/framework@1.0.4 latest
```

> **Always use `yarn npm publish`**, not `npm publish`. Yarn resolves the `workspace:*` renderer reference to the actual version at publish time. Raw `npm publish` publishes `workspace:*` verbatim, breaking installs for consumers.

> **Always `rm -rf dist` before building manually.** tsup can reuse a stale cache that omits recent changes. After rebuilding, `grep` for a known recent string in `dist/` to confirm your changes are present.

---

## Quick reference

| Scenario | Branch from | Merge to | Version bump | Tag on |
|---|---|---|---|---|
| Feature / fix | `develop` | `develop` → `main` + `website` | Yes | `main` |
| Canary / preview | `develop` | `main` only (not `website`) | Yes (pre-release label) | `main` |
| Hotfix | `main` | `main` + `website` + `develop` | Patch only | `main` |
| Website-only | `main` | `main` + `website` | No | — |

### Key commands

```bash
yarn lint                          # Lint check
yarn test                          # Unit + portable story tests
yarn build:packages                # Build both packages (after rm -rf dist)
yarn smoke                         # Full tarball smoke test (Astro 5 + 6)
yarn smoke 6 fresh                 # Smoke test Astro 6 only
yarn smoke both upgrade            # Upgrade scenario (requires packages on npm)
git tag vX.Y.Z && git push origin vX.Y.Z   # Trigger publish workflow
gh run watch                       # Follow publish workflow live
gh api -X PATCH repos/storybook-astro/storybook-astro/milestones/<n> -f state=closed   # Close the release's milestone
gh api -X PATCH repos/storybook-astro/storybook-astro/issues/<issue> -F milestone=<n>  # Set an issue or PR's milestone
```

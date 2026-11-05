---
name: release-manager
description: Cut and verify Storybook Astro npm releases (@storybook-astro/framework and renderer) - version bumps, CHANGELOG and website changelog, merging develop to main and website, tagging to trigger publish.yml, verifying npm dist-tags, and closing out the GitHub milestone and project board. Use when the user asks to release, publish, cut or tag a version (e.g. "release 1.16.0"), publish a canary/next/rc/alpha preview, ship a hotfix from main, fix a failed publish workflow, promote dist-tags, or close a milestone and thank contributors after a release.
---

# Release Manager Skill

Guide for releasing the Storybook Astro packages (`@storybook-astro/framework` and `@storybook-astro/renderer`) to npm.

`docs/RELEASING.md` is the authoritative release guide. This skill summarizes it, keeps the happy-path commands in front of you, and links to it for the rest. If the two disagree, follow `docs/RELEASING.md`.

## Key Concepts

### Versioning

Storybook Astro follows [Semantic Versioning](https://semver.org/):
- **Major** (`2.0.0`) — Breaking API changes
- **Minor** (`1.16.0`) — New features, backward-compatible
- **Patch** (`1.15.1`) — Bug fixes, backward-compatible

Both packages always share the same version and are released together. Only packages under `packages/@storybook-astro/*` are versioned. The website, integration examples, and component library are not.

### Dist-tags

`publish.yml` reads the pre-release label from the renderer's version:

| Version | Dist-tag | Promoted to `latest`? |
|---|---|---|
| `1.16.0` (stable) | `beta` | Yes |
| `1.16.0-beta.1` | `beta` | Yes |
| `1.16.0-canary.1` | `canary` | No |
| `1.16.0-next.1` | `next` | No |
| `1.16.0-alpha.1` | `alpha` | No |
| `1.16.0-rc.1` | `rc` | No |

A stable version is published under `beta` first, then promoted to `latest`.

### Branches

- **`main`** — Releases are tagged here. Every release, canary included, merges here to trigger the publish workflow.
- **`website`** — What Cloudflare deploys to storybook-astro.org. Only stable releases, published hotfixes (merged from `main` after the publish) and website-only changes reach it, so the site matches the `latest` dist-tag. Canaries never touch it.
- **`develop`** — Integration branch. Features and fixes merge here first. It's protected: a PR needs one approving review, and only `lukemcd` and `slawekkolodziej` can push to it directly (as the release commit does). Anyone else opens a PR.
- **`feature/*`**, **`fix/*`** — Branched from `develop`. Hotfix `fix/*` branches come from `main`.
- **`website/*`** — Website-only changes, branched from `main`.
- **`next`** — Until 2.0.0 is released: 2.0 (Storybook 11 only) work. `develop` is merged into it regularly, and `2.0.0-next.N` prereleases are tagged on it, not on `main`. 1.x previews use `canary` meanwhile. Follow `docs/RELEASING.md#20-on-the-next-branch`, including its cutover steps.

Releases up to 1.14.0 used `release/*` branches. Current releases merge `develop` straight into `main` and `website`. Cut a release branch only when a release needs a freeze while `develop` takes work for the next version (see the start of the standard release in `docs/RELEASING.md`).

## Standard Release

Full walkthrough: `docs/RELEASING.md#standard-release`.

**Before tagging**, every open issue on the release's milestone (named for the version, e.g. `1.16.0`) is fixed on `develop` or moved to the next milestone. `gh issue edit --milestone` fails in this repo, so use `gh api -X PATCH repos/storybook-astro/storybook-astro/issues/<issue> -F milestone=<n>`.

**1. Start from a clean `develop`**

```bash
git checkout develop
git pull origin develop
```

**2. Bump versions and update both changelogs**

- Set the same version in `packages/@storybook-astro/renderer/package.json` and `packages/@storybook-astro/framework/package.json`.
- In `CHANGELOG.md`, turn the `[Unreleased]` entries into `## [1.16.0] - YYYY-MM-DD`, and leave the empty `[Unreleased]` heading above it for the next cycle. Sections follow [Keep a Changelog](https://keepachangelog.com/): `Added`, `Changed`, `Fixed`, `Deprecated`, `Removed`, `Security`.
- Add a condensed version of the section to `apps/website/src/content/docs/reference/changelog.md`: one line per change, grouping related issues. That page lists released versions only and never has an `[Unreleased]` section.

If a canary for this version already added the section, just re-date it (see [Canary releases](#canary--preview-releases)).

**3. Validate locally** — `docs/RELEASING.md#4-validate-locally`

```bash
yarn lint
yarn lint:links
yarn test
rm -rf packages/@storybook-astro/renderer/dist packages/@storybook-astro/framework/dist
yarn build:packages
yarn smoke   # tarball install into fresh Astro 5, 6 and 7 projects
```

**4. Commit and push to `develop`**

```bash
git add packages/@storybook-astro/renderer/package.json \
        packages/@storybook-astro/framework/package.json \
        CHANGELOG.md \
        apps/website/src/content/docs/reference/changelog.md
git commit -m "chore: release v1.16.0"
git push origin develop
```

**5. Merge `develop` into `main` and `website`**

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

**6. Tag on `main` and push**

```bash
git checkout main
git tag v1.16.0
git push origin v1.16.0
```

Only tag on `main`: the publish workflow runs on any `v*` tag, whatever branch it's on. The exceptions are a hotfix while a canary is on `main` and the `2.0.0-next.N` prereleases, tagged on `next`.

The tag runs `.github/workflows/publish.yml`, which:
1. Lints and clean-builds both packages
2. Runs the Astro 7, 6 and 5 integration tests
3. Runs the smoke test (`scripts/smoke-test.sh both fresh`: tarball install on Astro 5, 6 and 7, `storybook build` and vitest)
4. Publishes the renderer, then the framework, under the dist-tag from the table above
5. Promotes both to `latest` for stable and beta versions

**7. Verify the publish** — `docs/RELEASING.md#8-verify-the-publish`

```bash
gh run list --repo storybook-astro/storybook-astro --workflow publish.yml --limit 1
gh run watch
npm view @storybook-astro/framework dist-tags
npm view @storybook-astro/renderer dist-tags
```

`latest` should point to the new version on both packages. If not, see [If the workflow fails](#if-the-workflow-fails).

**8. Sync `develop` with `main` (optional)**

Only needed when `main` has commits `develop` lacks, such as a hotfix. Merge locally (`git checkout develop && git merge main && git push origin develop`): the `Branch Protection` workflow rejects a PR from `main` into `develop`. After a normal release, `main` and `website` each hold a merge commit of `develop`, so the three branches don't share a commit.

**9. Close out the milestone and project board** — `docs/RELEASING.md#10-close-out-the-milestone-and-the-project-board`

```bash
gh api 'repos/storybook-astro/storybook-astro/milestones?state=all' --jq '.[] | "\(.number) \(.title) \(.state)"'
gh api -X PATCH repos/storybook-astro/storybook-astro/milestones/<n> -f state=closed
gh api -X POST repos/storybook-astro/storybook-astro/milestones -f title=1.17.0   # if the next one doesn't exist
```

Then check the [Storybook Astro Roadmap](https://github.com/orgs/storybook-astro/projects/1) board: shipped issues in Done, moved issues in Ready or Backlog, and a board view for the next release.

**10. Thank outside contributors and reporters** — `docs/RELEASING.md#11-thank-outside-contributors-and-reporters`

Only after step 7 confirms the version is on npm. RELEASING.md has the `gh api` query that lists the milestone's issues and PRs from outside the core team. Also check the CHANGELOG for credited issues that aren't on the milestone, such as duplicates. Comment once per person and issue, naming the version and linking its CHANGELOG entry.

## Canary / Preview Releases

Use these to publish a build for testing without changing what `npm install @storybook-astro/framework` gives users. Any label other than `beta` stays on its own dist-tag and isn't promoted to `latest`.

- `canary` — Work-in-progress builds for early feedback, usually just before a stable release
- `next` — Validating a future release before committing to it
- `rc` — Feature-complete release candidates in final testing

**1. Bump both `package.json` files** on `develop` to the pre-release version, e.g. `1.16.0-canary.1`.

**2. Changelog.** A canary that comes right before a stable release may carry that release's dated section in both changelogs (`## [1.16.0] - YYYY-MM-DD`). It reaches `main` but not `website`, so it isn't deployed. The stable release commit then re-dates it. A canary not tied to an imminent release leaves the changelogs alone.

**3. Commit, merge to `main` only, and tag**

```bash
git commit -m "chore: release v1.16.0-canary.1 (canary)"
git push origin develop

git checkout main
git pull origin main
git merge --no-ff develop
git push origin main
git tag v1.16.0-canary.1
git push origin v1.16.0-canary.1
```

Do not merge to `website`: that would deploy docs for features that aren't in `latest`.

**4. Verify it did not become `latest`**

```bash
npm view @storybook-astro/framework dist-tags
# canary: 1.16.0-canary.1, latest unchanged
```

Consumers install it with `npm install @storybook-astro/framework@canary`. When a preview tag is no longer needed, remove it with `npm dist-tag rm @storybook-astro/<package> <label>` for both packages.

## Hotfix Release

Full walkthrough: `docs/RELEASING.md#hotfix-release`.

First check `main`'s version: `git show origin/main:packages/@storybook-astro/framework/package.json | grep '"version"'`. If it has a pre-release label, a canary is on `main` and a hotfix from `main` would ship its code. Follow `docs/RELEASING.md#hotfix-while-a-canary-is-on-main` instead: branch from the stable tag, tag the fix branch, and merge the fix branch (not `main`) into `website`.

1. Branch from `main`: `git checkout main && git pull origin main && git checkout -b fix/describe-the-bug`
2. Fix, then run the full validation from step 3 of the standard release (`yarn lint`, `yarn test`, `yarn build:packages`, `yarn smoke`)
3. Bump the patch version in both `package.json` files (e.g. `1.15.0` to `1.15.1`) and add the changelog entry to both changelogs
4. Push the branch and open PRs to `main` and `develop`, and merge the `main` PR first. Resolve any `develop` conflict (usually `CHANGELOG.md`) on a separate branch cut from `develop`, never on the shared `fix/*` branch. Don't open a PR to `website`
5. Tag on `main`:
   ```bash
   git checkout main
   git pull origin main
   git tag v1.15.1
   git push origin v1.15.1
   ```
6. Verify the publish as in the standard release
7. Merge `main` into `website` (`git checkout website && git pull origin website && git merge --no-ff main && git push origin website`), so the site only shows the patch once it's on npm
8. Thank the reporter if they're outside the core team

## If the Workflow Fails

Follow `docs/RELEASING.md#if-the-workflow-fails`. In short:

- **Smoke test failed**: the compiled dist is broken. Don't publish. Reproduce with `yarn smoke 6 fresh` (or `5`/`7`). Locally, the working directory is kept at `/tmp/sb-smoke-*`. Common causes are a missing `external` or entry point in `tsup.config.ts`, or a package `exports` path that doesn't exist in `dist/`.
- **Publish step failed after smoke passed**: check `npm view @storybook-astro/<package> dist-tags` for a partial publish before doing anything. If the version is published but not `latest`, promote it with `npm dist-tag add @storybook-astro/<package>@<version> latest`. Only if neither package was published, run the manual fallback in RELEASING.md.

Manual publishing always uses `yarn npm publish`, never `npm publish`: Yarn resolves the framework's `workspace:*` renderer dependency to a real version. Always `rm -rf dist` before building, and `grep` `dist/` for a recent string to confirm the build is current.

The workflow authenticates with the `NPM_TOKEN` repository secret.

### Tagged the wrong commit

If the tag is on the wrong branch, or the tagged commit lacks the version bump (npm then answers 403 "You cannot publish over the previously published versions"), delete the tag, fix `main`, and tag again:

```bash
git tag -d v1.16.0
git push origin :v1.16.0
# commit the fix on main, then:
git tag v1.16.0
git push origin v1.16.0
```

Check before tagging: `git show HEAD:packages/@storybook-astro/renderer/package.json | grep version`.

## Website-Only Changes

Changes to `apps/website/` only don't need a release. Branch from `main` (e.g. `website/update-docs`), open PRs to `main` and `website`, and merge `main` first. Cloudflare deploys from `website`. See `docs/RELEASING.md#website-only-changes`.

A change that touches both packages and the website follows the standard release. The website updates when the release merges to `website`.

## Checklist

### Standard release

- [ ] Every open issue on the milestone fixed on `develop` or moved to the next milestone
- [ ] Both `packages/@storybook-astro/*/package.json` files at the same new version
- [ ] `CHANGELOG.md` and `apps/website/src/content/docs/reference/changelog.md` have the dated section (no `[Unreleased]` on the website page)
- [ ] `yarn lint`, `yarn lint:links` and `yarn test` pass
- [ ] Clean `yarn build:packages` and `yarn smoke` (Astro 5, 6 and 7) pass
- [ ] Release commit pushed to `develop`
- [ ] `develop` merged into `main` and `website` and pushed
- [ ] Tag created on `main` and pushed
- [ ] Publish workflow succeeded
- [ ] `latest` points to the new version on both packages
- [ ] Milestone closed, next milestone and board view exist, board statuses checked
- [ ] Outside contributors and reporters thanked

### Canary / preview release

- [ ] Version uses a non-`beta` label (`canary`, `next`, `alpha`, `rc`, `test`)
- [ ] Both `package.json` files at the same version
- [ ] Changelog section added only if a stable release follows
- [ ] Merged into `main` only, not `website`
- [ ] Tag created on `main` and pushed
- [ ] Publish workflow succeeded
- [ ] Dist-tags show the label but `latest` is unchanged

## References

- `docs/RELEASING.md` - Authoritative release guide (standard, hotfix, website-only, failures)
- `CHANGELOG.md` - Release history
- `apps/website/src/content/docs/reference/changelog.md` - Website changelog (released versions only)
- `.github/workflows/publish.yml` - Publishes on `v*` tag push
- `.github/workflows/smoke-test.yml` - Smoke test on PRs to `main` (Astro 5, 6, 7), with manual dispatch for the `upgrade` scenario after a publish
- `.github/workflows/branch-protection.yml` - Rejects PRs from `main` into `develop`
- `scripts/smoke-test.sh` - Smoke test script (`yarn smoke [5|6|7|both] [fresh|upgrade|both]`)
- `smoke/templates/` - Minimal Astro project templates used by smoke tests

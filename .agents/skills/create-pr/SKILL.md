---
name: create-pr
description: Create GitHub pull requests with properly formatted titles and descriptions for the Storybook Astro project. Use when making PRs, submitting changes for review, or when the user asks to create a pull request. Trigger phrases: 'create pr', 'create a pr', 'submit a pr', 'make a pull request', 'update pr'. Before creating an AI-written PR, confirm a fresh-session `/code-review` was run (AGENTS.md#before-opening-a-pr).
---

# Create Pull Request for Storybook Astro

Creates GitHub PRs with titles and descriptions that follow Storybook Astro conventions.

## Branching Strategy

Storybook Astro uses Gitflow-inspired branching. See `docs/RELEASING.md` for the full release flow.

| Branch | Purpose |
|--------|---------|
| `main` | Stable branch. All releases are tagged here. |
| `develop` | Integration branch for in-progress work. PRs merge here first. |
| `website` | What Cloudflare deploys to storybook-astro.org (`deploy-website.yml`). Gets stable releases, published hotfixes (merged from `main` after the publish) and website-only changes. |
| `feature/*` | Feature branches off `develop` (e.g., `feature/vue-slots`) |
| `fix/*` | Bug fix branches off `develop`. Hotfixes branch off `main` instead. |
| `website/*` | Website-only changes, branched off `main`. PRs go to `main`, then `website`. |
| `release/*` | Only when a release needs a freeze while `develop` moves on (see `docs/RELEASING.md`). Releases normally merge `develop` directly. |

`develop` is protected: a PR needs one approving review, and a push dismisses stale approvals. The `Branch Protection` workflow rejects any PR from `main` into `develop`.

## PR Title Format

```
<type>(<scope>): <summary>
```

### Types

| Type | Description | When to Use |
|------|-------------|-------------|
| `feat` | New feature | New framework integration, new capability |
| `fix` | Bug fix | Fixes rendering issue, broken test, etc. |
| `perf` | Performance improvement | Optimization, efficiency gain |
| `test` | Test additions/corrections | New test cases, test fixes |
| `docs` | Documentation only | Updates to AGENTS.md, README, etc. |
| `refactor` | Code change (no bug fix or feature) | Code cleanup, restructuring |
| `build` | Build system or dependencies | Yarn updates, dependency changes |
| `ci` | CI configuration | GitHub Actions updates |
| `chore` | Routine tasks, maintenance | Releases, routine updates |

### Scopes (Storybook Astro Specific)

Use these scopes to identify affected areas:

- `framework` - Framework package changes
- `renderer` - Renderer package changes
- `astro5`, `astro6`, `astro7` - Integration examples
- `astro5-server`, `astro6-server`, `astro7-server` - Server-mode integration examples
- `website` - Marketing and docs website
- `react` - React framework integration
- `vue` - Vue framework integration
- `svelte` - Svelte framework integration
- `preact` - Preact framework integration
- `solid` - Solid.js framework integration
- `alpine` - Alpine.js framework integration
- `testing` - Testing infrastructure (Vitest, portable stories)
- `docs` - Documentation (AGENTS.md, README, etc.)
- `specs` - Design records in `docs/specs/`
- `roadmap` - Roadmap docs
- `ci` - GitHub Actions workflows

### Summary Rules

- Use imperative present tense: "add" not "added"
- Start with a lowercase letter
- No period at the end
- An issue number may be appended as `(#123)`
- Keep under 72 characters (aim for ~50)

## Steps

### 1. Run the pre-PR checklist

Follow [Before Opening a PR](../../../AGENTS.md#before-opening-a-pr) in AGENTS.md. In short: lint, link check and tests pass, the working tree is clean, local `develop` is current, and an AI-written change has had a `/code-review` in a fresh session, with each finding fixed or dismissed. If that review hasn't happened, stop and ask the user to run it in a fresh session rather than reviewing the change yourself.

### 2. Verify Current State

```bash
git status
git diff --stat
git log develop..HEAD --oneline   # next..HEAD for 2.0 work
```

Check:
- Working directory is clean
- Branch is up to date with base
- Commit history makes sense

### 3. Determine PR Details

Analyze your changes to determine:
- **Type**: What kind of change? (feat, fix, docs, test, etc.)
- **Scope**: Which package/area? (framework, renderer, react, etc.)
- **Summary**: What does the change do? (clear, actionable, present tense)
- **Base Branch**: `develop` for new work. Hotfixes branch from `main` and need PRs to `main` and `develop`; `website` gets them by a merge of `main` after the publish. Website-only changes need PRs to `main` and `website`. Until 2.0.0 is released, work on the `2.0.0` milestone branches from and targets `next` (`docs/RELEASING.md#20-on-the-next-branch`). See `docs/RELEASING.md`.
- **Issue and milestone**: Which issue it closes, and that issue's release milestone

### 4. Push Branch

```bash
git push -u origin HEAD
```

### 5. Create PR

Write the body to a file, then create the PR with the GitHub CLI:

```bash
gh pr create \
  --title "feat(framework): add lazy loading support" \
  --base develop \
  --body-file pr-body.md
```

Or use interactive mode:

```bash
gh pr create --web
```

### 6. Set the milestone

`gh pr edit --milestone` fails in this repo (it still queries the retired classic Projects), so use the API:

```bash
gh api 'repos/storybook-astro/storybook-astro/milestones?state=open' --jq '.[] | "\(.number) \(.title)"'
gh api -X PATCH repos/storybook-astro/storybook-astro/issues/<pr-number> -F milestone=<milestone-number>
```

## PR Body Guidelines

Use this template for consistency:

```markdown
Closes #123.

## Summary
Brief description of what this PR does and why.

## How to Test
1. Step-by-step testing instructions
2. Include specific Yarn commands
3. Which integration example(s) to use (astro5, astro6, astro7)

## Changes
- Bullet list of key changes
- Note affected packages or frameworks

## Checklist
- [ ] `yarn lint`, `yarn lint:links` and `yarn test` pass
- [ ] Fresh-session `/code-review` run and findings triaged (AI-written changes)
- [ ] Documentation updated (AGENTS.md, README, etc.)
- [ ] For framework changes: Updated `.storybook/main.js` in the integration examples it affects
- [ ] For new features: Added test cases
```

## Title Examples

### Features
```
feat(renderer): show a loading indicator while an Astro story renders
feat(solid): implement Solid.js framework integration
feat(testing): export portable stories testing API
```

### Fixes
```
fix(framework): ship the CSS the SSR server compiled for a story
fix(renderer): drop a render response whose canvas left the document while it waited (#288)
fix(astro6-server): resolve font virtual module handling
```

### Docs
```
docs(website): cover the 1.15 slot and CSS changes across the guides
docs(specs): refresh the Astro panel addon spec
docs: close out the milestone and project board at release
```

### Other
```
test(react): add render test for button component
refactor(renderer): simplify component detection logic
chore(deps): update TypeScript to 5.8.3
ci: always use the latest Node 22 patch release
```

PR titles aren't validated by CI, so follow these conventions by hand.

## Before Merging

Ensure:
1. PR title is properly formatted
2. All CI checks pass (lint, link check, tests, builds)
3. The PR has an approving review (required on `develop`)
4. For framework changes: Tested on Astro 5, 6 and 7
5. For breaking changes: Documented in PR
6. For new features: Tests added

## Key Conventions

- **Base branch**: Usually `develop` (never push directly to `main`)
- **Commit messages**: Can be less formal than PR title (PR title is what matters)
- **Draft PRs**: Use `--draft` flag if PR is not ready for review

## References

- [CONTRIBUTING.md](../../../CONTRIBUTING.md) - Full contribution guide
- [AGENTS.md](../../../AGENTS.md#before-opening-a-pr) - Pre-PR review checklist, architecture and code patterns
- `docs/RELEASING.md` - Release, hotfix and website-only branch flow

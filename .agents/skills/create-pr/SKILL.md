---
name: create-pr
description: Create GitHub pull requests with properly formatted titles and descriptions for the Storybook Astro project. Use when making PRs, submitting changes for review, or when the user says /pr or asks to create a pull request. Trigger phrases: 'create pr', 'create a pr', 'submit a pr', 'make a pull request', 'update pr'."
---

# Create Pull Request for Storybook Astro

Creates GitHub PRs with properly formatted titles aligned with Storybook Astro conventions and CI validation.

## Branching Strategy

Storybook Astro uses Gitflow-inspired branching:

| Branch | Purpose |
|--------|----------|
| `main` | Stable, deployable branch. All releases tagged from here. |
| `develop` | Integration branch for in-progress work. PRs merge here first. |
| `feature/*` | Feature branches off `develop` (e.g., `feature/vue-slots`) |
| `fix/*` | Bug fix branches off `develop` |
| `release/*` | Release prep branches off `develop` |

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
| `chore` | Routine tasks, maintenance | Routine updates |

### Scopes (Storybook Astro Specific)

Use these scopes to identify affected areas:

- `framework` - Framework package changes
- `renderer` - Renderer package changes
- `astro6` - Astro 6 sandbox app
- `astro5` - Astro 5 sandbox app
- `website` - Marketing website
- `react` - React framework integration
- `vue` - Vue framework integration
- `svelte` - Svelte framework integration
- `preact` - Preact framework integration
- `solid` - Solid.js framework integration
- `alpine` - Alpine.js framework integration
- `testing` - Testing infrastructure (Vitest, portable stories)
- `docs` - Documentation (AGENTS.md, README, etc.)

### Summary Rules

- Use imperative present tense: \"Add\" not \"Added\"
- Capitalize first letter
- No period at the end
- No ticket IDs
- Keep under 72 characters (aim for ~50)

## Steps

### 1. Verify Current State

```bash
git status
git diff --stat
git log origin/develop..HEAD --oneline
```

Check:
- Working directory is clean (or changes are intentional)
- Branch is up to date with base
- Commit history makes sense

### 2. Determine PR Details

Analyze your changes to determine:
- **Type**: What kind of change? (feat, fix, docs, test, etc.)
- **Scope**: Which package/area? (framework, renderer, react, etc.)
- **Summary**: What does the change do? (clear, actionable, present tense)
- **Base Branch**: Where to merge? (usually `develop`, never `main` for new work)

### 3. Verify CI Will Pass

Before pushing, ensure:

```bash
# Linting
yarn lint

# Type checking (if applicable)
# Tests must pass
yarn test

# For packages, verify build succeeds
yarn workspace @storybook-astro/framework build
yarn workspace @storybook-astro/renderer build
```

If anything fails, fix it first.

### 4. Push Branch

```bash
git push -u origin HEAD
```

This pushes your branch and sets upstream tracking.

### 5. Create PR

Use GitHub CLI to create PR with proper formatting:

```bash
gh pr create \\
  --title \"feat(framework): Add lazy loading support\" \\
  --base develop \\
  --body \"## Summary

Adds support for lazy-loading Astro components via dynamic imports.

### How to Test
1. Run \\`yarn workspace @storybook-astro/sandbox-astro6 storybook\\`
2. Load a lazy-loaded component
3. Verify it renders correctly

### Checklist
- [x] Tests pass: \\`yarn test\\`
- [x] Linting passes: \\`yarn lint\\`
- [x] Documentation updated (AGENTS.md if applicable)
- [ ] New framework integration (if applicable)
\"
```

Or use interactive mode:

```bash
gh pr create --web
```

Then fill in title and description in browser.

## PR Body Guidelines

Use this template for consistency:

```markdown
## Summary
Brief description of what this PR does and why.

## How to Test
1. Step-by-step testing instructions
2. Include specific Yarn commands
3. Which sandbox(s) to use (astro6, astro5)

## Changes
- Bullet list of key changes
- Note affected packages or frameworks

## Checklist
- [ ] Tests pass: `yarn test`
- [ ] Linting passes: `yarn lint`
- [ ] Documentation updated (AGENTS.md, README, etc.)
- [ ] For framework changes: Updated `.storybook/main.js` in both sandboxes
- [ ] For new features: Added test cases
```

## Title Examples

### Features
```
feat(framework): Add Astro 6 compatibility layer
feat(solid): Implement Solid.js framework integration
feat(testing): Export portable stories testing API
feat(website): Add framework integration showcase
```

### Fixes
```
fix(renderer): Resolve HMR not updating components
fix(react): Handle prop passing through container API
fix(alpine): Fix Alpine initialization in preview
fix(astro6): Resolve font virtual module handling
```

### Docs
```
docs(framework): Update AGENTS.md with new patterns
docs: Add framework integration standards guide
docs(testing): Clarify portable stories setup
```

### Tests
```
test(react): Add render test for button component
test: Increase coverage for integration layer
```

### Other
```
refactor(renderer): Simplify component detection logic
chore(deps): Update TypeScript to 5.8.3
ci: Add pre-commit lint hook
```

## Validation

Your PR title will be validated by CI:
- Type must be one of the allowed types
- Scope (if present) should align with project areas
- Summary must start with capital letter
- Summary must not end with period

## Before Merging

Ensure:
1. ✅ PR title is properly formatted
2. ✅ All CI checks pass (linting, tests, build)
3. ✅ Code is reviewed and approved
4. ✅ For framework changes: Tested on both Astro 5 and Astro 6
5. ✅ For breaking changes: Documented in PR
6. ✅ For new features: Tests added

## Key Conventions

- **Base branch**: Usually `develop` (never push directly to `main`)
- **Commit messages**: Can be less formal than PR title (PR title is what matters)
- **Co-authoring**: Include `Co-Authored-By: Oz <oz-agent@warp.dev>` if this PR was created with AI assistance
- **Draft PRs**: Use `--draft` flag if PR is not ready for review

## References

- [CONTRIBUTING.md](../../CONTRIBUTING.md) - Full contribution guide
- [Gitflow Model](https://www.atlassian.com/git/tutorials/comparing-workflows/gitflow-workflow) - Branching strategy
- `AGENTS.md` - Architecture and code patterns
"
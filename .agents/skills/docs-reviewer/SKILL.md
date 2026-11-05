---
name: docs-reviewer
description: Review documentation in Storybook Astro for completeness, accuracy, and alignment with project standards. Use when reviewing changes to AGENTS.md, CONTRIBUTING.md, docs/ (including the docs/specs design records), the website docs in apps/website/src/content/docs/, or the .agents references.
---

# Documentation Reviewer for Storybook Astro

Reviews and improves documentation to ensure accuracy, completeness, and consistency with project architecture.

## Documentation Scope

This skill covers:

### Core Documentation
- **AGENTS.md** - Architecture, conventions, debugging, development tasks, PR checklist
- **CONTRIBUTING.md** - Contribution workflow, branching, code standards
- **README.md** - Project overview and getting started
- **CHANGELOG.md** - Release notes

### `docs/`
- **GETTING_STARTED.md**, **TROUBLESHOOTING.md**, **RELEASING.md**
- **`docs/specs/`** - Design records for features that have shipped: behavior contracts and the rationale behind them. Source comments cite them by anchor (`docs/specs/decorators.md#server-snapshot`), so renaming a heading breaks those references

### Website Docs
- **`apps/website/src/content/docs/`** - User-facing docs: `getting-started/`, `writing-stories/`, `guides/`, `how-it-works/`, `reference/`

### Reference Materials (`.agents/references/`)
- **project-structure.md** - Monorepo layout and workspace navigation
- **testing-guidelines.md** - Vitest, portable stories, test patterns
- **framework-standards.md** - Framework integration standards and patterns

### Code Documentation
- JSDoc/TSDoc comments in source files
- Inline comments for complex logic
- Type annotations and signatures

## Review Checklist

### Accuracy
- [ ] File paths are correct (uses relative paths where appropriate)
- [ ] Command examples are runnable and current
- [ ] Code examples compile and work correctly
- [ ] Framework names and versions are accurate
- [ ] Links to files are valid: `yarn lint:links` passes. It checks every reference to `docs/` and `apps/website/src/content/docs/` files, anchors included, in docs and source comments alike
- [ ] A renamed or removed `docs/specs/` heading has its citations updated
- [ ] API descriptions match actual implementation

### Completeness
- [ ] All major concepts are explained
- [ ] Edge cases are documented
- [ ] Examples cover common use cases
- [ ] Tables of contents are present for long docs
- [ ] Related concepts are cross-referenced
- [ ] Troubleshooting sections address known issues

### Clarity
- [ ] Language is clear and professional
- [ ] Technical terms are defined or linked
- [ ] Step-by-step procedures are numbered
- [ ] Code examples are properly formatted
- [ ] Emphasis (bold, code, italics) used appropriately
- [ ] Paragraphs are concise (not rambling)

### Consistency
- [ ] Terminology matches across documents
- [ ] Code style consistent with project
- [ ] Formatting matches other docs
- [ ] Framework names used consistently
- [ ] Command examples use same conventions
- [ ] References to packages use correct names

### Structure
- [ ] Headings create clear hierarchy
- [ ] Sections are logically ordered
- [ ] Each section has clear purpose
- [ ] Complex topics have subsections
- [ ] Related content is grouped
- [ ] No orphaned sections

### What Belongs in the Repo
- [ ] No AI planning documents, speculative implementation plans, or proposals. `docs/specs/` is the exception, and only for features that have shipped (AGENTS.md "Documentation")

## Common Documentation Issues

### Broken References

❌ **Bad**:
```markdown
See `src/components/Button.tsx` for examples.
```
(File doesn't exist in that location)

✅ **Good**:
```markdown
See `packages/components/src/Button/astro/Button.astro` for examples.
```

### Outdated Information

❌ **Bad**:
```markdown
Use Astro 5 stable for testing.
```
(Astro 5, 6, and 7 are all supported)

✅ **Good**:
```markdown
Test with the integration apps: Astro 5 (`integration/astro5`), Astro 6 (`integration/astro6`), and Astro 7 (`integration/astro7`).
```

### Incomplete Examples

❌ **Bad**:
```typescript
// How to test a component
const { Default } = composeStories(stories);
```
(Missing async, import statements)

✅ **Good**:
```typescript
import { composeStories, renderStory } from '@storybook-astro/framework/testing';
const { Default } = composeStories(stories);
test('renders', async () => {
  await renderStory(Default);
  // assertions...
});
```

### Unclear Instructions

❌ **Bad**:
```markdown
Run the tests to make sure everything works.
```

✅ **Good**:
````markdown
Run the test suite from the monorepo root:
```bash
yarn test
```
````

## Framework Documentation

When documenting framework integrations, ensure:

- Framework name is accurate (React, Vue, Svelte, Preact, Solid.js, Alpine.js)
- Integration class pattern is shown
- File extensions are explicit (`.jsx`, `.vue`, etc.)
- Example components are provided
- Test patterns are shown
- Known limitations are mentioned
- Critical gotchas are highlighted (e.g., Solid's renderer-before-storyFn ordering)

## Testing Documentation

When documenting testing:

- Use portable stories API (`composeStories`, `renderStory`)
- Show async/await usage clearly
- Mention happy-dom limitations
- Use `@testing-library/dom` for queries
- Show Vitest imports and patterns
- Include test organization examples

## Architecture Documentation

When documenting architecture:

- Keep data flow diagrams clear
- Show layer separation (server/client)
- Include file organization
- Explain why design choices were made
- Note compatibility layers (Astro 5, 6, and 7)
- Document virtual module usage

## Review Output

**For each document reviewed:**

```
### AGENTS.md

**Status**: ✅ Current / ⚠️ Needs Updates / ❌ Outdated

**Strengths**:
- Clear explanation of architecture
- Good examples throughout

**Issues**:
1. Line 123: File path incorrect (`src/render.ts` doesn't exist, the file is `render.tsx`)
2. Line 456: Astro 5 only example (should cover Astro 6 and 7 too)
3. Missing example for new feature

**Suggestions**:
- Add troubleshooting section
- Link to testing-guidelines from testing section
```

**Summary:**
- Documents reviewed
- Critical issues
- Recommended updates
- Priority fixes

## Documentation Standards

### Terminology

Use consistent terms:
- "Storybook Astro" (not "storybook-astro" in prose)
- "portable stories" (lowercase)
- "Vite plugin" (capitalized properly)
- Framework names as official (React, Vue 3, Svelte, Preact, Solid.js, Alpine.js)
- "monorepo" (one word)
- "workspace" (for Yarn workspaces)

### Code Formatting

- Use language identifier: ` ```typescript ` not ` ```ts `
- Include file paths in code blocks for real files
- Use relative paths for files in repo
- Show imports with explicit extensions
- Highlight important lines with comments

### Link Format

- Internal: `[AGENTS.md](./AGENTS.md)` (relative)
- Files: `` `src/file.ts` `` (backticks)
- URLs: Full links with protocol

## Maintenance

Documentation should be updated when:

- New framework is added → update framework-standards.md and examples
- New feature is added → update AGENTS.md, the website docs, and the relevant reference; add a `docs/specs/` design record once it ships
- Pattern changes → update AGENTS.md and examples
- Astro version changes → update AGENTS.md "Astro Version Compatibility Layers" and `apps/website/src/content/docs/how-it-works/version-compatibility.md`
- Dependencies update → check for API changes

## References

- `AGENTS.md` - Current technical documentation
- `CONTRIBUTING.md` - Contribution process
- `.agents/references/` - Supporting guides
- [CommonMark Spec](https://spec.commonmark.org/) - Markdown standard

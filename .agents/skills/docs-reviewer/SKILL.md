---
name: docs-reviewer
description: Review documentation in Storybook Astro for completeness, accuracy, and alignment with project standards. Use when you want to improve documentation, need to validate docs updates, or ensure consistency across AGENTS.md and reference guides.
---

# Documentation Reviewer for Storybook Astro

Reviews and improves documentation to ensure accuracy, completeness, and consistency with project architecture.

## Documentation Scope

This skill covers:

### Core Documentation
- **AGENTS.md** - Architecture, conventions, debugging, development tasks
- **CONTRIBUTING.md** - Contribution workflow, branching, code standards
- **README.md** - Project overview and getting started
- **.claude/references/*.md** - Supporting guides

### Reference Materials
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
- [ ] Links to files are valid (no broken references)
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

## Common Documentation Issues

### Broken References

❌ **Bad**:
```markdown
See `src/components/Button.tsx` for examples.
```
(File doesn't exist in that location)

✅ **Good**:
```markdown
See `packages/@storybook-astro/components/Button/Button.tsx` for examples.
```

### Outdated Information

❌ **Bad**:
```markdown
Use Astro 5 stable for testing.
```
(Should say Astro 5 and 6 are both supported)

✅ **Good**:
```markdown
Test with both Astro 5.17.2 (stable) and Astro 6 using the integration examples.
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
```markdown
Run the test suite from the monorepo root:
```bash
yarn test
```

All 17 test suites (36 tests) should pass.
```

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
- Note compatibility layers (Astro 5 vs 6)
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
1. Line 123: File path incorrect (`src/middleware.ts` doesn't exist)
2. Line 456: Astro 5 only example (should cover 6 too)
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
- \"Storybook Astro\" (not \"storybook-astro\" in prose)
- \"portable stories\" (lowercase)
- \"Vite plugin\" (capitalized properly)
- Framework names as official (React, Vue 3, Svelte, Preact, Solid.js, Alpine.js)
- \"monorepo\" (one word)
- \"workspace\" (for Yarn workspaces)

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
- New feature is added → update AGENTS.md and relevant reference
- Pattern changes → update AGENTS.md and examples
- Astro version changes → update compatibility notes
- Dependencies update → check for API changes

## References

- `AGENTS.md` - Current technical documentation
- `CONTRIBUTING.md` - Contribution process
- `.claude/references/` - Supporting guides
- [CommonMark Spec](https://spec.commonmark.org/) - Markdown standard
"

---
name: code-reviewer
description: Review code changes in Storybook Astro for compliance with project standards, framework patterns, and best practices. Use when you want feedback on code, need to validate changes, or want to ensure PR readiness for the review process.
---

# Code Reviewer for Storybook Astro

Provides comprehensive code review feedback aligned with Storybook Astro's architecture, framework integrations, testing, and development conventions.

## Review Categories

This skill checks code across these dimensions:

### 1. Architecture & Structure
- Monorepo workspace organization
- Package boundary respect
- Module imports (explicit extensions, `workspace:*` protocol)
- ES module compliance

### 2. Framework Integration
- Astro component patterns
- Framework-specific adapters (React, Vue, Svelte, Preact, Solid, Alpine)
- Integration with base class and interfaces
- Vite plugin configuration

### 3. Testing & Coverage
- Portable stories usage
- Vitest test patterns
- Test organization and completeness
- Happy-DOM compatibility

### 4. Code Quality
- TypeScript compliance
- ESLint rules adherence
- Type safety
- Error handling

### 5. Documentation
- Inline code comments
- JSDoc/TSDoc completeness
- Updates to AGENTS.md
- Example code accuracy

### 6. Performance & Compatibility
- Astro 5 vs Astro 6 handling
- Vite plugin efficiency
- HMR compatibility
- CSS/scoped styles handling

## Review Process

### Input: Code to Review

Provide:
- **File paths**: Absolute or relative paths to files
- **Changes**: The code changes (diffs, new files, modifications)
- **Context**: What is this change trying to accomplish?
- **Affected areas**: Which packages/frameworks are involved?

### Analysis

For each file, I will:

1. **Check compliance** with project conventions from AGENTS.md
2. **Validate patterns** against framework standards
3. **Assess test coverage** using testing-guidelines patterns
4. **Verify imports** (explicit extensions, workspace protocol)
5. **Review TypeScript** for type safety
6. **Check for known issues** documented in AGENTS.md

### Output Format

**For each file reviewed:**

```
### src/path/to/file.ts

**Status**: ✅ Ready / ⚠️ Needs Changes / ❌ Critical Issues

**Strengths**:
- Point 1
- Point 2

**Issues**:
1. **Category**: Issue description
   **Severity**: High/Medium/Low
   **Fix**: Suggested resolution
   **Reference**: Link to relevant documentation

2. ...

**Suggestions**:
- Enhancement 1
- Enhancement 2
```

**Summary:**
- Total files reviewed
- Issues by severity
- Recommended actions

## Common Issues & Patterns

### Import Conventions

✅ **Good**:
```typescript
import { handlerFactory } from './middleware.ts';
import { composeStories } from '@storybook-astro/framework';
```

❌ **Bad**:
```typescript
import { handlerFactory } from './middleware';  // Missing extension
import handlerFactory from './middleware.ts';  // CommonJS style
```

### Framework Integration Pattern

✅ **Good**:
```typescript
class MyFrameworkIntegration extends BaseIntegration {
  override getAstroRenderer() {
    return myframework();
  }
  override getVitePlugins() {
    return [myframeworkPlugin()];
  }
  override getStorybookRenderer() {
    return '@storybook/my-framework';
  }
}
```

❌ **Bad**:
```typescript
class MyFrameworkIntegration {
  // Missing extends BaseIntegration
  // Missing override keyword
  // Incorrect method signatures
}
```

### Testing Pattern

✅ **Good**:
```typescript
import { composeStories, renderStory } from '@storybook-astro/framework/testing';

test('Component renders correctly', async () => {
  await renderStory(story);
  expect(screen.getByRole('button')).toBeInTheDocument();
});
```

❌ **Bad**:
```typescript
// Missing renderStory await
const story = composeStories(stories);
expect(story).toBeDefined();  // Wrong assertion
```

### Vite Plugin Issues

✅ **Good**:
```typescript
export const vitePluginMyFramework: Plugin = {
  name: 'vite:my-framework',
  apply: 'serve',
  resolveId(id) {
    if (id === 'virtual:my-module') {
      return id;
    }
  },
  load(id) {
    if (id === 'virtual:my-module') {
      return 'export default {};';
    }
  }
};
```

❌ **Bad**:
```typescript
// Vite plugin without proper virtual module handling
// Missing error handling
// Incorrect hook signatures
```

## Checklist for PR-Ready Code

- [ ] **Imports**: All imports have explicit file extensions (`.ts`, `.tsx`, `.js`)
- [ ] **Workspace Protocol**: Internal imports use `@storybook-astro/package` names
- [ ] **TypeScript**: No `any` types without explanation, proper types throughout
- [ ] **Framework Specific**:
  - [ ] Extends correct base classes (BaseIntegration, Plugin, etc.)
  - [ ] Matches expected interface signatures
  - [ ] Works with all supported frameworks (if applicable)
- [ ] **Testing**:
  - [ ] New code has test coverage (80%+ target)
  - [ ] Tests use portable stories patterns
  - [ ] Tests use Vitest + happy-dom patterns
- [ ] **Linting**: `yarn lint` passes
- [ ] **Type Checking**: `yarn test` passes (includes type checking)
- [ ] **Documentation**:
  - [ ] Code comments explain non-obvious logic
  - [ ] AGENTS.md updated (if affecting architecture)
  - [ ] JSDoc added for public APIs
- [ ] **Compatibility**:
  - [ ] Works with Astro 5 and Astro 6
  - [ ] No browser-only APIs in server code
  - [ ] Respects happy-dom limitations in tests

## Framework-Specific Review Points

### React
- Hooks usage in Storybook context
- Props binding via args
- Does @storybook/react-vite renderer work correctly?

### Vue
- Composition vs Options API compatibility
- Scoped slot handling
- Reactive store usage

### Svelte
- Reactive store context
- Component lifecycle in Storybook
- Two-way binding in stories

### Preact
- Hook compatibility (preact/hooks)
- JSX/TSX syntax
- Smaller footprint concerns

### Solid.js
- **CRITICAL**: Framework renderer called BEFORE storyFn()
- Reactive primitives and effects
- Context provider setup

### Alpine.js
- Entrypoint initialization
- x-directive handling
- Runtime-only pattern

## Astro-Specific Review Points

### Astro 6 Compatibility
- Check for use of `AstroContainer.create()` (correct for v6)
- Verify `patchCreateAstroCompat()` usage if needed
- Font Provider API handling via `vitePluginAstroFonts`
- Component marker plugin for client stub replacement

### Astro 5 Compatibility
- Different Container API? Check docs
- Check deprecation warnings

## References

- `AGENTS.md` - Architecture, conventions, debugging
- `.claude/references/project-structure.md` - Monorepo navigation
- `.claude/references/framework-standards.md` - Framework patterns
- `.claude/references/testing-guidelines.md` - Test patterns
- `CONTRIBUTING.md` - Code conventions and workflow
"
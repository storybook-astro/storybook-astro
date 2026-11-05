---
name: code-reviewer
description: Check a change against Storybook Astro's conventions (imports, integrations, Vite plugins, tests, Astro version compatibility) while you work. Not the pre-PR review - AGENTS.md requires /code-review in a fresh session before opening a PR.
---

# Code Reviewer for Storybook Astro

Gives feedback on a change against Storybook Astro's architecture, framework integrations, testing, and development conventions while the work is in progress.

**This is not the pre-PR review.** Before opening a PR, AGENTS.md requires an independent review from fresh context: `/code-review high <branch>` in a new session (`xhigh` for `render.tsx`, `middleware.ts`, or the Astro version compatibility layers). See [Before Opening a PR](../../../AGENTS.md#before-opening-a-pr). Passing this checklist doesn't satisfy that requirement.

## Review Categories

This skill checks code across these dimensions:

### 1. Architecture & Structure
- Monorepo workspace organization
- Package boundary respect
- Module imports (explicit extensions, package names for internal packages)
- Internal dependencies use `workspace:*` in package.json
- ES module compliance

### 2. Framework Integration
- Astro component patterns
- Framework-specific adapters (React, Vue, Svelte, Preact, Solid, Alpine)
- Integration classes implement `Integration` from `integrations/base.ts`
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
- Updates to AGENTS.md, `docs/specs/` design records, and the website docs
- Example code accuracy

### 6. Performance & Compatibility
- Astro 5, 6, and 7 handling
- Vite 6, 7, and 8 (Rolldown) handling
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
4. **Verify imports** (explicit extensions, package names)
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
import handlerFactory from './middleware.ts';  // Default import of a named export
```

### Framework Integration Pattern

Integrations implement the abstract `Integration` class in `packages/@storybook-astro/framework/src/integrations/base.ts`. Follow `react.ts`:

✅ **Good**:
```typescript
import type { AstroIntegration } from 'astro';
import type { Integration } from './base.ts';
import { importModule } from './moduleResolver.ts';

export type Options = Record<string, unknown>;

export class MyFrameworkIntegration implements Integration {
  readonly name = 'myframework';
  readonly dependencies = ['@astrojs/myframework', '@storybook/myframework', 'myframework'];
  readonly options: Options;
  readonly storybookEntryPreview = '@storybook/myframework/entry-preview';

  readonly renderer = {
    server: { name: '@astrojs/myframework', entrypoint: '@astrojs/myframework/server.js' },
    client: { name: '@astrojs/myframework', entrypoint: '@astrojs/myframework/client.js' }
  };

  constructor(options: Options = {}) {
    this.options = options;
  }

  resolveClient(moduleName: string): string | undefined {
    if (moduleName.startsWith('@astrojs/myframework/client')) {
      return `/@id/${moduleName}`;
    }
  }

  async loadIntegration(resolveFrom = process.cwd()) {
    const framework = await importModule<{ default: (options: Options) => AstroIntegration }>(
      '@astrojs/myframework',
      resolveFrom
    );

    return framework.default(this.options);
  }
}
```

The factory function is exported from `integrations/index.ts`.

❌ **Bad**:
```typescript
class MyFrameworkIntegration {
  // Doesn't implement Integration
  // Missing renderer, dependencies, resolveClient or loadIntegration
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

Virtual modules go through `createVirtualModule` in `src/vite/virtualModulePlugin.ts`, which resolves the id to `\0virtual:...` so other plugins leave it alone.

✅ **Good**:
```typescript
import { createVirtualModule } from './vite/virtualModulePlugin.ts';

export function vitePluginMyModule() {
  return createVirtualModule({
    pluginName: 'storybook-astro:my-module',
    virtualModuleId: 'virtual:my-module',
    load: () => 'export default {};'
  });
}
```

❌ **Bad**:
```typescript
// Hand-rolled resolveId that returns the bare 'virtual:' id (no \0 prefix)
// Missing error handling
// Incorrect hook signatures
```

## Conventions Checklist

- [ ] **Imports**: All imports have explicit file extensions (`.ts`, `.tsx`, `.js`)
- [ ] **Internal packages**: Imported by package name (`@storybook-astro/framework`), depended on with `workspace:*`
- [ ] **TypeScript**: No `any` types without explanation, proper types throughout
- [ ] **Framework Specific**:
  - [ ] Integrations implement `Integration` from `integrations/base.ts`
  - [ ] Matches expected interface signatures
  - [ ] Works with all supported frameworks (if applicable)
- [ ] **Testing**:
  - [ ] New code has test coverage
  - [ ] Tests use portable stories patterns
  - [ ] Tests use Vitest + happy-dom patterns
- [ ] **Checks**: `nvm use`, then `yarn lint`, `yarn lint:links`, and `yarn test` pass. There is no separate type-check script: types are checked by the tsup DTS build in `yarn build:packages`, which `yarn test` runs first
- [ ] **Documentation**:
  - [ ] Code comments explain non-obvious logic
  - [ ] AGENTS.md updated (if affecting architecture)
  - [ ] `docs/specs/` design records and the website docs updated for shipped behavior changes, without renaming headings that source comments cite by anchor
  - [ ] JSDoc added for public APIs
- [ ] **Compatibility**:
  - [ ] Works with Astro 5, 6, and 7
  - [ ] No browser-only APIs in server code
  - [ ] Respects happy-dom limitations in tests

## Framework-Specific Review Points

### React
- Hooks usage in Storybook context
- Props binding via args
- Does the delegated React renderer (`@storybook/react/entry-preview`) work correctly?

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
- Alpine components are `.astro` files rendered through the `@astrojs/alpinejs` integration

## Astro Version Compatibility

Astro 5, 6, and 7 share one Container API (`experimental_AstroContainer` from `astro/container`, `middleware.ts`). What differs between versions is handled by the layers listed in AGENTS.md's [Astro Version Compatibility Layers](../../../AGENTS.md#astro-version-compatibility-layers): the component marker plugin, `patchCreateAstroCompat()`, `vitePluginAstroFonts`, framework delegation order in `render.tsx`, the Vite 8 optimizer options in `preset.ts`, and `lib/componentStyles.ts` with `lib/compiledStylesheets.ts`. Check a change that touches any of them against that list.

## References

- `AGENTS.md` - Architecture, conventions, debugging, PR checklist
- `.agents/references/project-structure.md` - Monorepo navigation
- `.agents/references/framework-standards.md` - Framework patterns
- `.agents/references/testing-guidelines.md` - Test patterns
- `CONTRIBUTING.md` - Code conventions and workflow

# Testing Guidelines for Storybook Astro

## Testing Infrastructure

### Tools
- **Vitest**: Test runner (ES modules, happy-dom environment)
- **@testing-library/dom**: DOM queries and assertions
- **Happy-DOM**: Browser simulation (lightweight, sufficient for component tests)
- **Portable Stories**: Testing stories outside Storybook via `composeStories`

### Configuration
- **Root config**: `vitest.config.ts` at project root
- **Environment**: `happy-dom` for all tests
- **Test files**: Named with `.test.ts` or `.test.tsx` extension
- **Location**: Alongside source code in `src/`

### Running Tests

```bash
# All tests
yarn test

# Watch mode
yarn test --watch

# Specific package
yarn workspace @storybook-astro/framework test

# Coverage
yarn test --coverage
```

## Test Structure

### Basic Pattern

All component tests follow this uniform structure:

```typescript
import { screen } from '@testing-library/dom';
import { test, expect } from 'vitest';
import { composeStories, renderStory } from '@storybook-astro/framework/testing';
import * as stories from './Component.stories.jsx';

const { Default } = composeStories(stories);

test('Component Default renders via SSR', async () => {
  await renderStory(Default);
  expect(screen.getByText('Expected text')).toBeInTheDocument();
});
```

### Test Organization

**For Astro components** (server-side rendered):
- Use `composeStories()` to compose stories outside Storybook
- Use `renderStory()` to render via Astro SSR
- Query the DOM using `@testing-library/dom`
- Verify HTML structure and text content

**For Framework components** (delegated to framework renderer):
- Tests follow same pattern but use framework-specific renderers
- Framework's `renderToCanvas` is delegated to (React, Vue, etc.)
- Same query methods work across all frameworks

## Portable Stories API

### Available Functions

From `@storybook-astro/framework/testing` (or `/vitest` for Vitest-specific setup):

```typescript
// Compose all stories from an import
composeStories(storiesImport, projectAnnotations?)

// Compose single story
composeStory(story, componentAnnotations, projectAnnotations?, exportsName?)

// Set global annotations
setProjectAnnotations(annotations)

// Render composed story (Astro SSR only)
renderStory(story)
```

### Vitest-Specific Helpers

From `@storybook-astro/framework/vitest`:

```typescript
// Helper for Vitest configuration with Astro wiring
defineConfig(options)
```

This wires all necessary test internals automatically for Vitest.

## Testing Different Component Types

### Astro Components

Testing `.astro` files via portable stories:

```typescript
import { screen } from '@testing-library/dom';
import { test, expect } from 'vitest';
import { composeStories, renderStory } from '@storybook-astro/framework/testing';
import * as stories from './AstroButton.stories.jsx';

const { Primary } = composeStories(stories);

test('AstroButton renders correctly', async () => {
  await renderStory(Primary);
  expect(screen.getByRole('button')).toBeInTheDocument();
});
```

**Key points:**
- Always `await renderStory()` — it performs SSR
- Query DOM using standard `@testing-library/dom` methods
- Works with all Astro features (scoped CSS, client directives, etc.)

### React Components

Testing React components in Storybook stories:

```typescript
import { screen } from '@testing-library/dom';
import { test, expect } from 'vitest';
import { composeStories } from '@storybook-astro/framework/testing';
import * as stories from './ReactButton.stories.jsx';

const { Default } = composeStories(stories);

test('ReactButton renders', () => {
  Default.run();
  expect(screen.getByRole('button')).toBeInTheDocument();
});
```

**Key points:**
- For framework components, call `story.run()` instead of `await renderStory()`
- Framework's own renderer handles the rendering
- Same `@testing-library/dom` queries work

### Vue/Svelte/Preact/Solid Components

Same pattern as React:

```typescript
const { Default } = composeStories(stories);
test('Component renders', () => {
  Default.run();
  expect(screen.getByText('text')).toBeInTheDocument();
});
```

### Alpine.js Components

Alpine components require special handling:

```typescript
import { test, expect } from 'vitest';
import { composeStories, renderStory } from '@storybook-astro/framework/testing';
import * as stories from './AlpineCounter.stories.jsx';

const { Default } = composeStories(stories);

test('Alpine component initializes', async () => {
  await renderStory(Default);
  // Alpine may need a tick to initialize
  await new Promise(r => setTimeout(r, 10));
  // Query for expected Alpine behavior
});
```

## Writing Stories for Testing

### Astro Component Story

```javascript
// Button.stories.jsx
import Button from './Button.astro';

export default {
  title: 'Components/Button',
  component: Button,
};

export const Primary = {
  args: {
    label: 'Click me',
    variant: 'primary',
  },
};

export const Secondary = {
  args: {
    label: 'Cancel',
    variant: 'secondary',
  },
};
```

### React Component Story (with Astro wrapper)

```javascript
// ReactButton.stories.jsx
import ReactButton from './ReactButton.jsx';

export default {
  title: 'Components/ReactButton',
  component: ReactButton,
  parameters: {
    renderer: 'react', // Delegate to React renderer
  },
};

export const Default = {
  args: {
    label: 'React Button',
  },
};
```

## Coverage Requirements

### Target Coverage
- **Statements**: 80%+
- **Branches**: 75%+
- **Functions**: 80%+
- **Lines**: 80%+

### Running Coverage

```bash
yarn test --coverage
```

Generates HTML report in `coverage/`.

## Common Testing Patterns

### Testing Props/Args

```typescript
test('Component renders with custom label', async () => {
  const story = composeStory(Primary, { args: { label: 'Custom' } });
  await renderStory(story);
  expect(screen.getByText('Custom')).toBeInTheDocument();
});
```

### Testing Conditional Rendering

```typescript
test('Component shows error state', async () => {
  const story = composeStory(Error, { args: { error: 'Invalid input' } });
  await renderStory(story);
  expect(screen.getByRole('alert')).toBeInTheDocument();
});
```

### Testing Events (Framework Components)

```typescript
import { screen, fireEvent } from '@testing-library/dom';

test('Button click fires handler', () => {
  let clicked = false;
  const story = composeStory(Default, {
    args: { onClick: () => { clicked = true; } }
  });
  story.run();
  fireEvent.click(screen.getByRole('button'));
  expect(clicked).toBe(true);
});
```

### Testing Slots/Children

For components with slots:

```typescript
test('Component renders slot content', async () => {
  const story = composeStory(WithSlot, {
    args: {
      default: '<span>Slot content</span>'
    }
  });
  await renderStory(story);
  expect(screen.getByText('Slot content')).toBeInTheDocument();
});
```

## Debugging Tests

### Enable Verbose Logging

```typescript
import { test, expect, vi } from 'vitest';

test('debug example', async () => {
  const story = composeStories(stories).Default;
  console.log('Story:', story);
  
  vi.stubGlobal('console', { ...console, log: console.log });
  
  await renderStory(story);
  // Inspect DOM in logs
});
```

### Inspect DOM

```typescript
import { screen, debug } from '@testing-library/dom';

test('inspect dom', async () => {
  await renderStory(story);
  debug(screen.getByRole('button')); // Logs HTML to console
});
```

### Check Happy-DOM Limitations

Happy-DOM is lightweight but has limitations compared to full browsers:
- No layout information (getBoundingClientRect returns zeros)
- Limited CSS support (no actual style computation)
- No WebGL, Canvas, or media playback
- Animations don't actually run

For tests requiring these, either:
- Restructure the test to check behavior rather than appearance
- Skip the test in happy-dom (`{ skip: process.env.DOM !== 'jsdom' }`)
- Use Playwright for E2E tests (not available currently)

## Test File Organization

### Single-File Tests

For simple components, one test file per component:

```
src/components/
├── Button.astro
├── Button.stories.jsx
└── Button.test.ts
```

### Multi-File Tests

For complex components, organize by concern:

```
src/components/Form/
├── Form.astro
├── Form.stories.jsx
├── Form.test.ts
├── Form.validation.test.ts
├── Form.accessibility.test.ts
└── Form.integration.test.ts
```

## Best Practices

1. **Test user interactions, not implementation**: Query by role/label, not by component instance
2. **Keep stories and tests in sync**: If a story changes, update tests
3. **Use descriptive test names**: `test('Component renders with error message when validation fails')`
4. **Group related tests**: Use `describe()` blocks
5. **Mock external calls only if needed**: Keep tests realistic with actual components
6. **Test one thing per test**: Narrow, focused assertions
7. **Use test.each() for variants**: Test multiple props combinations efficiently
8. **Await async operations**: Always `await renderStory()` for Astro components

## Running CI Tests

Tests are part of the CI/CD pipeline. To replicate CI locally:

```bash
# Full test suite (same as CI)
yarn test

# Must pass before pushing to develop/main
yarn lint && yarn test
```

All 17 test suites (36 tests) must pass.

## Framework-Specific Notes

### React/Preact
- Framework renderers handle React-specific behavior
- Portable stories delegates to @storybook/react-vite
- Hooks work normally in tests

### Vue 3
- Portable stories delegates to @storybook/vue3
- Composition API and Options API both supported
- Scoped slots work via slots parameter

### Svelte
- Portable stories delegates to @storybook/svelte
- Reactive stores work via context
- Lifecycle hooks work normally

### Solid.js
- Portable stories delegates to storybook-solidjs
- Reactive primitives work normally
- Ordering: framework renderer BEFORE storyFn() is critical (see AGENTS.md)

### Alpine.js
- Manual initialization in tests may be needed
- Entrypoint starts Alpine after render
- Query for Alpine-enhanced elements

## References

- [Vitest Documentation](https://vitest.dev/)
- [Testing Library Queries](https://testing-library.com/docs/queries/about)
- [Happy-DOM GitHub](https://github.com/capricornwilliam/happy-dom)
- [Storybook Testing Documentation](https://storybook.js.org/docs/writing-tests)

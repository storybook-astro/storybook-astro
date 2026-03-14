---
name: test-generator
description: Generate comprehensive test cases for Storybook Astro components using portable stories and Vitest patterns. Use when you need tests for new components, want to improve test coverage, or need to validate component behavior across frameworks.
---

# Test Generator for Storybook Astro

Generates test cases for components using Storybook Astro's portable stories API and Vitest patterns.

## Test Generation Scope

This skill creates tests for:

### Astro Components
- Server-side rendered (SSR) via Astro Container
- Scoped CSS handling
- Props/slots passing
- HTML output validation

### Framework Components
- React, Vue, Svelte, Preact, Solid.js, Alpine.js
- Interactive behavior
- Props/event binding
- State management

### Integration Tests
- Multiple frameworks together
- Framework delegation behavior
- Container rendering

## Test Structure

### Standard Pattern

All tests follow this template:

```typescript
import { screen } from '@testing-library/dom';
import { test, expect, describe } from 'vitest';
import { composeStories, renderStory } from '@storybook-astro/framework/testing';
import * as stories from './Component.stories.jsx';

describe('Component', () => {
  const { Default, Variant1, Variant2 } = composeStories(stories);

  test('default story renders correctly', async () => {
    await renderStory(Default);
    expect(screen.getByRole('...role...')).toBeInTheDocument();
  });

  test('variant story renders correctly', async () => {
    await renderStory(Variant1);
    // assertions
  });
});
```

## Generation Steps

### 1. Analyze Component

For the component, determine:
- **Type**: Astro, React, Vue, etc.
- **Props**: What args/parameters does it accept?
- **Slots**: Does it accept children/slots?
- **Interactions**: Does it handle clicks, form input, etc.?
- **States**: What variant stories exist?

### 2. Create Story File (if needed)

If stories don't exist:

```javascript
// Component.stories.jsx
import Component from './Component.astro'; // or .jsx, .vue, etc.

export default {
  title: 'Components/Component',
  component: Component,
  // Add parameters.renderer for non-Astro components
  parameters: {
    renderer: 'react', // For React/Vue/Svelte/etc
  },
};

export const Default = {
  args: {
    prop1: 'default',
    prop2: 'value',
  },
};

export const Variant = {
  args: {
    prop1: 'variant',
  },
};
```

### 3. Generate Test Cases

Generate tests based on:
- **Component type**: Astro components get `await renderStory()`
- **Props**: Test with various prop combinations
- **States**: Test each story/variant
- **Accessibility**: Use `getByRole()` when possible
- **Edge cases**: Empty states, error states, etc.

### 4. Test Coverage

Aim for:
- ✅ All props/variants tested
- ✅ Happy path scenarios
- ✅ Edge cases (empty, null, undefined)
- ✅ Error states
- ✅ Accessibility roles/labels
- ✅ 80%+ coverage

## Testing Patterns by Component Type

### Astro Components

```typescript
import { composeStories, renderStory } from '@storybook-astro/framework/testing';

test('Astro component renders', async () => {
  await renderStory(story); // Must await
  expect(screen.getByRole('button')).toBeInTheDocument();
});
```

**Key points**:
- Always `await renderStory()`
- Tests HTML structure
- Can verify scoped styles present

### React/Preact Components

```typescript
import { composeStories } from '@storybook-astro/framework/testing';

test('React component renders', () => {
  const { Default } = composeStories(stories);
  Default.run(); // No await for framework components
  expect(screen.getByRole('button')).toBeInTheDocument();
});

test('handles click events', () => {
  const { Default } = composeStories(stories);
  Default.run();
  fireEvent.click(screen.getByRole('button'));
  // assertions after interaction
});
```

### Vue/Svelte/Solid Components

```typescript
test('Vue component renders', () => {
  const { Default } = composeStories(stories);
  Default.run();
  expect(screen.getByText('expected text')).toBeInTheDocument();
});
```

### Alpine.js Components

```typescript
test('Alpine component initializes', async () => {
  await renderStory(story);
  // Alpine may need a tick to initialize
  await new Promise(r => setTimeout(r, 10));
  expect(screen.getByText('alpine-enhanced')).toBeInTheDocument();
});
```

## Query Patterns

Prefer accessibility queries (`getByRole`, `getByLabel`, `getByText`):

✅ **Good**:
```typescript
expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
expect(screen.getByLabelText('Email')).toHaveValue('user@example.com');
expect(screen.getByText('Success message')).toBeInTheDocument();
```

❌ **Bad**:
```typescript
expect(screen.getByTestId('btn-submit')).toBeInTheDocument();
expect(screen.getByClassName('btn')).toBeInTheDocument();
expect(wrapper.find('.success')).toBeDefined();
```

## Test Organization

### Single File (Simple Component)
```
src/Button/
├── Button.astro
├── Button.stories.jsx
└── Button.test.ts
```

### Multi-File (Complex Component)
```
src/Form/
├── Form.astro
├── Form.stories.jsx
├── Form.test.ts          # Basic rendering
├── Form.validation.test.ts # Validation logic
├── Form.interaction.test.ts # User interactions
└── Form.accessibility.test.ts # A11y
```

## Test Data Patterns

### Props Variants

```typescript
test.each([
  ['primary', 'btn-primary'],
  ['secondary', 'btn-secondary'],
  ['disabled', 'btn-disabled'],
])('renders %s variant', async (variant, className) => {
  const story = composeStory(Variant, { args: { variant } });
  await renderStory(story);
  expect(screen.getByRole('button')).toHaveClass(className);
});
```

### Slot/Children Content

```typescript
test('renders slot content', async () => {
  const story = composeStory(WithSlot, {
    args: {
      default: '<span>Slot content</span>',
    },
  });
  await renderStory(story);
  expect(screen.getByText('Slot content')).toBeInTheDocument();
});
```

## Common Test Scenarios

### Rendering
```typescript
test('component renders without errors', async () => {
  await renderStory(story);
  expect(screen.getByRole('...')).toBeInTheDocument();
});
```

### Props Passing
```typescript
test('accepts and displays custom label', async () => {
  const story = composeStory(Default, { args: { label: 'Custom' } });
  await renderStory(story);
  expect(screen.getByText('Custom')).toBeInTheDocument();
});
```

### Conditional Rendering
```typescript
test('shows error state when error prop provided', async () => {
  const story = composeStory(Error, { args: { error: 'Invalid' } });
  await renderStory(story);
  expect(screen.getByRole('alert')).toBeInTheDocument();
});
```

### Event Handling
```typescript
import { fireEvent } from '@testing-library/dom';

test('calls onClick handler on click', () => {
  let clicked = false;
  const story = composeStory(Default, {
    args: { onClick: () => { clicked = true; } }
  });
  story.run();
  fireEvent.click(screen.getByRole('button'));
  expect(clicked).toBe(true);
});
```

### Focus Management
```typescript
test('button is focusable', () => {
  const story = composeStories(stories).Default;
  story.run();
  screen.getByRole('button').focus();
  expect(document.activeElement).toBe(screen.getByRole('button'));
});
```

## Coverage Goals

- **Statements**: 80%+
- **Branches**: 75%+
- **Functions**: 80%+
- **Lines**: 80%+

Check with:
```bash
yarn test --coverage
```

## Framework-Specific Considerations

### React/Preact
- Hooks work normally
- Props map via `args`
- Event handlers receive synthetic events

### Vue
- Composition API and Options API both supported
- Slots map to `args` in Storybook
- Reactive state updates in tests

### Svelte
- Reactive stores work via context
- Two-way binding testable
- Lifecycle hooks work

### Solid.js
- Reactive primitives work normally
- Effects run in tests
- **Critical**: renderer called before storyFn()

### Alpine.js
- Manual initialization may be needed
- x-directives work
- Runtime-only (no build)

## Edge Cases to Test

For each component, consider:

- Empty props: `props = {}`
- Null/undefined values
- Very long text
- Special characters in content
- Multiple children/slots
- No children provided
- Invalid prop values
- Disabled state
- Loading state
- Error state

## Output Format

Generated tests should:
1. Include proper imports
2. Use describe() blocks for organization
3. Include test names that describe behavior
4. Follow test structure: setup → action → assert
5. Include comments for non-obvious assertions
6. Use appropriate queries
7. Handle async properly (await where needed)

## References

- `.claude/references/testing-guidelines.md` - Test patterns
- `.claude/references/framework-standards.md` - Framework differences
- `AGENTS.md` - Architecture and debugging
- [Testing Library Docs](https://testing-library.com/)
- [Vitest Docs](https://vitest.dev/)
"
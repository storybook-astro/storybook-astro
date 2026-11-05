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
- React, Vue, Svelte, Preact, Solid.js
- Interactive behavior
- Props/event binding
- State management

### Alpine.js Components
- `.astro` components that use Alpine directives, tested like any other Astro component

## Where Tests Live

Shared example components live in `packages/components/src/<Component>/<framework>/`, each with its component, its stories, and its test:

```
packages/components/src/Counter/
├── alpine/   Counter.astro  Counter.stories.js  Counter.test.ts
├── preact/   Counter.jsx    Counter.stories.js  Counter.test.ts
├── react/    Counter.jsx    Counter.stories.js  Counter.test.ts
├── solid/    Counter.tsx    Counter.stories.js  Counter.test.ts
├── svelte/   Counter.svelte Counter.stories.js  Counter.test.ts
└── vue/      Counter.vue    Counter.stories.js  Counter.test.ts
```

`packages/components/vitest.config.ts` picks up `src/**/*.test.ts` and runs them in happy-dom, with `@testing-library/jest-dom/vitest` matchers loaded from `vitest.setup.ts`. All three integration apps (`integration/astro5`, `astro6`, `astro7`) load these stories.

The integration apps also have their own tests:
- `src/**/*.test.ts` - Vitest tests for app-specific stories (`yarn workspace @storybook-astro/integration-astro7 test`)
- `tests/*.spec.ts` - Playwright browser tests against the running Storybook (`test:browser`)
- `test:storybook` - Runs the stories themselves through `@storybook/addon-vitest`

## Astro Components

Astro components (and Alpine components, which are `.astro` files) use the Storybook Astro portable stories API and are rendered through the Astro Container:

```typescript
import { screen } from '@testing-library/dom';
import { test, expect } from 'vitest';
import { composeStories, renderStory } from '@storybook-astro/framework/testing';
import * as stories from './Component.stories.jsx';

const { Default, Variant } = composeStories(stories);

test('default story renders correctly', async () => {
  await renderStory(Default);
  expect(screen.getByRole('button')).toBeInTheDocument();
});
```

**Key points**:
- Always `await renderStory()`
- `renderStory` only renders Astro components. It throws "Story meta.component must be an Astro component factory." for a React, Vue, Svelte, Preact, or Solid component
- Scoped CSS arrives as `<style data-storybook-astro-styles>` elements, and the markup carries the scope as a `data-astro-cid-*` attribute. `packages/components/src/ScopedStyles/ScopedStyles.test.ts` shows how to assert on both

### Alpine.js Components

Alpine components are `.astro` files with Alpine directives, wired through the `@astrojs/alpinejs` integration. Their stories have no `parameters.renderer`, and the tests assert on the server-rendered markup right after `renderStory`. See `packages/components/src/Counter/alpine/Counter.test.ts` and `packages/components/src/Accordion/alpine/Accordion.test.ts`:

```typescript
const { Default } = composeStories(stories);

test('Alpine Counter Default renders via SSR', async () => {
  await renderStory(Default);

  expect(screen.getByText('Alpine counter:')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '+1' })).toBeInTheDocument();
});
```

## Framework Components

Framework component stories set `parameters.renderer` (`'react'`, `'vue'`, `'svelte'`, `'preact'`, `'solid'`). Their tests don't go through `@storybook-astro/framework/testing`; they compose the stories with the framework's own Storybook package and render natively. Copy the pattern from the matching file:

| Framework | Pattern file | How it renders |
|-----------|--------------|----------------|
| React | `packages/components/src/Counter/react/Counter.test.ts` | `composeStories` from `@storybook/react-vite`, rendered with `createRoot` inside `flushSync` |
| Vue | `packages/components/src/Counter/vue/Counter.test.ts` | `composeStories` and `setProjectAnnotations` from `@storybook/vue3`, then `await Default.run()` |
| Svelte | `packages/components/src/Counter/svelte/Counter.test.ts` | `composeStories` and `setProjectAnnotations` from `@storybook/svelte`, then `await Default.run()` |
| Preact | `packages/components/src/Counter/preact/Counter.test.ts` | `composeStories` from `storybook/preview-api` with `setProjectAnnotations` from `@storybook/preact`, rendered with Preact's `render(h(Default, {}), element)` |
| Solid | `packages/components/src/Counter/solid/Counter.test.ts` | `composeStories` from `storybook/preview-api` with `storybook-solidjs-vite/renderer/solid-legacy` annotations; asserts the composed story and its `parameters.renderer`, without rendering |

React, for example:

```typescript
import { composeStories } from '@storybook/react-vite';
import { screen } from '@testing-library/dom';
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { test, expect } from 'vitest';
import * as stories from './Counter.stories.js';

const { Default } = composeStories(stories);

test('React Counter Default renders with native React renderer', () => {
  const element = document.createElement('div');

  document.body.append(element);
  const root = createRoot(element);

  try {
    flushSync(() => {
      root.render(createElement(Default));
    });

    expect(screen.getByTestId('react-counter')).toHaveTextContent('React counter: 1');
  } finally {
    root.unmount();
    element.remove();
  }
});
```

Vue and Svelte:

```typescript
import { composeStories, setProjectAnnotations } from '@storybook/vue3';

setProjectAnnotations([]);

const { Default } = composeStories(stories);

test('Vue Counter Default runs with native renderer', async () => {
  await Default.run();

  expect(screen.getByTestId('vue-counter')).toHaveTextContent('Vue counter: 1');
});
```

A test that mixes Astro and framework stories (for example, decorators across renderers) is in `integration/astro7/src/components/Counter/Decorators.test.ts`.

## Generation Steps

### 1. Analyze Component

For the component, determine:
- **Type**: Astro, Alpine (Astro), React, Vue, etc.
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
    renderer: 'react', // For React/Vue/Svelte/Preact/Solid
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
- **Component type**: Astro and Alpine components get `await renderStory()`; framework components follow the pattern file for their framework
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

## Test Data Patterns

`composeStory(story, meta)` takes the story's meta (the stories file's default export) as its second argument. Story args win over meta args, so to try other args, override them on the story:

```typescript
import { composeStory, renderStory } from '@storybook-astro/framework/testing';
import * as stories from './Button.stories.jsx';

function withArgs(story, args) {
  return composeStory({ ...story, args: { ...story.args, ...args } }, stories.default);
}
```

### Props Variants

```typescript
test.each([
  ['primary', 'btn-primary'],
  ['secondary', 'btn-secondary'],
  ['disabled', 'btn-disabled'],
])('renders %s variant', async (variant, className) => {
  await renderStory(withArgs(stories.Default, { variant }));
  expect(screen.getByRole('button')).toHaveClass(className);
});
```

### Slot/Children Content

Astro slot content goes in `args.slots`, keyed by slot name:

```typescript
test('renders slot content', async () => {
  await renderStory(withArgs(stories.Default, {
    slots: { default: '<span>Slot content</span>' },
  }));
  expect(screen.getByText('Slot content')).toBeInTheDocument();
});
```

A slot can also hold another Astro component (`slots: { default: Badge }`); see `packages/components/src/Nesting/`.

## Common Test Scenarios

### Rendering
```typescript
test('component renders without errors', async () => {
  await renderStory(Default);
  expect(screen.getByRole('...')).toBeInTheDocument();
});
```

### Props Passing
```typescript
test('accepts and displays custom label', async () => {
  await renderStory(withArgs(stories.Default, { label: 'Custom' }));
  expect(screen.getByText('Custom')).toBeInTheDocument();
});
```

### Conditional Rendering
```typescript
test('shows error state when error prop provided', async () => {
  await renderStory(withArgs(stories.Default, { error: 'Invalid' }));
  expect(screen.getByRole('alert')).toBeInTheDocument();
});
```

### Event Handling

Interaction belongs to framework components, rendered with their framework's pattern above. After rendering, fire events with `@testing-library/dom`:

```typescript
import { fireEvent } from '@testing-library/dom';

fireEvent.click(screen.getByRole('button'));
expect(screen.getByTestId('react-counter')).toHaveTextContent('React counter: 2');
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
- The existing test only composes the story and checks `parameters.renderer`
- **Critical** (in Storybook itself): the framework renderer is called before `storyFn()`

### Alpine.js
- Alpine components are `.astro` files rendered through `renderStory`
- Tests assert on the server-rendered markup and directives; they don't wait for Alpine to start

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

- `.agents/references/testing-guidelines.md` - Test patterns
- `.agents/references/framework-standards.md` - Framework differences
- `AGENTS.md` - Architecture, the Testing section, and debugging
- [Testing Library Docs](https://testing-library.com/)
- [Vitest Docs](https://vitest.dev/)

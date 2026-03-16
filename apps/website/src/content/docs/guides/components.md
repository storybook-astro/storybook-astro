---
title: Shared Component Library
description: Build reusable components once, test everywhere with the shared component library.
---

The `@storybook-astro/components` package provides a shared library of Astro components and framework-specific implementations. This allows you to build components once and use them in Storybook, the website, test sandboxes, and your own projects.

## What's included

The shared library includes:

- **Astro components**: Pure `.astro` files (Header, Footer, Card, Counter, Accordion, CodeTabs, etc.)
- **Framework implementations**: React, Vue, Svelte, Preact, Solid, and Alpine.js versions of common components
- **Test fixtures**: Components pre-configured for testing across multiple frameworks

## Using shared components in stories

Instead of duplicating components in each sandbox, import from `@storybook-astro/components`:

```typescript
// Before: Duplicated in each sandbox
import Card from './Card.astro';

// After: Shared component
import Card from '@storybook-astro/components/Card/astro/Card.astro';
```

### Directory structure

Components are organized by type:

```
@storybook-astro/components/
├── Card/
│   └── astro/Card.astro
├── Header/
│   └── astro/Header.astro
├── Counter/
│   ├── astro/Counter.astro
│   ├── react/Counter.jsx
│   ├── solid/Counter.tsx
│   └── vue/Counter.vue
└── CodeTabs/
    ├── astro/CodeTabs.astro
    ├── react/CodeTabs.jsx
    ├── solid/CodeTabs.tsx
    └── vue/CodeTabs.vue
```

## Framework-specific components

Many components include framework-specific implementations. Access them via the framework path:

```typescript
// Astro version
import Counter from '@storybook-astro/components/Counter/astro/Counter.astro';

// React version
import Counter from '@storybook-astro/components/Counter/react/Counter.jsx';

// Solid version
import Counter from '@storybook-astro/components/Counter/solid/Counter.tsx';

// Vue version
import Counter from '@storybook-astro/components/Counter/vue/Counter.vue';
```

In Storybook stories, use the `parameters.renderer` setting to render framework components:

```javascript
// Counter.stories.jsx
import Counter from '@storybook-astro/components/Counter/react/Counter.jsx';

export default {
  title: 'React/Counter',
  component: Counter,
  parameters: {
    renderer: 'react', // Tell Storybook to use React renderer
  },
};

export const Default = {};
```

## CodeTabs component

The `CodeTabs` component demonstrates multi-framework hydration by rendering code snippets in multiple package manager formats (npm, yarn, pnpm, bun).

### Astro version

```typescript
import CodeTabs from '@storybook-astro/components/CodeTabs/astro/CodeTabs.astro';

export default {
  title: 'Components/Code Installation',
  component: CodeTabs,
  args: {
    framework: 'react', // react, solid, preact, svelte, vue, alpine
  },
};

export const Default = {
  args: { framework: 'react' },
};

export const Solid = {
  args: { framework: 'solid' },
};
```

### Framework versions

Framework implementations (React, Vue, Svelte, Solid, Preact) render tabs with client-side interactivity:

```typescript
// React version with client-side tab switching
import CodeTabs from '@storybook-astro/components/CodeTabs/react/CodeTabs.jsx';

export default {
  title: 'React/Code Installation',
  component: CodeTabs,
  parameters: { renderer: 'react' },
};

export const Default = {};
```

## Benefits

1. **Single source of truth** — Fix bugs once, benefit everywhere
2. **Testing coverage** — Test components across Astro 5, Astro 6, and multiple frameworks
3. **Documentation** — Components serve as examples for your docs
4. **Consistency** — Same components in Storybook, website, and test sandboxes
5. **Reduced duplication** — Stop copying components between projects

## Using in your own projects

You can also use shared components in your own Astro applications:

```bash
npm install @storybook-astro/components
```

Then import components:

```typescript
// In your Astro layout or component
import Header from '@storybook-astro/components/Header/astro/Header.astro';
import Footer from '@storybook-astro/components/Footer/astro/Footer.astro';

---

<Header />
<main>...</main>
<Footer />
```

## Component configuration

### In Storybook

Configure stories to include shared components:

```javascript
// .storybook/main.js
export default {
  stories: [
    '../src/**/*.stories.@(js|jsx|ts|tsx)',
    // Include shared component stories
    getAbsolutePath('@storybook-astro/components') + '/src/*.mdx',
    getAbsolutePath('@storybook-astro/components') + '/src/**/*.stories.@(js|jsx|mjs|ts|tsx)',
  ],
};
```

### In tests

Test shared components with portable stories:

```typescript
// Card.test.ts
import { screen } from '@testing-library/dom';
import { test, expect } from 'vitest';
import { composeStories, renderStory } from '@storybook-astro/framework/testing';
import * as stories from '@storybook-astro/components/Card/astro/Card.stories.jsx';

const { Default } = composeStories(stories);

test('Card renders correctly', async () => {
  await renderStory(Default);
  expect(screen.getByText('Default title')).toBeInTheDocument();
});
```

## Testing across frameworks

One of the main benefits of the shared library is the ability to test the same component concept across multiple frameworks.

### Astro component test

```typescript
import { composeStories, renderStory } from '@storybook-astro/framework/testing';
import * as astroStories from '@storybook-astro/components/Counter/astro/Counter.stories.jsx';

const { Default } = composeStories(astroStories);

test('Astro Counter renders', async () => {
  await renderStory(Default);
  expect(screen.getByTestId('vanilla-counter')).toBeInTheDocument();
});
```

### React component test

```typescript
import { render, screen } from '@testing-library/react';
import Counter from '@storybook-astro/components/Counter/react/Counter.jsx';

test('React Counter renders', () => {
  render(<Counter />);
  expect(screen.getByText('React counter: 1')).toBeInTheDocument();
});
```

### Solid component test

```typescript
import { render, screen } from 'solid-testing-library';
import Counter from '@storybook-astro/components/Counter/solid/Counter.tsx';

test('Solid Counter renders', () => {
  render(() => <Counter />);
  expect(screen.getByText('Solid counter: 1')).toBeInTheDocument();
});
```

## Contributing components

To add new components to the shared library:

1. **Create the Astro version** in `packages/components/src/ComponentName/astro/ComponentName.astro`
2. **Create the story file** in the same directory with `.stories.jsx`
3. **Add framework versions** as needed (React, Vue, Solid, etc.)
4. **Add tests** with `.test.ts` files
5. **Document the component** in a README or JSDoc comments

Components are automatically available in Storybook and your project after running `npm install`.

## Troubleshooting

### Component not found

Ensure the import path matches the directory structure:

```javascript
// ❌ Wrong: might not exist
import Button from '@storybook-astro/components/Button/Button.astro';

// ✅ Correct: verify the path exists
import Button from '@storybook-astro/components/Button/astro/Button.astro';
```

### Framework component not rendering

Verify you're using the correct `parameters.renderer`:

```javascript
// ❌ Wrong renderer
export default {
  component: ReactCounter,
  parameters: { renderer: 'vue' }, // Should be 'react'
};

// ✅ Correct
export default {
  component: ReactCounter,
  parameters: { renderer: 'react' },
};
```

### Storybook not finding stories

Update `.storybook/main.js` to include the shared component stories path:

```javascript
stories: [
  '../src/**/*.stories.@(js|jsx|ts|tsx)',
  // Add this line:
  getAbsolutePath('@storybook-astro/components') + '/src/**/*.stories.@(js|jsx|mjs|ts|tsx)',
],
```

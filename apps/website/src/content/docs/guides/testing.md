---
title: Testing Stories
description: Test Storybook stories outside of Storybook using portable stories and Vitest.
---

Stories can double as test cases with **portable stories**. You can compose stories and render them in Vitest without running the Storybook UI.

## Basic test setup

```jsx
// Card.stories.jsx
import Card from './Card.astro';

export default {
  title: 'Astro/Card',
  component: Card,
};

export const Default = {
  args: {
    title: 'My Card Title',
  },
};
```

```typescript
// Card.test.ts
import { screen } from '@testing-library/dom';
import { test, expect } from 'vitest';
import { composeStories, renderStory } from '@storybook-astro/framework/testing';
import * as stories from './Card.stories.jsx';

const { Default } = composeStories(stories);

test('Card Default renders', async () => {
  await renderStory(Default);
  expect(screen.getByText('My Card Title')).toBeInTheDocument();
});
```

## Vitest configuration

Use `defineConfig` from `@storybook-astro/framework/vitest` and pass the same integrations you use in Storybook:

```typescript
import { defineConfig } from '@storybook-astro/framework/vitest';
import { react, vue } from '@storybook-astro/framework/integrations';

export default defineConfig({
  integrations: [react({ include: ['**/react/**'] }), vue()],
  test: {
    environment: 'happy-dom',
  },
});
```

`defineConfig` wires the required internals automatically.

## Testing helpers

From `@storybook-astro/framework/testing`:

- `composeStories(storiesImport, projectAnnotations?)`
- `composeStory(story, componentAnnotations, projectAnnotations?, exportsName?)`
- `setProjectAnnotations(annotations)`
- `renderStory(story)`

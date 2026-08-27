---
title: Testing Stories
description: Test Storybook stories outside of Storybook using portable stories and Vitest.
---

Stories can double as test cases with **portable stories**. You can compose stories and render them in Vitest without running the Storybook UI.

## Requirements

Testing requires **Vitest 4.1.0 or newer**. On `vitest@4.0.x`, importing a story
whose component uses `astro:assets` fails at module load with:

```
TypeError: Unknown file extension ".astro" for .../astro/components/Image.astro
```

Vitest externalized `astro` in its SSR environment on those versions, so
`astro:assets` — which re-exports `astro/components/Image.astro` — reached
Node's ESM loader untransformed. This was fixed in Vitest 4.1.0; `4.0.18`, the
last 4.0 release, still reproduces it.

The framework declares this as an optional peer dependency, so your package
manager will warn if you are below the floor.

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

## Storybook Test addon (`@storybook/addon-vitest`)

Storybook's official test runner turns every story into a Vitest browser test — no
test file to write. It works with Astro components on **Astro 5, 6 and 7**: each
story is rendered through the same server-side pipeline the Storybook canvas
uses, and any [play function](https://storybook.js.org/docs/writing-stories/play-function)
runs against the resulting DOM.

### Setup

Install the addon and Vitest's browser mode:

```bash
npm install --save-dev @storybook/addon-vitest vitest @vitest/browser @vitest/browser-playwright playwright
npx playwright install chromium
```

Register the addon in `.storybook/main.js`:

```javascript
const config = {
  addons: ['@storybook/addon-docs', '@storybook/addon-vitest'],
  // ...
};
```

Then add a dedicated Vitest config:

```typescript
// vitest.storybook.config.ts
import { defineConfig } from 'vitest/config';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';

export default defineConfig({
  plugins: [storybookTest({ configDir: '.storybook' })],
  test: {
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }]
    }
  }
});
```

```bash
npx vitest --config vitest.storybook.config.ts --run
```

### Keep it separate from your portable-stories config

Use a **separate config file** from the `vitest.config.ts` described above, and
give it no `setupFiles`. Two reasons:

- `storybookTest` replaces `test.include` with your story globs, so merging the
  two configs silently drops your existing `*.test.ts` suite.
- `storybookTest` already applies this framework's Vite configuration, which
  merges your Astro config. Do **not** wrap it in `defineConfig` from
  `@storybook-astro/framework/vitest` — that layer is for the portable-stories
  API and would apply the Astro config a second time.
- The addon supplies Storybook's project annotations itself. A setup file
  calling `setProjectAnnotations`, or installing a `happy-dom` window, conflicts
  with the real browser environment.

### Story globs must be relative

`@storybook/addon-vitest` resolves each `stories` entry against your config
directory, so an **absolute** path silently matches nothing and those stories are
never tested. If you pull stories out of another package, make the glob relative:

```javascript
import { fileURLToPath } from 'node:url';
import { dirname, relative } from 'node:path';

function relativeToConfig(pkg) {
  const pkgDir = dirname(fileURLToPath(import.meta.resolve(`${pkg}/package.json`)));

  return relative(dirname(fileURLToPath(import.meta.url)), pkgDir);
}

const config = {
  stories: [
    '../src/**/*.stories.@(js|jsx|mjs|ts|tsx)',
    relativeToConfig('@my/components') + '/src/**/*.stories.@(js|jsx|mjs|ts|tsx)'
  ]
};
```

Stories in `.mdx` files are documentation-only and produce no tests, so they are
reported as skipped.

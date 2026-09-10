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

## Choosing an approach

There are two ways to test stories, and they are good at different things.

**Portable stories** — `composeStories` + `renderStory`, described below. Runs in
Node under happy-dom with no browser, so it is fast. `renderStory` renders the
story through Astro's Container API and puts the resulting HTML into
`document.body`, which you then assert on with `@testing-library/dom`. Use it for
what the component *renders*: content, structure, props, slots, nesting,
decorators.

**The [Storybook Test addon](#storybook-test-addon-storybookaddon-vitest)** —
runs every story as a test in a real browser via Playwright, with no test file to
write. Use it when a test needs real *interaction*: clicking, typing, focus, and
anything driven by a [play function](https://storybook.js.org/docs/writing-stories/play-function).

The dividing line is interaction. Because portable stories render into happy-dom
rather than a browser, `@testing-library/user-event` is unreliable there — it is
the one thing the fast path cannot do well. Reach for the test addon at that
point rather than fighting it.

The two compose fine: most projects assert rendered output with portable stories
and let the test addon cover the stories that have play functions.

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
- `renderStory(story)` — renders the composed story and replaces `document.body`
  with its HTML, so `screen` queries resolve against it
- `renderAstroStory(story)` — an alias for `renderStory`, kept for readability in
  suites that also render framework components

## Testing composed components

Slots, nested components, components passed as props, and decorators all render
through the same server-side pipeline, so `renderStory` handles them without any
extra setup. `within` is useful here: it scopes a query to a subtree, which is
how you assert that a child ended up *inside* its parent rather than beside it.

### A component in a slot

Pass the imported component reference as slot content and assert it rendered
inside the parent:

```typescript
import { screen, within } from '@testing-library/dom';
import { test, expect } from 'vitest';
import { composeStories, renderStory } from '@storybook-astro/framework/testing';
import * as stories from './SlotNesting.stories.jsx';

const { ComponentInSlot } = composeStories(stories);

test('the badge renders inside the panel slot', async () => {
  await renderStory(ComponentInSlot);

  const panel = screen.getByTestId('panel');

  expect(within(panel).getByTestId('badge')).toBeInTheDocument();
});
```

String slot content is sanitized, because it is raw HTML — assert on text rather
than on a `data-*` attribute the allowlist may strip.

### A child with its own props and slots

A slot entry can be a `{ component, props, slots }` descriptor, giving the child
its own content:

```typescript
export const ConfiguredChild = {
  args: {
    slots: {
      default: {
        component: BoxChild,
        props: { label: 'Child label' },
        slots: { default: '<p>Lorem ipsum dolor sit amet</p>' },
      },
    },
  },
};
```

```typescript
test('the child renders as a real component, with its props and slot', async () => {
  await renderStory(ConfiguredChild);

  expect(await screen.findByTestId('box-child')).toBeInTheDocument();
  expect(screen.getByText('Child label')).toBeInTheDocument();
  expect(screen.getByText('Lorem ipsum dolor sit amet')).toBeInTheDocument();
});
```

A slot can also be an array mixing plain HTML with components, including a
wrapper whose opening and closing tags live in separate entries. The array is
sanitized as one document, so the child nests inside the wrapper:

```typescript
args: {
  slots: {
    default: [
      '<div class="Wrapper">',
      { component: BoxChild, slots: { default: '<p>Inside the wrapper</p>' } },
      '</div>',
    ],
  },
}
```

```typescript
test('the child nests inside the wrapper', async () => {
  await renderStory(WrappedChild);

  expect(document.querySelector('.Wrapper')).toContainElement(
    screen.getByTestId('box-child')
  );
});
```

### A component passed as a prop

```typescript
export const ComponentAsProp = {
  args: { label: 'Save', Icon: Badge },
};
```

```typescript
test('the icon renders through the parent template', async () => {
  await renderStory(ComponentAsProp);

  const button = screen.getByTestId('icon-button');

  expect(within(button).getByTestId('badge')).toBeInTheDocument();
  expect(button).toHaveTextContent('Save');
});
```

### Decorators

Component-level decorators need nothing special — `composeStories` applies them,
so the story renders wrapped exactly as it does in Storybook.

Global decorators are not in the story file, so pass them as the second argument
to `composeStories` (or register them once with `setProjectAnnotations`):

```typescript
const { Undecorated } = composeStories(stories, {
  decorators: [(_Story) => ({ component: Wrapper, props: { label: 'Global' } })],
});
```

See the [Slots](/writing-stories/slots/), [Props](/writing-stories/props/) and
[Decorators](/writing-stories/decorators/) guides for the authoring side of each.

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

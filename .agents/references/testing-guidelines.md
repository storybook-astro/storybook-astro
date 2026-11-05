# Testing Guidelines for Storybook Astro

The testing APIs (`composeStories`, `composeStory`, `setProjectAnnotations`, `renderStory`, and `defineConfig` from `/vitest`) are listed in [AGENTS.md's Testing section](../../AGENTS.md#testing). This file covers where tests live, how each kind is written, and how to run them.

## Where Tests Live

Each workspace has its own `vitest.config.ts`, and `yarn test` runs each workspace's `test` script.

| Workspace | What it tests | Environment |
|-----------|---------------|-------------|
| `packages/@storybook-astro/framework` | Unit tests for `src/**/*.test.ts` | `node` |
| `packages/@storybook-astro/renderer` | Unit tests for `src/**/*.test.ts`. Build-only virtual modules resolve to empty modules and are replaced with `vi.mock` | `node` |
| `packages/components` | Shared components, one test per framework folder (`src/<Component>/<framework>/*.test.ts`) | `happy-dom`, with `@testing-library/jest-dom` from `vitest.setup.ts` |
| `integration/astro5`, `astro6`, `astro7` | Astro stories rendered through Astro SSR (`src/components/<Component>/*.test.ts`) | `node`. `lib/vitest-setup.ts` installs happy-dom's `window` and `document` as globals, and `.storybook/vitest.setup.ts` applies the preview's project annotations |

The integration apps also have browser tests:

- `tests/*.spec.ts` - Playwright tests against the built Storybook (`test:browser`)
- `vitest.storybook.config.ts` - Runs the stories through `@storybook/addon-vitest` (`test:storybook`)

## Running Tests

```bash
# Build the packages, then run every workspace's tests (what the pre-PR checklist asks for)
yarn test

# One workspace
yarn workspace @storybook-astro/framework test
yarn workspace @storybook-astro/integration-astro7 test

# Browser tests for one integration app (needs `npx playwright install chromium` once)
yarn workspace @storybook-astro/integration-astro7 test:browser
yarn workspace @storybook-astro/integration-astro7 test:storybook
```

The integration apps and `packages/components` import the framework from `dist`, so run `yarn build:packages` (or keep `yarn dev:packages` running) before running their tests directly.

`defineConfig` from `@storybook-astro/framework/vitest` sets a 15 second test timeout because the shared SSR render server can take a while to start on a cold cache. The first run after a rebuild can still be slow, so rerun a timeout before treating it as a regression.

## Astro Component Tests

This is `integration/astro7/src/components/Counter/Counter.test.ts`. Astro stories render through Astro SSR with `renderStory`, which puts the HTML into the document. Always `await` it.

```typescript
import { screen } from '@testing-library/dom';
import { test, expect } from 'vitest';
import { composeStories, renderStory } from '@storybook-astro/framework/testing';
import * as stories from './Counter.stories.jsx';

const { Default } = composeStories(stories);

test('Astro Counter Default renders via SSR', async () => {
  await renderStory(Default);

  expect(screen.getByTestId('vanilla-counter')).toHaveTextContent('Astro counter: 1');
});
```

Alpine components are Astro components, so they're tested the same way. See `packages/components/src/Counter/alpine/Counter.test.ts`.

To test another set of args or slots, add a story for it and test that story, as `integration/astro7/src/components/SlotBox/` does. Slot content goes in `args.slots`:

```javascript
export const WithSlot = {
  args: {
    slots: { default: '<span>Slot content</span>' },
  },
};
```

## Framework Component Tests

`@storybook-astro/framework/testing` doesn't render framework-delegated stories. Tests for React, Vue, Svelte, Preact and Solid stories compose them with that framework's own Storybook package and render them with the framework. Follow the existing test for the framework:

| Framework | Composed with | Rendered with | Example |
|-----------|---------------|---------------|---------|
| Vue | `@storybook/vue3` | `await Default.run()` | `packages/components/src/Counter/vue/Counter.test.ts` |
| Svelte | `@storybook/svelte` | `await Default.run()` | `packages/components/src/Counter/svelte/Counter.test.ts` |
| React | `@storybook/react-vite` | `createRoot` + `flushSync` | `packages/components/src/Counter/react/Counter.test.ts` |
| Preact | `storybook/preview-api` with `@storybook/preact`'s `setProjectAnnotations` | Preact's `render` | `packages/components/src/Counter/preact/Counter.test.ts` |
| Solid | `storybook/preview-api` with `storybook-solidjs-vite/renderer/solid-legacy` annotations | Not rendered; the test checks the composed story | `packages/components/src/Counter/solid/Counter.test.ts` |

Unmount what you render (`root.unmount()`, `render(null, element)`) and remove the container in a `finally` block, as those tests do.

## Debugging Tests

- `screen.debug()` or `prettyDOM(element)` from `@testing-library/dom` print the rendered HTML
- happy-dom does no layout or style computation (`getBoundingClientRect` returns zeros). Check behavior or markup in Vitest, and put visual checks in the Playwright tests

## Before Pushing

The pre-PR checklist in [AGENTS.md](../../AGENTS.md#before-opening-a-pr) is `yarn lint`, `yarn lint:links` and `yarn test`. CI (`.github/workflows/build.yml`) also builds each integration app and runs `test:browser` and `test:storybook` for astro5, astro6 and astro7.

## Best Practices

1. **Test user-visible behavior**: Query by role, label, text or test id, not component internals
2. **One story per scenario**: Tests compose the story; a new scenario usually means a new story
3. **Keep stories and tests in sync**: If a story changes, update its tests
4. **Name tests as behavior**: `test('renders a configured child component with its own props and slot content')`
5. **Await rendering**: `await renderStory()` for Astro stories, `await story.run()` for Vue and Svelte

## References

- [AGENTS.md](../../AGENTS.md#testing) - Testing APIs and portable stories
- [Vitest Documentation](https://vitest.dev/)
- [Testing Library Queries](https://testing-library.com/docs/queries/about)
- [happy-dom](https://github.com/capricorn86/happy-dom)
- [Storybook Testing Documentation](https://storybook.js.org/docs/writing-tests)

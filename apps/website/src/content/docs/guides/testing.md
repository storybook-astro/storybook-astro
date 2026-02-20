---
title: Testing Stories
description: Test Storybook stories outside of Storybook using portable stories and Vitest.
---

Stories can double as test cases using **portable stories**. The `composeStories` function lets you render and test your Storybook stories in Vitest without launching the full Storybook UI.

## Basic test setup

```typescript
// Card.test.ts
import { composeStories } from '@storybook-astro/framework';
import { testStoryRenders, testStoryComposition } from '@storybook-astro/framework/testing';
import * as stories from './Card.stories.jsx';

const { Default, Highlighted } = composeStories(stories);

// Test that the story can be composed
testStoryComposition('Default', Default);

// Test that the story renders successfully
testStoryRenders('Card Default', Default);
```

## Available functions

### From `@storybook-astro/framework`

- **`composeStories(storiesImport, projectAnnotations?)`** — Compose all stories from a story file for testing
- **`composeStory(story, componentAnnotations, projectAnnotations?, exportsName?)`** — Compose a single story
- **`setProjectAnnotations(annotations)`** — Set global Storybook configuration for tests

### From `@storybook-astro/framework/testing`

- **`testStoryComposition(name, story)`** — Verifies a story can be imported and composed without errors
- **`testStoryRenders(name, story)`** — Validates a story renders successfully in the Storybook context
- **`cjsInteropPlugin()`** — Vite plugin that wraps CJS modules for Vite 6's ESM module runner

## Vitest configuration

Your `vitest.config.ts` needs two custom plugins:

```typescript
import { defineConfig } from 'vitest/config';
import { cjsInteropPlugin } from '@storybook-astro/framework/testing';
import { vitePluginAstroComponentMarker } from '@storybook-astro/framework';

export default defineConfig({
  plugins: [
    cjsInteropPlugin(),
    vitePluginAstroComponentMarker(),
  ],
  test: {
    environment: 'happy-dom',
  },
});
```

- **`cjsInteropPlugin()`** — Auto-detects CJS modules in `node_modules` and wraps them with ESM-compatible shims. Required because Vite 6's ESM runner cannot evaluate raw CJS.
- **`vitePluginAstroComponentMarker()`** — Ensures `.astro` files have `isAstroComponentFactory` set in the test environment, same as in Storybook.

## Test structure pattern

All component tests follow a uniform pattern:

```typescript
import { composeStories } from '@storybook-astro/framework';
import { testStoryRenders, testStoryComposition } from '@storybook-astro/framework/testing';
import * as stories from './Component.stories.jsx';

const { Default } = composeStories(stories);

testStoryComposition('Default', Default);
testStoryRenders('Component Default', Default);
```

## Known limitation: Solid components

Solid components render correctly in Storybook's browser but have an SSR/client compilation mismatch in Vitest. The Vitest config uses a non-recursive glob so `vite-plugin-solid` does not compile nested component files. Without this workaround, Vitest's happy-dom environment compiles Solid in client mode (calling `template()`), but the runtime resolves to `server.js` where `template` is aliased to a function that throws. Composition tests pass; actual Solid rendering is validated in the browser.

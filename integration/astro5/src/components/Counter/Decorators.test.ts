import { composeStory } from 'storybook/internal/preview-api';
import { render as reactRender } from '@storybook/react/entry-preview';
import { render as vueRender } from '@storybook/vue3/entry-preview';
import { screen, within } from '@testing-library/dom';
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { createApp, h } from 'vue';
import { test, expect } from 'vitest';
import { composeStories as composeAstroStories, renderStory } from '@storybook-astro/framework/testing';
import previewAnnotations from '../../../.storybook/preview.js';
import * as reactCounterStories from '@storybook-astro/components/Counter/react/Counter.stories.js';
import * as vueCounterStories from '@storybook-astro/components/Counter/vue/Counter.stories.js';
import * as astroCounterStories from './Counter.stories.jsx';

// This project's DOM test environment (see the FIXME in
// packages/components/vitest.setup.ts) doesn't define `SVGElement`, which
// Vue's runtime checks when mounting an app (`container instanceof
// SVGElement`). Unrelated to decorators — polyfill the minimum Vue needs.
globalThis.SVGElement ??= class SVGElement {} as unknown as typeof SVGElement;

// Issue #40 (Step 1): this app's `.storybook/preview.js` declares a global
// decorator alongside the shared React/Vue Counter stories' own story-level
// decorator (packages/components/src/Counter/{react,vue}). Both must survive
// the REAL delegation path — `renderToCanvas` handing off to
// `typedRenderers[renderer].renderToCanvas`, which calls `ctx.storyFn()`
// itself (see AGENTS.md, "Framework fallback").
//
// `ctx.storyFn` is decorated using Storybook's generic `defaultDecorateStory`,
// because @storybook-astro/framework doesn't supply a custom `applyDecorators`
// yet (docs/DECORATOR_SUPPORT.md, Step 2). That's a *different*, less
// forgiving composition path than each framework's own portable-stories
// `composeStories` (which uses that framework's own `decorateStory`/
// `applyDecorators`) — so these tests reconstruct the generic path directly:
// `composeStory` from 'storybook/internal/preview-api' plus each framework's
// own `render` from its `entry-preview` module (the same module
// `virtual:storybook-renderer-fallback` re-exports for the real pipeline).
//
// The Vue case swaps in a plain in-memory component instead of the real
// `Counter.vue`: this app's own Astro Vue integration compiles `.vue` files
// for Astro's server-first rendering (targeting SSR), which needs a mount
// path this test doesn't set up and isn't itself decorator-related. The real
// `Counter.vue` markup is already covered at the shared-component level
// (packages/components/src/Counter/vue/Counter.test.ts), where the Vite
// pipeline compiles it for plain client-side Vue instead.
const FakeVueCounter = { render: () => h('div', { 'data-testid': 'vue-counter' }, 'Vue counter: 1') };
const vueCounterMeta = { ...vueCounterStories.default, component: FakeVueCounter };

test('React Counter WithDecorator composes the global and story-level decorators through the real delegation pipeline', () => {
  const composed = composeStory(
    reactCounterStories.WithDecorator,
    reactCounterStories.default,
    previewAnnotations,
    { render: reactRender, decorators: [] },
    'WithDecorator'
  );

  const element = document.createElement('div');

  document.body.append(element);
  const root = createRoot(element);

  try {
    flushSync(() => {
      root.render(createElement(composed));
    });

    const globalWrapper = screen.getByTestId('decorator-global');
    const storyWrapper = within(globalWrapper).getByTestId('story-decorator');

    expect(within(storyWrapper).getByTestId('react-counter')).toHaveTextContent('React counter: 1');
  } finally {
    root.unmount();
    element.remove();
  }
});

test('Vue Counter WithDecorator composes the global and story-level decorators through the real delegation pipeline', () => {
  const composed = composeStory(
    vueCounterStories.WithDecorator,
    vueCounterMeta,
    previewAnnotations,
    { render: vueRender, decorators: [] },
    'WithDecorator'
  );

  const element = document.createElement('div');

  document.body.append(element);

  const app = createApp({
    setup() {
      return () => h(composed());
    },
  });

  try {
    app.mount(element);

    const globalWrapper = screen.getByTestId('decorator-global');
    const storyWrapper = within(globalWrapper).getByTestId('story-decorator');

    expect(within(storyWrapper).getByTestId('vue-counter')).toHaveTextContent('Vue counter: 1');
  } finally {
    app.unmount();
    element.remove();
  }
});

// Critical subtlety (docs/DECORATOR_SUPPORT.md): the global decorators above
// must be a strict pass-through for Astro stories, which never set
// `parameters.renderer`. Prove the existing local Astro story still renders
// exactly as its own Counter.test.ts expects, and that no decorator wrapper
// leaks onto it.
test('Astro Counter Default is unaffected by the app global decorators', async () => {
  const { Default } = composeAstroStories(astroCounterStories);

  await renderStory(Default);

  expect(screen.getByTestId('vanilla-counter')).toHaveTextContent('Astro counter: 1');
  expect(screen.queryByTestId('decorator-global')).not.toBeInTheDocument();
});

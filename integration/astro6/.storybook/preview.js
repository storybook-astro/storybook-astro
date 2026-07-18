import './preview.css';
import { createElement } from 'react';
import { h } from 'vue';

// Global decorators apply to EVERY story in this Storybook, including Astro
// component stories — which don't support decorators yet (docs/DECORATOR_SUPPORT.md).
// Astro stories never set `parameters.renderer`, so each decorator below guards
// on the framework it targets and is a strict pass-through otherwise, per
// Decision 3 in that doc. Covers issue #40, Step 1.
const wrapReactStoryInGlobalDecorator = (Story, ctx) => {
  if (ctx.parameters.renderer !== 'react') {
    return Story();
  }

  return createElement(
    'div',
    { className: 'decorator-global', 'data-testid': 'decorator-global' },
    Story()
  );
};

// Vue3's documented decorator shape (`(story) => ({ components: { story },
// template })`) relies on Vue3's own `decorateStory` to normalize the
// descriptor into a mountable tree. This project has no custom
// `applyDecorators` yet (Step 2), so every decorator — Vue's included —
// composes through Storybook's generic `defaultDecorateStory`, which does not
// perform that normalization: the descriptor form renders as a stringified
// function instead of a nested component. Returning a render function that
// calls `h()` directly matches the shape Vue3's own base `render()` already
// produces (`() => h(Component, props, slots)`), so it composes correctly
// under both the generic pipeline and Vue3's own — use this form instead.
const wrapVueStoryInGlobalDecorator = (story, ctx) => {
  if (ctx.parameters.renderer !== 'vue') {
    return story();
  }

  return () =>
    h('div', { class: 'decorator-global', 'data-testid': 'decorator-global' }, [h(story())]);
};

/** @type { import('@storybook-astro/framework').Preview } */
const preview = {
  tags: ['autodocs'],
  decorators: [wrapReactStoryInGlobalDecorator, wrapVueStoryInGlobalDecorator],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    options: {
      storySort: {
        order: [
          'Overview',
          'Astro', ['About', '*'],
          'Alpine', ['About', '*'],
          'React', ['About', '*'],
          'Vue', ['About', '*'],
          'Svelte', ['About', '*'],
          'Preact', ['About', '*'],
          'Solid', ['About', '*'],
        ],
      },
    },
  },
};

export default preview;

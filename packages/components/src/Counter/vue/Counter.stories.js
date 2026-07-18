import { h } from 'vue';
import Counter from './Counter.vue';

export default {
  parameters: {
    renderer: 'vue',
    docs: {
      description: {
        component: 'A simple counter using Vue\'s `ref` reactivity. No props - starts at 1 and increments on click.',
      },
    },
  },
  title: 'Vue/Counter',
  component: Counter,
};

export const Default = {
  parameters: {
    docs: { description: { story: 'Counter starting at 1.' } },
  },
};

// Regression coverage for issue #40: a story-level decorator must still wrap
// the rendered output when the story is delegated to Vue's own renderer.
//
// This uses `h()` directly rather than Vue 3's documented `{ components:
// { story }, template }` descriptor shape. That shape needs Vue 3's own
// `decorateStory` to normalize it into a mountable tree, and this project has
// no custom `applyDecorators` yet (docs/DECORATOR_SUPPORT.md, Step 2) — every
// decorator, this one included, composes through Storybook's generic
// `defaultDecorateStory`, which skips that normalization and would render the
// descriptor as a stringified function instead of a nested component. A render
// function that calls `h()` directly matches the shape Vue 3's own base
// `render()` already produces (`() => h(Component, props, slots)`), so it
// composes correctly under both the generic pipeline and Vue 3's own.
export const WithDecorator = {
  parameters: {
    docs: { description: { story: 'Counter wrapped in a story-level decorator.' } },
  },
  decorators: [
    (story) => () =>
      h('div', { class: 'decorator-story-level', 'data-testid': 'story-decorator' }, [h(story())]),
  ],
};

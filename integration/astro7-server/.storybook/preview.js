import './preview.css';
import { createElement } from 'react';
import { h } from 'vue';
import GlobalWrapper from '@storybook-astro/components/Decorator/GlobalWrapper.astro';

// Global decorators apply to EVERY story in this Storybook. Astro stories
// default `parameters.renderer` to 'astro', so each decorator below guards on
// the framework it targets and is a strict pass-through otherwise, per
// Decision 3 in docs/specs/decorators.md. Covers issue #40 (see
// #framework-delegation for React/Vue, #global-decorators for the real Astro
// global decorator below).
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
// descriptor into a mountable tree. Our `applyDecorators` (Step 2) routes
// framework-delegated stories (`parameters.renderer` set) through Storybook's
// generic `defaultDecorateStory` (Decision 3), not Vue3's own — so the
// descriptor form would render as a stringified function instead of a nested
// component. Returning a render function that calls `h()` directly matches
// the shape Vue3's own base `render()` already produces (`() =>
// h(Component, props, slots)`), so it composes correctly under both the
// generic pipeline and Vue3's own — use this form instead.
const wrapVueStoryInGlobalDecorator = (story, ctx) => {
  if (ctx.parameters.renderer !== 'vue') {
    return story();
  }

  return () =>
    h('div', { class: 'decorator-global', 'data-testid': 'decorator-global' }, [h(story())]);
};

// The real Astro global decorator (docs/specs/decorators.md#global-decorators): wraps
// EVERY Astro story in this app in GlobalWrapper.astro. Guarded the opposite
// way from the two decorators above — it applies only when a story IS
// Astro-rendered — since `parameters.renderer` defaults to 'astro' rather
// than being unset. `GlobalWrapper.astro` is deliberately unstyled (no
// `<style>` block, no classes) so this doesn't change any story's visible
// appearance or break Chromatic snapshots.
const wrapAstroStoryInGlobalDecorator = (Story, ctx) => {
  // `parameters.renderer` defaults to 'astro' and is deliberately never unset
  // for a real Astro story (see the note on applyDecorators in
  // renderer/src/decorators.ts) — but treat it as astro when merely falsy too,
  // the same way applyDecorators itself does, since that default parameter
  // isn't guaranteed to be present in every context that composes a story.
  if (ctx.parameters.renderer && ctx.parameters.renderer !== 'astro') {
    return Story();
  }

  return { component: GlobalWrapper, props: { theme: ctx.globals?.theme } };
};

/** @type { import('@storybook-astro/framework').Preview } */
const preview = {
  tags: ['autodocs'],
  decorators: [wrapReactStoryInGlobalDecorator, wrapVueStoryInGlobalDecorator, wrapAstroStoryInGlobalDecorator],
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

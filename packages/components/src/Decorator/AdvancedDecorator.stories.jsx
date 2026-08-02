import Card from '../Card/astro/Card.astro';
import Wrapper from './Wrapper.astro';
import LayoutWithSlots from './LayoutWithSlots.astro';

// Step 6 coverage (docs/DECORATOR_SUPPORT.md): the remaining Decorator
// Contract shapes not yet exercised by Decorator.stories.jsx /
// StoryLevelDecorator.stories.jsx — a two-decorator chain, an HTML-string
// decorator, and a named-slot descriptor. Each story below sets its own
// story-level `decorators`, so every shape is isolated to one story.
export default {
  title: 'Astro/Decorators/Advanced',
  component: Card,
  parameters: {
    docs: {
      description: {
        component:
          'Remaining Astro decorator shapes: a two-decorator chain, an HTML-string decorator, and a named-slot descriptor (docs/DECORATOR_SUPPORT.md).',
      },
    },
  },
};

// Two-decorator chain (docs/DECORATOR_SUPPORT.md): decorators compose
// inside-out — decorators[0] wraps the story directly, and each later entry
// wraps everything decided so far — so the LAST array entry ends up
// outermost. Wrapper[label="Outer"] must end up wrapping
// Wrapper[label="Inner"], which wraps the story.
export const TwoDecoratorChain = {
  args: {
    title: 'Two-decorator chain',
    content: 'Wrapped by two Wrapper.astro decorators, nested.',
  },
  decorators: [
    (_Story) => ({ component: Wrapper, props: { label: 'Inner' } }),
    (_Story) => ({ component: Wrapper, props: { label: 'Outer' } }),
  ],
};

// HTML string decorator — the "obvious" syntax (docs/DECORATOR_SUPPORT.md):
// `Story()` returns a placeholder token that composition splits the string
// around, so the user-authored markup is sanitized while the story's own
// rendered HTML is spliced in trusted (#149). `class` is on the sanitizer's
// attribute allowlist (lib/sanitization.ts); `data-testid` is not, so the test
// for this story selects by class rather than a test id.
export const HtmlStringWrapped = {
  args: {
    title: 'HTML-string decorator',
    content: 'Wrapped by a template-literal decorator, not a component descriptor.',
  },
  decorators: [(Story) => `<div class="dark-bg">${Story()}</div>`],
};

// Bare-component sugar (docs/DECORATOR_SUPPORT.md, Decorator Contract form 3):
// a decorator entry can be the Astro component itself, with no wrapping
// function — sugar for `(Story) => ({ component: Wrapper })`, story in the
// default slot automatically.
export const BareComponentWrapped = {
  args: {
    title: 'Bare-component sugar',
    content: 'Wrapped by `decorators: [Wrapper]` — no decorator function at all.',
  },
  decorators: [Wrapper],
};

// Named-slot decorator (docs/DECORATOR_SUPPORT.md): the descriptor sets
// `slots.default` explicitly alongside a second, named slot — LayoutWithSlots
// renders both. `<nav>` isn't on the sanitizer's tag allowlist, so it's
// stripped from the sidebar string; the text inside it survives, which is
// all this story needs to prove named slots work.
export const NamedSlotWrapped = {
  args: {
    title: 'Named-slot decorator',
    content: "Placed in the layout's default slot alongside a sidebar.",
  },
  decorators: [
    (Story) => ({
      component: LayoutWithSlots,
      slots: { default: Story(), sidebar: '<nav>sidebar</nav>' },
    }),
  ],
};

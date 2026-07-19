import Card from '../Card/astro/Card.astro';
import Wrapper from './Wrapper.astro';

// Isolates the story-level and global (project-annotations) decorator
// positions from Decorator.stories.jsx's meta-level one (docs/DECORATOR_SUPPORT.md,
// Step 5) — this file's default export carries no decorators of its own.
export default {
  title: 'Astro/Decorators/StoryLevel',
  component: Card,
  parameters: {
    docs: {
      description: {
        component:
          'Story-level and global-level Astro decorator coverage for Decorator.test.ts. No meta-level decorator here — see Decorator.stories.jsx for that position.',
      },
    },
  },
};

// Story-level decorator (a `decorators` array on the story export itself):
// only this story is wrapped.
export const StoryLevelWrapped = {
  args: {
    title: 'Story-level wrapped',
    content: 'This card is wrapped by a story-level decorator only.',
  },
  decorators: [(_Story) => ({ component: Wrapper, props: { label: 'Story-level' } })],
};

// No decorators anywhere on this export. Decorator.test.ts composes it with a
// `decorators` array passed via `composeStories`' `projectAnnotations`
// parameter, mirroring what a global `.storybook/preview.js` would apply.
export const Undecorated = {
  args: {
    title: 'Undecorated',
    content: 'This card has no decorators of its own.',
  },
};

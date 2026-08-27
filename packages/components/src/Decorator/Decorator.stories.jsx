import Card from '../Card/astro/Card.astro';
import Wrapper from './Wrapper.astro';

// Component-level decorator (docs/specs/decorators.md#static-prerender): every story in
// this file renders inside Wrapper.astro, with the story placed in Wrapper's
// default slot automatically since the descriptor below never sets `slots`.
export default {
  title: 'Astro/Decorators/Wrapper',
  component: Card,
  // `Story` is never called explicitly, so the inner story is placed in
  // Wrapper's default slot automatically (docs/specs/decorators.md).
  decorators: [(_Story) => ({ component: Wrapper, props: { label: 'Wrapped in preview' } })],
  parameters: {
    docs: {
      description: {
        component:
          'A component-level Astro decorator wraps every story in this file with `Wrapper.astro`. Covers both the static prerender and server-mode render paths (docs/specs/decorators.md).',
      },
    },
  },
};

export const Decorated = {
  args: {
    title: 'Decorated card',
    content: 'This card is wrapped by a component-level decorator.',
  },
};

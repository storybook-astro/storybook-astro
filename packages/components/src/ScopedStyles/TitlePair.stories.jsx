import TitlePair from './TitlePair.astro';

export default {
  title: 'Astro/Scoped Styles/Class Name Collision',
  component: TitlePair,
  parameters: {
    docs: {
      description: {
        component:
          'Two components that both style a `.title` class (issue #189). Each one\'s styles are scoped to its own markup, so the titles stay red and blue.',
      },
    },
  },
};

export const SameClassName = {};

import PageCard from '@storybook-astro/components/PageCard/astro/PageCard.astro';
import storybookAstro from '../../assets/storybook-astro.png';

export default {
  title: 'Astro/PageCard',
  component: PageCard,
  parameters: {
    docs: {
      description: {
        component:
          'A composite card component that nests Card.astro and uses astro:assets <Image>. ' +
          'Tests that template nesting and image rendering both work via the Container API, ' +
          "and that the nested Card's scoped styles load in the browser (issue #114).",
      },
    },
  },
};

export const Default = {
  parameters: {
    docs: { description: { story: 'PageCard with a title, description, and imported image.' } },
  },
  args: {
    title: 'Storybook Astro',
    content: 'Build and test Astro components in Storybook.',
    imageSrc: storybookAstro,
    imageAlt: 'Storybook Astro logo',
  },
};

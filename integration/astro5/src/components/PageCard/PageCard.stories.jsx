import PageCard from '@storybook-astro/components/PageCard/astro/PageCard.astro';
import storybookAstro from '../../assets/storybook-astro.png';

export default {
  title: 'Astro/PageCard',
  component: PageCard,
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

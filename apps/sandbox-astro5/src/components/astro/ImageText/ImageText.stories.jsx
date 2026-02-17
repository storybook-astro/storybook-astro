import ImageText from './ImageText.astro';
import storybookAstro from '../../../assets/storybook-astro.png';

export default {
  title: 'Astro/ImageText',
  component: ImageText,
};

export const Default = {
  args: {
    imageSrc: storybookAstro,
    imageAlt: 'Astro Storybook Earth',
    slots: {
      default: `
        <h2>Welcome to Storybook Astro</h2>
        <p>
          Experience the power of Astro components in Storybook's interactive environment. 
          This integration brings together the best of both worlds.
        </p>
      `,
    },
  },
};

export const ImageRight = {
  args: {
    imageSrc: storybookAstro,
    imageAlt: 'Astro Storybook Earth',
    reversed: true,
    slots: {
      default: `
        <h2>Reversed Layout</h2>
        <p>
          The ImageText component can be easily reversed to place the image on the right side. 
          Just use the reversed prop to change the layout direction.
        </p>
      `,
    },
  },
};

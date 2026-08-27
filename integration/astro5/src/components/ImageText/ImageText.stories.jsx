import ImageText from '@storybook-astro/components/ImageText/astro/ImageText.astro';
import storybookAstro from '../../assets/storybook-astro.png';

export default {
  title: 'Astro/ImageText',
  component: ImageText,
};

export const Default = {
  parameters: {
    docs: { description: { story: 'Image on the left with welcome text in the default slot.' } },
  },
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
  parameters: {
    docs: { description: { story: 'Reversed layout with image on the right.' } },
  },
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

export const SanitizeDangerousHtml = {
  parameters: {
    docs: { description: { story: 'Image on the left with welcome text in the default slot.' } },
  },
  args: {
    imageSrc: storybookAstro,
    imageAlt: 'Astro Storybook Earth',
    slots: {
      default: `
        <script>document.body.innerHTML = 'This content should never be visible';</script>
        <h2>Welcome to Storybook Astro</h2>
        <p>
          Script injected through default slot should not appear in produced HTML
        </p>
      `,
    },
  },
};
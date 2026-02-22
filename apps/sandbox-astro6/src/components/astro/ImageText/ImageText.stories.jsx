import ImageText from '@storybook-astro/components/ImageText/astro/ImageText.astro';
import storybookAstro from '../../../assets/storybook-astro.png';

export default {
  title: 'Astro/ImageText',
  component: ImageText,
  parameters: {
    docs: {
      description: {
        component: 'A two-column layout with an image and text content side by side. Supports reversing the order and accepts a `default` slot for the text column. Responsive — stacks vertically on mobile.',
      },
    },
  },
  argTypes: {
    imageSrc: {
      description: 'Image source — an imported asset (ImageMetadata) or a URL string.',
      table: {
        type: { summary: 'ImageMetadata | string' },
      },
    },
    imageAlt: {
      description: 'Alt text for the image.',
      control: 'text',
      table: {
        type: { summary: 'string' },
        defaultValue: { summary: "'Image'" },
      },
    },
    reversed: {
      description: 'Places the image on the right side instead of the left.',
      control: 'boolean',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'false' },
      },
    },
  },
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
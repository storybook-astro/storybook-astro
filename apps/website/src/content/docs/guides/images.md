---
title: Images
description: Using Astro's Image component and astro:assets in Storybook stories.
---

Astro's built-in `<Image>` component from `astro:assets` provides image optimization. It works within Astro components rendered in Storybook, but with some limitations.

## Current status

Image support is **partial**. The `<Image>` component works inside Astro components rendered via the Container API, but Storybook's module resolution doesn't fully support all `astro:assets` features.

## Recommended pattern: dual source support

The best approach is to design your components to accept both `ImageMetadata` objects (from Astro imports) and plain string URLs. This makes them work in both Astro's normal build pipeline and in Storybook:

```astro
---
// ImageText.astro
import { Image } from 'astro:assets';

interface Props {
  imageSrc: any;
  imageAlt?: string;
  reversed?: boolean;
}

const { imageSrc, imageAlt = 'Image', reversed = false } = Astro.props;
const isStringUrl = typeof imageSrc === 'string';
---

<div class="image-text" class:list={{ reversed }}>
  <div class="image-container">
    {isStringUrl ? (
      <img src={imageSrc} alt={imageAlt} />
    ) : (
      <Image src={imageSrc} alt={imageAlt} />
    )}
  </div>
  <div class="text-container">
    <slot />
  </div>
</div>
```

## Writing stories with images

In story files, import image assets directly. The Vite build pipeline will resolve them to the correct paths:

```jsx
// ImageText.stories.jsx
import ImageText from './ImageText.astro';
import storybookAstro from '../../../assets/storybook-astro.png';

export default {
  title: 'Astro/ImageText',
  component: ImageText,
  argTypes: {
    imageSrc: {
      description: 'Image source — an imported asset (ImageMetadata) or a URL string.',
      table: { type: { summary: 'ImageMetadata | string' } },
    },
    imageAlt: {
      description: 'Alt text for the image.',
      control: 'text',
    },
    reversed: {
      description: 'Places the image on the right side.',
      control: 'boolean',
    },
  },
};

export const Default = {
  args: {
    imageSrc: storybookAstro,
    imageAlt: 'Astro Storybook Earth',
    slots: {
      default: `
        <h2>Welcome to Storybook Astro</h2>
        <p>This integration brings together the best of both worlds.</p>
      `,
    },
  },
};
```

## Limitations

- **Module resolution**: `astro:assets` relies on virtual module resolution that may not fully work in Storybook's SSR context. The dual-source pattern above works around this.
- **Image optimization**: In dev mode, images imported via `astro:assets` receive Astro's optimization pipeline. In static Storybook builds, the pre-render step emits images as Rollup assets with content-hashed filenames.
- **Font optimization**: Astro's font virtual modules (`virtual:astro:assets/fonts/*`) are stubbed with no-op exports in Storybook. Components render correctly but without Astro's font optimization. See [Astro 6 Compatibility](/how-it-works/astro6-compat/) for details.

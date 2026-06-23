---
title: Images
description: Using Astro's Image component and astro:assets in Storybook stories.
---

Astro's built-in `<Image>` component from `astro:assets` works in Storybook stories without any special workarounds.

## Using `<Image>` in components

Components that use `<Image>` work in Storybook as-is. Import and use `<Image>` the same way you would in a regular Astro project:

```astro
---
// ImageText.astro
import type { ImageMetadata } from 'astro';
import { Image } from 'astro:assets';

interface Props {
  imageSrc: ImageMetadata;
  imageAlt?: string;
}

const { imageSrc, imageAlt = 'Image' } = Astro.props;
---

<div>
  <Image src={imageSrc} alt={imageAlt} />
</div>
```

## Writing stories with images

Import image assets directly in story files. Vite resolves them to `ImageMetadata` objects, which Storybook Astro passes through to the Container API unchanged:

```jsx
// ImageText.stories.jsx
import ImageText from './ImageText.astro';
import myImage from '../assets/my-image.png';

export default {
  component: ImageText,
};

export const Default = {
  args: {
    imageSrc: myImage,
    imageAlt: 'My image',
  },
};
```

## How it works

Storybook Astro injects a passthrough image service before rendering components. This service returns direct Vite asset URLs (`/@fs/...`) for imported `ImageMetadata` objects, bypassing Astro's image optimization pipeline in dev mode. The `ImageMetadata` object is passed unchanged to `<Image>`, so Astro's internal checks pass without errors.

In static builds (`storybook build`), images are emitted as Rollup assets and referenced by their content-hashed filenames.

## Accepting both `ImageMetadata` and URL strings

If you want your component to accept both `ImageMetadata` (for Astro imports) and plain URL strings (e.g. for external images), use a union type:

```astro
---
import type { ImageMetadata } from 'astro';
import { Image } from 'astro:assets';

interface Props {
  imageSrc: ImageMetadata | string;
  imageAlt?: string;
}

const { imageSrc, imageAlt = 'Image' } = Astro.props;
---

<Image src={imageSrc as ImageMetadata} alt={imageAlt} />
```

This is useful for components that need to work with both local assets and remote URLs.

## Limitations

- **Fonts**: Font families declared in your `astro.config.*` via Astro's Font Provider API are auto-loaded into Storybook's SSR context and their CSS variables are exposed to rendered components. See [Version Compatibility](/how-it-works/version-compatibility/) for details.
- **Image optimization in dev mode**: Images are served as direct Vite asset URLs rather than going through Astro's image optimization pipeline. This means resizing, format conversion, and quality settings in `<Image>` props are not applied during Storybook dev mode.

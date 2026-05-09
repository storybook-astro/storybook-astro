---
title: Controls & ArgTypes
description: Customize Storybook's Controls panel for Astro component stories.
---

Use `argTypes` to customize how Storybook's Controls panel renders each arg.

## Defining argTypes

```jsx
export default {
  title: 'Components/Header',
  component: Header,
  argTypes: {
    logoText: { control: 'text' },
    currentPath: { control: 'text' },
    navItems: { control: 'object' },
  },
};
```

You can specify control types (`text`, `boolean`, `number`, `object`, `select`, etc.), descriptions, default values, and table metadata:

```jsx
export default {
  title: 'Components/ImageText',
  component: ImageText,
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
```

## Static build limitation

In static builds (`storybook build`), Astro components are pre-rendered at build time with their default args. The Controls panel cannot re-render them with different values.

The package handles this automatically: in a static build, all control inputs for Astro component stories are disabled and an **ℹ️ Astro** info row appears in the Controls table explaining that the component is pre-rendered. No configuration is needed.

Controls work fully in dev mode (`storybook dev`) and for framework component stories (React, Vue, etc.) in all modes.

See [Static Builds](/how-it-works/static-builds/) for more details.

---
title: Story Basics
description: Learn how to write Storybook stories for Astro components.
---

Story files tell Storybook which component to render and what variations (stories) to show. Each story file exports a **default export** (metadata) and one or more **named exports** (individual stories).

## Basic structure

Create a `.stories.jsx` file next to your component:

```jsx
// Button.stories.jsx
import Button from './Button.astro';

export default {
  title: 'Components/Button',
  component: Button,
};

export const Default = {};

export const Primary = {
  args: {
    variant: 'primary',
    label: 'Click me',
  },
};

export const Disabled = {
  args: {
    label: 'Disabled',
    disabled: true,
  },
};
```

- **`title`** — Sets the location in Storybook's sidebar (e.g. `Components/Button` creates a `Button` entry under the `Components` group).
- **`component`** — The Astro component to render.
- **`args`** — Props passed to the component. Each named export is a separate story with its own args.

## File naming conventions

By convention, place story files next to the component they document:

```
src/components/
  Card/
    Card.astro
    Card.stories.jsx    ← story file
    Card.test.ts        ← test file (optional)
```

Story files can use `.js`, `.jsx`, `.ts`, or `.tsx` extensions. JSX extensions (`.jsx`/`.tsx`) are recommended since they allow JSX syntax if needed.

## Next steps

- [Props](/writing-stories/props/) — Passing data to your components
- [Slots](/writing-stories/slots/) — Content projection with Astro slots
- [Controls & ArgTypes](/writing-stories/controls/) — Interactive controls in the Storybook UI
- [Framework Components](/writing-stories/framework-components/) — React, Vue, Svelte, and other framework stories

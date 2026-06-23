---
title: Props
description: Pass props to Astro components in Storybook stories.
---

The `args` object in a story maps directly to the component's `Astro.props`.

## Basic props

```astro
---
// Card.astro
const { title = 'Default title', content = 'Default content', highlight = false } = Astro.props;
---

<div class:list={['card', { highlight }]}>
  <h2>{title}</h2>
  <p>{content}</p>
</div>
```

```jsx
// Card.stories.jsx
import Card from './Card.astro';

export default {
  title: 'Components/Card',
  component: Card,
};

export const Default = {};

export const Highlighted = {
  args: {
    title: 'Featured Card',
    content: 'This card is highlighted',
    highlight: true,
  },
};
```

When no `args` are provided (like `Default = {}`), the component renders with its default prop values.

## Complex data

Props can be any serializable value — strings, numbers, booleans, arrays, and objects:

```jsx
// Accordion.stories.jsx
import Accordion from './Accordion.astro';

export default {
  title: 'Components/Accordion',
  component: Accordion,
};

export const Default = {
  args: {
    items: [
      { title: 'Section 1', content: 'Content for section 1' },
      { title: 'Section 2', content: 'Content for section 2' },
      { title: 'Section 3', content: 'Content for section 3' },
    ],
  },
};

export const MultipleOpen = {
  args: {
    allowMultiple: true,
    items: [
      { title: 'First', content: 'Can open multiple at once' },
      { title: 'Second', content: 'Try clicking multiple headers' },
    ],
  },
};
```

## Component props

A prop can be another Astro component. The parent renders it from `Astro.props` with `<Comp />`, and Storybook resolves the real component so it renders natively:

```astro
---
// IconButton.astro
const { Icon, label } = Astro.props;
---

<button>
  {Icon ? <Icon /> : null}
  <span>{label}</span>
</button>
```

```jsx
// IconButton.stories.jsx
import IconButton from './IconButton.astro';
import StarIcon from './StarIcon.astro';

export default {
  title: 'Components/IconButton',
  component: IconButton,
};

export const WithIcon = {
  args: {
    label: 'Favorite',
    Icon: StarIcon,
  },
};
```

The component is passed as a bare reference and renders with its default props. To place a component inside a `<slot />` rather than a prop, see [Slots](/writing-stories/slots/#passing-a-component-as-slot-content).

## Shared default args

Set default args at the metadata level so every story inherits them:

```jsx
export default {
  title: 'Components/Card',
  component: Card,
  args: {
    title: 'Card Title',
    content: 'Card content goes here',
  },
};

// Inherits title + content from defaults
export const Default = {};

// Overrides just highlight, inherits the rest
export const Highlighted = {
  args: {
    highlight: true,
  },
};
```

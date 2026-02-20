---
title: Slots
description: Pass slot content to Astro components in Storybook stories.
---

Astro components use [slots](https://docs.astro.build/en/basics/astro-components/#slots) for content projection. In Storybook, you pass slot content through a special `slots` property inside `args`.

## Default slot

The default slot (`<slot />`) receives content via `args.slots.default`:

```astro
---
// Alert.astro
const { variant = 'info' } = Astro.props;
---

<div class:list={['alert', variant]}>
  <slot />
</div>
```

```jsx
// Alert.stories.jsx
import Alert from './Alert.astro';

export default {
  title: 'Components/Alert',
  component: Alert,
};

export const Info = {
  args: {
    variant: 'info',
    slots: {
      default: '<p>This is an informational message.</p>',
    },
  },
};

export const Warning = {
  args: {
    variant: 'warning',
    slots: {
      default: '<p><strong>Warning:</strong> Something needs attention.</p>',
    },
  },
};
```

Slot content is passed as an **HTML string**. You can include any valid HTML — elements, nested markup, inline styles, etc.

## Named slots

Named slots (`<slot name="..." />`) are passed using matching keys in `args.slots`:

```astro
---
// Modal.astro
const { open = false } = Astro.props;
---

<div class:list={['modal', { open }]}>
  <div class="modal-header">
    <slot name="header" />
  </div>
  <div class="modal-body">
    <slot />
  </div>
  <div class="modal-footer">
    <slot name="footer" />
  </div>
</div>
```

```jsx
// Modal.stories.jsx
import Modal from './Modal.astro';

export default {
  title: 'Components/Modal',
  component: Modal,
};

export const Default = {
  args: {
    open: true,
    slots: {
      header: '<h2>Confirm Action</h2>',
      default: '<p>Are you sure you want to proceed?</p>',
      footer: '<button>Cancel</button> <button>Confirm</button>',
    },
  },
};
```

Each key in the `slots` object corresponds to a slot name in the component. The `default` key maps to the unnamed `<slot />`.

## Combining props and slots

Props and slots are passed together in the same `args` object. Regular properties become `Astro.props`, and the `slots` property is handled separately by the renderer:

```jsx
export const Default = {
  args: {
    imageSrc: '/hero.png',
    imageAlt: 'Hero image',
    slots: {
      default: `
        <h2>Welcome</h2>
        <p>This is the text content beside the image.</p>
      `,
    },
  },
};
```

## Tips

- **Slot content is HTML** — You write raw HTML strings, not JSX or Astro template syntax.
- **Multi-line content** — Use template literals (backtick strings) for readable multi-line slot content.
- **No slot fallback in stories** — If you don't provide a `slots` entry, the component's `<slot>` fallback content (if any) will render.
- **Static in builds** — Like other Astro component args, slot content is pre-rendered at build time. It's fully interactive in dev mode.

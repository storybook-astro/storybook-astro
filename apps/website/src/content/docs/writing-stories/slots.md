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

Slot content can be an **HTML string** (any valid HTML — elements, nested markup, inline styles) or an **Astro component** (see [Passing a component as slot content](#passing-a-component-as-slot-content)).

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

## Passing a component as slot content

A `slots` entry can be another Astro component instead of an HTML string — the equivalent of React's `children`:

```astro
---
// Panel.astro
const { title } = Astro.props;
---

<section class="panel">
  <h2>{title}</h2>
  <div class="panel-body"><slot /></div>
</section>
```

```jsx
// Panel.stories.jsx
import Panel from './Panel.astro';
import Badge from './Badge.astro';

export default {
  title: 'Components/Panel',
  component: Panel,
};

export const WithComponent = {
  args: {
    title: 'Status',
    slots: {
      default: Badge,
    },
  },
};
```

The component is server-rendered and its markup is placed into the slot, with its scoped styles intact. This also works for named slots.

A component passed this way renders with its **default props** — the bare component reference is what's placed in the slot. To render slot content with specific props or text, use an HTML string instead.

:::note
Component slot content keeps its own rendered markup as-is. Plain **string** slot content is still run through HTML [sanitization](/guides/sanitization/), which strips attributes outside the allowlist (e.g. `data-*`).
:::

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

- **Slot content is an HTML string or a component** — write raw HTML strings (not JSX or Astro template syntax), or pass an imported Astro component.
- **Multi-line content** — Use template literals (backtick strings) for readable multi-line slot content.
- **No slot fallback in stories** — If you don't provide a `slots` entry, the component's `<slot>` fallback content (if any) will render.
- **Static in builds** — Like other Astro component args, slot content is pre-rendered at build time. It's fully interactive in dev mode.

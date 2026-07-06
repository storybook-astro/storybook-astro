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

Slot content can be an **HTML string** (any valid HTML — elements, nested markup, inline styles), an **Astro component** (see [Passing a component as slot content](#passing-a-component-as-slot-content)), a **configured component** with its own props and slots, or an **array** mixing any of these.

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

A bare component reference renders with its **default props** and no slot content of its own. To give the child its own props and slot content, use a configured component (next section).

:::note
Component slot content keeps its own rendered markup as-is. Plain **string** slot content is still run through HTML [sanitization](/guides/sanitization/), which strips attributes outside the allowlist (e.g. `data-*`).
:::

## Passing a configured component (with its own props and slots)

To place a child component that has its **own props and slot content**, pass a configured-component object — `{ component, props, slots }` — instead of the bare reference:

```jsx
// Panel.stories.jsx
import Panel from './Panel.astro';
import Badge from './Badge.astro';

export const WithConfiguredComponent = {
  args: {
    title: 'Status',
    slots: {
      default: {
        component: Badge,
        props: { variant: 'success' },
        slots: { default: 'Shipped' },
      },
    },
  },
};
```

Only `component` is required; `props` and `slots` are optional. A configured component's `slots` are themselves slot values, so they can contain plain strings, more components, and further configured components — nesting to any depth.

### Mixing HTML and components in one slot

A slot value can be an **array**, letting you interleave plain HTML strings with (configured) components in a single slot. Each entry is rendered and concatenated in order:

```jsx
export const MixedContent = {
  args: {
    slots: {
      default: [
        '<p>Before the child</p>',
        { component: Badge, slots: { default: 'In the middle' } },
        '<p>After the child</p>',
      ],
    },
  },
};
```

:::caution
Astro component **tags written inside a string** (e.g. `default: '<Badge>hi</Badge>'`) are **not** compiled to components. A string is rendered as raw HTML, so `<Badge>` would be an inert custom element — and HTML [sanitization](/guides/sanitization/) discards unknown tags by default, leaving only their inner content. Astro has no runtime equivalent of JSX: to render a component, pass the imported reference (a configured component or a bare reference), never its tag name in a string.
:::

A configured component's `props` are passed to the child untouched — they are **not** HTML-sanitized (so values like `"A & B"` survive verbatim). Its `slots` are sanitized like any other string slot content.

An array entry's HTML string doesn't need to be a self-contained fragment — a wrapper tag's opening and closing halves can live in separate entries, with a component sandwiched between them:

```jsx
export const WrappedChild = {
  args: {
    slots: {
      default: [
        '<div class="Panel">',
        { component: Badge, slots: { default: 'Shipped' } },
        '</div>',
      ],
    },
  },
};
```

The array's string entries are sanitized together as one HTML document (not each entry on its own), so the `<div>` opened in the first entry stays open until the matching `</div>` in the last entry — the component renders nested inside it, not as a sibling after a self-closed wrapper.

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

- **Slot content is an HTML string, a component, or a list** — write raw HTML strings (not JSX or Astro template syntax), pass an imported Astro component (bare or configured with `{ component, props, slots }`), or an array mixing them. Component **tags inside a string are not compiled** — always pass the imported reference.
- **Multi-line content** — Use template literals (backtick strings) for readable multi-line slot content.
- **No slot fallback in stories** — If you don't provide a `slots` entry, the component's `<slot>` fallback content (if any) will render.
- **Static in builds** — Like other Astro component args, slot content is pre-rendered at build time. It's fully interactive in dev mode.

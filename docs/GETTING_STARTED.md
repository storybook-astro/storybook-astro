# Getting Started

Get up and running with Storybook Astro — the community-supported Storybook framework for Astro.

## Requirements

- **Node.js**: 20.16.0+, 22.19.0+, or 24.0.0+ (required for Storybook 10's ESM-only support)
- **Storybook**: 10.0.0+
- **Astro**: 5.5.3+ or 6.0.0-beta (see the [README](https://github.com/storybook-astro/storybook-astro#astro-6-beta-compatibility) for Astro 6 compatibility details)
- **Vite**: 6.0.0+ (7.x supported)

## Quick Start

Add Storybook to an existing Astro project:

### 1. Install packages

```bash
npm install -D storybook @storybook/builder-vite @storybook-astro/framework
```

To use non-Astro framework components (React, Vue, Svelte, etc.) in your stories, also install the corresponding Astro integrations and Storybook renderers:

```bash
# Example: adding React and Vue support
npm install --save-dev @astrojs/react @storybook/react @vitejs/plugin-react react react-dom
npm install --save-dev @astrojs/vue @storybook/vue3 @vitejs/plugin-vue vue
```

See the [Framework Integration](https://github.com/storybook-astro/storybook-astro#framework-integration) section in the README for the full list of supported frameworks and their required packages.

### 2. Create `.storybook/main.js`

```javascript
export default {
  stories: ['../src/**/*.stories.@(js|jsx|ts|tsx)'],
  framework: {
    name: '@storybook-astro/framework',
    options: {},
  },
};
```

To use non-Astro framework components (React, Vue, Svelte, etc.) inside your stories, add integrations:

```javascript
import { react, vue, svelte } from '@storybook-astro/framework/integrations';

export default {
  stories: ['../src/**/*.stories.@(js|jsx|ts|tsx)'],
  framework: {
    name: '@storybook-astro/framework',
    options: {
      integrations: [
        react({ include: ['**/react/**'] }),
        vue(),
        svelte(),
      ],
    },
  },
};
```

### 3. Create `.storybook/preview.js`

```javascript
const preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
};
export default preview;
```

### 4. Add scripts to `package.json`

```json
"scripts": {
  "storybook": "storybook dev -p 6006",
  "build-storybook": "storybook build"
}
```

### 5. Run Storybook

```bash
npm run storybook
```

> **Note:** `npm create storybook@latest` does not yet recognize Astro as a framework. Use the manual setup above instead.

## Writing Stories

Story files tell Storybook which component to render and what variations (stories) to show. Each story file exports a **default export** (metadata) and one or more **named exports** (individual stories).

### Basic Story Structure

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

### Passing Props

The `args` object maps directly to the component's `Astro.props`:

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

### Passing Complex Data

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

### Shared Default Args

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

### Controls and ArgTypes

Use `argTypes` to customize how Storybook's Controls panel renders each arg:

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

> **Note:** For Astro components in static builds (`storybook build`), changing args via Controls has no effect because Astro components are pre-rendered at build time. Controls work fully in dev mode (`storybook dev`) and for framework component stories (React, Vue, etc.).

### Story File Naming

By convention, place story files next to the component they document:

```
src/components/
  Card/
    Card.astro
    Card.stories.jsx    ← story file
    Card.test.ts        ← test file (optional)
```

Story files can use `.js`, `.jsx`, `.ts`, or `.tsx` extensions. JSX extensions (`.jsx`/`.tsx`) are recommended since they allow JSX syntax if needed.

## Handling Astro Slots

Astro components use [slots](https://docs.astro.build/en/basics/astro-components/#slots) for content projection. In Storybook, you pass slot content through a special `slots` property inside `args`.

### Default Slot

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

### Named Slots

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

### Combining Props and Slots

Props and slots are passed together in the same `args` object. Regular properties become `Astro.props`, and the `slots` property is handled separately by the renderer:

```astro
---
// ImageText.astro
const { imageSrc, imageAlt = 'Image', reversed = false } = Astro.props;
---

<div class:list={['image-text', { reversed }]}>
  <div class="image-container">
    <img src={imageSrc} alt={imageAlt} />
  </div>
  <div class="text-container">
    <slot />
  </div>
</div>
```

```jsx
// ImageText.stories.jsx
import ImageText from './ImageText.astro';
import myImage from '../../assets/hero.png';

export default {
  title: 'Components/ImageText',
  component: ImageText,
};

export const Default = {
  args: {
    imageSrc: myImage,
    imageAlt: 'Hero image',
    slots: {
      default: `
        <h2>Welcome</h2>
        <p>This is the text content beside the image.</p>
      `,
    },
  },
};

export const Reversed = {
  args: {
    imageSrc: myImage,
    imageAlt: 'Hero image',
    reversed: true,
    slots: {
      default: `
        <h2>Reversed Layout</h2>
        <p>The image appears on the right side.</p>
      `,
    },
  },
};
```

### Slot Content Tips

- **Slot content is HTML** — You write raw HTML strings, not JSX or Astro template syntax.
- **Multi-line content** — Use template literals (backtick strings) for readable multi-line slot content.
- **No slot fallback in stories** — If you don't provide a `slots` entry, the component's `<slot>` fallback content (if any) will render.
- **Static in builds** — Like other Astro component args, slot content is pre-rendered at build time. It's fully interactive in dev mode.

## Framework Component Stories

For non-Astro framework components (React, Vue, Svelte, etc.), stories work the same way as in standard Storybook — no special slot handling is needed. Framework components use their native props and children:

```jsx
// Counter.stories.js (React)
import Counter from './Counter.jsx';

export default {
  title: 'React/Counter',
  component: Counter,
};

export const Default = {};

export const StartAt10 = {
  args: {
    initialCount: 10,
  },
};
```

Framework component stories must set `parameters.renderer` to the appropriate Storybook renderer (e.g. `@storybook/react`, `@storybook/vue3`) if using multiple frameworks. See the [Framework Integration](https://github.com/storybook-astro/storybook-astro#framework-integration) section in the README for configuration details.

## Testing Stories

Stories can double as test cases using portable stories. See the [Testing and Portable Stories](https://github.com/storybook-astro/storybook-astro#testing-and-portable-stories) section in the README for details on `composeStories`, `testStoryRenders`, and `testStoryComposition`.

## Next Steps

- **[Live Demo](https://demo.storybook-astro.org)** — See Storybook Astro in action
- **[GitHub Repository](https://github.com/storybook-astro/storybook-astro)** — Source code, issues, and discussions
- **[Contributing Guide](https://github.com/storybook-astro/storybook-astro/blob/main/CONTRIBUTING.md)** — How to contribute
- **[README](https://github.com/storybook-astro/storybook-astro#readme)** — Full project documentation including architecture, known issues, and roadmap

---
title: Framework Components
description: Write stories for React, Vue, Svelte, and other framework components.
---

For non-Astro framework components (React, Vue, Svelte, etc.), stories work the same way as in standard Storybook — no special slot handling is needed. Framework components use their native props and children.

## Example: React component

```jsx
// Counter.stories.js
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

## Using shared components

You can also use framework components from the `@storybook-astro/components` shared library:

```jsx
// Using a shared React component
import Counter from '@storybook-astro/components/Counter/react/Counter.jsx';

export default {
  title: 'Shared/React Counter',
  component: Counter,
  parameters: {
    renderer: '@storybook/react',
  },
};

export const Default = {};
```

This approach allows you to maintain components in one place and use them across multiple projects. See [Shared Component Library](/guides/components/) for more details.

## Setting `parameters.renderer`

Framework component stories must set `parameters.renderer` to the appropriate Storybook renderer when using multiple frameworks:

```jsx
export default {
  title: 'React/MyComponent',
  component: MyComponent,
  parameters: {
    renderer: '@storybook/react',
  },
};
```

This tells the Storybook Astro renderer to delegate rendering to the specified framework renderer instead of routing through the Astro Container API.

## Configuring integrations

Framework integrations are configured in `.storybook/main.js`:

```javascript
import { react, vue, svelte, preact, solid, alpinejs } from '@storybook-astro/framework/integrations';

export default {
  framework: {
    name: '@storybook-astro/framework',
    options: {
      integrations: [
        react({ include: ['**/react/**'] }),
        vue(),
        svelte(),
        preact({ include: ['**/preact/**'] }),
        solid({ include: ['**/solid/**'] }),
        alpinejs({ entrypoint: './.storybook/alpine-entrypoint.js' }),
      ],
    },
  },
};
```

:::note
The `include` patterns use recursive globs (`**`) to match components in nested directories (e.g. `solid/Counter/Counter.tsx`). A non-recursive glob like `**/solid/*` would fail to match files in subdirectories, causing them to be compiled by the wrong framework plugin.
:::

## How framework delegation works

When a story specifies `parameters.renderer`, the Storybook Astro renderer delegates directly to the framework-specific `renderToCanvas` function — the Astro Container API is bypassed entirely. This means framework components behave exactly as they would in a native Storybook setup for that framework.

See [Framework Integration](/how-it-works/framework-integration/) for the full technical details.

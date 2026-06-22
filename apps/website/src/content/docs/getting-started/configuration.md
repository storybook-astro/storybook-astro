---
title: Configuration
description: Set up your Storybook configuration files for Astro.
---

After installing the packages, create the configuration files.

## 1. Create `.storybook/main.js`

The minimum configuration for Astro-only stories:

```javascript
export default {
  stories: ['../src/**/*.stories.@(js|jsx|ts|tsx)'],
  framework: {
    name: '@storybook-astro/framework',
    options: {},
  },
};
```

To use framework components (React, Vue, Svelte, etc.), add integrations:

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

Story slots are sanitized by default with conservative HTML defaults, so most projects need no extra setup. To adjust which args and slots are sanitized — or to turn it off — see the [Sanitization guide](/guides/sanitization/).

See the [Configuration Reference](/reference/configuration/) for all available options.

## 2. Create `.storybook/preview.js`

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

If your project uses global CSS, a CSS utility framework (UnoCSS, Tailwind CSS), or custom fonts, see the [Styling guide](/guides/styling/) for how to make them available in Storybook.

## 3. Add scripts to `package.json`

Astro projects already use `dev` and `build` for `astro dev` and `astro build`. Use separate script names for Storybook to avoid conflicts:

```json
"scripts": {
  "storybook": "storybook dev",
  "build-storybook": "storybook build"
}
```

## 4. Run Storybook

```bash
npm run storybook
```

Storybook will open at `http://localhost:6006` by default. You're ready to start [writing stories](/writing-stories/).

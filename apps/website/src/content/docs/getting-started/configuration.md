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

Sanitization is enabled by default. To disable it explicitly:

```javascript
export default {
  framework: {
    name: '@storybook-astro/framework',
    options: {
      sanitization: { enabled: false },
    },
  },
};
```

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

```json
"scripts": {
  "dev": "storybook dev -p 6006",
  "build": "storybook build"
}
```

## 4. Run Storybook

```bash
npm run dev
```

Storybook will open at [http://localhost:6006](http://localhost:6006). You're ready to start [writing stories](/writing-stories/).

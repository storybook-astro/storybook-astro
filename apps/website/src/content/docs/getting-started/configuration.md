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

## 3. Add scripts to `package.json`

```json
"scripts": {
  "storybook": "storybook dev -p 6006",
  "build-storybook": "storybook build"
}
```

## 4. Run Storybook

```bash
npm run storybook
```

Storybook will open at [http://localhost:6006](http://localhost:6006). You're ready to start [writing stories](/writing-stories/).

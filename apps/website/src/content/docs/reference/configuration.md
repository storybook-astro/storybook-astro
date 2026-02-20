---
title: Configuration Reference
description: Complete reference for Storybook Astro configuration options.
---

## `.storybook/main.js`

The main Storybook configuration file. Storybook Astro uses the standard Storybook configuration format with framework-specific options.

### Basic configuration

```javascript
export default {
  stories: ['../src/**/*.stories.@(js|jsx|ts|tsx)'],
  framework: {
    name: '@storybook-astro/framework',
    options: {},
  },
};
```

### Framework options

The `options` object accepts the following properties:

#### `integrations`

An array of framework integration instances. Each integration configures a UI framework (React, Vue, etc.) to work within Storybook alongside Astro components.

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

### Integration options

Each integration factory function accepts an options object:

#### `react(options?)`

- **`include`** — Glob pattern(s) for files to compile with React. Example: `['**/react/**']`

#### `vue(options?)`

No required options. All `.vue` files are compiled by default.

#### `svelte(options?)`

No required options. All `.svelte` files are compiled by default.

#### `preact(options?)`

- **`include`** — Glob pattern(s) for files to compile with Preact. Example: `['**/preact/**']`

#### `solid(options?)`

- **`include`** — Glob pattern(s) for files to compile with Solid. Example: `['**/solid/**']`

#### `alpinejs(options?)`

- **`entrypoint`** — Path to an Alpine.js entrypoint file that initializes Alpine and registers plugins/directives.

### `stories`

Standard Storybook `stories` glob pattern. Determines which files are loaded as stories.

```javascript
stories: ['../src/**/*.stories.@(js|jsx|ts|tsx)']
```

## `.storybook/preview.js`

The preview configuration file. Configures the Storybook UI for all stories.

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

### `parameters.renderer`

Set on individual stories or at the meta level to delegate rendering to a specific framework renderer instead of the Astro Container API:

```javascript
export default {
  component: MyReactComponent,
  parameters: {
    renderer: '@storybook/react',
  },
};
```

## `package.json` scripts

```json
{
  "scripts": {
    "storybook": "storybook dev -p 6006",
    "build-storybook": "storybook build"
  }
}
```

- **`storybook dev`** — Starts the development server with live rendering and HMR
- **`storybook build`** — Produces a static Storybook with pre-rendered Astro component stories

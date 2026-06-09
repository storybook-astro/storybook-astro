---
title: Styling
description: Set up global CSS, CSS frameworks, fonts, and static assets in Storybook.
---

Astro component scoped styles work automatically — Storybook Astro handles them during rendering. But global styles, CSS utility frameworks, and fonts loaded outside your components (e.g. in a layout's `<head>`) require manual setup.

## Global CSS

Most Astro projects have a global stylesheet imported in a layout file:

```astro
---
// src/layouts/Default.astro
import '../styles/global.css';
---
```

Storybook doesn't render your layout, so you need to import global styles in the Storybook preview. Create a `.storybook/preview.css` file:

```css
/* .storybook/preview.css */
@import '../src/styles/global.css';
```

Then import it in `.storybook/preview.js`:

```javascript
// .storybook/preview.js
import './preview.css';

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

### CSS custom properties and design tokens

Some projects define CSS custom properties (colors, font names, spacing scales) inside an Astro component rendered in the page `<head>` rather than in a plain CSS file:

```astro
---
// src/components/CustomStyles.astro
---
<style is:inline>
  :root {
    --color-primary: rgb(1 97 239);
    --font-sans: 'Inter Variable';
  }
</style>
```

Because Storybook never renders that component, the variables won't exist. Copy them into `.storybook/preview.css` so every story has access to them:

```css
/* .storybook/preview.css */
@import '../src/styles/global.css';

:root {
  --color-primary: rgb(1 97 239);
  --font-sans: 'Inter Variable';
}
```

## CSS utility frameworks

CSS frameworks like [UnoCSS](https://unocss.dev/) and [Tailwind CSS](https://tailwindcss.com/) are typically configured as Astro integrations, but their Vite plugins may not be automatically available in Storybook's build pipeline. You can add them directly using `viteFinal` in `.storybook/main.js`.

### UnoCSS

```javascript
// .storybook/main.js
import UnoCSS from 'unocss/vite';

export default {
  stories: ['../src/**/*.stories.@(js|jsx|ts|tsx)'],
  framework: {
    name: '@storybook-astro/framework',
    options: {},
  },
  async viteFinal(config) {
    config.plugins = config.plugins || [];
    config.plugins.push(UnoCSS());
    return config;
  },
};
```

Then import UnoCSS's generated stylesheet in `.storybook/preview.js`:

```javascript
import 'virtual:uno.css';
import './preview.css';
```

UnoCSS reads your project's `uno.config.ts` automatically, so your presets (e.g. `presetWind`, `presetIcons`, `presetTypography`) will apply.

### Tailwind CSS

For Tailwind CSS v4+ (which uses a Vite plugin), register the plugin in `viteFinal` and import your Tailwind CSS entry file in `preview.js`:

```javascript
// .storybook/main.js
import tailwindcss from '@tailwindcss/vite';

export default {
  stories: ['../src/**/*.stories.@(js|jsx|ts|tsx)'],
  framework: {
    name: '@storybook-astro/framework',
    options: {},
  },
  async viteFinal(config) {
    config.plugins = config.plugins || [];
    config.plugins.push(tailwindcss());
    return config;
  },
};
```

```javascript
// .storybook/preview.js
import '../src/styles/tailwind.css'; // your project's @import 'tailwindcss' entrypoint
import './preview.css';
```

For Tailwind CSS v3 (which uses PostCSS), no `viteFinal` changes are needed — just ensure your global CSS with `@tailwind` directives is imported in `.storybook/preview.css` and your `postcss.config.js` is in place.

## Path aliases

If your project uses Vite path aliases (e.g. `~` or `@` pointing to `src/`), those aliases are defined in `astro.config.*` and aren't automatically available in Storybook's Vite config. Mirror them in `viteFinal`:

```javascript
// .storybook/main.js
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default {
  stories: ['../src/**/*.stories.@(js|jsx|ts|tsx)'],
  framework: {
    name: '@storybook-astro/framework',
    options: {},
  },
  async viteFinal(config) {
    config.resolve = config.resolve ?? {};
    config.resolve.alias = config.resolve.alias ?? {};
    config.resolve.alias['~'] = path.resolve(__dirname, '../src');
    return config;
  },
};
```

Match whatever aliases you have in your `astro.config.*` — `@`, `~`, `#`, etc.

## Fonts

### npm font packages

If your project imports a font from an npm package (e.g. [Fontsource](https://fontsource.org/)) inside a layout component, move that import to `.storybook/preview.js`:

```javascript
// .storybook/preview.js
import '@fontsource-variable/inter';
import './preview.css';
```

The font files are bundled inside the npm package, so no static asset configuration is needed.

### Self-hosted fonts

For fonts served from your `public/` directory, add `@font-face` declarations to `.storybook/preview.css`:

```css
/* .storybook/preview.css */
@import '../src/styles/global.css';

@font-face {
  font-family: 'CustomFont';
  font-style: normal;
  font-display: swap;
  src: url('/fonts/custom-font.woff2') format('woff2');
}
```

:::tip
Match the `font-family` names and CSS selectors to what your Astro font setup generates, so components render with the correct fonts without changes.
:::

## Static assets

If your font files or other assets live in the `public/` directory, tell Storybook to serve them with `staticDirs`:

```javascript
// .storybook/main.js
export default {
  stories: ['../src/**/*.stories.@(js|jsx|ts|tsx)'],
  staticDirs: ['../public'],
  framework: {
    name: '@storybook-astro/framework',
    options: {},
  },
};
```

This makes files in `public/` available at the root URL path — e.g. `public/fonts/outfit.ttf` is served at `/fonts/outfit.ttf`, matching how Astro serves them.

## Full example

Here's a complete setup for a project using Tailwind CSS v4, a path alias, an npm font package, and CSS custom properties:

```javascript
// .storybook/main.js
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default {
  stories: ['../src/**/*.stories.@(js|jsx|ts|tsx)'],
  framework: {
    name: '@storybook-astro/framework',
    options: {},
  },
  async viteFinal(config) {
    config.plugins = config.plugins ?? [];
    config.plugins.push(tailwindcss());

    config.resolve = config.resolve ?? {};
    config.resolve.alias = config.resolve.alias ?? {};
    config.resolve.alias['~'] = path.resolve(__dirname, '../src');

    return config;
  },
};
```

```javascript
// .storybook/preview.js
import '@fontsource-variable/inter';
import '../src/assets/styles/tailwind.css';
import './preview.css';

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

```css
/* .storybook/preview.css */
:root {
  --color-primary: rgb(1 97 239);
  --color-secondary: rgb(1 84 207);
  --font-sans: 'Inter Variable';
}
```

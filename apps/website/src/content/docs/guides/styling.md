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

For Tailwind CSS v4+ (which uses a Vite plugin):

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

For Tailwind CSS v3 (which uses PostCSS), no `viteFinal` changes are needed — just ensure your global CSS with `@tailwind` directives is imported in `.storybook/preview.css` and your `postcss.config.js` is in place.

## Fonts

Fonts loaded via Astro components (e.g. in `<head>` through a layout) won't be available in stories because Storybook renders components in isolation, without your page layout.

Add `@font-face` declarations directly in `.storybook/preview.css`:

```css
/* .storybook/preview.css */
@import '../src/styles/global.css';

@font-face {
  font-family: 'CustomFont';
  font-style: normal;
  font-display: swap;
  src: url('/fonts/custom-font.woff2') format('woff2');
}

.custom-font {
  font-family: 'CustomFont', sans-serif;
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

Here's a complete setup for a project using UnoCSS with local fonts:

```javascript
// .storybook/main.js
import UnoCSS from 'unocss/vite';

export default {
  stories: ['../src/**/*.stories.@(js|jsx|ts|tsx)'],
  staticDirs: ['../public'],
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

```javascript
// .storybook/preview.js
import 'virtual:uno.css';
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
@import '../src/styles/global.css';

@font-face {
  font-family: 'Poppins';
  font-style: normal;
  font-display: swap;
  src: url('/fonts/poppins.ttf') format('truetype');
}

.poppins { font-family: 'Poppins', sans-serif; }
```

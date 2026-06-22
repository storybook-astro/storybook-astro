---
title: Styling
description: Set up global CSS, CSS frameworks, fonts, and static assets in Storybook.
---

Astro component scoped styles work automatically — Storybook Astro handles them during rendering. Anything declared in your `astro.config.*` (integrations, `vite.plugins`, `fonts`) is also picked up automatically, so most projects need very little Storybook-specific wiring. The patterns below cover the cases that do need attention: global stylesheets and design tokens that live outside `astro.config.*`, path aliases, fonts loaded outside the Font Provider API, and static assets.

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

CSS frameworks like [Tailwind CSS](https://tailwindcss.com/) and [UnoCSS](https://unocss.dev/) configured in `astro.config.*` — either as an Astro integration (`@astrojs/tailwind`, `unocss/astro`) or as a Vite plugin under `vite.plugins` (`@tailwindcss/vite`, `unocss/vite`) — are picked up by Storybook automatically. You only need to import the framework's CSS entry or virtual module in `.storybook/preview.js` so it reaches the story canvas.

### Tailwind CSS

```javascript
// .storybook/preview.js
import '../src/styles/tailwind.css'; // your project's @import 'tailwindcss' entrypoint
import './preview.css';
```

For Tailwind CSS v3 (which uses PostCSS), no plugin registration is needed at all — just ensure your global CSS with `@tailwind` directives is imported in `.storybook/preview.css` and your `postcss.config.js` is in place.

If you want Tailwind enabled in Storybook *only* (not in your main Astro app), register the plugin yourself with `viteFinal`:

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
    config.plugins = config.plugins ?? [];
    config.plugins.push(tailwindcss());
    return config;
  },
};
```

### UnoCSS

```javascript
// .storybook/preview.js
import 'virtual:uno.css';
import './preview.css';
```

UnoCSS reads your project's `uno.config.ts` automatically, so your presets (e.g. `presetWind`, `presetIcons`, `presetTypography`) will apply.

The same Storybook-only `viteFinal` pattern shown for Tailwind works for UnoCSS — register `unocss/vite` if it isn't already in `astro.config.*`.

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

### Astro Font Provider API

If your project uses Astro 6's [Font Provider API](https://docs.astro.build/en/reference/font-provider-reference/) — `fonts: [...]` in `astro.config.*` with providers like `fontProviders.google()`, `fontProviders.local()`, etc. — Storybook auto-loads the array and the `<Font>` component renders real `@font-face` CSS in stories with no extra wiring.

```javascript
// astro.config.mjs
import { defineConfig, fontProviders } from 'astro/config';

export default defineConfig({
  fonts: [
    {
      provider: fontProviders.google(),
      name: 'Inter',
      cssVariable: '--font-inter',
      weights: [400, 700],
    },
  ],
});
```

Use `<Font cssVariable="--font-inter" />` in your Astro components exactly as you would in a normal Astro page. The provider's `init` and `resolveFont` hooks run during Storybook's SSR setup, producing `@font-face` rules and a `:root { --font-inter: "Inter", sans-serif; }` binding.

To override the auto-loaded array (e.g. use a different set of families in Storybook), pass `framework.options.fonts` explicitly. An explicit empty array renders with no fonts at all:

```javascript
// .storybook/main.js
framework: {
  name: '@storybook-astro/framework',
  options: {
    fonts: [/* override here, or [] for none */],
  },
}
```

:::caution
Stories rely on the provider's remote URLs (e.g. `fonts.gstatic.com`) at runtime — an offline Storybook will fall through to fallback families. Build-time font file emission, preload `<link>` tags, and Capsize-optimized fallback metrics are not generated.
:::

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

A typical project — Tailwind v4 and `fonts:` configured in `astro.config.*`, plus a path alias and CSS custom properties — needs very little in `.storybook/main.js`:

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

Tailwind and the font families are picked up from `astro.config.*` automatically. Only the path alias and the preview imports need explicit wiring:

```javascript
// .storybook/preview.js
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

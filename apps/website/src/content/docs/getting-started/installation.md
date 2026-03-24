---
title: Installation
description: Install Storybook Astro in your project.
---

Add Storybook to an existing Astro project.

## Install core packages

```bash
npm install -D storybook @storybook/builder-vite @storybook-astro/framework
```

## Optional: framework integration packages

To use non-Astro framework components (React, Vue, Svelte, etc.) in your stories, also install the corresponding Astro integrations and Storybook renderers:

```bash
# React
npm install --save-dev @astrojs/react @storybook/react @vitejs/plugin-react react react-dom

# Vue
npm install --save-dev @astrojs/vue @storybook/vue3 @vitejs/plugin-vue vue

# Svelte
npm install --save-dev @astrojs/svelte @storybook/svelte @sveltejs/vite-plugin-svelte svelte

# Preact
npm install --save-dev @astrojs/preact @storybook/preact @preact/preset-vite preact

# Solid
npm install --save-dev @astrojs/solid-js @storybook/html vite-plugin-solid solid-js

# Alpine.js
npm install --save-dev @astrojs/alpinejs @storybook/html alpinejs
```

See the [Framework Components](/writing-stories/framework-components/) page for how to configure and use these in stories.

Next, proceed to [Configuration](/getting-started/configuration/) to set up your Storybook config files.

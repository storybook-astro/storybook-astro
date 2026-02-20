---
title: Feature Support
description: Astro framework features and their compatibility with Storybook Astro.
---

This page tracks Astro's built-in framework features and their compatibility status with Storybook Astro.

## Supported

- **Component Rendering** — Core Astro component rendering via Container API
- **Props & Slots** — Passing data and content to components
- **Scoped Styles** — Component-scoped CSS (including Astro 6's style sub-module imports)
- **Multiple Framework Support** — React, Vue, Svelte, Preact, Solid, and Alpine.js
- **Client Directives** — `client:load`, `client:only`, etc. for framework components
- **Static Builds** — `storybook build` with build-time pre-rendering of Astro component stories

## Partial support

- **`astro:assets` (Image Optimization)** — Works in components but requires a fallback approach for Storybook stories due to module resolution issues. Components can accept both `ImageMetadata` and string URLs to maintain compatibility. See [Images](/guides/images/).
- **Astro Fonts** — Font virtual modules are stubbed with no-op exports. Components render correctly but without Astro's font optimization.

## Not yet supported

- **View Transitions** — Astro's built-in View Transitions API (`<ViewTransitions />`)
- **Content Collections** — `astro:content` module for type-safe content management
- **Middleware** — Astro's middleware system for request/response handling
- **API Routes** — Server endpoints (`/pages/api/*` routes)
- **Server Islands** — Dynamic content islands with server-side rendering
- **Actions** — Type-safe backend functions callable from frontend (`astro:actions`)
- **Environment Variables** — `astro:env` module for managing environment variables
- **Glob Imports** — `Astro.glob()` for batch file imports
- **Database Integration** — Astro DB and database utilities
- **Internationalization (i18n)** — Built-in i18n routing and helpers
- **Prefetch** — Automatic page prefetching utilities
- **Dev Toolbar** — Development toolbar integrations
- **Markdown/MDX Features** — Advanced markdown processing features beyond basic rendering

## Future considerations

- **Dynamic Astro Controls in Static Builds** — Currently, Astro component stories are pre-rendered at build time. A future enhancement could add a companion server or service worker to enable live re-rendering with different args.
- **Adapters** — Integration with Astro's deployment adapters (Netlify, Vercel, etc.)
- **Error Handling** — Better error boundaries and recovery mechanisms
- **Performance Optimizations** — Caching strategies and render optimization for large component libraries

## Contributing

If you're interested in helping add support for any of these features, check the [GitHub issues](https://github.com/storybook-astro/storybook-astro/issues) for ongoing discussions.

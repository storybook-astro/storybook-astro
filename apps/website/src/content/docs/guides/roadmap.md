---
title: Roadmap
description: Planned features and improvements for Storybook Astro, categorized by priority and implementation phase.
---

This document outlines the planned features and improvements for Storybook Astro. Items are categorized by priority and implementation phase.

## High Priority

### Support Astro Components as Props

Enable composing Astro components by passing them as props to other Astro components in stories. This allows patterns like wrapping a Button inside a Link, or passing Icon components to other components.

**Phase 1 — Template nesting and image rendering**: Shipped. Components whose templates use other Astro components (transitively) render correctly, including those that use `<Image>` from `astro:assets`. No story-side changes are required.

**Phase 2 — Props-based nesting**: In Design. Passing an Astro component factory as a story arg (e.g. `<Link Icon={MyIcon} />`) is not yet supported. See the [nested component support design](https://github.com/storybook-astro/storybook-astro/blob/develop/docs/NESTED_COMPONENT_SUPPORT.md) for the proposed implementation strategy.

**Scope**: Medium-High complexity (Phase 2)

**What Phase 2 enables**:
- Passing Astro components as props in story args
- Support in portable stories (testing API)

### Astro 6 Font Provider API Integration

Shipped in 1.4.0. Pass the same `fonts` array from `astro.config.*` as `framework.options.fonts` in `.storybook/main.js` and the `<Font>` component renders real `@font-face` CSS in dev and static builds. See the [Styling guide](/guides/styling/#astro-font-provider-api) for setup.

**Still to do**:
- Preload `<link>` tag emission
- Capsize-optimized fallback metrics
- Build-time font file emission to the static output (current builds rely on the remote URLs returned by the provider)
- Wire fonts through the server-build pipeline (only the static prerender path is plumbed today)

### Auto-detect CSS Frameworks from Astro Config

Automatically detect and configure CSS utility frameworks (UnoCSS, Tailwind CSS, etc.) registered as Astro integrations, so their Vite plugins are available in Storybook without manual `viteFinal` configuration.

**Partially shipped (1.4.0)**: Integrations declared in `astro.config.*` — including CSS-framework integrations like `unocss/astro` and `@astrojs/tailwind` — are now auto-loaded into both the Storybook Vite server and the internal Astro SSR server. Their Vite plugins are registered automatically; users no longer need to duplicate those integrations in `.storybook/main.js`.

**Still to do**:
- CSS frameworks added as raw Vite plugins rather than Astro integrations (e.g. `@tailwindcss/vite`, `unocss/vite`) still require manual `viteFinal` setup
- Virtual module preview imports (e.g. `import 'virtual:uno.css'`) still must be added to `.storybook/preview.js` by hand

### Decorator Support

Enable Storybook's standard [decorator](https://storybook.js.org/docs/writing-stories/decorators) API for both Astro component stories and framework component stories (React, Vue, etc.).

**Status**: Planned
**Complexity**: Medium
**Tracking**: [Issue #40 — Unable to use decorators](https://github.com/storybook-astro/storybook-astro/issues/40)
**Details**: See the [decorator support design](https://github.com/storybook-astro/storybook-astro/blob/develop/docs/DECORATOR_SUPPORT.md) for full analysis and implementation strategy.

**What this enables**:
- Global decorators in `.storybook/preview.js` (layout wrappers, theme providers)
- Component-level and story-level decorators
- HTML string decorators for Astro component stories
- Framework-native decorators (JSX, etc.) for React/Vue/Svelte component stories

## Medium Priority

### Enhanced Testing & Portable Stories

Expand testing capabilities for Astro components tested in isolation, including better support for Container API integration and DOM testing patterns.

**Status**: In Discussion  
**Complexity**: Medium  
**Details**: The community has shared best practices for testing Astro components using the Container API with DOM libraries (jsdom/happy-dom). Storybook Astro can improve this experience by providing tested patterns and utilities.

**Already shipped**:
- `setProjectAnnotations`, `composeStory`, and `composeStories` are generic over renderer type for stronger TypeScript inference (1.2.0)
- `defineStoryRules` supports factory functions for dynamic mock values (1.3.0)

**Still to do**:
- Test helper utilities for common testing patterns
- Documentation with examples for testing composed components
- Integration with testing libraries (Testing Library, Vitest patterns)
- Guidance on testing both server-rendered and client-side behavior

## Future Enhancements

### Dynamic Astro Controls in Static Builds

Currently, Astro component stories are pre-rendered with their default args at build time, making the Storybook Controls panel non-functional for Astro components in static deployments. As of 1.2.0, the Controls panel is automatically disabled for Astro stories in static builds so users aren't left adjusting controls that have no effect. A future enhancement could enable live re-rendering with different args via a companion service.

**Potential approaches**:
- Embed a lightweight server within the static build for on-demand rendering
- Use a service worker to intercept render requests
- Provide a deployment adapter for serverless platforms

### Content Collections Support

Enable the `astro:content` module for type-safe content management within stories, allowing components that depend on content collections to be documented and tested in Storybook.

### View Transitions

Support Astro's View Transitions API (`<ViewTransitions />` component) in the Storybook preview, enabling developers to document and preview transition effects.

### API Routes & Server Islands

Support for server-side endpoints and dynamic server islands would enable testing components that depend on backend data fetching within Storybook.

### Middleware & Environment Variables

Integration with Astro's middleware system and `astro:env` module for managing environment variables within stories.

### Internationalization (i18n)

Support for Astro's built-in i18n routing and helpers, enabling documentation of multi-language components.

## Known Limitations

- **Astro components in static builds** are pre-rendered with default args — the Controls panel is automatically disabled for these stories in static builds (framework components remain fully interactive)
- **Client-side behavior** of Astro components requires end-to-end tests (Playwright, Cypress) as the Container API doesn't execute script tags
- **Circular component references** are not yet detected or prevented when passing components as props
- **Module hot-reloading** with nested component references may require manual refresh in some cases

## Contributing

Interested in working on any of these roadmap items? Check the [GitHub issues](https://github.com/storybook-astro/storybook-astro) for ongoing discussions and collaboration opportunities, or see the `AGENTS.md` file in the repository for development guidance.

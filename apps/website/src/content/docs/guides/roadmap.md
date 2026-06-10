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

Shipped. The `<Font>` component renders real `@font-face` CSS in dev and static builds, driven by the `fonts:` array in your `astro.config.*` (auto-loaded — no mirror into `.storybook/main.js` required). See the [Styling guide](/guides/styling/#astro-font-provider-api).

**Still to do**:
- Preload `<link>` tag emission
- Capsize-optimized fallback metrics
- Build-time font file emission to the static output (current builds rely on the remote URLs returned by the provider)
- Wire fonts through the server-build pipeline (only the static prerender path is plumbed today)

### Auto-load Astro Config into Storybook

Shipped. Anything declared in `astro.config.*` is picked up by Storybook automatically: `integrations:` (e.g. `astro-icon`, `unocss/astro`, `@astrojs/tailwind`), top-level `fonts:`, and `vite.plugins:` (e.g. `@tailwindcss/vite`, `unocss/vite`). Users no longer need to duplicate any of these into `.storybook/main.js`.

**Intentionally out of scope**:
- Virtual module preview imports (e.g. `import 'virtual:uno.css'`) — Storybook can't know which ones your preview should pull in, so these stay in `.storybook/preview.js` by hand.

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

### Code Panel Source for Astro Components

The Storybook Docs "Show code" / Code Panel currently falls back to displaying the raw story file source because the framework doesn't implement a `sourceDecorator`. The panel should show the Astro template syntax for the component being rendered with the story's args (e.g. `<HeroHijri imageUrl="..." />`).

**Status**: Planned  
**Complexity**: Medium  
**Tracking**: [Issue #106 — Code Panel shows story source instead of component usage](https://github.com/storybook-astro/storybook-astro/issues/106)

**What this requires**:
- A `sourceDecorator` registered via `entry-preview.ts` that intercepts story renders and records the component + args
- An Astro template serializer that maps `{ component, args }` to a `.astro` template string, including decisions about bare string attributes vs. `{expression}` bindings and slot handling
- Parity with how `@storybook/react`, `@storybook/vue3`, and similar packages implement dynamic source for their template syntaxes

**Workaround**: Set `parameters.docs.source.code` manually on any story where you want a specific snippet shown.

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

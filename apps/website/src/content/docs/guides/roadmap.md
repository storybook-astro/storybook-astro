---
title: Roadmap
description: Planned features and improvements for Storybook Astro, categorized by priority and implementation phase.
---

This document outlines the planned features and improvements for Storybook Astro. Items are categorized by priority and implementation phase.

## High Priority

### Support Astro Components as Props

Enable composing Astro components by passing them as props to other Astro components in stories. This allows patterns like wrapping a Button inside a Link, or passing Icon components to other components.

**Status**: In Design  
**Scope**: Medium-High complexity  
**Details**: See the [nested component support design](https://github.com/storybook-astro/storybook-astro/blob/develop/docs/NESTED_COMPONENT_SUPPORT.md) for full design and implementation strategy.

**What this enables**:
- Passing Astro components as props in story args
- Rendering nested Astro compositions correctly in both dev and static builds
- Support in portable stories (testing API)

### Improve Astro 6 Font Provider API Integration

Provide first-class support for Astro 6's new Font Provider API, allowing developers to use Astro's built-in font system seamlessly within Storybook stories.

**Status**: Planned  
**Complexity**: Medium  
**Details**: Astro 6 introduced a unified [Font Provider API](https://docs.astro.build/en/reference/font-provider-reference/) that supports multiple font providers (Google, Adobe, Bunny, local, and custom providers). Currently, Storybook Astro stubs Astro's font virtual modules with no-op exports.

**Improvements needed**:
- Properly resolve and initialize font providers in Storybook's dev server
- Include font definitions from `astro.config.ts` in story rendering
- Ensure font files are emitted correctly during `storybook build`
- Support both remote and local font providers

## Medium Priority

### Enhanced Testing & Portable Stories

Expand testing capabilities for Astro components tested in isolation, including better support for Container API integration and DOM testing patterns.

**Status**: In Discussion  
**Complexity**: Medium  
**Details**: The community has shared best practices for testing Astro components using the Container API with DOM libraries (jsdom/happy-dom). Storybook Astro can improve this experience by providing tested patterns and utilities.

**Potential additions**:
- Test helper utilities for common testing patterns
- Documentation with examples for testing composed components
- Integration with testing libraries (Testing Library, Vitest patterns)
- Guidance on testing both server-rendered and client-side behavior

## Future Enhancements

### Dynamic Astro Controls in Static Builds

Currently, Astro component stories are pre-rendered with their default args at build time, making the Storybook Controls panel non-functional for Astro components in static deployments. A future enhancement could enable live re-rendering with different args via a companion service.

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

- **Astro components in static builds** are pre-rendered with default args — Controls modifications have no effect (framework components remain fully interactive)
- **Client-side behavior** of Astro components requires end-to-end tests (Playwright, Cypress) as the Container API doesn't execute script tags
- **Circular component references** are not yet detected or prevented when passing components as props
- **Module hot-reloading** with nested component references may require manual refresh in some cases

## Contributing

Interested in working on any of these roadmap items? Check the [GitHub issues](https://github.com/storybook-astro/storybook-astro) for ongoing discussions and collaboration opportunities, or see the `AGENTS.md` file in the repository for development guidance.

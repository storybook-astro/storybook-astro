---
title: Roadmap
description: Planned features and improvements for Storybook Astro, categorized by priority and implementation phase.
---

This document outlines the planned features and improvements for Storybook Astro. Items are categorized by priority and implementation phase.

## High Priority

### Support Astro Components as Props — **In Planning**

Enable composing Astro components by passing them as props to other Astro components in stories. This allows patterns like wrapping a Button inside a Link, or passing Icon components to other components.

**Current Status**: Phase 1 complete (template nesting), Phase 2 in design (props-based nesting)

**Phase 2 — Props-based nesting**: Passing an Astro component factory as a story arg (e.g. `<Link Icon={MyIcon} />`) is not yet supported. See the [nested component support design](https://github.com/storybook-astro/storybook-astro/blob/develop/docs/NESTED_COMPONENT_SUPPORT.md) for the proposed implementation strategy.

**Complexity**: Medium-High (Phase 2)

**What Phase 2 will enable**:
- Passing Astro components as props in story args
- Support in portable stories (testing API)

### Decorator Support — **To Do**

Enable Storybook's standard [decorator](https://storybook.js.org/docs/writing-stories/decorators) API for both Astro component stories and framework component stories (React, Vue, etc.).

**Complexity**: Medium
**Tracking**: [Issue #40 — Unable to use decorators](https://github.com/storybook-astro/storybook-astro/issues/40)
**Details**: See the [decorator support design](https://github.com/storybook-astro/storybook-astro/blob/develop/docs/DECORATOR_SUPPORT.md) for full analysis and implementation strategy.

**What this enables**:
- Global decorators in `.storybook/preview.js` (layout wrappers, theme providers)
- Component-level and story-level decorators
- HTML string decorators for Astro component stories
- Framework-native decorators (JSX, etc.) for React/Vue/Svelte component stories

## Medium Priority

### Enhanced Testing & Portable Stories — **Partially Complete**

Expand testing capabilities for Astro components tested in isolation, including better support for Container API integration and DOM testing patterns.

**Current Status**: Core APIs shipped, additional utilities and documentation in progress

**Complexity**: Medium

**Still to do**:
- Test helper utilities for common testing patterns
- Documentation with examples for testing composed components
- Integration with testing libraries (Testing Library, Vitest patterns)
- Guidance on testing both server-rendered and client-side behavior

### Code Panel Source for Astro Components — **To Do**

The Storybook Docs "Show code" / Code Panel currently falls back to displaying the raw story file source because the framework doesn't implement a `sourceDecorator`. The panel should show the Astro template syntax for the component being rendered with the story's args (e.g. `<HeroHijri imageUrl="..." />`).

**Complexity**: Medium
**Tracking**: [Issue #106 — Code Panel shows story source instead of component usage](https://github.com/storybook-astro/storybook-astro/issues/106)

**What this requires**:
- A `sourceDecorator` registered via `entry-preview.ts` that intercepts story renders and records the component + args
- An Astro template serializer that maps `{ component, args }` to a `.astro` template string, including decisions about bare string attributes vs. `{expression}` bindings and slot handling
- Parity with how `@storybook/react`, `@storybook/vue3`, and similar packages implement dynamic source for their template syntaxes

**Workaround**: Set `parameters.docs.source.code` manually on any story where you want a specific snippet shown.

### Automatic Documentation Extraction from JSDoc — **To Do**

Enable automatic extraction of component descriptions and prop documentation from JSDoc comments in Astro components, similar to how React/Vue frameworks extract documentation via docgen tools.

**Complexity**: Medium-High
**Tracking**: [Issue #110 — Storybook Astro is unable to parse documentation from the component's JSDocs](https://github.com/storybook-astro/storybook-astro/issues/110)

**Current behavior**: Users must manually duplicate all documentation in story files via `argTypes` and `parameters.docs.description.component`.

**What this requires**:
- Parser for Astro component frontmatter to extract TypeScript `Props` interface and JSDoc comments
- Implementation of `docs.extractArgTypes` and `docs.extractComponentDescription` functions in the framework preset
- Integration with TypeScript Compiler API (similar to `react-docgen-typescript`) to read type information and JSDoc tags from `.astro` files
- Handling Astro-specific syntax where the `Props` interface is embedded in frontmatter rather than standalone `.ts` files

**What this enables**:
- Automatic component descriptions from top-level JSDoc comments
- Automatic prop documentation in the properties table from interface JSDoc
- Reduced boilerplate in story files
- Consistency with how other Storybook frameworks handle documentation

**Workaround**: Manually define `argTypes` and descriptions in story files as shown in the integration examples.

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

## Recently Completed

### Auto-load Astro Config into Storybook

**Shipped in**: 1.4.0

Anything declared in `astro.config.*` is picked up by Storybook automatically: `integrations:` (e.g. `astro-icon`, `unocss/astro`, `@astrojs/tailwind`), top-level `fonts:`, and `vite.plugins:` (e.g. `@tailwindcss/vite`, `unocss/vite`). Users no longer need to duplicate any of these into `.storybook/main.js`.

**Documentation**: See [Configuration guide](/getting-started/configuration/)

**Intentionally out of scope**:
- Virtual module preview imports (e.g. `import 'virtual:uno.css'`) — Storybook can't know which ones your preview should pull in, so these stay in `.storybook/preview.js` by hand.

### Astro 6 Font Provider API Integration

**Shipped in**: 1.4.0

The `<Font>` component renders real `@font-face` CSS in dev and static builds, driven by the `fonts:` array in your `astro.config.*` (auto-loaded — no mirror into `.storybook/main.js` required).

**Documentation**: See [Styling guide](/guides/styling/#astro-font-provider-api)

**Remaining work** (moved to Future Enhancements):
- Preload `<link>` tag emission
- Capsize-optimized fallback metrics
- Build-time font file emission to the static output (current builds rely on the remote URLs returned by the provider)
- Wire fonts through the server-build pipeline (only the static prerender path is plumbed today)

### Support Astro Components as Props (Phase 1)

**Shipped in**: 1.3.0

Components whose templates use other Astro components (transitively) render correctly, including those that use `<Image>` from `astro:assets`. No story-side changes are required.

**Next phase**: Props-based nesting (Phase 2) — see High Priority section above

### Portable Stories Core APIs

**Shipped in**: 1.2.0–1.3.0

- `setProjectAnnotations`, `composeStory`, and `composeStories` are generic over renderer type for stronger TypeScript inference (1.2.0)
- `defineStoryRules` supports factory functions for dynamic mock values (1.3.0)
- `renderStory` helper for testing Astro components via SSR in tests

**Documentation**: See [Testing Stories guide](/guides/testing/)

**Next phase**: Enhanced testing utilities and patterns — see Medium Priority section above

## Known Limitations

- **Astro components in static builds** are pre-rendered with default args — the Controls panel is automatically disabled for these stories in static builds (framework components remain fully interactive)
- **Client-side behavior** of Astro components requires end-to-end tests (Playwright, Cypress) as the Container API doesn't execute script tags
- **Circular component references** are not yet detected or prevented when passing components as props
- **Module hot-reloading** with nested component references may require manual refresh in some cases

## Feature Support

### Astro Features

This table tracks compatibility of Astro's built-in framework features with Storybook Astro.

| Feature | Status | Description |
|---------|--------|-------------|
| Component Rendering | ✅ Supported | Core Astro component rendering in Storybook |
| Props & Slots | ✅ Supported | Passing data and content to components |
| Scoped Styles | ✅ Supported | Component-scoped CSS (including Astro 6's style sub-module imports) |
| UI Framework Components | ✅ Supported | Astro components and client-side UI components render together (React, Vue, Svelte, Preact, Solid, Alpine.js) |
| Client Directives | ✅ Supported | `client:load`, `client:only`, etc. for framework components |
| Static Builds | ✅ Supported | `storybook build` with build-time pre-rendering of Astro component stories |
| `astro:assets` (Image) | ✅ Supported | Components using `<Image>` render correctly. Import image assets as `ImageMetadata` and pass as props. [See Images guide](/guides/images/) |
| Font Provider API | 🚧 Partial | `<Font>` component renders with provider-resolved URLs (Google, Bunny, Fontsource, local). Missing: preload links, Capsize fallback metrics, font file emission, server-build pipeline. [See Styling guide](/guides/styling/#astro-font-provider-api) |
| Nested Components (Template) | ✅ Supported | Components using other Astro components in templates render correctly |
| Nested Components (Props) | 📋 Planned | Passing Astro component factories as props (e.g. `<Link Icon={MyIcon} />`). See roadmap item above |
| View Transitions | ❌ Not Supported | Astro's View Transitions API (`<ViewTransitions />`) |
| Content Collections | ❌ Not Supported | `astro:content` module for type-safe content management |
| Middleware | ❌ Not Supported | Astro's middleware system for request/response handling |
| API Routes | ❌ Not Supported | Server endpoints (`/pages/api/*` routes) |
| Server Islands | ❌ Not Supported | Dynamic content islands with server-side rendering |
| Actions | ❌ Not Supported | Type-safe backend functions (`astro:actions`) |
| Environment Variables | ❌ Not Supported | `astro:env` module for managing environment variables |
| Glob Imports | ❌ Not Supported | `Astro.glob()` for batch file imports |
| Database Integration | ❌ Not Supported | Astro DB and database utilities |
| Internationalization (i18n) | ❌ Not Supported | Built-in i18n routing and helpers |
| Prefetch | ❌ Not Supported | Automatic page prefetching utilities |
| Dev Toolbar | ❌ Not Supported | Development toolbar integrations |
| Markdown/MDX Features | ❌ Not Supported | Advanced markdown processing beyond basic rendering |
| Adapters | 🔮 Future | Integration with deployment adapters (Netlify, Vercel, etc.) |

**Legend**: ✅ Supported | 🚧 Partial | 📋 Planned | ❌ Not Supported | 🔮 Future Consideration

### Storybook Features

This table tracks compatibility of Storybook's built-in features when used with Astro components.

| Feature | Status | Description |
|---------|--------|-------------|
| Stories (CSF) | ✅ Supported | Component Story Format for defining stories |
| Args & Controls | ✅ Supported | Interactive controls for component props (dev only for Astro components; pre-rendered in static builds) |
| Actions | ✅ Supported | Log user interactions and events |
| Docs (Autodocs) | ✅ Supported | Automatic documentation pages for components |
| Docs (MDX) | ✅ Supported | Custom documentation pages with MDX |
| Docs Blocks | ✅ Supported | Pre-built documentation components (Description, Primary, Controls, Stories, etc.) |
| Viewports | ✅ Supported | Responsive design testing with different viewport sizes |
| Backgrounds | ✅ Supported | Test components against different background colors |
| Measure & Outline | ✅ Supported | Visual debugging tools for spacing and layout |
| Component Description | 🚧 Manual | Component descriptions must be set manually via `parameters.docs.description.component` (automatic extraction from JSDoc planned) |
| ArgTypes Documentation | 🚧 Manual | Prop documentation must be set manually via `argTypes[].description` (automatic extraction from JSDoc planned) |
| Source Code Display | 🚧 Partial | Shows story file source; doesn't generate component usage syntax (e.g. `<Component prop="value" />`). See roadmap item above |
| Decorators | 📋 Planned | Wrapper components/HTML for stories. See roadmap item and [design doc](https://github.com/storybook-astro/storybook-astro/blob/develop/docs/DECORATOR_SUPPORT.md) |
| Portable Stories | ✅ Supported | `composeStories`, `composeStory`, `setProjectAnnotations` for testing |
| Testing with Vitest | ✅ Supported | Test stories with `@storybook-astro/framework/testing` and Vitest |
| Play Functions | ✅ Supported | Automated interaction testing (framework components only; Astro components are server-rendered HTML) |
| Interactions Panel | ✅ Supported | Debug play function interactions |
| Accessibility Addon | ✅ Supported | Automated accessibility testing with a11y addon |
| Theming | ✅ Supported | Storybook UI theming and customization |
| Multi-framework | ✅ Supported | Mix Astro and framework components (React, Vue, Svelte, etc.) in one Storybook |
| TypeScript | ✅ Supported | Full TypeScript support for stories and configuration |
| Hot Module Replacement | ✅ Supported | Live updates during development |
| Static Build | ✅ Supported | Build static documentation site with `storybook build` |

**Legend**: ✅ Supported | 🚧 Partial/Manual | 📋 Planned | ❌ Not Supported

## Contributing

Interested in working on any of these roadmap items? Check the [GitHub issues](https://github.com/storybook-astro/storybook-astro) for ongoing discussions and collaboration opportunities, or see the `AGENTS.md` file in the repository for development guidance.

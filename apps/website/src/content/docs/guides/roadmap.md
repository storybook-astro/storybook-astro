---
title: Roadmap
description: Planned features and improvements for Storybook Astro, categorized by priority and implementation phase.
---

This document outlines the planned features and improvements for Storybook Astro. Items are categorized by priority and implementation phase.

## Medium Priority

### Project Scaffold CLI

📋 **To Do**

A `create-storybook-astro` CLI that generates a new Astro project with Storybook pre-configured and ready to run. The goal is to reduce time-to-first-story from a multi-step setup guide to a single command.

**Complexity**: Low-Medium

**What this includes**:
- `npm create storybook-astro@latest` (or `npx create-storybook-astro`) entry point
- Scaffolded `.storybook/main.js` and `.storybook/preview.js` with sensible defaults
- An example Astro component and its story file so the first `yarn storybook` renders something real
- Optional prompts for framework integrations (React, Vue, Svelte, etc.) and TypeScript

### Enhanced Testing & Portable Stories

🚧 **Partially Complete**

Expand testing capabilities for Astro components tested in isolation, including better support for Container API integration and DOM testing patterns.

**Current Status**: Core APIs shipped, additional utilities and documentation in progress

**Complexity**: Medium

**Still to do**:
- Test helper utilities for common testing patterns
- Documentation with examples for testing composed components
- Integration with testing libraries (Testing Library, Vitest patterns)
- Guidance on testing both server-rendered and client-side behavior

### Code Panel Source for Astro Components

📋 **To Do**

The Storybook Docs "Show code" / Code Panel currently falls back to displaying the raw story file source because the framework doesn't implement a `sourceDecorator`. The panel should show the Astro template syntax for the component being rendered with the story's args (e.g. `<HeroHijri imageUrl="..." />`).

**Complexity**: Medium
**Tracking**: [Issue #106 — Code Panel shows story source instead of component usage](https://github.com/storybook-astro/storybook-astro/issues/106)

**What this requires**:
- A `sourceDecorator` registered via `entry-preview.ts` that intercepts story renders and records the component + args
- An Astro template serializer that maps `{ component, args }` to a `.astro` template string, including decisions about bare string attributes vs. `{expression}` bindings and slot handling
- Parity with how `@storybook/react`, `@storybook/vue3`, and similar packages implement dynamic source for their template syntaxes

**Workaround**: Set `parameters.docs.source.code` manually on any story where you want a specific snippet shown.

### Astro Panel Addon

📋 **To Do**

A dedicated "Astro" panel tab in the Storybook UI (alongside Actions, Controls, etc.) that surfaces Astro-specific metadata for each story as it renders. The primary target is debugging: understanding exactly what the server produced and how long it took, without hunting through DevTools or adding `console.log` to `middleware.ts`.

**Complexity**: Low-Medium
**Details**: See the [Astro panel addon design](https://github.com/storybook-astro/storybook-astro/blob/develop/docs/specs/astro-panel-addon.md) for the full implementation strategy across dev, server, and static render modes.

**What the panel shows**:
- **Raw HTML output** — the HTML string returned by the Astro Container before injection into the canvas, including scoped class names, slot output, and rendering artifacts
- **SSR render time** — how long the server-side Container render took for the current story
- **Rendering mode** — whether the story is using `static` (pre-rendered) or `server` (on-demand) mode
- **Active framework integrations** — which integrations are loaded for this story (e.g. React, Solid)
- **Scoped style modules** — which `?astro&type=style` sub-modules were loaded for the current component tree, helping diagnose missing child styles

**What this requires**:
- A Storybook addon with a panel registered via `manager.ts`
- A channel event emitted from `render.tsx` after each render, carrying the metadata payload (render time, HTML string, active integrations)
- The panel subscribing to those channel events and rendering the data

The render time and HTML string are already available when `renderAstroComponent` resolves in `render.tsx` — this is mostly about emitting them over the addon channel rather than discarding them.

## Future Enhancements

### Render Performance

Every story render in dev mode makes a round-trip from the browser through Vite HMR to the server-side Astro Container. On fast machines this is noticeable (a few seconds per render); on slower connections it is more pronounced.

**Complexity**: High

**Potential directions**:
- Cache the Astro Container instance across renders rather than recreating it per request
- Stream the HTML response rather than waiting for a full render to complete
- Preload containers for visible stories during idle time

### Dynamic Astro Controls in Production Builds

Astro component stories can use one of two production build modes:

- **Static mode** (`renderMode: 'static'`, default) — ✅ **Complete**. Pre-renders all stories at build time. Controls are automatically disabled for Astro components since they can't be re-rendered with different args. Works on any static hosting platform (GitHub Pages, Netlify, Cloudflare Pages, S3, etc.) with no server requirements.

- **Server mode** (`renderMode: 'server'`) — 🚧 **In Progress**. Enables an HTTP render server that processes render requests on-demand, keeping Controls fully functional for Astro components in production builds. Requires a deployment environment with full Node.js APIs (Vercel, Netlify Functions, custom Node.js servers). Not compatible with pure static hosts or edge runtimes. See [Configuration Reference](/reference/configuration/#rendermode) for setup details.

**Future enhancements**:
- Complete server mode deployment guides and examples
- Service worker-based Controls for static builds (no server required)
- Pre-configured deployment adapters for popular serverless platforms

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

### Automatic Documentation Extraction from JSDoc

**Status**: Shipped (unreleased)

Component descriptions and prop documentation are extracted from JSDoc in a component's `.astro` frontmatter, so autodocs pages populate without any `argTypes` boilerplate in story files. Covers per-prop descriptions, types and defaults, select controls for literal union props, and types imported from other files (including through tsconfig `paths` aliases). Inherited DOM attributes are filtered out, while props you destructure are kept.

**Tracking**: [Issue #163](https://github.com/storybook-astro/storybook-astro/issues/163), [Issue #110](https://github.com/storybook-astro/storybook-astro/issues/110)

**Documentation**: See [Controls & ArgTypes](/writing-stories/controls/) for the conventions and the `docgen` framework option, and the [design record](https://github.com/storybook-astro/storybook-astro/blob/develop/docs/specs/docgen.md)

### Storybook Test Addon (`@storybook/addon-vitest`) Support

**Status**: Shipped (unreleased)

Storybook's official "Storybook Test" runner (`@storybook/addon-vitest`) runs your stories as Vitest browser tests on **Astro 5, 6 and 7**. Astro component stories render through the same server-side pipeline the canvas uses, and play functions run against the resulting DOM.

This was previously listed as blocked by [withastro/astro#16275](https://github.com/withastro/astro/issues/16275) and then as gated on the `astro@7.0.6` fix. Neither turned out to be accurate for Storybook Astro: the crash comes from Astro's `astro:server` Vite plugin, which Storybook Astro already strips from the Storybook Vite config, so Astro 5 and 6 work too and no version guard is needed.

**Known limitation**: `@storybook/addon-vitest` resolves each `stories` entry against your `.storybook` directory, so an absolute story glob matches nothing and those stories are silently untested. Keep story globs relative — see [Story globs must be relative](/guides/testing/#story-globs-must-be-relative).

**Documentation**: See the [Testing guide](/guides/testing/#storybook-test-addon-storybookaddon-vitest)

### Play Functions for Astro Components

**Shipped in**: 1.7.0

[Play functions](https://storybook.js.org/docs/writing-stories/play-function) run on Astro component stories, on Astro 5, 6 and 7. `@testing-library/user-event` interactions and assertions resolve against the server-rendered HTML, and the Interactions panel lists each step with its pass/fail state and the usual step-through controls. The `Counter` and `Accordion` stories in the integration apps cover this.

This has worked in the dev canvas since 1.7.0. Running the same play functions headlessly under [`@storybook/addon-vitest`](/guides/testing/#storybook-test-addon-storybookaddon-vitest) arrived later, in 1.11.0.

**One difference from framework components**: changing a Control after a play function has run re-renders the story from fresh server HTML, which discards whatever the play function did to the DOM. A React component keeps that state, because React reconciles the existing tree. Neither re-runs the play function on an args change — that part matches Storybook's normal behaviour — so after changing a Control the Interactions panel shows a result that no longer describes what is on screen. Re-select the story to run it again.

### Decorator Support

**Status**: Shipped (unreleased)

Storybook's [decorator](https://storybook.js.org/docs/writing-stories/decorators) API now works for both Astro component stories and framework component stories (React, Vue, etc.) — global (`.storybook/preview.js`), component-level, and story-level decorators are all supported, in dev mode, static builds, server-mode builds, and the portable-stories testing API.

**Documentation**: See the [Decorators guide](/writing-stories/decorators/) and the [design record](https://github.com/storybook-astro/storybook-astro/blob/develop/docs/specs/decorators.md)

### Support Astro Components as Props and Slot Content

**Shipped in**: 1.7.0

Astro components can now be passed as **props** (`args: { Icon }`) and as **slot content** (`args.slots.default`) to other Astro components in stories. Component slot content keeps its own rendered markup; plain-string slots are still sanitized. This covers the `<Link Icon={MyIcon} />` and `slots: { default: ChildComponent }` patterns, and works in portable stories (testing API) too.

**Documentation**: See [Props guide](/writing-stories/props/) and [Slots guide](/writing-stories/slots/)

### Astro 7 Support

**Shipped in**: 1.7.0

Storybook Astro now supports Astro 7 alongside Astro 5 and 6. Astro 7's Rust compiler (now the default) and Vite 8 (Rolldown) are handled by the existing compatibility layers with no configuration changes — an Astro 6 setup moves to Astro 7 by bumping versions. Dedicated `integration/astro7` and `integration/astro7-server` examples are smoke-tested in CI on every release.

**Documentation**: See [Version Compatibility](/how-it-works/version-compatibility/)

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

### Support Astro Components as Props (Phase 1 — Template Nesting)

**Shipped in**: 1.3.0

Components whose templates use other Astro components (transitively) render correctly, including those that use `<Image>` from `astro:assets`. No story-side changes are required.

**Phase 2** (props- and slot-based nesting) shipped in 1.7.0 — see entry above.

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
| Props & Slots (strings) | ✅ Supported | Passing data as props and HTML-string content to slots |
| Scoped Styles | ✅ Supported | Component-scoped CSS (including Astro 6's style sub-module imports) |
| UI Framework Components | ✅ Supported | Astro components and client-side UI components render together (React, Vue, Svelte, Preact, Solid, Alpine.js) |
| Client Directives | ✅ Supported | `client:load`, `client:only`, etc. for framework components |
| Static Builds | ✅ Supported | `storybook build` with build-time pre-rendering of Astro component stories (default mode) |
| Server Builds | 🚧 In Progress | `renderMode: 'server'` with on-demand rendering via HTTP server. Requires Node.js runtime. |
| `astro:assets` (Image) | ✅ Supported | Components using `<Image>` render correctly. Import image assets as `ImageMetadata` and pass as props. [See Images guide](/guides/images/) |
| Font Provider API | 🚧 Partial | `<Font>` component renders with provider-resolved URLs (Google, Bunny, Fontsource, local). Missing: preload links, Capsize fallback metrics, font file emission, server-build pipeline. [See Styling guide](/guides/styling/#astro-font-provider-api) |
| Nested Components (Template) | ✅ Supported | Components using other Astro components in templates render correctly |
| Nested Components (Props) | ✅ Supported | Pass Astro component factories as props (e.g. `args: { Icon: MyIcon }`). See [Props guide](/writing-stories/props/) |
| Nested Components (Slots) | ✅ Supported | Pass Astro component factories as slot content (e.g. `slots: { default: ChildComponent }`). See [Slots guide](/writing-stories/slots/) |
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

**Legend**: ✅ Supported | 🚧 Partial/In Progress | 📋 Planned | ❌ Not Supported | 🔮 Future Consideration

### Storybook Features

This table tracks compatibility of Storybook's built-in features when used with Astro components.

| Feature | Status | Description |
|---------|--------|-------------|
| Stories (CSF) | ✅ Supported | Component Story Format for defining stories |
| Args & Controls | ✅ Supported | Interactive controls for component props (dev only for Astro components; pre-rendered in static builds) |
| Actions | ✅ Supported | Log user interactions and events |
| Docs (Autodocs) | ✅ Supported | Automatic documentation pages, with props tables generated from frontmatter JSDoc |
| Docs (MDX) | ✅ Supported | Custom documentation pages with MDX |
| Docs Blocks | ✅ Supported | Pre-built documentation components (Description, Primary, Controls, Stories, etc.) |
| Viewports | ✅ Supported | Responsive design testing with different viewport sizes |
| Backgrounds | ✅ Supported | Test components against different background colors |
| Measure & Outline | ✅ Supported | Visual debugging tools for spacing and layout |
| Component Description | 🚧 Manual | Component descriptions must be set manually via `parameters.docs.description.component` (automatic extraction from JSDoc planned) |
| ArgTypes Documentation | ✅ Supported | Descriptions, types and defaults are extracted from `.astro` frontmatter JSDoc; `argTypes[].description` still overrides. See [Controls & ArgTypes](/writing-stories/controls/) |
| Source Code Display | 🚧 Partial | Shows story file source; doesn't generate component usage syntax (e.g. `<Component prop="value" />`). See roadmap item above |
| Decorators | ✅ Supported | Wrapper components/HTML for stories, in global/component/story positions. See [Decorators guide](/writing-stories/decorators/) and [design record](https://github.com/storybook-astro/storybook-astro/blob/develop/docs/specs/decorators.md) |
| Portable Stories | ✅ Supported | `composeStories`, `composeStory`, `setProjectAnnotations` for testing |
| Portable Stories Testing (Vitest) | ✅ Supported | Test stories with `@storybook-astro/framework/testing`'s `composeStories`/`renderStory` and Vitest, outside Storybook |
| Storybook Test Addon (`@storybook/addon-vitest`) | ✅ Supported | Runs stories as Vitest browser tests on Astro 5, 6 and 7. See the [Testing guide](/guides/testing/) |
| Play Functions | ✅ Supported | Works for both framework and Astro component stories, in the dev canvas and under the Storybook Test addon. One caveat on args changes — see roadmap item above |
| Interactions Panel | ✅ Supported | Debug play function interactions |
| Accessibility Addon | ✅ Supported | Automated accessibility testing with a11y addon |
| Theming | ✅ Supported | Storybook UI theming and customization |
| Multi-framework | ✅ Supported | Mix Astro and framework components (React, Vue, Svelte, etc.) in one Storybook |
| TypeScript | ✅ Supported | Full TypeScript support for stories and configuration |
| Hot Module Replacement | ✅ Supported | Live updates during development |
| Static Build | ✅ Supported | Build static documentation site with `storybook build` |

**Legend**: ✅ Supported | 🚧 Partial/Manual | 📋 Planned | ❌ Not Supported | 🚫 Blocked (Upstream)

## Contributing

Interested in working on any of these roadmap items? Check the [GitHub issues](https://github.com/storybook-astro/storybook-astro) for ongoing discussions and collaboration opportunities, or see the `AGENTS.md` file in the repository for development guidance.

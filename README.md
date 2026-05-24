# Storybook Astro

The community-supported Storybook framework for Astro. Build, test, and document your Astro components in Storybook's interactive environment.

**Website**: [storybook-astro.org](https://storybook-astro.org) · **npm**: [@storybook-astro/framework](https://www.npmjs.com/package/@storybook-astro/framework) · **GitHub**: [storybook-astro](https://github.com/storybook-astro/storybook-astro)

## Quick Start

Add Storybook to an existing Astro project:

### 1. Install packages

```bash
npm install -D storybook @storybook/builder-vite @storybook-astro/framework
```

### 2. Create `.storybook/main.js`

```javascript
export default {
  stories: ['../src/**/*.stories.@(js|jsx|ts|tsx)'],
  framework: {
    name: '@storybook-astro/framework',
    options: {},
  },
};
```

Disable sanitization explicitly:

```javascript
export default {
  framework: {
    name: '@storybook-astro/framework',
    options: {
      sanitization: { enabled: false },
    },
  },
};
```

Sanitization is enabled by default with conservative HTML defaults. To disable it, set `sanitization.enabled` to `false`.

You can also apply per-story rules for runtime setup and module replacements. If you want HTTP mocking with MSW, install `msw` in your own project and wire it up inside the rules file:

```javascript
export default {
  framework: {
    name: '@storybook-astro/framework',
    options: {
      storyRules: '.storybook/story-rules.ts',
    },
  },
};
```

```javascript
// .storybook/story-rules.ts
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { defineStoryRules } from '@storybook-astro/framework';

const server = setupServer();
let isListening = false;

function getMswServer() {
  if (!isListening) {
    server.listen({ onUnhandledRequest: 'bypass' });
    isListening = true;
  }

  return server;
}

export default defineStoryRules({
  rules: [
    {
      match: 'components-profile-card--*',
      use: ({ mock }) => {
        const server = getMswServer();

        server.use(
          http.get('/api/user', () => {
            return HttpResponse.json({ name: 'Storybook User' });
          })
        );

        mock('~/lib/feature-flags', './mocks/feature-flags.ts');

        return () => {
          server.resetHandlers();
        };
      },
    },
  ],
});
```

Production builds support two Astro render modes:

- `server` (default): builds `storybook-static` and a standalone Astro render server in `storybook-server`
- `static`: pre-renders Astro stories into `astro-prerendered-stories.json` and serves without a render server

```javascript
export default {
  framework: {
    name: '@storybook-astro/framework',
    options: {
      renderMode: 'server',
      server: {
        serverUrl: 'https://storybook-render.example.com',
        authToken: process.env.STORYBOOK_ASTRO_SERVER_TOKEN,
        authHeader: 'authorization',
      },
    },
  },
};
```

For token-based auth in server mode, you can also use runtime env/global values:

- `STORYBOOK_ASTRO_SERVER_URL`
- `STORYBOOK_ASTRO_SERVER_TOKEN`
- `STORYBOOK_ASTRO_SERVER_AUTH_HEADER`

You can sanitize incoming story args and slots through framework options:

```javascript
import { react, vue, svelte } from '@storybook-astro/framework/integrations';

export default {
  stories: ['../src/**/*.stories.@(js|jsx|ts|tsx)'],
  framework: {
    name: '@storybook-astro/framework',
    options: {
      integrations: [react(), vue(), svelte()],
      sanitization: {
        enabled: true,
        args: ['content', 'items.*.description'],
        slots: ['**'],
      },
    },
  },
};
```

To use non-Astro framework components (React, Vue, Svelte, etc.) inside your stories, add integrations:

```javascript
import { react, vue, svelte } from '@storybook-astro/framework/integrations';

export default {
  stories: ['../src/**/*.stories.@(js|jsx|ts|tsx)'],
  framework: {
    name: '@storybook-astro/framework',
    options: {
      integrations: [
        react({ include: ['**/react/**'] }),
        vue(),
        svelte(),
      ],
    },
  },
};
```

### 3. Create `.storybook/preview.js`

```javascript
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

### 4. Add scripts to `package.json`

```json
"scripts": {
  "dev": "storybook dev -p 6006",
  "build": "storybook build"
}
```

### 5. Run Storybook

```bash
npm run dev
```

> **Note:** `npm create storybook@latest` does not yet recognize Astro as a framework. Use the manual setup above instead.

## Requirements

- **Node.js**: 20.16.0+, 22.19.0+, or 24.0.0+ (required for Storybook 10's ESM-only support)
- **Storybook**: 10.0.0+
- **Astro**: 5.5.3+ or 6.0.0+ (see [Astro 6 Compatibility](#astro-6-compatibility) for implementation details)
- **Vite**: 6.4.1+ (required by Astro 5+), 7.x, or 8.x

## What This Package Does

This package provides a complete Storybook framework integration for Astro components, enabling developers to:

- **Document and test Astro components** in Storybook's interactive environment
- **Server-side render Astro components** directly in Storybook
- **Render Astro and UI framework components together** in one Storybook (React, Vue, Svelte, Preact, Solid, Alpine.js)
- **Live preview components** with hot module replacement during development
- **Build and deploy static Storybook** with pre-rendered Astro components
- **Handle component hydration** and client-side interactivity

## Architecture

The package consists of two main components:

### 1. `@storybook-astro/framework` (Framework Package)

The core framework implementation that integrates Astro with Storybook's build system:

- **Vite Plugin Integration**: Configures Vite to handle Astro components during the Storybook build process
- **Middleware Handler**: Sets up an Astro Container that renders components server-side on demand
- **Framework Integrations**: Manages UI framework renderers (React, Vue, Svelte, etc.) so Astro and framework components can be documented side-by-side in the same Storybook
- **Module Resolution**: Handles special module resolution for Astro's runtime and framework-specific modules

**Key files:**
- `src/preset.ts` - Storybook framework configuration and Vite setup
- `src/middleware.ts` - Astro Container setup and server-side rendering handler
- `src/integrations/` - Integration adapters for React, Vue, Svelte, Preact, Solid, and Alpine.js
- `src/viteStorybookAstroMiddlewarePlugin.ts` - Vite plugin for handling render requests (dev)
- `src/vitePluginAstroBuildPrerender.ts` - Pre-renders Astro component stories at build time
- `src/vitePluginAstroComponentMarker.ts` - Patches Astro 6's client-side `.astro` stubs for Storybook
- `src/vitePluginAstroFontsFallback.ts` - Stubs Astro 6's font virtual modules

### 2. `@storybook-astro/renderer` (Client Renderer)

> This package is automatically installed as a dependency of `@storybook-astro/framework` — no separate installation is needed.

The client-side rendering package that manages how Astro components are displayed in Storybook's preview:

- **Render Function**: Determines how to render different component types (Astro components, HTML strings, DOM elements, framework components)
- **Communication Layer**: Sends render requests from the browser to the Astro middleware via Vite's HMR channel
- **Fallback Rendering**: Delegates to framework-specific renderers (React, Vue, etc.) when `parameters.renderer` is specified
- **Style Management**: Handles Astro's scoped styles and HMR updates
- **Script Execution**: Manages client-side scripts and hydration for interactive components

**Key files:**
- `src/render.tsx` - Main rendering logic and Canvas integration
- `src/preset.ts` - Client-side preview annotations

## How It Works

### Dev Mode (`storybook dev`)

1. **Story Definition**: Stories import Astro components (`.astro` files) and define variations with different props
2. **Component Detection**: The renderer identifies Astro components by checking for the `isAstroComponentFactory` flag (patched by `vitePluginAstroComponentMarker` in Astro 6)
3. **Server Rendering**: When an Astro component is detected, a render request is sent to the Vite dev server middleware via HMR
4. **Container Rendering**: The middleware uses Astro's Container API to render the component with the provided props and slots (with `patchCreateAstroCompat` to bridge the Astro compiler v2/v3 calling convention difference)
5. **HTML Injection**: The rendered HTML is sent back to the client and injected into Storybook's canvas
6. **Hydration**: Client-side scripts are executed to add interactivity (for frameworks like Alpine.js or framework islands)
7. **Framework Delegation**: For non-Astro framework components (React, Solid, Vue, etc.), the renderer delegates directly to the framework-specific `renderToCanvas` before calling `storyFn()`, avoiding orphaned reactive effects
8. **HMR Updates**: Changes to components trigger re-renders while preserving state when possible

### Static Build (`storybook build`)

Since Astro components require server-side rendering via the Container API, static builds use a **build-time pre-rendering** approach:

1. **SSR Server**: During the Vite build, `vitePluginAstroBuildPrerender` creates an internal Vite SSR server with AstroContainer
2. **Story Discovery**: For each story file that imports an `.astro` component, the plugin loads the full story module via `ssrLoadModule` to get fully evaluated args (including imported assets like images)
3. **Pre-rendering**: Each story variant is rendered using AstroContainer with its merged args (meta + story level)
4. **HTML Injection**: The pre-rendered HTML is injected as a `parameters.__astroPrerendered` property on each story export
5. **Asset Emission**: Any `/@fs` dev-server asset URLs (e.g. images) in the rendered HTML are emitted as Rollup assets with content-hashed filenames, and the URLs are rewritten to their final paths
6. **Client Runtime**: The renderer detects the pre-rendered HTML parameter and uses it directly, bypassing the HMR path

**Limitations of static builds:**
- Astro component stories are rendered with their default args at build time — changing args via the Controls panel has no effect
- Framework component stories (React, Vue, Svelte, etc.) are unaffected and remain fully interactive
- Stories that override the meta-level `component` are not pre-rendered

## Setup Instructions

### Prerequisites

Ensure you have a compatible Node.js version installed:
```bash
node --version
# Should be 20.16.0+, 22.19.0+, or 24.0.0+
```

### Installation (Development)

1. Clone the repository:
   ```bash
   git clone https://github.com/storybook-astro/storybook-astro.git
   cd storybook-astro
   ```

2. Install dependencies:
   ```bash
   yarn install
   ```

3. Run Storybook (from an integration example):
   ```bash
   yarn workspace @storybook-astro/integration-astro6 dev
   ```

4. Build a static Storybook:
   ```bash
   yarn workspace @storybook-astro/integration-astro6 build
   ```

6. Serve the built output:
   ```bash
   yarn workspace @storybook-astro/integration-astro6 serve
   ```

5. Run tests:
   ```bash
   yarn test
   ```

5. Run tests (validates component rendering and framework integration health):
   ```bash
   yarn test
   ```

## Usage Example

Create a story for an Astro component:

```javascript
// Card.stories.jsx
import Card from './Card.astro';

export default {
  title: 'Components/Card',
  component: Card,
};

export const Default = {
  args: {
    title: 'My Card Title',
    content: 'Card content goes here',
  },
};

export const Highlighted = {
  args: {
    title: 'Featured Card',
    content: 'This card is highlighted',
    highlight: true,
  },
};
```

## Testing and Portable Stories

For testing setup and API usage, see the testing guide:

- [apps/website/src/content/docs/guides/testing.md](./apps/website/src/content/docs/guides/testing.md)

## Framework Integration

Configure framework integrations in `.storybook/main.js`:

```javascript
import { react, vue, svelte, preact, solid, alpinejs } from '@storybook-astro/framework/integrations';

export default {
  framework: {
    name: '@storybook-astro/framework',
    options: {
      integrations: [
        react({ include: ['**/react/**'] }),
        vue(),
        svelte(),
        preact({ include: ['**/preact/**'] }),
        solid({ include: ['**/solid/**'] }),
        alpinejs({ entrypoint: './.storybook/alpine-entrypoint.js' }),
      ],
    },
  },
};
```

> **Note**: The `include` patterns use recursive globs (`**`) to match components in nested directories (e.g. `solid/Counter/Counter.tsx`). A non-recursive glob like `**/solid/*` would fail to match files in subdirectories.

## Project Structure

```
storybook-astro/
├── packages/
│   └── @storybook/
│       ├── astro/              # Framework package
│       │   ├── src/
│       │   │   ├── integrations/                         # Framework integrations
│       │   │   ├── middleware.ts                         # SSR handler + createAstro compat
│       │   │   ├── preset.ts                             # Storybook config
│       │   │   ├── portable-stories.ts                   # composeStories for testing
│       │   │   ├── testing.ts                             # Testing runtime APIs (composeStories, renderStory)
│       │   │   ├── vitest/                                # Vitest config helpers (defineConfig)
│       │   │   ├── vitePluginAstroComponentMarker.ts     # Astro 6 component detection
│       │   │   ├── vitePluginAstroBuildPrerender.ts      # Build-time pre-rendering
│       │   │   ├── vitePluginAstroFontsFallback.ts       # Astro 6 font module stubs
│       │   │   ├── viteStorybookAstroMiddlewarePlugin.ts # Render request handling (dev)
│       │   │   └── viteStorybookRendererFallbackPlugin.ts
│       │   └── package.json
│       └── astro-renderer/     # Client renderer
│           ├── src/
│           │   ├── render.tsx     # Rendering logic + framework delegation
│           │   └── preset.ts      # Preview setup
│           └── package.json
├── lib/
│   └── vitest-setup.ts         # Vitest setup file
├── src/
│   └── components/             # Example components
├── vitest.config.ts            # Test configuration
├── .storybook/                 # Storybook configuration
└── package.json                # Root package
```

## Known Issues

### Current Known Issues

- This is experimental software not ready for production
- Some Astro features may not work as expected in the Storybook environment
- Performance may need optimization for large component libraries
- Hot module replacement for styles requires manual trigger in some cases

## Astro 6 Compatibility

Storybook Astro includes compatibility layers to handle differences between Astro versions and the Container API. These layers ensure consistent behavior across Astro 5.5+, 6.0+, and future versions.

### 1. Component Detection (`vitePluginAstroComponentMarker`)

**Problem**: In Astro 6, the client-side Vite transform of `.astro` files produces a stub that throws "Astro components cannot be used in the browser" — without setting the `isAstroComponentFactory` marker that Storybook's renderer uses to identify Astro components and route them to server-side rendering.

**Solution**: A post-transform Vite plugin (`vitePluginAstroComponentMarker.ts`) detects the Astro 6 stub pattern and replaces it with a version that sets `isAstroComponentFactory = true` and preserves the `moduleId` for the server render request.

### 2. Props Passing (`patchCreateAstroCompat`)

**Problem**: The Astro compiler v2 generates `result.createAstro($$Astro, $$props, $$slots)` (3 args), but the Astro 6 runtime expects `result.createAstro($$props, $$slots)` (2 args). When v2-compiled components run against the v6 runtime, `$$Astro` is captured as "props" and actual props are lost.

**Solution**: `patchCreateAstroCompat()` in `middleware.ts` wraps the component factory and intercepts `createAstro` calls. If 3 arguments are detected, it strips the leading `$$Astro` argument.

### 3. Scoped CSS (`vitePluginAstroComponentMarker`)

**Problem**: Astro 6's client-side transform no longer includes `<style>` block imports. Storybook's preview iframe receives the component stub but none of the scoped CSS.

**Solution**: The component marker plugin reads the original `.astro` source, counts `<style>` blocks, and generates import statements for each style sub-module using Astro's convention: `Component.astro?astro&type=style&index=N&lang.css`. During builds, Astro's compile metadata cache is not populated for client-side transforms, so the sub-module imports would fail. Instead, the plugin extracts raw CSS directly from the `.astro` source and inlines it.

### 4. Font Virtual Modules (`vitePluginAstroFontsFallback`)

**Problem**: Astro 6's `astro:assets` module depends on font-related virtual modules (`virtual:astro:assets/fonts/runtime`, `virtual:astro:assets/fonts/internal`) and a bare `astro/assets/fonts/runtime` import. These fail to resolve in Storybook's SSR Vite server because the fonts plugin's filter-based `resolveId` doesn't trigger.

**Solution**: `vitePluginAstroFontsFallback.ts` stubs all three font module paths with no-op exports, since Storybook doesn't need Astro's font system.

### 5. Framework Renderer Delegation (`render.tsx`)

**Problem**: In Astro 5, `renderToCanvas()` called `storyFn()` first, then delegated to framework renderers. In Astro 6 with updated framework integrations, this created orphaned reactive effects for frameworks like Solid that manage their own rendering lifecycle.

**Solution**: `renderToCanvas()` now delegates to framework-specific renderers *before* calling `storyFn()`. This lets each framework (React, Solid, Vue, etc.) manage its own reactive root without interference.

## Roadmap

For planned features, improvements, and known limitations, see the [Roadmap guide](https://storybook-astro.org/guides/roadmap/) on the website for a consolidated view of Storybook Astro's development direction.

## Currently Supported Features

This section tracks Astro's built-in framework features and their compatibility status with Storybook Astro.

### ✅ Supported Features

- **Component Rendering** - Core Astro component rendering via Container API
- **Props & Slots** - Passing data and content to components
- **Scoped Styles** - Component-scoped CSS (including Astro 6's style sub-module imports)
- **Astro + Framework Components** - Astro components and client-side UI components work together in one Storybook (React, Vue, Svelte, Preact, Solid, Alpine.js)
- **Client Directives** - `client:load`, `client:only`, etc. for framework components
- **Static Builds** - `storybook build` with build-time pre-rendering of Astro component stories

### ⚠️ Partial Support

- **`astro:assets` (Image Optimization)** - Works in components but requires fallback approach for Storybook stories due to module resolution issues. Components can accept both `ImageMetadata` and string URLs to maintain compatibility.
- **Astro Fonts** - Font virtual modules are stubbed with no-op exports. See the roadmap for planned Astro 6 Font Provider API integration.

## Contributing

**Any help is highly appreciated!** This project is experimental and welcomes contributions. Please see the `AGENTS.md` file for guidance on AI-assisted development.

## Acknowledgments

This project is based on [storybook-astro](https://github.com/slawekkolodziej/storybook-astro) by [Sławek Kołodziej](https://github.com/slawekkolodziej), which pioneered the approach of using Astro's Container API to render Astro components within Storybook.

## Related Links

- [Original Project: slawekkolodziej/storybook-astro](https://github.com/slawekkolodziej/storybook-astro)
- [Feature Request: storybookjs/storybook#18356](https://github.com/storybookjs/storybook/issues/18356)
- [Storybook Framework Documentation](https://storybook.js.org/docs/configure/integration/frameworks)
- [Astro Container API](https://docs.astro.build/en/reference/container-reference/)

## License

MIT

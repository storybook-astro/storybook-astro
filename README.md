# Storybook Astro

The community-supported Storybook framework for Astro. Build, test, and document your Astro components in Storybook's interactive environment.

**Website**: [storybook-astro.org](https://storybook-astro.org) · **npm**: [@storybook-astro/framework](https://www.npmjs.com/package/@storybook-astro/framework) · **GitHub**: [storybook-astro](https://github.com/storybook-astro/storybook-astro)

## Features

- **Document and test Astro components** in Storybook's interactive environment
- **Server-side render Astro components** directly in Storybook via the Container API
- **Mix Astro and UI framework components** in one Storybook (React, Vue, Svelte, Preact, Solid, Alpine.js)
- **Live preview** with hot module replacement during development
- **Static builds** with build-time pre-rendering of Astro component stories
- **Component hydration** and client-side interactivity

## Requirements

- **Node.js**: 20.16.0+, 22.19.0+, or 24.0.0+ (required for Storybook 10's ESM-only support)
- **Storybook**: 10.0.0+
- **Astro**: 5.5.3+ or 6.0.0+
- **Vite**: 6.4.1+ (required by Astro 5+), 7.x, or 8.x

---

# Using Storybook Astro

## Getting Started

Add Storybook to an existing Astro project.

### 1. Install

```bash
npm install -D storybook @storybook/builder-vite @storybook-astro/framework
```

> The `@storybook-astro/renderer` package is installed automatically as a dependency of `@storybook-astro/framework` — no separate install is needed.

### 2. Configure

Create `.storybook/main.js`:

```javascript
export default {
  stories: ['../src/**/*.stories.@(js|jsx|ts|tsx)'],
  framework: {
    name: '@storybook-astro/framework',
    options: {},
  },
};
```

Create `.storybook/preview.js`:

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

Add scripts to `package.json`:

```json
"scripts": {
  "dev": "storybook dev -p 6006",
  "build": "storybook build"
}
```

### 3. Write a story

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

### 4. Run Storybook

```bash
npm run dev
```

> **Note:** `npm create storybook@latest` does not yet recognize Astro as a framework. Use the manual setup above instead.

## Configuration

All options below are passed under `framework.options` in `.storybook/main.js`. See the [Configuration Reference](https://storybook-astro.org/reference/configuration/) for the full list.

### Framework integrations

To use non-Astro framework components (React, Vue, Svelte, etc.) inside your stories, add integrations:

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

> **Note**: `include` patterns use recursive globs (`**`) to match components in nested directories (e.g. `solid/Counter/Counter.tsx`). A non-recursive glob like `**/solid/*` would fail to match files in subdirectories.

### Render modes (production builds)

`storybook build` supports two Astro render modes:

- `static` (default): pre-renders Astro stories into `astro-prerendered-stories.json` and serves without a render server
- `server`: builds `storybook-static` and a standalone Astro render server in `storybook-server`

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

For token-based auth in server mode, you can also use runtime env/global values: `STORYBOOK_ASTRO_SERVER_URL`, `STORYBOOK_ASTRO_SERVER_TOKEN`, and `STORYBOOK_ASTRO_SERVER_AUTH_HEADER`.

### Sanitization

Story args and slots are sanitized before they reach the Astro Container, using conservative HTML defaults. By default only **slots** are sanitized (`slots: ['**']`); args are left untouched unless you opt specific paths in.

```javascript
export default {
  framework: {
    name: '@storybook-astro/framework',
    options: {
      sanitization: {
        // opt specific arg paths into sanitization
        args: ['content', 'items.*.description'],
        // sanitize all slots (the default)
        slots: ['**'],
      },
    },
  },
};
```

To turn sanitization off entirely, set `sanitization: { enabled: false }`. See the [Sanitization guide](https://storybook-astro.org/guides/sanitization/) for details.

### Story rules and mocking

Per-story rules let you run setup and replace modules for matching stories. For HTTP mocking with MSW, install `msw` in your project and wire it up inside the rules file:

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
import { defineStoryRules } from '@storybook-astro/framework/node';

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

## Documentation

- [Full documentation](https://storybook-astro.org) — guides, configuration reference, and examples
- [Configuration reference](https://storybook-astro.org/reference/configuration/)
- [Testing and portable stories](./apps/website/src/content/docs/guides/testing.md) — `composeStories` and Vitest setup
- [Roadmap](https://storybook-astro.org/guides/roadmap/) — planned features and known limitations

## Feature Support

This tracks Astro's built-in framework features and their compatibility status.

### ✅ Supported

- **Component Rendering** — core Astro component rendering via Container API
- **Props & Slots** — passing data and content to components
- **Scoped Styles** — component-scoped CSS (including Astro 6's style sub-module imports)
- **Astro + Framework Components** — Astro and client-side UI components together in one Storybook (React, Vue, Svelte, Preact, Solid, Alpine.js)
- **Client Directives** — `client:load`, `client:only`, etc. for framework components
- **Static Builds** — `storybook build` with build-time pre-rendering of Astro component stories

### ⚠️ Partial

- **`astro:assets` (Image Optimization)** — works in components but requires a fallback approach for stories due to module resolution. Components can accept both `ImageMetadata` and string URLs to maintain compatibility.
- **Astro Fonts** — font virtual modules are stubbed with no-op exports. See the roadmap for planned Font Provider API integration.

## Known Issues

- Some Astro features may not work as expected in the Storybook environment
- Performance may need optimization for large component libraries
- Hot module replacement for styles requires a manual trigger in some cases

---

# Contributing

**Any help is highly appreciated!** Contributions are welcome. See [`AGENTS.md`](./AGENTS.md) for guidance on AI-assisted development and deeper architecture notes.

## Local Development

This repository is a Yarn workspaces monorepo. To develop against it locally:

1. Clone the repository:
   ```bash
   git clone https://github.com/storybook-astro/storybook-astro.git
   cd storybook-astro
   ```

2. Install dependencies (requires Node 20.16.0+, 22.19.0+, or 24.0.0+):
   ```bash
   yarn install
   ```

3. Run Storybook from an integration example:
   ```bash
   yarn workspace @storybook-astro/integration-astro6 dev
   ```

4. Build a static Storybook:
   ```bash
   yarn workspace @storybook-astro/integration-astro6 build
   ```

5. Serve the built output:
   ```bash
   yarn workspace @storybook-astro/integration-astro6 serve
   ```

6. Run tests (validates component rendering and framework integration health):
   ```bash
   yarn test
   ```

## Project Structure

```
storybook-astro/
├── packages/
│   └── @storybook-astro/
│       ├── framework/          # Framework package
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
│       └── renderer/           # Client renderer
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

## Architecture

The project ships two packages:

### `@storybook-astro/framework` (server)

Integrates Astro with Storybook's build system: configures Vite to handle `.astro` files, sets up an Astro Container that renders components server-side on demand, manages UI framework renderers, and handles module resolution for Astro's runtime.

### `@storybook-astro/renderer` (client)

Runs inside Storybook's preview iframe: detects component types, sends render requests to the framework middleware over Vite's HMR channel, injects the returned HTML into the canvas, applies scoped styles, and executes client scripts. For non-Astro framework components it delegates to the framework-specific renderer.

### How it works

**Dev mode (`storybook dev`):** the renderer detects Astro components via the `isAstroComponentFactory` flag, sends a render request to the dev-server middleware over HMR, and the middleware renders the component with the Container API. The returned HTML is injected into the canvas and client scripts run for hydration. Non-Astro framework components are delegated to their framework renderer before `storyFn()` is called, which avoids orphaned reactive effects.

**Static build (`storybook build`):** because Astro components require server-side rendering, the build pre-renders each story at build time using an internal Vite SSR server with the Container API. The pre-rendered HTML is attached to each story export and the client runtime uses it directly. As a result, changing Astro story args via the Controls panel has no effect in static builds (framework component stories remain fully interactive).

For the detailed compatibility layers and implementation notes, see [`AGENTS.md`](./AGENTS.md).

---

## Roadmap

See the [Roadmap guide](https://storybook-astro.org/guides/roadmap/) for a consolidated view of planned features, improvements, and known limitations.

## Acknowledgments

This project is based on [storybook-astro](https://github.com/slawekkolodziej/storybook-astro) by [Sławek Kołodziej](https://github.com/slawekkolodziej), which pioneered the approach of using Astro's Container API to render Astro components within Storybook.

## Related Links

- [Original Project: slawekkolodziej/storybook-astro](https://github.com/slawekkolodziej/storybook-astro)
- [Feature Request: storybookjs/storybook#18356](https://github.com/storybookjs/storybook/issues/18356)
- [Storybook Framework Documentation](https://storybook.js.org/docs/configure/integration/frameworks)
- [Astro Container API](https://docs.astro.build/en/reference/container-reference/)

## License

MIT

---
title: Configuration Reference
description: Complete reference for Storybook Astro configuration options.
---

## `.storybook/main.js`

The main Storybook configuration file. Storybook Astro uses the standard Storybook configuration format with framework-specific options.

### Basic configuration

```javascript
export default {
  stories: ['../src/**/*.stories.@(js|jsx|ts|tsx)'],
  framework: {
    name: '@storybook-astro/framework',
    options: {},
  },
};
```

### Framework options

The `options` object accepts the following properties:

#### `integrations`

An array of framework integration instances. Each integration configures a UI framework (React, Vue, etc.) to work within Storybook alongside Astro components.

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

#### `resolveFrom`

Optional directory path to resolve Astro and framework integrations from. Useful when your Storybook is configured in a different directory than your project root (e.g., monorepos, monorepo workspaces).

Default: `process.cwd()` (current working directory)

```javascript
export default {
  framework: {
    name: '@storybook-astro/framework',
    options: {
      resolveFrom: '/path/to/project-root',
    },
  },
};
```

**Use case**: When running Storybook from a subdirectory or when Astro versions differ between projects:

```javascript
// Monorepo with separate Storybook for Astro 5 and Astro 6
// In workspace A (Astro 5)
export default {
  framework: {
    name: '@storybook-astro/framework',
    options: {
      resolveFrom: '/monorepo/packages/astro5-app',
    },
  },
};

// In workspace B (Astro 6)
export default {
  framework: {
    name: '@storybook-astro/framework',
    options: {
      resolveFrom: '/monorepo/packages/astro6-app',
    },
  },
};
```

#### `sanitization`

Controls HTML sanitization for incoming story `args` and `slots` before Astro component rendering.

Sanitization is enabled by default with conservative `sanitize-html` defaults.

- **`enabled`** - Optional boolean. Set to `false` to disable sanitization entirely (YOLO mode).
- **`args`** - Optional array of dot-path patterns to sanitize in `args` (for example: `['content', 'items.*.description']`). Default: `[]`.
- **`slots`** - Optional array of dot-path patterns to sanitize in `slots`. Default: `['**']` (all slot strings).
- **`sanitizeHtml`** - Optional [`sanitize-html` options](https://www.npmjs.com/package/sanitize-html) object for custom allowlists/transforms.

```javascript
export default {
  framework: {
    name: '@storybook-astro/framework',
    options: {
      sanitization: {
        enabled: true,
        args: ['content', 'items.*.description'],
        slots: ['**'],
        sanitizeHtml: {
          allowedTags: ['p', 'strong', 'em', 'a', 'ul', 'li'],
          allowedAttributes: {
            a: ['href', 'target', 'rel'],
          },
        },
      },
    },
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

#### `renderMode`

Optional string that determines how Astro components are rendered in production builds (`storybook build`).

- **`'static'`** (default) — Pre-renders all Astro component stories at build time. The fastest option for serving static builds, but Controls are disabled for Astro components since they can't be re-rendered with different args.
- **`'server'`** — Enables an HTTP render server that processes render requests on-demand. Controls remain fully functional for Astro components in production, but requires a deployment environment that can run the render server (e.g., Cloudflare Pages Functions, serverless functions).

```javascript
export default {
  framework: {
    name: '@storybook-astro/framework',
    options: {
      renderMode: 'server',
    },
  },
};
```

Development mode (`storybook dev`) always uses the HMR-based renderer regardless of this setting.

#### `server`

Configuration for the server-mode render endpoint. Only applies when `renderMode: 'server'`.

- **`serverUrl`** — Optional URL where the render server is accessible. Defaults to `'http://localhost:3000'` (development) or can be set to a relative path like `'/api/storybook-astro'` (production with Cloudflare Pages Functions).
- **`authToken`** — Optional authentication token sent with render requests.
- **`authHeader`** — Optional HTTP header name for the auth token. Defaults to `'authorization'`.

```javascript
export default {
  framework: {
    name: '@storybook-astro/framework',
    options: {
      renderMode: 'server',
      server: {
        serverUrl: process.env.STORYBOOK_ASTRO_SERVER_URL ?? '/api/storybook-astro',
        authToken: process.env.STORYBOOK_ASTRO_SERVER_TOKEN,
        authHeader: process.env.STORYBOOK_ASTRO_SERVER_AUTH_HEADER,
      },
    },
  },
};
```

Environment variables or globalThis values can also be used to configure server settings at runtime:
- `STORYBOOK_ASTRO_SERVER_URL` / `globalThis.STORYBOOK_ASTRO_SERVER_URL`
- `STORYBOOK_ASTRO_SERVER_TOKEN` / `globalThis.STORYBOOK_ASTRO_SERVER_TOKEN`
- `STORYBOOK_ASTRO_SERVER_AUTH_HEADER` / `globalThis.STORYBOOK_ASTRO_SERVER_AUTH_HEADER`

#### `storyRules`

Path to a story rules configuration file that defines per-story API mocks and module replacements.

Useful for mocking external APIs or replacing modules in specific stories:

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

**Story rules file** (`.storybook/story-rules.ts`):

```typescript
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
      // Match stories by pattern (e.g., 'components-profile-card--*')
      match: 'components-profile-card--*',
      use: ({ mock }) => {
        const server = getMswServer();

        // Mock API endpoints with Mock Service Worker
        server.use(
          http.get('/api/user', () => {
            return HttpResponse.json({ name: 'Storybook User' });
          })
        );

        // Replace modules for specific stories
        mock('~/lib/feature-flags', './mocks/feature-flags.ts');

        return () => {
          server.resetHandlers();
        };
      },
    },
  ],
});
```

**Available helpers in the `use` callback:**

- **`mock`** — Module replacement function to swap imports
- **`story`** — Story metadata (name, keys, etc.)

`use()` can also return a cleanup function. That lets you install and tear down user-owned runtime hooks such as MSW, fetch patches, or test doubles around each story render.

### Integration options

Each integration factory function accepts an options object:

#### `react(options?)`

- **`include`** — Glob pattern(s) for files to compile with React. Example: `['**/react/**']`

#### `vue(options?)`

No required options. All `.vue` files are compiled by default.

#### `svelte(options?)`

No required options. All `.svelte` files are compiled by default.

#### `preact(options?)`

- **`include`** — Glob pattern(s) for files to compile with Preact. Example: `['**/preact/**']`

#### `solid(options?)`

- **`include`** — Glob pattern(s) for files to compile with Solid. Example: `['**/solid/**']`

#### `alpinejs(options?)`

- **`entrypoint`** — Path to an Alpine.js entrypoint file that initializes Alpine and registers plugins/directives.

### `stories`

Standard Storybook `stories` glob pattern. Determines which files are loaded as stories.

```javascript
stories: ['../src/**/*.stories.@(js|jsx|ts|tsx)']
```

## `.storybook/preview.js`

The preview configuration file. Configures the Storybook UI for all stories.

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

### `parameters.renderer`

Set on individual stories or at the meta level to delegate rendering to a specific framework renderer instead of the Astro Container API:

```javascript
export default {
  component: MyReactComponent,
  parameters: {
    renderer: '@storybook/react',
  },
};
```

## `package.json` scripts

```json
{
  "scripts": {
    "dev": "storybook dev",
    "build": "storybook build"
  }
}
```

- **`dev`** — Starts the Storybook development server with live rendering and HMR
- **`build`** — Produces the package's built Storybook artifact

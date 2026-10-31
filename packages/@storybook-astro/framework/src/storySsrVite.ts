import { createRequire } from 'node:module';
import { createServer, mergeConfig, type Plugin, type ViteDevServer } from 'vite';
import type { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { ensureAstroPassthroughImageService, storybookImageServiceConfig } from './astroImageService.ts';
import { importAstroConfig } from './importAstroConfig.ts';
import type { Integration } from './integrations/index.ts';
import { resolveAliasedIsland } from './lib/resolve-aliased-island.ts';
import { ssrLoadModuleWithFsFallback } from './lib/ssr-load-module-with-fs-fallback.ts';
import {
  appendUserVitePlugins,
  loadUserAstroCompileOptions,
  loadUserAstroIntegrations,
  loadUserAstroVitePlugins
} from './loadUserAstroConfig.ts';
import { resolveStoryModuleMock } from './module-mocks.ts';
import type { FrameworkOptions } from './types.ts';
import { vitePluginAstroFonts } from './vitePluginAstroFonts.ts';
import { vitePluginAstroIntegrationOptsFallback } from './vitePluginAstroIntegrationOptsFallback.ts';
import { vitePluginAstroRoutesFallback } from './vitePluginAstroRoutesFallback.ts';
import { vitePluginAstroVueFallback } from './vitePluginAstroVueFallback.ts';
import { vitePluginNoClientDepOptimizer } from './vitePluginNoClientDepOptimizer.ts';
import { vitePluginStoryModuleMocks } from './vitePluginStoryModuleMocks.ts';

export async function createStorySsrViteServer(options: {
  integrations: Integration[];
  trackedSpecifiers: Set<string>;
  resolveFrom: string;
  fonts?: FrameworkOptions['fonts'];
  /**
   * Server mode only: when the project's own integrations break the server's
   * setup, warn and start without them instead of failing. The static build
   * leaves this off so it fails rather than publish stories without them.
   */
  renderWithoutProjectIntegrationsOnFailure?: boolean;
}) {
  const { getViteConfig } = await importAstroConfig(options.resolveFrom);
  const frameworkIntegrations = await Promise.all(
    options.integrations.map((integration) => integration.loadIntegration(options.resolveFrom))
  );

  // The project's own integrations too, as dev's server loads them, so one
  // that adds Vite or PostCSS config (`@astrojs/tailwind`, `astro-icon`)
  // renders the same in a build as in dev (issue #226).
  const frameworkNames = new Set(frameworkIntegrations.map((integration) => integration.name));
  const userIntegrations = (await loadUserAstroIntegrations(options.resolveFrom)).filter(
    (integration) => !frameworkNames.has(integration.name)
  );

  const compileOptions = await loadUserAstroCompileOptions(options.resolveFrom);

  const startServer = async (integrations: typeof frameworkIntegrations) => {
    const astroConfig = await getViteConfig(
      { root: options.resolveFrom },
      {
        configFile: false,
        ...compileOptions,
        integrations,
        image: { service: storybookImageServiceConfig() }
      }
    )({
      mode: 'production',
      command: 'serve'
    });

    // Astro 7.4+ gives `serve` configs a path-based CSS module naming scheme so
    // dev HMR keeps class names stable. This server renders production output,
    // and the island build that emits the matching stylesheets runs as a
    // `build`, which keeps Vite's default naming. Drop Astro's so the rendered
    // HTML references the class names the built CSS defines (issue #199).
    const cssModules = astroConfig.css?.modules;

    if (cssModules) {
      delete cssModules.generateScopedName;
    }

    // mergeConfig appends the second config's plugins after the first's, so
    // the fallbacks and story module mocks go in the first config to run ahead
    // of Astro's plugins, matching dev's createViteServer. Several of Astro's
    // plugins are `enforce: 'pre'` too (its astro:content resolver, for one),
    // and array order decides which resolveId answers first — after Astro's, a
    // storyRules mock of `astro:content` was never consulted (issue #194).
    const config = mergeConfig(
      {
        plugins: [
          createProjectAstroResolutionPlugin(options.resolveFrom),
          vitePluginAstroFonts({ fonts: options.fonts, root: options.resolveFrom }),
          vitePluginAstroIntegrationOptsFallback(),
          vitePluginAstroVueFallback(),
          vitePluginAstroRoutesFallback(),
          vitePluginStoryModuleMocks()
        ]
      },
      mergeConfig(astroConfig, {
        appType: 'custom',
        server: {
          middlewareMode: true
        },
        ssr: {
          // Keep Astro runtime classes in the Vite SSR graph so containers and
          // components share SlotString/HTMLString instances during prerendering.
          noExternal: /^astro(\/.+)?$/
        },
        // Only stubs for what Astro's plugins can't answer, so they stay after them.
        plugins: [
          createTrackedSpecifierStubPlugin(options.trackedSpecifiers),
          createStorybookBrowserStubPlugin(),
          vitePluginNoClientDepOptimizer()
        ]
      })
    );

    // The main Storybook build auto-loads `vite.plugins` from the user's
    // astro.config (see preset.ts). The prerender SSR server must receive the
    // same plugins, or components relying on one of them (e.g. vite-svg-loader's
    // `.svg?component` imports) resolve differently in the static output.
    appendUserVitePlugins(config, await loadUserAstroVitePlugins(options.resolveFrom));

    const viteServer = await createServer(config);

    try {
      await viteServer.pluginContainer.buildStart({});
    } catch (error) {
      await viteServer.close();
      throw error;
    }

    return viteServer;
  };

  try {
    return await startServer([...frameworkIntegrations, ...userIntegrations]);
  } catch (error) {
    if (!options.renderWithoutProjectIntegrationsOnFailure || userIntegrations.length === 0) {
      throw error;
    }

    // In server mode the project's hooks, and the Vite plugins they add, run
    // against `resolveFrom`, a snapshot holding only the config files, on a
    // filesystem that may be read-only. One failure would otherwise fail every
    // render, so fall back to rendering without them, as before issue #226.
    console.warn(
      "[storybook-astro] The story render server failed to start with the project's astro.config integrations; retrying without them. If the retry fails with the same error, the cause is elsewhere:",
      error
    );

    return await startServer(frameworkIntegrations);
  }
}

export async function loadRulesConfigModule(viteServer: ViteDevServer, configFilePath?: string) {
  if (!configFilePath) {
    return undefined;
  }

  try {
    return await ssrLoadModuleWithFsFallback(viteServer, configFilePath, {
      fixStacktrace: true
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);

    throw new Error(
      `Unable to load framework.options.storyRules config module at ${configFilePath}: ${reason}`
    );
  }
}

export function createClientModuleResolver(
  integrations: Integration[],
  staticModuleMap: Record<string, string>
) {
  return function resolveClientModule(specifier: string) {
    if (Object.hasOwn(staticModuleMap, specifier)) {
      return staticModuleMap[specifier];
    }

    const normalizedSpecifier = specifier.replace(/\\/g, '/').replace(/\?.*$/, '');

    if (Object.hasOwn(staticModuleMap, normalizedSpecifier)) {
      return staticModuleMap[normalizedSpecifier];
    }

    for (const integration of integrations) {
      const resolution = integration.resolveClient(specifier);

      if (resolution) {
        return resolution;
      }
    }
  };
}

export async function createProductionAstroContainer(options: {
  integrations: Integration[];
  resolveClientModule: (specifier: string) => string | undefined;
  viteServer: ViteDevServer;
  resolveFrom: string;
}) {
  ensureAstroPassthroughImageService();

  // Astro 6's container wraps each slot value in a SlotString, and the
  // rendering pipeline detects raw-HTML slot chunks via `instanceof SlotString`.
  // If the container is loaded by Node's ESM resolver while components are
  // loaded through Vite's SSR graph, the two paths produce different
  // SlotString classes and the instanceof check fails — slot content then
  // takes the escaping code path. Loading the container via the same Vite
  // SSR server keeps the class identity consistent.
  const containerModule = (await options.viteServer.ssrLoadModule('astro/container')) as {
    experimental_AstroContainer: typeof AstroContainer;
  };
  const ViteAstroContainer = containerModule.experimental_AstroContainer;

  const container = await ViteAstroContainer.create({
    resolve: async (specifier) => {
      const mockedModule = resolveStoryModuleMock(specifier);

      if (mockedModule) {
        return mockedModule;
      }

      const resolution = options.resolveClientModule(specifier);

      if (resolution) {
        return resolution;
      }

      // Last resort: an island imported via a tsconfig path alias (e.g. `@/...`)
      // never matches the static map under its raw specifier. Resolve the alias
      // to an on-disk path and look that up in the built module map instead.
      const abs = await resolveAliasedIsland(specifier, options.resolveFrom);

      if (abs) {
        return options.resolveClientModule(abs) ?? specifier;
      }

      return specifier;
    }
  });

  await addContainerRenderers(
    container,
    options.integrations,
    options.resolveClientModule,
    options.viteServer
  );

  return container;
}

export async function addContainerRenderers(
  container: Awaited<ReturnType<typeof AstroContainer.create>>,
  integrations: Integration[],
  resolveClientModule: (specifier: string) => string | undefined,
  viteServer: ViteDevServer
) {
  for (const integration of integrations) {
    const serverRenderer = integration.renderer.server;

    if (serverRenderer) {
      const serverRendererModule = await viteServer.ssrLoadModule(serverRenderer.entrypoint);
      const renderer = serverRendererModule.default ?? serverRendererModule;

      // Always register under the declared name; see `buildServerRenderer` in
      // viteAstroContainerRenderersPlugin.ts for why (Solid's renderer names
      // itself differently from its client).
      container.addServerRenderer({
        name: serverRenderer.name,
        renderer: isRecord(renderer)
          ? ({ ...renderer, name: serverRenderer.name } as never)
          : renderer
      });
    }

    const clientRenderer = integration.renderer.client;

    if (clientRenderer) {
      const resolvedEntrypoint =
        resolveClientModule(clientRenderer.entrypoint) ?? clientRenderer.entrypoint;

      container.addClientRenderer({
        name: clientRenderer.name,
        entrypoint: resolvedEntrypoint
      });
    }
  }
}

function createProjectAstroResolutionPlugin(resolveFrom: string): Plugin {
  const require = createRequire(import.meta.url);

  return {
    name: 'storybook-astro:resolve-project-astro-shared',
    enforce: 'pre',
    resolveId(id: string) {
      if (id !== 'astro' && !id.startsWith('astro/')) {
        return null;
      }

      try {
        return require.resolve(id, {
          paths: [resolveFrom]
        });
      } catch {
        return null;
      }
    }
  } satisfies Plugin;
}

function createTrackedSpecifierStubPlugin(trackedSpecifiers: Set<string>): Plugin {
  return {
    name: 'storybook-astro:shared-ssr-stubs',
    resolveId(id: string) {
      if (trackedSpecifiers.has(id)) {
        return `\0storybook-astro-shared-ssr-stub:${encodeURIComponent(id)}`;
      }

      return null;
    },
    load(id: string) {
      if (id.startsWith('\0storybook-astro-shared-ssr-stub:')) {
        return 'export default undefined;';
      }

      return null;
    }
  } satisfies Plugin;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// Stubs Storybook's browser-only modules so a project's preview config doesn't
// crash the SSR prerender.
//
// CSF4 stories import `@storybook/preview` and build their meta with
// `preview.meta(...).story(...)`. The real `@storybook/preview` re-exports the
// project's `.storybook/preview.ts`, which registers addons (docs, a11y, themes,
// …) whose UI kit reads `document` at module load and throws
// `document is not defined` under Node. Those addons pull `storybook/internal/...`
// in as externalized native imports, so a per-package stub can't reliably catch
// every DOM-touching module they reach.
//
// Prerendering only needs each story's component and args, never preview-level
// decorators/parameters or any addon. So we replace `@storybook/preview` with a
// minimal CSF4 factory: `meta(input)` returns `{ input }` and `meta.story(input)`
// returns the `{ _tag: 'Story', input, meta }` shape `resolveStoryAnnotations`
// reads. This sidesteps the project preview and its entire addon graph.
//
// The docs-package stubs remain as defense in depth for any path that still loads
// `.storybook/preview.ts` directly. `@storybook/addon-docs`'s default export is
// called as a function in preview config, so it stubs to a callable no-op;
// `blocks` are the docs block components (used only inside MDX, never prerendered)
// and `@storybook/blocks` is the pre-Storybook-10 path for those same blocks.
export function createStorybookBrowserStubPlugin(): Plugin {
  const STUBBED_SPECIFIERS = new Set([
    '@storybook/addon-docs',
    '@storybook/addon-docs/blocks',
    '@storybook/blocks'
  ]);
  const STUB_ID = '\0storybook-astro-browser-stub';
  const PREVIEW_SPECIFIER = '@storybook/preview';
  const PREVIEW_STUB_ID = '\0storybook-astro-preview-stub';
  const PREVIEW_STUB_SOURCE = [
    'const preview = {',
    '  meta(input = {}) {',
    '    const meta = { input };',
    "    meta.story = (storyInput = {}) => ({ _tag: 'Story', input: storyInput, meta });",
    '    return meta;',
    '  }',
    '};',
    'export default preview;'
  ].join('\n');

  return {
    name: 'storybook-astro:storybook-browser-stubs',
    // Must run before Astro's resolvers, which would otherwise resolve these
    // bare specifiers to their real (browser-only) files before we can stub them.
    enforce: 'pre',
    resolveId(id: string) {
      if (id === PREVIEW_SPECIFIER) {
        return PREVIEW_STUB_ID;
      }

      if (STUBBED_SPECIFIERS.has(id)) {
        return STUB_ID;
      }

      return null;
    },
    load(id: string) {
      if (id === PREVIEW_STUB_ID) {
        return PREVIEW_STUB_SOURCE;
      }

      if (id === STUB_ID) {
        return 'export default () => ({});';
      }

      return null;
    }
  } satisfies Plugin;
}

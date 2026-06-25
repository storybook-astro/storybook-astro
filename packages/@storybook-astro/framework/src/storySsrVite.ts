import { createRequire } from 'node:module';
import { createServer, mergeConfig, type Plugin, type ViteDevServer } from 'vite';
import type { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { ensureAstroPassthroughImageService } from './astroImageService.ts';
import { importAstroConfig } from './importAstroConfig.ts';
import type { Integration } from './integrations/index.ts';
import { resolveAliasedIsland } from './lib/resolve-aliased-island.ts';
import { ssrLoadModuleWithFsFallback } from './lib/ssr-load-module-with-fs-fallback.ts';
import { resolveStoryModuleMock } from './module-mocks.ts';
import type { FrameworkOptions } from './types.ts';
import { vitePluginAstroFonts } from './vitePluginAstroFonts.ts';
import { vitePluginAstroIntegrationOptsFallback } from './vitePluginAstroIntegrationOptsFallback.ts';
import { vitePluginAstroRoutesFallback } from './vitePluginAstroRoutesFallback.ts';
import { vitePluginAstroVueFallback } from './vitePluginAstroVueFallback.ts';
import { vitePluginStoryModuleMocks } from './vitePluginStoryModuleMocks.ts';

export async function createStorySsrViteServer(options: {
  integrations: Integration[];
  trackedSpecifiers: Set<string>;
  resolveFrom: string;
  fonts?: FrameworkOptions['fonts'];
}) {
  const { getViteConfig, passthroughImageService } = await importAstroConfig(options.resolveFrom);
  const astroConfig = await getViteConfig(
    { root: options.resolveFrom },
    {
      configFile: false,
      integrations: await Promise.all(
        options.integrations.map((integration) => integration.loadIntegration(options.resolveFrom))
      ),
      image: { service: passthroughImageService() }
    }
  )({
    mode: 'production',
    command: 'serve'
  });

  const config = mergeConfig(astroConfig, {
    appType: 'custom',
    server: {
      middlewareMode: true
    },
    ssr: {
      // Keep Astro runtime classes in the Vite SSR graph so containers and
      // components share SlotString/HTMLString instances during prerendering.
      noExternal: /^astro(\/.+)?$/
    },
    plugins: [
      createProjectAstroResolutionPlugin(options.resolveFrom),
      vitePluginAstroFonts({ fonts: options.fonts, root: options.resolveFrom }),
      vitePluginAstroIntegrationOptsFallback(),
      vitePluginAstroVueFallback(),
      vitePluginAstroRoutesFallback(),
      vitePluginStoryModuleMocks(),
      createTrackedSpecifierStubPlugin(options.trackedSpecifiers),
      createStorybookBrowserStubPlugin()
    ]
  });

  const viteServer = await createServer(config);

  await viteServer.pluginContainer.buildStart({});

  return viteServer;
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

      if (integration.name === 'solid' && isRecord(renderer)) {
        container.addServerRenderer({
          name: serverRenderer.name,
          renderer: {
            ...renderer,
            name: serverRenderer.name
          } as never
        });
      } else {
        container.addServerRenderer({
          name: serverRenderer.name,
          renderer
        });
      }
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

// Stubs Storybook's browser-only docs packages so a project's preview config
// doesn't crash the SSR prerender. Stories import `@storybook/preview`, which
// loads `.storybook/preview.ts`, which commonly registers the docs addon
// (`import addonDocs from '@storybook/addon-docs'`). The docs addon pulls in
// Storybook's UI kit, which reads `document.documentElement` at module load and
// throws `document is not defined` under Node. The docs UI never runs during
// prerendering — we only need each story's component and args — so replacing it
// with a no-op is safe.
//
// `@storybook/addon-docs`'s default export is called as a function in preview
// config (`addonDocs()`), so the stub exports a callable no-op. `blocks` are the
// docs block components (used only inside MDX, which is not prerendered), and
// `@storybook/blocks` is the pre-Storybook-10 path for those same blocks.
function createStorybookBrowserStubPlugin(): Plugin {
  const STUBBED_SPECIFIERS = new Set([
    '@storybook/addon-docs',
    '@storybook/addon-docs/blocks',
    '@storybook/blocks'
  ]);
  const STUB_ID = '\0storybook-astro-browser-stub';

  return {
    name: 'storybook-astro:storybook-browser-stubs',
    // Must run before Astro's resolvers, which would otherwise resolve these
    // bare specifiers to their real (browser-only) files before we can stub them.
    enforce: 'pre',
    resolveId(id: string) {
      if (STUBBED_SPECIFIERS.has(id)) {
        return STUB_ID;
      }

      return null;
    },
    load(id: string) {
      if (id === STUB_ID) {
        return 'export default () => ({});';
      }

      return null;
    }
  } satisfies Plugin;
}

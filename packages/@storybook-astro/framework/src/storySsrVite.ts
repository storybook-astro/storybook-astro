import { createRequire } from 'node:module';
import { createServer, mergeConfig, type Plugin, type ViteDevServer } from 'vite';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { ensureAstroPassthroughImageService } from './astroImageService.ts';
import { importAstroConfig } from './importAstroConfig.ts';
import type { Integration } from './integrations/index.ts';
import { ssrLoadModuleWithFsFallback } from './lib/ssr-load-module-with-fs-fallback.ts';
import { resolveStoryModuleMock } from './module-mocks.ts';
import { vitePluginAstroFontsFallback } from './vitePluginAstroFontsFallback.ts';
import { vitePluginAstroIntegrationOptsFallback } from './vitePluginAstroIntegrationOptsFallback.ts';
import { vitePluginAstroRoutesFallback } from './vitePluginAstroRoutesFallback.ts';
import { vitePluginAstroVueFallback } from './vitePluginAstroVueFallback.ts';
import { vitePluginStoryModuleMocks } from './vitePluginStoryModuleMocks.ts';

export async function createStorySsrViteServer(options: {
  integrations: Integration[];
  trackedSpecifiers: Set<string>;
  resolveFrom: string;
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
      vitePluginAstroFontsFallback(),
      vitePluginAstroIntegrationOptsFallback(),
      vitePluginAstroVueFallback(),
      vitePluginAstroRoutesFallback(),
      vitePluginStoryModuleMocks(),
      createTrackedSpecifierStubPlugin(options.trackedSpecifiers)
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
}) {
  ensureAstroPassthroughImageService();

  const container = await AstroContainer.create({
    resolve: async (specifier) => {
      const mockedModule = resolveStoryModuleMock(specifier);

      if (mockedModule) {
        return mockedModule;
      }

      const resolution = options.resolveClientModule(specifier);

      if (resolution) {
        return resolution;
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

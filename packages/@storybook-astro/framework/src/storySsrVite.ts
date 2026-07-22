import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, mergeConfig, type Plugin, type ViteDevServer } from 'vite';
import type { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { ensureAstroPassthroughImageService } from './astroImageService.ts';
import { importAstroConfig } from './importAstroConfig.ts';
import type { Integration } from './integrations/index.ts';
import {
  loadUserAstroViteResolveAlias,
  mergeFrameworkAndUserIntegrations
} from './loadUserAstroConfig.ts';
import { resolveAliasedIsland } from './lib/resolve-aliased-island.ts';
import { ssrLoadModuleWithFsFallback } from './lib/ssr-load-module-with-fs-fallback.ts';
import { resolveStoryModuleMock } from './module-mocks.ts';
import type { FrameworkOptions } from './types.ts';
import { vitePluginAstroFonts } from './vitePluginAstroFonts.ts';
import { vitePluginAstroIntegrationOptsFallback } from './vitePluginAstroIntegrationOptsFallback.ts';
import { vitePluginAstroRoutesFallback } from './vitePluginAstroRoutesFallback.ts';
import { vitePluginAstroVueFallback } from './vitePluginAstroVueFallback.ts';
import { vitePluginStoryModuleMocks } from './vitePluginStoryModuleMocks.ts';
import { vitePluginTsconfigAliases } from './vitePluginTsconfigAliases.ts';

export async function createStorySsrViteServer(options: {
  integrations: Integration[];
  trackedSpecifiers: Set<string>;
  resolveFrom: string;
  fonts?: FrameworkOptions['fonts'];
}) {
  const { getViteConfig, passthroughImageService } = await importAstroConfig(options.resolveFrom);
  const frameworkIntegrations = await Promise.all(
    options.integrations.map((integration) => integration.loadIntegration(options.resolveFrom))
  );
  // Match the dev SSR server: integrations declared only in the user's
  // astro.config.* must also apply to production/server-mode renders.
  const integrations = await mergeFrameworkAndUserIntegrations(
    frameworkIntegrations,
    options.resolveFrom
  );
  const userResolveAlias = await loadUserAstroViteResolveAlias(options.resolveFrom);

  const astroConfig = await getViteConfig(
    { root: options.resolveFrom },
    {
      configFile: false,
      integrations,
      image: { service: passthroughImageService() },
      // The render server is headless; the toolbar plugin also breaks the
      // Vite dep-optimizer build under vitest ("Not implemented" in
      // astro:strip-toolbar-sourcemap generateBundle).
      devToolbar: { enabled: false }
    }
  )({
    mode: 'production',
    command: 'serve'
  });

  // Astro registers its dev-toolbar plugins even with the toolbar disabled.
  // They are useless in a headless render server, and on Vite 8 the
  // `astro:strip-toolbar-sourcemap` generateBundle hook crashes the rolldown
  // dep-optimizer build ("Not implemented").
  astroConfig.plugins = (astroConfig.plugins ?? [])
    .flat(Infinity as 1)
    .filter(
      (plugin) =>
        !(plugin && typeof plugin === 'object' && 'name' in plugin) ||
        !String(plugin.name).includes('toolbar')
    );

  const config = mergeConfig(astroConfig, {
    appType: 'custom',
    // Vite and some plugins (e.g. @sveltejs/vite-plugin-svelte's optimizer
    // metadata) write into cacheDir at boot. The default node_modules/.vite
    // lives on a read-only filesystem on serverless hosts, so keep the cache
    // in the OS temp dir instead.
    cacheDir: join(
      tmpdir(),
      `storybook-astro-vite-${createHash('sha1').update(options.resolveFrom).digest('hex').slice(0, 8)}`
    ),
    server: {
      middlewareMode: true
    },
    // `configFile: false` drops the user's astro.config `vite.resolve.alias`;
    // re-apply it so aliased imports resolve like they do in a real Astro build.
    ...(userResolveAlias ? { resolve: { alias: userResolveAlias } } : {}),
    ssr: {
      // Keep Astro runtime classes in the Vite SSR graph so containers and
      // components share SlotString/HTMLString instances during prerendering.
      // Renderer packages (@astrojs/preact etc.) must also stay in the graph:
      // since Astro 7 / @astrojs/preact 6 their server entrypoints import
      // integration-provided virtuals (astro:preact:opts) that only resolve
      // through Vite — externalized, node imports them directly and crashes
      // with ERR_UNSUPPORTED_ESM_URL_SCHEME. Astro's own explicit `external`
      // entries (e.g. @astrojs/compiler) still win over this pattern.
      noExternal: [/^astro(\/.+)?$/, /^@astrojs\//]
    },
    plugins: [
      createProjectAstroResolutionPlugin(options.resolveFrom),
      vitePluginTsconfigAliases(options.resolveFrom),
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

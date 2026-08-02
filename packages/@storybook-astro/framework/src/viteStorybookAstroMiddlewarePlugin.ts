import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import type { ServerResponse } from 'node:http';
import { createServer, createLogger, type Connect, type PluginOption, type ViteDevServer } from 'vite';
import type { RenderRequestMessage, RenderResponseMessage } from '@storybook-astro/renderer/types';
import type { FrameworkOptions } from './types.ts';
import type { Integration } from './integrations/index.ts';
import { importAstroConfig } from './importAstroConfig.ts';
import { viteAstroContainerRenderersPlugin } from './viteAstroContainerRenderersPlugin.ts';
import { vitePluginAstroFonts, generateFontCss } from './vitePluginAstroFonts.ts';
import { vitePluginAstroIntegrationOptsFallback } from './vitePluginAstroIntegrationOptsFallback.ts';
import { vitePluginAstroVueFallback } from './vitePluginAstroVueFallback.ts';
import { vitePluginAstroRoutesFallback } from './vitePluginAstroRoutesFallback.ts';
import { vitePluginStoryModuleMocks } from './vitePluginStoryModuleMocks.ts';
import { ssrLoadModuleWithFsFallback } from './lib/ssr-load-module-with-fs-fallback.ts';
import { resolveRulesConfigFilePath } from './rules-options.ts';
import { loadUserAstroIntegrations } from './loadUserAstroConfig.ts';

export async function vitePluginStorybookAstroMiddleware(options: FrameworkOptions) {
  // The internal Vite server is created lazily inside configureServer (dev-only).
  // During builds, configureServer never fires, so no server is created.
  let viteServer: ViteDevServer | null = null;

  const resolveFrom = options.resolveFrom ?? process.cwd();

  const vitePlugin = {
    name: 'storybook-astro-middleware-plugin',
    async configureServer(server) {
      const fontCss = await generateFontCss(options.fonts ?? [], resolveFrom);

      viteServer = await createViteServer(options.integrations ?? [], resolveFrom, options.fonts);
      const storyRulesConfigFilePath = resolveRulesConfigFilePath(options.storyRules, resolveFrom);

      const filePath = fileURLToPath(new URL('./middleware', import.meta.url));
      const middleware = await viteServer.ssrLoadModule(filePath, {
        fixStacktrace: true
      });

      const createHandler = () => middleware.handlerFactory(options.integrations ?? [], {
        sanitization: options.sanitization,
        rulesConfigFilePath: storyRulesConfigFilePath,
        resolveRulesConfigModule: () =>
          loadRulesConfigModule(viteServer!, storyRulesConfigFilePath),
        invalidateModuleGraph: () => {
          viteServer?.moduleGraph.invalidateAll();
        },
        loadModule: (id: string) =>
          ssrLoadModuleWithFsFallback(viteServer!, id, {
            fixStacktrace: true
          }),
        resolveFrom
      });

      let handlerPromise = createHandler();

      const resetHandler = () => {
        handlerPromise = createHandler();
      };

      server.watcher.on('add', resetHandler);
      server.watcher.on('change', resetHandler);
      server.watcher.on('unlink', resetHandler);
      viteServer.watcher.on('add', resetHandler);
      viteServer.watcher.on('change', resetHandler);
      viteServer.watcher.on('unlink', resetHandler);

      server.ws.on('astro:render:request', async (data: RenderRequestMessage['data']) => {
        try {
          const handler = await handlerPromise;
          const componentHtml = await handler(data);
          // @font-face rules and :root CSS variable bindings must reach the
          // browser. The Astro Container API renders a component fragment, not
          // a full page, so Astro's font pipeline never gets to write them into
          // a <head>. Prepending a <style> block to the fragment is the
          // equivalent — @font-face and :root rules apply globally wherever
          // the <style> element appears in the document.
          const html = fontCss ? `<style>\n${fontCss}\n</style>${componentHtml}` : componentHtml;

          server.ws.send('astro:render:response', {
            html,
            id: data.id
          } satisfies RenderResponseMessage['data']);
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          const errorStack = err instanceof Error ? err.stack : '';

          console.error('[storybook-astro] Render error:', errorMessage);
          if (errorStack) {console.error(errorStack);}
          server.ws.send('astro:render:response', {
            id: data.id,
            html:
              '<div style="background: #d73838; padding: 12px; color: #f0f0f0; font-family: monospace; border-radius: 4px">' +
              '<strong>Error rendering Astro component</strong><br/>' +
              '<pre style="white-space: pre-wrap; margin-top: 8px; font-size: 12px">' +
              errorMessage.replace(/</g, '&lt;').replace(/>/g, '&gt;') +
              '</pre></div>'
          } satisfies RenderResponseMessage['data']);
        }
      });
    }
  } satisfies PluginOption;

  // Create asset serving plugin (only active in dev when viteServer exists)
  const assetServingPlugin = {
    name: 'storybook-astro-assets',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/_image', (req: Connect.IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
        if (!viteServer) {
          next();

          return;
        }
        // Forward the request to the Astro vite server
        viteServer.middlewares.handle(req, res, (err?: unknown) => {
          if (err) {
            console.error('Asset serving error:', err);
            next();
          }
        });
      });
    }
  };

  // The extracted CSS plugins from Astro's internal Vite server cause Vue SFC
  // <style> blocks to be double-processed (once by these plugins, once by
  // Storybook's built-in CSS plugins), resulting in PostCSS errors.
  //
  // Solution: Don't extract Astro's CSS plugins. Storybook's built-in CSS
  // plugins handle both Vue styles AND Astro style sub-modules (which are
  // standard CSS imports like `Component.astro?astro&type=style&index=0&lang.css`).
  //
  // The Astro internal server's CSS plugins are only needed for SSR rendering
  // within that server - they don't need to be shared with Storybook's server.
  return {
    vitePlugin,
    viteConfig: {
      plugins: [
        assetServingPlugin
      ].filter(Boolean)
    }
  };
}

/**
 * Creates a Vite logger that silences known benign warnings emitted by Astro's
 * Vite plugin in the SSR server context:
 * - "Missing pages directory" — Storybook and test contexts have no src/pages.
 * - "points to missing source files" — Sourcemap gaps in the `entities` package.
 */
function createSsrServerLogger() {
  const logger = createLogger();
  const originalWarn = logger.warn.bind(logger);

  logger.warn = (msg, options) => {
    if (
      msg.includes('Missing pages directory') ||
      msg.includes('points to missing source files') ||
      msg.includes('Failed to load source map for')
    ) {
      return;
    }

    originalWarn(msg, options);
  };

  return logger;
}

export async function createViteServer(
  integrations: Integration[],
  resolveFrom = process.cwd(),
  fonts?: FrameworkOptions['fonts']
) {
  const { getViteConfig, passthroughImageService } = await importAstroConfig(resolveFrom);
  const safeIntegrations = integrations ?? [];
  const projectAstroResolutionPlugin = createProjectAstroResolutionPlugin(resolveFrom);

  const frameworkIntegrations = await Promise.all(
    safeIntegrations.map((integration) => integration.loadIntegration(resolveFrom))
  );

  const userIntegrations = await loadUserAstroIntegrations(resolveFrom);
  const frameworkNames = new Set(frameworkIntegrations.map(i => i.name));
  const extraIntegrations = userIntegrations.filter(i => !frameworkNames.has(i.name));

  const config = await getViteConfig(
    { root: resolveFrom },
    {
      configFile: false,
      integrations: [...frameworkIntegrations, ...extraIntegrations],
      // Use the passthrough image service so nested components that use <Image>
      // from astro:assets render as plain <img> tags without triggering image
      // optimization (which fails in the Storybook SSR context).
      image: { service: passthroughImageService() }
    }
  )({ mode: 'development', command: 'serve' });

  const viteServer = await createServer({
    configFile: false,
    ...config,
    // Astro's own runtime (e.g. `astro/assets/runtime`'s `createSvgComponent`,
    // used to reconstruct an `.svg`-as-component arg — issue #154) reads
    // `import.meta.env.DEV`. SSR-externalized deps load through Node's native
    // `import()`, bypassing Vite's SSR transform entirely, so `import.meta.env`
    // is never populated and that read throws. Keep `astro` in Vite's SSR graph
    // so it gets the transform instead — the same setting `storySsrVite.ts`
    // already uses for the static/server-mode build's prerender server.
    ssr: {
      ...config.ssr,
      noExternal: [
        ...(Array.isArray(config.ssr?.noExternal) ? config.ssr.noExternal : []),
        /^astro(\/.+)?$/
      ]
    },
    customLogger: createSsrServerLogger(),
    plugins: [
      projectAstroResolutionPlugin,
      // Fallbacks must come first to intercept before Astro's plugins
      vitePluginAstroFonts({ fonts, root: resolveFrom }),
      vitePluginAstroIntegrationOptsFallback(),
      vitePluginAstroVueFallback(),
      vitePluginAstroRoutesFallback(),
      vitePluginStoryModuleMocks(),
      ...(config.plugins?.filter(Boolean) ?? []),
      viteAstroContainerRenderersPlugin(safeIntegrations)
    ]
  });

  // Initialize the server's plugin container to ensure all plugins are ready.
  // Without this, some plugins (like vite:css) may have uninitialized state
  // when ssrLoadModule is called.
  await viteServer.pluginContainer.buildStart({});

  return viteServer;
}

function createProjectAstroResolutionPlugin(resolveFrom: string): PluginOption {
  const require = createRequire(import.meta.url);

  return {
    name: 'storybook-astro:resolve-project-astro',
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
  } satisfies PluginOption;
}

async function loadRulesConfigModule(viteServer: ViteDevServer, configFilePath?: string) {
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

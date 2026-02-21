import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer, type PluginOption, type ViteDevServer } from 'vite';
import type { RenderRequestMessage, RenderResponseMessage } from '@storybook-astro/renderer/types';
import type { FrameworkOptions } from './types.ts';
import type { Integration } from './integrations/index.ts';
import { importAstroConfig } from './importAstroConfig.ts';
import { viteAstroContainerRenderersPlugin } from './viteAstroContainerRenderersPlugin.ts';
import { vitePluginAstroFontsFallback } from './vitePluginAstroFontsFallback.ts';
import { vitePluginAstroVueFallback } from './vitePluginAstroVueFallback.ts';
import { vitePluginAstroRoutesFallback } from './vitePluginAstroRoutesFallback.ts';

export async function vitePluginStorybookAstroMiddleware(options: FrameworkOptions) {
  // The internal Vite server is created lazily inside configureServer (dev-only).
  // During builds, configureServer never fires, so no server is created.
  let viteServer: ViteDevServer | null = null;

  const resolveFrom = options.resolveFrom ?? process.cwd();

  const vitePlugin = {
    name: 'storybook-astro-middleware-plugin',
    async configureServer(server) {
      viteServer = await createViteServer(options.integrations, resolveFrom);

      const filePath = fileURLToPath(new URL('./middleware', import.meta.url));
      const middleware = await viteServer.ssrLoadModule(filePath, {
        fixStacktrace: true
      });
      const handler = await middleware.handlerFactory(options.integrations ?? []);

      server.ws.on('astro:render:request', async (data: RenderRequestMessage['data']) => {
        try {
          const html = await handler(data);

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
    configureServer(server) {
      server.middlewares.use('/_image', (req, res, next) => {
        if (!viteServer) {
          next();
          
return;
        }
        // Forward the request to the Astro vite server
        viteServer.middlewares.handle(req, res, (err) => {
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

export async function createViteServer(integrations: Integration[], resolveFrom = process.cwd()) {
  const { getViteConfig } = await importAstroConfig(resolveFrom);
  const safeIntegrations = integrations ?? [];
  const projectAstroResolutionPlugin = createProjectAstroResolutionPlugin(resolveFrom);

  const config = await getViteConfig(
    {},
    {
      configFile: false,
      integrations: await Promise.all(
        safeIntegrations.map((integration) => integration.loadIntegration(resolveFrom))
      )
    }
  )({ mode: 'development', command: 'serve' });

  const viteServer = await createServer({
    configFile: false,
    ...config,
    plugins: [
      projectAstroResolutionPlugin,
      // Fallbacks must come first to intercept before Astro's plugins
      vitePluginAstroFontsFallback(),
      vitePluginAstroVueFallback(),
      vitePluginAstroRoutesFallback(),
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

import { EventEmitter } from 'node:events';
import type * as Vite from 'vite';
import type { ViteDevServer } from 'vite';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { vitePluginStorybookAstroMiddleware } from './viteStorybookAstroMiddlewarePlugin.ts';

// Every internal Astro SSR server the plugin creates, in creation order.
const astroServers = vi.hoisted(() => [] as Array<{ close: () => Promise<void> }>);

vi.mock('vite', async (importOriginal) => {
  const actual = await importOriginal<typeof Vite>();
  const { EventEmitter: Emitter } = await import('node:events');

  return {
    ...actual,
    createServer: vi.fn(async () => {
      const astroServer = {
        watcher: new Emitter(),
        pluginContainer: { buildStart: async () => {} },
        ssrLoadModule: async () => ({ handlerFactory: async () => async () => '' }),
        close: vi.fn(async () => {})
      };

      astroServers.push(astroServer);

      return astroServer;
    })
  };
});

vi.mock('./importAstroConfig.ts', () => ({
  importAstroConfig: async () => ({ getViteConfig: () => async () => ({}) })
}));

vi.mock('./loadUserAstroConfig.ts', () => ({
  appendUserVitePlugins: () => {},
  loadUserAstroCompileOptions: async () => ({}),
  loadUserAstroIntegrations: async () => [],
  loadUserAstroVitePlugins: async () => []
}));

/** A Storybook or Vitest dev server, with the client and SSR environments Vite gives it. */
function devServer() {
  return {
    environments: { client: { name: 'client' }, ssr: { name: 'ssr' } },
    watcher: new EventEmitter(),
    ws: { on: () => {}, send: () => {} }
  } as unknown as ViteDevServer;
}

/** What Vite does as a dev server closes: closeBundle once for each of its environments. */
async function closeDevServer(
  plugin: Awaited<ReturnType<typeof vitePluginStorybookAstroMiddleware>>['vitePlugin'],
  server: ViteDevServer
) {
  for (const environment of Object.values(server.environments)) {
    await plugin.closeBundle.call({ environment } as never);
  }
}

beforeEach(() => {
  astroServers.length = 0;
});

describe('closing the internal Astro server', () => {
  test('addon-vitest starts two dev servers, and closing both closes both Astro servers (#312)', async () => {
    const { vitePlugin } = await vitePluginStorybookAstroMiddleware({ resolveFrom: '/project' });
    const projectServer = devServer();
    const browserServer = devServer();

    await vitePlugin.configureServer(projectServer);
    await vitePlugin.configureServer(browserServer);
    expect(astroServers).toHaveLength(2);

    await closeDevServer(vitePlugin, browserServer);
    await closeDevServer(vitePlugin, projectServer);

    expect(astroServers[0].close).toHaveBeenCalledTimes(1);
    expect(astroServers[1].close).toHaveBeenCalledTimes(1);
  });

  test('closing one dev server leaves the other one rendering', async () => {
    const { vitePlugin } = await vitePluginStorybookAstroMiddleware({ resolveFrom: '/project' });
    const projectServer = devServer();
    const browserServer = devServer();

    await vitePlugin.configureServer(projectServer);
    await vitePlugin.configureServer(browserServer);
    await closeDevServer(vitePlugin, projectServer);

    expect(astroServers[0].close).toHaveBeenCalledTimes(1);
    expect(astroServers[1].close).not.toHaveBeenCalled();
  });

  test('a Storybook build never started an Astro server, so there is nothing to close', async () => {
    const { vitePlugin } = await vitePluginStorybookAstroMiddleware({ resolveFrom: '/project' });

    await expect(
      vitePlugin.closeBundle.call({ environment: { name: 'client' } } as never)
    ).resolves.toBeUndefined();
  });
});

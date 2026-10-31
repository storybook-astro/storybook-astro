import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test, vi } from 'vitest';
import { createPathStoryModuleMock, withStoryModuleMocks } from './module-mocks.ts';
import { createStorybookBrowserStubPlugin, createStorySsrViteServer } from './storySsrVite.ts';

type HookFn = (id: string) => unknown;

/** Calls a Vite resolveId/load hook regardless of whether it's a function or an object hook. */
function callHook(hook: unknown, id: string) {
  const handler = (typeof hook === 'function' ? hook : (hook as { handler: HookFn }).handler) as HookFn;

  return handler.call({}, id);
}

describe('createStorySsrViteServer', () => {
  test('receives vite plugins declared in the project astro.config', async () => {
    // The fixture must live inside the package (not the OS tmpdir) so that
    // `importAstroConfig` can resolve `astro/config` by walking up from it.
    const packageDir = fileURLToPath(new URL('..', import.meta.url));
    const fixtureDir = await mkdtemp(join(packageDir, '.vitest-ssr-fixture-'));

    try {
      await writeFile(
        join(fixtureDir, 'package.json'),
        JSON.stringify({ name: 'ssr-fixture', type: 'module', private: true })
      );
      await writeFile(
        join(fixtureDir, 'astro.config.mjs'),
        `export default { vite: { plugins: [{ name: 'user-test-plugin' }] } };`
      );

      const viteServer = await createStorySsrViteServer({
        integrations: [],
        trackedSpecifiers: new Set(),
        resolveFrom: fixtureDir
      });

      try {
        const pluginNames = viteServer.config.plugins.map((plugin) => plugin.name);

        expect(pluginNames).toContain('user-test-plugin');
      } finally {
        await viteServer.close();
      }
    } finally {
      await rm(fixtureDir, { recursive: true, force: true });
    }
  }, 60_000);

  test('loads the integrations declared in the project astro.config, as dev does (issue #226)', async () => {
    const packageDir = fileURLToPath(new URL('..', import.meta.url));
    const fixtureDir = await mkdtemp(join(packageDir, '.vitest-ssr-fixture-'));

    try {
      await writeFile(
        join(fixtureDir, 'package.json'),
        JSON.stringify({ name: 'ssr-fixture', type: 'module', private: true })
      );
      await writeFile(
        join(fixtureDir, 'astro.config.mjs'),
        `export default {
          integrations: [{
            name: 'user-integration',
            hooks: {
              'astro:config:setup': ({ updateConfig }) => {
                updateConfig({ vite: { plugins: [{ name: 'from-user-integration' }] } });
              }
            }
          }]
        };`
      );

      const viteServer = await createStorySsrViteServer({
        integrations: [],
        trackedSpecifiers: new Set(),
        resolveFrom: fixtureDir
      });

      try {
        expect(viteServer.config.plugins.map((plugin) => plugin.name)).toContain('from-user-integration');
      } finally {
        await viteServer.close();
      }
    } finally {
      await rm(fixtureDir, { recursive: true, force: true });
    }
  }, 60_000);

  test('still starts, without the project\'s integrations, when one fails to set up', async () => {
    const packageDir = fileURLToPath(new URL('..', import.meta.url));
    const fixtureDir = await mkdtemp(join(packageDir, '.vitest-ssr-fixture-'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      await writeFile(
        join(fixtureDir, 'package.json'),
        JSON.stringify({ name: 'ssr-fixture', type: 'module', private: true })
      );
      // Like a deployed render server's snapshot, which lacks files a hook expects.
      await writeFile(
        join(fixtureDir, 'astro.config.mjs'),
        `export default {
          integrations: [{
            name: 'needs-missing-file',
            hooks: {
              'astro:config:setup': () => {
                throw new Error('ENOENT: content.config.ts');
              }
            }
          }]
        };`
      );

      const viteServer = await createStorySsrViteServer({
        integrations: [],
        trackedSpecifiers: new Set(),
        resolveFrom: fixtureDir
      });

      await viteServer.close();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('An astro.config integration failed to set up'),
        expect.stringContaining('ENOENT: content.config.ts')
      );
    } finally {
      warn.mockRestore();
      await rm(fixtureDir, { recursive: true, force: true });
    }
  }, 60_000);

  test('compiles components with the project\'s scopedStyleStrategy (issue #226)', async () => {
    const packageDir = fileURLToPath(new URL('..', import.meta.url));
    const fixtureDir = await mkdtemp(join(packageDir, '.vitest-ssr-fixture-'));

    try {
      await writeFile(
        join(fixtureDir, 'package.json'),
        JSON.stringify({ name: 'ssr-fixture', type: 'module', private: true })
      );
      await writeFile(join(fixtureDir, 'astro.config.mjs'), `export default { scopedStyleStrategy: 'class' };`);
      await writeFile(join(fixtureDir, 'Card.astro'), '<div class="card"></div>\n<style>.card { color: red; }</style>\n');

      const viteServer = await createStorySsrViteServer({
        integrations: [],
        trackedSpecifiers: new Set(),
        resolveFrom: fixtureDir
      });

      try {
        const cardPath = join(fixtureDir, 'Card.astro');

        await viteServer.ssrLoadModule(cardPath);
        const { default: css } = (await viteServer.ssrLoadModule(
          `${cardPath}?astro&type=style&index=0&inline&lang.css`
        )) as { default: string };

        // The default `attribute` strategy scopes with `[data-astro-cid-…]`.
        expect(css).toMatch(/\.card\.astro-\w+/);
      } finally {
        await viteServer.close();
      }
    } finally {
      await rm(fixtureDir, { recursive: true, force: true });
    }
  }, 60_000);

  test('turns off the client dependency optimizer, even after integrations add to it (issue #184)', async () => {
    const packageDir = fileURLToPath(new URL('..', import.meta.url));
    const fixtureDir = await mkdtemp(join(packageDir, '.vitest-ssr-fixture-'));

    try {
      await writeFile(
        join(fixtureDir, 'package.json'),
        JSON.stringify({ name: 'ssr-fixture', type: 'module', private: true })
      );
      // Framework integrations (React, Svelte, …) list their client deps from
      // a `config` hook, which runs after the server's inline config.
      await writeFile(
        join(fixtureDir, 'astro.config.mjs'),
        `export default { vite: { plugins: [{
          name: 'adds-client-deps',
          config: () => ({ optimizeDeps: { include: ['react'] } })
        }] } };`
      );

      const viteServer = await createStorySsrViteServer({
        integrations: [],
        trackedSpecifiers: new Set(),
        resolveFrom: fixtureDir
      });

      try {
        const { optimizeDeps } = viteServer.environments.client.config;

        expect(optimizeDeps.noDiscovery).toBe(true);
        expect(optimizeDeps.include).toEqual([]);
      } finally {
        await viteServer.close();
      }
    } finally {
      await rm(fixtureDir, { recursive: true, force: true });
    }
  }, 60_000);

  test('lets a storyRules mock replace astro:content, as dev does (issue #194)', async () => {
    const packageDir = fileURLToPath(new URL('..', import.meta.url));
    const fixtureDir = await mkdtemp(join(packageDir, '.vitest-ssr-fixture-'));
    const stubPath = join(fixtureDir, 'astro-content-stub.ts');

    try {
      await writeFile(
        join(fixtureDir, 'package.json'),
        JSON.stringify({ name: 'ssr-fixture', type: 'module', private: true })
      );
      await writeFile(stubPath, 'export const getEntry = async () => ({ data: {} });');

      const viteServer = await createStorySsrViteServer({
        integrations: [],
        trackedSpecifiers: new Set(),
        resolveFrom: fixtureDir
      });

      try {
        const resolved = await withStoryModuleMocks(
          new Map([['astro:content', createPathStoryModuleMock(stubPath)]]),
          () => viteServer.pluginContainer.resolveId('astro:content')
        );

        expect(resolved?.id).toBe(stubPath);
      } finally {
        await viteServer.close();
      }
    } finally {
      await rm(fixtureDir, { recursive: true, force: true });
    }
  }, 60_000);
});

describe('createStorybookBrowserStubPlugin', () => {
  test('stubs @storybook/preview with a working CSF4 factory', async () => {
    const plugin = createStorybookBrowserStubPlugin();

    const resolved = callHook(plugin.resolveId, '@storybook/preview');
    const source = callHook(plugin.load, resolved) as string;

    // The stub must run as a real module: prerendering loads it to read each
    // story's component and args, so evaluate the emitted source and exercise it.
    const previewModule = await import(`data:text/javascript,${encodeURIComponent(source)}`);
    const component = () => '';
    const meta = previewModule.default.meta({ component, args: { size: 'lg' } });
    const story = meta.story({ args: { label: 'Primary' } });

    expect(story._tag).toBe('Story');
    expect(story.input).toEqual({ args: { label: 'Primary' } });
    expect(story.meta.input.component).toBe(component);
    expect(story.meta.input.args).toEqual({ size: 'lg' });
  });

  test('stubs the browser-only docs packages', () => {
    const plugin = createStorybookBrowserStubPlugin();

    for (const specifier of [
      '@storybook/addon-docs',
      '@storybook/addon-docs/blocks',
      '@storybook/blocks'
    ]) {
      const resolved = callHook(plugin.resolveId, specifier);

      expect(resolved).toBeTruthy();
      expect(callHook(plugin.load, resolved)).toContain('export default');
    }
  });

  test('leaves unrelated specifiers untouched', () => {
    const plugin = createStorybookBrowserStubPlugin();

    expect(callHook(plugin.resolveId, '@storybook/addon-a11y')).toBeNull();
    expect(callHook(plugin.resolveId, 'astro/runtime/server/index.js')).toBeNull();
  });
});

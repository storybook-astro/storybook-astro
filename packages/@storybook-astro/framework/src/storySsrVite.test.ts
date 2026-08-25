import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
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

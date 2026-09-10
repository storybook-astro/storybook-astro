import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { Plugin, PluginOption } from 'vite';
import {
  appendUserVitePlugins,
  loadUserAstroFonts,
  loadUserAstroIntegrations,
  loadUserAstroVitePlugins,
  loadUserAstroViteResolveAlias,
  mergeFrameworkAndUserIntegrations
} from './loadUserAstroConfig.ts';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'storybook-astro-user-config-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

async function writeConfig(body: string) {
  await writeFile(join(tmpDir, 'astro.config.mjs'), body);
}

describe('loadUserAstroFonts', () => {
  test('returns the fonts array from astro.config.*', async () => {
    await writeConfig(`
      export default {
        fonts: [
          {
            provider: { name: 'fake', resolveFont: () => undefined },
            name: 'Inter',
            cssVariable: '--font-inter'
          },
          {
            provider: { name: 'fake', resolveFont: () => undefined },
            name: 'Roboto',
            cssVariable: '--font-roboto'
          }
        ]
      };
    `);

    const fonts = await loadUserAstroFonts(tmpDir);

    expect(fonts).toHaveLength(2);
    expect(fonts.map((f) => f.cssVariable)).toEqual(['--font-inter', '--font-roboto']);
  });

  test('returns [] when astro.config.* has no fonts', async () => {
    await writeConfig(`export default { integrations: [] };`);

    expect(await loadUserAstroFonts(tmpDir)).toEqual([]);
  });

  test('returns [] when no astro.config.* is present', async () => {
    expect(await loadUserAstroFonts(tmpDir)).toEqual([]);
  });

  test('drops entries missing required font-family fields', async () => {
    await writeConfig(`
      export default {
        fonts: [
          { provider: { name: 'fake', resolveFont: () => undefined }, name: 'Inter', cssVariable: '--font-inter' },
          { name: 'NoProvider', cssVariable: '--font-x' },
          'not-an-object'
        ]
      };
    `);

    const fonts = await loadUserAstroFonts(tmpDir);

    expect(fonts).toHaveLength(1);
    expect(fonts[0].cssVariable).toBe('--font-inter');
  });
});

describe('loadUserAstroVitePlugins', () => {
  test('returns plugins from vite.plugins', async () => {
    await writeConfig(`
      export default {
        vite: {
          plugins: [
            { name: 'tailwindcss', enforce: 'pre' },
            { name: 'unocss/vite' }
          ]
        }
      };
    `);

    const plugins = await loadUserAstroVitePlugins(tmpDir);

    expect(plugins.map((p) => p.name)).toEqual(['tailwindcss', 'unocss/vite']);
  });

  test('flattens nested plugin arrays', async () => {
    await writeConfig(`
      export default {
        vite: {
          plugins: [
            [{ name: 'a' }, { name: 'b' }],
            { name: 'c' }
          ]
        }
      };
    `);

    const plugins = await loadUserAstroVitePlugins(tmpDir);

    expect(plugins.map((p) => p.name)).toEqual(['a', 'b', 'c']);
  });

  test('returns [] when vite.plugins is missing', async () => {
    await writeConfig(`export default { vite: {} };`);

    expect(await loadUserAstroVitePlugins(tmpDir)).toEqual([]);
  });

  test('drops entries without a name', async () => {
    await writeConfig(`
      export default {
        vite: {
          plugins: [{ name: 'real' }, false, null, undefined, { foo: 'bar' }]
        }
      };
    `);

    const plugins = await loadUserAstroVitePlugins(tmpDir);

    expect(plugins.map((p) => p.name)).toEqual(['real']);
  });
});

describe('appendUserVitePlugins', () => {
  function pluginNames(plugins: PluginOption[] | undefined): string[] {
    return (((plugins ?? []) as unknown[]).flat(Infinity) as Plugin[]).map((p) => p.name);
  }

  test('appends plugins loaded from astro.config to a pipeline Vite config', async () => {
    await writeConfig(`
      export default {
        vite: {
          plugins: [{ name: 'vite-svg-loader' }]
        }
      };
    `);

    const config: { plugins?: PluginOption[] } = { plugins: [{ name: 'astro:build' }] };
    const appended = appendUserVitePlugins(config, await loadUserAstroVitePlugins(tmpDir));

    expect(appended.map((p) => p.name)).toEqual(['vite-svg-loader']);
    expect(pluginNames(config.plugins)).toEqual(['astro:build', 'vite-svg-loader']);
  });

  test('skips plugins already registered under the same name, even in nested arrays', () => {
    const config: { plugins?: PluginOption[] } = {
      plugins: [[{ name: 'vite-svg-loader' }], { name: 'astro:build' }]
    };

    const appended = appendUserVitePlugins(config, [
      { name: 'vite-svg-loader' },
      { name: 'my-i18n-plugin' }
    ]);

    expect(appended.map((p) => p.name)).toEqual(['my-i18n-plugin']);
    expect(pluginNames(config.plugins)).toEqual([
      'vite-svg-loader',
      'astro:build',
      'my-i18n-plugin'
    ]);
  });

  test('initializes plugins when the config has none', () => {
    const config: { plugins?: PluginOption[] } = {};

    appendUserVitePlugins(config, [{ name: 'vite-svg-loader' }]);

    expect(pluginNames(config.plugins)).toEqual(['vite-svg-loader']);
  });

  test('leaves the config untouched when there are no user plugins', () => {
    const plugins: PluginOption[] = [{ name: 'astro:build' }];
    const config = { plugins };

    expect(appendUserVitePlugins(config, [])).toEqual([]);
    expect(config.plugins).toBe(plugins);
  });
});

describe('loadUserAstroVitePlugins', () => {
  test('hands every render pipeline its own plugin instances', async () => {
    // Each pipeline registers these plugins with a different Vite instance,
    // and in dev two of those servers are live at once. Sharing one stateful
    // plugin object between them lets whichever server resolved last win.
    await writeConfig(`
      export default {
        vite: {
          plugins: [{ name: 'vite-svg-loader', cache: new Map() }]
        }
      };
    `);

    const [forDevServer] = await loadUserAstroVitePlugins(tmpDir);
    const [forIslandBuild] = await loadUserAstroVitePlugins(tmpDir);

    expect(forDevServer.name).toBe('vite-svg-loader');
    expect(forIslandBuild.name).toBe('vite-svg-loader');
    expect(forIslandBuild).not.toBe(forDevServer);
    expect(
      (forIslandBuild as unknown as { cache: Map<string, string> }).cache
    ).not.toBe((forDevServer as unknown as { cache: Map<string, string> }).cache);
  });
});

describe('loadUserAstroIntegrations (regression)', () => {
  test('still picks up integrations after the refactor', async () => {
    await writeConfig(`
      export default {
        integrations: [
          { name: 'astro-icon', hooks: {} },
          { name: 'unocss/astro', hooks: {} }
        ]
      };
    `);

    const integrations = await loadUserAstroIntegrations(tmpDir);

    expect(integrations.map((i) => i.name)).toEqual(['astro-icon', 'unocss/astro']);
  });
});

describe('loadUserAstroViteResolveAlias', () => {
  test('returns the vite.resolve.alias object from astro.config.*', async () => {
    await writeConfig(`
      export default {
        vite: { resolve: { alias: { '~': '/repo/src' } } }
      };
    `);

    expect(await loadUserAstroViteResolveAlias(tmpDir)).toEqual({ '~': '/repo/src' });
  });

  test('passes through the array form untouched', async () => {
    await writeConfig(`
      export default {
        vite: { resolve: { alias: [{ find: '~', replacement: '/repo/src' }] } }
      };
    `);

    expect(await loadUserAstroViteResolveAlias(tmpDir)).toEqual([
      { find: '~', replacement: '/repo/src' }
    ]);
  });

  test('returns undefined when no alias is configured', async () => {
    await writeConfig(`export default { vite: {} };`);

    expect(await loadUserAstroViteResolveAlias(tmpDir)).toBeUndefined();
  });

  test('returns undefined for an empty alias object', async () => {
    await writeConfig(`export default { vite: { resolve: { alias: {} } } };`);

    expect(await loadUserAstroViteResolveAlias(tmpDir)).toBeUndefined();
  });
});

describe('mergeFrameworkAndUserIntegrations', () => {
  test('appends user integrations that the framework did not already load', async () => {
    await writeConfig(`
      export default {
        integrations: [
          { name: 'astro-icon', hooks: {} },
          { name: '@astrojs/preact', hooks: {} }
        ]
      };
    `);

    const frameworkIntegrations = [{ name: '@astrojs/preact', hooks: {} }];
    const merged = await mergeFrameworkAndUserIntegrations(
      frameworkIntegrations as never[],
      tmpDir
    );

    expect(merged.map((integration) => integration.name)).toEqual([
      '@astrojs/preact',
      'astro-icon'
    ]);
    // The framework's instance wins over the user's duplicate.
    expect(merged[0]).toBe(frameworkIntegrations[0]);
  });

  test('returns only framework integrations when no astro.config.* exists', async () => {
    const frameworkIntegrations = [{ name: '@astrojs/react', hooks: {} }];
    const merged = await mergeFrameworkAndUserIntegrations(
      frameworkIntegrations as never[],
      tmpDir
    );

    expect(merged).toEqual(frameworkIntegrations);
  });
});

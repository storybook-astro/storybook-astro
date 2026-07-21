import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
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

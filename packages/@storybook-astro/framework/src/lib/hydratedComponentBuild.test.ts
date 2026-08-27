import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { buildHydratedComponentAssets } from './hydratedComponentBuild.ts';

describe('buildHydratedComponentAssets', () => {
  test('receives vite plugins declared in the project astro.config', async () => {
    // The fixture must live inside the package (not the OS tmpdir) so that
    // `importAstroConfig` can resolve `astro/config` by walking up from it.
    const packageDir = fileURLToPath(new URL('../..', import.meta.url));
    const fixtureDir = await mkdtemp(join(packageDir, '.vitest-island-fixture-'));
    const outDir = join(fixtureDir, 'out');

    try {
      await writeFile(
        join(fixtureDir, 'package.json'),
        JSON.stringify({ name: 'island-fixture', type: 'module', private: true })
      );
      // The island imports a virtual module that only the user's vite plugin
      // can resolve — the build fails unless the plugin is injected.
      await writeFile(
        join(fixtureDir, 'astro.config.mjs'),
        [
          'const userPlugin = {',
          "  name: 'user-test-plugin',",
          '  resolveId(id) {',
          "    if (id === 'virtual:user-plugin-probe') return '\\0user-plugin-probe';",
          '  },',
          '  load(id) {',
          "    if (id === '\\0user-plugin-probe') return 'export default \"USER_PLUGIN_APPLIED\";';",
          '  }',
          '};',
          'export default { vite: { plugins: [userPlugin] } };'
        ].join('\n')
      );
      await writeFile(
        join(fixtureDir, 'Island.jsx'),
        [
          "import probe from 'virtual:user-plugin-probe';",
          'export default function Island() {',
          '  return probe;',
          '}'
        ].join('\n')
      );
      await writeFile(
        join(fixtureDir, 'Wrapper.astro'),
        ['---', "import Island from './Island.jsx';", '---', '<Island client:load />'].join('\n')
      );

      const assets = await buildHydratedComponentAssets({
        componentPaths: [join(fixtureDir, 'Wrapper.astro')],
        integrations: [],
        resolveFrom: fixtureDir,
        outDir
      });

      const islandPath = join(fixtureDir, 'Island.jsx').replace(/\\/g, '/');
      const chunkRelPath = assets.staticModuleMap[islandPath];

      expect(chunkRelPath).toBeTruthy();

      const chunkCode = await readFile(join(outDir, chunkRelPath), 'utf-8');

      expect(chunkCode).toContain('USER_PLUGIN_APPLIED');
    } finally {
      await rm(fixtureDir, { recursive: true, force: true });
    }
  }, 60_000);
});

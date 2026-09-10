import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, test } from 'vitest';
import { createProductionRenderRuntime, type ProductionRenderRuntime } from './productionRenderRuntime.ts';
import { copyRuntimeSnapshot } from './vitePluginAstroBuildShared.ts';

// End-to-end regression test for issue #136: in server render mode, tsconfig
// path aliases (`~/*`) must survive the full pipeline — the snapshot copier
// has to copy alias-reachable files, and the render server's Vite SSR graph
// has to resolve them against the snapshot's own tsconfig. This boots the real
// production runtime (Vite SSR server + Astro Container), so it is slower than
// the unit suites.
//
// The fixture lives inside the framework package (not os.tmpdir()) so that
// `astro`, tsconfig `extends` targets, and Vite internals resolve via normal
// node_modules walk-up from the fixture directory.

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));

let fixtureDir: string | undefined;
let runtime: ProductionRenderRuntime | undefined;

afterEach(async () => {
  await runtime?.close();
  runtime = undefined;

  if (fixtureDir) {
    await rm(fixtureDir, { recursive: true, force: true });
    fixtureDir = undefined;
  }
});

async function writeFixtureFile(relativePath: string, content: string) {
  const filePath = join(fixtureDir!, relativePath);

  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content);

  return filePath;
}

describe('server-mode rendering with tsconfig path aliases (issue #136)', () => {
  test(
    'renders a snapshot component whose module graph uses ~/* imports',
    { timeout: 120_000 },
    async () => {
      fixtureDir = await mkdtemp(join(packageDir, '.alias-e2e-fixture-'));

      // The user's repo: the exact #136 repro — a component that imports both
      // a relative .astro child and an aliased module, where the child also
      // imports the aliased module.
      await writeFixtureFile('repo/package.json', JSON.stringify({ type: 'module' }));
      await writeFixtureFile(
        'repo/tsconfig.json',
        JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '~/*': ['src/*'] } } })
      );
      await writeFixtureFile(
        'repo/src/styles/tokens.ts',
        `export const brand = '#5b3df5';`
      );
      await writeFixtureFile(
        'repo/src/components/Inner.astro',
        [
          '---',
          `import { brand } from '~/styles/tokens';`,
          '---',
          `<span style={\`color:\${brand}\`}>inner rendered</span>`
        ].join('\n')
      );
      const outerPath = await writeFixtureFile(
        'repo/src/components/Outer.astro',
        [
          '---',
          `import { brand } from '~/styles/tokens';`,
          `import Inner from './Inner.astro';`,
          '---',
          `<div style={\`border-color:\${brand}\`}>`,
          '  <Inner />',
          '</div>'
        ].join('\n')
      );

      // Build time: copy the runtime snapshot exactly as vitePluginAstroBuildServer does.
      const snapshotRoot = join(fixtureDir, 'storybook-server', 'project');

      await copyRuntimeSnapshot({
        resolveFrom: join(fixtureDir, 'repo'),
        snapshotRoot,
        snapshotDirName: 'project',
        astroComponents: [outerPath]
      });

      // The alias-only-reachable module must be in the snapshot.
      await expect(stat(join(snapshotRoot, 'src/styles/tokens.ts'))).resolves.toBeTruthy();
      await expect(stat(join(snapshotRoot, 'src/components/Inner.astro'))).resolves.toBeTruthy();
      await expect(stat(join(snapshotRoot, 'tsconfig.json'))).resolves.toBeTruthy();

      // Runtime: the deployed render server boots against the snapshot only —
      // resolution must not leak back into the original repo/ tree.
      runtime = await createProductionRenderRuntime({
        integrations: [],
        staticModuleMap: {},
        trackedSpecifiers: new Set(),
        resolveFrom: snapshotRoot
      });

      const html = await runtime.renderAstroStory({
        component: join(snapshotRoot, 'src/components/Outer.astro'),
        args: {},
        slots: {}
      });

      expect(html).toContain('inner rendered');
      expect(html).toContain('#5b3df5');
    }
  );
});

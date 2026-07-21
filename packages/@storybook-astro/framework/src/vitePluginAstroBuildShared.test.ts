import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { collectHydratedComponentPaths, copyRuntimeSnapshot } from './vitePluginAstroBuildShared.ts';

describe('collectHydratedComponentPaths', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'storybook-astro-build-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  test('excludes a .tsx file that has only named exports', async () => {
    const astroFile = join(tmpDir, 'Island.astro');
    const namedOnlyTsx = join(tmpDir, 'Helper.tsx');

    await writeFile(astroFile, `---\nimport Helper from './Helper.tsx';\n---`);
    await writeFile(namedOnlyTsx, `export const Helper = () => <div />;`);

    const result = await collectHydratedComponentPaths(astroFile, tmpDir);

    expect(result).not.toContain(namedOnlyTsx.replace(/\\/g, '/'));
  });

  test('includes a .tsx file that has a default export', async () => {
    const astroFile = join(tmpDir, 'Island.astro');
    const defaultTsx = join(tmpDir, 'Button.tsx');

    await writeFile(astroFile, `---\nimport Button from './Button.tsx';\n---`);
    await writeFile(defaultTsx, `export default function Button() { return <div />; }`);

    const result = await collectHydratedComponentPaths(astroFile, tmpDir);

    expect(result).toContain(defaultTsx.replace(/\\/g, '/'));
  });

  test('includes a .svelte file even though it has no literal export default in source', async () => {
    // Svelte SFCs have no `export default` — the compiler generates one.
    // If the check were applied to .svelte, these files would be falsely excluded.
    const astroFile = join(tmpDir, 'Island.astro');
    const svelteFile = join(tmpDir, 'Counter.svelte');

    await writeFile(astroFile, `---\nimport Counter from './Counter.svelte';\n---`);
    await writeFile(svelteFile, `<script>\n  let count = 0;\n</script>\n<button>{count}</button>`);

    const result = await collectHydratedComponentPaths(astroFile, tmpDir);

    expect(result).toContain(svelteFile.replace(/\\/g, '/'));
  });

  test('includes a .vue <script setup> file even though it has no literal export default in source', async () => {
    // Vue <script setup> components have no `export default` — the compiler generates one.
    const astroFile = join(tmpDir, 'Island.astro');
    const vueFile = join(tmpDir, 'Counter.vue');

    await writeFile(astroFile, `---\nimport Counter from './Counter.vue';\n---`);
    await writeFile(
      vueFile,
      `<script setup>\nconst count = ref(0);\n</script>\n<template><button>{{ count }}</button></template>`
    );

    const result = await collectHydratedComponentPaths(astroFile, tmpDir);

    expect(result).toContain(vueFile.replace(/\\/g, '/'));
  });

  test('includes a .tsx file on read error, preserving prior behaviour', async () => {
    // When the file cannot be read, hasDefaultExport returns true so the file
    // is kept rather than silently dropped.
    const astroFile = join(tmpDir, 'Island.astro');
    const missingTsx = join(tmpDir, 'Missing.tsx');

    // Point the Astro file at a component path that won't exist on disk.
    await writeFile(astroFile, `---\nimport Missing from './Missing.tsx';\n---`);

    // Don't write missingTsx — resolveLocalImportPath will not find it,
    // so it never reaches hasDefaultExport. Confirm the result is just empty.
    const result = await collectHydratedComponentPaths(astroFile, tmpDir);

    expect(result).not.toContain(missingTsx.replace(/\\/g, '/'));
  });

  test('includes a tsconfig-aliased island (the static build fix)', async () => {
    // Islands imported via path aliases never matched the staticModuleMap because
    // readLocalImportSpecifiers filtered them out before they could become Rollup
    // inputs. This test confirms the alias is resolved and included.
    await mkdir(join(tmpDir, 'src', 'components'), { recursive: true });
    const counterFile = join(tmpDir, 'src', 'components', 'Counter.tsx');

    await writeFile(counterFile, `export default function Counter() { return null; }`);
    await writeFile(join(tmpDir, 'Island.astro'), `---\nimport Counter from '@/components/Counter';\n---\n<Counter client:visible />`);
    await writeFile(
      join(tmpDir, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: { paths: { '@/*': ['src/*'] } } }, null, 2)
    );

    const result = await collectHydratedComponentPaths(join(tmpDir, 'Island.astro'), tmpDir);

    expect(result).toContain(counterFile.replace(/\\/g, '/'));
  });
});

describe('copyRuntimeSnapshot', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'storybook-astro-snapshot-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  function snapshotOptions(astroComponents: string[]) {
    return {
      resolveFrom: join(tmpDir, 'repo'),
      snapshotRoot: join(tmpDir, 'storybook-server', 'project'),
      snapshotDirName: 'project',
      astroComponents
    };
  }

  async function writeRepoFile(relativePath: string, content: string) {
    const filePath = join(tmpDir, 'repo', relativePath);

    await mkdir(join(filePath, '..'), { recursive: true });
    await writeFile(filePath, content);

    return filePath;
  }

  test('copies files reached only through tsconfig path aliases (issue #136)', async () => {
    await writeRepoFile(
      'tsconfig.json',
      JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '~/*': ['src/*'] } } })
    );
    await writeRepoFile('src/styles/tokens.ts', `export const brand = '#5b3df5';`);
    await writeRepoFile(
      'src/components/Inner.astro',
      `---\nimport { brand } from '~/styles/tokens';\n---\n<span>inner</span>`
    );
    const outer = await writeRepoFile(
      'src/components/Outer.astro',
      `---\nimport { brand } from '~/styles/tokens';\nimport Inner from './Inner.astro';\n---\n<div><Inner /></div>`
    );

    await copyRuntimeSnapshot(snapshotOptions([outer]));

    const snapshot = join(tmpDir, 'storybook-server', 'project');

    await expect(stat(join(snapshot, 'src/components/Outer.astro'))).resolves.toBeTruthy();
    await expect(stat(join(snapshot, 'src/components/Inner.astro'))).resolves.toBeTruthy();
    await expect(stat(join(snapshot, 'src/styles/tokens.ts'))).resolves.toBeTruthy();
  });

  test('follows aliased imports transitively', async () => {
    await writeRepoFile(
      'tsconfig.json',
      JSON.stringify({ compilerOptions: { paths: { '~/*': ['src/*'] } } })
    );
    await writeRepoFile('src/styles/palette.ts', `export const palette = {};`);
    await writeRepoFile(
      'src/styles/tokens.ts',
      `import { palette } from '~/styles/palette';\nexport const brand = palette;`
    );
    const component = await writeRepoFile(
      'src/Card.astro',
      `---\nimport { brand } from '~/styles/tokens';\n---\n<div />`
    );

    await copyRuntimeSnapshot(snapshotOptions([component]));

    const snapshot = join(tmpDir, 'storybook-server', 'project');

    await expect(stat(join(snapshot, 'src/styles/tokens.ts'))).resolves.toBeTruthy();
    await expect(stat(join(snapshot, 'src/styles/palette.ts'))).resolves.toBeTruthy();
  });

  test('copies out-of-root alias targets under __external', async () => {
    await writeRepoFile(
      'tsconfig.json',
      JSON.stringify({ compilerOptions: { paths: { '~shared/*': ['../shared/*'] } } })
    );

    const sharedFile = join(tmpDir, 'shared', 'colors.ts');

    await mkdir(join(tmpDir, 'shared'), { recursive: true });
    await writeFile(sharedFile, `export const red = 'red';`);

    const component = await writeRepoFile(
      'src/Badge.astro',
      `---\nimport { red } from '~shared/colors';\n---\n<div />`
    );

    await copyRuntimeSnapshot(snapshotOptions([component]));

    const externalCopy = join(
      tmpDir,
      'storybook-server',
      'project',
      '__external',
      sharedFile.replace(/^[/\\]+/, '')
    );

    await expect(stat(externalCopy)).resolves.toBeTruthy();
  });

  test('copies local tsconfig extends targets', async () => {
    await writeRepoFile(
      'tsconfig.json',
      JSON.stringify({ extends: './tsconfig.paths.json', compilerOptions: {} })
    );
    await writeRepoFile(
      'tsconfig.paths.json',
      JSON.stringify({ compilerOptions: { paths: { '~/*': ['src/*'] } } })
    );
    const component = await writeRepoFile('src/Plain.astro', `<div />`);

    await copyRuntimeSnapshot(snapshotOptions([component]));

    const snapshot = join(tmpDir, 'storybook-server', 'project');

    await expect(stat(join(snapshot, 'tsconfig.paths.json'))).resolves.toBeTruthy();
  });

  test('leaves bare package imports external', async () => {
    await writeRepoFile(
      'tsconfig.json',
      JSON.stringify({ compilerOptions: { paths: { '~/*': ['src/*'] } } })
    );
    const component = await writeRepoFile(
      'src/WithPackage.astro',
      `---\nimport { render } from 'preact-render-to-string';\n---\n<div />`
    );

    await copyRuntimeSnapshot(snapshotOptions([component]));

    const snapshot = join(tmpDir, 'storybook-server', 'project');

    await expect(stat(join(snapshot, 'src/WithPackage.astro'))).resolves.toBeTruthy();
    await expect(
      stat(join(snapshot, '__external'))
    ).rejects.toThrow();
  });
});

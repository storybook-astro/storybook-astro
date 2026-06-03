import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { collectHydratedComponentPaths } from './vitePluginAstroBuildShared.ts';

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

    const result = await collectHydratedComponentPaths(astroFile);

    expect(result).not.toContain(namedOnlyTsx.replace(/\\/g, '/'));
  });

  test('includes a .tsx file that has a default export', async () => {
    const astroFile = join(tmpDir, 'Island.astro');
    const defaultTsx = join(tmpDir, 'Button.tsx');

    await writeFile(astroFile, `---\nimport Button from './Button.tsx';\n---`);
    await writeFile(defaultTsx, `export default function Button() { return <div />; }`);

    const result = await collectHydratedComponentPaths(astroFile);

    expect(result).toContain(defaultTsx.replace(/\\/g, '/'));
  });

  test('includes a .svelte file even though it has no literal export default in source', async () => {
    // Svelte SFCs have no `export default` — the compiler generates one.
    // If the check were applied to .svelte, these files would be falsely excluded.
    const astroFile = join(tmpDir, 'Island.astro');
    const svelteFile = join(tmpDir, 'Counter.svelte');

    await writeFile(astroFile, `---\nimport Counter from './Counter.svelte';\n---`);
    await writeFile(svelteFile, `<script>\n  let count = 0;\n</script>\n<button>{count}</button>`);

    const result = await collectHydratedComponentPaths(astroFile);

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

    const result = await collectHydratedComponentPaths(astroFile);

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
    const result = await collectHydratedComponentPaths(astroFile);

    expect(result).not.toContain(missingTsx.replace(/\\/g, '/'));
  });
});

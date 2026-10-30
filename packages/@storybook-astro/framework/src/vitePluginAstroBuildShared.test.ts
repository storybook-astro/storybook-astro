import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
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

  test('collects an island declared inside a nested .astro component', async () => {
    // A story's .astro component can compose other .astro components that own
    // the actual islands. Without recursing into nested .astro imports, those
    // islands never become build inputs and their `component-url` stays a raw
    // filesystem path in the prerendered static output (404, no hydration).
    const storyAstro = join(tmpDir, 'Page.astro');
    const nestedAstro = join(tmpDir, 'Section.astro');
    const vueFile = join(tmpDir, 'Counter.vue');

    await writeFile(storyAstro, `---\nimport Section from './Section.astro';\n---\n<Section />`);
    await writeFile(
      nestedAstro,
      `---\nimport Counter from './Counter.vue';\n---\n<Counter client:visible />`
    );
    await writeFile(
      vueFile,
      `<script setup>\nconst count = ref(0);\n</script>\n<template><button>{{ count }}</button></template>`
    );

    const result = await collectHydratedComponentPaths(storyAstro, tmpDir);

    expect(result).toContain(vueFile.replace(/\\/g, '/'));
  });

  test('does not loop on circular .astro imports', async () => {
    const firstAstro = join(tmpDir, 'First.astro');
    const secondAstro = join(tmpDir, 'Second.astro');
    const vueFile = join(tmpDir, 'Counter.vue');

    await writeFile(
      firstAstro,
      `---\nimport Second from './Second.astro';\n---\n<Second />`
    );
    await writeFile(
      secondAstro,
      `---\nimport First from './First.astro';\nimport Counter from './Counter.vue';\n---\n<Counter client:visible />`
    );
    await writeFile(vueFile, `<template><button>hi</button></template>`);

    const result = await collectHydratedComponentPaths(firstAstro, tmpDir);

    expect(result).toContain(vueFile.replace(/\\/g, '/'));
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

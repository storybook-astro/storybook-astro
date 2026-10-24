import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { SolidIntegration } from './solid.ts';

const projects: string[] = [];

/** A project whose only dependency is the given storybook-solidjs-vite manifest. */
async function projectWithStorybookSolid(version: string, exportedSubpaths: string[]) {
  const projectDir = await mkdtemp(join(tmpdir(), 'storybook-astro-solid-'));
  const packageDir = join(projectDir, 'node_modules', 'storybook-solidjs-vite');

  projects.push(projectDir);
  await mkdir(packageDir, { recursive: true });
  await writeFile(
    join(packageDir, 'package.json'),
    JSON.stringify({
      name: 'storybook-solidjs-vite',
      version,
      exports: {
        './package.json': './package.json',
        ...Object.fromEntries(exportedSubpaths.map((subpath) => [subpath, `${subpath}.js`]))
      }
    })
  );
  vi.spyOn(process, 'cwd').mockReturnValue(projectDir);
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(projects.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('SolidIntegration preview entry', () => {
  test('uses renderer/entry-preview on storybook-solidjs-vite 10.0', async () => {
    await projectWithStorybookSolid('10.0.9', ['./renderer', './renderer/entry-preview']);

    expect(new SolidIntegration().storybookEntryPreview).toBe(
      'storybook-solidjs-vite/renderer/entry-preview'
    );
  });

  test('uses the Solid 1 entry, renderer/solid-legacy, on 10.6 and later', async () => {
    await projectWithStorybookSolid('10.7.4', [
      './renderer',
      './renderer/solid-next',
      './renderer/solid-legacy'
    ]);

    expect(new SolidIntegration().storybookEntryPreview).toBe(
      'storybook-solidjs-vite/renderer/solid-legacy'
    );
  });

  test('names the supported versions when the installed one has no browser entry', async () => {
    await projectWithStorybookSolid('10.3.0', ['./renderer']);

    expect(() => new SolidIntegration().storybookEntryPreview).toThrow(
      'storybook-solidjs-vite 10.3.0 has no Solid preview entry'
    );
  });
});

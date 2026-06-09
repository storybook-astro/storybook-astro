import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { resolveAliasedIsland } from './resolve-aliased-island.ts';

describe('resolveAliasedIsland', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'storybook-astro-alias-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  async function writeTsconfig(content: object) {
    await writeFile(join(tmpDir, 'tsconfig.json'), JSON.stringify(content, null, 2));
  }

  test('resolves a basic @/ alias to an absolute path', async () => {
    await mkdir(join(tmpDir, 'src', 'components'), { recursive: true });
    const counterFile = join(tmpDir, 'src', 'components', 'Counter.tsx');
    await writeFile(counterFile, `export default function Counter() {}`);
    await writeTsconfig({
      compilerOptions: {
        paths: { '@/*': ['src/*'] }
      }
    });

    const result = await resolveAliasedIsland('@/components/Counter', tmpDir);

    expect(result).toBe(counterFile.replace(/\\/g, '/'));
  });

  test('resolves when baseUrl shifts the path root', async () => {
    await mkdir(join(tmpDir, 'src', 'components'), { recursive: true });
    const counterFile = join(tmpDir, 'src', 'components', 'Counter.tsx');
    await writeFile(counterFile, `export default function Counter() {}`);
    // With baseUrl: "src", paths are relative to src/
    await writeTsconfig({
      compilerOptions: {
        baseUrl: 'src',
        paths: { '@/*': ['*'] }
      }
    });

    const result = await resolveAliasedIsland('@/components/Counter', tmpDir);

    expect(result).toBe(counterFile.replace(/\\/g, '/'));
  });

  test('falls back to second target when first does not exist on disk', async () => {
    await mkdir(join(tmpDir, 'app', 'components'), { recursive: true });
    const counterFile = join(tmpDir, 'app', 'components', 'Counter.tsx');
    await writeFile(counterFile, `export default function Counter() {}`);
    // First target points at a non-existent dir; second target resolves.
    await writeTsconfig({
      compilerOptions: {
        paths: { '@/*': ['missing/*', 'app/*'] }
      }
    });

    const result = await resolveAliasedIsland('@/components/Counter', tmpDir);

    expect(result).toBe(counterFile.replace(/\\/g, '/'));
  });

  test('resolves an alias with an explicit file extension in the specifier', async () => {
    await mkdir(join(tmpDir, 'src'), { recursive: true });
    const file = join(tmpDir, 'src', 'Button.tsx');
    await writeFile(file, `export default function Button() {}`);
    await writeTsconfig({ compilerOptions: { paths: { '@/*': ['src/*'] } } });

    const result = await resolveAliasedIsland('@/Button.tsx', tmpDir);

    expect(result).toBe(file.replace(/\\/g, '/'));
  });

  test('returns undefined when aliased file does not exist on disk', async () => {
    await writeTsconfig({ compilerOptions: { paths: { '@/*': ['src/*'] } } });

    const result = await resolveAliasedIsland('@/components/Missing', tmpDir);

    expect(result).toBeUndefined();
  });

  test('returns undefined when tsconfig has no paths', async () => {
    await mkdir(join(tmpDir, 'src'), { recursive: true });
    await writeFile(join(tmpDir, 'src', 'Counter.tsx'), `export default function Counter() {}`);
    await writeTsconfig({ compilerOptions: {} });

    const result = await resolveAliasedIsland('@/Counter', tmpDir);

    expect(result).toBeUndefined();
  });

  test('returns undefined when tsconfig.json is absent', async () => {
    const result = await resolveAliasedIsland('@/Counter', tmpDir);

    expect(result).toBeUndefined();
  });

  test('returns undefined for relative specifiers (already handled elsewhere)', async () => {
    const result = await resolveAliasedIsland('./components/Counter', tmpDir);

    expect(result).toBeUndefined();
  });

  test('returns undefined for absolute paths', async () => {
    const result = await resolveAliasedIsland('/abs/path/Counter.tsx', tmpDir);

    expect(result).toBeUndefined();
  });

  test('returns undefined for virtual: specifiers', async () => {
    const result = await resolveAliasedIsland('virtual:astro-container-renderers', tmpDir);

    expect(result).toBeUndefined();
  });

  test('returns undefined for astro: specifiers', async () => {
    const result = await resolveAliasedIsland('astro:scripts/page.js', tmpDir);

    expect(result).toBeUndefined();
  });

  test('returns undefined for /@fs/ specifiers', async () => {
    const result = await resolveAliasedIsland('/@fs/abs/path/Counter.tsx', tmpDir);

    expect(result).toBeUndefined();
  });

  test('resolves a custom alias prefix (not @/)', async () => {
    await mkdir(join(tmpDir, 'src'), { recursive: true });
    const file = join(tmpDir, 'src', 'Widget.vue');
    await writeFile(file, `<template><div /></template>`);
    await writeTsconfig({ compilerOptions: { paths: { '~/*': ['src/*'] } } });

    const result = await resolveAliasedIsland('~/Widget', tmpDir);

    expect(result).toBe(file.replace(/\\/g, '/'));
  });
});

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { vitePluginTsconfigAliases } from './vitePluginTsconfigAliases.ts';

type ResolveIdFn = (id: string, importer?: string) => Promise<string | null>;

/** Calls a Vite resolveId hook regardless of whether it's a function or an object hook. */
function callResolveId(hook: unknown, id: string, importer?: string) {
  const handler = (
    typeof hook === 'function' ? hook : (hook as { handler: ResolveIdFn }).handler
  ) as ResolveIdFn;

  return handler.call({}, id, importer);
}

describe('vitePluginTsconfigAliases', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'storybook-astro-alias-plugin-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  async function writeProject() {
    await mkdir(join(tmpDir, 'src', 'styles'), { recursive: true });
    await writeFile(
      join(tmpDir, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '~/*': ['src/*'] } } })
    );

    const tokensFile = join(tmpDir, 'src', 'styles', 'tokens.ts');

    await writeFile(tokensFile, `export const brand = '#5b3df5';`);

    const importer = join(tmpDir, 'src', 'Component.astro');

    await writeFile(importer, `---\nimport { brand } from '~/styles/tokens';\n---`);

    return { tokensFile, importer };
  }

  test('resolves an aliased id from an importer inside the project', async () => {
    const { tokensFile, importer } = await writeProject();
    const plugin = vitePluginTsconfigAliases(tmpDir);

    const resolved = await callResolveId(plugin.resolveId, '~/styles/tokens', importer);

    expect(resolved).toBe(tokensFile.replace(/\\/g, '/'));
  });

  test('falls back to the project root when the importer is virtual', async () => {
    const { tokensFile } = await writeProject();
    const plugin = vitePluginTsconfigAliases(tmpDir);

    const resolved = await callResolveId(
      plugin.resolveId,
      '~/styles/tokens',
      '\0virtual:astro-component-module/foo'
    );

    expect(resolved).toBe(tokensFile.replace(/\\/g, '/'));
  });

  test('returns null for relative and absolute ids', async () => {
    const { importer } = await writeProject();
    const plugin = vitePluginTsconfigAliases(tmpDir);

    expect(await callResolveId(plugin.resolveId, './styles/tokens', importer)).toBeNull();
    expect(await callResolveId(plugin.resolveId, '/abs/tokens.ts', importer)).toBeNull();
  });

  test('returns null for bare package ids', async () => {
    const { importer } = await writeProject();
    const plugin = vitePluginTsconfigAliases(tmpDir);

    expect(await callResolveId(plugin.resolveId, 'preact/hooks', importer)).toBeNull();
  });

  test('returns null when the alias target does not exist', async () => {
    const { importer } = await writeProject();
    const plugin = vitePluginTsconfigAliases(tmpDir);

    expect(await callResolveId(plugin.resolveId, '~/styles/missing', importer)).toBeNull();
  });
});

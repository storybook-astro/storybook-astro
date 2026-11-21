import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createServer, createServerModuleRunnerTransport, type ViteDevServer } from 'vite';
import { createDefaultImportMeta, ESModulesEvaluator, ModuleRunner } from 'vite/module-runner';
import { importAstroConfig } from './importAstroConfig.ts';

type ImportAstroConfigModule = { importAstroConfig: typeof importAstroConfig };

let projectDir: string;

beforeEach(async () => {
  projectDir = await mkdtemp(join(tmpdir(), 'storybook-astro-import-config-'));
});

afterEach(async () => {
  await rm(projectDir, { recursive: true, force: true });
});

async function installFakeAstro(configSource: string) {
  const astroDir = join(projectDir, 'node_modules', 'astro');

  await mkdir(astroDir, { recursive: true });
  await writeFile(
    join(astroDir, 'package.json'),
    JSON.stringify({ name: 'astro', type: 'module', exports: { './config': './config.js' } })
  );
  await writeFile(join(astroDir, 'config.js'), configSource);
}

// Astro 7.4.9+'s markdown plugin calls import.meta.resolve when astro/config loads.
const configCallingImportMetaResolve = `
  const configUrl = import.meta.resolve('./config.js');
  export function getViteConfig() {
    return configUrl;
  }
`;

describe('importAstroConfig', () => {
  test('loads an astro/config that calls import.meta.resolve at the top level', async () => {
    await installFakeAstro(configCallingImportMetaResolve);

    const { getViteConfig } = await importAstroConfig(projectDir);

    expect(getViteConfig()).toMatch(/node_modules\/astro\/config\.js$/);
  });

  // Vitest runs the framework, and Astro with it, in a module runner, which
  // may not support import.meta.resolve (#329).
  test('loads it from inside a module runner without import.meta.resolve support', async () => {
    await installFakeAstro(configCallingImportMetaResolve);

    let server: ViteDevServer | undefined;
    let runner: ModuleRunner | undefined;

    try {
      server = await createServer({
        configFile: false,
        root: projectDir,
        logLevel: 'silent',
        server: { middlewareMode: true, hmr: false, ws: false },
        ssr: { noExternal: true },
        optimizeDeps: { noDiscovery: true }
      });
      // createServerModuleRunner always gives modules a working
      // import.meta.resolve, so build the runner by hand.
      runner = new ModuleRunner(
        {
          transport: createServerModuleRunnerTransport({ channel: server.environments.ssr.hot }),
          createImportMeta: createDefaultImportMeta,
          hmr: false
        },
        new ESModulesEvaluator()
      );
      const runnerModule = await runner.import<ImportAstroConfigModule>(
        fileURLToPath(new URL('./importAstroConfig.ts', import.meta.url))
      );

      const { getViteConfig } = await runnerModule.importAstroConfig(projectDir);

      expect(getViteConfig()).toMatch(/node_modules\/astro\/config\.js$/);
    } finally {
      await runner?.close();
      await server?.close();
    }
  });

  test('loads an astro/config with top-level await, which require() cannot load', async () => {
    await installFakeAstro(`
      const version = await Promise.resolve('7');
      export function getViteConfig() {
        return version;
      }
    `);

    const { getViteConfig } = await importAstroConfig(projectDir);

    expect(getViteConfig()).toBe('7');
  });

  test('reports an error astro/config throws while loading', async () => {
    await installFakeAstro(`throw new Error('broken astro install');`);

    await expect(importAstroConfig(projectDir)).rejects.toThrow('broken astro install');
  });
});

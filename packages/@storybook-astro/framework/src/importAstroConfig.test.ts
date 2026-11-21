import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
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

async function installFakeAstro(files: Record<string, string>) {
  const astroDir = join(projectDir, 'node_modules', 'astro');

  await mkdir(astroDir, { recursive: true });
  await writeFile(
    join(astroDir, 'package.json'),
    JSON.stringify({ name: 'astro', type: 'module', exports: { './config': './config.js' } })
  );

  for (const [fileName, source] of Object.entries(files)) {
    await writeFile(join(astroDir, fileName), source);
  }
}

// From Astro 7.4.9, the markdown plugin that getViteConfig imports calls
// import.meta.resolve at its top level.
const astroWithMarkdownPlugin = {
  'config.js': `
    export async function getViteConfig() {
      const { markdownPluginUrl } = await import('./markdown-plugin.js');
      return markdownPluginUrl;
    }
  `,
  'markdown-plugin.js': `
    export const markdownPluginUrl = import.meta.resolve('./markdown-plugin.js');
  `
};

describe('importAstroConfig', () => {
  test('loads an astro/config whose markdown plugin calls import.meta.resolve', async () => {
    await installFakeAstro(astroWithMarkdownPlugin);

    const { getViteConfig } = await importAstroConfig(projectDir);

    expect(await getViteConfig()).toMatch(/node_modules\/astro\/markdown-plugin\.js$/);
  });

  // Vitest runs the framework, and Astro with it, in a module runner, which
  // may not support import.meta.resolve (#329).
  test('loads it from inside a module runner without import.meta.resolve support', async () => {
    await installFakeAstro(astroWithMarkdownPlugin);

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
      // import.meta.resolve, so build the runner by hand, with the same
      // import.meta.resolve Vitest's runner has.
      runner = new ModuleRunner(
        {
          transport: createServerModuleRunnerTransport({ channel: server.environments.ssr.hot }),
          createImportMeta: async (modulePath) => ({
            ...(await createDefaultImportMeta(modulePath)),
            resolve: () => {
              throw new Error('[module runner] "import.meta.resolve" is not supported.');
            }
          }),
          hmr: false
        },
        new ESModulesEvaluator()
      );
      const runnerModule = await runner.import<ImportAstroConfigModule>(
        fileURLToPath(new URL('./importAstroConfig.ts', import.meta.url))
      );

      const { getViteConfig } = await runnerModule.importAstroConfig(projectDir);

      expect(await getViteConfig()).toMatch(/node_modules\/astro\/markdown-plugin\.js$/);
    } finally {
      await runner?.close();
      await server?.close();
    }
  });

  test('loads an astro/config with top-level await, which require() cannot load', async () => {
    await installFakeAstro({
      'config.js': `
        const version = await Promise.resolve('7');
        export function getViteConfig() {
          return version;
        }
      `
    });

    const { getViteConfig } = await importAstroConfig(projectDir);

    expect(getViteConfig()).toBe('7');
  });

  // In Storybook, Vite's loadConfigFromFile imports astro.config.*, and with
  // it astro/config, while other code can already be asking for astro/config.
  test('loads an astro/config that import() is still loading', async () => {
    await installFakeAstro({
      'config.js': `
        import './load-config-again.js';
        export function getViteConfig() {
          return 'loaded';
        }
      `,
      'load-config-again.js': `globalThis.__storybookAstroLoadConfig();`
    });

    let loadingAgain: ReturnType<typeof importAstroConfig> | undefined;

    (globalThis as Record<string, unknown>).__storybookAstroLoadConfig = () => {
      loadingAgain = importAstroConfig(projectDir);
    };

    try {
      const configPath = join(projectDir, 'node_modules', 'astro', 'config.js');

      await import(/* @vite-ignore */ pathToFileURL(configPath).href);

      const { getViteConfig } = await loadingAgain!;

      expect(getViteConfig()).toBe('loaded');
    } finally {
      delete (globalThis as Record<string, unknown>).__storybookAstroLoadConfig;
    }
  });

  test('reports an error astro/config throws while loading', async () => {
    await installFakeAstro({ 'config.js': `throw new Error('broken astro install');` });

    await expect(importAstroConfig(projectDir)).rejects.toThrow('broken astro install');
  });
});

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { resolveConfig, version as viteVersion } from 'vite';
import { vitePluginAstroOptimizeDeps } from './vitePluginAstroOptimizeDeps.ts';

type OptimizerOptions = { external: string[]; plugins: { name: string }[] };

// How each Vite calls a plugin's `config` hook, as read from the published packages.
const vite8 = { meta: { viteVersion: '8.0.16', rollupVersion: '4.0.0', rolldownVersion: '1.0.3' } };
const rolldownVite71 = { meta: { viteVersion: '7.1.20', rollupVersion: '4.23.0', rolldownVersion: '1.0.0-beta.45' } };
const rolldownVite70 = { meta: { viteVersion: '7.0.12', rollupVersion: '4.23.0', rolldownVersion: '1.0.0-beta.30' } };
const vite7 = { meta: { viteVersion: '7.3.1', rollupVersion: '4.0.0' } };
const vite6 = undefined;

function optimizeDepsFor(context: unknown) {
  const { config } = vitePluginAstroOptimizeDeps() as unknown as {
    config: (this: unknown) => { optimizeDeps: Record<string, OptimizerOptions> };
  };

  return config.call(context).optimizeDeps;
}

describe('dependency optimizer options follow the Vite that runs the config (#378)', () => {
  test.each([
    ['Vite 8', vite8],
    ['rolldown-vite 7.1 and later', rolldownVite71]
  ])('%s gets Rolldown options and no esbuildOptions, which it would warn about', (_, context) => {
    const optimizeDeps = optimizeDepsFor(context);

    expect(optimizeDeps.esbuildOptions).toBeUndefined();
    expect(optimizeDeps.rolldownOptions.external).toContain('astro:react:opts');
    expect(optimizeDeps.rolldownOptions.plugins.map((plugin) => plugin.name)).toEqual(['storybook-astro:dep-scan']);
  });

  test('rolldown-vite 7.0 gets its Rolldown options under rollupOptions, the only key it reads', () => {
    const optimizeDeps = optimizeDepsFor(rolldownVite70);

    expect(optimizeDeps.esbuildOptions).toBeUndefined();
    expect(optimizeDeps.rolldownOptions).toBeUndefined();
    expect(optimizeDeps.rollupOptions.external).toContain('astro:react:opts');
    expect(optimizeDeps.rollupOptions.plugins.map((plugin) => plugin.name)).toEqual(['storybook-astro:dep-scan']);
  });

  test.each([
    ['Vite 7', vite7],
    ['Vite 6', vite6]
  ])('%s gets esbuild options', (_, context) => {
    const optimizeDeps = optimizeDepsFor(context);

    expect(optimizeDeps.rolldownOptions).toBeUndefined();
    expect(optimizeDeps.esbuildOptions.external).toContain('astro:react:opts');
    expect(optimizeDeps.esbuildOptions.plugins.map((plugin) => plugin.name)).toEqual(['storybook-astro:dep-scan']);
  });

  test("a later plugin adding externals to one server's config doesn't change another's", () => {
    optimizeDepsFor(vite8).rolldownOptions.external.push('some-other-module');

    expect(optimizeDepsFor(vite8).rolldownOptions.external).not.toContain('some-other-module');
  });

  test(`a real Vite ${viteVersion} config resolves with the options that Vite reads`, async () => {
    const root = mkdtempSync(join(tmpdir(), 'optimize-deps-'));

    try {
      const config = await resolveConfig(
        { root, configFile: false, logLevel: 'silent', plugins: [vitePluginAstroOptimizeDeps()] },
        'serve'
      );
      const optimizeDeps = config.optimizeDeps as unknown as Record<string, OptimizerOptions | undefined>;
      const expectedKey = Number.parseInt(viteVersion, 10) >= 8 ? 'rolldownOptions' : 'esbuildOptions';

      expect(optimizeDeps[expectedKey]?.external).toContain('astro:react:opts');
      expect(optimizeDeps[expectedKey]?.plugins?.map((plugin) => plugin.name)).toContain('storybook-astro:dep-scan');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

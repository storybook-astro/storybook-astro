import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { resolveConfig, version as viteVersion } from 'vite';
import { vitePluginAstroOptimizeDeps } from './vitePluginAstroOptimizeDeps.ts';

type OptimizerOptions = { external: string[]; plugins: { name: string }[] };

// How each Vite calls a plugin's `config` hook.
const vite8 = { meta: { viteVersion: '8.0.16', rollupVersion: '4.0.0', rolldownVersion: '1.0.0' } };
const rolldownVite7 = { meta: { viteVersion: '7.1.12', rollupVersion: '4.0.0', rolldownVersion: '1.0.0-beta.40' } };
const vite7 = { meta: { viteVersion: '7.3.1', rollupVersion: '4.0.0' } };
const vite6 = undefined;

function optimizeDepsFor(context: unknown) {
  const { config } = vitePluginAstroOptimizeDeps() as unknown as {
    config: (this: unknown) => { optimizeDeps: Record<string, OptimizerOptions> };
  };

  return config.call(context).optimizeDeps;
}

describe('dependency optimizer options follow the Vite that runs the config (#378)', () => {
  test('Vite 8 gets Rolldown options and no esbuildOptions, which it would warn about', () => {
    const optimizeDeps = optimizeDepsFor(vite8);

    expect(optimizeDeps.esbuildOptions).toBeUndefined();
    expect(optimizeDeps.rolldownOptions.external).toContain('astro:react:opts');
    expect(optimizeDeps.rolldownOptions.plugins.map((plugin) => plugin.name)).toEqual(['storybook-astro:dep-scan']);
  });

  test.each([
    ['Vite 7', vite7],
    ['Vite 6', vite6],
    // Passes rolldownVersion, but its optimizer reads rollupOptions, not rolldownOptions.
    ['rolldown-vite 7.1', rolldownVite7]
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

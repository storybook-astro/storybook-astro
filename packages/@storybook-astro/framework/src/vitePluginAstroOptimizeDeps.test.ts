import { describe, expect, test } from 'vitest';
import { vitePluginAstroOptimizeDeps } from './vitePluginAstroOptimizeDeps.ts';

// How each Vite major calls a plugin's `config` hook.
const vite8 = { meta: { viteVersion: '8.0.16', rollupVersion: '4.0.0', rolldownVersion: '1.0.0' } };
const vite7 = { meta: { viteVersion: '7.3.1', rollupVersion: '4.0.0' } };
const vite6 = undefined;

function optimizeDepsFor(context: unknown) {
  const { config } = vitePluginAstroOptimizeDeps() as unknown as {
    config: (this: unknown) => { optimizeDeps: Record<string, { external: string[]; plugins: { name: string }[] }> };
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
    ['Vite 6', vite6]
  ])('%s gets esbuild options', (_, context) => {
    const optimizeDeps = optimizeDepsFor(context);

    expect(optimizeDeps.rolldownOptions).toBeUndefined();
    expect(optimizeDeps.esbuildOptions.external).toContain('astro:react:opts');
    expect(optimizeDeps.esbuildOptions.plugins.map((plugin) => plugin.name)).toEqual(['storybook-astro:dep-scan']);
  });
});

import type { Plugin, UserConfig } from 'vite';
import { astroDepScanEsbuildPlugin, astroDepScanRolldownPlugin } from './vitePluginAstroDepScan.ts';

// Integration virtual modules have no real package behind them, so the
// dependency bundler must leave them external rather than fail to resolve them.
const integrationVirtualModules = [
  'virtual:@astrojs/vue/app',
  'virtual:astro:vue-app',
  'astro:react:opts',
  'astro:preact:opts',
  'astro:toolbar:internal'
];

type ConfigHookContext = { meta?: { viteVersion?: string } } | void;

/**
 * Sets the dependency optimizer's options for the Vite that runs this config:
 * `rolldownOptions` on Vite 8, `esbuildOptions` on Vite 6 and 7. Vite 8 warns
 * that `esbuildOptions` is deprecated and, while it converts its plugins to
 * Rolldown ones, drops its `external`, so the scan fails to resolve
 * `astro:react:opts` and the other virtual modules.
 *
 * In a monorepo, the Vite installed next to the project, next to this package
 * and next to `@storybook/builder-vite` can differ from the one Storybook or
 * `@storybook/addon-vitest` actually starts (#174, #378). A `config` hook runs
 * inside the Vite that loaded it, so it reads the answer instead of guessing it
 * from the filesystem: Vite 7 and later pass `this.meta.viteVersion`, and Vite
 * 6 calls the hook with no `this`.
 *
 * This checks the version rather than `this.meta.rolldownVersion`, because
 * rolldown-vite 7.0–7.2 pass `rolldownVersion` but read the optimizer's options
 * from `rollupOptions`, not `rolldownOptions`. Their `esbuildOptions` support
 * keeps the scan working there.
 */
export function vitePluginAstroOptimizeDeps(): Plugin {
  return {
    name: 'storybook-astro:optimize-deps',
    config(this: ConfigHookContext): UserConfig {
      const viteMajor = Number.parseInt(this?.meta?.viteVersion ?? '6', 10);
      const usesRolldown = viteMajor >= 8;
      const optionsKey = usesRolldown ? 'rolldownOptions' : 'esbuildOptions';

      return {
        optimizeDeps: {
          [optionsKey]: {
            // A copy, since the resolved config keeps this array and later
            // plugins may push to it.
            external: [...integrationVirtualModules],
            plugins: [usesRolldown ? astroDepScanRolldownPlugin() : astroDepScanEsbuildPlugin()]
          }
        }
      } as UserConfig;
    }
  };
}

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

/**
 * Sets the dependency optimizer's options for the Vite that runs this config:
 * `rolldownOptions` on Vite 8 (Rolldown), `esbuildOptions` on Vite 6 and 7.
 * Setting `esbuildOptions` on Vite 8 logs a deprecation warning.
 *
 * In a monorepo, the Vite installed next to the project, next to this package
 * and next to `@storybook/builder-vite` can differ from the one Storybook or
 * `@storybook/addon-vitest` actually starts (#174, #378). A `config` hook runs
 * inside the Vite that loaded it, so it reads the answer instead of guessing it
 * from the filesystem: Vite 8 passes `this.meta.rolldownVersion`, Vite 7 passes
 * `this.meta` without it, and Vite 6 calls the hook with no `this`.
 */
export function vitePluginAstroOptimizeDeps(): Plugin {
  return {
    name: 'storybook-astro:optimize-deps',
    config(this: { meta?: { rolldownVersion?: string } } | void): UserConfig {
      if (this?.meta?.rolldownVersion) {
        return {
          optimizeDeps: {
            rolldownOptions: {
              external: integrationVirtualModules,
              plugins: [astroDepScanRolldownPlugin()]
            }
          }
        } as UserConfig;
      }

      return {
        optimizeDeps: {
          esbuildOptions: {
            external: integrationVirtualModules,
            plugins: [astroDepScanEsbuildPlugin()]
          }
        }
      } as UserConfig;
    }
  };
}

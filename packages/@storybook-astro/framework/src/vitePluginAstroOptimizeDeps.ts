import type { Plugin, UserConfig } from 'vite';
import { astroDepScanEsbuildPlugin, astroDepScanRolldownPlugin } from './vitePluginAstroDepScan.ts';

// Integration virtual modules have no real package behind them, so the
// dependency bundler must leave them external rather than fail to resolve them.
// esbuild fails without this. Rolldown left them external on its own when
// tested, but they're listed for it too, as they were before #378.
const integrationVirtualModules = [
  'virtual:@astrojs/vue/app',
  'virtual:astro:vue-app',
  'astro:react:opts',
  'astro:preact:opts',
  'astro:toolbar:internal'
];

type ConfigHookContext = { meta?: { viteVersion?: string; rolldownVersion?: string } } | void;

/**
 * Sets the dependency optimizer's options for the Vite that runs this config.
 * A Rolldown optimizer (Vite 8, or rolldown-vite 7 aliased as `vite`) gets
 * `rolldownOptions`, and setting `esbuildOptions` there logs a deprecation
 * warning. Vite 6 and 7 get `esbuildOptions`.
 *
 * In a monorepo, the Vite installed next to the project, next to this package
 * and next to `@storybook/builder-vite` can differ from the one Storybook or
 * `@storybook/addon-vitest` actually starts (#174, #378). A `config` hook runs
 * inside the Vite that loaded it, so it reads the answer instead of guessing it
 * from the filesystem: a Rolldown-based Vite passes `this.meta.rolldownVersion`,
 * Vite 7 passes `this.meta` without it, and Vite 6 calls the hook with no
 * `this`.
 */
export function vitePluginAstroOptimizeDeps(): Plugin {
  return {
    name: 'storybook-astro:optimize-deps',
    config(this: ConfigHookContext): UserConfig {
      const meta = this?.meta;
      const usesRolldown = Boolean(meta?.rolldownVersion);
      let optionsKey = 'esbuildOptions';

      if (usesRolldown) {
        // rolldown-vite 7.0 reads its optimizer's options from rollupOptions;
        // 7.1 and later, and Vite 8, from rolldownOptions.
        optionsKey = meta?.viteVersion?.startsWith('7.0.') ? 'rollupOptions' : 'rolldownOptions';
      }

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

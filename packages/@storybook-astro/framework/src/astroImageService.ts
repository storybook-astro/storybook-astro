import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import storybookImageService from './storybookImageService.ts';

/**
 * Astro 5 through 7.3 look for an image service on
 * `globalThis.astroAsset.imageService` before importing `virtual:image-service`,
 * and that import fails in some Vite module runners (Astro 6 on Vite 7).
 * Setting the global sidesteps it. Astro 7.4+ no longer reads the global; see
 * `storybookImageServiceConfig` for those versions.
 */
export function ensureAstroPassthroughImageService() {
  if (!globalThis.astroAsset) {
    (globalThis as Record<string, unknown>).astroAsset = {};
  }

  (globalThis.astroAsset as Record<string, unknown>).imageService = storybookImageService;
}

/**
 * The `image.service` config for the SSR servers that render stories. Astro
 * 7.4+ keeps the image service in a module-level variable filled only from
 * `virtual:image-service`, which loads this entrypoint (issue #196).
 *
 * The entrypoint is an absolute path rather than a package name, so it loads
 * wherever the project's Vite root is. The built file sits next to this code
 * both in the framework's `dist/` and in a server-mode `storybook-server/`
 * bundle (vitePluginAstroBuildServer copies it there, since deployed render
 * servers don't ship the framework package). Running from source, as the
 * framework's own tests do, it is resolved through the package instead.
 */
export function storybookImageServiceConfig() {
  const besideThisModule = fileURLToPath(new URL('./storybookImageService.js', import.meta.url));

  return {
    entrypoint: existsSync(besideThisModule)
      ? besideThisModule
      : createRequire(import.meta.url).resolve('@storybook-astro/framework/image-service'),
    config: {}
  };
}

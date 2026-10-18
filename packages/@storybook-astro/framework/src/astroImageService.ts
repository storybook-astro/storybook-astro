import { createRequire } from 'node:module';
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
 * The entrypoint is resolved to an absolute path here, rather than passed as a
 * package name, so it loads wherever the project's Vite root is: pnpm layouts,
 * test fixtures and deployed render servers included.
 */
export function storybookImageServiceConfig() {
  return {
    entrypoint: createRequire(import.meta.url).resolve('@storybook-astro/framework/image-service'),
    config: {}
  };
}

/**
 * Worker-target docgen module, imported by Storybook's docgen worker.
 *
 * Core spawns one long-lived Node worker, imports this module by absolute path
 * and calls {@link createDocgenProvider} once to build the middleware it folds
 * into the provider chain. Everything here runs on that thread, so the
 * TypeScript language service our extractor keeps warm — around 170 MB and a
 * ~0.9s first program — never lands on the dev server's event loop
 * (docs/specs/docgen.md#design-decisions).
 *
 * The framework's preset contributes the descriptor pointing here. This module
 * is emitted as its own entry because a descriptor is a module specifier, not a
 * closure: nothing can be passed across the thread boundary except plain data.
 */
import { createLazyDocgenMiddleware } from 'storybook/internal/common';
import { logger } from 'storybook/internal/node-logger';
import type { DocgenMiddleware } from 'storybook/internal/types';
import { buildDocgenPayload } from './docgen-payload.ts';
import { createAstroDocgen } from './index.ts';

/**
 * The slice of the framework's `docgen` option that survives the trip to the
 * worker. `propFilter` is a function, and functions throw at `postMessage`, so
 * a project that needs a custom filter stays on the builder path
 * (docs/specs/docgen.md#known-limitations).
 */
export interface AstroDocgenWorkerOptions {
  /** Where tsconfig discovery starts, and what declaring-file paths are relative to. */
  projectRoot: string;
  tsconfigPath?: string;
}

/**
 * Builds the Astro docgen middleware.
 *
 * The extractor is created on the first story request rather than at import
 * time, so a Storybook whose stories are all framework components never pays
 * for a TypeScript program it has no `.astro` file to read.
 */
export const createDocgenProvider = (options?: AstroDocgenWorkerOptions): DocgenMiddleware =>
  createLazyDocgenMiddleware({
    createManager: async () => {
      if (!options?.projectRoot) {
        logger.warn(
          '[storybook-astro] Astro docgen is unavailable: the provider was registered without a project root.'
        );

        return undefined;
      }

      return createAstroDocgen({
        projectRoot: options.projectRoot,
        tsconfigPath: options.tsconfigPath,
        warn: (message) => logger.warn(message)
      });
    },
    extract: (docgen, input) => buildDocgenPayload(input, { docgen })
  });

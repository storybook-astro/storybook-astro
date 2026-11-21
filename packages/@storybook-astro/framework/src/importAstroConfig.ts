import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

export async function importAstroConfig(resolveFrom: string) {
  const require = createRequire(import.meta.url);
  const astroConfigEntrypoint = require.resolve('astro/config', {
    paths: [resolveFrom]
  });

  // Load astro/config with Node's own require, not import(). Under Vitest,
  // import() runs inside Vitest's module runner, where Astro 7.4.9+ fails:
  // the markdown plugin getViteConfig imports calls import.meta.resolve at
  // its top level, which the runner doesn't support (#329). Fall back to
  // import() only where Node can't require the module: Node versions without
  // require(esm) (before 20.19 and 22.12), a module with top-level await, or
  // a module that import() is already loading or linking. Node 22 reports
  // a require() of a module an import() is still loading as an internal
  // assertion, not ERR_REQUIRE_ESM_RACE_CONDITION.
  try {
    return require(astroConfigEntrypoint);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;

    if (
      code !== 'ERR_REQUIRE_ESM' &&
      code !== 'ERR_REQUIRE_ESM_RACE_CONDITION' &&
      code !== 'ERR_INTERNAL_ASSERTION' &&
      code !== 'ERR_REQUIRE_ASYNC_MODULE' &&
      code !== 'ERR_REQUIRE_CYCLE_MODULE'
    ) {
      throw error;
    }
  }

  return import(/* @vite-ignore */ pathToFileURL(astroConfigEntrypoint).href);
}

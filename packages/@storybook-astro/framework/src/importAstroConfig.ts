import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

export async function importAstroConfig(resolveFrom: string) {
  const require = createRequire(import.meta.url);
  const astroConfigEntrypoint = require.resolve('astro/config', {
    paths: [resolveFrom]
  });

  // Load astro/config with Node's own require, not import(). Under Vitest,
  // import() runs inside Vitest's module runner, where Astro 7.4.9+ fails:
  // its markdown plugin calls import.meta.resolve at the top level, which the
  // runner doesn't support (#329). Fall back to import() only where Node
  // can't require an ES module: Node 20 without require(esm), or a module
  // with top-level await.
  try {
    return require(astroConfigEntrypoint);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;

    if (code !== 'ERR_REQUIRE_ESM' && code !== 'ERR_REQUIRE_ASYNC_MODULE') {
      throw error;
    }
  }

  return import(/* @vite-ignore */ pathToFileURL(astroConfigEntrypoint).href);
}

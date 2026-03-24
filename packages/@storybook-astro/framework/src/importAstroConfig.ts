import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

export async function importAstroConfig(resolveFrom: string) {
  const require = createRequire(import.meta.url);
  const astroConfigEntrypoint = require.resolve('astro/config', {
    paths: [resolveFrom]
  });

  return import(pathToFileURL(astroConfigEntrypoint).href);
}

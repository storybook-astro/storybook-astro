import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { version as bundledViteVersion } from 'vite';

/**
 * The Vite major that runs the project's Storybook, which decides which
 * optimizer options `viteFinal` sets and which Vite 8 dev-server workarounds it
 * applies.
 *
 * In a monorepo the Vite next to this package, the Vite the project resolves
 * and the Vite actually running can all differ (#174, #378). Storybook's
 * `@storybook/builder-vite` imports Vite and starts the server, and users
 * install it in the project, so the Vite it resolves is the one running. If it
 * can't be found, fall back to the project's Vite, then to the copy this
 * package imports.
 */
export function resolveProjectViteMajor(resolveFrom: string): number {
  const builderVitePackageJson = resolvePackageJson('@storybook/builder-vite', resolveFrom);
  const runningVitePackageJson =
    (builderVitePackageJson && resolvePackageJson('vite', dirname(builderVitePackageJson))) ??
    resolvePackageJson('vite', resolveFrom);
  const viteVersion = runningVitePackageJson
    ? (JSON.parse(readFileSync(runningVitePackageJson, 'utf8')) as { version: string }).version
    : bundledViteVersion;

  return Number.parseInt(viteVersion, 10);
}

// require.resolve returns the real path, so a pnpm-linked package resolves its
// own dependencies from the store, as Node does when it loads the package.
function resolvePackageJson(name: string, fromDir: string): string | undefined {
  try {
    return createRequire(join(fromDir, 'noop.js')).resolve(`${name}/package.json`);
  } catch {
    return undefined;
  }
}

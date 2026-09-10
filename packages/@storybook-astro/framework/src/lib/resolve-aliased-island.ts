import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { getTsconfig, type TsconfigCache } from 'get-tsconfig';

// Islands embedded in `.astro` components are frequently imported through a
// tsconfig path alias (e.g. `@/components/Counter`). The raw aliased specifier
// is baked into `<astro-island component-url>` and `import()`d verbatim, so it
// must be turned into an on-disk path before it can hydrate. This helper is
// used as a last resort after the existing resolution has already had its
// chance.
//
// The same tsconfig `paths` machinery is reused by
// `resolveTsconfigAliasedImport` for general module imports (issue #136):
// aliased imports inside `.astro`/`.tsx` files must resolve in the SSR module
// graph and be followed by the runtime-snapshot copier, not just island
// references.

const ISLAND_EXTS = ['.tsx', '.ts', '.jsx', '.js', '.vue', '.svelte', '.mts', '.mjs'];

// General module imports can also target `.astro`, `.cjs`, explicit-extension
// files (CSS, JSON), and directory `index.*` files — mirror the candidate
// order of `resolveLocalImportPath` in vitePluginAstroBuildShared.ts.
const MODULE_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.astro', '.vue', '.svelte'];

async function isFile(candidate: string): Promise<boolean> {
  try {
    // A bare candidate can hit a directory (e.g. `~/styles` next to
    // `~/styles/index.ts`) — only real files are importable.
    return (await stat(candidate)).isFile();
  } catch {
    return false;
  }
}

function islandCandidates(base: string) {
  return [base, ...ISLAND_EXTS.map((ext) => `${base}${ext}`)];
}

function moduleCandidates(base: string) {
  return [
    base,
    ...MODULE_EXTS.map((ext) => `${base}${ext}`),
    ...MODULE_EXTS.map((ext) => resolve(base, `index${ext}`))
  ];
}

/**
 * Resolves a tsconfig-aliased island specifier (e.g. `@/components/Counter`)
 * to an absolute on-disk file path, or `undefined` when it is not a tsconfig
 * alias or no matching file exists. Already-resolvable specifiers are skipped
 * so this runs only as a genuine last resort.
 */
export async function resolveAliasedIsland(
  specifier: string,
  resolveFrom: string
): Promise<string | undefined> {
  return resolveAliasedSpecifier(specifier, resolveFrom, islandCandidates);
}

/**
 * Resolves a tsconfig-aliased module import (e.g. `~/styles/tokens`) found in
 * any source file to an absolute on-disk path, or `undefined` when it is not
 * a tsconfig alias or no matching file exists. Unlike the island variant this
 * also matches `.astro`/`.cjs` files, explicit-extension targets, and
 * directory `index.*` files.
 *
 * `resolveFrom` should be the importing file where available — the nearest
 * tsconfig relative to the importer wins, matching TypeScript semantics.
 */
export async function resolveTsconfigAliasedImport(
  specifier: string,
  resolveFrom: string,
  tsconfigCache?: TsconfigCache
): Promise<string | undefined> {
  return resolveAliasedSpecifier(
    specifier.replace(/\?.*$/, ''),
    resolveFrom,
    moduleCandidates,
    tsconfigCache
  );
}

async function resolveAliasedSpecifier(
  specifier: string,
  resolveFrom: string,
  buildCandidates: (base: string) => string[],
  tsconfigCache?: TsconfigCache
): Promise<string | undefined> {
  // Skip specifiers the existing resolution can already handle.
  if (
    !specifier ||
    specifier.startsWith('./') ||
    specifier.startsWith('../') ||
    specifier.startsWith('/') ||
    specifier.startsWith('\0') ||
    specifier.startsWith('virtual:') ||
    specifier.startsWith('astro:') ||
    specifier.startsWith('@astrojs/') ||
    specifier.startsWith('@id/') ||
    specifier.startsWith('/@fs/')
  ) {
    return undefined;
  }

  // getTsconfig walks up from `resolveFrom` to the nearest tsconfig and merges
  // `extends` for us. We keep our own (deliberately lenient) path matching
  // below rather than its strict `createPathsMatcher`, which rejects the
  // non-relative-without-baseUrl paths that the Astro/Vite resolver accepts.
  let found;

  try {
    found = getTsconfig(resolveFrom, { cache: tsconfigCache });
  } catch {
    // Malformed tsconfig (bad JSON, circular extends). This is a last-resort
    // resolver, so swallow it rather than crash hydration.
    return undefined;
  }

  if (!found) {
    return undefined;
  }

  const compilerOptions = found.config.compilerOptions ?? {};
  const paths: Record<string, string[]> = compilerOptions.paths ?? {};

  if (Object.keys(paths).length === 0) {
    return undefined;
  }

  // tsconfig paths resolve relative to baseUrl when present, otherwise the
  // tsconfig directory (which get-tsconfig reports as `found.path`).
  const tsconfigDir = resolve(found.path, '..');
  const root = compilerOptions.baseUrl
    ? resolve(tsconfigDir, compilerOptions.baseUrl)
    : tsconfigDir;

  for (const [pattern, targets] of Object.entries(paths)) {
    const prefix = pattern.replace(/\*$/, '');

    if (!specifier.startsWith(prefix)) {
      continue;
    }

    const rest = specifier.slice(prefix.length);

    for (const target of targets) {
      const resolvedTarget = target.replace(/\*$/, '');
      const base = resolve(root, resolvedTarget, rest);

      for (const candidate of buildCandidates(base)) {
        if (await isFile(candidate)) {
          return candidate.replace(/\\/g, '/');
        }
      }
    }
  }

  return undefined;
}

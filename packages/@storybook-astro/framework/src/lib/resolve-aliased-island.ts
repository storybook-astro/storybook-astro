import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parse } from 'tsconfck';

// Islands embedded in `.astro` components are frequently imported through a
// tsconfig path alias (e.g. `@/components/Counter`). The raw aliased specifier
// is baked into `<astro-island component-url>` and `import()`d verbatim, so it
// must be turned into an on-disk path before it can hydrate. This helper is
// used as a last resort after the existing resolution has already had its
// chance.

const ALIAS_EXTS = ['.tsx', '.ts', '.jsx', '.js', '.vue', '.svelte', '.mts', '.mjs'];

async function isFile(candidate: string): Promise<boolean> {
  try {
    await access(candidate);

    return true;
  } catch {
    return false;
  }
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

  let result;

  try {
    result = await parse(resolve(resolveFrom, 'tsconfig.json'));
  } catch {
    return undefined;
  }

  const compilerOptions = result.tsconfig?.compilerOptions ?? {};
  const paths: Record<string, string[]> = compilerOptions.paths ?? {};

  if (Object.keys(paths).length === 0) {
    return undefined;
  }

  // tsconfig paths resolve relative to baseUrl when present, otherwise the
  // tsconfig directory (which tsconfck gives us as the tsconfig file's dir).
  const tsconfigDir = result.tsconfigFile
    ? resolve(result.tsconfigFile, '..')
    : resolveFrom;
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
      const candidates = [base, ...ALIAS_EXTS.map((ext) => `${base}${ext}`)];

      for (const candidate of candidates) {
        if (await isFile(candidate)) {
          return candidate.replace(/\\/g, '/');
        }
      }
    }
  }

  return undefined;
}

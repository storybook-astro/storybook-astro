import { readFileSync, statSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

// Islands embedded in `.astro` components are frequently imported through a
// tsconfig path alias (for example `@/components/Counter`). The raw aliased
// specifier is baked into `<astro-island component-url>` and `import()`d
// verbatim, so it must be turned into an on-disk path before it can hydrate.
// This helper resolves `compilerOptions.paths` aliases (with a `@/` -> `src/`
// fallback) to an absolute file path, and is used as a last resort after the
// existing resolution has already had its chance.

const ALIAS_EXTS = ['.tsx', '.ts', '.jsx', '.js', '.vue', '.svelte', '.mts', '.mjs'];

type AliasEntry = { prefix: string; target: string };

const aliasCacheByRoot = new Map<string, AliasEntry[]>();

/** Reads `<root>/tsconfig.json` path aliases, falling back to `@/` -> `src/`. */
function readAliases(root: string): AliasEntry[] {
  const cached = aliasCacheByRoot.get(root);

  if (cached) {
    return cached;
  }

  const entries: AliasEntry[] = [];

  try {
    const raw = readFileSync(resolve(root, 'tsconfig.json'), 'utf-8');
    // tsconfig allows comments/trailing commas; strip the common cases so a
    // plain JSON.parse can read the `compilerOptions.paths` map.
    const cleaned = raw
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1')
      .replace(/,(\s*[}\]])/g, '$1');
    const parsed = JSON.parse(cleaned) as {
      compilerOptions?: { paths?: Record<string, string[]> };
    };
    const paths = parsed.compilerOptions?.paths ?? {};

    for (const [pattern, targets] of Object.entries(paths)) {
      const target = targets?.[0];

      if (!target) {
        continue;
      }

      // Normalise both sides of the `"@/*": ["src/*"]` convention to a plain
      // directory prefix so a startsWith check can match real specifiers.
      entries.push({
        prefix: pattern.replace(/\*$/, ''),
        target: target.replace(/\*$/, '')
      });
    }
  } catch {
    // No (readable) tsconfig: fall through to the conventional default below.
  }

  if (!entries.some((entry) => entry.prefix === '@/')) {
    entries.push({ prefix: '@/', target: 'src/' });
  }

  aliasCacheByRoot.set(root, entries);

  return entries;
}

function isFile(candidate: string): boolean {
  try {
    return statSync(candidate).isFile();
  } catch {
    return false;
  }
}

/**
 * Resolves a tsconfig-aliased island specifier (e.g. `@/components/Counter`) to
 * an absolute on-disk file path, or `undefined` when it is not an alias or no
 * file exists. Already-resolvable specifiers are skipped so this only runs as a
 * genuine last resort.
 */
export function resolveAliasedIsland(specifier: string, root: string): string | undefined {
  // Skip specifiers the existing resolution can already handle: relative,
  // absolute, virtual, framework-internal and dev-server URLs.
  if (
    !specifier ||
    specifier.startsWith('./') ||
    specifier.startsWith('../') ||
    specifier.startsWith('/') ||
    isAbsolute(specifier) ||
    specifier.startsWith('\0') ||
    specifier.startsWith('virtual:') ||
    specifier.startsWith('astro:') ||
    specifier.startsWith('@astrojs/') ||
    specifier.startsWith('@id/') ||
    specifier.startsWith('/@fs/')
  ) {
    return undefined;
  }

  for (const { prefix, target } of readAliases(root)) {
    if (!specifier.startsWith(prefix)) {
      continue;
    }

    const rest = specifier.slice(prefix.length);
    const base = resolve(root, target, rest);
    const candidates = [base, ...ALIAS_EXTS.map((ext) => `${base}${ext}`)];

    for (const candidate of candidates) {
      if (isFile(candidate)) {
        return candidate.replace(/\\/g, '/');
      }
    }
  }

  return undefined;
}

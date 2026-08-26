import { basename, dirname, join } from 'node:path';

/**
 * Turns a `.astro` file into the TypeScript file we hand to the compiler.
 *
 * Two properties matter and both are load-bearing
 * (docs/specs/docgen.md#the-virtual-typescript-file):
 *
 * 1. The virtual file sits *beside* the component, so relative imports,
 *    tsconfig `paths`, package `exports` and nearest-package.json resolution
 *    all behave as they would for a real file in that folder. Naming it
 *    something rootless resolves `./types` against the process working
 *    directory instead, and the failure is invisible — TypeScript's error type
 *    still stringifies to the written type name while the type has no members,
 *    so the props table comes out plausible and empty.
 * 2. Every byte outside the frontmatter is blanked rather than removed, so a
 *    TypeScript position is the exact offset in the original `.astro` file and
 *    diagnostics need no translation.
 */

/** The name TypeScript sees. `.astro.ts` matches svelte2tsx and vue-tsc. */
export function virtualFilePathFor(astroFilePath: string): string {
  return join(dirname(astroFilePath), `${basename(astroFilePath)}.ts`);
}

/**
 * Builds the virtual source, or `null` when the file has no frontmatter and
 * therefore nothing to extract.
 */
export function buildVirtualSource(astroSource: string): string | null {
  if (!astroSource.startsWith('---')) {
    return null;
  }

  const closingFence = findClosingFence(astroSource);

  if (closingFence === -1) {
    return null;
  }

  // `// ` is the same three bytes as the opening `---`, so it comments out the
  // rest of that line without shifting anything after it.
  const frontmatter = astroSource.slice(3, closingFence);

  if (!frontmatter.trim()) {
    return null;
  }

  return `// ${frontmatter}${blankOut(astroSource.slice(closingFence))}`;
}

/**
 * Index of the closing `---`, searching line by line rather than with a lazy
 * regex so a `---` inside a frontmatter string or comment doesn't end it early.
 */
function findClosingFence(source: string): number {
  let cursor = source.indexOf('\n');

  while (cursor !== -1) {
    const lineStart = cursor + 1;
    const nextNewline = source.indexOf('\n', lineStart);
    const lineEnd = nextNewline === -1 ? source.length : nextNewline;

    if (source.slice(lineStart, lineEnd).trim() === '---') {
      return lineStart;
    }

    cursor = nextNewline;
  }

  return -1;
}

/** Replaces every character with a space, keeping newlines so offsets hold. */
function blankOut(text: string): string {
  return text.replace(/[^\n]/g, ' ');
}

/**
 * Appends a declaration whose type is `Props` with its type arguments defaulted.
 *
 * Reading `getDeclaredTypeOfSymbol` on a generic `Props` hands back `Props<Tag>`
 * with the parameter unapplied; reading the type of this declaration applies the
 * defaults instead (docs/specs/docgen.md#heritage-rewrite, Decision 6). Appended
 * past the end of the original file so no existing offset moves.
 */
export const PROPS_PROBE_NAME = '__SB_ASTRO_PROPS__';

export function appendPropsProbe(virtualSource: string, typeArguments?: string): string {
  const args = typeArguments ? `<${typeArguments}>` : '';

  return `${virtualSource}\ndeclare const ${PROPS_PROBE_NAME}: Props${args};\n`;
}

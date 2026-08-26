import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { getTsconfig } from 'get-tsconfig';
import type ts from 'typescript';
import { extractAstroDocgen } from './extract.ts';
import { createAstroTsProject, type AstroTsProject } from './tsProject.ts';
import type { AstroDocgenInfo, AstroDocgenOptions } from './types.ts';

export type { AstroDocgenInfo, AstroDocgenOptions, PropFilter } from './types.ts';

/** TypeScript below this lacks `resolveModuleNameLiterals`, which we rely on. */
const MINIMUM_TYPESCRIPT = 5;

export interface AstroDocgen {
  /**
   * Loads TypeScript and warms the language service. Call without awaiting from
   * `buildStart` so the one-time cost overlaps Storybook's own boot rather than
   * landing on the first story request.
   */
  warmUp(): Promise<void>;
  /** Docgen for one component, or `null` when there is nothing to extract. */
  extract(astroFilePath: string, astroSource: string): Promise<AstroDocgenInfo | null>;
  /** Called from Vite's watcher when a file the components depend on changes. */
  invalidate(filePath: string): void;
  dispose(): void;
}

export interface AstroDocgenSetup extends AstroDocgenOptions {
  projectRoot: string;
  /** Reports a problem once. Repeats are swallowed. */
  warn?: (message: string) => void;
}

/**
 * Owns the docgen runtime: the TypeScript import, the shared language service
 * and the extraction cache.
 *
 * Everything here is best-effort. Docgen is a side channel — when it cannot
 * run, components still render (docs/specs/docgen.md#failure-modes).
 */
export function createAstroDocgen(setup: AstroDocgenSetup): AstroDocgen {
  const warned = new Set<string>();
  const warn = (message: string) => {
    if (warned.has(message)) {
      return;
    }

    warned.add(message);
    (setup.warn ?? console.warn)(`[storybook-astro] ${message}`);
  };

  const cache = new Map<string, AstroDocgenInfo | null>();
  let session: Promise<Session | undefined> | undefined;

  const ensureSession = () => (session ??= startSession(setup, warn));

  return {
    async warmUp() {
      const active = await ensureSession();

      // Building the program is what actually costs the ~0.9s; getting the
      // service alone is nearly free and would just defer it.
      active?.project.getProgram();
    },

    async extract(astroFilePath, astroSource) {
      const active = await ensureSession();

      if (!active) {
        return null;
      }

      const key = fingerprint(astroFilePath, astroSource, active.optionsFingerprint);
      const cached = cache.get(key);

      // Negative results are cached too, so a component that legitimately has
      // no props doesn't re-run a type check on every HMR tick.
      if (cached !== undefined) {
        return cached;
      }

      let docgen: AstroDocgenInfo | null = null;

      try {
        docgen = extractAstroDocgen(
          active.typescript,
          active.project,
          astroFilePath,
          astroSource,
          setup
        );
      } catch (error) {
        warn(`Could not read documentation from ${astroFilePath}: ${messageOf(error)}`);
      }

      cache.set(key, docgen);

      return docgen;
    },

    invalidate(filePath) {
      // A shared type moving invalidates every component that imported it, and
      // the cache is keyed by component source — which hasn't changed.
      cache.clear();
      void session?.then((active) => active?.project.invalidate(filePath));
    },

    dispose() {
      cache.clear();
      void session?.then((active) => active?.project.dispose());
      session = undefined;
    }
  };
}

interface Session {
  typescript: typeof ts;
  project: AstroTsProject;
  optionsFingerprint: string;
}

async function startSession(
  setup: AstroDocgenSetup,
  warn: (message: string) => void
): Promise<Session | undefined> {
  let typescript: typeof ts;

  try {
    typescript = (await import('typescript')).default;
  } catch {
    warn('TypeScript is not installed, so component documentation cannot be extracted.');

    return undefined;
  }

  if (Number.parseInt(typescript.versionMajorMinor, 10) < MINIMUM_TYPESCRIPT) {
    warn(
      `TypeScript ${typescript.version} is too old for documentation extraction; 5.0 or newer is required.`
    );

    return undefined;
  }

  const compilerOptions = readCompilerOptions(typescript, setup, warn);

  return {
    typescript,
    project: createAstroTsProject(typescript, compilerOptions, setup.projectRoot),
    optionsFingerprint: JSON.stringify(compilerOptions)
  };
}

/**
 * Compiler options from the project's own tsconfig, so path aliases and
 * `moduleResolution` match how the component is actually built. `skipLibCheck`
 * is forced on because we only ever ask about one file's types.
 */
function readCompilerOptions(
  typescript: typeof ts,
  setup: AstroDocgenSetup,
  warn: (message: string) => void
): ts.CompilerOptions {
  const found = setup.tsconfigPath
    ? getTsconfig(setup.tsconfigPath)
    : getTsconfig(setup.projectRoot);

  const fallback: ts.CompilerOptions = {
    target: typescript.ScriptTarget.Latest,
    module: typescript.ModuleKind.ESNext,
    moduleResolution: typescript.ModuleResolutionKind.Bundler,
    allowJs: true
  };

  if (!found) {
    return { ...fallback, skipLibCheck: true, noEmit: true };
  }

  const { options, errors } = typescript.convertCompilerOptionsFromJson(
    found.config.compilerOptions ?? {},
    dirname(found.path)
  );

  if (errors.length > 0) {
    warn(
      `Could not read ${found.path}, falling back to defaults: ${typescript.flattenDiagnosticMessageText(errors[0].messageText, ' ')}`
    );

    return { ...fallback, skipLibCheck: true, noEmit: true };
  }

  return { ...fallback, ...options, skipLibCheck: true, noEmit: true };
}

function fingerprint(filePath: string, source: string, optionsFingerprint: string): string {
  return createHash('sha256')
    .update(filePath)
    .update('\0')
    .update(source)
    .update('\0')
    .update(optionsFingerprint)
    .digest('hex');
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

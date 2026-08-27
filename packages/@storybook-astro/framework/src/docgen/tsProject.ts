import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type ts from 'typescript';

/**
 * One long-lived TypeScript language service shared by every component.
 *
 * Creating a program per `.astro` file re-parses and re-checks the whole
 * transitive graph each time — measured at 190-711ms per component against
 * `astro/types`, versus 0-1.4ms once a language service is warm. The legacy
 * delivery path runs inside a Vite `transform` on the dev server's critical
 * path, so that difference is the whole feature's viability
 * (docs/specs/docgen.md#design-decisions, Decision 3).
 *
 * Exactly one of these should exist per process: two services with different
 * compiler options land in different document-registry buckets and pay for
 * lib.d.ts twice.
 */
export interface AstroTsProject {
  /** Registers or replaces a component's virtual file and invalidates it. */
  setVirtualFile(filePath: string, contents: string): void;
  getProgram(): ts.Program | undefined;
  /** Marks an on-disk file changed, e.g. from Vite's watcher. */
  invalidate(filePath: string): void;
  dispose(): void;
}

/** Ambient declarations nothing imports, so they have to be roots. */
const SHIM_FILE_NAME = '__storybook-astro-docgen.d.ts';

/**
 * Astro's own `client.d.ts` declares `astro:assets` and `*.svg` but not
 * `*.astro`, so without this every `.astro` import in frontmatter is an
 * unresolved module that silently degrades to `any`. `Astro` needs to be a
 * value too — `Astro.props as Props` is otherwise "cannot use namespace as a
 * value", which would take the whole frontmatter's types down with it.
 */
const SHIM_SOURCE = [
  "declare module '*.astro' {",
  '  const component: (props: Record<string, unknown>) => unknown;',
  '  export default component;',
  '}',
  'declare const Astro: any;',
  ''
].join('\n');

export function createAstroTsProject(
  typescript: typeof ts,
  compilerOptions: ts.CompilerOptions,
  projectRoot: string
): AstroTsProject {
  const virtualFiles = new Map<string, string>();
  const versions = new Map<string, number>();
  let projectVersion = 0;

  const shimPath = join(projectRoot, SHIM_FILE_NAME);

  virtualFiles.set(shimPath, SHIM_SOURCE);

  const bump = (filePath: string) => {
    versions.set(filePath, (versions.get(filePath) ?? 0) + 1);
    projectVersion += 1;
  };

  bump(shimPath);

  // Astro generates these and nothing imports them, so they only enter the
  // program if we list them as roots.
  const ambientRoots = [
    join(projectRoot, '.astro', 'types.d.ts'),
    join(projectRoot, 'src', 'env.d.ts')
  ].filter((candidate) => existsSync(candidate));

  const moduleResolutionCache = typescript.createModuleResolutionCache(
    projectRoot,
    (fileName) => fileName,
    compilerOptions
  );

  const host: ts.LanguageServiceHost = {
    getScriptFileNames: () => [...virtualFiles.keys(), ...ambientRoots],

    getScriptVersion: (fileName) => {
      const tracked = versions.get(fileName);

      if (tracked !== undefined) {
        return String(tracked);
      }

      // Disk files are versioned by mtime so an edit to a sibling `types.ts`
      // invalidates the components that import it.
      return String(typescript.sys.getModifiedTime?.(fileName)?.getTime() ?? 0);
    },

    // Without this TypeScript re-walks every root on each getProgram() call.
    getProjectVersion: () => String(projectVersion),

    getScriptSnapshot: (fileName) => {
      const virtual = virtualFiles.get(fileName);

      if (virtual !== undefined) {
        return typescript.ScriptSnapshot.fromString(virtual);
      }

      const contents = typescript.sys.readFile(fileName);

      return contents === undefined
        ? undefined
        : typescript.ScriptSnapshot.fromString(contents);
    },

    getCurrentDirectory: () => projectRoot,
    getCompilationSettings: () => compilerOptions,
    getDefaultLibFileName: (options) => typescript.getDefaultLibFilePath(options),

    fileExists: (fileName) => virtualFiles.has(fileName) || typescript.sys.fileExists(fileName),
    readFile: (fileName) => virtualFiles.get(fileName) ?? typescript.sys.readFile(fileName),
    readDirectory: typescript.sys.readDirectory,
    directoryExists: typescript.sys.directoryExists,
    getDirectories: typescript.sys.getDirectories,
    realpath: typescript.sys.realpath,

    getModuleResolutionCache: () => moduleResolutionCache,

    resolveModuleNameLiterals: (literals, containingFile, redirected, options) =>
      literals.map((literal) =>
        resolveOne(literal.text, containingFile, redirected, options)
      )
  };

  /**
   * `./Child.astro` has no on-disk TypeScript to resolve to, so point it at
   * that component's own virtual file when we have one. Anything else falls
   * through to normal resolution, and unregistered `.astro` imports land on
   * the shim's ambient declaration.
   */
  function resolveOne(
    specifier: string,
    containingFile: string,
    redirected: ts.ResolvedProjectReference | undefined,
    options: ts.CompilerOptions
  ): ts.ResolvedModuleWithFailedLookupLocations {
    if (specifier.endsWith('.astro')) {
      const candidate = specifier.startsWith('.')
        ? `${resolve(dirname(containingFile), specifier)}.ts`
        : undefined;

      if (candidate && virtualFiles.has(candidate)) {
        return {
          resolvedModule: {
            resolvedFileName: candidate,
            extension: typescript.Extension.Ts,
            isExternalLibraryImport: false
          }
        };
      }
    }

    return typescript.resolveModuleName(
      specifier,
      containingFile,
      options,
      host,
      moduleResolutionCache,
      redirected
    );
  }

  const registry = typescript.createDocumentRegistry();
  let service: ts.LanguageService | undefined = typescript.createLanguageService(host, registry);

  return {
    setVirtualFile(filePath, contents) {
      if (virtualFiles.get(filePath) === contents) {
        return;
      }

      virtualFiles.set(filePath, contents);
      bump(filePath);
    },

    getProgram: () => service?.getProgram(),

    invalidate(filePath) {
      // Bumping the project version is what makes the next getProgram() call
      // re-read the file; the per-file version comes from mtime.
      projectVersion += 1;
      versions.delete(filePath);
      moduleResolutionCache.clear();
    },

    dispose() {
      // The registry refcounts source files against the acquiring service, so
      // skipping this leaks every lib.d.ts and node_modules type it has seen.
      service?.dispose();
      service = undefined;
      virtualFiles.clear();
      versions.clear();
    }
  };
}

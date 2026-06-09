import { createHash } from 'node:crypto';
import { access, copyFile, mkdir, readFile, readdir, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { Rollup } from 'vite';
import type { Integration } from './integrations/index.ts';
import { resolveAliasedIsland } from './lib/resolve-aliased-island.ts';

/** Resolves the shared virtual module ids used by both build pipelines. */
export function resolveVirtualBuildModuleId(id: string) {
  if (id.startsWith('virtual:astro-static-module/')) {
    return `\0${id}`;
  }

  if (id.startsWith('virtual:astro-component-module/')) {
    return `\0${id}`;
  }
}

/** Loads the virtual modules that stand in for tracked runtime and component entrypoints. */
export function loadVirtualBuildModule(id: string) {
  if (id.startsWith('\0virtual:astro-static-module/')) {
    const encodedSpecifier = id.replace('\0virtual:astro-static-module/', '');
    const specifier = decodeURIComponent(encodedSpecifier);

    if (isClientEntrypoint(specifier)) {
      return [`export { default } from '${specifier}';`, `export * from '${specifier}';`].join(
        '\n'
      );
    }

    return [`import '${specifier}';`, 'export default undefined;'].join('\n');
  }

  if (id.startsWith('\0virtual:astro-component-module/')) {
    const withoutPrefix = id.replace('\0virtual:astro-component-module/', '');
    const encodedSpecifier = withoutPrefix.replace(/\?.*$/, '');
    const specifier = decodeURIComponent(encodedSpecifier);

    return [`export { default } from '${specifier}';`, `export * from '${specifier}';`].join('\n');
  }
}

/** Emits build entrypoints for framework client runtimes that Astro stories may reference. */
export async function emitBuildEntrypoints(options: {
  pluginContext: Rollup.PluginContext;
  integrations: Integration[];
  resolveFrom: string;
  trackedSpecifiers: Set<string>;
  staticEntrypointRefs: Map<string, string>;
}) {
  const { pluginContext, integrations, resolveFrom } = options;

  // Keep framework client entrypoints in the build so Astro islands can
  // still hydrate after the preview iframe switches to built assets.
  integrations.forEach((integration) => {
    const entrypoint = integration.renderer.client?.entrypoint;

    if (entrypoint) {
      pluginContext.addWatchFile(entrypoint);
    }
  });

  options.trackedSpecifiers.forEach((specifier) => {
    const fileReferenceId = pluginContext.emitFile({
      type: 'chunk',
      id: toStaticVirtualId(specifier),
      name: createEntrypointName(resolveFrom, specifier)
    });

    options.staticEntrypointRefs.set(specifier, fileReferenceId);
  });
}

/** Emits framework component entry chunks for one Astro component file used in the build graph. */
export async function emitHydratedComponentEntriesFromAstroFile(options: {
  pluginContext: Rollup.PluginContext;
  astroFilePath: string;
  resolveFrom: string;
  componentEntrypointRefs: Map<string, string>;
}) {
  const hydratedComponentPaths = await collectHydratedComponentPaths(
    options.astroFilePath,
    options.resolveFrom
  );

  for (const resolvedImportPath of hydratedComponentPaths) {

    if (options.componentEntrypointRefs.has(resolvedImportPath)) {
      continue;
    }

    const fileReferenceId = options.pluginContext.emitFile({
      type: 'chunk',
      id: toComponentChunkId(resolvedImportPath),
      name: createEntrypointName(options.resolveFrom, resolvedImportPath)
    });

    options.componentEntrypointRefs.set(resolvedImportPath, fileReferenceId);
  }
}

/** Collects the framework component files one Astro component hydrates in the browser. */
export async function collectHydratedComponentPaths(astroFilePath: string, resolveFrom: string) {
  // Only Astro components create islands, so only their framework imports
  // need standalone client chunks in built Storybook output.
  const allImportSpecifiers = await readAllImportSpecifiers(astroFilePath);
  const hydratedComponentPaths: string[] = [];

  for (const specifier of allImportSpecifiers) {
    // Resolve the specifier to an on-disk path — relative imports use the
    // importer's directory; aliased imports go through the tsconfig paths map.
    const resolvedImportPath = specifier.startsWith('.')
      ? await resolveLocalImportPath(astroFilePath, specifier)
      : await resolveAliasedIsland(specifier, resolveFrom);

    if (!resolvedImportPath) {
      continue;
    }

    if (
      !isHydratableSourceFile(resolvedImportPath) ||
      isNonHydratableSourceFile(resolvedImportPath)
    ) {
      continue;
    }

    // Only .jsx/.tsx files go through toComponentVirtualId, which emits
    // `export { default } from '<file>'`. A file with no default export
    // crashes Rollup with '"default" is not exported'. Svelte/Vue SFCs are
    // passed directly to their compilers, which generate the default export —
    // checking their source for a literal `export default` would falsely
    // exclude them.
    if (/\.(jsx|tsx)$/.test(resolvedImportPath) && !(await hasDefaultExport(resolvedImportPath))) {
      continue;
    }

    hydratedComponentPaths.push(resolvedImportPath);
  }

  return hydratedComponentPaths;
}

/** Collects framework client runtimes that must stay addressable after the preview is built. */
export function collectTrackedSpecifiers(integrations: Integration[]) {
  const specifiers = new Set<string>([
    'astro:scripts/page.js',
    'astro:scripts/before-hydration.js'
  ]);

  integrations.forEach((integration) => {
    const entrypoint = integration.renderer.client?.entrypoint;

    if (entrypoint) {
      specifiers.add(entrypoint);
    }
  });

  return specifiers;
}

/** Builds the browser module map used to rewrite source specifiers to built asset URLs. */
export function buildStaticModuleMap(
  pluginContext: Rollup.PluginContext,
  staticEntrypointRefs: Map<string, string>,
  componentEntrypointRefs: Map<string, string>
) {
  const map: Record<string, string> = {};

  staticEntrypointRefs.forEach((fileReferenceId, specifier) => {
    const fileName = pluginContext.getFileName(fileReferenceId);

    if (fileName) {
      map[specifier] = toPublicPath(fileName);
    }
  });

  componentEntrypointRefs.forEach((fileReferenceId, specifier) => {
    const fileName = pluginContext.getFileName(fileReferenceId);

    if (fileName) {
      map[specifier] = toPublicPath(fileName);
    }
  });

  return map;
}

/** Normalizes one emitted file name to the relative public path used in built HTML. */
export function toPublicPath(fileName: string) {
  return `./${fileName}`;
}

export function stripQuery(input: string | undefined) {
  return input?.replace(/\?.*$/, '');
}

/** Converts a project file path into the stable path used inside the snapshot tree. */
export function relativePathFromRoot(resolveFrom: string, filePath: string) {
  return filePath.slice(resolveFrom.length).replace(/^[/\\]+/, '');
}

/** Copies one file or directory tree into the standalone runtime snapshot. */
export async function copyPath(sourcePath: string, targetPath: string): Promise<void> {
  const sourceStats = await stat(sourcePath);

  if (sourceStats.isDirectory()) {
    await mkdir(targetPath, { recursive: true });
    const entries = await readdir(sourcePath, { withFileTypes: true });

    await Promise.all(
      entries.map((entry) =>
        copyPath(resolve(sourcePath, entry.name), resolve(targetPath, entry.name))
      )
    );

    return;
  }

  await mkdir(dirname(targetPath), { recursive: true });
  await copyFile(sourcePath, targetPath);
}

/** Maps an original source file path to its location inside the snapshot tree. */
export function buildSnapshotFilePath(
  resolveFrom: string,
  filePath: string,
  snapshotDirName: string
) {
  const normalizedResolveFrom = resolveFrom.replace(/\\/g, '/').replace(/\/$/, '');
  const normalizedFilePath = filePath.replace(/\\/g, '/');

  if (normalizedFilePath.startsWith(`${normalizedResolveFrom}/`)) {
    return `${snapshotDirName}/${relativePathFromRoot(resolveFrom, filePath)}`.replace(/\\/g, '/');
  }

  return `${snapshotDirName}/__external/${normalizedFilePath.replace(/^[/\\]+/, '')}`.replace(
    /\\/g,
    '/'
  );
}

/** Copies the source files and config files the standalone render server needs at runtime. */
export async function copyRuntimeSnapshot(options: {
  resolveFrom: string;
  snapshotRoot: string;
  snapshotDirName: string;
  astroComponents: string[];
  storyRulesConfigFilePath?: string;
}) {
  // The standalone render server still spins up a Vite SSR runtime, so it
  // needs the exact source/config files that runtime will read from disk.
  const runtimeInputFiles = new Set<string>([
    ...options.astroComponents,
    ...(options.storyRulesConfigFilePath ? [options.storyRulesConfigFilePath] : []),
    ...(await listRuntimeConfigFiles(options.resolveFrom))
  ]);
  const copiedFiles = new Set<string>();

  for (const runtimeInputFile of runtimeInputFiles) {
    await copyLocalRuntimeDependencies(runtimeInputFile, options, copiedFiles);
  }
}

/** Reports whether a JS/TS source file has a default export.
 * Only call for .jsx/.tsx — Svelte and Vue SFCs have no literal `export default`
 * in source, but their compilers generate one. On read error the file is kept,
 * preserving prior behaviour rather than silently dropping a component.
 *
 * The regex scan is intentionally conservative: it can match inside comments
 * or string literals, which produces a false-positive (file kept, Rollup crashes
 * as before) rather than a false-negative (file silently dropped). */
async function hasDefaultExport(absPath: string) {
  try {
    const source = await readFile(absPath, 'utf-8');

    return /export\s+default\b/.test(source) || /export\s*\{[^}]*\bdefault\b/.test(source);
  } catch {
    return true;
  }
}

function toStaticVirtualId(specifier: string) {
  return `virtual:astro-static-module/${encodeURIComponent(specifier)}`;
}

function toComponentVirtualId(specifier: string) {
  return `virtual:astro-component-module/${encodeURIComponent(specifier)}?component-wrapper`;
}

function toComponentChunkId(specifier: string) {
  return /\.(svelte|vue)$/.test(specifier) ? specifier : toComponentVirtualId(specifier);
}

function createEntrypointName(resolveFrom: string, specifier: string) {
  const normalizedResolveFrom = resolveFrom.replace(/\\/g, '/');
  const normalizedSpecifier = specifier.replace(/\\/g, '/');
  const relativeName = normalizedSpecifier.startsWith(`${normalizedResolveFrom}/`)
    ? normalizedSpecifier.slice(normalizedResolveFrom.length + 1)
    : normalizedSpecifier.split('/').slice(-2).join('/');
  const sanitizedName = relativeName.replace(/[^a-zA-Z0-9/_-]/g, '_').replace(/_+/g, '_');
  const hash = createHash('sha1').update(normalizedSpecifier).digest('hex').slice(0, 8);

  return `${sanitizedName}-${hash}`;
}

function isClientEntrypoint(specifier: string) {
  return specifier.startsWith('@astrojs/') && specifier.endsWith('/client.js');
}

function isHydratableSourceFile(input: string) {
  return /\.(jsx|tsx|vue|svelte)$/.test(input);
}

function isNonHydratableSourceFile(input: string) {
  return /\.stories\.[jt]sx?$|\.stories\.vue$|\.stories\.svelte$|\.(spec|test)\.[jt]sx?$/.test(
    input
  );
}

/** Finds project config files that the standalone render server may load through Vite. */
async function listRuntimeConfigFiles(resolveFrom: string) {
  const candidates = [
    'package.json',
    'tsconfig.json',
    'tsconfig.base.json',
    'jsconfig.json',
    'astro.config.mjs',
    'astro.config.js',
    'astro.config.ts',
    'vite.config.js',
    'vite.config.ts',
    'svelte.config.js'
  ];
  const existing: string[] = [];

  await Promise.all(
    candidates.map(async (candidate) => {
      const filePath = resolve(resolveFrom, candidate);

      try {
        await access(filePath);
        existing.push(filePath);
      } catch {
        return;
      }
    })
  );

  return existing;
}

/** Copies one local source file and follows its local imports into the snapshot. */
async function copyLocalRuntimeDependencies(
  sourcePath: string,
  options: {
    resolveFrom: string;
    snapshotRoot: string;
    snapshotDirName: string;
  },
  copiedFiles: Set<string>
) {
  const normalizedSourcePath = sourcePath.replace(/\\/g, '/');

  if (copiedFiles.has(normalizedSourcePath)) {
    return;
  }

  copiedFiles.add(normalizedSourcePath);

  const snapshotRelativePath = buildSnapshotFilePath(
    options.resolveFrom,
    normalizedSourcePath,
    options.snapshotDirName
  );

  await copyPath(
    normalizedSourcePath,
    resolve(dirname(options.snapshotRoot), snapshotRelativePath)
  );

  // Follow only local imports here. Package dependencies stay external and are
  // resolved by Node/Vite from the deployed install, not copied into snapshot.
  const localImportSpecifiers = await readLocalImportSpecifiers(normalizedSourcePath);

  for (const specifier of localImportSpecifiers) {
    const resolvedDependency = await resolveLocalImportPath(normalizedSourcePath, specifier);

    if (!resolvedDependency) {
      continue;
    }

    await copyLocalRuntimeDependencies(resolvedDependency, options, copiedFiles);
  }
}

const IMPORT_RE =
  /(?:import|export)\s+(?:[^'"`]*?\s+from\s+)?['"`]([^'"`]+)['"`]|import\(\s*['"`]([^'"`]+)['"`]\s*\)/g;

/** Returns all import specifiers found in the file (relative, aliased, and package). */
async function readAllImportSpecifiers(filePath: string): Promise<string[]> {
  if (!/\.(astro|[cm]?[jt]sx?|vue|svelte)$/.test(filePath)) {
    return [];
  }

  const source = await readFile(filePath, 'utf-8');

  return Array.from(source.matchAll(IMPORT_RE), (match) => match[1] ?? match[2]).filter(
    (specifier): specifier is string => Boolean(specifier)
  );
}

/** Reads local (relative) import specifiers from source files that can participate in the SSR runtime. */
async function readLocalImportSpecifiers(filePath: string) {
  return (await readAllImportSpecifiers(filePath)).filter((s) => s.startsWith('.'));
}

/** Resolves one relative import the same way the project source tree would on disk. */
async function resolveLocalImportPath(importerPath: string, specifier: string) {
  const basePath = resolve(dirname(importerPath), specifier);
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.js`,
    `${basePath}.jsx`,
    `${basePath}.mjs`,
    `${basePath}.cjs`,
    `${basePath}.astro`,
    `${basePath}.vue`,
    `${basePath}.svelte`,
    resolve(basePath, 'index.ts'),
    resolve(basePath, 'index.tsx'),
    resolve(basePath, 'index.js'),
    resolve(basePath, 'index.jsx'),
    resolve(basePath, 'index.mjs'),
    resolve(basePath, 'index.cjs'),
    resolve(basePath, 'index.astro'),
    resolve(basePath, 'index.vue'),
    resolve(basePath, 'index.svelte')
  ];

  for (const candidate of candidates) {
    try {
      const candidateStats = await stat(candidate);

      if (candidateStats.isFile()) {
        return candidate.replace(/\\/g, '/');
      }
    } catch {
      continue;
    }
  }

  return undefined;
}

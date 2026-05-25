import { createHash } from 'node:crypto';
import { access, copyFile, mkdir, readFile, readdir, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { Rollup } from 'vite';
import type { Integration } from './integrations/index.ts';

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

/** Records one hydratable framework component import when an Astro file pulls it into the build graph. */
export function trackHydratedComponentImport(options: {
  pluginContext: Rollup.PluginContext;
  importer?: string;
  id: string;
  resolveFrom: string;
  componentEntrypointRefs: Map<string, string>;
}) {
  const importerPath = stripQuery(options.importer);

  if (!importerPath?.endsWith('.astro')) {
    return;
  }

  // Only Astro components create islands, so only their framework imports
  // need standalone client chunks in built Storybook output.
  const specifier = resolve(dirname(importerPath), stripQuery(options.id));
  const normalizedSpecifier = specifier.replace(/\\/g, '/');

  if (
    !isHydratableSourceFile(normalizedSpecifier) ||
    isNonHydratableSourceFile(normalizedSpecifier)
  ) {
    return;
  }

  if (options.componentEntrypointRefs.has(normalizedSpecifier)) {
    return;
  }

  const fileReferenceId = options.pluginContext.emitFile({
    type: 'chunk',
    id: toComponentChunkId(normalizedSpecifier),
    name: createEntrypointName(options.resolveFrom, normalizedSpecifier)
  });

  options.componentEntrypointRefs.set(normalizedSpecifier, fileReferenceId);
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

/** Builds the stylesheet map for emitted framework component entry chunks. */
export function buildStaticCssMap(
  pluginContext: Rollup.PluginContext,
  bundle: Rollup.OutputBundle,
  componentEntrypointRefs: Map<string, string>
) {
  const map: Record<string, string[]> = {};

  componentEntrypointRefs.forEach((fileReferenceId, specifier) => {
    const fileName = pluginContext.getFileName(fileReferenceId);
    const chunk = fileName ? (bundle[fileName] as Rollup.OutputChunk | undefined) : undefined;
    const importedCss = Array.from(
      (chunk?.viteMetadata?.importedCss ?? new Set<string>()).values()
    );

    if (importedCss.length > 0) {
      map[specifier] = importedCss.map((cssFileName) => toPublicPath(cssFileName));
    }
  });

  return map;
}

/** Normalizes one emitted file name to the relative public path used in built HTML. */
export function toPublicPath(fileName: string) {
  return `./${fileName}`;
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

function stripQuery(input: string | undefined) {
  return input?.replace(/\?.*$/, '');
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

/** Reads local import specifiers from source files that can participate in the SSR runtime. */
async function readLocalImportSpecifiers(filePath: string) {
  if (!/\.(astro|[cm]?[jt]sx?|vue|svelte)$/.test(filePath)) {
    return [];
  }

  const source = await readFile(filePath, 'utf-8');
  const matches = source.matchAll(
    /(?:import|export)\s+(?:[^'"`]*?\s+from\s+)?['"`]([^'"`]+)['"`]|import\(\s*['"`]([^'"`]+)['"`]\s*\)/g
  );

  return Array.from(matches, (match) => match[1] ?? match[2]).filter(
    (specifier): specifier is string => Boolean(specifier) && specifier.startsWith('.')
  );
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

/* eslint n/no-unsupported-features/node-builtins: ["error", {"ignores": ["fs/promises.cp"]}] */
import { cp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire, isBuiltin } from 'node:module';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { traceNodeModules } from 'nf3';
import { FullTracePackages, NodeNativePackages } from 'nf3/db';
import type { ServerBuild } from './index.ts';
import { rewriteRequestBasePath } from './request.ts';

/** NF3 owns tracing, copying, deduplication and the output's node_modules layout. */
export async function packageServer(build: ServerBuild, output: string, extraPackages: string[]) {
  const deployment = JSON.parse(
    await readFile(join(build.serverDir, 'deployment.json'), 'utf8')
  ) as {
    runtimeDependencies: string[];
    externalDependencies?: string[];
  };
  const runtimePackages = [
    ...new Set(
      [...deployment.runtimeDependencies, ...extraPackages]
        .filter((name) => !isBuiltin(name))
        .map(packageName)
    )
  ];
  const requiredPackages = [
    ...new Set([
      ...runtimePackages,
      ...(deployment.externalDependencies ?? []).filter((name) => !isBuiltin(name)).map(packageName)
    ])
  ];
  const frameworkRoot = dirname(
    createRequire(import.meta.url).resolve('@storybook-astro/framework/package.json')
  );
  const rendererRoot = dirname(
    createRequire(import.meta.url).resolve('@storybook-astro/renderer/package.json')
  );
  const warnings = new Set<string>();
  const packages = new Map<string, Set<string>>();
  const cache = {};
  const inputs = new Set([join(build.serverDir, 'index.js')]);
  const ignoredDirectories = [
    output,
    build.staticDir,
    join(build.projectDir, '.vercel'),
    join(build.projectDir, 'storybook-node')
  ];

  await cp(build.serverDir, join(output, 'storybook-server'), { recursive: true });
  await writeFile(join(output, 'package.json'), '{"private":true,"type":"module"}\n');
  await writeFile(
    join(output, 'request.mjs'),
    `export const rewriteRequestBasePath = ${rewriteRequestBasePath.toString()};\n`
  );

  // First let NF3 locate the dynamic packages. Their JS files then become
  // inputs too: Vite can load unexported renderer files, not only package entrypoints.
  // Node and Vite use different export conditions; retain each supported branch.
  for (const [pass, conditions] of [
    ['node'],
    ['node'],
    ['node', 'module', 'production'],
    ['node', 'module', 'development'],
    ['browser', 'module', 'production'],
    ['browser', 'module', 'development']
  ].entries()) {
    await traceNodeModules([...inputs], {
      rootDir: build.projectDir,
      outDir: output,
      conditions,
      traceInclude: requiredPackages,
      // Bundled framework dependencies may live in a private pnpm store rather
      // than the app's node_modules. NF3 resolves them from their declaring owner.
      traceIncludeRoots: [build.projectDir, frameworkRoot, rendererRoot],
      fullTraceInclude: [...runtimePackages, ...FullTracePackages, ...NodeNativePackages],
      nft: {
        cache,
        ignore: (path: string) =>
          ignoredDirectories.some((directory) => {
            const fromOutput = relative(directory, join('/', path));

            return (
              fromOutput === '' ||
              (!fromOutput.startsWith(`..${sep}`) && fromOutput !== '..' && !isAbsolute(fromOutput))
            );
          })
      },
      hooks: {
        traceResult(result) {
          for (const warning of result.warnings) {
            warnings.add(warning.message);
          }
        },
        tracedPackages(result) {
          for (const [name, pkg] of Object.entries(result)) {
            if (pass === 0 && runtimePackages.includes(name)) {
              for (const version of Object.values(pkg.versions)) {
                for (const file of version.files) {
                  if (/\.[cm]?js$/.test(file)) {
                    inputs.add(file);
                  }
                }
              }
            }
            const versions = packages.get(name) ?? new Set<string>();

            for (const version of Object.keys(pkg.versions)) {
              versions.add(version);
            }
            packages.set(name, versions);
          }
        }
      }
    });
    if (pass === 0) {
      const missing = requiredPackages.filter((name) => !packages.has(name));

      if (missing.length) {
        throw new Error(`NF3 could not package required dependencies: ${missing.join(', ')}`);
      }
      // The discovery pass is not the final dependency graph.
      await rm(join(output, 'node_modules'), { recursive: true, force: true });
    }
  }
  await writeFile(
    join(output, 'nf3.json'),
    JSON.stringify(
      {
        packages: Object.fromEntries(
          [...packages].map(([name, versions]) => [name, [...versions].sort()])
        ),
        warnings: [...warnings]
      },
      null,
      2
    )
  );
  if (warnings.size) {
    console.warn(
      `[storybook-astro] NF3 reported ${warnings.size} trace warnings; see ${join(output, 'nf3.json')}.`
    );
  }
}

function packageName(specifier: string): string {
  return specifier.startsWith('@')
    ? specifier.split('/').slice(0, 2).join('/')
    : specifier.split('/')[0];
}

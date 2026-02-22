import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getComponentModuleFilePath } from './component-utils.ts';

const VITEST_CONFIG_FILES = [
  'vitest.config.ts',
  'vitest.config.mts',
  'vitest.config.js',
  'vitest.config.mjs',
  'vitest.config.cjs'
];

function extractStackFilePath(line: string) {
  const trimmed = line.trim();

  const match =
    trimmed.match(/\((.+):(\d+):(\d+)\)$/) ??
    trimmed.match(/^at\s+(.+):(\d+):(\d+)$/);

  if (!match) {
    return null;
  }

  const rawPath = match[1];

  if (rawPath.startsWith('node:')) {
    return null;
  }

  if (rawPath.startsWith('file://')) {
    return fileURLToPath(rawPath);
  }

  if (rawPath.startsWith('/')) {
    return rawPath;
  }

  return null;
}

async function getCurrentTestFilePath() {
  try {
    const { expect } = await import('vitest');
    const vitestState = expect.getState() as {
      testPath?: string;
      filepath?: string;
      filePath?: string;
    };

    const fromVitestState = vitestState.testPath ?? vitestState.filepath ?? vitestState.filePath;

    if (typeof fromVitestState === 'string') {
      const absolutePath = fromVitestState.startsWith('/')
        ? fromVitestState
        : resolve(process.cwd(), fromVitestState);

      if (existsSync(absolutePath)) {
        return absolutePath;
      }
    }
  } catch {
    // Fall through to stack-based lookup when Vitest state is unavailable.
  }

  const stack = new Error().stack;

  if (!stack) {
    return null;
  }

  const thisFilePath = fileURLToPath(import.meta.url);

  for (const line of stack.split('\n')) {
    const filePath = extractStackFilePath(line);

    if (!filePath) {
      continue;
    }

    if (filePath === thisFilePath || filePath.includes('/node_modules/')) {
      continue;
    }

    if (existsSync(filePath)) {
      return filePath;
    }
  }

  return null;
}

function findNearestVitestConfigDir(startPath: string) {
  let dir = dirname(startPath);

  while (true) {
    if (VITEST_CONFIG_FILES.some((name) => existsSync(join(dir, name)))) {
      return dir;
    }

    const parent = dirname(dir);

    if (parent === dir) {
      break;
    }

    dir = parent;
  }

  return null;
}

function packageJsonDeclaresAstro(packageJsonPath: string) {
  if (!existsSync(packageJsonPath)) {
    return false;
  }

  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

    return ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'].some(
      (field) =>
        packageJson[field] &&
        typeof packageJson[field] === 'object' &&
        Object.prototype.hasOwnProperty.call(packageJson[field], 'astro')
    );
  } catch {
    return false;
  }
}

function findNearestAstroPackageDir(startPath: string) {
  let dir = dirname(startPath);

  while (true) {
    const packageJsonPath = join(dir, 'package.json');

    if (packageJsonDeclaresAstro(packageJsonPath)) {
      return dir;
    }

    const parent = dirname(dir);

    if (parent === dir) {
      break;
    }

    dir = parent;
  }

  return null;
}

function canResolveAstroFrom(dir: string) {
  try {
    const require = createRequire(`${join(dir, '__storybook-astro-testing-resolve__.js')}`);

    require.resolve('astro/package.json');
    return true;
  } catch {
    return false;
  }
}

export async function resolveTestingProjectRoot(component: unknown) {
  const currentTestFilePath = await getCurrentTestFilePath();
  const componentModulePath = getComponentModuleFilePath(component);
  const candidates = [
    currentTestFilePath ? findNearestVitestConfigDir(currentTestFilePath) : null,
    currentTestFilePath ? findNearestAstroPackageDir(currentTestFilePath) : null,
    componentModulePath ? findNearestAstroPackageDir(componentModulePath) : null,
    packageJsonDeclaresAstro(join(process.cwd(), 'package.json')) ? process.cwd() : null,
    process.env.INIT_CWD && packageJsonDeclaresAstro(join(process.env.INIT_CWD, 'package.json'))
      ? process.env.INIT_CWD
      : null
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    if (canResolveAstroFrom(candidate)) {
      return candidate;
    }
  }

  return process.cwd();
}

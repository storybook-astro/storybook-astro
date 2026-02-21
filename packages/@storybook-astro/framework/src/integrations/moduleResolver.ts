import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

function toFileHref(filePath: string): string {
  return pathToFileURL(filePath).href;
}

export function resolveFrom(moduleName: string, fromDirectory: string): string {
  const fromFile = path.join(fromDirectory, '__storybook_astro_resolve__.js');

  return createRequire(toFileHref(fromFile)).resolve(moduleName);
}

function resolveFromCandidates(moduleName: string, primaryDirectory: string): string {
  const directories = [primaryDirectory, process.env.INIT_CWD].filter(
    (value): value is string => Boolean(value)
  );
  const visited = new Set<string>();
  let lastError: unknown;

  for (const directory of directories) {
    if (visited.has(directory)) {
      continue;
    }

    visited.add(directory);

    try {
      return resolveFrom(moduleName, directory);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

export async function importModule<T = unknown>(moduleName: string, resolveFrom = process.cwd()): Promise<T> {
  const resolvedPath = resolveFromCandidates(moduleName, resolveFrom);

  return import(toFileHref(resolvedPath)) as Promise<T>;
}

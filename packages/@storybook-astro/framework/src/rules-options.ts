import { existsSync, statSync } from 'node:fs';
import { extname, resolve } from 'node:path';

export type StoryRulesOptions =
  | string
  | {
      configFile: string;
    };

export function resolveRulesConfigFilePath(
  options?: StoryRulesOptions,
  resolveFrom = process.cwd()
): string | undefined {
  if (options === undefined) {
    return undefined;
  }

  const configFile = normalizeConfigFileOption(options);
  const resolvedConfigFilePath = resolve(resolveFrom, configFile);
  const normalizedConfigFilePath = resolveConfigFilePath(resolvedConfigFilePath);

  if (!normalizedConfigFilePath) {
    throw new Error(
      `framework.options.storyRules config file was not found: ${resolvedConfigFilePath}. ` +
        'Provide an existing path in framework.options.storyRules.'
    );
  }

  return normalizedConfigFilePath;
}

function normalizeConfigFileOption(options: StoryRulesOptions): string {
  const configFile =
    typeof options === 'string'
      ? options
      : typeof options === 'object' && options !== null
        ? options.configFile
        : undefined;

  if (typeof configFile !== 'string') {
    throw new Error(
      'framework.options.storyRules must be either a string path or an object with a string configFile.'
    );
  }

  const normalizedConfigFile = configFile.trim();

  if (!normalizedConfigFile) {
    throw new Error('framework.options.storyRules config file path cannot be empty.');
  }

  return normalizedConfigFile;
}

function resolveConfigFilePath(filePath: string): string | undefined {
  if (existsSync(filePath)) {
    const fileStats = statSync(filePath);

    if (fileStats.isFile()) {
      return filePath;
    }
  }

  if (extname(filePath)) {
    return undefined;
  }

  const extensions = ['.ts', '.mts', '.cts', '.js', '.mjs', '.cjs'];

  for (const extension of extensions) {
    const candidateFilePath = `${filePath}${extension}`;

    if (existsSync(candidateFilePath)) {
      return candidateFilePath;
    }
  }

  for (const extension of extensions) {
    const candidateFilePath = resolve(filePath, `index${extension}`);

    if (existsSync(candidateFilePath)) {
      return candidateFilePath;
    }
  }

  return undefined;
}

import { dirname, isAbsolute, resolve } from 'node:path';
import {
  createInlineStoryModuleMock,
  createPathStoryModuleMock,
  type StoryModuleMockEntry,
  type StoryModuleMockFactoryResult
} from './module-mocks.ts';
import type { RenderStoryInput } from './types.ts';

export type StoryRuleCleanup = () => void | Promise<void>;
type StoryRuleUseResult = void | StoryRuleCleanup | Promise<void | StoryRuleCleanup>;

export type StoryRuleMockFactory =
  () => StoryModuleMockFactoryResult | Promise<StoryModuleMockFactoryResult>;

export type StoryRuleMock = {
  (specifier: string, replacement: string): void;
  (specifier: string, factory: StoryRuleMockFactory): void;
};

export type StoryRuleUseContext = {
  story: StoryRuleStory;
  mock: StoryRuleMock;
};

export type StoryRuleUse = (context: StoryRuleUseContext) => StoryRuleUseResult;

export type StoryRule = {
  match: string | string[];
  use: StoryRuleUse | StoryRuleUse[];
};

export type StoryRulesConfig = {
  rules: StoryRule[];
};

export type StoryRuleStory = {
  id: string;
  title?: string;
  name?: string;
  keys: string[];
};

export type StoryRuleSelectionInput = {
  configModule: unknown;
  configFilePath?: string;
  story?: RenderStoryInput;
};

export type StoryRuleSelection = {
  moduleMocks: Map<string, StoryModuleMockEntry>;
  cleanups: StoryRuleCleanup[];
};

type MutableStoryRuleSelection = {
  moduleMocks: Map<string, StoryModuleMockEntry>;
  cleanups: StoryRuleCleanup[];
};

export function defineStoryRules(config: StoryRulesConfig): StoryRulesConfig {
  return config;
}

export async function selectStoryRules(
  input: StoryRuleSelectionInput
): Promise<StoryRuleSelection> {
  const config = normalizeRulesConfig(input.configModule);
  const story = normalizeStory(input.story);
  const selection = createEmptySelection();

  for (const rule of config.rules) {
    if (!isStoryRuleMatch(rule.match, story)) {
      continue;
    }

    const uses = Array.isArray(rule.use) ? rule.use : [rule.use];

    for (const use of uses) {
      const pendingModuleMocks: Promise<void>[] = [];

      if (typeof use !== 'function') {
        throw new Error('Each story rule "use" entry must be a function.');
      }

      const cleanup = await use({
        story,
        mock: ((specifier, replacementOrFactory) => {
          const normalizedSpecifier = normalizeMockSpecifier(specifier);

          if (typeof replacementOrFactory === 'function') {
            pendingModuleMocks.push(
              Promise.resolve(replacementOrFactory()).then((exportsObject) => {
                selection.moduleMocks.set(
                  normalizedSpecifier,
                  createInlineStoryModuleMock(normalizeMockFactoryResult(exportsObject))
                );

                return undefined;
              })
            );

            return;
          }

          const normalizedReplacement = normalizeMockReplacement(
            replacementOrFactory,
            input.configFilePath
          );

          selection.moduleMocks.set(normalizedSpecifier, createPathStoryModuleMock(normalizedReplacement));
        }) as StoryRuleMock
      });

      if (pendingModuleMocks.length > 0) {
        await Promise.all(pendingModuleMocks);
      }

      if (cleanup !== undefined) {
        if (typeof cleanup !== 'function') {
          throw new Error('Story rule "use" must return either nothing or a cleanup function.');
        }

        selection.cleanups.push(cleanup);
      }
    }
  }

  return selection;
}

export async function withStoryRuleCleanups<T>(
  cleanups: StoryRuleCleanup[],
  callback: () => Promise<T>
): Promise<T> {
  let result: T | undefined;
  let callbackError: unknown;

  try {
    result = await callback();
  } catch (error) {
    callbackError = error;
  }

  try {
    await runStoryRuleCleanups(cleanups);
  } catch (cleanupError) {
    if (callbackError) {
      throw new AggregateError(
        [callbackError, cleanupError],
        'Story rule execution and cleanup both failed.'
      );
    }

    throw cleanupError;
  }

  if (callbackError) {
    throw callbackError;
  }

  return result as T;
}

export async function runStoryRuleCleanups(cleanups: StoryRuleCleanup[]): Promise<void> {
  const errors: unknown[] = [];

  for (let index = cleanups.length - 1; index >= 0; index -= 1) {
    try {
      await cleanups[index]();
    } catch (error) {
      errors.push(error);
    }
  }

  if (errors.length === 1) {
    throw errors[0];
  }

  if (errors.length > 1) {
    throw new AggregateError(errors, 'Story rule cleanup failed.');
  }
}

function normalizeRulesConfig(configModule: unknown): StoryRulesConfig {
  const configExport = getRulesConfigExport(configModule);

  if (configExport === undefined || configExport === null) {
    return {
      rules: []
    };
  }

  if (!isRecord(configExport)) {
    throw new Error(
      'Story rules config must export an object with a "rules" array via a default export or named export.'
    );
  }

  const rules = configExport.rules;

  if (rules === undefined) {
    return {
      rules: []
    };
  }

  if (!Array.isArray(rules)) {
    throw new Error('Story rules config "rules" must be an array.');
  }

  return {
    rules: rules as StoryRule[]
  };
}

function getRulesConfigExport(configModule: unknown): unknown {
  if (!isRecord(configModule)) {
    return configModule;
  }

  if ('default' in configModule && configModule.default !== undefined) {
    return configModule.default;
  }

  if ('rules' in configModule) {
    return {
      rules: configModule.rules
    };
  }

  return undefined;
}

function normalizeStory(story?: RenderStoryInput): StoryRuleStory {
  const id = normalizeStoryId(story?.id);
  const title = normalizeOptionalString(story?.title);
  const name = normalizeOptionalString(story?.name);
  const keys = Array.from(resolveStoryKeys({ id, title, name }));

  return {
    id,
    title,
    name,
    keys
  };
}

function resolveStoryKeys(story: { id: string; title?: string; name?: string }) {
  const keys = new Set<string>();

  keys.add('');

  const storyId = story.id;
  const idPath = storyId ? storyId.replaceAll('--', '/') : '';

  if (storyId) {
    keys.add(storyId);
    keys.add(`/story/${storyId}`);
  }

  if (idPath) {
    keys.add(idPath);
    keys.add(`/story/${idPath}`);
  }

  const titlePath = story.title
    ? story.title
        .split('/')
        .map((segment) => slugify(segment))
        .filter(Boolean)
        .join('/')
    : '';

  const storyNamePath = story.name ? slugify(story.name) : '';

  if (titlePath && storyNamePath) {
    const composedPath = `${titlePath}/${storyNamePath}`;

    keys.add(composedPath);
    keys.add(`/story/${composedPath}`);
  }

  return keys;
}

function isStoryRuleMatch(match: string | string[], story: StoryRuleStory): boolean {
  const patterns = Array.isArray(match) ? match : [match];

  return patterns.some((pattern) => {
    if (typeof pattern !== 'string') {
      throw new Error('Story rule "match" must be a string or an array of strings.');
    }

    const normalizedPattern = pattern.trim();

    if (!normalizedPattern) {
      throw new Error('Story rule "match" cannot be empty.');
    }

    return story.keys.some((key) => isWildcardMatch(normalizedPattern, key));
  });
}

function isWildcardMatch(pattern: string, candidate: string): boolean {
  const escapedPattern = escapeRegExp(pattern).replaceAll('*', '.*');
  const regex = new RegExp(`^${escapedPattern}$`);

  return regex.test(candidate);
}

function normalizeStoryId(id?: string): string {
  const value = normalizeOptionalString(id) ?? '';

  if (!value) {
    return '';
  }

  return value.startsWith('/story/') ? value.slice('/story/'.length) : value;
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalizedValue = value.trim();

  return normalizedValue || undefined;
}

function normalizeMockSpecifier(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('Story rule mock specifier must be a string.');
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new Error('Story rule mock specifier cannot be empty.');
  }

  return normalizedValue;
}

function normalizeMockReplacement(value: unknown, configFilePath?: string): string {
  if (typeof value !== 'string') {
    throw new Error('Story rule mock replacement must be a string.');
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new Error('Story rule mock replacement cannot be empty.');
  }

  if (isAbsolute(normalizedValue)) {
    return toPosixPath(normalizedValue);
  }

  if (normalizedValue.startsWith('.')) {
    if (!configFilePath) {
      throw new Error(
        'Story rule mock replacement uses a relative path, but rules config path is unavailable.'
      );
    }

    return toPosixPath(resolve(dirname(configFilePath), normalizedValue));
  }

  return normalizedValue;
}

function normalizeMockFactoryResult(value: unknown): StoryModuleMockFactoryResult {
  if (!isRecord(value)) {
    throw new Error('Story rule mock factory must return an object of module exports.');
  }

  return value;
}

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function createEmptySelection(): MutableStoryRuleSelection {
  return {
    moduleMocks: new Map(),
    cleanups: []
  };
}

function toPosixPath(input: string): string {
  return input.replaceAll('\\', '/');
}

function escapeRegExp(input: string) {
  return input.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  return !Array.isArray(value);
}

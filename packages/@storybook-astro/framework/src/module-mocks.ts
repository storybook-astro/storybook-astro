const STORYBOOK_ASTRO_GET_MOCK_EXPORT = '__STORYBOOK_ASTRO_GET_STORY_MODULE_MOCK_EXPORT__';

export const STORYBOOK_ASTRO_INLINE_MODULE_PREFIX = 'virtual:storybook-astro-inline-module:';

export type StoryModuleMockEntry = {
  replacement: string;
  inlineModuleId?: string;
};

export type StoryModuleMockFactoryResult = Record<string, unknown>;

export type StoryModuleMocks = Map<string, StoryModuleMockEntry>;

type StoryModuleMocksGlobal = typeof globalThis & {
  __STORYBOOK_ASTRO_STORY_MODULE_MOCK_STATE__?: {
    activeModuleMocksStack: StoryModuleMocks[];
    inlineModuleExports: Map<string, StoryModuleMockFactoryResult>;
    inlineModuleSequence: number;
  };
  __STORYBOOK_ASTRO_GET_STORY_MODULE_MOCK_EXPORT__?: (moduleId: string, exportName: string) => unknown;
};

const moduleMocksGlobal = globalThis as StoryModuleMocksGlobal;

const moduleMockState =
  moduleMocksGlobal.__STORYBOOK_ASTRO_STORY_MODULE_MOCK_STATE__ ??
  (moduleMocksGlobal.__STORYBOOK_ASTRO_STORY_MODULE_MOCK_STATE__ = {
    activeModuleMocksStack: [],
    inlineModuleExports: new Map<string, StoryModuleMockFactoryResult>(),
    inlineModuleSequence: 0
  });

if (typeof moduleMocksGlobal[STORYBOOK_ASTRO_GET_MOCK_EXPORT] !== 'function') {
  moduleMocksGlobal[STORYBOOK_ASTRO_GET_MOCK_EXPORT] = getStoryModuleMockExport;
}

export async function withStoryModuleMocks<T>(
  moduleMocks: StoryModuleMocks,
  callback: () => Promise<T>
): Promise<T> {
  moduleMockState.activeModuleMocksStack.push(moduleMocks);

  try {
    return await callback();
  } finally {
    moduleMockState.activeModuleMocksStack.pop();
    cleanupInlineModuleMocks(moduleMocks);
  }
}

export function resolveStoryModuleMock(specifier: string): string | undefined {
  return getActiveModuleMocks()?.get(specifier)?.replacement;
}

export function createPathStoryModuleMock(replacement: string): StoryModuleMockEntry {
  return {
    replacement
  };
}

export function createInlineStoryModuleMock(
  exportsObject: StoryModuleMockFactoryResult
): StoryModuleMockEntry {
  const inlineModuleId = `storybook-astro-inline-module:${moduleMockState.inlineModuleSequence}`;

  moduleMockState.inlineModuleSequence += 1;
  moduleMockState.inlineModuleExports.set(inlineModuleId, exportsObject);

  return {
    replacement: `${STORYBOOK_ASTRO_INLINE_MODULE_PREFIX}${inlineModuleId}`,
    inlineModuleId
  };
}

export function loadStoryInlineModule(resolvedId: string): string | undefined {
  const inlineModuleId = normalizeInlineModuleId(resolvedId);

  if (!inlineModuleId) {
    return undefined;
  }

  const exportsObject = moduleMockState.inlineModuleExports.get(inlineModuleId);

  if (!exportsObject) {
    return undefined;
  }

  return createInlineModuleSource(inlineModuleId, exportsObject);
}

function cleanupInlineModuleMocks(moduleMocks: StoryModuleMocks) {
  for (const mockEntry of moduleMocks.values()) {
    if (mockEntry.inlineModuleId) {
      moduleMockState.inlineModuleExports.delete(mockEntry.inlineModuleId);
    }
  }
}

function getActiveModuleMocks(): StoryModuleMocks | undefined {
  return moduleMockState.activeModuleMocksStack[moduleMockState.activeModuleMocksStack.length - 1];
}

function getStoryModuleMockExport(moduleId: string, exportName: string): unknown {
  const exportsObject = moduleMockState.inlineModuleExports.get(moduleId);

  if (!exportsObject) {
    throw new Error(`Inline story module mock is unavailable: ${moduleId}`);
  }

  return exportsObject[exportName];
}

function createInlineModuleSource(
  inlineModuleId: string,
  exportsObject: StoryModuleMockFactoryResult
): string {
  const exportNames = Object.keys(exportsObject);
  const sourceLines = [
    `const getStoryModuleMockExport = globalThis.${STORYBOOK_ASTRO_GET_MOCK_EXPORT};`,
    "if (typeof getStoryModuleMockExport !== 'function') {",
    "  throw new Error('Inline story module mock helper is unavailable.');",
    '}',
    ''
  ];

  if (Object.prototype.hasOwnProperty.call(exportsObject, 'default')) {
    sourceLines.push(
      `export default getStoryModuleMockExport(${JSON.stringify(inlineModuleId)}, 'default');`
    );
  }

  for (const exportName of exportNames) {
    if (exportName === 'default') {
      continue;
    }

    assertValidExportName(exportName);
    sourceLines.push(
      `export const ${exportName} = getStoryModuleMockExport(${JSON.stringify(inlineModuleId)}, ${JSON.stringify(exportName)});`
    );
  }

  if (sourceLines[sourceLines.length - 1] === '') {
    sourceLines.push('export {};');
  }

  return sourceLines.join('\n');
}

function assertValidExportName(exportName: string) {
  if (!/^[$A-Z_a-z][$\w]*$/u.test(exportName)) {
    throw new Error(`Story module mock export name is invalid: ${exportName}`);
  }
}

function normalizeInlineModuleId(resolvedId: string): string | undefined {
  const normalizedId = resolvedId.startsWith('\0') ? resolvedId.slice(1) : resolvedId;

  if (!normalizedId.startsWith(STORYBOOK_ASTRO_INLINE_MODULE_PREFIX)) {
    return undefined;
  }

  return normalizedId.slice(STORYBOOK_ASTRO_INLINE_MODULE_PREFIX.length);
}

import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import type { Plugin } from 'vite';

const SWITCH_ID_PREFIX = '\0storybook-astro-mock-switch:';

/**
 * Story-rule mocks for server mode, whose built render app cannot reload modules per render.
 *
 * Every import of a specifier the rules file mocks is routed through a switch
 * module: it re-exports the real module as live `let` bindings, and the render
 * runtime points those bindings at the story's mock for the length of one
 * render (serverApp/moduleMockSwitches.ts). Specifiers match the import text,
 * exactly like the Vite runtime. A replacement-path mock's module is known from
 * the rules file, so the switch module imports it up front.
 */
export function moduleMockSwitchesPlugin(options: {
  rulesConfigFilePath?: string;
  /** The module that exports `registerModuleMockSwitch`, so the app holds one registry. */
  registryModule: string;
}): Plugin {
  const rulesConfigFilePath = options.rulesConfigFilePath;
  const moduleMocks = rulesConfigFilePath ? collectModuleMocks(rulesConfigFilePath) : new Map<string, string[]>();

  return {
    name: 'storybook-astro:module-mock-switches',
    enforce: 'pre',
    async resolveId(id, importer) {
      if (!moduleMocks.has(id) || !importer || importer.startsWith(SWITCH_ID_PREFIX)) {
        return null;
      }

      const realModule = await this.resolve(id, importer, { skipSelf: true });

      if (!realModule || realModule.external) {
        return null;
      }

      return `${SWITCH_ID_PREFIX}${JSON.stringify([id, realModule.id])}`;
    },
    async load(id) {
      if (!id.startsWith(SWITCH_ID_PREFIX)) {
        return null;
      }

      const [specifier, realModuleId] = JSON.parse(id.slice(SWITCH_ID_PREFIX.length)) as [
        string,
        string
      ];
      const realModule = await this.load({ id: realModuleId });
      const replacements: Record<string, string> = {};

      for (const replacement of moduleMocks.get(specifier) ?? []) {
        const resolved = await this.resolve(replacement, rulesConfigFilePath);

        if (!resolved) {
          throw new Error(`${rulesConfigFilePath}: cannot resolve the mock replacement ${replacement}`);
        }

        replacements[replacementKey(replacement, rulesConfigFilePath!)] = resolved.id;
      }

      return createSwitchModuleSource({
        specifier,
        realModuleId,
        replacements,
        registryModule: options.registryModule,
        exportNames: realModule.exports ?? []
      });
    }
  };
}

/**
 * Reads the string literals passed to `mock(...)` in the rules file: each
 * mocked specifier, with the replacement paths it is mocked with.
 */
export function collectModuleMocks(rulesConfigFilePath: string): Map<string, string[]> {
  const source = readFileSync(rulesConfigFilePath, 'utf-8');
  const moduleMocks = new Map<string, string[]>();

  for (const match of source.matchAll(/\bmock\(\s*(['"`])([^'"`]+)\1(?:\s*,\s*(['"`])([^'"`]+)\3)?/g)) {
    const [, , specifier, , replacement] = match;
    const replacements = moduleMocks.get(specifier) ?? [];

    if (replacement && !replacements.includes(replacement)) {
      replacements.push(replacement);
    }

    moduleMocks.set(specifier, replacements);
  }

  if (/\bmock\(\s*[^'"`\s)]/.test(source)) {
    throw new Error(
      `${rulesConfigFilePath}: server mode needs the module passed to mock() as a string literal, e.g. mock('./api.ts', ...).`
    );
  }

  return moduleMocks;
}

/** The replacement as `rules.ts` records it at render time: relative paths resolve against the rules file. */
function replacementKey(replacement: string, rulesConfigFilePath: string) {
  if (isAbsolute(replacement)) {
    return replacement.replace(/\\/g, '/');
  }

  if (replacement.startsWith('.')) {
    return resolve(dirname(rulesConfigFilePath), replacement).replace(/\\/g, '/');
  }

  return replacement;
}

export function createSwitchModuleSource(options: {
  specifier: string;
  realModuleId: string;
  /** Module ids of the replacement-path mocks, keyed as the render runtime names them. */
  replacements?: Record<string, string>;
  registryModule: string;
  exportNames: string[];
}) {
  const replacements = Object.entries(options.replacements ?? {});

  // `default` is not a valid binding name, so it gets a local alias.
  const bindings = options.exportNames.map((name) => ({
    name,
    local: name === 'default' ? 'defaultExport' : name
  }));

  return [
    `import * as real from ${JSON.stringify(options.realModuleId)};`,
    ...replacements.map(([, moduleId], index) => `import * as replacement${index} from ${JSON.stringify(moduleId)};`),
    `import { registerModuleMockSwitch } from ${JSON.stringify(options.registryModule)};`,
    `const replacements = { ${replacements.map(([key], index) => `${JSON.stringify(key)}: replacement${index}`).join(', ')} };`,
    ...bindings.map(({ name, local }) => `let ${local} = real[${JSON.stringify(name)}];`),
    `export { ${bindings.map(({ name, local }) => (name === local ? name : `${local} as ${name}`)).join(', ')} };`,
    `registerModuleMockSwitch(${JSON.stringify(options.specifier)}, (mock) => {`,
    '  const source = mock ? mock.exports ?? replacements[mock.replacement] : real;',
    '  if (!source) {',
    `    throw new Error(\`[storybook-astro] \${mock.replacement} replaces ${options.specifier} but is not in this build: pass it to mock() as a string literal.\`);`,
    '  }',
    ...bindings.map(
      ({ name, local }) =>
        `  ${local} = ${JSON.stringify(name)} in source ? source[${JSON.stringify(name)}] : real[${JSON.stringify(name)}];`
    ),
    '});'
  ].join('\n');
}

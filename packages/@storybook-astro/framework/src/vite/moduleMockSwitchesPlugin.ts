import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';

const SWITCH_ID_PREFIX = '\0storybook-astro-mock-switch:';

/**
 * Story-rule mocks for the compiled server, which cannot reload modules per render.
 *
 * Every import of a specifier the rules file mocks is routed through a switch
 * module: it re-exports the real module as live `let` bindings, and the render
 * runtime points those bindings at the story's mock for the length of one
 * render (server/moduleMockSwitches.ts). Specifiers match the import text,
 * exactly like the Vite runtime.
 */
export function moduleMockSwitchesPlugin(options: {
  rulesConfigFilePath?: string;
  /** Absolute path of server/moduleMockSwitches.ts, so the bundle holds one registry. */
  registryModulePath: string;
}): Plugin {
  const mockedSpecifiers = options.rulesConfigFilePath
    ? collectMockedSpecifiers(options.rulesConfigFilePath)
    : new Set<string>();

  return {
    name: 'storybook-astro:module-mock-switches',
    enforce: 'pre',
    async resolveId(id, importer) {
      if (!mockedSpecifiers.has(id) || !importer || importer.startsWith(SWITCH_ID_PREFIX)) {
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

      return createSwitchModuleSource({
        specifier,
        realModuleId,
        registryModulePath: options.registryModulePath,
        exportNames: realModule.exports ?? []
      });
    }
  };
}

/** Reads the string literals passed to `mock(...)` in the rules file. */
export function collectMockedSpecifiers(rulesConfigFilePath: string): Set<string> {
  const source = readFileSync(rulesConfigFilePath, 'utf-8');
  const specifiers = new Set<string>();

  for (const match of source.matchAll(/\bmock\(\s*(['"`])([^'"`]+)\1/g)) {
    specifiers.add(match[2]);
  }

  if (/\bmock\(\s*[^'"`\s)]/.test(source)) {
    throw new Error(
      `${rulesConfigFilePath}: compiled server builds need the module passed to mock() as a string literal, e.g. mock('./api.ts', ...).`
    );
  }

  return specifiers;
}

export function createSwitchModuleSource(options: {
  specifier: string;
  realModuleId: string;
  registryModulePath: string;
  exportNames: string[];
}) {
  // `default` is not a valid binding name, so it gets a local alias.
  const bindings = options.exportNames.map((name) => ({
    name,
    local: name === 'default' ? 'defaultExport' : name
  }));

  return [
    `import * as real from ${JSON.stringify(options.realModuleId)};`,
    `import { registerModuleMockSwitch } from ${JSON.stringify(options.registryModulePath)};`,
    ...bindings.map(({ name, local }) => `let ${local} = real[${JSON.stringify(name)}];`),
    `export { ${bindings.map(({ name, local }) => (name === local ? name : `${local} as ${name}`)).join(', ')} };`,
    `registerModuleMockSwitch(${JSON.stringify(options.specifier)}, (mocked) => {`,
    ...bindings.map(
      ({ name, local }) =>
        `  ${local} = mocked && ${JSON.stringify(name)} in mocked ? mocked[${JSON.stringify(name)}] : real[${JSON.stringify(name)}];`
    ),
    '});'
  ].join('\n');
}

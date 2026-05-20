import { dirname, relative, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Integration } from '../integrations/index.ts';
import { resolveRulesConfigFilePath } from '../rules-options.ts';
import type { FrameworkOptions } from '../types.ts';
import { createVirtualModule } from './virtualModulePlugin.ts';

export const SERVER_RUNTIME_MODULE_ID = 'virtual:storybook-astro/server-runtime';

// Virtual modules have no filesystem path, so relative imports in their
// generated source can't be resolved by Rollup. Resolve the integrations
// module to an absolute path against this plugin file's location.
const INTEGRATIONS_MODULE_PATH = resolvePath(
  dirname(fileURLToPath(import.meta.url)),
  '../integrations/index.ts'
);

export function serverRuntimePlugin(options: {
  integrations?: FrameworkOptions['integrations'];
  storyRules?: FrameworkOptions['storyRules'];
  resolveFrom: string;
  snapshotDirName: string;
  componentPathMap: Record<string, string>;
  staticModuleMap: Record<string, string>;
  trackedSpecifiers: string[];
}) {
  return createVirtualModule({
    pluginName: 'storybook-astro:server-runtime',
    virtualModuleId: SERVER_RUNTIME_MODULE_ID,
    load() {
      const storyRulesConfigFilePath = resolveRulesConfigFilePath(options.storyRules, options.resolveFrom);
      const storyRulesConfigRelativePath = storyRulesConfigFilePath
        ? relative(options.resolveFrom, storyRulesConfigFilePath).replace(/\\/g, '/')
        : undefined;

      return [
        createIntegrationImports(options.integrations ?? []),
        `export const storybookAstroServerRuntimeSnapshotDirName = ${JSON.stringify(options.snapshotDirName)};`,
        `export const storybookAstroServerRuntimeStoryRulesConfigRelativePath = ${serializeValue(storyRulesConfigRelativePath)};`,
        `export const storybookAstroServerRuntimeComponentPathMap = ${serializeValue(options.componentPathMap)};`,
        `export const storybookAstroServerRuntimeStaticModuleMap = ${serializeValue(options.staticModuleMap)};`,
        `export const storybookAstroServerRuntimeTrackedSpecifiers = ${serializeValue(options.trackedSpecifiers)};`,
        `export const storybookAstroServerRuntimeIntegrations = [${createIntegrationFactoryCalls(options.integrations ?? [])}];`
      ].join('\n');
    }
  });
}

// Maps Integration.name (public identifier used in story args, see
// testing/integration-config.ts) to the factory export in integrations/index.ts.
// Most names match their factory export 1:1; alpine is the exception.
const INTEGRATION_FACTORY_NAMES: Record<string, string> = {
  alpine: 'alpinejs'
};

function getIntegrationFactoryName(integration: Integration): string {
  return INTEGRATION_FACTORY_NAMES[integration.name] ?? integration.name;
}

function createIntegrationImports(integrations: Integration[]) {
  const factoryNames = Array.from(new Set(integrations.map(getIntegrationFactoryName)));

  if (factoryNames.length === 0) {
    return '';
  }

  return `import { ${factoryNames.join(', ')} } from ${JSON.stringify(INTEGRATIONS_MODULE_PATH)};`;
}

function createIntegrationFactoryCalls(integrations: Integration[]) {
  return integrations
    .map((integration) => `${getIntegrationFactoryName(integration)}(${serializeValue(integration.options)})`)
    .join(', ');
}

function serializeValue(value: unknown): string {
  if (value === undefined) {
    return 'undefined';
  }

  if (value === null) {
    return 'null';
  }

  if (typeof value === 'string') {
    return JSON.stringify(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }

  if (value instanceof RegExp) {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => serializeValue(entry)).join(', ')}]`;
  }

  if (isRecord(value)) {
    return `{${Object.entries(value)
      .map(([key, entryValue]) => `${JSON.stringify(key)}: ${serializeValue(entryValue)}`)
      .join(', ')}}`;
  }

  throw new Error('Unable to serialize Storybook Astro server runtime configuration.');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

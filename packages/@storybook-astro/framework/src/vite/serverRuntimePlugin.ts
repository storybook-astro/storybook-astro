import { relative } from 'node:path';
import type { Integration } from '../integrations/index.ts';
import { resolveRulesConfigFilePath } from '../rules-options.ts';
import type { FrameworkOptions } from '../types.ts';
import { createVirtualModule } from './virtualModulePlugin.ts';

export const SERVER_RUNTIME_MODULE_ID = 'virtual:storybook-astro/server-runtime';
const integrationsModuleId = '@storybook-astro/framework/integrations';

// Most integrations' `name` matches their factory export 1:1. Alpine is the
// exception: AlpineIntegration.name is 'alpine' but the factory export is
// `alpinejs`. Without this map, the generated runtime module would emit
// `import { alpine } from '...'` and the build would fail with MISSING_EXPORT.
const INTEGRATION_FACTORY_NAMES: Record<string, string> = {
  alpine: 'alpinejs'
};

function getIntegrationFactoryName(integration: Integration): string {
  return INTEGRATION_FACTORY_NAMES[integration.name] ?? integration.name;
}

/** Produces the virtual module that hands the standalone render server its build-time config. */
export function serverRuntimePlugin(options: {
  integrations?: FrameworkOptions['integrations'];
  storyRules?: FrameworkOptions['storyRules'];
  resolveFrom: string;
  snapshotDirName: string;
  componentPathMap: Record<string, string>;
  staticModuleMap: Record<string, string>;
  staticCssMap: Record<string, string[]>;
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
      const integrations = options.integrations ?? [];
      // Keep the generated module small: one config object for plain data,
      // one integrations export for real factory calls.
      const runtimeConfig = {
        snapshotDirName: options.snapshotDirName,
        storyRulesConfigRelativePath,
        componentPathMap: options.componentPathMap,
        staticModuleMap: options.staticModuleMap,
        staticCssMap: options.staticCssMap,
        trackedSpecifiers: options.trackedSpecifiers
      };

      return [
        createIntegrationImports(integrations),
        `export const runtimeConfig = ${serializeValue(runtimeConfig)};`,
        `export const integrations = [${createIntegrationFactoryCalls(integrations)}];`
      ].join('\n');
    }
  });
}

/** Imports only the integration factories used by this runtime bundle. */
function createIntegrationImports(integrations: Integration[]) {
  const factoryNames = Array.from(new Set(integrations.map(getIntegrationFactoryName)));

  if (factoryNames.length === 0) {
    return '';
  }

  return `import { ${factoryNames.join(', ')} } from ${JSON.stringify(integrationsModuleId)};`;
}

/** Recreates the configured integration list inside the generated runtime module. */
function createIntegrationFactoryCalls(integrations: Integration[]) {
  return integrations
    .map((integration) => `${getIntegrationFactoryName(integration)}(${serializeValue(integration.options)})`)
    .join(', ');
}

/** Serializes plain runtime config values into executable module source. */
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

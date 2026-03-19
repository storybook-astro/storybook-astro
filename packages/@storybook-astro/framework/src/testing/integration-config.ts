import { resolve as resolvePath } from 'node:path';
import type { Integration } from '../integrations/base.ts';
import {
  alpinejs,
  preact,
  react,
  solid,
  svelte,
  vue,
} from '../integrations/index.ts';

const TESTING_INTEGRATIONS_ENV = 'STORYBOOK_ASTRO_TESTING_INTEGRATIONS';

type SerializedIntegration = {
  name: string;
  options: unknown;
};

type SerializedIntegrationMap = Record<string, SerializedIntegration[]>;

const REGEXP_TAG = '__storybookAstroRegExp';

function replacer(_key: string, value: unknown): unknown {
  if (value instanceof RegExp) {
    return {
      [REGEXP_TAG]: true,
      source: value.source,
      flags: value.flags
    };
  }

  return value;
}

function reviver(_key: string, value: unknown): unknown {
  if (
    value &&
    typeof value === 'object' &&
    REGEXP_TAG in value &&
    (value as Record<string, unknown>)[REGEXP_TAG] === true
  ) {
    const source = (value as Record<string, unknown>).source;
    const flags = (value as Record<string, unknown>).flags;

    if (typeof source === 'string' && typeof flags === 'string') {
      return new RegExp(source, flags);
    }
  }

  return value;
}

function readIntegrationMapFromEnv(): SerializedIntegrationMap {
  const raw = process.env[TESTING_INTEGRATIONS_ENV];

  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw, reviver);

    if (!parsed || typeof parsed !== 'object') {
      return {};
    }

    return parsed as SerializedIntegrationMap;
  } catch {
    return {};
  }
}

function writeIntegrationMapToEnv(value: SerializedIntegrationMap) {
  process.env[TESTING_INTEGRATIONS_ENV] = JSON.stringify(value, replacer);
}

function serializeIntegration(integration: Integration): SerializedIntegration {
  return {
    name: integration.name,
    options: integration.options
  };
}

function deserializeIntegration(integration: SerializedIntegration): Integration {
  switch (integration.name) {
    case 'react':
      return react(integration.options as Parameters<typeof react>[0]);
    case 'solid':
      return solid(integration.options as Parameters<typeof solid>[0]);
    case 'preact':
      return preact(integration.options as Parameters<typeof preact>[0]);
    case 'vue':
      return vue(integration.options as Parameters<typeof vue>[0]);
    case 'svelte':
      return svelte(integration.options as Parameters<typeof svelte>[0]);
    case 'alpine':
      return alpinejs(integration.options as Parameters<typeof alpinejs>[0]);
    default:
      throw new Error(`Unknown testing integration: ${integration.name}`);
  }
}

export function registerTestingIntegrationsForRoot(root: string, integrations: Integration[]) {
  const normalizedRoot = resolvePath(root);
  const integrationMap = readIntegrationMapFromEnv();

  integrationMap[normalizedRoot] = integrations.map(serializeIntegration);
  writeIntegrationMapToEnv(integrationMap);
}

export function resolveTestingIntegrationsForRoot(root: string): Integration[] {
  const normalizedRoot = resolvePath(root);
  const integrationMap = readIntegrationMapFromEnv();
  const integrations = integrationMap[normalizedRoot];

  if (!integrations) {
    return [];
  }

  return integrations.map(deserializeIntegration);
}

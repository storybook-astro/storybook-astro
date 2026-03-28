import { defineConfig as defineVitestConfig } from 'vitest/config';
import { createLogger } from 'vite';
import { fileURLToPath } from 'node:url';
import type { InlineConfig, PluginOption } from 'vite';
import type { Integration } from '../integrations/base.ts';
import { importAstroConfig } from '../importAstroConfig.ts';
import { vitePluginAstroComponentMarker } from '../vitePluginAstroComponentMarker.ts';
import { registerTestingIntegrationsForRoot } from '../testing/integration-config.ts';
import { cjsInteropPlugin, vitestPatchForSolidJs } from './vite-plugins.ts';

/**
 * Creates a Vite logger that suppresses known benign warnings in the test context:
 * - "Missing pages directory" — Astro warns when no src/pages exists, but component
 *   tests don't use pages so this is always safe to ignore.
 * - "points to missing source files" — Sourcemap warnings from the `entities` package
 *   which ships without source files. Not actionable.
 */
function createTestLogger() {
  const logger = createLogger();
  const originalWarn = logger.warn.bind(logger);

  logger.warn = (msg, options) => {
    if (
      msg.includes('Missing pages directory') ||
      msg.includes('points to missing source files') ||
      msg.includes('Failed to load source map for')
    ) {
      return;
    }

    originalWarn(msg, options);
  };

  return logger;
}

// Type definition omits 'test' to allow Vitest-specific config options
// Vite 8 type definitions conflict with Vitest config when used in monorepo
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Vitest config requires any type for test option
export type TestingDefineConfig = Omit<InlineConfig, 'plugins' | 'test'> & {
  integrations?: Integration[];
  plugins?: PluginOption[];
  astroConfigFile?: false | string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  test?: any;
};

function normalizeGlobalSetup(globalSetup: string | string[] | undefined, value: string) {
  // Inject our setup without clobbering any user-provided global setup hooks.
  if (!globalSetup) {
    return [value];
  }

  if (Array.isArray(globalSetup)) {
    if (globalSetup.includes(value)) {
      return globalSetup;
    }

    return [...globalSetup, value];
  }

  if (globalSetup === value) {
    return [globalSetup];
  }

  return [globalSetup, value];
}

export function defineConfig(options: TestingDefineConfig) {
  const {
    integrations = [],
    plugins = [],
    root = process.cwd(),
    mode = 'test',
    astroConfigFile = false,
    ...rest
  } = options;

  registerTestingIntegrationsForRoot(root, integrations);

  const globalSetupFilePath = fileURLToPath(new URL('./global-setup.ts', import.meta.url));
  const testConfig = {
    ...rest.test,
    globalSetup: normalizeGlobalSetup(rest.test?.globalSetup, globalSetupFilePath)
  };

  // Cast to any to work around Vite 8 type conflicts in monorepo environments
  // where multiple Vite versions exist in node_modules
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Type conflict with Vite 8 in monorepo
  const vitestConfig = defineVitestConfig({
    ...rest,
    root,
    mode,
    test: testConfig,
    plugins: [
      cjsInteropPlugin(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vitePluginAstroComponentMarker() as any,
      ...plugins
    ]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  const astroConfigFactoryPromise = Promise
    .all([
      importAstroConfig(root),
      Promise.all(integrations.map((integration) => integration.loadIntegration(root)))
    ])
    .then(([astroConfigModule, resolvedIntegrations]) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      astroConfigModule.getViteConfig(vitestConfig as any, {
        configFile: astroConfigFile,
        integrations: [...resolvedIntegrations, vitestPatchForSolidJs()]
      })
    );

  const testLogger = createTestLogger();

  return async ({ mode: viteMode, command }: { mode: string; command: 'build' | 'serve' }) => {
    const astroConfigFactory = await astroConfigFactoryPromise;
    const config = await astroConfigFactory({ mode: viteMode, command });

    // Inject the logger — this overrides any logger Astro may have set,
    // which is intentional since we only filter benign test-context noise.
    config.customLogger = testLogger;

    return config;
  };
}

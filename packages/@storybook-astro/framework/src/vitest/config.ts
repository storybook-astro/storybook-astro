import { defineConfig as defineVitestConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import type { InlineConfig, PluginOption } from 'vite';
import type { Integration } from '../integrations/base.ts';
import { importAstroConfig } from '../importAstroConfig.ts';
import { vitePluginAstroComponentMarker } from '../vitePluginAstroComponentMarker.ts';
import { registerTestingIntegrationsForRoot } from '../testing/integration-config.ts';
import { cjsInteropPlugin, vitestPatchForSolidJs } from './vite-plugins.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TestingDefineConfig = Omit<InlineConfig, 'plugins' | 'test'> & {
  integrations?: Integration[];
  plugins?: PluginOption[];
  astroConfigFile?: false | string;
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  return async ({ mode: viteMode, command }: { mode: string; command: 'build' | 'serve' }) => {
    const astroConfigFactory = await astroConfigFactoryPromise;

    return astroConfigFactory({ mode: viteMode, command });
  };
}

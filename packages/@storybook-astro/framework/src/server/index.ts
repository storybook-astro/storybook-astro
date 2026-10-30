/// <reference path="../virtual.d.ts" />

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProductionRenderRuntime } from '../productionRenderRuntime.ts';
import sanitization from 'virtual:storybook-astro/sanitize-config';
import storyRulesConfigModule, {
  storybookAstroStoryRulesConfigFilePath
} from 'virtual:storybook-astro/story-rules';
import {
  integrations,
  runtimeConfig
} from 'virtual:storybook-astro/server-runtime';
import { createRenderServerApp } from './app.ts';

const staticModuleMap = resolveStaticModuleMap();

export default createRenderServerApp({
  renderAstroStory: createAstroStoryRenderer(),
  staticModuleMap,
  staticCssMap: runtimeConfig.staticCssMap
});

/** Combines the build-time module map with snapshot aliases resolved against
 * THIS host's filesystem — the build machine's absolute snapshot paths never
 * match the deploy host (e.g. /var/task on Vercel), so rendered island URLs
 * would otherwise keep unrewritten snapshot prefixes. */
function resolveStaticModuleMap() {
  const serverRootDir = dirname(fileURLToPath(import.meta.url));
  const resolvedMap: Record<string, string> = { ...runtimeConfig.staticModuleMap };

  for (const [snapshotRelativePath, builtPath] of Object.entries(
    runtimeConfig.snapshotModuleAliasMap ?? {}
  )) {
    resolvedMap[resolve(serverRootDir, snapshotRelativePath).replace(/\\/g, '/')] = builtPath;
  }

  return resolvedMap;
}

/** Creates the server-mode Astro story renderer from the shared production runtime. */
async function createAstroStoryRenderer() {
  const snapshotRoot = resolve(
    dirname(fileURLToPath(import.meta.url)),
    runtimeConfig.snapshotDirName
  );
  const storyRulesConfigFilePath = runtimeConfig.storyRulesConfigRelativePath
    ? resolve(snapshotRoot, runtimeConfig.storyRulesConfigRelativePath)
    : undefined;
  const runtime = await createProductionRenderRuntime({
    integrations,
    sanitization: sanitization ?? undefined,
    storyRulesConfigFilePath,
    // The rules module is compiled into this bundle at build time — loading
    // the snapshot's .ts copy at runtime breaks on hosts that transpile or
    // drop TypeScript sources from the deployed bundle (Vercel does both).
    preloadedRulesConfigModule: storybookAstroStoryRulesConfigFilePath
      ? storyRulesConfigModule
      : undefined,
    staticModuleMap,
    trackedSpecifiers: new Set(runtimeConfig.trackedSpecifiers),
    resolveFrom: snapshotRoot,
    resolveComponentId: (componentId: string) =>
      resolveSnapshotComponentPath(snapshotRoot, componentId),
    renderWithoutProjectIntegrationsOnFailure: true
  });

  return runtime.renderAstroStory;
}

/** Resolves one original component id to the copied file inside the runtime snapshot. */
function resolveSnapshotComponentPath(snapshotRoot: string, componentId: string) {
  const snapshotComponentPath = runtimeConfig.componentPathMap[componentId];

  if (snapshotComponentPath) {
    return resolve(snapshotRoot, snapshotComponentPath);
  }

  return componentId;
}

/// <reference path="../virtual.d.ts" />

import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { ensureAstroPassthroughImageService } from '../astroImageService.ts';
import { createAstroRenderHandler } from '../astroRenderHandler.ts';
import { resolveStoryModuleMock } from '../module-mocks.ts';
import sanitization from 'virtual:storybook-astro/sanitize-config';
import storyRulesConfigModule, {
  storybookAstroStoryRulesConfigFilePath
} from 'virtual:storybook-astro/story-rules';
import { addRenderers, resolveClientModules } from 'virtual:astro-container-renderers';
import {
  components,
  staticCssMap,
  staticModuleMap
} from 'virtual:storybook-astro/compiled-runtime';
import { createRenderServerApp } from './app.ts';
import { applyModuleMockSwitches } from './moduleMockSwitches.ts';

/**
 * The render server for hosts that cannot run Vite (e.g. Cloudflare Workers).
 * Every story component, renderer and the story rules are compiled into this
 * bundle at build time, so a render only imports and runs already-built code.
 */
export default createRenderServerApp({
  renderAstroStory: createAstroStoryRenderer(),
  staticModuleMap,
  staticCssMap
});

async function createAstroStoryRenderer() {
  ensureAstroPassthroughImageService();

  const container = await AstroContainer.create({
    resolve: async (specifier) =>
      resolveStoryModuleMock(specifier) ?? resolveClientModules(specifier) ?? specifier
  });

  addRenderers(container);

  return createAstroRenderHandler({
    container,
    sanitization: sanitization ?? undefined,
    rulesConfigFilePath: storybookAstroStoryRulesConfigFilePath,
    resolveRulesConfigModule: () =>
      storybookAstroStoryRulesConfigFilePath ? storyRulesConfigModule : undefined,
    loadModule: loadComponentModule,
    applyModuleMocks: applyModuleMockSwitches
  });
}

async function loadComponentModule(componentId: string) {
  const loadComponent = components[componentId];

  if (!loadComponent) {
    throw new Error(`Astro component is not part of this Storybook build: ${componentId}`);
  }

  return loadComponent();
}

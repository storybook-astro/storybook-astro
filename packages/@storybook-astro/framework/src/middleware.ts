/// <reference path="./virtual.d.ts" />

import { pathToFileURL } from 'node:url';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { ensureAstroPassthroughImageService } from './astroImageService.ts';
import { createAstroRenderHandler, type HandlerProps } from './astroRenderHandler.ts';
import type { Integration } from './integrations/index.ts';
import type { SanitizationOptions } from './lib/sanitization.ts';
import { resolveStoryModuleMock } from './module-mocks.ts';
import { resolveAliasedIsland } from './lib/resolve-aliased-island.ts';
import { addRenderers, resolveClientModules } from 'virtual:astro-container-renderers';

type ResolveRulesConfigModule = () => unknown | Promise<unknown>;

type HandlerFactoryOptions = {
  sanitization?: SanitizationOptions;
  rulesConfigFilePath?: string;
  resolveRulesConfigModule?: ResolveRulesConfigModule;
  loadModule?: (id: string) => Promise<{ default: unknown }>;
  invalidateModuleGraph?: () => void;
  resolveModule?: (specifier: string) => string | undefined;
};

export type { HandlerProps };

export async function handlerFactory(
  _integrations: Integration[],
  options?: HandlerFactoryOptions
) {
  ensureAstroPassthroughImageService();

  const container = await AstroContainer.create({
    resolve: async (specifier) => {
      const mockedModule = resolveStoryModuleMock(specifier);

      if (mockedModule) {
        return mockedModule;
      }

      const customResolution = options?.resolveModule?.(specifier);

      if (customResolution) {
        return customResolution;
      }

      if (specifier.startsWith('astro:scripts')) {
        return `/@id/${specifier}`;
      }

      const resolution = resolveClientModules(specifier);

      if (resolution) {
        return resolution;
      }

      // Last resort: an island imported via a tsconfig path alias (e.g. `@/...`)
      // has its raw aliased specifier baked into the island's component-url.
      // Resolve it to an on-disk file and hand back a `/@fs/` URL the dev Vite
      // server can serve so the island still hydrates.
      const aliasedIsland = resolveAliasedIsland(specifier, process.cwd());

      if (aliasedIsland) {
        return `/@fs/${aliasedIsland}`;
      }

      return specifier;
    }
  });

  addRenderers(container);

  const loadModule =
    options?.loadModule ??
    ((id: string) => {
      const normalizedId = /^[a-zA-Z]:[/\\]/.test(id) ? pathToFileURL(id).href : id;

      return import(/* @vite-ignore */ normalizedId);
    });

  return createAstroRenderHandler({
    container,
    sanitization: options?.sanitization,
    rulesConfigFilePath: options?.rulesConfigFilePath,
    resolveRulesConfigModule: options?.resolveRulesConfigModule,
    loadModule,
    invalidateModuleGraph: options?.invalidateModuleGraph
  });
}

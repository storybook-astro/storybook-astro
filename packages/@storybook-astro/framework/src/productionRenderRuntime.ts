import { resolve } from 'node:path';
import { createAstroRenderHandler, type HandlerProps } from './astroRenderHandler.ts';
import { separateStorySlots } from './lib/separate-story-slots.ts';
import type { Integration } from './integrations/index.ts';
import type { SanitizationOptions } from './lib/sanitization.ts';
import type { FrameworkOptions } from './types.ts';
import {
  createClientModuleResolver,
  createProductionAstroContainer,
  createStorySsrViteServer,
  loadRulesConfigModule
} from './storySsrVite.ts';

type LoadedStoryModule = Record<string, unknown>;

export type ProductionRenderRuntime = {
  loadModule: (moduleId: string) => Promise<LoadedStoryModule>;
  renderAstroStory: (data: HandlerProps) => Promise<string>;
  close: () => Promise<void>;
};

export type ProductionStoryEntry = {
  id: string;
  importPath: string;
  componentPath: string;
  exportName: string;
  title?: string;
  name?: string;
};

type ProductionRenderRuntimeOptions = {
  integrations: Integration[];
  sanitization?: SanitizationOptions;
  storyRulesConfigFilePath?: string;
  staticModuleMap: Record<string, string>;
  trackedSpecifiers: Set<string>;
  resolveFrom: string;
  resolveComponentId?: (id: string) => string;
  fonts?: FrameworkOptions['fonts'];
};

/** Creates the shared SSR runtime used by both build-time prerendering and the standalone render server. */
export async function createProductionRenderRuntime(
  options: ProductionRenderRuntimeOptions
): Promise<ProductionRenderRuntime> {
  const viteServer = await createStorySsrViteServer({
    integrations: options.integrations,
    trackedSpecifiers: options.trackedSpecifiers,
    resolveFrom: options.resolveFrom,
    fonts: options.fonts
  });

  try {
    const rulesConfigModule = await loadRulesConfigModule(
      viteServer,
      options.storyRulesConfigFilePath
    );
    const resolveClientModule = createClientModuleResolver(
      options.integrations,
      options.staticModuleMap
    );
    const astroContainer = await createProductionAstroContainer({
      integrations: options.integrations,
      resolveClientModule,
      viteServer,
      resolveFrom: options.resolveFrom
    });

    const loadModule = async (moduleId: string) => {
      return (await viteServer.ssrLoadModule(
        options.resolveComponentId?.(moduleId) ?? moduleId
      )) as LoadedStoryModule;
    };
    const renderAstroStory = createAstroRenderHandler({
      container: astroContainer,
      sanitization: options.sanitization,
      rulesConfigFilePath: options.storyRulesConfigFilePath,
      resolveRulesConfigModule: () => rulesConfigModule,
      loadModule: async (moduleId: string) => {
        const loadedModule = await loadModule(moduleId);

        return {
          default: loadedModule.default
        };
      },
      invalidateModuleGraph: () => {
        viteServer.moduleGraph.invalidateAll();
      }
    });

    return {
      loadModule,
      renderAstroStory,
      close: () => viteServer.close()
    };
  } catch (error) {
    await viteServer.close();
    throw error;
  }
}

/** Loads one Astro story module, merges its args, and renders the Astro component to HTML. */
export async function renderProductionStoryToHtml(options: {
  story: ProductionStoryEntry;
  runtime: ProductionRenderRuntime;
  resolveFrom: string;
}) {
  const storyModulePath = resolveProjectImportPath(options.story.importPath, options.resolveFrom);
  const componentPath = resolveProjectImportPath(options.story.componentPath, options.resolveFrom);
  const storyModule = await options.runtime.loadModule(storyModulePath);
  const { metaComponent, metaArgs, storyComponent, storyLevelArgs } = resolveStoryAnnotations(
    storyModule,
    options.story.exportName
  );

  if (typeof metaComponent !== 'function') {
    throw new Error(
      `Unable to prerender story "${options.story.id}". Missing component in ${options.story.importPath}.`
    );
  }

  // Build-time prerender only supports stories that keep the meta-level Astro component.
  if (storyComponent && storyComponent !== metaComponent) {
    return undefined;
  }

  const storyArgs = mergeMetaArgsWithStoryArgs(metaArgs, storyLevelArgs);
  const { componentArgs, storySlots } = separateStorySlots(storyArgs);

  return options.runtime.renderAstroStory({
    component: componentPath,
    args: componentArgs,
    slots: storySlots,
    story: {
      id: options.story.id,
      title: options.story.title,
      name: options.story.name
    }
  });
}

/**
 * Reads the meta- and story-level component and args for one story export,
 * supporting both authoring styles:
 *
 * - CSF3: the meta is the module's default export and the named export holds the
 *   story's own args/component.
 * - CSF4 factories: there is no default export. The named export is a
 *   `{ _tag: 'Story', input, meta }` object produced by `meta.story()`, where the
 *   meta-level annotations live on `meta.input`.
 */
function resolveStoryAnnotations(storyModule: LoadedStoryModule, exportName: string) {
  const rawStoryExport: unknown = storyModule[exportName];

  if (isRecord(rawStoryExport) && rawStoryExport._tag === 'Story') {
    const storyInput = toRecord(rawStoryExport.input) ?? {};
    const meta = isRecord(rawStoryExport.meta) ? rawStoryExport.meta : {};
    const metaInput = toRecord(meta.input) ?? {};

    return {
      metaComponent: metaInput.component,
      metaArgs: toRecord(metaInput.args),
      storyComponent: storyInput.component,
      storyLevelArgs: toRecord(storyInput.args)
    };
  }

  const defaultStoryMeta = isRecord(storyModule.default) ? storyModule.default : {};
  const selectedStoryExport = isRecord(rawStoryExport) ? rawStoryExport : {};

  return {
    metaComponent: defaultStoryMeta.component,
    metaArgs: toRecord(defaultStoryMeta.args),
    storyComponent: selectedStoryExport.component,
    storyLevelArgs: toRecord(selectedStoryExport.args)
  };
}

function resolveProjectImportPath(importPath: string, resolveFrom: string) {
  if (importPath.startsWith('./') || importPath.startsWith('../')) {
    return resolve(resolveFrom, importPath);
  }

  return importPath;
}

function mergeMetaArgsWithStoryArgs(
  metaArgs: Record<string, unknown> | undefined,
  storyArgs: Record<string, unknown> | undefined
) {
  return {
    ...(metaArgs ?? {}),
    ...(storyArgs ?? {})
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  return value;
}

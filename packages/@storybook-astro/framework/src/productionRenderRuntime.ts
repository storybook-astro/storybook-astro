import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ViteDevServer } from 'vite';
import { isAstroComponentSlot, serializeAstroComponentMarkers, type SlotValue } from '@storybook-astro/renderer/types';
import { createAstroRenderHandler, type HandlerProps } from './astroRenderHandler.ts';
import { separateStorySlots } from './lib/separate-story-slots.ts';
import { ssrLoadModuleWithFsFallback } from './lib/ssr-load-module-with-fs-fallback.ts';
import { composeStory } from './portable-stories.ts';
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
  /**
   * Composes an Astro story's decorators (Decorator Support, Step 4 — Gap A)
   * into the `SlotValue` tree `astroRenderHandler.ts` resolves as
   * `HandlerProps.node`. Returns `undefined` when the story has no decorators
   * (or is a CSF4 story-factory export, not supported here yet — see the inline
   * note below), so the caller keeps rendering it exactly as before.
   */
  composeDecoratedTree: (options: {
    storyModule: LoadedStoryModule;
    exportName: string;
  }) => Promise<SlotValue | undefined>;
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
  /** Rules module compiled into the caller's bundle — skips runtime loading. */
  preloadedRulesConfigModule?: unknown;
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
    const rulesConfigModule =
      options.preloadedRulesConfigModule ??
      (await loadRulesConfigModule(viteServer, options.storyRulesConfigFilePath));
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
    const previewProjectAnnotations = await loadPreviewProjectAnnotations(
      viteServer,
      options.resolveFrom
    );

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

    const composeDecoratedTree = async ({
      storyModule,
      exportName
    }: {
      storyModule: LoadedStoryModule;
      exportName: string;
    }): Promise<SlotValue | undefined> => {
      const rawStoryExport = storyModule[exportName];

      // CSF4 story-factory exports (`meta.story()`) aren't supported by
      // `composeStory` directly, and this SSR server stubs `@storybook/preview`
      // to a minimal factory (storySsrVite.ts) specifically so those modules can
      // load at all under Node — the real preview.ts (and any decorators
      // declared there) is never consulted for a CSF4 story either way. Leave
      // these stories on the existing undecorated path (docs/DECORATOR_SUPPORT.md,
      // Step 6 tracks CSF4 decorator coverage).
      if (isRecord(rawStoryExport) && rawStoryExport._tag === 'Story') {
        return undefined;
      }

      const meta = storyModule.default;

      if (!isRecord(meta)) {
        return undefined;
      }

      // `composeStory` (portable-stories.ts) merges in `applyDecorators` by
      // default, same as `render` — no need to pass it explicitly here.
      const composedStory = composeStory(
        rawStoryExport as never,
        meta as never,
        previewProjectAnnotations as never,
        exportName
      );
      const tree: unknown = await composedStory();

      if (!isAstroComponentSlot(tree) && !Array.isArray(tree)) {
        // No decorator wrapped anything around the story — nothing to add.
        return undefined;
      }

      return serializeAstroComponentMarkers(tree) as SlotValue;
    };

    return {
      loadModule,
      renderAstroStory,
      composeDecoratedTree,
      close: () => viteServer.close()
    };
  } catch (error) {
    await viteServer.close();
    throw error;
  }
}

const PREVIEW_CONFIG_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

/** Finds the project's `.storybook/preview.*`, if any — server-mode snapshots never have one. */
function resolvePreviewConfigFilePath(resolveFrom: string): string | undefined {
  const previewBasePath = resolve(resolveFrom, '.storybook', 'preview');

  for (const extension of PREVIEW_CONFIG_EXTENSIONS) {
    const candidateFilePath = `${previewBasePath}${extension}`;

    if (existsSync(candidateFilePath)) {
      return candidateFilePath;
    }
  }

  return undefined;
}

/**
 * Loads the project's `.storybook/preview.*` so build-time decorator composition
 * sees the same global decorators/parameters/globals a live Storybook would.
 *
 * `render`/`renderToCanvas` are dropped even if present — a project using
 * `definePreview()` sets `render` to a function that lazily loads the renderer's
 * browser-only `entry-preview` (framework/src/index.ts) and throws when called
 * outside a browser. Dropping it here means `composeStory`'s own Node-safe
 * default `render` (portable-stories.ts, which returns the bare Astro component
 * factory) always wins instead.
 */
async function loadPreviewProjectAnnotations(
  viteServer: ViteDevServer,
  resolveFrom: string
): Promise<Record<string, unknown>> {
  const previewConfigFilePath = resolvePreviewConfigFilePath(resolveFrom);

  if (!previewConfigFilePath) {
    return {};
  }

  try {
    const previewModule = await ssrLoadModuleWithFsFallback<{ default?: unknown }>(
      viteServer,
      previewConfigFilePath,
      { fixStacktrace: true }
    );

    if (!isRecord(previewModule.default)) {
      return {};
    }

    const { render: _unusedRender, renderToCanvas: _unusedRenderToCanvas, ...rest } =
      previewModule.default;

    return rest;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);

    console.warn(
      `[storybook-astro] Unable to load ${previewConfigFilePath} for decorator composition during the ` +
        `static build; stories will compose without global decorators/parameters (${reason}).`
    );

    return {};
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

  let node: SlotValue | undefined;

  try {
    node = await options.runtime.composeDecoratedTree({
      storyModule,
      exportName: options.story.exportName
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);

    console.warn(
      `[storybook-astro] Dropped story "${options.story.id}" from the static build: decorator composition failed (${reason}).`
    );

    return undefined;
  }

  return options.runtime.renderAstroStory({
    component: componentPath,
    args: componentArgs,
    slots: storySlots,
    ...(node !== undefined ? { node } : {}),
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
